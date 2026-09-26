import { getStroke } from "perfect-freehand";
import { newId } from "@/lib/utils";
import { FRONT_BACK } from "./body";

/** لوحة التصميم: صفحات رسم بالقلم (على رسمة جسم أو ورقة فاضية) + مرفقات وروابط */

export const SKETCH_W = 1000;
export const SKETCH_H = 1400;
export const SKETCH_KIND = "sketch";

export const GUIDE_COLOR = "#b9ad95";

export type SketchPoint = [x: number, y: number, pressure: number];
export type XY = [x: number, y: number];

/** خط حر بالقلم: القلم يعطي ضغطًا حقيقيًا، والإصبع والفأرة نحاكي لهما الضغط */
export type SketchStroke = {
  type: "stroke";
  id: string;
  color: string;
  size: number;
  pen: boolean;
  points: SketchPoint[];
};

/** خط ثابت العرض — خطوط رسمة الجسم، ويمكن مسحها أو تحريكها */
export type SketchLine = {
  type: "line";
  id: string;
  color: string;
  width: number;
  dash?: string;
  template?: boolean;
  /** لون تعبئة للأشكال المغلقة (قطع الفستان) */
  fill?: string;
  points: XY[];
};

export type SketchNote = {
  type: "note";
  id: string;
  color: string;
  x: number;
  y: number;
  text: string;
};

export type SketchItem = SketchStroke | SketchLine | SketchNote;

export type SketchPageKind = "blank" | "image";

export type SketchPage = {
  id: string;
  kind: SketchPageKind;
  /** رسمة مرفوعة من المكتبة (لصفحات الصور) */
  image?: BodyImage;
  items: SketchItem[];
};

export type SketchAttachment = { path: string; name: string };

/** رسمة جسم مرفوعة في مكتبة الرسمات */
export type BodyImage = { id: string; label: string; path: string };

export type SketchLink = { id: string; url: string; title: string };

export type SketchDoc = {
  version: 2;
  pages: SketchPage[];
  attachments: SketchAttachment[];
  links: SketchLink[];
};

export const INK_COLORS = [
  { key: "ink", label: "أسود", value: "#2e2a24" },
  { key: "gold", label: "ذهبي", value: "#9a7b47" },
  { key: "red", label: "أحمر", value: "#c0392b" },
  { key: "blue", label: "أزرق", value: "#2f5d8a" },
] as const;

export const PEN_SIZES = [
  { key: "fine", label: "رفيع", value: 4 },
  { key: "medium", label: "متوسط", value: 8 },
  { key: "bold", label: "عريض", value: 16 },
] as const;

const uid = () => newId();

/* ===== رسم الخطوط ===== */

export function strokePath(stroke: SketchStroke) {
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.45,
    simulatePressure: !stroke.pen,
    last: true,
  });
  return outlineToPath(outline);
}

