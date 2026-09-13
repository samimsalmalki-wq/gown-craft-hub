import type { Database } from "@/integrations/supabase/types";
import type { Order } from "./atelier";
import { fmtDate, money, remaining } from "./atelier";
import type { RentalDress, RentalRecord } from "./inventory";

export type WhatsappTemplate = Database["public"]["Tables"]["whatsapp_templates"]["Row"];

export const RENTAL_TEMPLATE_KEYS = ["rental_return"];

/** حقول جاهزة للإدراج في نص الرسالة */
export const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "client_name", label: "اسم العميلة" },
  { key: "order_no", label: "رقم الطلب" },
  { key: "booked_at", label: "تاريخ الحجز" },
  { key: "due_date", label: "موعد التسليم" },
  { key: "fitting1_date", label: "البروفة الأولى" },
  { key: "fitting2_date", label: "البروفة الثانية" },
  { key: "event_date", label: "تاريخ المناسبة" },
  { key: "total_amount", label: "قيمة الفستان" },
  { key: "deposit_amount", label: "العربون المدفوع" },
  { key: "remaining", label: "المبلغ المتبقي" },
  { key: "dress_code", label: "كود فستان الإيجار" },
  { key: "return_due_date", label: "موعد إرجاع الإيجار" },
];

/** يحوّل رقم الجوال إلى صيغة دولية بدون رموز (افتراضي السعودية 966) */
export function normalizePhone(raw: string | null | undefined, countryCode = "966") {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = countryCode + d.slice(1);
  else if (/^5\d{8}$/.test(d)) d = countryCode + d;
  return d.length >= 10 ? d : null;
}

export function fillTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "—");
}

export function orderVars(order: Order): Record<string, string> {
  return {
    client_name: order.client_name,
    order_no: order.order_no,
    booked_at: fmtDate(order.booked_at),
    due_date: fmtDate(order.due_date),
    fitting1_date: fmtDate(order.fitting1_date),
    fitting2_date: fmtDate(order.fitting2_date),
    event_date: fmtDate(order.event_date),
    total_amount: money(order.total_amount),
    deposit_amount: money(order.deposit_amount),
    remaining: money(remaining(order)),
  };
}

export function rentalVars(record: RentalRecord, dress?: RentalDress | null): Record<string, string> {
  return {
    client_name: record.client_name,
    dress_code: dress?.code ?? "—",
    return_due_date: fmtDate(record.due_date),
    total_amount: money(record.amount),
    deposit_amount: money(record.deposit_amount),
  };
}

/** عيّنة قيم للمعاينة في صفحة تعديل النصوص */
export const SAMPLE_VARS: Record<string, string> = {
  client_name: "نورة",
  order_no: "A-1042",
  booked_at: "١٢/٩/٢٠٢٦",
  due_date: "٢٠/١٠/٢٠٢٦",
  fitting1_date: "٢٨/٩/٢٠٢٦",
  fitting2_date: "١٠/١٠/٢٠٢٦",
  event_date: "٢٥/١٠/٢٠٢٦",
  total_amount: "٤٫٥٠٠ ر.س",
  deposit_amount: "١٫٥٠٠ ر.س",
  remaining: "٣٫٠٠٠ ر.س",
  dress_code: "D-018",
  return_due_date: "٣٠/٩/٢٠٢٦",
};

export function waLink(phone: string, text: string) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
