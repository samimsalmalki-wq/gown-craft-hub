import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Card, Empty } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useProfiles } from "@/lib/data";
import { useCurrentAccount } from "@/hooks/useSession";
import { PERMISSIONS } from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

function StaffPage() {
  const { isAdmin, ready } = useCurrentAccount();
  const { data: profiles = [] } = useProfiles();
  const qc = useQueryClient();

  const { data: perms = [] } = useQuery({
    queryKey: ["all-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_permissions").select("user_id, permission");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function toggle(userId: string, permission: string, on: boolean) {
    try {
      if (on) {
        const { error } = await supabase.from("user_permissions").insert({ user_id: userId, permission });
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

  if (ready && !isAdmin) {
    return (
      <AppShell title="الموظفون">
        <Empty>هذه الشاشة متاحة لمدير الورشة فقط.</Empty>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="الفريق"
      title="الموظفون والصلاحيات"
      subtitle="حدّد ما يستطيع كل موظف رؤيته وتعديله."
    >
      {profiles.length === 0 ? (
        <Empty>لا يوجد موظفون بعد.</Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((p) => {
            const admin = roles.some((r) => r.user_id === p.id && r.role === "admin");
            return (
              <Card key={p.id} title={p.full_name} action={<span className="text-[12px] text-muted-foreground">{admin ? "مدير الورشة" : p.job_title || "موظف"}</span>}>
                <ul className="divide-y divide-line">
                  {PERMISSIONS.map((perm) => {
                    const on = admin || perms.some((x) => x.user_id === p.id && x.permission === perm.key);
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
                          disabled={admin}
                          onChange={(e) => toggle(p.id, perm.key, e.target.checked)}
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
    </AppShell>
  );
}
