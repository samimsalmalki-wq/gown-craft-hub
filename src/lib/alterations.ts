import type { Database, Json } from "@/integrations/supabase/types";
import { stageLabel } from "./atelier";

/** قسم التعديلات: المسار والتسميات وأدوات العرض (بدون قاعدة بيانات) */

export type AlterationRow = Database["public"]["Tables"]["alterations"]["Row"];
export type Tailor = Database["public"]["Tables"]["tailors"]["Row"];

export type AlterationStep =
  | "new"
  | "review"
  | "approved"
  | "to_workshop"
  | "queued"
  | "in_progress"
  | "to_branch"
  | "at_branch"
  | "done"
  | "cancelled";

/** نقاط التعديل المطلوبة في كل قطعة (تتسجل يدويًا) */
export type AlterationItem = { part: string; points: string[] };

export type AlterationEvent = { at: string; by: string | null; name: string; text: string };

/** who: مين عليه الخطوة الجاية */
export const ALTERATION_STEPS: {
  key: AlterationStep;
  label: string;
  where: string;
  who: string;
}[] = [
  { key: "new", label: "بانتظار تعميد مشرف الفرع", where: "الفرع", who: "مشرف الفرع" },
  { key: "review", label: "بانتظار مراجعة الإدارة", where: "الإدارة", who: "الإدارة" },
  { key: "approved", label: "معتمد — جاهز للإرسال للمعمل", where: "الفرع", who: "مشرف الفرع" },
  { key: "to_workshop", label: "في الطريق للمعمل", where: "الطريق", who: "مشرف المعمل" },
  { key: "queued", label: "في طابور المعمل", where: "المعمل", who: "مشرف المعمل" },
  { key: "in_progress", label: "قيد التنفيذ", where: "المعمل", who: "مشرف المعمل" },
  { key: "to_branch", label: "جاهز — في الطريق للفرع", where: "الطريق", who: "مشرف الفرع" },
  { key: "at_branch", label: "في الفرع — جاهز للتجربة", where: "الفرع", who: "موظفة المبيعات" },
  { key: "done", label: "انتهى", where: "—", who: "—" },
];

export const stepIndex = (step: string) => ALTERATION_STEPS.findIndex((s) => s.key === step);

export const stepLabel = (a: Pick<AlterationRow, "step" | "client_result">) => {
  if (a.step === "cancelled") return "ملغي";
  if (a.step === "done")
    return a.client_result === "rejected" ? "انتهى — ما قبلته العميلة" : "انتهى";
  return ALTERATION_STEPS[stepIndex(a.step)]?.label ?? a.step;
};

export const stepWho = (step: string) => ALTERATION_STEPS[stepIndex(step)]?.who ?? "—";

export const isOpen = (a: Pick<AlterationRow, "step">) =>
  a.step !== "done" && a.step !== "cancelled";

export const inWorkshop = (a: Pick<AlterationRow, "step">) =>
  a.step === "to_workshop" || a.step === "queued" || a.step === "in_progress";

/** الخياط يتحدد بعد ما يستلم المعمل ويطبع الكرت */
export const isPrinted = (a: Pick<AlterationRow, "step">) =>
  a.step !== "cancelled" && stepIndex(a.step) >= stepIndex("queued");

export const stepTone = (a: Pick<AlterationRow, "step">) =>
  a.step === "done"
    ? ("ok" as const)
    : a.step === "cancelled"
      ? ("neutral" as const)
      : inWorkshop(a)
        ? ("gold" as const)
        : ("soon" as const);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function itemsOf(a: Pick<AlterationRow, "items">): AlterationItem[] {
  const raw: Json = a.items;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => {
    if (!isRecord(x) || typeof x["part"] !== "string") return [];
    const points = Array.isArray(x["points"])
      ? x["points"].filter((p): p is string => typeof p === "string")
      : [];
    return [{ part: x["part"], points }];
  });
}

export function historyOf(a: Pick<AlterationRow, "history">): AlterationEvent[] {
  const raw: Json = a.history;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) =>
    isRecord(x) && typeof x["text"] === "string"
      ? [
          {
            at: typeof x["at"] === "string" ? x["at"] : "",
            by: typeof x["by"] === "string" ? x["by"] : null,
            name: typeof x["name"] === "string" ? x["name"] : "",
            text: x["text"],
          },
        ]
      : [],
  );
}

export const summaryOf = (a: Pick<AlterationRow, "items">) =>
  itemsOf(a)
    .map((i) => `${i.part}: ${i.points.join("، ")}`)
    .join(" · ");

/** وقت طلب التعديل: المرحلة اللي كان فيها الطلب، أو رجيع بعد التسليم */
export const sourceLabel = (a: Pick<AlterationRow, "after_delivery" | "source_stage">) =>
  a.after_delivery ? "رجيع بعد التسليم" : a.source_stage ? stageLabel(a.source_stage) : "—";

/** التاريخ بالتوقيت المحلي (YYYY-MM-DD) */
export const localDate = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const localToday = () => localDate(new Date());

export const daysFromToday = (date: string) =>
  Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${localToday()}T00:00:00`).getTime()) /
      86400000,
  );

export type DueTone = "late" | "soon" | "neutral";

/** «اليوم» / «بكرة» / «باقي ٣ أيام» / «متأخر يومين» */
export function dueOf(pickup: string | null): { text: string; tone: DueTone; days: number | null } {
  if (!pickup) return { text: "بدون موعد", tone: "neutral", days: null };
  const n = daysFromToday(pickup);
  const ar = (v: number) => v.toLocaleString("ar-EG");
  if (n === 0) return { text: "اليوم", tone: "soon", days: n };
  if (n === 1) return { text: "بكرة", tone: "soon", days: n };
  if (n > 1) return { text: `باقي ${ar(n)} أيام`, tone: "neutral", days: n };
  return { text: `متأخر ${ar(-n)} يوم`, tone: "late", days: n };
}

export const fmtDay = (d: string | null) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString("ar-EG", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "—";

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** مثال يظهر في خانة أول نقطة لكل قطعة */
const EXAMPLES: Record<string, string> = {
  الفستان: "تضييق الخصر ٢ سم",
  الطرحة: "تقصير ١٠ سم",
  الجيبون: "تقصير ٥ سم",
  الحزام: "تثبيت الإبزيم",
};

export const pointExample = (part: string) => EXAMPLES[part] ?? "تقصير ٣ سم";
