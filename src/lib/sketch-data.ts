import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { SKETCH_KIND, pagePngPath, parseSketch, type BodyImage, type SketchDoc } from "./sketch";
import { newId } from "@/lib/utils";
import { isBuiltinPath } from "./body";

const BUCKET = "order-files";

/**
 * كل حفظ نسخة جديدة:
 *  - صورة PNG لكل صفحة (الأولى مسجّلة في ملفات الطلب وتظهر كصورة التصميم)
 *  - ملف JSON فيه الصفحات والمرفقات والروابط لإكمال التعديل لاحقًا
 *  - الصور المرفقة الجديدة تُرفع مرة واحدة وتُشارك بين النسخ
 */
const docPathOf = (pngPath: string) => pngPath.replace(/\.png$/, ".json");

export type SketchResult = {
  doc: SketchDoc;
  pngs: Blob[];
  /** صور أُضيفت في هذه الجلسة ولم تُرفع بعد */
  files: { name: string; file: File }[];
};

/** kind: نوع الملف في ملفات الطلب (التصميم افتراضيًا، أو رسمة تعديل) */
export type SketchSave = SketchResult & { caption: string; kind?: string };

/** رسمة التعديل: تنحفظ مع ملفات الطلب لكن ما تظهر مع التصميم ولا المرفقات */
export const ALTERATION_SKETCH_KIND = "alteration";

/** رسمات حجوزات الإيجار: في مخزن صور المخزون (ملفات الطلبات مربوطة برقم طلب) */
export const RENTAL_SKETCH_BUCKET = "inventory";

export async function loadSketchDoc(pngPath: string, bucket = BUCKET): Promise<SketchDoc> {
  const { data, error } = await supabase.storage.from(bucket).download(docPathOf(pngPath));
  if (error || !data) return parseSketch(null);
  try {
    return parseSketch(JSON.parse(await data.text()));
  } catch {
    return parseSketch(null);
  }
}

export function useSketchDoc(pngPath: string | null | undefined, bucket = BUCKET) {
  return useQuery({
    queryKey: ["sketch-doc", bucket, pngPath],
    enabled: Boolean(pngPath),
    staleTime: Infinity,
    queryFn: () => loadSketchDoc(pngPath!, bucket),
  });
}

const safeName = (name: string) => name.replace(/[^\w.-]/g, "_");

/** يرفع صفحات الرسمة وملفها وصورها المرفقة داخل المجلد، ويرجع مسار الصفحة الأولى */
async function uploadSketch(
  bucket: string,
  folder: string,
  { doc, pngs, files }: SketchResult,
): Promise<{ mainPng: string; uploaded: string[] }> {
  const mainPng = `${folder}/sketch-${newId()}.png`;
  const uploaded: string[] = [];

  const put = async (path: string, body: Blob, contentType: string) => {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
    if (error) throw error;
    uploaded.push(path);
  };

  try {
    const attachments = [...doc.attachments];
    for (const { name, file } of files) {
      const path = `${folder}/sketch-att-${newId()}-${safeName(name)}`;
      await put(path, file, file.type || "application/octet-stream");
      attachments.push({ path, name });
    }

    const finalDoc: SketchDoc = { ...doc, attachments };
    await put(
      docPathOf(mainPng),
      new Blob([JSON.stringify(finalDoc)], { type: "application/json" }),
      "application/json",
    );
    for (const [i, png] of pngs.entries()) await put(pagePngPath(mainPng, i), png, "image/png");
  } catch (err) {
    if (uploaded.length) await supabase.storage.from(bucket).remove(uploaded);
    throw err;
  }
  return { mainPng, uploaded };
}

/** يرجع مسار صورة الصفحة الأولى */
export async function saveSketch(
  orderId: string,
  { caption, kind = SKETCH_KIND, ...result }: SketchSave,
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const { mainPng, uploaded } = await uploadSketch(BUCKET, orderId, result);
  const { error } = await supabase.from("order_files").insert({
    order_id: orderId,
    storage_path: mainPng,
    kind,
    caption,
    created_by: userData.user?.id ?? null,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove(uploaded);
    throw error;
  }
  return mainPng;
}

/** رسمة حجز الإيجار (كل حفظ نسخة جديدة)، ويرجع مسار الصفحة الأولى */
export async function saveRentalSketch(dressId: string, result: SketchResult): Promise<string> {
  const { mainPng } = await uploadSketch(
    RENTAL_SKETCH_BUCKET,
    `rental-sketches/${dressId}`,
    result,
  );
  return mainPng;
}

export function useSaveSketch(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SketchSave) => {
      await saveSketch(orderId, args);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files", orderId] }),
  });
}

