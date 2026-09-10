import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Order, OrderFile, OrderStage, Profile, StageKey } from "./atelier";

export const ordersKey = ["orders"] as const;

export function useOrders() {
  return useQuery({
    queryKey: ordersKey,
    queryFn: async (): Promise<Order[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
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
  return useQuery({
    queryKey: ["stages", "all"],
    queryFn: async (): Promise<OrderStage[]> => {
      const { data, error } = await supabase.from("order_stages").select("*").order("position");
      if (error) throw error;
      return data ?? [];
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
      const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
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
      const { error } = await supabase.from("order_stages").update(patch).eq("id", id);
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

export function useStageTemplates() {
  return useQuery({
    queryKey: ["stage-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_templates").select("*").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("stage_templates").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stage-templates"] }),
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
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

export function useSetRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const del = await supabase.from("user_roles").delete().eq("user_id", userId);
      if (del.error) throw del.error;
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: role as never });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-roles"] });
      qc.invalidateQueries({ queryKey: ["account"] });
    },
  });
}

/* ================= المهام والمراحل ================= */

export type StageWithOrder = OrderStage & { orders: Order | null };

export function useStagesWithOrders() {
  return useQuery({
    queryKey: ["stages-with-orders"],
    queryFn: async (): Promise<StageWithOrder[]> => {
      const { data, error } = await supabase
        .from("order_stages")
        .select("*, orders(*)")
        .order("position");
      if (error) throw error;
      return (data ?? []) as StageWithOrder[];
    },
  });
}

export function useMyTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ["my-tasks", userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<StageWithOrder[]> => {
      const { data, error } = await supabase
        .from("order_stages")
        .select("*, orders(*)")
        .eq("assignee_id", userId!)
        .order("due_at", { nullsFirst: false });
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

async function advanceOrder(orderId: string, stage: StageKey) {
  const { data: templates } = await supabase
    .from("stage_templates")
    .select("stage, position, is_active")
    .order("position");
  const active = (templates ?? []).filter((t) => t.is_active);
  const idx = active.findIndex((t) => t.stage === stage);
  const next = idx >= 0 ? active[idx + 1] : undefined;
  const target = (next?.stage ?? stage) as StageKey;
  await supabase
    .from("orders")
    .update({
      current_stage: target,
      state: !next && stage === "delivery" ? "delivered" : "active",
    })
    .eq("id", orderId);
}

/** إجراءات المرحلة: إسناد، بدء، إيقاف، إنهاء، اعتماد، رفض */
export function useStageActions() {
  const qc = useQueryClient();

  const run = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("order_stages").update(patch).eq("id", id);
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
      const { error } = await supabase.from("alterations").update(patch).eq("id", id);
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
