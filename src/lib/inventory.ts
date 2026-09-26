import type { Database } from "@/integrations/supabase/types";
import { MEASUREMENT_FIELDS } from "./atelier";

export type Material = Database["public"]["Tables"]["materials"]["Row"];
export type MaterialMovement = Database["public"]["Tables"]["material_movements"]["Row"];
export type OrderMaterial = Database["public"]["Tables"]["order_materials"]["Row"];
export type RentalDress = Database["public"]["Tables"]["rental_dresses"]["Row"];
export type RentalRecord = Database["public"]["Tables"]["rental_records"]["Row"];
export type MovementKind = Database["public"]["Enums"]["material_movement_kind"];
/** مفتاح حالة الفستان من قائمة «حالات فساتين الإيجار» (قابلة للتعديل من الإعدادات) */
export type DressStatus = string;
export type RentalStatus = Database["public"]["Tables"]["rental_statuses"]["Row"];

export type MaterialCategory = Database["public"]["Tables"]["material_categories"]["Row"];

/** التصنيفات الافتراضية قبل تحميل الكتالوج من قاعدة البيانات */
const FALLBACK_CATEGORIES: { key: string; label: string }[] = [
  { key: "fabric", label: "قماش" },
  { key: "lace", label: "دانتيل" },
  { key: "embroidery", label: "قطع تطريز" },
  { key: "trim", label: "خرز وترتر" },
  { key: "thread", label: "خيوط" },
  { key: "notion", label: "مستلزمات خياطة" },
  { key: "accessory", label: "إكسسوار" },
  { key: "packaging", label: "تغليف" },
  { key: "other", label: "أخرى" },
];

let CATEGORIES: { key: string; label: string; is_active: boolean }[] = FALLBACK_CATEGORIES.map(
  (c) => ({ ...c, is_active: true }),
);

export const setMaterialCategoryCatalog = (rows: MaterialCategory[]) => {
  CATEGORIES = [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ key: r.key, label: r.label, is_active: r.is_active }));
};

/** التصنيفات المُفعّلة للاختيار في النماذج */
export const materialCategoryList = () => CATEGORIES.filter((c) => c.is_active);

export const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;

export const MATERIAL_UNITS = ["متر", "حبة", "لفة", "كيس", "علبة"] as const;

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  in: "إدخال",
  out: "صرف",
  reserve: "حجز",
  release: "تحرير حجز",
};

/* ===== حالات فساتين الإيجار: قائمة حيّة تُحدَّث من جدول rental_statuses ===== */

export type StatusTone = "ok" | "gold" | "soon" | "late" | "neutral";

export const STATUS_TONES: { key: StatusTone; label: string }[] = [
  { key: "ok", label: "أخضر" },
  { key: "gold", label: "ذهبي" },
  { key: "soon", label: "برتقالي" },
  { key: "late", label: "أحمر" },
  { key: "neutral", label: "رمادي" },
];

type StatusEntry = Pick<RentalStatus, "key" | "label" | "tone" | "bookable" | "is_builtin">;

/** الحالات الافتراضية قبل تحميل القائمة من قاعدة البيانات */
let STATUSES: StatusEntry[] = [
  { key: "available", label: "متاح", tone: "ok", bookable: true, is_builtin: true },
  { key: "rented", label: "مؤجَّر", tone: "gold", bookable: true, is_builtin: true },
  { key: "late_return", label: "متأخر في الترجيع", tone: "late", bookable: true, is_builtin: true },
  { key: "cleaning", label: "في التنظيف", tone: "soon", bookable: true, is_builtin: false },
  { key: "repair", label: "تحت الإصلاح", tone: "late", bookable: true, is_builtin: false },
  { key: "in_production", label: "قيد التصنيع", tone: "soon", bookable: true, is_builtin: false },
  { key: "retired", label: "خارج الخدمة", tone: "neutral", bookable: false, is_builtin: false },
];

/** حالات يحددها النظام من عقود الإيجار ولا تُختار يدويًا */
export const AUTO_STATUSES = ["rented", "late_return"];

export const setRentalStatusCatalog = (rows: RentalStatus[]) => {
  if (rows.length) STATUSES = [...rows].sort((a, b) => a.position - b.position);
};

export const rentalStatusList = () => STATUSES;

/** الحالات التي تُختار يدويًا (المؤجَّر والمتأخر يتحددان تلقائيًا من خروج الفستان وموعد إرجاعه) */
export const manualStatusList = () => STATUSES.filter((s) => !AUTO_STATUSES.includes(s.key));

export const dressStatusLabel = (key: string) => STATUSES.find((s) => s.key === key)?.label ?? key;

export const dressStatusTone = (key: string): StatusTone => {
  const tone = STATUSES.find((s) => s.key === key)?.tone;
  return STATUS_TONES.some((t) => t.key === tone) ? (tone as StatusTone) : "neutral";
};

/** الفستان في هذه الحالة يقبل الحجز ويظهر في البحث بتاريخ المناسبة */
export const isBookableStatus = (key: string) => STATUSES.find((s) => s.key === key)?.bookable ?? true;

/** خيارات نموذج الإرجاع: الحالة التي يصير إليها الفستان بعد رجوعه */
export const returnStatusOptions = () =>
  manualStatusList().map((s) => ({
    key: s.key,
    label: s.key === "available" ? `سليم — يرجع «${s.label}»` : s.label,
  }));

