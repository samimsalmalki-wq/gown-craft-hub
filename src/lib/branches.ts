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
  const { data: branches } = useBranches();

  useEffect(() => {
    const fn = () => setTick((v) => v + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const canAll = isAdmin || can("branches.all") || !profile?.branch_id;
  const warehouseIds = (branches ?? []).filter((b) => b.is_warehouse).map((b) => b.id).join(",");

  return useMemo(() => {
    void tick;
    const branchId = canAll ? selected : (profile?.branch_id ?? ALL_BRANCHES);
    const selectedIsWarehouse =
      branchId !== ALL_BRANCHES && warehouseIds.split(",").includes(branchId);
    /** نطاق العمليات (طلبات وماليات): المخزن الرئيسي ليس فرع بيع، فيُعرض الكل */
    const opsBranchId = selectedIsWarehouse ? ALL_BRANCHES : branchId;
    return {
      canAll,
      branchId,
      isAll: branchId === ALL_BRANCHES,
      opsBranchId,
      opsIsAll: opsBranchId === ALL_BRANCHES,
      selectedIsWarehouse,
      /** معرّف الفرع للكتابة: عند «الكل» أو المخزن يستخدم فرع المستخدم إن وُجد */
      writeBranchId:
        opsBranchId === ALL_BRANCHES ? (profile?.branch_id ?? null) : opsBranchId,
      setBranch: setSelectedBranch,
    };
  }, [tick, canAll, profile?.branch_id, warehouseIds]);
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
        ...(input.notes ? { p_notes: input.notes } : {}),
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

/* ===== المخزن الرئيسي وطلبات الصرف ===== */

export type StockRequest = Database["public"]["Tables"]["stock_requests"]["Row"];

export const STOCK_REQUEST_LABEL: Record<string, string> = {
  pending: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
};

/** موقع المخزن الرئيسي (إن وُجد) */
export const warehouseOf = (branches: Branch[]) => branches.find((b) => b.is_warehouse) ?? null;

/** فروع البيع فقط (بدون مواقع المخزون) */
export const salesBranches = (branches: Branch[]) => branches.filter((b) => !b.is_warehouse);

export function useStockRequests() {
  return useQuery({
    queryKey: ["stock-requests"],
    queryFn: async (): Promise<StockRequest[]> => {
      const { data, error } = await supabase
        .from("stock_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateStockRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      fromBranchId: string;
      toBranchId: string;
      materialId: string;
      qty: number;
      reason?: string | null;
    }) => {
      const { error } = await supabase.from("stock_requests").insert({
        from_branch_id: input.fromBranchId,
        to_branch_id: input.toBranchId,
        material_id: input.materialId,
        qty: input.qty,
        reason: input.reason ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-requests"] }),
  });
}

export function useDecideStockRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; approve: boolean; note?: string | null }) => {
      const { error } = await supabase.rpc("decide_stock_request", {
        p_id: input.id,
        p_approve: input.approve,
        ...(input.note ? { p_note: input.note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-requests"] });
      qc.invalidateQueries({ queryKey: ["material-stock"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
    },
  });
}

/** إجمالي كميات مادة في فرع معيّن (مع حد التنبيه الخاص بالموقع) */
export const stockOf = (rows: MaterialStock[], materialId: string, branchId: string | null) => {
  const list = rows.filter(
    (r) => r.material_id === materialId && (!branchId || r.branch_id === branchId),
  );
  const on_hand = list.reduce((s, r) => s + Number(r.qty_on_hand), 0);
  const reserved = list.reduce((s, r) => s + Number(r.qty_reserved), 0);
  const min_qty = list.reduce((s, r) => s + Number(r.min_qty), 0);
  const available = on_hand - reserved;
  return {
    on_hand,
    reserved,
    available,
    min_qty,
    /** تحت حد التنبيه في هذا الموقع */
    isLow: min_qty > 0 && available <= min_qty,
    /** المحجوز أكبر من الموجود — خطأ يحتاج تصحيح */
    overReserved: available < 0,
  };
};
