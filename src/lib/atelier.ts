import type { Database } from "@/integrations/supabase/types";

export type StageKey = Database["public"]["Enums"]["stage_key"];
export type StageStatus = Database["public"]["Enums"]["stage_status"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type OrderState = Database["public"]["Enums"]["order_state"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type OrderStage = Database["public"]["Tables"]["order_stages"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type OrderFile = Database["public"]["Tables"]["order_files"]["Row"];

export type Priority = Database["public"]["Enums"]["task_priority"];
export type AlterationStatus = Database["public"]["Enums"]["alteration_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "booking", label: "الحجز" },
  { key: "measurements", label: "أخذ المقاسات" },
  { key: "design", label: "التصميم" },
  { key: "design_approval", label: "اعتماد التصميم" },
  { key: "materials", label: "تجهيز الخامات" },
  { key: "cutting", label: "القص" },
  { key: "sewing", label: "الخياطة" },
  { key: "embroidery", label: "التطريز" },
  { key: "finishing", label: "التشطيب" },
  { key: "fitting1", label: "البروفة الأولى" },
  { key: "alterations", label: "التعديلات" },
  { key: "fitting2", label: "البروفة الثانية" },
  { key: "final_alterations", label: "التعديلات النهائية" },
  { key: "quality", label: "الجودة" },
  { key: "prep_delivery", label: "التجهيز للتسليم" },
  { key: "delivery", label: "التسليم" },
];

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "مدير النظام",
  supervisor: "مشرف",
  staff: "موظف",
  cs: "خدمة عملاء",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "منخفضة",
  normal: "عادية",
  high: "عالية",
  urgent: "عاجلة",
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export const ALTERATION_STATUS_LABEL: Record<AlterationStatus, string> = {
  requested: "مطلوب",
  in_progress: "قيد التنفيذ",
  done: "منفَّذ",
  cancelled: "ملغي",
};

export const stageLabel = (key: StageKey) =>
  STAGES.find((s) => s.key === key)?.label ?? key;

export const stageIndex = (key: StageKey) => STAGES.findIndex((s) => s.key === key);

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: "لم تبدأ",
  in_progress: "قيد التنفيذ",
  done: "منتهية",
  blocked: "متوقفة",
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  unpaid: "غير مدفوع",
  partial: "عربون مدفوع",
  paid: "مدفوع بالكامل",
};

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  active: "قيد التنفيذ",
  delivered: "مُسلَّم",
  cancelled: "ملغي",
};

export const FITTING_STAGES: StageKey[] = ["fitting1", "fitting2"];

export const PERMISSIONS: { key: string; label: string; hint: string }[] = [
  { key: "orders.edit", label: "تعديل الطلبات", hint: "إضافة وتعديل بيانات الطلب والعميلة" },
  { key: "stages.edit", label: "تحديث المراحل", hint: "بدء وإنهاء المراحل وإضافة ملاحظات" },
  { key: "finance.view", label: "عرض المالية", hint: "القيم والعربون والمبلغ المتبقي" },
  { key: "files.upload", label: "إرفاق الصور", hint: "رفع صور الفستان وملفات المراحل" },
];

export const money = (v: number | string | null | undefined) =>
  `${Number(v ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 0 })} ر.س`;

export const fmtDate = (v: string | null | undefined) => {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return `${d.toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} · ${d.toLocaleTimeString(
    "ar-EG",
    { hour: "2-digit", minute: "2-digit" },
  )}`;
};

export const remaining = (o: Pick<Order, "total_amount" | "deposit_amount">) =>
  Number(o.total_amount) - Number(o.deposit_amount);

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const daysUntilDue = (o: Pick<Order, "due_date">) => {
  if (!o.due_date) return null;
  const due = new Date(o.due_date);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - startOfToday().getTime()) / 86400000);
};

export const isActive = (o: Pick<Order, "state">) => o.state === "active";

export const isLate = (o: Pick<Order, "due_date" | "state">) => {
  const d = daysUntilDue(o);
  return isActive(o) && d !== null && d < 0;
};

export const isDueSoon = (o: Pick<Order, "due_date" | "state">) => {
  const d = daysUntilDue(o);
  return isActive(o) && d !== null && d >= 0 && d <= 7;
};

export const isFinanciallyOpen = (o: Pick<Order, "total_amount" | "deposit_amount">) =>
  remaining(o) > 0;

export const isNew = (o: Pick<Order, "current_stage" | "state">) =>
  isActive(o) && (o.current_stage === "booking" || o.current_stage === "measurements");

export const inProduction = (o: Pick<Order, "current_stage" | "state">) => {
  const i = stageIndex(o.current_stage);
  return isActive(o) && i >= 2 && i <= 11;
};

export const dueTone = (o: Pick<Order, "due_date" | "state">) =>
  isLate(o) ? "text-late" : isDueSoon(o) ? "text-soon" : "text-muted-foreground";
