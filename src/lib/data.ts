import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  isBuiltinRole,
  roleCatalog,
  setItemTypeCatalog,
  setRoleCatalog,
  setStageCatalog,
} from "./atelier";
import { ALL_BRANCHES, useBranchScope } from "./branches";
import type {
  ItemType,
  Order,
  OrderFile,
  OrderStage,
  Profile,
  RoleCatalogRow,
  StageKey,
} from "./atelier";


export const ordersKey = ["orders"] as const;

/** يضيف شرط الفرع على الاستعلام إن كان فرعًا محددًا */
const onBranch = <T>(q: T, branchId: string, column = "branch_id"): T =>
  branchId === ALL_BRANCHES
    ? q
    : ((q as { eq: (c: string, v: string) => T }).eq(column, branchId) as T);

export function useOrders() {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: [...ordersKey, branchId],
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await onBranch(
        supabase.from("orders").select("*"),
        branchId,
      ).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}


export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data as Order | null;
    },
  });
}

export function useOrderStages(orderId: string) {
  return useQuery({
    queryKey: ["stages", orderId],
    queryFn: async (): Promise<OrderStage[]> => {
      const { data, error } = await supabase
        .from("order_stages")
        .select("*")
        .eq("order_id", orderId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllStages() {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["stages", "all", branchId],
    queryFn: async (): Promise<OrderStage[]> => {
      const { data, error } = await onBranch(
        supabase
          .from("order_stages")
          .select("*, orders!inner(branch_id)")
          .eq("is_required", true),
        branchId,
        "orders.branch_id",
      ).order("position");
      if (error) throw error;
      return (data ?? []) as unknown as OrderStage[];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from("profiles").select("*").order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOrderFiles(orderId: string) {
  return useQuery({
    queryKey: ["files", orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderFile[]> => {
      const { data, error } = await supabase
        .from("order_files")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSignedUrls(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("|");

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split("|") : [];
    if (list.length === 0) {
      setUrls({});
      return;
    }
    supabase.storage
      .from("order-files")
      .createSignedUrls(list, 3600)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string> = {};
        data.forEach((row) => {
          if (row.path && row.signedUrl) next[row.path] = row.signedUrl;
        });
        setUrls(next);
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}

export function useUpdateOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Order>) => {
      const { error } = await supabase.from("orders").update(patch as never).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ordersKey });
    },
  });
}

export function useUpdateStage(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OrderStage> }) => {
      const { error } = await supabase.from("order_stages").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stages", orderId] });
      qc.invalidateQueries({ queryKey: ["stages", "all"] });
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ordersKey });
    },
  });
}

export function useSetCurrentStage(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stage: StageKey) => {
      const { error } = await supabase
        .from("orders")
        .update({ current_stage: stage, state: stage === "delivery" ? "delivered" : "active" })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order", orderId] });
      qc.invalidateQueries({ queryKey: ordersKey });
    },
  });
}

