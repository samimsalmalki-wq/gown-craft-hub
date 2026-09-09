import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

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
      return {
        profile: profile.data,
        isAdmin: (roles.data ?? []).some((r) => r.role === "admin"),
        permissions: (perms.data ?? []).map((p) => p.permission),
      };
    },
  });

  const isAdmin = query.data?.isAdmin ?? false;
  const permissions = query.data?.permissions ?? [];

  return {
    ready: ready && (!userId || !query.isLoading),
    user,
    profile: query.data?.profile ?? null,
    isAdmin,
    permissions,
    can: (permission: string) => isAdmin || permissions.includes(permission),
  };
}
