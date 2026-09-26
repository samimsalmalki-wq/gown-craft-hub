import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/hooks/useSession";
import type { Order } from "./atelier";
import type { AlterationItem, AlterationRow, Tailor } from "./alterations";
import { ALL_BRANCHES, useBranchScope } from "./branches";
import type { PaymentMethod } from "./finance";
import { ALTERATION_SKETCH_KIND, saveSketch, type SketchResult } from "./sketch-data";

const KEY = ["alterations"] as const;
const TAILORS_KEY = ["tailors"] as const;

export type AlterationOrder = Pick<
  Order,
  | "id"
  | "order_no"
  | "client_name"
  | "client_phone"
  | "branch_id"
  | "parts"
  | "model_id"
  | "model_no"
  | "is_new_model"
  | "item_type_id"
  | "state"
  | "current_stage"
>;

export type AlterationWithOrder = AlterationRow & { order: AlterationOrder | null };

const WITH_ORDER =
  "*, order:orders(id, order_no, client_name, client_phone, branch_id, parts, model_id, model_no, is_new_model, item_type_id, state, current_stage)";

const invalidate = (qc: QueryClient) => {
  void qc.invalidateQueries({ queryKey: KEY });
  void qc.invalidateQueries({ queryKey: ["activity"] });
  void qc.invalidateQueries({ queryKey: ["notifications"] });
};

/* ===== القراءة ===== */

/** كل تعديلات الطلب (الجولات) بالترتيب */
export function useOrderAlterations(orderId: string) {
  return useQuery({
    queryKey: [...KEY, "order", orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<AlterationRow[]> => {
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

/** طابور التعديلات: المفتوحة كلها + آخر المنتهية (الفرع المختار) */
export function useAlterationQueue() {
  const { opsBranchId: selected, canAll } = useBranchScope();
  const { can } = useCurrentAccount();
  // المعمل واحد لكل الفروع: مشرف المعمل يشوف تعديلات كل الفروع حتى لو حسابه على فرع
  const opsBranchId = !canAll && can("alterations.workshop") ? ALL_BRANCHES : selected;
  return useQuery({
    queryKey: [...KEY, "queue", opsBranchId],
    queryFn: async (): Promise<AlterationWithOrder[]> => {
      const scoped = <T>(q: T): T =>
        opsBranchId === ALL_BRANCHES
          ? q
          : ((q as { eq: (c: string, v: string) => T }).eq("branch_id", opsBranchId) as T);
      const [open, closed] = await Promise.all([
        scoped(supabase.from("alterations").select(WITH_ORDER))
          .not("step", "in", "(done,cancelled)")
          .order("pickup_date", { ascending: true, nullsFirst: false }),
        scoped(supabase.from("alterations").select(WITH_ORDER))
          .in("step", ["done", "cancelled"])
          .order("completed_at", { ascending: false })
          .limit(40),
      ]);
      if (open.error) throw open.error;
      if (closed.error) throw closed.error;
      return [...(open.data ?? []), ...(closed.data ?? [])] as AlterationWithOrder[];
    },
  });
}

export function useAlteration(id: string) {
  return useQuery({
    queryKey: [...KEY, "one", id],
    enabled: Boolean(id),
    queryFn: async (): Promise<AlterationWithOrder | null> => {
      const { data, error } = await supabase
        .from("alterations")
        .select(WITH_ORDER)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as AlterationWithOrder | null;
    },
  });
}

/* ===== الطلب والمسار ===== */

export function useRequestAlteration(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      items: AlterationItem[];
      pickupDate: string;
      fee: number;
      sketch: SketchResult | null;
      round: number;
    }) => {
      const sketchPath = v.sketch
        ? await saveSketch(orderId, {
            ...v.sketch,
            caption: `تعديل ${v.round}`,
            kind: ALTERATION_SKETCH_KIND,
          })
        : null;
      const { data, error } = await supabase.rpc("request_alteration", {
        p_order_id: orderId,
        p_items: v.items,
        p_pickup_date: v.pickupDate,
        p_fee: v.fee,
        ...(sketchPath ? { p_sketch_path: sketchPath } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate(qc);
      void qc.invalidateQueries({ queryKey: ["files", orderId] });
    },
  });
}

export type AlterationAction =
  | "approve"
  | "review_ok"
  | "review_back"
  | "send_workshop"
  | "receive_workshop"
  | "set_tailor"
  | "start"
  | "send_branch"
  | "receive_branch"
  | "accept"
  | "reject"
  | "cancel"
  | "set_fee";

export function useAlterationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      action: AlterationAction;
      note?: string;
      parts?: string[];
      tailor?: string;
      fee?: number;
    }) => {
      const { error } = await supabase.rpc("alteration_action", {
        p_id: v.id,
        p_action: v.action,
        ...(v.note !== undefined ? { p_note: v.note } : {}),
        ...(v.parts !== undefined ? { p_parts: v.parts } : {}),
        ...(v.tailor !== undefined ? { p_tailor: v.tailor } : {}),
        ...(v.fee !== undefined ? { p_fee: v.fee } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate(qc);
      // قبول العميلة يفك وقفة المرحلة
      void qc.invalidateQueries({ queryKey: ["stages"] });
    },
  });
}

/** تحصيل الرسوم: فاتورة شاملة الضريبة + سند قبض، ويرجع رقم الفاتورة */
export function useCollectAlterationFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; method: PaymentMethod }) => {
      const { data, error } = await supabase.rpc("collect_alteration_fee", {
        p_id: v.id,
        p_method: v.method,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate(qc);
      void qc.invalidateQueries({ queryKey: ["payments"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["cash-transactions"] });
    },
  });
}

/* ===== الخياطين ===== */

export function useTailors() {
  return useQuery({
    queryKey: TAILORS_KEY,
    queryFn: async (): Promise<Tailor[]> => {
      const { data, error } = await supabase.from("tailors").select("*").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddTailor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const clean = name.trim();
      if (!clean) throw new Error("اكتب اسم الخياط");
      const { error } = await supabase.from("tailors").insert({ name: clean });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TAILORS_KEY }),
  });
}

export function useUpdateTailor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      id: string;
      patch: Partial<Pick<Tailor, "name" | "is_default" | "is_active">>;
    }) => {
      const { error } = await supabase.from("tailors").update(v.patch).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TAILORS_KEY }),
  });
}
