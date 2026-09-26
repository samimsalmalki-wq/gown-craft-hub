import type { Database } from "@/integrations/supabase/types";

/* ===== المخزون الجاهز: الأصناف والكميات والشحنات ===== */

export type GoodsItem = Database["public"]["Tables"]["goods_items"]["Row"];
export type GoodsStock = Database["public"]["Tables"]["goods_stock"]["Row"];
export type GoodsMovement = Database["public"]["Tables"]["goods_movements"]["Row"];
export type GoodsTransfer = Database["public"]["Tables"]["goods_transfers"]["Row"];
export type GoodsTransferLine = Database["public"]["Tables"]["goods_transfer_lines"]["Row"];
export type GoodsTransferWithLines = GoodsTransfer & { goods_transfer_lines: GoodsTransferLine[] };
export type PartIssue = Database["public"]["Tables"]["part_issues"]["Row"];
export type ReadyOrder = Database["public"]["Functions"]["ready_orders"]["Returns"][number];

/** صلاحيات المخزون الجاهز، وصلاحيات مخزون المواد */
export const GOODS_PERMS = ["goods.manage", "goods.transfer", "goods.sell"];
export const MATERIALS_PERMS = [
  "inventory.manage",
  "inventory.request",
  "inventory.approve",
  "inventory.transfer",
];

export type GoodsPurpose = "sale" | "display" | "sample";

export const PURPOSE_LABEL: Record<GoodsPurpose, string> = {
  sale: "للبيع",
  display: "للعرض",
  sample: "عينة",
};

export const PURPOSE_TONE: Record<GoodsPurpose, "gold" | "neutral" | "soon"> = {
  sale: "gold",
  display: "neutral",
  sample: "soon",
};

export const purposeOf = (v: string | null | undefined): GoodsPurpose =>
  v === "display" || v === "sample" ? v : "sale";

/* ===== قطع الفستان (قائمة التأشير) ===== */

export const DRESS = "الفستان";
export const PART_OPTIONS = ["الطرحة", "الجيبون", "الحزام", "الكاب", "الكفر"];
export const DEFAULT_DRESS_PARTS = [DRESS, "الطرحة", "الجيبون"];

/** القائمة الفارغة تعني الفستان وحده */
export const partsOrDress = (parts: string[] | null | undefined) =>
  parts && parts.length > 0 ? parts : [DRESS];

/** نوع القطعة فستان؟ (يحدد إن كان للصنف قطع مرفقة افتراضيًا) */
export const isDressType = (name: string | null | undefined) => Boolean(name?.includes("فستان"));

/**
 * قائمة تأشير صنف عند الإرسال (نفس صيغة دالة الإرسال في قاعدة البيانات):
 * القطع لكل وحدة («الفستان (1)»…)، أو سطر واحد بالكمية للأصناف اللي تنعدّ.
 */
export const goodsChecklist = (name: string, parts: string[], qty: number) =>
  parts.length === 0
    ? [`${name} × ${qty}`]
    : qty <= 1
      ? parts
      : Array.from({ length: qty }, (_, i) => parts.map((p) => `${p} (${i + 1})`)).flat();

/** القطع اللي ما تأشّرت (بنفس ترتيب القائمة) */
export const missingParts = (all: string[], got: string[]) => all.filter((p) => !got.includes(p));

/* ===== مكان فستان الطلب ===== */

export type DressLocation =
  "production" | "workshop" | "transit" | "branch" | "fitting" | "returning" | "delivered";

export const DRESS_LOCATION_LABEL: Record<DressLocation, string> = {
  production: "في الإنتاج",
  workshop: "جاهز في المعمل",
  transit: "في الطريق للفرع",
  branch: "في الفرع — جاهز للتسليم",
  fitting: "في الفرع للبروفة",
  returning: "راجع للمعمل من البروفة",
  delivered: "مُسلَّم",
};

const LOCATIONS = Object.keys(DRESS_LOCATION_LABEL) as DressLocation[];

export const dressLocationOf = (v: string | null | undefined): DressLocation =>
  LOCATIONS.find((l) => l === v) ?? "production";

/* ===== النواقص ===== */

export const ISSUE_STAGE_LABEL: Record<string, string> = {
  send: "ما انرسل",
  receive: "ما وصل للفرع",
  deliver: "ما تسلّمته العميلة",
  rental_out: "ما خرج مع فستان الإيجار",
  rental_return: "ما رجع مع فستان الإيجار",
  fitting_back: "ما رجع من البروفة",
  workshop_receive: "ما وصل للمعمل",
};

export const ISSUE_STAGE_CHIP: Record<string, string> = {
  send: "عند الإرسال",
  receive: "عند الاستلام",
  deliver: "عند التسليم",
  rental_out: "خروج الإيجار",
  rental_return: "رجوع الإيجار",
  fitting_back: "رجوع البروفة",
  workshop_receive: "استلام المعمل",
};

/* ===== البروفة ===== */

export type OrderFitting = Database["public"]["Tables"]["order_fittings"]["Row"];
export type FittingResult = "approved" | "redo";

export const FITTING_RESULT_LABEL: Record<FittingResult, string> = {
  approved: "معتمدة — يكمل الطلب",
  redo: "إعادة بروفة",
};

export const fittingResultOf = (v: string): FittingResult => (v === "redo" ? "redo" : "approved");

/* ===== الكميات ===== */

/** «workshop» للمعمل، وإلا معرّف الفرع */
export const WORKSHOP = "workshop";

export const qtyAt = (stock: GoodsStock[], itemId: string, branchId: string, atWorkshop: boolean) =>
  stock.find(
    (s) => s.item_id === itemId && s.branch_id === branchId && s.at_workshop === atWorkshop,
  )?.qty ?? 0;

export const MOVEMENT_LABEL: Record<string, string> = {
  in: "إدخال",
  adjust: "تسوية",
  send: "إرسال",
  receive: "استلام",
  sale: "بيع",
  return: "مرتجع",
};

export type SaleReturn = Database["public"]["Tables"]["sale_returns"]["Row"];
export type SaleReturnLine = Database["public"]["Tables"]["sale_return_lines"]["Row"];

/* ===== الضريبة (السعر شامل الضريبة) ===== */

const round2 = (v: number) => Math.round(v * 100) / 100;

export const splitVat = (incl: number, rate: number) => {
  const total = round2(incl);
  const net = rate > 0 ? round2((total * 100) / (100 + rate)) : total;
  return { total, net, vat: round2(total - net) };
};

/** المبلغ بالهللات (للفواتير) */
export const sar = (v: number | string | null | undefined) =>
  `${Number(v ?? 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ر.س`;
