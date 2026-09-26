import { createFileRoute, Link } from "@tanstack/react-router";

import { Btn, Empty } from "@/components/kit";
import { useItemTypes, useOrder, useOrderFiles, useSignedUrls } from "@/lib/data";
import { useMaterials, useOrderMaterials } from "@/lib/inventory-data";
import { qty } from "@/lib/inventory";
import { useModel } from "@/lib/models-data";
import { SKETCH_KIND, pagePngPath } from "@/lib/sketch";
import { useSketchDoc } from "@/lib/sketch-data";
import {
  MEASUREMENT_FIELDS,
  fmtDate,
  isCustomMeasurement,
  itemTypeLabel,
  measurementLabel,
  type Order,
} from "@/lib/atelier";

/**
 * بطاقة تشغيل المعمل: ورقة A4 تمشي مع الفستان.
 * فيها ما يحتاجه المعمل فقط (بدون أسعار ولا جوال العميلة)، والرسمة بأكبر مساحة ممكنة.
 */
export const Route = createFileRoute("/_authenticated/orders/$orderId_/print")({
  head: () => ({ meta: [{ title: "بطاقة تشغيل · مَعْمَل" }] }),
  component: PrintOrderPage,
});

/** أقرب موعد قادم (بروفة أو تسليم)، وإلا موعد التسليم */
function nextDeadline(order: Order): { label: string; date: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  const dates = [
    { label: "البروفة الأولى", date: order.fitting1_date },
    { label: "البروفة الثانية", date: order.fitting2_date },
    { label: "التسليم", date: order.due_date },
  ].flatMap((d) => (d.date ? [{ label: d.label, date: d.date }] : []));
  const upcoming = dates
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? dates.find((d) => d.label === "التسليم") ?? null;
}

