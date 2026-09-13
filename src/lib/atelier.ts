import type { Database } from "@/integrations/supabase/types";

/** مفتاح المرحلة: نص حتى يمكن للمدير إنشاء مراحل مخصّصة */
export type StageKey = string;
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

/* ===== سجل المراحل الحيّ: يُحدَّث من قالب المراحل في قاعدة البيانات ===== */

export type StageCatalogRow = {
  stage: string;
  label: string;
  position: number;
  is_active: boolean;
};

let CATALOG: StageCatalogRow[] = STAGES.map((s, i) => ({
  stage: s.key,
  label: s.label,
  position: i + 1,
  is_active: true,
}));

export const setStageCatalog = (rows: StageCatalogRow[]) => {
  if (rows.length) CATALOG = [...rows].sort((a, b) => a.position - b.position);
};

export const stageCatalog = () => CATALOG;

export const activeStageList = () => CATALOG.filter((c) => c.is_active);

export const stageLabel = (key: StageKey) =>
  CATALOG.find((s) => s.stage === key)?.label ??
  STAGES.find((s) => s.key === key)?.label ??
  key;

export const stageIndex = (key: StageKey) => {
  const list = activeStageList();
  const i = list.findIndex((s) => s.stage === key);
  return i >= 0 ? i : CATALOG.findIndex((s) => s.stage === key);
};

export const stageCount = () => activeStageList().length;

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: "لم تبدأ",
  assigned: "مسندة",
  in_progress: "قيد التنفيذ",
  blocked: "متوقفة",
  review: "تحتاج مراجعة",
  done: "مكتملة",
  late: "متأخرة",
};

export const OPEN_STATUSES: StageStatus[] = ["assigned", "in_progress", "blocked", "review", "late"];

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
  isActive(o) && stageIndex(o.current_stage) <= 1;

/** قيد التصنيع: بعد أول مرحلتين وقبل آخر مرحلتين من القالب المفعّل */
export const inProduction = (o: Pick<Order, "current_stage" | "state">) => {
  const i = stageIndex(o.current_stage);
  const n = stageCount();
  return isActive(o) && i >= 2 && i < Math.max(2, n - 2);
};

export const dueTone = (o: Pick<Order, "due_date" | "state">) =>
  isLate(o) ? "text-late" : isDueSoon(o) ? "text-soon" : "text-muted-foreground";

export type Department = Database["public"]["Tables"]["departments"]["Row"];
export type StageTemplate = Database["public"]["Tables"]["stage_templates"]["Row"];
export type Alteration = Database["public"]["Tables"]["alterations"]["Row"];
export type ActivityRow = Database["public"]["Tables"]["activity_log"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

export const ACTIVITY_LABEL: Record<string, string> = {
  order_created: "إنشاء الطلب",
  stage_changed: "تغيير المرحلة",
  due_date_changed: "تغيير موعد التسليم",
  payment_changed: "تغيير حالة الدفع",
  state_changed: "تغيير حالة الطلب",
  assigned: "إسناد موظف",
  stage_status: "تحديث حالة مرحلة",
  work_started: "بدء العمل",
  work_paused: "إيقاف العمل",
  work_finished: "إنهاء العمل",
  stage_approved: "اعتماد المرحلة",
  stage_rejected: "رفض المرحلة",
  alteration_added: "إضافة تعديل",
  alteration_status: "تحديث تعديل",
  file_added: "إضافة مرفق",
  whatsapp_sent: "إرسال رسالة واتساب",
  scope_set: "تحديد المراحل المطلوبة",
};

export const activityLabel = (action: string) => ACTIVITY_LABEL[action] ?? action;

export const isStageLate = (
  s: Pick<OrderStage, "due_at" | "status">,
) => {
  if (!s.due_at || s.status === "done") return false;
  const due = new Date(s.due_at);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};

export const stageLateDays = (s: Pick<OrderStage, "due_at" | "status">) => {
  if (!isStageLate(s) || !s.due_at) return 0;
  const due = new Date(s.due_at);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - due.getTime()) / 86400000);
};

export const fmtDuration = (minutes: number | null | undefined) => {
  if (!minutes && minutes !== 0) return "—";
  if (minutes < 60) return `${minutes} دقيقة`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} ساعة`;
  return `${Math.floor(h / 24)} يوم و${h % 24} ساعة`;
};
