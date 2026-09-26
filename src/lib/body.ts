import type { BodyImage, XY } from "./sketch";

/**
 * رسمات الجسم الجاهزة (صور في public/body-templates) وتخطيط صفحة «أمام وخلف».
 * صورة «أمام وخلف» 675×1200: منتصف الجسم الأمامي x=199 والخلفي x=471.
 */

export const FRONT_BACK_ID = "front-back";

export const BUILTIN_BODIES: BodyImage[] = [
  { id: FRONT_BACK_ID, label: "أمام وخلف", path: "/body-templates/front-back.jpg" },
  { id: "front-guides", label: "أمام بخطوط المقاسات", path: "/body-templates/front-guides.jpg" },
  { id: "front-soft", label: "أمام (ناعم)", path: "/body-templates/front-soft.jpg" },
  { id: "front-sketch", label: "أمام (رسم رصاص)", path: "/body-templates/front-sketch.jpg" },
  { id: "pose-hands", label: "وضعية · اليدين على الخصر", path: "/body-templates/pose-hands.jpg" },
  { id: "pose-walk", label: "وضعية · مشي", path: "/body-templates/pose-walk.jpg" },
];

export const FRONT_BACK = BUILTIN_BODIES[0] as BodyImage;

export const isBuiltinPath = (path: string) => path.startsWith("/");

/* ===== صفحة «أمام وخلف»: نقص الرسمتين ونبعدهما عن بعض حتى ما تتداخل التنانير ===== */

export const FB = {
  imgW: 675,
  imgH: 1200,
  /** المقطع الرأسي من الصورة (من الرأس إلى القاعدة) */
  cropY: 150,
  cropH: 890,
  /** مقطع كل رسمة أفقيًا ومكانها في الصفحة */
  front: { cropX: 30, cropW: 305, pageX: 115, center: 199 },
  back: { cropX: 335, cropW: 305, pageX: 561, center: 471 },
  scale: 1.3,
  pageY: 100,
} as const;

export type FigureSide = "front" | "back";

/** من إحداثيات القطعة (بُعد عن المنتصف، ارتفاع في الصورة) إلى إحداثيات الصفحة */
export function fbToPage(side: FigureSide, dx: number, y: number): XY {
  const f = FB[side];
  return [f.pageX + (f.center + dx - f.cropX) * FB.scale, FB.pageY + (y - FB.cropY) * FB.scale];
}
