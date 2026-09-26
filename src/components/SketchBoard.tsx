import {
  Camera,
  Eraser,
  FilePlus2,
  ImagePlus,
  Link2,
  Lock,
  LockOpen,
  Move,
  Paperclip,
  PenLine,
  Redo2,
  Ruler,
  Shirt,
  Trash2,
  Type,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Btn } from "@/components/kit";
import { MeasuresPanel } from "@/components/MeasuresPanel";
import type { Order } from "@/lib/atelier";
import { useSignedUrls } from "@/lib/data";
import {
  GUIDE_COLOR,
  INK_COLORS,
  PEN_SIZES,
  SKETCH_H,
  SKETCH_W,
  eraseItems,
  hitsItem,
  isTemplateItem,
  linePath,
  newImagePage,
  newPage,
  normalizeUrl,
  strokePath,
  svgToPng,
  swapToImage,
  translateItem,
  type BodyImage,
  type SketchDoc,
  type SketchItem,
  type SketchLink,
  type SketchPage,
  type SketchPoint,
  type SketchStroke,
} from "@/lib/sketch";
import {
  useAddBodyImage,
  useBodyImageData,
  useBodyLibrary,
  useLibraryUrls,
  useRemoveBodyImage,
  type SketchResult,
} from "@/lib/sketch-data";
import { useCurrentAccount } from "@/hooks/useSession";
import { BUILTIN_BODIES, FB, FRONT_BACK_ID, fbToPage } from "@/lib/body";
import { cn, newId } from "@/lib/utils";

type Tool = "pen" | "eraser" | "move" | "note";

type BoardAttachment = { key: string; name: string; path?: string; file?: File; preview?: string };

type SketchOrder = Pick<Order, "client_name" | "order_no" | "measurements">;

const FONT = "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";