function outlineToPath(points: number[][]) {
  const len = points.length;
  if (len < 4) return "";
  const at = (i: number) => points[i % len] as XY;
  const mid = (a: XY, b: XY) =>
    `${((a[0] + b[0]) / 2).toFixed(2)},${((a[1] + b[1]) / 2).toFixed(2)}`;

  const [a, b, c] = [at(0), at(1), at(2)];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${mid(b, c)} T`;
  for (let i = 2; i < len - 1; i++) d += ` ${mid(at(i), at(i + 1))}`;
  return `${d} Z`;
}

export function linePath(points: XY[]) {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}

/* ===== تعديل العناصر ===== */

/** هل هذه النقطة قريبة من العنصر؟ (للممحاة والتحريك) */
export function hitsItem(item: SketchItem, x: number, y: number, radius: number) {
  if (item.type === "note") {
    return (
      Math.abs(item.x - x) < Math.max(60, item.text.length * 8) && Math.abs(item.y - 10 - y) < 26
    );
  }
  const r = radius + (item.type === "stroke" ? item.size : item.width) / 2;
  return item.points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < r * r);
}

/** خطوط رسمة الجسم الجاهزة (مقفولة افتراضيًا عن الممحاة والتحريك) */
export const isTemplateItem = (item: SketchItem) => item.type === "line" && item.template === true;

/** ممحاة جزئية: تمسح الجزء الذي مرّت عليه فقط وتقسم الخط إلى أجزاء */
export function eraseItems(
  items: SketchItem[],
  x: number,
  y: number,
  radius: number,
  includeTemplate = false,
) {
  let changed = false;
  const next = items.flatMap((item): SketchItem[] => {
    if (!includeTemplate && isTemplateItem(item)) return [item];
    if (item.type === "note") {
      if (!hitsItem(item, x, y, radius)) return [item];
      changed = true;
      return [];
    }
    const r = radius + (item.type === "stroke" ? item.size : item.width) / 2;
    const near = (p: readonly number[]) => ((p[0] ?? 0) - x) ** 2 + ((p[1] ?? 0) - y) ** 2 < r * r;
    if (!item.points.some(near)) return [item];
    changed = true;

    const runs: (typeof item.points)[] = [];
    let run: typeof item.points = [];
    for (const p of item.points) {
      if (near(p)) {
        if (run.length) runs.push(run);
        run = [];
      } else {
        run.push(p as never);
      }
    }
    if (run.length) runs.push(run);

    return runs
      .filter((pts) => pts.length >= 2)
      .map((pts, i) => ({ ...item, id: i === 0 ? item.id : uid(), points: pts }) as SketchItem);
  });
  return changed ? next : items;
}

export function translateItem<T extends SketchItem>(item: T, dx: number, dy: number): T {
  if (item.type === "note") return { ...item, x: item.x + dx, y: item.y + dy };
  if (item.type === "stroke") {
    return { ...item, points: item.points.map(([x, y, p]) => [x + dx, y + dy, p]) };
  }
  return { ...item, points: item.points.map(([x, y]) => [x + dx, y + dy]) };
}

/* ===== رسمة الجسم: خطوط منفصلة يمكن مسحها أو تحريكها ===== */

export type Op =
  | ["L", number, number]
  | ["C", number, number, number, number, number, number]
  | ["Q", number, number, number, number];

export function trace(start: XY, ops: Op[]): XY[] {
  const pts: XY[] = [start];
  let cur = start;
  for (const op of ops) {
    if (op[0] === "L") {
      const end: XY = [op[1], op[2]];
      const steps = Math.max(2, Math.ceil(Math.hypot(end[0] - cur[0], end[1] - cur[1]) / 12));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        pts.push([cur[0] + (end[0] - cur[0]) * t, cur[1] + (end[1] - cur[1]) * t]);
      }
      cur = end;
    } else if (op[0] === "C") {
      const [, x1, y1, x2, y2, x, y] = op;
      for (let i = 1; i <= 24; i++) {
        const t = i / 24;
        const u = 1 - t;
        pts.push([
          u * u * u * cur[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * cur[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        ]);
      }
      cur = [x, y];
    } else {
      const [, x1, y1, x, y] = op;
      for (let i = 1; i <= 24; i++) {
        const t = i / 24;
        const u = 1 - t;
        pts.push([
          u * u * cur[0] + 2 * u * t * x1 + t * t * x,
          u * u * cur[1] + 2 * u * t * y1 + t * t * y,
        ]);
      }
      cur = [x, y];
    }
  }
  return pts;
}

/* ===== الصفحات ===== */

export const newPage = (): SketchPage => ({ id: uid(), kind: "blank", items: [] });

export const newImagePage = (image: BodyImage): SketchPage => ({
  id: uid(),
  kind: "image",
  image,
  items: [],
});

const ownItems = (page: SketchPage) => page.items.filter((it) => !isTemplateItem(it));

/** يجعل خلفية الصفحة رسمة جسم (جاهزة أو من المكتبة)، ويُبقي رسم المستخدم */
export function swapToImage(page: SketchPage, image: BodyImage): SketchPage {
  return { id: page.id, kind: "image", image, items: ownItems(page) };
}

export const emptySketch = (): SketchDoc => ({
  version: 2,
  pages: [newImagePage(FRONT_BACK)],
  attachments: [],
  links: [],
});

export function parseSketch(raw: unknown): SketchDoc {
  if (!raw || typeof raw !== "object") return emptySketch();
  const r = raw as Partial<SketchDoc> & { items?: SketchItem[] };
  if (Array.isArray(r.pages) && r.pages.length > 0) {
    return {
      version: 2,
      // صفحات الرسمات القديمة المرسومة بالخطوط تبقى كما هي كصفحات عادية
      pages: r.pages.map((p) =>
        (p.kind as string) === "figure" ? { id: p.id, kind: "blank", items: p.items } : p,
      ),
      attachments: Array.isArray(r.attachments) ? r.attachments : [],
      links: Array.isArray(r.links) ? r.links : [],
    };
  }
  if (Array.isArray(r.items)) {
    return {
      version: 2,
      pages: [{ id: uid(), kind: "blank", items: r.items }],
      attachments: [],
      links: [],
    };
  }
  return emptySketch();
}
/** مسار صورة كل صفحة: الأولى هي المسجّلة في ملفات الطلب، والباقي بجانبها */
export const pagePngPath = (mainPng: string, index: number) =>
  index === 0 ? mainPng : mainPng.replace(/\.png$/, `-p${index + 1}.png`);

export function normalizeUrl(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** يحوّل عنصر SVG إلى صورة PNG (بدقة مضاعفة) لحفظها مع ملفات الطلب */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(SKETCH_W));
  clone.setAttribute("height", String(SKETCH_H));
  const xml = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("تعذر تجهيز صورة التصميم"));
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = SKETCH_W * scale;
    canvas.height = SKETCH_H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("المتصفح لا يدعم حفظ الرسمة");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("تعذر حفظ الرسمة"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
