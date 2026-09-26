import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAddRole,
  useMaterialCategories,
  useProfiles,
  useRolePermissions,
  useRoles,
  useSetRolePermission,
  useUpdateRole,
} from "@/lib/data";
import { PERMISSIONS, PERMISSION_GROUPS } from "@/lib/atelier";
import { cn } from "@/lib/utils";

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
  const { data: categories = [] } = useMaterialCategories();
  const add = useAddRole();
  const update = useUpdateRole();
  const setPerm = useSetRolePermission();
  const [label, setLabel] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      .then((row) => {
        toast.success("تمت إضافة الدور");
        setLabel("");
        setSelectedId(row.id);
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const role = roles.find((r) => r.id === selectedId) ?? roles[0];
  const membersOf = (roleId: string) => profiles.filter((p) => p.role_id === roleId);
  const isOn = (roleId: string, key: string) =>
    perms.some((p) => p.role_id === roleId && p.permission === key);
  const countOn = (roleId: string) => PERMISSIONS.filter((perm) => isOn(roleId, perm.key)).length;

  const toggle = (roleId: string, permission: string, on: boolean) =>
    setPerm.mutateAsync({ roleId, permission, on }).catch((err: Error) => toast.error(err.message));

  const saveCategories = (roleId: string, next: string[]) =>
    update
      .mutateAsync({ id: roleId, patch: { material_categories: next } })
      .then(() => toast.success("تم الحفظ"))
      .catch((err: Error) => toast.error(err.message));

  const isAdminRole = role?.key === "admin";
  const members = role ? membersOf(role.id) : [];
  const usesInventory =
    role &&
    !isAdminRole &&
    ["inventory.manage", "inventory.approve", "inventory.transfer"].some((k) => isOn(role.id, k));
  const activeCats = categories.filter((c) => c.is_active);
  const roleCats = role?.material_categories ?? [];

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="الأدوار والصلاحيات"
      subtitle="اختر الدور وحدّد ما يستطيع فعله. أي تغيير هنا يطبَّق فورًا على كل موظف بهذا الدور."
    >
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelectedId(r.id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px] transition-colors",
              r.id === role?.id
                ? "border-gold bg-gold/10 font-medium text-ink"
                : "border-line bg-paper text-muted-foreground hover:text-ink",
              !r.is_active && "opacity-60",
            )}
          >
            {r.label}
            <span className="num rounded-full bg-ivory px-2 py-0.5 text-[11px]">
              {membersOf(r.id).length.toLocaleString("ar-EG")}
            </span>
          </button>
        ))}
      </div>

      {role && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card
            title={`صلاحيات «${role.label}»`}
            action={
              <Chip tone="gold">
                {isAdminRole
                  ? "كل الصلاحيات"
                  : `${countOn(role.id).toLocaleString("ar-EG")} من ${PERMISSIONS.length.toLocaleString("ar-EG")}`}
              </Chip>
            }
          >
            {isAdminRole && (
              <p className="border-b border-line bg-ivory px-4 py-3 text-[12px] text-muted-foreground">
                مدير النظام يملك كل الصلاحيات في كل الفروع ولا يمكن تقييده.
              </p>
            )}
            {PERMISSION_GROUPS.map((group) => (
              <section key={group} className="border-b border-line last:border-b-0">
                <h3 className="bg-ivory/60 px-4 py-2 text-[12px] font-medium text-muted-foreground">
                  {group}
                </h3>
                <ul className="divide-y divide-line">
                  {PERMISSIONS.filter((perm) => perm.group === group).map((perm) => {
                    const on = isAdminRole || isOn(role.id, perm.key);
                    return (
                      <li key={perm.key}>
                        <label
                          className={cn(
                            "flex items-center justify-between gap-3 px-4 py-3",
                            !isAdminRole && "cursor-pointer hover:bg-ivory/50",
                          )}
                        >
                          <span>
                            <span className="block text-[13px] font-medium">{perm.label}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {perm.hint}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="size-5 shrink-0 accent-current"
                            checked={on}
                            disabled={isAdminRole || setPerm.isPending}
                            onChange={(e) => toggle(role.id, perm.key, e.target.checked)}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </Card>

          <div className="space-y-5">
            <Card
              title="بيانات الدور"
              action={role.is_builtin ? <Chip tone="gold">أساسي</Chip> : undefined}
            >
              <div className="space-y-3 px-4 py-4">
                <Field label="اسم الدور">
                  <input
                    className="field"
                    defaultValue={role.label}
                    key={role.id + role.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== role.label)
                        update
                          .mutateAsync({ id: role.id, patch: { label: v } })
                          .then(() => toast.success("تم الحفظ"))
                          .catch((err: Error) => toast.error(err.message));
                      else e.target.value = role.label;
                    }}
                  />
                </Field>
                {!role.is_builtin && (
                  <label className="flex items-center gap-2 text-[13px]">
                    <input
                      type="checkbox"
                      className="size-5 accent-current"
                      checked={role.is_active}
                      onChange={(e) =>
                        update
                          .mutateAsync({ id: role.id, patch: { is_active: e.target.checked } })
                          .then(() => toast.success("تم الحفظ"))
                          .catch((err: Error) => toast.error(err.message))
                      }
                    />
                    الدور مُفعّل ويظهر عند إضافة موظف
                  </label>
                )}
                <div>
                  <p className="mb-1.5 text-[12px] text-muted-foreground">
                    الموظفون بهذا الدور ({members.length.toLocaleString("ar-EG")})
                  </p>
                  {members.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">لا يوجد أحد بعد.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => (
                        <Chip key={m.id}>{m.full_name}</Chip>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {usesInventory && (
              <Card title="أصناف المستودع">
                <div className="space-y-3 px-4 py-4">
                  <p className="text-[12px] text-muted-foreground">
                    الأصناف التي يراها هذا الدور ويديرها في المخزون. بدون تحديد = كل الأصناف.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeCats.map((c) => {
                      const on = roleCats.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          disabled={update.isPending}
                          onClick={() =>
                            saveCategories(
                              role.id,
                              on ? roleCats.filter((k) => k !== c.key) : [...roleCats, c.key],
                            )
                          }
                          className={cn(
                            "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[12px]",
                            on ? "border-gold bg-gold/10 text-gold" : "border-line",
                          )}
                        >
                          {on && <Check className="size-3.5" />}
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12px]">
                    {roleCats.length === 0 ? (
                      <span className="text-muted-foreground">يرى كل الأصناف حاليًا.</span>
                    ) : (
                      <span className="text-gold">
                        يرى فقط:{" "}
                        {activeCats
                          .filter((c) => roleCats.includes(c.key))
                          .map((c) => c.label)
                          .join("، ")}
                      </span>
                    )}
                  </p>
                </div>
              </Card>
            )}

            <Card title="دور جديد">
              <div className="flex flex-wrap items-end gap-3 px-4 py-4">
                <div className="min-w-[160px] flex-1">
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
          </div>
        </div>
      )}
    </AppShell>
  );
}