export function SketchBoard({
  order,
  initial,
  initialFiles = [],
  onMeasuresChange,
  onClose,
  onSave,
  bucket,
}: {
  order: SketchOrder;
  initial: SketchDoc;
  /** صور أُضيفت سابقًا ولم تُرفع بعد (في الطلب الجديد قبل حفظه) */
  initialFiles?: SketchResult["files"];
  /** بدونها تُعرض المقاسات بجانب الرسمة للقراءة فقط */
  onMeasuresChange?: (next: Record<string, string>) => void;
  onClose: () => void;
  onSave: (result: SketchResult) => Promise<void>;
  /** مخزن الصور المرفقة المحفوظة (ملفات الطلبات افتراضيًا) */
  bucket?: string;
}) {
  const svgRefs = useRef(new Map<string, SVGSVGElement>());
  const [pages, setPages] = useState<SketchPage[]>(initial.pages);
  const [pageIdx, setPageIdx] = useState(0);
  const [past, setPast] = useState<SketchPage[][]>([]);
  const [future, setFuture] = useState<SketchPage[][]>([]);
  const [draft, setDraft] = useState<SketchStroke | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(INK_COLORS[0].value);
  const [size, setSize] = useState<number>(PEN_SIZES[1].value);
  const [noteAt, setNoteAt] = useState<{ x: number; y: number } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  // المقاسات بجانب الرسمة: مفتوحة من البداية على الشاشات العريضة (آيباد بالعرض)
  const [measuresOpen, setMeasuresOpen] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches,
  );
  const [picker, setPicker] = useState<"add" | "swap" | null>(null);
  // رسمة الجسم مقفولة: الممحاة والتحريك يعملان على رسم المستخدم فقط
  const [bodyUnlocked, setBodyUnlocked] = useState(false);
  const [attachments, setAttachments] = useState<BoardAttachment[]>(() => [
    ...initial.attachments.map((a) => ({ key: a.path, name: a.name, path: a.path })),
    ...initialFiles.map(({ name, file }) => ({
      key: newId(),
      name,
      file,
      preview: URL.createObjectURL(file),
    })),
  ]);
  const [links, setLinks] = useState<SketchLink[]>(initial.links);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const penSeen = useRef(false);
  const activePointer = useRef<number | null>(null);
  const moving = useRef<{ id: string; orig: SketchItem; start: SketchPoint } | null>(null);

  const page = pages[Math.min(pageIdx, pages.length - 1)] ?? pages[0]!;

  /** يسجّل الحالة الحالية في سجل التراجع ثم يطبّق التغيير */
  const snapshot = () => {
    setPast((p) => [...p, pages]);
    setFuture([]);
    setDirty(true);
  };
  const commit = (next: SketchPage[]) => {
    snapshot();
    setPages(next);
  };
  const mapItems = (fn: (items: SketchItem[]) => SketchItem[]) =>
    setPages((cur) => cur.map((p) => (p.id === page.id ? { ...p, items: fn(p.items) } : p)));
  const withItems = (items: SketchItem[]) =>
    pages.map((p) => (p.id === page.id ? { ...p, items } : p));

  const undo = () => {
    const prev = past.at(-1);
    if (!prev) return;
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [pages, ...f]);
    setPages(prev);
    setDirty(true);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((f) => f.slice(1));
    setPast((p) => [...p, pages]);
    setPages(next);
    setDirty(true);
  };

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(
    () => () => attachments.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function toPoint(e: React.PointerEvent | PointerEvent): SketchPoint {
    const svg = svgRefs.current.get(page.id);
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0, 0.5];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return [p.x, p.y, pressure];
  }

  function eraseAt([x, y]: SketchPoint) {
    mapItems((items) => eraseItems(items, x, y, 14, bodyUnlocked));
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.pointerType === "pen") penSeen.current = true;
    // عند استخدام القلم نتجاهل لمس كف اليد
    if (penSeen.current && e.pointerType === "touch") return;
    if (activePointer.current !== null) return;

    const pt = toPoint(e);
    if (tool === "note") {
      setNoteAt({ x: pt[0], y: pt[1] });
      setNoteText("");
      return;
    }

    if (tool === "move") {
      const hit = [...page.items]
        .reverse()
        .find((it) => (bodyUnlocked || !isTemplateItem(it)) && hitsItem(it, pt[0], pt[1], 18));
      if (!hit) return;
      snapshot();
      moving.current = { id: hit.id, orig: hit, start: pt };
    } else if (tool === "eraser") {
      snapshot();
      eraseAt(pt);
    } else {
      setDraft({
        type: "stroke",
        id: newId(),
        color,
        size,
        pen: e.pointerType === "pen",
        points: [pt],
      });
    }

    activePointer.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== e.pointerId) return;
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
    const pts = (events.length ? events : [e.nativeEvent]).map((ev) => toPoint(ev));

    if (tool === "move") {
      const m = moving.current;
      const last = pts.at(-1);
      if (!m || !last) return;
      const moved = translateItem(m.orig, last[0] - m.start[0], last[1] - m.start[1]);
      mapItems((items) => items.map((it) => (it.id === m.id ? moved : it)));
      return;
    }
    if (tool === "eraser") {
      pts.forEach(eraseAt);
      return;
    }
    setDraft((d) => (d ? { ...d, points: [...d.points, ...pts] } : d));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    moving.current = null;
    if (draft && draft.points.length > 0) commit(withItems([...page.items, draft]));
    setDraft(null);
  }

  function addNote() {
    const text = noteText.trim();
    if (noteAt && text) {
      commit(
        withItems([
          ...page.items,
          { type: "note", id: newId(), color, x: noteAt.x, y: noteAt.y, text },
        ]),
      );
    }
    setNoteAt(null);
    setNoteText("");
  }

  function addBlankPage() {
    commit([...pages, newPage()]);
    setPageIdx(pages.length);
  }

  /** اختيار رسمة جسم: لصفحة جديدة، أو لتبديل رسمة الصفحة الحالية مع إبقاء الرسم */
  function pickBody(image: BodyImage) {
    if (picker === "add") {
      commit([...pages, newImagePage(image)]);
      setPageIdx(pages.length);
    } else {
      commit(pages.map((p) => (p.id === page.id ? swapToImage(p, image) : p)));
    }
    setPicker(null);
  }

  function deletePage() {
    if (pages.length < 2) return;
    if (!window.confirm("حذف هذه الصفحة؟ يمكن التراجع بعدها.")) return;
    commit(pages.filter((p) => p.id !== page.id));
    setPageIdx((i) => Math.max(0, Math.min(i, pages.length - 2)));
  }

  function addFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    setAttachments((cur) => [
      ...cur,
      ...files.map((file) => ({
        key: newId(),
        name: file.name || "صورة.jpg",
        file,
        preview: URL.createObjectURL(file),
      })),
    ]);
    setDirty(true);
  }

  function removeAttachment(key: string) {
    setAttachments((cur) => {
      const hit = cur.find((a) => a.key === key);
      if (hit?.preview) URL.revokeObjectURL(hit.preview);
      return cur.filter((a) => a.key !== key);
    });
    setDirty(true);
  }

  function close() {
    if (dirty && !window.confirm("لم تُحفظ الرسمة. هل تريد الخروج بدون حفظ؟")) return;
    onClose();
  }

  async function save() {
    setBusy(true);
    try {
      const pngs: Blob[] = [];
      for (const p of pages) {
        const svg = svgRefs.current.get(p.id);
        if (!svg) throw new Error("تعذر تجهيز صفحات التصميم");
        if (svg.querySelector("[data-loading]")) {
          throw new Error("رسمة الجسم ما زالت تتحمّل، انتظر لحظة ثم احفظ");
        }
        pngs.push(await svgToPng(svg));
      }
      await onSave({
        doc: {
          version: 2,
          pages,
          attachments: attachments.flatMap((a) => (a.path ? [{ path: a.path, name: a.name }] : [])),
          links,
        },
        pngs,
        files: attachments.flatMap((a) => (a.file ? [{ name: a.name, file: a.file }] : [])),
      });
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر حفظ الرسمة");
    } finally {
      setBusy(false);
    }
  }

  const extras = attachments.length + links.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ivory" dir="rtl">
      {/* الأدوات */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
        <ToolBtn label="إغلاق" onClick={close}>
          <X className="size-5" />
        </ToolBtn>
        <Sep />
        <ToolBtn label="قلم" active={tool === "pen"} onClick={() => setTool("pen")}>
          <PenLine className="size-5" />
        </ToolBtn>
        <ToolBtn label="ممحاة" active={tool === "eraser"} onClick={() => setTool("eraser")}>
          <Eraser className="size-5" />
        </ToolBtn>
        <ToolBtn label="تحريك" active={tool === "move"} onClick={() => setTool("move")}>
          <Move className="size-5" />
        </ToolBtn>
        <ToolBtn label="ملاحظة" active={tool === "note"} onClick={() => setTool("note")}>
          <Type className="size-5" />
        </ToolBtn>
        <Sep />
        {INK_COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-label={c.label}
            title={c.label}
            onClick={() => {
              setColor(c.value);
              if (tool === "eraser" || tool === "move") setTool("pen");
            }}
            className={cn(
              "size-9 rounded-full border-2 transition",
              color === c.value ? "scale-110 border-ink" : "border-transparent",
            )}
          >
            <span className="mx-auto block size-6 rounded-full" style={{ background: c.value }} />
          </button>
        ))}
        <Sep />
        {PEN_SIZES.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-label={s.label}
            title={s.label}
            onClick={() => setSize(s.value)}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              size === s.value ? "bg-ivory ring-1 ring-line" : "",
            )}
          >
            <span
              className="rounded-full bg-ink"
              style={{ width: s.value + 2, height: s.value + 2 }}
            />
          </button>
        ))}
        <Sep />
        <ToolBtn label="تراجع" disabled={past.length === 0} onClick={undo}>
          <Undo2 className="size-5" />
        </ToolBtn>
        <ToolBtn label="إعادة" disabled={future.length === 0} onClick={redo}>
          <Redo2 className="size-5" />
        </ToolBtn>
        <Sep />
        <ToolBtn
          label="المقاسات"
          active={measuresOpen}
          onClick={() => setMeasuresOpen((v) => !v)}
        >
          <Ruler className="size-5" />
        </ToolBtn>
        <ToolBtn
          label="المرفقات والروابط"
          active={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="relative">
            <Paperclip className="size-5" />
            {extras > 0 && (
              <span className="absolute -top-2 -left-2 flex size-4 items-center justify-center rounded-full bg-gold text-[10px] text-paper">
                {extras}
              </span>
            )}
          </span>
        </ToolBtn>

        <Btn variant="gold" className="ms-auto" disabled={busy} onClick={save}>
          {busy ? "جاري الحفظ…" : "حفظ التصميم"}
        </Btn>
      </div>

      {/* الصفحات */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-line bg-paper px-3 py-1.5 text-[12px]">
        {pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPageIdx(i)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5",
              p.id === page.id ? "bg-ink text-paper" : "border border-line hover:bg-ivory",
            )}
          >
            صفحة {i + 1}
            {p.kind === "blank" ? " · فاضية" : ""}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPicker("add")}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-gold"
        >
          <UserRound className="size-3.5" /> رسمة جسم
        </button>
        <button
          type="button"
          onClick={addBlankPage}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-gold"
        >
          <FilePlus2 className="size-3.5" /> ورقة فاضية
        </button>
        <span className="ms-auto" />
        {page.items.some(isTemplateItem) && (
          <button
            type="button"
            onClick={() => setBodyUnlocked((v) => !v)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5",
              bodyUnlocked ? "bg-gold text-paper" : "text-muted-foreground",
            )}
            title={
              bodyUnlocked
                ? "الممحاة والتحريك تعدّل رسمة الجسم الآن"
                : "رسمة الجسم مقفولة: الممحاة تمسح رسمك فقط"
            }
          >
            {bodyUnlocked ? (
              <>
                <LockOpen className="size-3.5" /> إنهاء تعديل الفستان
              </>
            ) : (
              <>
                <Lock className="size-3.5" /> تعديل خطوط الفستان
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPicker("swap")}
          className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-muted-foreground"
        >
          <Shirt className="size-3.5" />
          {page.kind === "image" && page.image
            ? `رسمة الجسم: ${page.image.label}`
            : "إضافة رسمة جسم لهذه الصفحة"}
        </button>
        {pages.length > 1 && (
          <button
            type="button"
            onClick={deletePage}
            className="flex shrink-0 items-center gap-1 px-2 py-1.5 text-muted-foreground"
          >
            <Trash2 className="size-3.5" /> حذف الصفحة
          </button>
        )}
      </div>

      {noteAt && (
        <div className="flex items-center gap-2 border-b border-line bg-paper px-3 py-2">
          <input
            autoFocus
            className="field flex-1"
            placeholder="اكتب الملاحظة، مثل: تطريز هنا"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addNote();
              if (e.key === "Escape") setNoteAt(null);
            }}
          />
          <Btn onClick={addNote}>إضافة</Btn>
          <Btn variant="quiet" onClick={() => setNoteAt(null)}>
            إلغاء
          </Btn>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          {/* كل الصفحات موجودة في الصفحة (المخفية للحفظ فقط) */}
          {pages.map((p) => (
            <div
              key={p.id}
              className={cn("absolute inset-0 p-2 sm:p-4", p.id !== page.id && "invisible")}
            >
              <svg
                ref={(el) => {
                  if (el) svgRefs.current.set(p.id, el);
                  else svgRefs.current.delete(p.id);
                }}
                viewBox={`0 0 ${SKETCH_W} ${SKETCH_H}`}
                preserveAspectRatio="xMidYMid meet"
                className="mx-auto block size-full select-none"
                style={{ touchAction: "none", WebkitTouchCallout: "none" } as React.CSSProperties}
                {...(p.id === page.id
                  ? {
                      onPointerDown,
                      onPointerMove,
                      onPointerUp,
                      onPointerCancel: onPointerUp,
                    }
                  : {})}
              >
                <rect width={SKETCH_W} height={SKETCH_H} fill="#ffffff" />
                <PageHeader order={order} />
                {p.kind === "image" && p.image && p.image.id === FRONT_BACK_ID && (
                  <>
                    <FrontBackBackground image={p.image} />
                    <FrontBackTitles />
                  </>
                )}
                {p.kind === "image" && p.image && p.image.id !== FRONT_BACK_ID && (
                  <ImageBackground image={p.image} />
                )}
                {p.items.map((it) => (
                  <ItemView key={it.id} item={it} />
                ))}
                {p.id === page.id && draft && <ItemView item={draft} />}
              </svg>
            </div>
          ))}

          {picker && (
            <TemplatePicker
              {...(picker === "swap" && page.image ? { current: page.image.id } : {})}
              onPick={pickBody}
              onClose={() => setPicker(null)}
            />
          )}

          {panelOpen && (
            <ExtrasPanel
              attachments={attachments}
              {...(bucket ? { bucket } : {})}
              links={links}
              onAddFiles={addFiles}
              onRemoveAttachment={removeAttachment}
              onAddLink={(link) => {
                setLinks((cur) => [...cur, link]);
                setDirty(true);
              }}
              onRemoveLink={(id) => {
                setLinks((cur) => cur.filter((l) => l.id !== id));
                setDirty(true);
              }}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>

        {measuresOpen && (
          <MeasuresPanel
            measures={(order.measurements ?? {}) as Record<string, unknown>}
            onChange={onMeasuresChange}
            onClose={() => setMeasuresOpen(false)}
            className="absolute inset-y-0 end-0 z-20 border-s shadow-xl lg:static lg:z-auto lg:shadow-none"
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

function Sep() {
  return <span className="mx-1 h-6 w-px bg-line" />;
}

function ToolBtn({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-10 items-center justify-center rounded-lg text-ink transition disabled:opacity-30",
        active ? "bg-ink text-paper" : "hover:bg-ivory",
      )}
    >
      {children}
    </button>
  );
}

function ItemView({ item }: { item: SketchItem }) {
  if (item.type === "note") {
    return (
      <text
        x={item.x}
        y={item.y}
        fill={item.color}
        fontSize={28}
        fontFamily={FONT}
        fontWeight={600}
        textAnchor="middle"
        direction="rtl"
      >
        {item.text}
      </text>
    );
  }
  if (item.type === "line") {
    return (
      <path
        d={item.fill ? `${linePath(item.points)} Z` : linePath(item.points)}
        fill={item.fill ?? "none"}
        stroke={item.color}
        strokeWidth={item.width}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...(item.dash ? { strokeDasharray: item.dash } : {})}
      />
    );
  }
  return <path d={strokePath(item)} fill={item.color} />;
}

/* ===== المرفقات والروابط ===== */

function ExtrasPanel({
  attachments,
  bucket,
  links,
  onAddFiles,
  onRemoveAttachment,
  onAddLink,
  onRemoveLink,
  onClose,
}: {
  attachments: BoardAttachment[];
  bucket?: string;
  links: SketchLink[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveAttachment: (key: string) => void;
  onAddLink: (link: SketchLink) => void;
  onRemoveLink: (id: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const storedPaths = useMemo(
    () => attachments.flatMap((a) => (a.path ? [a.path] : [])),
    [attachments],
  );
  const signed = useSignedUrls(storedPaths, bucket);

  function addLink() {
    const clean = normalizeUrl(url);
    if (!clean) {
      toast.error("الرابط غير صحيح");
      return;
    }
    onAddLink({ id: newId(), url: clean, title: title.trim() });
    setUrl("");
    setTitle("");
  }

  return (
    <aside className="absolute inset-y-0 start-0 z-10 flex w-full max-w-sm flex-col overflow-y-auto border-e border-line bg-paper shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[14px] font-bold">المرفقات والروابط</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="text-muted-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <section className="space-y-3 border-b border-line px-4 py-4">
        <p className="text-[13px] font-medium">الصور</p>
        <div className="flex gap-2">
          <label className="btn-quiet flex flex-1 cursor-pointer items-center justify-center gap-2">
            <ImagePlus className="size-4" /> رفع صور
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className="btn-quiet flex flex-1 cursor-pointer items-center justify-center gap-2">
            <Camera className="size-4" /> الكاميرا
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                onAddFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {attachments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            صور مرجعية للتصميم، مثل فستان أعجب العميلة أو صورة الخامة.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {attachments.map((a) => {
              const src = a.preview ?? (a.path ? signed[a.path] : undefined);
              return (
                <div
                  key={a.key}
                  className="relative aspect-square overflow-hidden rounded-lg border border-line bg-ivory"
                >
                  {src && <img src={src} alt={a.name} className="size-full object-cover" />}
                  <button
                    type="button"
                    aria-label="حذف الصورة"
                    onClick={() => onRemoveAttachment(a.key)}
                    className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full bg-ink/70 text-paper"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 px-4 py-4">
        <p className="text-[13px] font-medium">الروابط</p>
        <input
          className="field"
          dir="ltr"
          inputMode="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addLink()}
        />
        <div className="flex gap-2">
          <input
            className="field flex-1"
            placeholder="وصف (اختياري)، مثل: موديل من إنستقرام"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
          />
          <Btn type="button" onClick={addLink}>
            إضافة
          </Btn>
        </div>
        {links.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {links.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                <Link2 className="size-4 shrink-0 text-gold" />
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-[12.5px] text-gold"
                  dir={l.title ? "rtl" : "ltr"}
                >
                  {l.title || l.url}
                </a>
                <button
                  type="button"
                  aria-label="حذف الرابط"
                  onClick={() => onRemoveLink(l.id)}
                  className="text-muted-foreground"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

/* ===== اسم العميلة ورقم الطلب على الصفحة ===== */

function PageHeader({ order }: { order: SketchOrder }) {
  return (
    <g>
      <text
        x={SKETCH_W - 30}
        y={46}
        fill="#2e2a24"
        fontSize={26}
        fontFamily={FONT}
        fontWeight={700}
        textAnchor="start"
        direction="rtl"
      >
        {order.client_name}
      </text>
      <text x={30} y={46} fill={GUIDE_COLOR} fontSize={22} fontFamily={FONT} textAnchor="start">
        {order.order_no}
      </text>
    </g>
  );
}

/** عنوانا «أمام» و«خلف» تحت رسمتي صفحة «أمام وخلف» */
function FrontBackTitles() {
  const [frontX] = fbToPage("front", 0, 0);
  const [backX] = fbToPage("back", 0, 0);
  const [, titleY] = fbToPage("front", 0, 1060);
  return (
    <g>
      {[
        [frontX, "أمام"],
        [backX, "خلف"],
      ].map(([x, t]) => (
        <text
          key={t}
          x={x}
          y={Math.min(1392, titleY)}
          fill={GUIDE_COLOR}
          fontSize={24}
          fontFamily={FONT}
          textAnchor="middle"
        >
          {t}
        </text>
      ))}
    </g>
  );
}

/* ===== اختيار رسمة الجسم ===== */

function TemplatePicker({
  current,
  onPick,
  onClose,
}: {
  current?: string;
  onPick: (image: BodyImage) => void;
  onClose: () => void;
}) {
  const { can } = useCurrentAccount();
  const isManager = can("catalog.manage");
  const { data: library = [], isLoading } = useBodyLibrary();
  const { data: urls = {} } = useLibraryUrls(library.map((i) => i.path));
  const add = useAddBodyImage();
  const remove = useRemoveBodyImage();
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");

  const card = (active: boolean) =>
    cn(
      "overflow-hidden rounded-xl border bg-white text-center transition hover:border-gold",
      active ? "border-gold ring-2 ring-gold/40" : "border-line",
    );
  const thumb = (src: string | undefined, alt: string) => (
    <div className="flex aspect-[5/7] items-center justify-center bg-white p-2">
      {src && <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />}
    </div>
  );

  async function upload() {
    if (!file) return;
    try {
      const item = await add.mutateAsync({ file, label });
      toast.success("تمت إضافة الرسمة للمكتبة");
      setFile(null);
      setLabel("");
      onPick(item);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر رفع الرسمة");
    }
  }

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-line bg-paper">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="text-[14px] font-bold">اختيار رسمة الجسم</p>
            <p className="text-[11px] text-muted-foreground">رسمك على الصفحة يبقى كما هو.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="text-muted-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* الرسمات الجاهزة */}
        <section className="border-b border-line px-4 py-4">
          <p className="mb-3 text-[13px] font-medium">رسمات جاهزة</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BUILTIN_BODIES.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onPick(img)}
                className={card(img.id === current)}
              >
                {thumb(img.path, img.label)}
                <p className="border-t border-line px-2 py-2 text-[12px]">{img.label}</p>
              </button>
            ))}
          </div>
        </section>

        {/* رسمات المكتبة المرفوعة */}
        <section className="px-4 py-4">
          <p className="mb-3 text-[13px] font-medium">رسماتنا</p>
          {isLoading ? (
            <p className="text-[12px] text-muted-foreground">جاري التحميل…</p>
          ) : library.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              {isManager
                ? "ارفع رسمات جسم إضافية (مثل صورة النموذج الورقي) وتظهر هنا لكل الفريق."
                : "ما فيه رسمات مرفوعة بعد. يضيفها من يملك صلاحية الموديلات والكتالوج."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {library.map((img) => (
                <div key={img.id} className="relative">
                  <button
                    type="button"
                    onClick={() => onPick(img)}
                    className={cn(card(img.id === current), "w-full")}
                  >
                    {thumb(urls[img.path], img.label)}
                    <p className="border-t border-line px-2 py-2 text-[12px]">{img.label}</p>
                  </button>
                  {isManager && (
                    <button
                      type="button"
                      aria-label="حذف من المكتبة"
                      title="حذف من المكتبة (التصاميم المحفوظة ما تتأثر)"
                      onClick={() => {
                        if (window.confirm(`حذف «${img.label}» من المكتبة؟`)) remove.mutate(img.id);
                      }}
                      className="absolute top-1.5 left-1.5 flex size-7 items-center justify-center rounded-full bg-ink/70 text-paper"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {isManager && (
            <div className="mt-4 space-y-2 rounded-xl border border-dashed border-line p-3">
              <p className="text-[12px] font-medium">إضافة رسمة للمكتبة</p>
              <div className="flex flex-wrap gap-2">
                <label className="btn-quiet flex cursor-pointer items-center gap-2">
                  <ImagePlus className="size-4" /> اختيار صورة
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                <label className="btn-quiet flex cursor-pointer items-center gap-2">
                  <Camera className="size-4" /> تصوير النموذج الورقي
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      setFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              {file && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] text-muted-foreground">{file.name}</span>
                  <input
                    className="field min-w-40 flex-1"
                    placeholder="اسم الرسمة، مثل: نموذج المشغل"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  />
                  <Btn type="button" variant="gold" disabled={add.isPending} onClick={upload}>
                    {add.isPending ? "جاري الرفع…" : "إضافة"}
                  </Btn>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ===== صفحة برسمة مرفوعة ===== */

const IMAGE_BOX = { x: 40, y: 70, w: SKETCH_W - 80, h: 1280 };

function ImageBackground({ image }: { image: BodyImage }) {
  const { data, isError } = useBodyImageData(image.path);
  if (isError) {
    return (
      <text
        x={SKETCH_W / 2}
        y={SKETCH_H / 2}
        fill={GUIDE_COLOR}
        fontSize={26}
        fontFamily={FONT}
        textAnchor="middle"
      >
        تعذر تحميل رسمة الجسم
      </text>
    );
  }
  if (!data) {
    return (
      <text
        data-loading="true"
        x={SKETCH_W / 2}
        y={SKETCH_H / 2}
        fill={GUIDE_COLOR}
        fontSize={26}
        fontFamily={FONT}
        textAnchor="middle"
      >
        جاري تحميل رسمة الجسم…
      </text>
    );
  }
  return (
    <image
      href={data}
      x={IMAGE_BOX.x}
      y={IMAGE_BOX.y}
      width={IMAGE_BOX.w}
      height={IMAGE_BOX.h}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}

/** صورة «أمام وخلف» مقسومة لرسمتين مع مسافة بينهما حتى ما تتداخل التنانير */
function FrontBackBackground({ image }: { image: BodyImage }) {
  const { data, isError } = useBodyImageData(image.path);
  if (!data) {
    return (
      <text
        {...(isError ? {} : { "data-loading": "true" })}
        x={SKETCH_W / 2}
        y={SKETCH_H / 2}
        fill={GUIDE_COLOR}
        fontSize={26}
        fontFamily={FONT}
        textAnchor="middle"
      >
        {isError ? "تعذر تحميل رسمة الجسم" : "جاري تحميل رسمة الجسم…"}
      </text>
    );
  }
  return (
    <>
      {[FB.front, FB.back].map((f) => (
        <svg
          key={f.cropX}
          x={f.pageX}
          y={FB.pageY}
          width={f.cropW * FB.scale}
          height={FB.cropH * FB.scale}
          viewBox={`${f.cropX} ${FB.cropY} ${f.cropW} ${FB.cropH}`}
          preserveAspectRatio="none"
        >
          <image href={data} x={0} y={0} width={FB.imgW} height={FB.imgH} />
        </svg>
      ))}
    </>
  );
}
