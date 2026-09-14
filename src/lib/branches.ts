import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/hooks/useSession";
import type { Database } from "@/integrations/supabase/types";

export type Branch = Database["public"]["Tables"]["branches"]["Row"];
export type MaterialStock = Database["public"]["Tables"]["material_stock"]["Row"];

/** «الكل» يعني عرض كل الفروع مجتمعة (للمدير أو من له صلاحية كل الفروع) */
export const ALL_BRANCHES = "all";

const STORE_KEY = "atelier.branch";

let selected: string = ALL_BRANCHES;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  selected = window.localStorage.getItem(STORE_KEY) || ALL_BRANCHES;
}

export function setSelectedBranch(value: string) {
  selected = value || ALL_BRANCHES;
  if (typeof window !== "undefined") window.localStorage.setItem(STORE_KEY, selected);
  listeners.forEach((fn) => fn());
}

/** الفرع المختار في الشاشة: للمدير مُبدّل، ولغيره فرعه المسجَّل */
export function useBranchScope() {
  const { profile, isAdmin, can } = useCurrentAccount();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fn = () => setTick((v) => v + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const canAll = isAdmin || can("branches.all") || !profile?.branch_id;

  return useMemo(() => {
    void tick;
    const branchId = canAll ? selected : (profile?.branch_id ?? ALL_BRANCHES);
    return {
      canAll,
      branchId,
      isAll: branchId === ALL_BRANCHES,
      /** معرّف الفرع للكتابة: عند «الكل» يستخدم فرع المستخدم إن وُجد */
      writeBranchId: branchId === ALL_BRANCHES ? (profile?.branch_id ?? null) : branchId,
      setBranch: setSelectedBranch,
    };
  }, [tick, canAll, profile?.branch_id]);
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase.from("branches").select("*").order("position");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useSaveBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Branch> & { id?: string; name?: string }) => {
      if (id) {
        const { error } = await supabase.from("branches").update(patch as never).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("branches")
        .insert(patch as never)
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branches"] }),
  });
}

export const branchLabel = (branches: Branch[], id: string | null | undefined) =>
  branches.find((b) => b.id === id)?.name ?? "—";

/* ===== مخزون كل فرع ===== */

export function useMaterialStock(branchId?: string) {
  return useQuery({
    queryKey: ["material-stock", branchId ?? "all"],
    queryFn: async (): Promise<MaterialStock[]> => {
      let q = supabase.from("material_stock").select("*");
      if (branchId && branchId !== ALL_BRANCHES) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTransferMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      materialId: string;
      fromBranch: string;
      toBranch: string;
      qty: number;
      notes?: string | null;
    }) => {
      const { error } = await supabase.rpc("transfer_material", {
        p_material_id: input.materialId,
        p_from_branch: input.fromBranch,
        p_to_branch: input.toBranch,
        p_qty: input.qty,
        p_notes: input.notes ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-stock"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

/** إجمالي كميات مادة في فرع معيّن */
export const stockOf = (rows: MaterialStock[], materialId: string, branchId: string | null) => {
  const list = rows.filter(
    (r) => r.material_id === materialId && (!branchId || r.branch_id === branchId),
  );
  const on_hand = list.reduce((s, r) => s + Number(r.qty_on_hand), 0);
  const reserved = list.reduce((s, r) => s + Number(r.qty_reserved), 0);
  return { on_hand, reserved, available: on_hand - reserved };
};
