import type { Database } from "@/integrations/supabase/types";
import type { Order } from "./atelier";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceLine = Database["public"]["Tables"]["invoice_lines"]["Row"];
export type TaxSettings = Database["public"]["Tables"]["tax_settings"]["Row"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type FinanceScope = Database["public"]["Enums"]["finance_scope"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "نقدًا",
  card: "شبكة",
  transfer: "تحويل بنكي",
  other: "أخرى",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "مسودة",
  issued: "صادرة",
  cancelled: "ملغاة",
};

export const FINANCE_SCOPE_LABEL: Record<FinanceScope, string> = {
  order: "تفصيل",
  rental: "إيجار",
};

/** المستحق على الطلب = القيمة − ما تم تحصيله */
export const orderDue = (o: Pick<Order, "total_amount" | "deposit_amount">) =>
  Math.max(0, Number(o.total_amount) - Number(o.deposit_amount));

export const collected = (rows: Pick<Payment, "amount">[]) =>
  rows.reduce((sum, p) => sum + Number(p.amount), 0);

export const vatOf = (subtotal: number, rate: number) =>
  Math.round(((subtotal * rate) / 100) * 100) / 100;

export const monthKey = (v: string) => v.slice(0, 7);

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("ar-EG", {
    month: "long",
    year: "numeric",
  });
};

export const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const monthStartISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
