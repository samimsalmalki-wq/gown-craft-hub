import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/atelier";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, ready, user: session?.user ?? null };
}

/** الحساب الحالي: البيانات الشخصية والدور والصلاحيات */
export function useCurrentAccount() {
  const { user, ready } = useSession();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["account", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [profile, roles, perms] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
        supabase.from("user_permissions").select("permission").eq("user_id", userId!),
      ]);

      let rolePerms: string[] = [];
      const roleId = profile.data?.role_id;
      if (roleId) {
        const { data } = await supabase
          .from("role_permissions")
          .select("permission")
          .eq("role_id", roleId);
        rolePerms = (data ?? []).map((p) => p.permission);
      }

      return {
        profile: profile.data,
        roles: (roles.data ?? []).map((r) => r.role as AppRole),
        permissions: Array.from(
          new Set([...(perms.data ?? []).map((p) => p.permission), ...rolePerms]),
        ),
      };
    },
  });


  const roles = query.data?.roles ?? [];
  const permissions = query.data?.permissions ?? [];
  const isAdmin = roles.includes("admin");
  const isSupervisor = roles.includes("supervisor");
  const isManager = isAdmin || isSupervisor;
  const isCS = roles.includes("cs");

  return {
    ready: ready && (!userId || !query.isLoading),
    user,
    userId,
    profile: query.data?.profile ?? null,
    roles,
    role: (roles[0] ?? "staff") as AppRole,
    isAdmin,
    isSupervisor,
    isManager,
    isCS,
    permissions,
    /** المدير يرى كل شيء، والمشرف يرى كل شيء ما عدا المالية التي تُمنح صلاحياتها صراحة */
    can: (permission: string) =>
      isAdmin ||
      permissions.includes(permission) ||
      (isManager && !permission.startsWith("finance.")),
  };
}
