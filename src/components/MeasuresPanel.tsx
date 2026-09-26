import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Btn } from "@/components/kit";
import { MEASUREMENT_FIELDS, isCustomMeasurement, measurementLabel } from "@/lib/atelier";
import { cn } from "@/lib/utils";

/**
 * لوحة المقاسات بجانب الرسمة: الخانات الثابتة + مقاسات تضيفها الموظفة باسمها.
 * بدون onChange تُعرض المقاسات للقراءة فقط.
 */
export function MeasuresPanel({
  measures,
  onChange,
  onClose,
  className,
}: {
  measures: Record<string, unknown>;
  onChange?: ((next: Record<string, string>) => void) | undefined;
  onClose: () => void;
  className?: string;
}) {
  const [newName, setNewName] = useState("");
  const values = Object.fromEntries(
    Object.entries(measures).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)]),
  );
  const customKeys = Object.keys(values).filter(isCustomMeasurement);

  const setValue = (key: string, value: string) => onChange?.({ ...values, [key]: value });

  function addMeasure() {
    const name = newName.trim();
    if (!name || !onChange) return;
    const taken =
      MEASUREMENT_FIELDS.some(([key, label]) => key === name || label === name) || name in values;
    if (taken) {
      toast.error("هذا المقاس موجود");
      return;
    }
    onChange({ ...values, [name]: "" });
    setNewName("");
  }

  function removeMeasure(name: string) {
    const { [name]: _removed, ...rest } = values;
    onChange?.(rest);
  }

  const filled = Object.entries(values).filter(([, v]) => v.trim() !== "");

  return (
    <aside
      className={cn(
        "flex w-72 max-w-full flex-col overflow-y-auto border-line bg-paper",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <p className="text-[14px] font-bold">المقاسات (سم)</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="text-muted-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      {onChange ? (
        <>
          <section className="grid grid-cols-2 gap-3 px-4 py-4">
            {MEASUREMENT_FIELDS.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[12px] text-muted-foreground">{label}</span>
                <input
                  className="field"
                  dir="ltr"
                  inputMode="decimal"
                  value={values[key] ?? ""}
                  onChange={(e) => setValue(key, e.target.value)}
                />
              </label>
            ))}
            {customKeys.map((name) => (
              <label key={name} className="block">
                <span className="mb-1 flex items-center justify-between gap-1 text-[12px] text-muted-foreground">
                  <span className="truncate">{name}</span>
                  <button
                    type="button"
                    aria-label={`حذف مقاس ${name}`}
                    onClick={() => removeMeasure(name)}
                    className="shrink-0"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
                <input
                  className="field"
                  dir="ltr"
                  inputMode="decimal"
                  value={values[name] ?? ""}
                  onChange={(e) => setValue(name, e.target.value)}
                />
              </label>
            ))}
          </section>

          <section className="space-y-2 border-t border-line px-4 py-4">
            <p className="text-[13px] font-medium">مقاس جديد</p>
            <div className="flex gap-2">
              <input
                className="field min-w-0 flex-1"
                placeholder="اسم المقاس، مثل: طول الذيل"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addMeasure();
                  }
                }}
              />
              <Btn type="button" disabled={!newName.trim()} onClick={addMeasure}>
                إضافة
              </Btn>
            </div>
            <p className="text-[11px] text-muted-foreground">
              المقاسات تُحفظ مع الطلب ولا تُكتب على رسمة الجسم.
            </p>
          </section>
        </>
      ) : filled.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">لم تُسجَّل المقاسات بعد.</p>
      ) : (
        <dl className="divide-y divide-line text-[13px]">
          {filled.map(([key, v]) => (
            <div key={key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <dt className="text-muted-foreground">{measurementLabel(key)}</dt>
              <dd className="num">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </aside>
  );
}
