import { useState } from "react";

import { Btn } from "@/components/kit";
import { DRESS, PART_OPTIONS } from "@/lib/goods";
import { cn } from "@/lib/utils";

/**
 * اختيار قطع الفستان (قائمة التأشير عند الإرسال والاستلام والتسليم).
 * «الفستان» دائمًا أول القائمة إذا اختير.
 */
export function PartsPicker({
  value,
  onChange,
  extraOptions = [],
}: {
  value: string[];
  onChange: (parts: string[]) => void;
  /** خيارات إضافية تظهر مع الافتراضية (مثل اسم نوع القطعة) */
  extraOptions?: string[];
}) {
  const [custom, setCustom] = useState("");
  const base = [DRESS, ...extraOptions.filter((p) => p !== DRESS), ...PART_OPTIONS];
  const choices = [...base, ...value.filter((p) => !base.includes(p))];

  const ordered = (list: string[]) =>
    list.includes(DRESS) ? [DRESS, ...list.filter((p) => p !== DRESS)] : list;

  const toggle = (p: string) =>
    onChange(ordered(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]));

  function addCustom() {
    const p = custom.trim();
    if (p && !value.includes(p)) onChange(ordered([...value, p]));
    setCustom("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {choices.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-[13px]",
              value.includes(p)
                ? "border-gold bg-gold/10 text-gold"
                : "border-line text-muted-foreground",
            )}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="field flex-1"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="قطعة ثانية (مثال: الشلحة)"
        />
        <Btn type="button" variant="quiet" onClick={addCustom}>
          إضافة
        </Btn>
      </div>
    </div>
  );
}
