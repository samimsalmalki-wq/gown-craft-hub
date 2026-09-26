import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isBuiltinRole, type AppRole } from "./atelier";

export type NewStaffInput = {
  email: string;
  password: string;
  fullName: string;
  phone?: string | null;
  jobTitle?: string | null;
  roleId: string;
  departmentId?: string | null;
  branchId?: string | null;
};

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

/** إنشاء حساب موظف جديد — للمدير فقط، ويعمل على السيرفر بمفتاح الخدمة */
export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: NewStaffInput) => {
    const email = (d.email ?? "").trim().toLowerCase();
    const fullName = (d.fullName ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("البريد الإلكتروني غير صحيح");
    if (!fullName) throw new Error("اكتب اسم الموظف");
    if ((d.password ?? "").length < 8) throw new Error("كلمة المرور يجب أن تكون ٨ أحرف على الأقل");
    if (!d.roleId) throw new Error("اختر دور الموظف");
    return {
      email,
      password: d.password,
      fullName,
      phone: clean(d.phone),
      jobTitle: clean(d.jobTitle),
      roleId: d.roleId,
      departmentId: clean(d.departmentId),
      branchId: clean(d.branchId),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [caller, callerProfile] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle(),
      supabaseAdmin.from("profiles").select("is_active").eq("id", context.userId).maybeSingle(),
    ]);
    if (!caller.data || !callerProfile.data?.is_active) {
      throw new Error("إضافة الموظفين متاحة للمدير فقط");
    }

    const { data: role } = await supabaseAdmin
      .from("roles")
      .select("id, key")
      .eq("id", data.roleId)
      .maybeSingle();
    if (!role) throw new Error("دور غير معروف");
    if (role.key === "admin") throw new Error("النظام فيه مدير واحد فقط — اختر دورًا آخر");
    const enumRole = (isBuiltinRole(role.key) ? role.key : "staff") as AppRole;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error || !created.user) {
      const exists = error?.message?.toLowerCase().includes("already");
      throw new Error(exists ? "هذا البريد مسجّل مسبقًا" : (error?.message ?? "تعذر إنشاء الحساب"));
    }
    const userId = created.user.id;

    try {
      const profile = await supabaseAdmin
        .from("profiles")
        .update({
          full_name: data.fullName,
          phone: data.phone,
          job_title: data.jobTitle,
          department_id: data.departmentId,
          branch_id: data.branchId,
          role_id: role.id,
          is_active: true,
        })
        .eq("id", userId);
      if (profile.error) throw profile.error;

      const del = await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      if (del.error) throw del.error;
      const ins = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: enumRole });
      if (ins.error) throw ins.error;
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(err instanceof Error ? err.message : "تعذر حفظ بيانات الموظف");
    }

    return { userId };
  });