/* ===== مكتبة رسمات الجسم (صور يرفعها المدير أو المشرف) ===== */

// المكتبة في مخزن الصور: القراءة للفريق، والرفع والتعديل للمدير والمشرف
const LIBRARY_BUCKET = "inventory";
const LIBRARY_DIR = "body-templates";
const LIBRARY_INDEX = `${LIBRARY_DIR}/index.json`;
const libraryKey = ["body-library"] as const;

async function readLibrary(): Promise<BodyImage[]> {
  const { data, error } = await supabase.storage.from(LIBRARY_BUCKET).download(LIBRARY_INDEX);
  if (error || !data) return [];
  try {
    const list = JSON.parse(await data.text()) as unknown;
    return Array.isArray(list) ? (list as BodyImage[]) : [];
  } catch {
    return [];
  }
}

async function writeLibrary(list: BodyImage[]) {
  const { error } = await supabase.storage
    .from(LIBRARY_BUCKET)
    .upload(LIBRARY_INDEX, new Blob([JSON.stringify(list)], { type: "application/json" }), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) throw error;
}

export function useBodyLibrary() {
  return useQuery({ queryKey: libraryKey, queryFn: readLibrary, staleTime: 60_000 });
}

/** يصغّر الصورة (الجوال يصوّر بحجم كبير) ويحافظ على الشفافية في PNG */
async function shrinkImage(file: File, max = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      img.src = url;
    });
    const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    const png = file.type === "image/png";
    if (!png) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("تعذر تجهيز الصورة"))),
        png ? "image/png" : "image/jpeg",
        0.9,
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useAddBodyImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, label }: { file: File; label: string }) => {
      const blob = await shrinkImage(file);
      const ext = blob.type === "image/png" ? "png" : "jpg";
      const item: BodyImage = {
        id: newId(),
        label: label.trim() || "رسمة جسم",
        path: `${LIBRARY_DIR}/${newId()}.${ext}`,
      };
      const up = await supabase.storage
        .from(LIBRARY_BUCKET)
        .upload(item.path, blob, { contentType: blob.type });
      if (up.error) throw up.error;
      await writeLibrary([...(await readLibrary()), item]);
      return item;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKey }),
  });
}

/** يشيل الرسمة من المكتبة فقط — التصاميم المحفوظة عليها تبقى كما هي */
export function useRemoveBodyImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await writeLibrary((await readLibrary()).filter((i) => i.id !== id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKey }),
  });
}

export function useLibraryUrls(paths: string[]) {
  const key = paths.join("|");
  return useQuery({
    queryKey: ["body-library-urls", key],
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from(LIBRARY_BUCKET).createSignedUrls(paths, 3600);
      const out: Record<string, string> = {};
      (data ?? []).forEach((r) => {
        if (r.path && r.signedUrl) out[r.path] = r.signedUrl;
      });
      return out;
    },
  });
}

/**
 * الرسمة كـ data URL: لازم تكون مضمّنة داخل الـ SVG
 * حتى تظهر عند تحويل الصفحة إلى صورة PNG
 */
export function useBodyImageData(path: string | undefined) {
  return useQuery({
    queryKey: ["body-image-data", path],
    enabled: Boolean(path),
    staleTime: Infinity,
    queryFn: async () => {
      let data: Blob | null = null;
      if (isBuiltinPath(path!)) {
        // الرسمات الجاهزة موجودة مع التطبيق نفسه
        const res = await fetch(path!);
        if (!res.ok) throw new Error("تعذر تحميل رسمة الجسم");
        data = await res.blob();
      } else {
        const dl = await supabase.storage.from(LIBRARY_BUCKET).download(path!);
        if (dl.error || !dl.data) throw dl.error ?? new Error("تعذر تحميل رسمة الجسم");
        data = dl.data;
      }
      const blob = data;
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("تعذر تحميل رسمة الجسم"));
        reader.readAsDataURL(blob);
      });
    },
  });
}
