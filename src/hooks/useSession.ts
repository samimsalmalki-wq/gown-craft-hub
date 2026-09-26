import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, type AppRole } from "@/lib/atelier";

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
      let roleRow: { label: string; material_categories: string[] } | null = null;
      const roleId = profile.data?.role_id;
      if (roleId) {
        const [rp, rr] = await Promise.all([
          supabase.from("role_permissions").select("permission").eq("role_id", roleId),
          supabase.from("roles").select("label, material_categories").eq("id", roleId).maybeSingle(),
        ]);
        rolePerms = (rp.data ?? []).map((p) => p.permission);
        roleRow = rr.data ?? null;
      }

      return {
        profile: profile.data,
        roles: (roles.data ?? []).map((r) => r.role as AppRole),
        roleName: roleRow?.label ?? null,
        categories: roleRow?.material_categories ?? [],
        permissions: Array.from(
          new Set([...(perms.data ?? []).map((p) => p.permission), ...rolePerms]),
        ),
      };
    },
  });

  const profile = query.data?.profile ?? null;
  const active = profile?.is_active !== false;
  const roles = query.data?.roles ?? [];
  const permissions = active ? (query.data?.permissions ?? []) : [];
  const isAdmin = active && roles.includes("admin");
  const role = (roles[0] ?? "staff") as AppRole;
  const allowedStages = profile?.allowed_stages ?? [];
  const categories = query.data?.categories ?? [];

  /** كل الصلاحيات تأتي من شاشة الأدوار والصلاحيات، والمدير وحده يملك كل شيء */
  const can = (permission: string) => isAdmin || permissions.includes(permission);
  /** المراحل المسموحة في صفحة الموظف (فارغة = كل المراحل) */
  const canStage = (stage: string) =>
    isAdmin || allowedStages.length === 0 || allowedStages.includes(stage);
  /** أصناف المخزون المسموحة للدور (فارغة = كل الأصناف) */
  const canCategory = (category: string) =>
    isAdmin || categories.length === 0 || categories.includes(category);

  return {
    ready: ready && (!userId || !query.isLoading),
    user,
    userId,
    profile,
    roles,
    role,
    roleName: query.data?.roleName ?? ROLE_LABEL[role],
    isAdmin,
    permissions,
    categories,
    can,
    canStage,
    canCategory,
    /** يدير هذه المرحلة: إسناد وبدء وإنهاء واعتماد */
    canManageStage: (stage: string) => can("stages.manage") && canStage(stage),
    /** يدير هذا الصنف في المخزون */
    canManageCategory: (category: string) => can("inventory.manage") && canCategory(category),
  };
}
