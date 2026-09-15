import type { Database } from "@/integrations/supabase/types";

export type Material = Database["public"]["Tables"]["materials"]["Row"];
export type MaterialMovement = Database["public"]["Tables"]["material_movements"]["Row"];
export type OrderMaterial = Database["public"]["Tables"]["order_materials"]["Row"];
export type RentalDress = Database["public"]["Tables"]["rental_dresses"]["Row"];
export type RentalRecord = Database["public"]["Tables"]["rental_records"]["Row"];
export type MovementKind = Database["public"]["Enums"]["material_movement_kind"];
export type DressStatus = Database["public"]["Enums"]["rental_dress_status"];

export const MATERIAL_CATEGORIES: { key: string; label: string }[] = [
  { key: "fabric", label: "قماش" },
  { key: "embroidery", label: "قطع تطريز" },
  { key: "beads", label: "خرز وترتر" },
  { key: "lace", label: "دانتيل" },
  { key: "accessory", label: "إكسسوار" },
  { key: "other", label: "أخرى" },
];

export const categoryLabel = (key: string) =>
  MATERIAL_CATEGORIES.find((c) => c.key === key)?.label ?? key;

export const MATERIAL_UNITS = ["متر", "حبة", "لفة", "كيس", "علبة"] as const;

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  in: "إدخال",
  out: "صرف",
  reserve: "حجز",
  release: "تحرير حجز",
};

export const DRESS_STATUS_LABEL: Record<DressStatus, string> = {
  in_production: "قيد التصنيع",
  available: "متاح",
  rented: "مؤجَّر حاليًا",
  cleaning: "في التنظيف",
  repair: "تحت الإصلاح",
  retired: "خارج الخدمة",
};

export const RETURN_CONDITIONS: { key: string; label: string }[] = [
  { key: "ok", label: "سليم — يرجع للمتاح" },
  { key: "cleaning", label: "يحتاج تنظيف" },
  { key: "repair", label: "يحتاج إصلاح" },
];

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

/** إيجار قائم فعليًا: خرج الفستان ولم يُرجَع بعد */
export const isOutNow = (r: Pick<RentalRecord, "out_date" | "returned_at">) =>
  !r.returned_at && r.out_date <= todayStr();

/** حجز مسبق: مسجَّل لتاريخ قادم والفستان ما زال في المحل */
export const isUpcomingRental = (r: Pick<RentalRecord, "out_date" | "returned_at">) =>
  !r.returned_at && r.out_date > todayStr();

/** الحالة المعروضة: الحجز المسبق لا يجعل الفستان مؤجَّرًا */
export const effectiveDressStatus = (
  dress: Pick<RentalDress, "id" | "status">,
  records: Pick<RentalRecord, "dress_id" | "out_date" | "returned_at">[],
): DressStatus => {
  const out = records.some((r) => r.dress_id === dress.id && isOutNow(r));
  if (out) return "rented";
  if (dress.status === "rented") return "available";
  return dress.status;
};

export const isRentalLate = (r: Pick<RentalRecord, "due_date" | "returned_at">) => {
  if (r.returned_at) return false;
  const due = new Date(r.due_date);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
};
