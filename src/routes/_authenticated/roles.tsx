import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAddRole,
  useProfiles,
  useRolePermissions,
  useRoles,
  useSetRolePermission,
  useUpdateRole,
} from "@/lib/data";
import { PERMISSIONS } from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/roles")({
  head: () => ({
    meta: [
      { title: "الأدوار والصلاحيات · مَعْمَل" },
      {
        name: "description",
        content: "أنشئ أدوارًا جديدة للفريق وحدّد صلاحيات كل دور بدقة داخل نظام الورشة.",
      },
      { property: "og:title", content: "الأدوار والصلاحيات · مَعْمَل" },
      {
        property: "og:description",
        content: "أنشئ أدوارًا جديدة للفريق وحدّد صلاحيات كل دور بدقة داخل نظام الورشة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  const { isAdmin, ready } = useCurrentAccount();
  const { data: roles = [] } = useRoles();
  const { data: perms = [] } = useRolePermissions();
  const { data: profiles = [] } = useProfiles();
  const add = useAddRole();
  const update = useUpdateRole();
  const setPerm = useSetRolePermission();
  const [label, setLabel] = useState("");

  if (ready && !isAdmin) {
    return (
      <AppShell title="الأدوار والصلاحيات">
        <Empty>هذه الشاشة متاحة لمدير الورشة فقط.</Empty>
      </AppShell>
    );
  }

  const submit = () => {
    if (!label.trim()) {
      toast.error("اكتب اسم الدور");
      return;
    }
    add
      .mutateAsync({ label })
      .then(() => {
        toast.success("تمت إضافة الدور");
        setLabel("");
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const countOf = (roleId: string) => profiles.filter((p) => p.role_id === roleId).length;

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="الأدوار والصلاحيات"
      subtitle="أضف أدوارًا بأسمائك، وحدّد ما يستطيع كل دور فعله. الأدوار الأساسية الأربعة لا يمكن حذفها لأن النظام يعتمد عليها."
    >
      <Card title="دور جديد">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="min-w-[200px] flex-1">
            <Field label="اسم الدور">
              <input
                className="field"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="مثال: مسؤولة التطريز"
              />
            </Field>
          </div>
          <Btn variant="gold" onClick={submit} disabled={add.isPending}>
            إضافة
          </Btn>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((r) => (
          <Card
            key={r.id}
            title={r.label}
            action={
              <div className="flex items-center gap-2">
                {r.is_builtin && <Chip tone="gold">أساسي</Chip>}
                <Chip tone="neutral">{countOf(r.id)} موظف</Chip>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <input
                className="field h-9 min-h-0 min-w-[140px] flex-1 py-0 text-[14px] font-medium"
                defaultValue={r.label}
                key={r.label}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== r.label)
                    update
                      .mutateAsync({ id: r.id, patch: { label: v } })
                      .then(() => toast.success("تم الحفظ"))
                      .catch((err: Error) => toast.error(err.message));
                  else e.target.value = r.label;
                }}
              />
              {!r.is_builtin && (
                <label className="flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={r.is_active}
                    onChange={(e) =>
                      update
                        .mutateAsync({ id: r.id, patch: { is_active: e.target.checked } })
                        .then(() => toast.success("تم الحفظ"))
                        .catch((err: Error) => toast.error(err.message))
                    }
                  />
                  مُفعّل
                </label>
              )}
            </div>

            <ul className="divide-y divide-line">
              {PERMISSIONS.map((perm) => {
                const on =
                  r.key === "admin" ||
                  perms.some((p) => p.role_id === r.id && p.permission === perm.key);
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
                      disabled={r.key === "admin"}
                      onChange={(e) =>
                        setPerm
                          .mutateAsync({
                            roleId: r.id,
                            permission: perm.key,
                            on: e.target.checked,
                          })
                          .catch((err: Error) => toast.error(err.message))
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
