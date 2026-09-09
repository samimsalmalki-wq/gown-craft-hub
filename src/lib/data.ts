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
