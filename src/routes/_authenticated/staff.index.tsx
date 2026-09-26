import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Avatar, Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAllRoles,
  useDepartments,
  useProfiles,
  useRolePermissions,
  useRoles,
  useSetRole,
  useStageTemplates,
  useUpdateProfile,
} from "@/lib/data";
import {
  PERMISSIONS,
  roleLabel,
  stageLabel,
  type AppRole,
  type Profile,
  type StageKey,
} from "@/lib/atelier";
import { useBranches } from "@/lib/branches";
import { createStaffAccount } from "@/lib/staff.functions";




export const Route = createFileRoute("/_authenticated/staff/")({
  head: () => ({
    meta: [
      { title: "الموظفون والصلاحيات · مَعْمَل" },
      { name: "description", content: "أقسام الفريق وأدواره وصلاحياته والمراحل المسموح بها لكل موظف." },
      { property: "og:title", content: "الموظفون والصلاحيات · مَعْمَل" },
      {
        property: "og:description",
        content: "أقسام الفريق وأدواره وصلاحياته والمراحل المسموح بها لكل موظف.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffPage,
});

function StaffPage() {
  const { isAdmin, can, ready } = useCurrentAccount();
  const { data: profiles = [] } = useProfiles();
  const { data: branches = [] } = useBranches();
  const { data: departments = [] } = useDepartments();
  const { data: roles = [] } = useAllRoles();
  const { data: roleList = [] } = useRoles();
  const { data: rolePerms = [] } = useRolePermissions();

  const qc = useQueryClient();
  const [editing, setEditing] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: perms = [] } = useQuery({
    queryKey: ["all-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_permissions").select("user_id, permission");
      if (error) throw error;
      return data ?? [];
    },
  });

  const setRole = useSetRole();
  const updateProfile = useUpdateProfile();

  async function togglePerm(userId: string, permission: string, on: boolean) {
    try {
      if (on) {
        const { error } = await supabase
          .from("user_permissions")
          .insert({ user_id: userId, permission });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_permissions")
          .delete()
          .eq("user_id", userId)
          .eq("permission", permission);
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["all-permissions"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر تحديث الصلاحية");
    }
  }

  if (ready && !can("staff.manage")) {
    return (
      <AppShell title="الموظفون">
        <Empty>هذه الشاشة متاحة لمن يملك صلاحية عرض الموظفين.</Empty>
      </AppShell>
    );
  }

  const enumRoleOf = (id: string) =>
    (roles.find((r) => r.user_id === id)?.role ?? "staff") as AppRole;

  const rolePermsOf = (roleId: string | null) =>
    roleId ? rolePerms.filter((rp) => rp.role_id === roleId).map((rp) => rp.permission) : [];

  return (
    <AppShell
      eyebrow="الفريق"
      title="الموظفون والصلاحيات"
      subtitle="الأقسام والأدوار والمراحل المسموح بها وما يستطيع كل موظف رؤيته وتعديله."
      actions={
        isAdmin ? (
          <div className="flex items-center gap-2">
            <Link to="/roles" className="btn-quiet">
              الأدوار والصلاحيات
            </Link>
            <Btn variant="gold" onClick={() => setAdding(true)}>
              إضافة موظف
            </Btn>
          </div>
        ) : undefined
      }
    >
      {profiles.length === 0 ? (
        <Empty>لا يوجد موظفون بعد.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((p) => {
            const admin = enumRoleOf(p.id) === "admin";
            const dept = departments.find((d) => d.id === p.department_id);
            const allowed = p.allowed_stages ?? [];
            const branch = branches.find((b) => b.id === p.branch_id);
            const extra = perms.filter((x) => x.user_id === p.id).length;
            return (
              <Card
                key={p.id}
                title={p.full_name}
                action={
                  <div className="flex items-center gap-2">
                    <Chip tone={admin ? "gold" : "neutral"}>
                      {roleLabel(roleList.find((r) => r.id === p.role_id)?.key ?? enumRoleOf(p.id))}
                    </Chip>

                    <Link to="/staff/$userId" params={{ userId: p.id }} className="text-[12px] text-gold">
                      الملف
                    </Link>
                  </div>
                }
              >
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <Avatar name={p.full_name} url={p.avatar_url} size={12} />
                  <div className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                    <p>{dept?.name || "بدون قسم"}{p.job_title ? ` · ${p.job_title}` : ""}</p>
                    <p dir="ltr">{p.phone || "—"}</p>
                    <p>الفرع: {branch?.name ?? "كل الفروع"}</p>
                    <p>
                      المراحل:{" "}
                      {allowed.length === 0
                        ? "كل المراحل"
                        : allowed.map((s) => stageLabel(s)).join("، ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {!p.is_active && <Chip tone="late">موقوف</Chip>}
                    {isAdmin && (
                      <button className="text-[12px] text-gold" onClick={() => setEditing(p)}>
                        تعديل
                      </button>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="border-b border-line px-4 py-3">
                    <Field label="الدور" hint="الأدوار تُضاف وتُسمّى من شاشة «الأدوار والصلاحيات»">
                      <select
                        className="field"
                        value={p.role_id ?? ""}
                        disabled={admin}
                        onChange={(e) =>
                          setRole
                            .mutateAsync({ userId: p.id, roleId: e.target.value })
                            .then(() => toast.success("تم تحديث الدور"))
                            .catch((err: Error) => toast.error(err.message))
                        }
                      >
                        <option value="" disabled>
                          اختر دورًا
                        </option>
                        {roleList
                          .filter((r) => (r.is_active && r.key !== "admin") || r.id === p.role_id)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                )}

                <details className="group">
                  <summary className="cursor-pointer list-none px-4 py-3 text-[13px] text-gold">
                    صلاحيات الموظف {extra > 0 ? `(${extra.toLocaleString("ar-EG")} إضافية)` : ""}
                    <span className="mr-1 text-muted-foreground group-open:hidden">— عرض</span>
                  </summary>
                <ul className="divide-y divide-line border-t border-line">
                  {PERMISSIONS.map((perm) => {
                    const fromRole = admin || rolePermsOf(p.role_id).includes(perm.key);
                    const own = perms.some(
                      (x) => x.user_id === p.id && x.permission === perm.key,
                    );
                    return (
                      <li key={perm.key} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-[13px] font-medium">{perm.label}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {fromRole ? "ممنوحة من الدور" : perm.hint}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="size-5 accent-current"
                          checked={fromRole || own}
                          disabled={fromRole || !isAdmin}
                          onChange={(e) => togglePerm(p.id, perm.key, e.target.checked)}
                        />
                      </li>
                    );
                  })}
                </ul>
                </details>
              </Card>
            );
          })}
        </div>
      )}

      {adding && (
        <NewStaffSheet
          onClose={() => setAdding(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ["profiles"] });
            qc.invalidateQueries({ queryKey: ["all-roles"] });
            setAdding(false);
          }}
        />
      )}

      {editing && (
        <EditStaffSheet
          profile={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            updateProfile
              .mutateAsync({ id: editing.id, patch })
              .then(() => {
                toast.success("تم حفظ بيانات الموظف");
                setEditing(null);
              })
              .catch((err: Error) => toast.error(err.message))
          }
        />
      )}
    </AppShell>
  );
}

function NewStaffSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: departments = [] } = useDepartments();
  const { data: roleList = [] } = useRoles();
  const { data: branches = [] } = useBranches();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    phone: "",
    jobTitle: "",
    roleId: "",
    departmentId: "",
    branchId: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createStaffAccount({ data: form });
      toast.success(`تم إنشاء حساب ${form.fullName} — أعطه البريد وكلمة المرور ليدخل`);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء الحساب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="إضافة موظف">
      <form onSubmit={submit} className="space-y-3 px-4 py-4">
        <Field label="الاسم">
          <input className="field" value={form.fullName} onChange={set("fullName")} required />
        </Field>
        <Field label="البريد الإلكتروني" hint="يدخل به الموظف إلى النظام">
          <input className="field" type="email" dir="ltr" value={form.email} onChange={set("email")} required />
        </Field>
        <Field label="كلمة المرور" hint="٨ أحرف على الأقل — يستطيع الموظف تغييرها من «حسابي»">
          <input
            className="field"
            type="text"
            dir="ltr"
            autoComplete="new-password"
            value={form.password}
            onChange={set("password")}
            minLength={8}
            required
          />
        </Field>
        <Field label="الدور">
          <select className="field" value={form.roleId} onChange={set("roleId")} required>
            <option value="" disabled>
              اختر دورًا
            </option>
            {roleList
              .filter((r) => r.is_active && r.key !== "admin")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label="الفرع" hint="بدون فرع = يرى كل الفروع">
          <select className="field" value={form.branchId} onChange={set("branchId")}>
            <option value="">كل الفروع</option>
            {branches
              .filter((b) => b.is_active)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="القسم">
          <select className="field" value={form.departmentId} onChange={set("departmentId")}>
            <option value="">بدون قسم</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الجوال">
          <input className="field" dir="ltr" value={form.phone} onChange={set("phone")} />
        </Field>
        <Field label="المسمى الوظيفي">
          <input className="field" value={form.jobTitle} onChange={set("jobTitle")} />
        </Field>
        <div className="flex gap-2 pt-2">
          <Btn type="submit" variant="gold" disabled={busy}>
            {busy ? "لحظة…" : "إنشاء الحساب"}
          </Btn>
          <Btn type="button" variant="quiet" onClick={onClose}>
            إلغاء
          </Btn>
        </div>
      </form>
    </Sheet>
  );
}

function EditStaffSheet({
  profile,
  onClose,
  onSave,
}: {
  profile: Profile;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const { data: departments = [] } = useDepartments();
  const { data: templates = [] } = useStageTemplates();
  const { data: branches = [] } = useBranches();
  const [name, setName] = useState(profile.full_name);
  const [branchId, setBranchId] = useState(profile.branch_id ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [job, setJob] = useState(profile.job_title ?? "");
  const [dept, setDept] = useState(profile.department_id ?? "");
  const [active, setActive] = useState(profile.is_active);
  const [stages, setStages] = useState<StageKey[]>(profile.allowed_stages ?? []);

  const toggleStage = (key: StageKey) =>
    setStages((cur) => (cur.includes(key) ? cur.filter((s) => s !== key) : [...cur, key]));

  return (
    <Sheet open onClose={onClose} title="بيانات الموظف">
      <div className="space-y-3 px-4 py-4">
        <Field label="الاسم">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="الجوال">
          <input className="field" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="المسمى الوظيفي">
          <input className="field" value={job} onChange={(e) => setJob(e.target.value)} />
        </Field>
        <Field label="القسم">
          <select className="field" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="">بدون قسم</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفرع" hint="بدون فرع = يرى كل الفروع (للمدير والمحاسب)">
          <select className="field" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">كل الفروع</option>
            {branches
              .filter((b) => b.is_active || b.id === branchId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_warehouse ? " (المستودع)" : ""}
                </option>
              ))}
          </select>
        </Field>
        <Field label="حالة الموظف">
          <select
            className="field"
            value={active ? "1" : "0"}
            onChange={(e) => setActive(e.target.value === "1")}
          >
            <option value="1">نشط</option>
            <option value="0">موقوف</option>
          </select>
        </Field>
        <Field
          label="المراحل"
          hint="لمشرف الفرع: المراحل التي يديرها. للعاملة: المراحل التي تُسند إليها. بدون تحديد = كل المراحل"
        >
          <div className="flex flex-wrap gap-2">
            {templates.map((s) => (
              <button
                key={s.stage}
                type="button"
                onClick={() => toggleStage(s.stage)}
                className={`rounded-full border px-3 py-1.5 text-[12px] ${
                  stages.includes(s.stage) ? "border-gold bg-gold/10 text-gold" : "border-line"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex gap-2 pt-2">
          <Btn
            variant="gold"
            onClick={() =>
              onSave({
                full_name: name,
                phone: phone || null,
                job_title: job || null,
                department_id: dept || null,
                branch_id: branchId || null,
                is_active: active,
                allowed_stages: stages,
              })
            }
          >
            حفظ
          </Btn>
          <Btn variant="quiet" onClick={onClose}>
            إلغاء
          </Btn>
        </div>
      </div>
    </Sheet>
  );
}
