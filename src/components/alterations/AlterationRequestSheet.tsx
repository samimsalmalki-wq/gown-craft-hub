import { PenLine, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Btn, Chip, Field, Sheet } from "@/components/kit";
import { SketchBoard } from "@/components/SketchBoard";
import { useCurrentAccount } from "@/hooks/useSession";
import { stageLabel, type Order } from "@/lib/atelier";
import { localToday, pointExample } from "@/lib/alterations";
import { useRequestAlteration } from "@/lib/alterations-data";
import { partsOrDress } from "@/lib/goods";
import { emptySketch } from "@/lib/sketch";
import type { SketchResult } from "@/lib/sketch-data";
import { cn } from "@/lib/utils";

/**
 * طلب تعديل من داخل الطلب: الجولة التالية تلقائيًا، ووقت الطلب حسب المرحلة اللي وصل لها.
 * لكل قطعة نقاط تنكتب يدويًا، ولوحة الرسم اختيارية. الخياط يتحدد عند طباعة كرت التشغيل.
 */
export function AlterationRequestSheet({
  order,
  round,
  onClose,
}: {
  order: Order;
  round: number;
  onClose: () => void;
}) {
  const { can } = useCurrentAccount();
  const request = useRequestAlteration(order.id);
  const parts = partsOrDress(order.parts);
  const source = order.state === "delivered" ? "رجيع بعد التسليم" : stageLabel(order.current_stage);

  const [picked, setPicked] = useState<string[]>([]);
  const [points, setPoints] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pickup, setPickup] = useState("");
  const [fee, setFee] = useState("");
  const [sketch, setSketch] = useState<{ result: SketchResult; url: string } | null>(null);
  const [sketchOpen, setSketchOpen] = useState(false);

  // تنظيف رابط معاينة الرسمة
  useEffect(
    () => () => {
      if (sketch) URL.revokeObjectURL(sketch.url);
    },
    [sketch],
  );

  const togglePart = (p: string) =>
    setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const addPoint = (p: string) => {
    const text = drafts[p]?.trim();
    if (!text) return;
    setPoints((cur) => ({ ...cur, [p]: [...(cur[p] ?? []), text] }));
    setDrafts((cur) => ({ ...cur, [p]: "" }));
  };

  const removePoint = (p: string, idx: number) =>
    setPoints((cur) => ({ ...cur, [p]: (cur[p] ?? []).filter((_, k) => k !== idx) }));

  /** النقاط المضافة + اللي مكتوبة في الخانة وما انضافت */
  const pointsOf = (p: string) => {
    const draft = drafts[p]?.trim();
    return [...(points[p] ?? []), ...(draft ? [draft] : [])];
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const empty = picked.find((p) => pointsOf(p).length === 0);
    const problem =
      picked.length === 0
        ? "أشّر على القطع اللي فيها تعديل"
        : empty
          ? `أضف نقطة وحدة على الأقل في ${empty}`
          : !pickup
            ? "حدد موعد استلام العميلة"
            : Number(fee) < 0
              ? "الرسوم غير صحيحة"
              : null;
    if (problem) {
      toast.error(problem);
      return;
    }
    request
      .mutateAsync({
        // بترتيب قطع الطلب
        items: parts
          .filter((p) => picked.includes(p))
          .map((p) => ({ part: p, points: pointsOf(p) })),
        pickupDate: pickup,
        fee: Number(fee) || 0,
        sketch: sketch?.result ?? null,
        round,
      })
      .then(() => {
        toast.success(`انسجل تعديل ${round}، وينتظر تعميد مشرف الفرع`);
        onClose();
      })
      .catch((err: Error) => toast.error(err.message));
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`طلب تعديل ${round} — ${order.order_no} · ${order.client_name}`}
    >
      <form onSubmit={submit} className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-ivory px-4 py-3">
          <span className="text-[12.5px] text-muted-foreground">
            وقت الطلب — حسب المرحلة اللي وصل لها الطلب
          </span>
          <Chip tone="gold">{source}</Chip>
        </div>

        <Field
          label="القطع اللي فيها تعديل"
          hint="أشّر على القطعة وأضف تحتها نقاط التعديل وحدة وحدة"
        >
          <div className="divide-y divide-line rounded-xl border border-line">
            {parts.map((p) => {
              const on = picked.includes(p);
              const list = points[p] ?? [];
              return (
                <div key={p} className={cn("px-4 py-2.5", on && "bg-goldsoft/15")}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--color-gold)]"
                      checked={on}
                      onChange={() => togglePart(p)}
                    />
                    <span className="flex-1 text-[14px]">{p}</span>
                    {on && list.length > 0 && (
                      <span className="text-[12px] text-muted-foreground">
                        {list.length.toLocaleString("ar-EG")} نقاط
                      </span>
                    )}
                  </label>
                  {on && (
                    <div className="ms-8 mt-1.5 space-y-1.5">
                      {list.length > 0 && (
                        <ol className="space-y-1">
                          {list.map((pt, k) => (
                            <li
                              key={k}
                              className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-[13px]"
                            >
                              <span className="num text-[11px] text-muted-foreground">
                                {(k + 1).toLocaleString("ar-EG")}
                              </span>
                              <span className="flex-1">{pt}</span>
                              <button
                                type="button"
                                aria-label="حذف النقطة"
                                className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-late/10 hover:text-late"
                                onClick={() => removePoint(p, k)}
                              >
                                <X className="size-3.5" />
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                      <div className="flex gap-2">
                        <input
                          className="field min-w-0 flex-1"
                          placeholder={
                            list.length === 0
                              ? `نقطة في ${p} — مثال: ${pointExample(p)}`
                              : "نقطة ثانية…"
                          }
                          value={drafts[p] ?? ""}
                          onChange={(e) => setDrafts({ ...drafts, [p]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPoint(p);
                            }
                          }}
                        />
                        <Btn
                          type="button"
                          variant="quiet"
                          className="shrink-0 px-3"
                          onClick={() => addPoint(p)}
                        >
                          <Plus className="size-4" /> إضافة
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Field>

        {can("files.upload") && (
          <Field label="لوحة الرسم" hint="ارسم مكان التعديل على الفستان (اختياري)">
            <div className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Btn type="button" variant="quiet" onClick={() => setSketchOpen(true)}>
                  <PenLine className="size-4" strokeWidth={1.75} />
                  {sketch ? "تعديل الرسمة" : "افتح لوحة الرسم"}
                </Btn>
                {sketch && (
                  <button
                    type="button"
                    className="text-[13px] text-late"
                    onClick={() => setSketch(null)}
                  >
                    حذف الرسمة
                  </button>
                )}
              </div>
              {sketch && (
                <img
                  src={sketch.url}
                  alt="رسمة التعديل"
                  className="mt-3 w-full max-w-xs rounded-lg border border-line bg-white"
                />
              )}
            </div>
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="موعد استلام العميلة" hint="التعديل لازم يكون جاهز في الفرع بنفس اليوم">
            <input
              type="date"
              className="field w-full"
              value={pickup}
              min={localToday()}
              onChange={(e) => setPickup(e.target.value)}
            />
          </Field>
          <Field label="رسوم التعديل (إن وجدت)" hint="شاملة الضريبة — فاضية = بدون رسوم">
            <input
              type="number"
              min="0"
              inputMode="decimal"
              className="field w-full"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </Field>
        </div>

        <Btn type="submit" className="w-full" disabled={request.isPending}>
          {request.isPending ? "جاري الحفظ…" : "حفظ طلب التعديل"}
        </Btn>
      </form>

      {sketchOpen && (
        <SketchBoard
          order={{
            client_name: order.client_name,
            order_no: order.order_no,
            measurements: order.measurements,
          }}
          initial={sketch?.result.doc ?? emptySketch()}
          initialFiles={sketch?.result.files ?? []}
          onClose={() => setSketchOpen(false)}
          onSave={async (result) => {
            const first = result.pngs[0];
            if (!first) return;
            setSketch({ result, url: URL.createObjectURL(first) });
            setSketchOpen(false);
            toast.success("انحفظت الرسمة — تنرفع مع طلب التعديل");
          }}
        />
      )}
    </Sheet>
  );
}
