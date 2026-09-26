import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useCurrentAccount } from "@/hooks/useSession";
import { salesBranches, useBranchScope, useBranches } from "./branches";
import { ordersKey } from "./data";
import type { Invoice, InvoiceLine, PaymentMethod, TaxSettings } from "./finance";
import type { AlterationItem } from "./alterations";
import type {
  FittingResult,
  GoodsItem,
  GoodsMovement,
  GoodsStock,
  GoodsTransferWithLines,
  OrderFitting,
  PartIssue,
  ReadyOrder,
  SaleReturn,
  SaleReturnLine,
} from "./goods";
import { newId } from "@/lib/utils";

const BUCKET = "inventory";

const KEYS = {
  items: ["goods-items"],
  stock: ["goods-stock"],
  ready: ["ready-orders"],
  transfers: ["goods-transfers"],
  issues: ["part-issues"],
  sales: ["sale-invoices"],
  movements: ["goods-movements"],
  fittings: ["order-fittings"],
} as const;

/* ===== القراءة ===== */

export function useGoodsItems() {
  return useQuery({
    queryKey: KEYS.items,
    queryFn: async (): Promise<GoodsItem[]> => {
      const { data, error } = await supabase.from("goods_items").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** كل الكميات الظاهرة للمستخدم (الصلاحيات تحدد الفروع) */
export function useGoodsStock() {
  return useQuery({
    queryKey: KEYS.stock,
    queryFn: async (): Promise<GoodsStock[]> => {
      const { data, error } = await supabase.from("goods_stock").select("*").gt("qty", 0);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** طلبات العميلات الجاهزة (في المعمل أو الطريق أو الفرع) */
export function useReadyOrders() {
  return useQuery({
    queryKey: KEYS.ready,
    queryFn: async (): Promise<ReadyOrder[]> => {
      const { data, error } = await supabase.rpc("ready_orders");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** الشحنات اللي في الطريق */
export function useGoodsTransfers() {
  return useQuery({
    queryKey: KEYS.transfers,
    queryFn: async (): Promise<GoodsTransferWithLines[]> => {
      const { data, error } = await supabase
        .from("goods_transfers")
        .select("*, goods_transfer_lines(*)")
        .eq("status", "in_transit")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        goods_transfer_lines: [...(t.goods_transfer_lines ?? [])].sort(
          (a, b) => a.position - b.position,
        ),
      }));
    },
  });
}

/** النواقص المفتوحة */
export function usePartIssues() {
  return useQuery({
    queryKey: KEYS.issues,
    queryFn: async (): Promise<PartIssue[]> => {
      const { data, error } = await supabase
        .from("part_issues")
        .select("*")
        .is("resolved_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGoodsMovements(itemId: string | null) {
  return useQuery({
    queryKey: [...KEYS.movements, itemId],
    enabled: Boolean(itemId),
    queryFn: async (): Promise<GoodsMovement[]> => {
      const { data, error } = await supabase
        .from("goods_movements")
        .select("*")
        .eq("item_id", itemId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** فواتير البيع الأخيرة في الفرع */
export function useSaleInvoices(branchId: string | null) {
  return useQuery({
    queryKey: [...KEYS.sales, branchId],
    enabled: Boolean(branchId),
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("scope", "sale")
        .eq("branch_id", branchId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaleInvoice(invoiceId: string) {
  return useQuery({
    queryKey: [...KEYS.sales, "one", invoiceId],
    queryFn: async (): Promise<{ invoice: Invoice | null; lines: InvoiceLine[] }> => {
      const [inv, lines] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle(),
        supabase.from("invoice_lines").select("*").eq("invoice_id", invoiceId).order("position"),
      ]);
      if (inv.error) throw inv.error;
      if (lines.error) throw lines.error;
      return { invoice: inv.data, lines: lines.data ?? [] };
    },
  });
}

/** إعدادات الضريبة للفرع (نفس اختيار دالة البيع: الفرع ثم العامة) */
export function useBranchTax(branchId: string | null) {
  return useQuery({
    queryKey: ["tax-settings", "branch", branchId],
    queryFn: async (): Promise<TaxSettings | null> => {
      const { data, error } = await supabase.from("tax_settings").select("*");
      if (error) throw error;
      const rows = data ?? [];
      return (
        rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => r.branch_id === null) ?? null
      );
    },
  });
}

/** الفروع اللي يشوفها المستخدم في المخزون الجاهز */
export function useGoodsPlaces() {
  const { profile } = useCurrentAccount();
  const { canAll } = useBranchScope();
  const { data: branches = [], isLoading } = useBranches();
  const sales = salesBranches(branches).filter((b) => b.is_active);
  const atWarehouse = branches.some((b) => b.is_warehouse && b.id === profile?.branch_id);
  const visible = canAll ? sales : sales.filter((b) => b.id === profile?.branch_id);
  return {
    isLoading,
    branches,
    /** فروع البيع اللي يشوف مخزنها */
    visible,
    /** أقسام جاهز المعمل اللي يشوفها */
    workshopSections: canAll || atWarehouse ? sales : visible,
    /** كل فروع البيع (للإرسال) */
    sales,
    canAll,
    atWarehouse,
    /** يتصرف في المعمل (إرسال وتعديل كميات): موظفو المعمل أو من له كل الفروع */
    workshopOk: canAll || atWarehouse,
  };
}

/* ===== الأصناف ===== */

function useInvalidateGoods() {
  const qc = useQueryClient();
  return () => {
    Object.values(KEYS).forEach((key) => qc.invalidateQueries({ queryKey: key }));
    qc.invalidateQueries({ queryKey: ordersKey });
  };
}

/** رسالة عربية للكود المكرر */
const friendlyItemError = (error: { code?: string; message: string }) =>
  error.code === "23505" ? new Error("الكود مستخدم لصنف ثاني — اكتب كود غيره أو خلّه فاضي") : error;

export type GoodsItemInput = {
  id?: string;
  code: string;
  name: string;
  item_type_id: string | null;
  purpose: string;
  sellable: boolean;
  price: number;
  cost: number;
  size: string;
  color: string;
  parts: string[];
  notes: string;
  is_active?: boolean;
  image?: File | null;
  /** الكمية الافتتاحية ومكانها (للصنف الجديد فقط) */
  opening?: { qty: number; branchId: string; atWorkshop: boolean } | null;
};

export function useSaveGoodsItem() {
  const invalidate = useInvalidateGoods();
  return useMutation({
    mutationFn: async ({ id, image, opening, ...fields }: GoodsItemInput) => {
      let image_path: string | undefined;
      if (image) {
        image_path = `goods/${newId()}-${image.name.replace(/[^\w.-]/g, "_")}`;
        const { error } = await supabase.storage.from(BUCKET).upload(image_path, image);
        if (error) throw error;
      }
      const row = {
        ...fields,
        code: fields.code.trim(),
        name: fields.name.trim(),
        size: fields.size.trim() || null,
        color: fields.color.trim() || null,
        notes: fields.notes.trim() || null,
        ...(image_path ? { image_path } : {}),
      };
      let itemId = id;
      if (id) {
        const { error } = await supabase.from("goods_items").update(row).eq("id", id);
        if (error) throw friendlyItemError(error);
      } else {
        const { data, error } = await supabase
          .from("goods_items")
          .insert(row)
          .select("id")
          .single();
        if (error) throw friendlyItemError(error);
        itemId = data.id;
      }
      if (itemId && opening && opening.qty > 0) {
        const { error } = await supabase.rpc("goods_adjust", {
          p_item_id: itemId,
          p_branch_id: opening.branchId,
          p_at_workshop: opening.atWorkshop,
          p_delta: opening.qty,
          p_notes: "رصيد افتتاحي",
        });
        if (error) throw error;
      }
      return itemId;
    },
    onSuccess: invalidate,
  });
}

/** تعديل سريع لخانات الصنف (مثل قابل للبيع) */
export function useUpdateGoodsItem() {
  const invalidate = useInvalidateGoods();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<GoodsItem> }) => {
      const { error } = await supabase.from("goods_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useAdjustGoods() {
  const invalidate = useInvalidateGoods();
  return useMutation({
    mutationFn: async (v: {
      itemId: string;
      branchId: string;
      atWorkshop: boolean;
      delta: number;
      notes?: string;
    }) => {
      const { error } = await supabase.rpc("goods_adjust", {
        p_item_id: v.itemId,
        p_branch_id: v.branchId,
        p_at_workshop: v.atWorkshop,
        p_delta: v.delta,
        ...(v.notes?.trim() ? { p_notes: v.notes.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/* ===== الشحنات والتسليم ===== */

export type SendLine =
  { item_id: string; qty: number; sent: string[] } | { order_id: string; sent: string[] };

export function useSendGoods() {
  const invalidate = useInvalidateGoods();
  return useMutation({
    mutationFn: async (v: {
      fromBranchId: string;
      fromWorkshop: boolean;
      toBranchId: string;
      lines: SendLine[];
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("send_goods", {
        p_from_branch: v.fromBranchId,
        p_from_workshop: v.fromWorkshop,
        p_to_branch: v.toBranchId,
        p_lines: v.lines as unknown as Json,
        ...(v.notes?.trim() ? { p_notes: v.notes.trim() } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useReceiveGoods() {
  const invalidate = useInvalidateGoods();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      transferId: string;
      /** received_qty للأصناف اللي تنعدّ (كم وصل منها) */
      lines: { line_id: string; received: string[]; received_qty?: number }[];
    }) => {
      const { error } = await supabase.rpc("receive_goods", {
        p_transfer_id: v.transferId,
        p_lines: v.lines as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      // استلام الفرع يُنهي مرحلة التسليم أو الإرسال للبروفة
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["stages"] });
    },
  });
}

/** نتائج البروفات لطلب (الأحدث أول) */
export function useOrderFittings(orderId: string | null) {
  return useQuery({
    queryKey: [...KEYS.fittings, orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderFitting[]> => {
      const { data, error } = await supabase
        .from("order_fittings")
        .select("*")
        .eq("order_id", orderId ?? "")
        .order("number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** نتيجة البروفة والتعديلات وتهميش المشرف، وإرجاع القطعة للمعمل بالتأشير */
export function useReturnFromFitting() {
  const invalidate = useInvalidateGoods();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      orderId: string;
      result: FittingResult;
      items: AlterationItem[];
      note: string;
      parts: string[];
    }) => {
      const { data, error } = await supabase.rpc("return_from_fitting", {
        p_order_id: v.orderId,
        p_result: v.result,
        p_items: v.items as unknown as Json,
        p_note: v.note.trim(),
        p_parts: v.parts,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["order", v.orderId] });
      qc.invalidateQueries({ queryKey: ["stages"] });
      qc.invalidateQueries({ queryKey: ["activity", v.orderId] });
    },
  });
}

/** يرسل القطع الناقصة من شحنة سابقة بشحنة جديدة، ويقفل النقص */
export function useSendMissingParts() {
  const invalidate = useInvalidateGoods();
  return useMutation({
    mutationFn: async (v: { issueId: string; notes?: string }) => {
      const { data, error } = await supabase.rpc("send_missing_parts", {
        p_issue_id: v.issueId,
        ...(v.notes?.trim() ? { p_notes: v.notes.trim() } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useResolveIssue() {
  const invalidate = useInvalidateGoods();
  return useMutation({
    mutationFn: async (v: { issueId: string; note?: string }) => {
      const { error } = await supabase.rpc("resolve_part_issue", {
        p_issue_id: v.issueId,
        ...(v.note?.trim() ? { p_note: v.note.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeliverOrderParts() {
  const invalidate = useInvalidateGoods();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { orderId: string; parts: string[] }) => {
      const { error } = await supabase.rpc("deliver_order_parts", {
        p_order_id: v.orderId,
        p_parts: v.parts,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["order", v.orderId] });
      qc.invalidateQueries({ queryKey: ["stages"] });
    },
  });
}

/* ===== البيع ===== */

export type SaleLineInput = { item_id: string; qty: number; price: number };

export function useSellGoods() {
  const invalidate = useInvalidateGoods();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      branchId: string;
      clientName: string;
      clientPhone: string;
      method: PaymentMethod;
      lines: SaleLineInput[];
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("sell_goods", {
        p_branch_id: v.branchId,
        p_client_name: v.clientName.trim(),
        p_client_phone: v.clientPhone.trim(),
        p_method: v.method,
        p_lines: v.lines as unknown as Json,
        ...(v.notes?.trim() ? { p_notes: v.notes.trim() } : {}),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/* ===== مرتجع البيع ===== */

export function useSaleReturns(invoiceId: string) {
  return useQuery({
    queryKey: [...KEYS.sales, "returns", invoiceId],
    queryFn: async (): Promise<(SaleReturn & { sale_return_lines: SaleReturnLine[] })[]> => {
      const { data, error } = await supabase
        .from("sale_returns")
        .select("*, sale_return_lines(*)")
        .eq("invoice_id", invoiceId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReturnSale() {
  const invalidate = useInvalidateGoods();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      invoiceId: string;
      lines: { line_id: string; qty: number }[];
      method: PaymentMethod;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc("return_sale", {
        p_invoice_id: v.invoiceId,
        p_lines: v.lines as unknown as Json,
        p_method: v.method,
        p_reason: v.reason.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["cash-vouchers"] });
    },
  });
}

/** تعديل قطع فستان الطلب (قائمة التأشير) */
export function useUpdateOrderParts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { orderId: string; parts: string[] }) => {
      const { error } = await supabase
        .from("orders")
        .update({ parts: v.parts })
        .eq("id", v.orderId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["order", v.orderId] });
      qc.invalidateQueries({ queryKey: KEYS.ready });
    },
  });
}

/** يحفظ قطع فستان الإيجار عند الخروج أو الرجوع، ويسجّل الناقص للمتابعة */
export function useRecordRentalParts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { recordId: string; stage: "out" | "return"; parts: string[] }) => {
      const { error } = await supabase.rpc("record_rental_parts", {
        p_record_id: v.recordId,
        p_stage: v.stage,
        p_parts: v.parts,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.issues });
      qc.invalidateQueries({ queryKey: ["rental-records"] });
    },
  });
}
