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

/** خانات بطاقة المقاسات (بالسنتيمتر) */
export const MEASUREMENT_FIELDS = [
  ["bust", "الصدر"],
  ["waist", "الوسط"],
  ["hips", "الأرداف"],
  ["shoulder", "الكتف"],
  ["sleeve", "طول الكم"],
  ["length", "طول الفستان"],
] as const;

export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number][0];

export const measurementLabel = (key: string) =>
  MEASUREMENT_FIELDS.find(([k]) => k === key)?.[1] ?? key;

/** مقاس مضاف باسمه في الطلب (ليس من الخانات الثابتة): مفتاحه هو اسمه */
export const isCustomMeasurement = (key: string) => !MEASUREMENT_FIELDS.some(([k]) => k === key);

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "مدير النظام",
  supervisor: "مشرف فرع",
  staff: "عاملة إنتاج",
  cs: "موظفة مبيعات",
};

/* ===== كتالوج الأدوار الحيّ: يُحدَّث من جدول الأدوار ===== */

export type RoleCatalogRow = {
  id: string;
  key: string;
  label: string;
  position: number;
  is_builtin: boolean;
  is_active: boolean;
  /** أصناف المخزون المسموحة للدور (فارغة = كل الأصناف) */
  material_categories: string[];
};

export const BUILTIN_ROLES: AppRole[] = ["admin", "supervisor", "staff", "cs"];

let ROLE_CATALOG: RoleCatalogRow[] = BUILTIN_ROLES.map((key, i) => ({
  id: key,
  key,
  label: ROLE_LABEL[key],
  position: i + 1,
  is_builtin: true,
  is_active: true,
  material_categories: [],
}));

export const setRoleCatalog = (rows: RoleCatalogRow[]) => {
  if (rows.length) ROLE_CATALOG = [...rows].sort((a, b) => a.position - b.position);
};

export const roleCatalog = () => ROLE_CATALOG;

export const activeRoleList = () => ROLE_CATALOG.filter((r) => r.is_active);

export const roleLabel = (key: string | null | undefined) => {
  if (!key) return "موظف";
  return (
    ROLE_CATALOG.find((r) => r.key === key)?.label ??
    ROLE_LABEL[key as AppRole] ??
    key
  );
};

export const isBuiltinRole = (key: string) => BUILTIN_ROLES.includes(key as AppRole);


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

/* ===== نوع الطلب: تفصيل ملك / تفصيل إيجار / إنتاج للإيجار ===== */

export type OrderKind = Database["public"]["Enums"]["order_kind"];

export const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  own: "تفصيل ملك",
  rental: "تفصيل إيجار",
  rental_stock: "إنتاج للإيجار",
};

export const ORDER_KIND_HINT: Record<OrderKind, string> = {
  own: "يُسلَّم للعميلة ولا يرجع للمحل",
  rental: "يرجع للمحل بعد المناسبة وعليه تأمين، ثم يُؤجَّر",
  rental_stock: "قطعة تُنتج للمخزون بدون عميلة، وتصبح متاحة للإيجار",
};

export type ItemType = Database["public"]["Tables"]["item_types"]["Row"];

let ITEM_TYPES: ItemType[] = [];

export const setItemTypeCatalog = (rows: ItemType[]) => {
  ITEM_TYPES = [...rows].sort((a, b) => a.position - b.position);
};

export const itemTypeCatalog = () => ITEM_TYPES;

export const itemTypeLabel = (id: string | null | undefined) =>
  (id ? ITEM_TYPES.find((t) => t.id === id)?.name : null) ?? "—";

export type Permission = { key: string; label: string; hint: string; group: string };

/** أقسام الصلاحيات بالترتيب الذي تظهر به في شاشة الأدوار */
export const PERMISSION_GROUPS = [
  "الطلبات",
  "الإنتاج",
  "فساتين الإيجار",
  "المخزون والمستودع",
  "المالية",
  "الإدارة",
] as const;