export function useUploadFiles(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      files,
      kind,
      stageId,
    }: {
      files: File[];
      kind: string;
      stageId?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      for (const file of files) {
        const path = `${orderId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
        const up = await supabase.storage.from("order-files").upload(path, file);
        if (up.error) throw up.error;
        const { error } = await supabase.from("order_files").insert({
          order_id: orderId,
          stage_id: stageId ?? null,
          storage_path: path,
          kind,
          created_by: userData.user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files", orderId] }),
  });
}

export function useDeleteFile(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: OrderFile) => {
      await supabase.storage.from("order-files").remove([file.storage_path]);
      const { error } = await supabase.from("order_files").delete().eq("id", file.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files", orderId] }),
  });
}

/* ================= الأقسام وقالب المراحل ================= */

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim();
      if (!clean) throw new Error("اكتب اسم القسم");
      const max = await supabase
        .from("departments")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase
        .from("departments")
        .insert({ name: clean, position: (max.data?.position ?? 0) + 1 } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}

export function useUpdateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("departments").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}

/* ================= تصنيفات الخامات ================= */

export function useMaterialCategories() {
  const query = useQuery({
    queryKey: ["material-categories"],
    queryFn: async (): Promise<MaterialCategory[]> => {
      const { data, error } = await supabase
        .from("material_categories")
        .select("*")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data?.length) setMaterialCategoryCatalog(query.data);
  }, [query.data]);

  return query;
}

export function useAddMaterialCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (label: string) => {
      const clean = label.trim();
      if (!clean) throw new Error("اكتب اسم التصنيف");
      const max = await supabase
        .from("material_categories")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const key = `cat_${Date.now().toString(36)}`;
      const { error } = await supabase
        .from("material_categories")
        .insert({ key, label: clean, position: (max.data?.position ?? 0) + 1 } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-categories"] }),
  });
}

export function useUpdateMaterialCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("material_categories")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["material-categories"] }),
  });
}

export function useStageTemplates() {
  return useQuery({
    queryKey: ["stage-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_templates").select("*").order("position");
      if (error) throw error;
      const rows = data ?? [];
      setStageCatalog(
        rows.map((r) => ({
          stage: r.stage,
          label: r.label,
          position: r.position,
          is_active: r.is_active,
        })),
      );
      return rows;
    },
    staleTime: 60_000,
  });
}

function invalidateTemplateCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["stage-templates"] });
  qc.invalidateQueries({ queryKey: ["stages"] });
  qc.invalidateQueries({ queryKey: ["stages-with-orders"] });
  qc.invalidateQueries({ queryKey: ["my-tasks"] });
  qc.invalidateQueries({ queryKey: ordersKey });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("stage_templates").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTemplateCaches(qc),
  });
}

/** ترتيب المراحل حسب المصفوفة المرسلة، ويُطبّق على الطلبات الجارية */
export function useReorderTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.rpc("reorder_stage_templates", { p_ids: ids });
      if (error) throw error;
    },
    onSuccess: () => invalidateTemplateCaches(qc),
  });
}

/** إضافة مرحلة جديدة بالاسم الذي يختاره المدير */
export function useAddTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { label: string; expectedDays: number; requiresReview: boolean }) => {
      const { error } = await supabase.rpc("add_stage_template", {
        p_label: v.label,
        p_expected_days: v.expectedDays,
        p_requires_review: v.requiresReview,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTemplateCaches(qc),
  });
}

/* ================= الموظفون ================= */

export function useAllRoles() {
  return useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("id, user_id, role");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("profiles").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

/** كتالوج الأدوار القابل للتوسيع */
export function useRoles() {
  const query = useQuery({
    queryKey: ["roles"],
    queryFn: async (): Promise<RoleCatalogRow[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, key, label, position, is_builtin, is_active")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (query.data?.length) setRoleCatalog(query.data);
  }, [query.data]);

  return query;
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("role_id, permission");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ label }: { label: string }) => {
      const name = label.trim();
      if (!name) throw new Error("اسم الدور مطلوب");
      const max = await supabase
        .from("roles")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const key = `role_${Math.random().toString(36).slice(2, 10)}`;
      const { data, error } = await supabase
        .from("roles")
        .insert({ key, label: name, position: (max.data?.position ?? 0) + 1 })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("roles").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

export function useSetRolePermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      roleId,
      permission,
      on,
    }: {
      roleId: string;
      permission: string;
      on: boolean;
    }) => {
      if (on) {
        const { error } = await supabase
          .from("role_permissions")
          .insert({ role_id: roleId, permission });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role_id", roleId)
          .eq("permission", permission);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      const role = roleCatalog().find((r) => r.id === roleId);
      if (!role) throw new Error("دور غير معروف");

      // الأدوار الأساسية تقود صلاحيات النظام في user_roles، والأدوار الجديدة تُعتبر «موظف»
      const enumRole = isBuiltinRole(role.key) ? role.key : "staff";
      const del = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (del.error) throw del.error;
      const ins = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: enumRole as never });
      if (ins.error) throw ins.error;

      const { error } = await supabase.from("profiles").update({ role_id: roleId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}


/* ================= المهام والمراحل ================= */

export type StageWithOrder = OrderStage & { orders: Order | null };

export function useStagesWithOrders() {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["stages-with-orders", branchId],
    queryFn: async (): Promise<StageWithOrder[]> => {
      const { data, error } = await onBranch(
        supabase
          .from("order_stages")
          .select("*, orders!inner(*)")
          .eq("is_required", true),
        branchId,
        "orders.branch_id",
      ).order("position");
      if (error) throw error;
      return (data ?? []) as StageWithOrder[];
    },
  });
}

export function useMyTasks(userId: string | undefined) {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["my-tasks", userId, branchId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<StageWithOrder[]> => {
      const { data, error } = await onBranch(
        supabase
          .from("order_stages")
          .select("*, orders!inner(*)")
          .eq("assignee_id", userId!)
          .eq("is_required", true),
        branchId,
        "orders.branch_id",
      ).order("due_at", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as StageWithOrder[];
    },
  });
}

function invalidateStageCaches(qc: ReturnType<typeof useQueryClient>, orderId?: string) {
  qc.invalidateQueries({ queryKey: ["stages"] });
  qc.invalidateQueries({ queryKey: ["stages-with-orders"] });
  qc.invalidateQueries({ queryKey: ["my-tasks"] });
  qc.invalidateQueries({ queryKey: ["notifications"] });
  qc.invalidateQueries({ queryKey: ordersKey });
  if (orderId) {
    qc.invalidateQueries({ queryKey: ["order", orderId] });
    qc.invalidateQueries({ queryKey: ["activity", orderId] });
  }
}

/** الانتقال للمرحلة المطلوبة التالية فقط (تتخطى المراحل غير المطلوبة لهذا الطلب) */
async function advanceOrder(orderId: string, stage: StageKey) {
  const { data: rows } = await supabase
    .from("order_stages")
    .select("stage, position, is_required")
    .eq("order_id", orderId)
    .order("position");
  const list = rows ?? [];
  const current = list.find((r) => r.stage === stage);
  const next = list.find((r) => r.is_required && r.position > (current?.position ?? 0));
  const target = (next?.stage ?? stage) as StageKey;
  await supabase
    .from("orders")
    .update({
      current_stage: target,
      state: next ? "active" : "delivered",
    })
    .eq("id", orderId);
}

/** تحديد المراحل المطلوبة لطلب معيّن (للمدير والمشرف) */
export function useSetStageScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, stages }: { orderId: string; stages: string[] }) => {
      const { error } = await supabase.rpc("set_order_stage_scope", {
        p_order_id: orderId,
        p_stages: stages,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => invalidateStageCaches(qc, v.orderId),
  });
}

/** إجراءات المرحلة: إسناد، بدء، إيقاف، إنهاء، اعتماد، رفض */
export function useStageActions() {
  const qc = useQueryClient();

  const run = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("order_stages").update(patch as never).eq("id", id);
    if (error) throw error;
  };

  return {
    assign: useMutation({
      mutationFn: async (v: {
        stage: OrderStage;
        assigneeId: string | null;
        assigneeName: string | null;
        dueAt: string | null;
        priority: string;
        actorId: string | undefined;
      }) => {
        await run(v.stage.id, {
          assignee_id: v.assigneeId,
          assignee_name: v.assigneeName,
          assigned_at: v.assigneeId ? new Date().toISOString() : null,
          assigned_by: v.actorId ?? null,
          due_at: v.dueAt,
          priority: v.priority as never,
          status: v.assigneeId && v.stage.status === "pending" ? ("assigned" as never) : v.stage.status,
        });
      },
      onSuccess: (_d, v) => invalidateStageCaches(qc, v.stage.order_id),
    }),

    start: useMutation({
      mutationFn: async (stage: OrderStage) => {
        await run(stage.id, {
          status: "in_progress",
          started_at: stage.started_at ?? new Date().toISOString(),
          delay_reason: null,
        });
        await supabase.from("orders").update({ current_stage: stage.stage }).eq("id", stage.order_id);
      },
      onSuccess: (_d, stage) => invalidateStageCaches(qc, stage.order_id),
    }),

    pause: useMutation({
      mutationFn: async ({ stage, reason }: { stage: OrderStage; reason: string }) => {
        await run(stage.id, { status: "blocked", delay_reason: reason || null });
      },
      onSuccess: (_d, v) => invalidateStageCaches(qc, v.stage.order_id),
    }),

    finish: useMutation({
      mutationFn: async (stage: OrderStage) => {
        const now = new Date().toISOString();
        const { data: tpl } = await supabase
          .from("stage_templates")
          .select("is_scope_gate")
          .eq("stage", stage.stage)
          .maybeSingle();
        if (tpl?.is_scope_gate) {
          const { data: ord } = await supabase
            .from("orders")
            .select("scope_set_at")
            .eq("id", stage.order_id)
            .maybeSingle();
          if (!ord?.scope_set_at) {
            throw new Error("حدّد المراحل المطلوبة لهذا الطلب قبل إنهاء هذه المرحلة");
          }
        }
        if (stage.requires_review) {
          await run(stage.id, {
            status: "review",
            completed_at: now,
            started_at: stage.started_at ?? now,
            review_status: "pending",
          });
        } else {
          await run(stage.id, {
            status: "done",
            completed_at: now,
            started_at: stage.started_at ?? now,
            review_status: "approved",
          });
          await advanceOrder(stage.order_id, stage.stage);
        }
      },
      onSuccess: (_d, stage) => invalidateStageCaches(qc, stage.order_id),
    }),

    approve: useMutation({
      mutationFn: async ({ stage, actorId }: { stage: OrderStage; actorId: string | undefined }) => {
        const now = new Date().toISOString();
        await run(stage.id, {
          status: "done",
          review_status: "approved",
          reviewed_by: actorId ?? null,
          reviewed_at: now,
          completed_at: stage.completed_at ?? now,
        });
        await advanceOrder(stage.order_id, stage.stage);
      },
      onSuccess: (_d, v) => invalidateStageCaches(qc, v.stage.order_id),
    }),

    reject: useMutation({
      mutationFn: async ({
        stage,
        reason,
        actorId,
      }: {
        stage: OrderStage;
        reason: string;
        actorId: string | undefined;
      }) => {
        await run(stage.id, {
          status: stage.assignee_id ? "assigned" : "pending",
          review_status: "rejected",
          review_notes: reason,
          reviewed_by: actorId ?? null,
          reviewed_at: new Date().toISOString(),
          completed_at: null,
          rework_count: (stage.rework_count ?? 0) + 1,
        });
      },
      onSuccess: (_d, v) => invalidateStageCaches(qc, v.stage.order_id),
    }),

    saveStage: useMutation({
      mutationFn: async ({ stage, patch }: { stage: OrderStage; patch: Record<string, unknown> }) => {
        await run(stage.id, patch);
      },
      onSuccess: (_d, v) => invalidateStageCaches(qc, v.stage.order_id),
    }),
  };
}

/** نقل الطلب إلى مرحلة محددة (لوحة الإنتاج) */
export function useMoveOrderStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, stage }: { orderId: string; stage: StageKey }) => {
      const up = await supabase
        .from("orders")
        .update({ current_stage: stage, state: stage === "delivery" ? "delivered" : "active" })
        .eq("id", orderId);
      if (up.error) throw up.error;
      const { data: rows } = await supabase
        .from("order_stages")
        .select("id, status")
        .eq("order_id", orderId)
        .eq("stage", stage)
        .limit(1);
      const row = rows?.[0];
      if (row && (row.status === "pending" || row.status === "assigned")) {
        await supabase
          .from("order_stages")
          .update({ status: "in_progress", started_at: new Date().toISOString() })
          .eq("id", row.id);
      }
    },
    onSuccess: (_d, v) => invalidateStageCaches(qc, v.orderId),
  });
}

/* ================= التعديلات ================= */

export function useAlterations(orderId: string) {
  return useQuery({
    queryKey: ["alterations", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alterations")
        .select("*")
        .eq("order_id", orderId)
        .order("number");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddAlteration(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      description: string;
      notes: string | null;
      assigneeId: string | null;
      stageId: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: rows } = await supabase
        .from("alterations")
        .select("number")
        .eq("order_id", orderId)
        .order("number", { ascending: false })
        .limit(1);
      const next = (rows?.[0]?.number ?? 0) + 1;
      const { error } = await supabase.from("alterations").insert({
        order_id: orderId,
        stage_id: v.stageId,
        number: next,
        description: v.description,
        notes: v.notes,
        assignee_id: v.assigneeId,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alterations", orderId] });
      qc.invalidateQueries({ queryKey: ["activity", orderId] });
    },
  });
}

export function useUpdateAlteration(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("alterations").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alterations", orderId] });
      qc.invalidateQueries({ queryKey: ["activity", orderId] });
    },
  });
}

/* ================= السجل الزمني والتنبيهات ================= */

export function useActivityLog(orderId: string) {
  return useQuery({
    queryKey: ["activity", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: Boolean(userId),
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/* ================= صور الفساتين للبطاقات ================= */

export function useOrderThumbs() {
  const { data: files = [] } = useQuery({
    queryKey: ["files", "all"],
    queryFn: async (): Promise<OrderFile[]> => {
      const { data, error } = await supabase
        .from("order_files")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const firstByOrder: Record<string, string> = {};
  files.forEach((f) => {
    if (!firstByOrder[f.order_id]) firstByOrder[f.order_id] = f.storage_path;
  });
  const paths = Object.values(firstByOrder);
  const urls = useSignedUrls(paths);

  const thumbs: Record<string, string> = {};
  Object.entries(firstByOrder).forEach(([orderId, path]) => {
    const url = urls[path];
    if (url) thumbs[orderId] = url;
  });
  return thumbs;
}

/* ================= أنواع القطع ================= */

export function useItemTypes() {
  const query = useQuery({
    queryKey: ["item-types"],
    queryFn: async (): Promise<ItemType[]> => {
      const { data, error } = await supabase.from("item_types").select("*").order("position");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data?.length) setItemTypeCatalog(query.data);
  }, [query.data]);

  return query;
}

export function useAddItemType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim();
      if (!clean) throw new Error("اكتب اسم النوع");
      const max = await supabase
        .from("item_types")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase
        .from("item_types")
        .insert({ name: clean, position: (max.data?.position ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-types"] }),
  });
}

export function useUpdateItemType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("item_types").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-types"] }),
  });
}
