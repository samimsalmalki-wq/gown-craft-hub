import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PartsCheckboxes } from "@/components/ChecklistSheet";
import { Btn, Card, Chip, Sheet } from "@/components/kit";
import { fmtDateTime } from "@/lib/atelier";
import { itemsOf, pointExample, type AlterationItem } from "@/lib/alterations";
import {
  FITTING_RESULT_LABEL,
  fittingResultOf,
  missingParts,
  partsOrDress,
  type FittingResult,
  type OrderFitting,
} from "@/lib/goods";
import { useOrderFittings, useReturnFromFitting } from "@/lib/goods-data";
import { cn } from "@/lib/utils";

const RESULTS: FittingResult[] = ["approved", "redo"];

/**
 * نتيجة البروفة (مشرف الفرع): معتمدة أو إعادة، ونقاط التعديل لكل قطعة، وتهميش المشرف،
 * والتأشير على القطع الراجعة للمعمل. ما تأشّر عليه ينسجل في النواقص.
 */
export function FittingReturnSheet({
  order,
  onClose,
}: {
  order: { id: string; order_no: string; client_name: string; parts: string[] | null };
  onClose: () => void;
}) {
  const ret = useReturnFromFitting();
  const parts = partsOrDress(order.parts);

  const [result, setResult] = useState<FittingResult>("approved");
  const [points, setPoints] = useState<Record<string, string[]>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [returned, setReturned] = useState<string[]>([]);

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

  const items: AlterationItem[] = parts
    .map((p) => ({ part: p, points: pointsOf(p) }))
    .filter((i) => i.points.length > 0);
  const notBack = missingParts(parts, returned);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem =
      result === "redo" && items.length === 0
        ? "إعادة البروفة تحتاج نقطة تعديل وحدة على الأقل"
        : !note.trim()
          ? "اكتب تهميش المشرف"
          : returned.length === 0
            ? "أشّر على القطع الراجعة للمعمل"
            : null;
    if (problem) {
      toast.error(problem);
      return;
    }
    ret
      .mutateAsync({ orderId: order.id, result, items, note, parts: returned })
      .then(() => {
        toast.success(
          result === "redo"
            ? "انسجلت إعادة البروفة، والقطعة في الطريق للمعمل"
            : "انسجلت نتيجة البروفة، والقطعة في الطريق للمعمل",
        );
        onClose();
      })
      .catch((err: Error) => toast.error(err.message));
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`نتيجة البروفة — ${order.order_no} · ${order.client_name}`}
    >
      <form onSubmit={submit} className="space-y-5 p-4">
        <div>
          <p className="mb-1.5 text-[12px] text-muted-foreground">نتيجة البروفة</p>
          <div className="grid grid-cols-2 gap-2">
            {RESULTS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setResult(r)}
                className={cn(
                  "min-h-11 rounded-lg border px-3 text-[13.5px] transition-colors",
                  result === r
                    ? r === "redo"
                      ? "border-late bg-late/10 font-medium text-late"
                      : "border-gold bg-gold/10 font-medium text-gold"
                    : "border-line text-muted-foreground",
                )}
              >
                {FITTING_RESULT_LABEL[r]}
              </button>
            ))}
          </div>
          {result === "redo" && (
            <p className="mt-2 rounded-xl bg-late/8 px-4 py-2.5 text-[12.5px] text-late">
              الطلب يرجع لمرحلة تجهيز البروفة في المعمل، وبعدها تنرسل القطعة للفرع مرة ثانية.
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[12px] text-muted-foreground">
            التعديلات — اكتب النقاط تحت كل قطعة، وEnter يضيف نقطة
          </p>
          <div className="divide-y divide-line rounded-xl border border-line">
            {parts.map((p) => {
              const list = points[p] ?? [];
              return (
                <div key={p} className="space-y-1.5 px-4 py-3">
                  <p className="text-[14px] font-medium">{p}</p>
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
                      placeholder={list.length === 0 ? `مثال: ${pointExample(p)}` : "نقطة ثانية…"}
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
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[12px] text-muted-foreground">تهميش المشرف</span>
          <textarea
            className="field w-full"
            rows={3}
            value={note}
            placeholder="ملاحظاتك للمعمل على البروفة"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        <PartsCheckboxes
          title="القطع الراجعة للمعمل"
          items={parts}
          value={returned}
          onChange={setReturned}
        />
        {returned.length > 0 && notBack.length > 0 && (
          <p className="rounded-xl bg-late/8 px-4 py-3 text-[13px] text-late">
            ما تأشّر عليه بينسجل إنه ما رجع للمعمل: {notBack.join("، ")}
          </p>
        )}

        <Btn type="submit" className="w-full" disabled={ret.isPending}>
          {ret.isPending ? "جاري الحفظ…" : "حفظ وإرجاع للمعمل"}
        </Btn>
      </form>
    </Sheet>
  );
}

/** ملخص نتيجة بروفة: النتيجة والتعديلات وتهميش المشرف */
export function FittingSummary({ fitting }: { fitting: OrderFitting }) {
  const result = fittingResultOf(fitting.result);
  const items = itemsOf({ items: fitting.items });
  return (
    <div className="space-y-2 rounded-xl border border-line bg-ivory/60 px-4 py-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">البروفة {fitting.number.toLocaleString("ar-EG")}</span>
        <Chip tone={result === "redo" ? "late" : "ok"}>{FITTING_RESULT_LABEL[result]}</Chip>
        <span className="text-[11.5px] text-muted-foreground">
          {fmtDateTime(fitting.created_at)}
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.part}>
              <span className="font-medium">{i.part}:</span> {i.points.join("، ")}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">بدون تعديلات</p>
      )}
      <p>
        <span className="text-muted-foreground">تهميش المشرف: </span>
        {fitting.supervisor_note}
      </p>
    </div>
  );
}

/** آخر نتيجة بروفة للطلب (عند استلام المعمل للقطعة) */
export function LatestFitting({ orderId }: { orderId: string }) {
  const { data: fittings = [] } = useOrderFittings(orderId);
  const latest = fittings[0];
  return latest ? <FittingSummary fitting={latest} /> : null;
}

/** بطاقة في صفحة الطلب: نتائج البروفات وتعديلاتها */
export function OrderFittingsCard({ orderId }: { orderId: string }) {
  const { data: fittings = [] } = useOrderFittings(orderId);
  if (fittings.length === 0) return null;
  return (
    <Card title="نتائج البروفة">
      <div className="space-y-3 p-4">
        {fittings.map((f) => (
          <FittingSummary key={f.id} fitting={f} />
        ))}
      </div>
    </Card>
  );
}