function PrintOrderPage() {
  const { orderId } = Route.useParams();
  const { data: order, isLoading } = useOrder(orderId);
  const { data: files = [] } = useOrderFiles(orderId);
  const { data: rows = [] } = useOrderMaterials(orderId);
  const { data: materials = [] } = useMaterials();
  const { data: model } = useModel(order?.model_id ?? "");
  useItemTypes();

  // آخر تصميم محفوظ (الملفات مرتبة من الأحدث)
  const sketch = files.find((f) => f.kind === SKETCH_KIND) ?? null;
  const { data: doc } = useSketchDoc(sketch?.storage_path);
  const pagePaths = sketch
    ? (doc?.pages ?? [null]).map((_, i) => pagePngPath(sketch.storage_path, i))
    : [];
  const urls = useSignedUrls(pagePaths);

  if (isLoading) return <Empty>جاري التحميل…</Empty>;
  if (!order) return <Empty>الطلب غير موجود.</Empty>;

  const m = (order.measurements ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
  const measures = [
    ...MEASUREMENT_FIELDS.map(([key]) => key as string),
    ...Object.keys(m).filter(isCustomMeasurement),
  ].flatMap((key) => (text(m[key]) ? [{ label: measurementLabel(key), value: text(m[key]) }] : []));

  const materialLines = rows.length
    ? rows.map((r) => {
        const mat = materials.find((x) => x.id === r.material_id);
        const amount = Number(r.qty_reserved) + Number(r.qty_issued);
        return `${mat?.name ?? "مادة"} · ${qty(amount)} ${mat?.unit ?? ""}`.trim();
      })
    : order.materials
      ? [order.materials]
      : [];

  const client =
    order.order_kind === "rental_stock"
      ? "مخزون الإيجار"
      : order.client_name.trim().split(/\s+/)[0];
  const deadline = nextDeadline(order);
  const modelText = model ? model.code : order.is_new_model ? "موديل جديد" : order.model_no || "—";

  return (
    <div className="min-h-screen bg-ivory py-4 print:min-h-0 print:bg-white print:py-0">
      <style>{`@page { size: A4 portrait; margin: 8mm; }`}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-4 print:hidden">
        <Link to="/orders/$orderId" params={{ orderId }} className="text-[13px] text-gold">
          رجوع للطلب
        </Link>
        <Btn onClick={() => window.print()}>طباعة</Btn>
      </div>

      <div className="overflow-x-auto print:overflow-visible">
        <Sheet>
          <header className="flex items-end justify-between gap-4 border-b-2 border-black pb-2">
            <div>
              <p className="text-[18px] font-bold">بطاقة تشغيل · المعمل</p>
              <p className="text-[11px] text-neutral-600">
                طُبعت {fmtDate(new Date().toISOString())}
              </p>
            </div>
            <div className="text-left">
              <p className="text-[11px] text-neutral-600">رقم الطلب</p>
              <p className="num text-[30px] leading-none font-bold">{order.order_no}</p>
            </div>
          </header>

          <div className="mt-2 grid grid-cols-4 gap-1.5 text-[12px]">
            <Box label="العميلة">{client}</Box>
            <Box label="القطعة · الموديل">
              {itemTypeLabel(order.item_type_id)} · {modelText}
            </Box>
            <Box label="الخامات">
              {materialLines.length ? materialLines.map((l) => <p key={l}>{l}</p>) : "—"}
            </Box>
            <Box label={deadline ? `مطلوب قبل ${deadline.label}` : "مطلوب قبل"} strong>
              <span className="text-[15px] font-bold">
                {deadline ? fmtDate(deadline.date) : "—"}
              </span>
            </Box>
          </div>

          {measures.length > 0 && (
            <div className="mt-1.5 grid grid-cols-[repeat(auto-fill,minmax(24mm,1fr))] gap-1.5">
              {measures.map((x) => (
                <div key={x.label} className="rounded border border-black/60 px-2 py-1 text-center">
                  <p className="truncate text-[10.5px] text-neutral-600">{x.label}</p>
                  <p className="num text-[16px] leading-tight font-bold">{x.value}</p>
                </div>
              ))}
            </div>
          )}

          {order.notes && (
            <div className="mt-1.5 rounded border border-black/60 px-2 py-1 text-[12px] whitespace-pre-wrap">
              <span className="text-[10.5px] text-neutral-600">ملاحظات: </span>
              {order.notes}
            </div>
          )}

          <SketchImage src={pagePaths[0] ? urls[pagePaths[0]] : undefined} empty={!sketch} />
        </Sheet>

        {/* صفحات التصميم الإضافية: كل صفحة في ورقة كاملة */}
        {pagePaths.slice(1).map((path, i) => (
          <Sheet key={path} breakBefore>
            <header className="flex items-center justify-between border-b-2 border-black pb-1.5 text-[13px]">
              <span className="font-bold">بطاقة تشغيل · صفحة {i + 2}</span>
              <span className="num text-[18px] font-bold">{order.order_no}</span>
            </header>
            <SketchImage src={urls[path]} empty={false} />
          </Sheet>
        ))}
      </div>
    </div>
  );
}

/** ورقة A4: المساحة المطبوعة 194×281 مم بعد هوامش 8 مم (نترك 3 مم احتياط حتى لا تنزل ورقة فاضية) */
function Sheet({ children, breakBefore }: { children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section
      className={`mx-auto mb-4 w-[210mm] bg-white p-[8mm] text-black shadow-sm print:mb-0 print:w-auto print:p-0 print:shadow-none ${
        breakBefore ? "break-before-page" : ""
      }`}
    >
      <div className="flex h-[278mm] flex-col">{children}</div>
    </section>
  );
}

function Box({
  label,
  strong,
  children,
}: {
  label: string;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded px-2 py-1 ${strong ? "border-2 border-black" : "border border-black/60"}`}
    >
      <p className="text-[10.5px] text-neutral-600">{label}</p>
      <div className="leading-snug">{children}</div>
    </div>
  );
}

/** الرسمة تملأ كل المساحة الباقية من الورقة مع الحفاظ على نسبتها */
function SketchImage({ src, empty }: { src: string | undefined; empty: boolean }) {
  return (
    <div className="mt-2 flex min-h-0 flex-1 items-center justify-center">
      {src ? (
        <img src={src} alt="التصميم" className="size-full object-contain" />
      ) : (
        <div className="flex size-full items-center justify-center rounded border border-dashed border-black/40 text-[12px] text-neutral-500">
          {empty ? "لا توجد رسمة محفوظة لهذا الطلب" : "جاري تحميل الرسمة…"}
        </div>
      )}
    </div>
  );
}
