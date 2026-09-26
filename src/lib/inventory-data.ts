import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ALL_BRANCHES, useBranchScope } from "./branches";
import {
  setRentalStatusCatalog,
  type Material,
  type MaterialMovement,
  type MovementKind,
  type OrderMaterial,
  type RentalDress,
  type RentalRecord,
  type RentalStatus,
  type StatusTone,
} from "./inventory";
import {
  DEFAULT_RECEIPT_CONTENT,
  receiptTemplateKey,
  type ReceiptContent,
  type ReceiptKind,
  type ReceiptShop,
  type ReceiptTemplate,
} from "./deposit-receipt";
import type { PaymentMethod } from "./finance";
import { fetchAll } from "./fetch-all";
import { newId } from "@/lib/utils";

const BUCKET = "inventory";

/* ================= صور المخزون ================= */

export function useInventoryUrls(paths: (string | null | undefined)[]) {
  const clean = paths.filter((p): p is string => Boolean(p));
  const key = clean.join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split("|") : [];
    if (list.length === 0) {
      setUrls({});
      return;
    }
    supabase.storage
      .from(BUCKET)
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

async function uploadImage(file: File, folder: string) {
  const path = `${folder}/${newId()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

/* ================= مخزون المواد ================= */

export function useMaterials() {
  return useQuery({
    queryKey: ["materials"],
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase.from("materials").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: ["material", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Material | null;
    },
  });
}

export function useMaterialMovements(materialId?: string) {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["movements", materialId ?? "all", branchId],
    queryFn: async (): Promise<MaterialMovement[]> => {
      let q = supabase.from("material_movements").select("*").order("created_at", { ascending: false });
      if (materialId) q = q.eq("material_id", materialId);
      if (branchId !== ALL_BRANCHES) q = q.eq("branch_id", branchId);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

type MaterialInput = {
  name: string;
  category: string;
  unit: string;
  min_qty: number;
  unit_cost: number;
  supplier: string | null;
  notes: string | null;
  image?: File | null;
  opening_qty?: number;
  /** موقع الرصيد الافتتاحي (المخزن الرئيسي افتراضيًا) */
  opening_branch_id?: string | null;
};

export function useSaveMaterial() {
  const qc = useQueryClient();
  const { writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async ({ id, ...input }: MaterialInput & { id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const image_path = input.image ? await uploadImage(input.image, "materials") : undefined;
      const payload = {
        name: input.name,
        category: input.category,
        unit: input.unit,
        min_qty: input.min_qty,
        unit_cost: input.unit_cost,
        supplier: input.supplier,
        notes: input.notes,
        ...(image_path ? { image_path } : {}),
      };

      if (id) {
        const { error } = await supabase.from("materials").update(payload).eq("id", id);
        if (error) throw error;
        // حد التنبيه يُطبَّق على مواقع هذه المادة
        const target = input.opening_branch_id;
        let up = supabase.from("material_stock").update({ min_qty: input.min_qty }).eq("material_id", id);
        if (target) up = up.eq("branch_id", target);
        const { error: msErr } = await up;
        if (msErr) throw msErr;
        return id;
      }

      const { data, error } = await supabase
        .from("materials")
        .insert({ ...payload, created_by: uid })
        .select("id")
        .single();
      if (error) throw error;

      if (input.opening_qty && input.opening_qty > 0) {
        const mv = await supabase.from("material_movements").insert({
          material_id: data.id,
          kind: "in" as MovementKind,
          qty: input.opening_qty,
          notes: "رصيد افتتاحي",
          branch_id: input.opening_branch_id ?? writeBranchId,
          created_by: uid,
        });
        if (mv.error) throw mv.error;
      }
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["material-stock"] });
    },
  });
}

export function useAddMovement() {
  const qc = useQueryClient();
  const { writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async (input: {
      material_id: string;
      kind: MovementKind;
      qty: number;
      order_id?: string | null;
      notes?: string | null;
      /** موقع الحركة (بدونه: الفرع المختار) */
      branch_id?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("material_movements").insert({
        material_id: input.material_id,
        kind: input.kind,
        qty: input.qty,
        order_id: input.order_id ?? null,
        notes: input.notes ?? null,
        branch_id: input.branch_id ?? writeBranchId,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["material"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["material-stock"] });
      qc.invalidateQueries({ queryKey: ["order-materials"] });
    },
  });
}

/* ================= مواد الطلب: حجز وصرف ================= */

export function useOrderMaterials(orderId: string) {
  return useQuery({
    queryKey: ["order-materials", orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<OrderMaterial[]> => {
      const { data, error } = await supabase
        .from("order_materials")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** بعد حجز أو صرف أو تحرير خامات طلب */
function invalidateOrderMaterials(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["materials"] });
  qc.invalidateQueries({ queryKey: ["material"] });
  qc.invalidateQueries({ queryKey: ["material-stock"] });
  qc.invalidateQueries({ queryKey: ["order-materials"] });
  qc.invalidateQueries({ queryKey: ["movements"] });
}

/**
 * يحجز كمية مادة على طلب (عملية وحدة في قاعدة البيانات).
 * الحجز في موقع ثابت للسطر: فرع الطلب أول مرة، وبعدها نفس الموقع.
 */
export function useReserveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      materialId,
      qty,
      notes,
    }: {
      orderId: string;
      materialId: string;
      qty: number;
      notes?: string | null;
    }) => {
      const { error } = await supabase.rpc("reserve_order_material", {
        p_order_id: orderId,
        p_material_id: materialId,
        p_qty: qty,
        ...(notes?.trim() ? { p_notes: notes.trim() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrderMaterials(qc),
  });
}

/** يصرف كمية على الطلب من موقع حجزه، ويستهلك حجز الطلب نفسه فقط */
export function useIssueMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ row, qty }: { row: OrderMaterial; qty: number }) => {
      const { error } = await supabase.rpc("issue_order_material", { p_row_id: row.id, p_qty: qty });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrderMaterials(qc),
  });
}

/** يحرّر الحجز المتبقي لمادة على طلب */
export function useReleaseMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: OrderMaterial) => {
      if (Number(row.qty_reserved) <= 0) return;
      const { error } = await supabase.rpc("release_order_material", { p_row_id: row.id });
      if (error) throw error;
    },
    onSuccess: () => invalidateOrderMaterials(qc),
  });
}

/* ================= فساتين الإيجار ================= */

export function useRentalDresses() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["rental-dresses", branchId],
    queryFn: async (): Promise<RentalDress[]> => {
      let q = supabase.from("rental_dresses").select("*").order("code");
      if (branchId !== ALL_BRANCHES) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}


export function useRentalDress(id: string) {
  return useQuery({
    queryKey: ["rental-dress", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_dresses")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as RentalDress | null;
    },
  });
}

export function useRentalRecords(dressId?: string) {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["rental-records", dressId ?? "all", branchId],
    queryFn: async (): Promise<RentalRecord[]> => {
      return fetchAll<RentalRecord>((a, b) => {
        let q = supabase.from("rental_records").select("*");
        if (dressId) q = q.eq("dress_id", dressId);
        if (branchId !== ALL_BRANCHES) q = q.eq("branch_id", branchId);
        return q.order("out_date", { ascending: false }).order("id").range(a, b);
      });
    },
  });
}

export function useSaveDress() {
  const qc = useQueryClient();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async ({
      id,
      image,
      ...input
    }: {
      id?: string;
      code: string;
      model_no: string | null;
      size: string | null;
      color: string | null;
      rent_price: number;
      deposit_amount: number;
      status: RentalDress["status"];
      notes: string | null;
      /** قطع الفستان (قائمة التأشير عند الخروج والرجوع) */
      parts?: string[];
      image?: File | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const image_path = image ? await uploadImage(image, "dresses") : undefined;
      const payload = { ...input, ...(image_path ? { image_path } : {}) };

      if (id) {
        const { error } = await supabase.from("rental_dresses").update(payload).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("rental_dresses")
        .insert({ ...payload, branch_id: writeBranchId, created_by: userData.user?.id ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-dresses"] });
      qc.invalidateQueries({ queryKey: ["rental-dress"] });
    },
  });
}

export function useSetDressStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: RentalDress["status"] }) => {
      const { error } = await supabase.from("rental_dresses").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rental-dresses"] });
      qc.invalidateQueries({ queryKey: ["rental-dress"] });
    },
  });
}

/* ================= حالات فساتين الإيجار ================= */

export function useRentalStatuses() {
  return useQuery({
    queryKey: ["rental-statuses"],
    queryFn: async (): Promise<RentalStatus[]> => {
      const { data, error } = await supabase.from("rental_statuses").select("*").order("position");
      if (error) throw error;
      // تحديث القائمة قبل إعادة الرسم حتى تظهر الأسماء الجديدة مباشرة
      setRentalStatusCatalog(data ?? []);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useAddRentalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { label: string; tone: StatusTone; bookable: boolean }) => {
      const label = input.label.trim();
      if (!label) throw new Error("اكتب اسم الحالة");
      const max = await supabase
        .from("rental_statuses")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from("rental_statuses").insert({
        key: `st_${Date.now().toString(36)}`,
        label,
        tone: input.tone,
        bookable: input.bookable,
        position: (max.data?.position ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-statuses"] }),
  });
}

export function useUpdateRentalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { label?: string; tone?: StatusTone; bookable?: boolean };
    }) => {
      const { error } = await supabase.from("rental_statuses").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-statuses"] }),
  });
}

export function useDeleteRentalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rental_statuses").delete().eq("id", id);
      if (error?.code === "23503") {
        throw new Error("فيه فساتين على هذه الحالة — انقلها لحالة ثانية من صفحة الفستان ثم احذفها");
      }
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-statuses"] }),
  });
}

/** يحفظ ترتيب الحالات كما تظهر في القائمة */
export function useReorderRentalStatuses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const [i, id] of ids.entries()) {
        const { error } = await supabase
          .from("rental_statuses")
          .update({ position: i + 1 })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-statuses"] }),
  });
}

/** كل ما يتأثر بحركة إيجار: العقود والفساتين والمالية والتنبيهات */
function invalidateRentalMoney(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "rental-records",
    "rental-dresses",
    "rental-dress",
    "payments",
    "cash-transactions",
    "cash-accounts",
    "notifications",
    "order",
    "orders",
    "activity",
  ]) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/** حجز الفستان مع العربون (سند قبض في صندوق الفرع) */
export function useBookRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      dressId: string;
      clientName: string;
      clientPhone: string | null;
      outDate: string;
      dueDate: string;
      amount: number;
      depositAmount: number;
      notes: string | null;
      paid: number;
      method: PaymentMethod;
      invoiceNo: string | null;
      fittingDate: string | null;
    }) => {
      const { data, error } = await supabase.rpc("book_rental", {
        p_dress_id: input.dressId,
        p_client_name: input.clientName,
        p_client_phone: input.clientPhone ?? "",
        p_out_date: input.outDate,
        p_due_date: input.dueDate,
        p_amount: input.amount,
        p_deposit_amount: input.depositAmount,
        p_paid: input.paid,
        p_method: input.method,
        ...(input.notes ? { p_notes: input.notes } : {}),
        ...(input.invoiceNo ? { p_invoice_no: input.invoiceNo } : {}),
        ...(input.fittingDate ? { p_fitting_date: input.fittingDate } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateRentalMoney(qc),
  });
}

/** بيانات المنشأة لرأس الإيصال: من إعدادات الضريبة إن أمكن، وإلا من بيانات الفرع */
export function useReceiptShop(branchId: string | null | undefined) {
  return useQuery({
    queryKey: ["receipt-shop", branchId ?? "none"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ReceiptShop> => {
      const [tax, branch] = await Promise.all([
        supabase.from("tax_settings").select("*"),
        branchId
          ? supabase
              .from("branches")
              .select("name, address, phone, tax_number")
              .eq("id", branchId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const rows = tax.data ?? [];
      const t =
        rows.find((r) => r.branch_id === branchId) ?? rows.find((r) => !r.branch_id) ?? rows[0] ?? null;
      const b = branch.data;
      return {
        name: t?.business_name || b?.name || "مَعْمَل",
        branchName: b?.name ?? null,
        address: t?.business_address || b?.address || null,
        phone: b?.phone ?? null,
        taxNumber: t?.tax_number || b?.tax_number || null,
      };
    },
  });
}

/** نصوص إيصالات التأمين من الإعدادات (وإلا النصوص الافتراضية) */
export function useReceiptTemplates() {
  return useQuery({
    queryKey: ["receipt-templates"],
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<ReceiptTemplate[]> => {
      const { data, error } = await supabase.from("receipt_templates").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** نصوص الإيصال المحفوظة (الحقول القابلة للتعديل فقط) */
export const receiptContentOf = (rows: ReceiptTemplate[], kind: ReceiptKind): ReceiptContent => {
  const r = rows.find((row) => row.key === receiptTemplateKey(kind)) ?? DEFAULT_RECEIPT_CONTENT[kind];
  return {
    title: r.title,
    subtitle: r.subtitle,
    amount_label: r.amount_label,
    fields: r.fields,
    terms: r.terms,
    note: r.note,
    show_signatures: r.show_signatures,
    customer_signature_label: r.customer_signature_label,
    staff_signature_label: r.staff_signature_label,
    show_staff_name: r.show_staff_name,
    footer: r.footer,
  };
};

export function useSaveReceiptTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, content }: { kind: ReceiptKind; content: ReceiptContent }) => {
      const { error } = await supabase
        .from("receipt_templates")
        .update(content)
        .eq("key", receiptTemplateKey(kind));
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["receipt-templates"] }),
  });
}

/** تعديل بيانات الحجز غير المالية: موعد البروفة ورقم الفاتورة */
export function useUpdateRentalBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      patch: { fitting_date?: string | null; external_invoice_no?: string | null };
    }) => {
      const { error } = await supabase.from("rental_records").update(input.patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rental-records"] }),
  });
}

/** تسليم الفستان: باقي الإيجار في صندوق الفرع والتأمين في صندوق التأمينات */
export function useDeliverRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recordId: string;
      rentPaid: number;
      rentMethod: PaymentMethod;
      depositPaid: number;
      depositMethod: PaymentMethod;
    }) => {
      const { error } = await supabase.rpc("deliver_rental", {
        p_record_id: input.recordId,
        p_rent_paid: input.rentPaid,
        p_rent_method: input.rentMethod,
        p_deposit_paid: input.depositPaid,
        p_deposit_method: input.depositMethod,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRentalMoney(qc),
  });
}

/** طلب إلغاء الحجز: يصل تنبيه لصاحب قرار الإلغاء، والحجز باقٍ حتى يقرر */
export function useRequestRentalCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { recordId: string; reason: string | null }) => {
      const { error } = await supabase.rpc("request_rental_cancel", {
        p_record_id: input.recordId,
        ...(input.reason ? { p_reason: input.reason } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRentalMoney(qc),
  });
}

/** قرار الإلغاء: رد كامل أو جزئي أو بدون رد، أو رفض الطلب وإبقاء الحجز */
export function useDecideRentalCancel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recordId: string;
      cancel: boolean;
      refund: number;
      method: PaymentMethod;
      note: string | null;
    }) => {
      const { error } = await supabase.rpc("decide_rental_cancel", {
        p_record_id: input.recordId,
        p_cancel: input.cancel,
        p_refund: input.refund,
        p_method: input.method,
        ...(input.note ? { p_note: input.note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRentalMoney(qc),
  });
}

/* ================= طلبات التفصيل للإيجار ================= */

/** يُدخل فستان طلب «تفصيل إيجار» أو «إنتاج للإيجار» إلى مخزون الإيجار، ويقبض التأمين عند التسليم */
export function useDeliverRentalOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orderId: string;
      dueDate?: string | null;
      depositPaid?: number;
      depositMethod?: PaymentMethod;
    }) => {
      const { data, error } = await supabase.rpc("deliver_rental_order", {
        p_order_id: input.orderId,
        ...(input.dueDate ? { p_due_date: input.dueDate } : {}),
        ...(input.depositPaid !== undefined ? { p_deposit_paid: input.depositPaid } : {}),
        ...(input.depositMethod ? { p_deposit_method: input.depositMethod } : {}),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateRentalMoney(qc),
  });
}

/** إرجاع الفستان: رد التأمين بسند صرف بعد خصم التلف */
export function useCloseRentalReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      recordId: string;
      condition: string;
      damage?: number;
      note?: string | null;
      method?: PaymentMethod;
    }) => {
      const { error } = await supabase.rpc("close_rental_return", {
        p_record_id: input.recordId,
        p_condition: input.condition,
        p_damage: input.damage ?? 0,
        ...(input.note ? { p_note: input.note } : {}),
        ...(input.method ? { p_method: input.method } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateRentalMoney(qc),
  });
}

/** فساتين الإيجار المرتبطة بطلب تفصيل */
export function useDressesOfOrder(orderId: string) {
  return useQuery({
    queryKey: ["rental-dresses", "order", orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<RentalDress[]> => {
      const { data, error } = await supabase
        .from("rental_dresses")
        .select("*")
        .eq("source_order_id", orderId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** عقود الإيجار المرتبطة بطلب تفصيل */
export function useRecordsOfOrder(orderId: string) {
  return useQuery({
    queryKey: ["rental-records", "order", orderId],
    enabled: Boolean(orderId),
    queryFn: async (): Promise<RentalRecord[]> => {
      const { data, error } = await supabase
        .from("rental_records")
        .select("*")
        .eq("order_id", orderId)
        .order("out_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