export const available = (m: Pick<Material, "qty_on_hand" | "qty_reserved">) =>
  Number(m.qty_on_hand) - Number(m.qty_reserved);

export const isLowStock = (m: Pick<Material, "qty_on_hand" | "qty_reserved" | "min_qty">) =>
  available(m) <= Number(m.min_qty);

export const qty = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type RecordState = Pick<RentalRecord, "delivered_at" | "returned_at" | "cancelled_at">;

export const isCancelledRental = (r: Pick<RentalRecord, "cancelled_at">) => Boolean(r.cancelled_at);

/** إيجار قائم فعليًا: تسلّمت العميلة الفستان ولم يُرجَع بعد */
export const isOutNow = (r: RecordState) => !r.returned_at && !r.cancelled_at && Boolean(r.delivered_at);

/** حجز لم يُسلَّم بعد (ما زال الفستان في المحل)، ولو فات موعد استلامه */
export const isUpcomingRental = (r: RecordState) =>
  !r.returned_at && !r.cancelled_at && !r.delivered_at;

/** حجز فات موعد استلامه والعميلة ما استلمت */
export const isPickupOverdue = (r: RecordState & Pick<RentalRecord, "out_date">) =>
  isUpcomingRental(r) && r.out_date < todayStr();

/** الحالة المعروضة: الحجز المسبق لا يجعل الفستان مؤجَّرًا، والخارج بعد موعده متأخر في الترجيع */
export const effectiveDressStatus = (
  dress: Pick<RentalDress, "id" | "status">,
  records: (RecordState & Pick<RentalRecord, "dress_id" | "due_date">)[],
): DressStatus => {
  const out = records.find((r) => r.dress_id === dress.id && isOutNow(r));
  if (out) return isRentalLate(out) ? "late_return" : "rented";
  if (dress.status === "rented") return "available";
  return dress.status;
};

export const isRentalLate = (r: RecordState & Pick<RentalRecord, "due_date">) => {
  if (!isOutNow(r)) return false;
  const due = new Date(r.due_date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};

/** اليوم بصيغة YYYY-MM-DD بالتوقيت المحلي */
export const localDay = (v: string | Date = new Date()) => {
  const d = typeof v === "string" ? new Date(v) : v;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** عدد الأيام من اليوم حتى التاريخ (سالب إذا كان في الماضي) */
export const daysFromToday = (day: string) => {
  const target = new Date(`${day.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

/** أول عقد قائم (غير مُرجَع ولا ملغي) يتقاطع مع الفترة المطلوبة (من/إلى بصيغة YYYY-MM-DD) */
export const findRentalClash = <
  R extends Pick<RentalRecord, "out_date" | "due_date" | "returned_at" | "cancelled_at">,
>(
  records: R[],
  from: string,
  to: string = from,
) =>
  records.find(
    (r) => !r.returned_at && !r.cancelled_at && r.out_date <= to && r.due_date >= from,
  );

/** مبالغ العقد: الإيجار والمدفوع والمتبقي والتأمين المحفوظ في صندوق التأمينات */
export const rentalMoney = (r: RentalRecord) => {
  const rent = Number(r.amount);
  const paid = Number(r.paid_amount);
  // الإيجارات القديمة بدون مبالغ متبقية، وإيجار طلب «تفصيل إيجار» مسجّل على الطلب نفسه
  const tracked = r.tracks_money && !r.order_id;
  const depositHeld = Math.max(
    Number(r.deposit_paid) - Number(r.deposit_refunded) - Number(r.damage_amount),
    0,
  );
  return {
    tracked,
    rent,
    paid,
    remaining: tracked && !r.cancelled_at ? Math.max(rent - paid, 0) : 0,
    depositPaid: Number(r.deposit_paid),
    depositHeld,
    depositRefunded: Number(r.deposit_refunded),
    damage: Number(r.damage_amount),
  };
};

export const returnConditionLabel = (key: string | null | undefined) => {
  if (!key) return null;
  if (key === "ok" || key === "available") return "رجع سليم";
  return `بعد الإرجاع: ${dressStatusLabel(key)}`;
};

/* ===== تفاصيل حجز الإيجار (مثل الطلب الجديد) ===== */

/** المقاسات المكتوبة فقط: الثابتة بترتيبها ثم المضافة باسمها */
export const measuresOf = (raw: unknown): Record<string, string> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([k, v]) => [k, v === null || v === undefined ? "" : String(v).trim()] as const)
    .filter(([, v]) => v !== "");
  const order = (k: string) => {
    const i = MEASUREMENT_FIELDS.findIndex(([key]) => key === k);
    return i < 0 ? MEASUREMENT_FIELDS.length : i;
  };
  return Object.fromEntries(entries.sort((a, b) => order(a[0]) - order(b[0])));
};

/** هل في الحجز مقاسات أو رسمة أو مواعيد إضافية تستاهل زر التفاصيل؟ */
export const hasRentalDetails = (r: RentalRecord) =>
  Boolean(r.sketch_path || r.event_date || r.fitting2_date) ||
  Object.keys(measuresOf(r.measurements)).length > 0;
