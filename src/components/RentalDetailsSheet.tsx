import { useState } from "react";
import { toast } from "sonner";

import { SketchBoard } from "@/components/SketchBoard";
import { Btn, Empty, Field, Sheet } from "@/components/kit";
import { fmtDate, measurementLabel } from "@/lib/atelier";
import { measuresOf, type RentalDress, type RentalRecord } from "@/lib/inventory";
import { useInventoryUrls, useSaveRentalDetails } from "@/lib/inventory-data";
import { emptySketch } from "@/lib/sketch";
import { RENTAL_SKETCH_BUCKET, useSketchDoc } from "@/lib/sketch-data";
import { cn } from "@/lib/utils";

export function MeasureChips({
  measures,
  className,
}: {
  measures: Record<string, string>;
  className?: string;
}) {
  return (
    <dl className={cn("flex flex-wrap gap-1.5 text-[12px]", className)}>
      {Object.entries(measures).map(([key, v]) => (
        <div key={key} className="rounded-full bg-ivory px-3 py-1">
          <dt className="inline text-muted-foreground">{measurementLabel(key)}: </dt>
          <dd className="num inline">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** المقاسات والرسمة ومواعيد الحجز، وتعديلها بعد الحجز (وقت البروفة مثلًا) */
export function RentalDetailsSheet({
  record,
  dress,
  canEdit,
  onClose,
}: {
  record: RentalRecord | null;
  dress: Pick<RentalDress, "id" | "code">;
  canEdit: boolean;
  onClose: () => void;
}) {
  const save = useSaveRentalDetails();
  const [boardOpen, setBoardOpen] = useState(false);
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<{ fitting2: string; event: string } | null>(null);
  const { data: doc, isLoading: docLoading } = useSketchDoc(
    record?.sketch_path,
    RENTAL_SKETCH_BUCKET,
  );
  const urls = useInventoryUrls([record?.sketch_path]);

  if (!record) return null;

  const filled = measuresOf(record.measurements);
  const sketchUrl = record.sketch_path ? urls[record.sketch_path] : undefined;
  const editable = canEdit && !record.cancelled_at && !record.returned_at;

  const openBoard = () => {
    setMeasures(filled);
    setBoardOpen(true);
  };

  return (
    <Sheet open onClose={onClose} title={`تفاصيل حجز ${record.client_name}`}>
      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line p-3 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="text-[11px] text-muted-foreground">البروفة الأولى</dt>
            <dd>{fmtDate(record.fitting_date)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">البروفة الثانية</dt>
            <dd>{fmtDate(record.fitting2_date)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">تاريخ المناسبة</dt>
            <dd>{fmtDate(record.event_date)}</dd>
          </div>
        </dl>

        {editable &&
          (dates ? (
            <div className="space-y-3 rounded-xl border border-line p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="البروفة الثانية" hint="البروفة الأولى تتعدل من «تعديل البروفة»">
                  <input
                    type="date"
                    className="field w-full"
                    max={record.out_date}
                    value={dates.fitting2}
                    onChange={(e) => setDates({ ...dates, fitting2: e.target.value })}
                  />
                </Field>
                <Field label="تاريخ المناسبة">
                  <input
                    type="date"
                    className="field w-full"
                    value={dates.event}
                    onChange={(e) => setDates({ ...dates, event: e.target.value })}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Btn
                  disabled={save.isPending}
                  onClick={() => {
                    if (dates.fitting2 && dates.fitting2 > record.out_date) {
                      toast.error("البروفة الثانية لازم تكون قبل موعد الخروج");
                      return;
                    }
                    save
                      .mutateAsync({
                        recordId: record.id,
                        dressId: dress.id,
                        fitting2Date: dates.fitting2 || null,
                        eventDate: dates.event || null,
                      })
                      .then(() => {
                        toast.success("تم الحفظ");
                        setDates(null);
                      })
                      .catch((err: Error) => toast.error(err.message));
                  }}
                >
                  حفظ المواعيد
                </Btn>
                <Btn variant="quiet" onClick={() => setDates(null)}>
                  رجوع
                </Btn>
              </div>
            </div>
          ) : (
            <button
              className="text-[13px] text-gold"
              onClick={() =>
                setDates({ fitting2: record.fitting2_date ?? "", event: record.event_date ?? "" })
              }
            >
              تعديل البروفة الثانية وتاريخ المناسبة
            </button>
          ))}

        <div className="rounded-xl border border-line">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <p className="text-[13px] font-medium">المقاسات والرسمة</p>
            {editable && (
              <Btn
                variant="quiet"
                className="min-h-9 px-3 text-[12px]"
                disabled={Boolean(record.sketch_path) && docLoading}
                onClick={openBoard}
              >
                {record.sketch_path || Object.keys(filled).length
                  ? "تعديل الرسمة والمقاسات"
                  : "افتح لوحة الرسم"}
              </Btn>
            )}
          </div>
          <div className="px-4 py-3">
            {Object.keys(filled).length > 0 ? (
              <MeasureChips measures={filled} />
            ) : (
              <p className="text-[12px] text-muted-foreground">لم تُكتب المقاسات بعد.</p>
            )}
            {record.sketch_path ? (
              sketchUrl ? (
                <a href={sketchUrl} target="_blank" rel="noreferrer">
                  <img
                    src={sketchUrl}
                    alt="رسمة الحجز"
                    className="mt-3 w-full max-w-xs rounded-lg border border-line bg-white"
                  />
                </a>
              ) : (
                <p className="mt-3 text-[12px] text-muted-foreground">جاري تحميل الرسمة…</p>
              )
            ) : (
              !editable && <Empty>ما فيه رسمة لهذا الحجز.</Empty>
            )}
          </div>
        </div>
      </div>

      {boardOpen && (
        <SketchBoard
          order={{
            client_name: record.client_name,
            order_no: dress.code,
            measurements: measures,
          }}
          initial={doc ?? emptySketch()}
          bucket={RENTAL_SKETCH_BUCKET}
          onMeasuresChange={setMeasures}
          onClose={() => setBoardOpen(false)}
          onSave={async (result) => {
            const clean = Object.fromEntries(
              Object.entries(measures).filter(([, v]) => v.trim() !== ""),
            );
            await save
              .mutateAsync({
                recordId: record.id,
                dressId: dress.id,
                measurements: clean,
                sketch: result,
              })
              .then(() => {
                toast.success("تم حفظ الرسمة والمقاسات");
                setBoardOpen(false);
              })
              .catch((err: Error) => toast.error(err.message));
          }}
        />
      )}
    </Sheet>
  );
}
