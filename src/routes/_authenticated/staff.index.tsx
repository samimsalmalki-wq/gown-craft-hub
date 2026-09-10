import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Avatar, Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAllRoles, useDepartments, useProfiles, useSetRole, useUpdateProfile } from "@/lib/data";
import {
  PERMISSIONS,
  ROLE_LABEL,
  STAGES,
  type AppRole,
  type Profile,
  type StageKey,
} from "@/lib/atelier";

const ROLES: AppRole[] = ["admin", "supervisor", "staff", "cs"];

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
  const { isAdmin, isManager, ready } = useCurrentAccount();
  const { data: profiles = [] } = useProfiles();
  const { data: departments = [] } = useDepartments();
  const { data: roles = [] } = useAllRoles();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Profile | null>(null);

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

  if (ready && !isManager) {
    return (
      <AppShell title="الموظفون">
        <Empty>هذه الشاشة متاحة للمدير والمشرف فقط.</Empty>
      </AppShell>
    );
  }

  const roleOf = (id: string) => (roles.find((r) => r.user_id === id)?.role ?? "staff") as AppRole;

  return (
    <AppShell
      eyebrow="الفريق"
      title="الموظفون والصلاحيات"
      subtitle="الأقسام والأدوار والمراحل المسموح بها وما يستطيع كل موظف رؤيته وتعديله."
    >
      {profiles.length === 0 ? (
        <Empty>لا يوجد موظفون بعد.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((p) => {
            const role = roleOf(p.id);
            const admin = role === "admin";
            const dept = departments.find((d) => d.id === p.department_id);
            const allowed = p.allowed_stages ?? [];
            return (
              <Card
                key={p.id}
                title={p.full_name}
                action={
                  <div className="flex items-center gap-2">
                    <Chip tone={admin ? "gold" : "neutral"}>{ROLE_LABEL[role]}</Chip>
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
                    <p>
                      المراحل المسموحة:{" "}
                      {allowed.length === 0
                        ? "كل المراحل"
                        : allowed.map((s) => STAGES.find((x) => x.key === s)?.label ?? s).join("، ")}
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
                    <Field label="الدور">
                      <select
                        className="field"
                        value={role}
                        onChange={(e) =>
                          setRole
                            .mutateAsync({ userId: p.id, role: e.target.value })
                            .then(() => toast.success("تم تحديث الدور"))
                            .catch((err: Error) => toast.error(err.message))
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}

                <ul className="divide-y divide-line">
                  {PERMISSIONS.map((perm) => {
                    const on =
                      admin || perms.some((x) => x.user_id === p.id && x.permission === perm.key);
                    return (
                      <li key={perm.key} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div>
                          <p className="text-[13px] font-medium">{perm.label}</p>
                          <p className="text-[11px] text-muted-foreground">{perm.hint}</p>
                        </div>
                        <input
                          type="checkbox"
                          className="size-5 accent-current"
                          checked={on}
                          disabled={admin || !isAdmin}
                          onChange={(e) => togglePerm(p.id, perm.key, e.target.checked)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
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
  const [name, setName] = useState(profile.full_name);
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
        <Field label="المراحل المسموح بها" hint="بدون تحديد = كل المراحل">
          <div className="flex flex-wrap gap-2">
            {STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleStage(s.key)}
                className={`rounded-full border px-3 py-1.5 text-[12px] ${
                  stages.includes(s.key) ? "border-gold bg-gold/10 text-gold" : "border-line"
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