export const PERMISSIONS: Permission[] = [
  { group: "الطلبات", key: "orders.create", label: "تسجيل طلب جديد", hint: "إنشاء طلب تفصيل أو إيجار جديد" },
  { group: "الطلبات", key: "orders.edit", label: "تعديل الطلبات", hint: "تعديل بيانات الطلب والعميلة والأسعار" },
  {
    group: "الطلبات",
    key: "orders.view_all",
    label: "كل طلبات الفرع",
    hint: "بدونها يرى الموظف الطلبات التي سجّلها أو المسندة إليه فقط",
  },
  { group: "الطلبات", key: "finance.view", label: "عرض المبالغ", hint: "قيمة الطلب والعربون والمبلغ المتبقي" },
  {
    group: "الطلبات",
    key: "payments.collect",
    label: "تحصيل العربون",
    hint: "تسجيل سندات قبض على الطلبات التي يراها فقط",
  },
  { group: "الطلبات", key: "files.upload", label: "إرفاق الصور", hint: "رفع صور الفستان وملفات المراحل" },
  {
    group: "الإنتاج",
    key: "stages.manage",
    label: "إدارة المراحل",
    hint: "إسناد العاملات وبدء وإنهاء واعتماد المراحل المسموحة له في صفحة الموظف",
  },
  { group: "الإنتاج", key: "stages.edit", label: "تنفيذ مراحلي", hint: "بدء وإنهاء المراحل المسندة إليه فقط" },
  {
    group: "فساتين الإيجار",
    key: "rentals.manage",
    label: "فساتين الإيجار",
    hint: "إضافة الفساتين والحجز والتسليم والإرجاع وطلب الإلغاء",
  },
  {
    group: "فساتين الإيجار",
    key: "rentals.cancel",
    label: "قرار إلغاء الحجز",
    hint: "الموافقة على الإلغاء ورد المدفوع كامل أو جزء منه — للمدير فقط إلا إذا فعّلها",
  },
  {
    group: "المخزون والمستودع",
    key: "inventory.manage",
    label: "إدارة المواد",
    hint: "إضافة المواد وحركات الإدخال والصرف والحجز (ضمن أصناف الدور)",
  },
  { group: "المخزون والمستودع", key: "inventory.request", label: "طلب خامات", hint: "طلب صرف خامات من المستودع" },
  {
    group: "المخزون والمستودع",
    key: "inventory.approve",
    label: "اعتماد طلبات الخامات",
    hint: "اعتماد أو رفض طلبات الصرف (ضمن أصناف الدور)",
  },
  { group: "المخزون والمستودع", key: "inventory.transfer", label: "نقل المخزون", hint: "نقل الخامات بين الفروع" },
  {
    group: "المخزون والمستودع",
    key: "goods.manage",
    label: "إدارة البضاعة الجاهزة",
    hint: "إضافة الفساتين والطرح والعينات وتعديل كمياتها وأسعارها",
  },
  {
    group: "المخزون والمستودع",
    key: "goods.transfer",
    label: "إرسال واستلام الجاهز",
    hint: "إرسال الجاهز من المعمل للفروع، وتأكيد الاستلام والتسليم للعميلة بقائمة القطع",
  },
  {
    group: "المخزون والمستودع",
    key: "goods.sell",
    label: "البيع من المخزون",
    hint: "بيع القطع القابلة للبيع بفاتورة ضريبية",
  },
  {
    group: "المخزون والمستودع",
    key: "goods.discount",
    label: "البيع بخصم",
    hint: "البيع بأقل من السعر المفترض للقطعة",
  },
  {
    group: "المخزون والمستودع",
    key: "goods.return",
    label: "مرتجع البيع",
    hint: "إرجاع قطع مباعة ورد مبلغها من صندوق الفرع",
  },
  { group: "المالية", key: "finance.payments", label: "الدفعات وسندات القبض", hint: "تسجيل التحصيل وإصدار سندات القبض" },
  { group: "المالية", key: "finance.invoices", label: "الفواتير", hint: "إصدار الفواتير وبنودها والضريبة" },
  {
    group: "المالية",
    key: "finance.expenses",
    label: "المصروفات والمشتريات",
    hint: "المصروفات والمشتريات وحركة الصناديق",
  },
  { group: "المالية", key: "finance.accounts", label: "الحسابات والقيود", hint: "شجرة الحسابات وقيود اليومية" },
  { group: "المالية", key: "finance.reports", label: "التقارير المالية", hint: "المستحقات والتحصيل وتقرير الضريبة" },
  { group: "الإدارة", key: "branches.all", label: "كل الفروع", hint: "رؤية بيانات جميع الفروع والتبديل بينها" },
  { group: "الإدارة", key: "branches.manage", label: "إدارة الفروع", hint: "إضافة الفروع وتعديل بياناتها" },
  { group: "الإدارة", key: "staff.manage", label: "عرض الموظفين", hint: "قائمة الموظفين وبياناتهم وأداؤهم" },
  { group: "الإدارة", key: "reports.view", label: "تقارير الأداء", hint: "تقارير الأداء والمتأخرات" },
  {
    group: "الإدارة",
    key: "catalog.manage",
    label: "الموديلات والكتالوج",
    hint: "الموديلات وأنواع القطع وتصنيفات المواد وحالات فساتين الإيجار",
  },
  { group: "الإدارة", key: "whatsapp.manage", label: "رسائل الواتساب", hint: "تعديل نصوص الرسائل الجاهزة" },
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
  payment_received: "تحصيل دفعة",
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
