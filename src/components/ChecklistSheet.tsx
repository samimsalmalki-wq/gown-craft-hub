import { AlertTriangle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Btn, Field, Sheet } from "@/components/kit";
import { missingParts } from "@/lib/goods";
import { cn } from "@/lib/utils";

export type ChecklistGroup = {
  key: string;
  title: ReactNode;
  /** القطع اللي تتأشّر */
  items: string[];
  /** قطع ما انرسلت من المصدر (تظهر مشطوبة) */
  skipped?: string[];
  /** صنف ينعدّ بالكمية: يُسجَّل «كم وصل» بدل التأشير (القيمة القصوى) */
  count?: number;
};

/**
 * قائمة تأشير القطع (إرسال، استلام، تسليم للعميلة).
 * ما تأشّر عليه يُرسل للدالة، والباقي يعرض كنواقص قبل التأكيد.
 */
export function ChecklistSheet({
  title,
  hint,
  groups,
  okLabel,
  partialLabel,
  missingNote,
  pending,
  withNotes,
  requireEach,
  children,
  onClose,
  onConfirm,
}: {
  title: string;
  hint: string;
  groups: ChecklistGroup[];
  okLabel: string;
  partialLabel: string;
  missingNote: string;
  pending?: boolean;
  /** خانة ملاحظة اختيارية ترسل مع التأكيد */
  withNotes?: boolean;
  /** لازم قطعة وحدة على الأقل من كل سطر (الإرسال والتسليم) */
  requireEach?: boolean;
  /** محتوى إضافي فوق زر التأكيد */
  children?: ReactNode;
  onClose: () => void;
  onConfirm: (
    checked: Record<string, string[]>,
    notes: string,
    counts: Record<string, number>,
  ) => void;
}) {
  const [checked, setChecked] = useState<Record<string, string[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");

  const got = (key: string) => checked[key] ?? [];
  const countOf = (key: string) => counts[key] ?? 0;
  const toggle = (key: string, part: string) =>
    setChecked((cur) => {
      const list = cur[key] ?? [];
      return {
        ...cur,
        [key]: list.includes(part) ? list.filter((p) => p !== part) : [...list, part],
      };
    });
  const setCount = (key: string, max: number, value: number) =>
    setCounts((cur) => ({ ...cur, [key]: Math.min(max, Math.max(0, value)) }));
  const checkAll = () => {
    setChecked(Object.fromEntries(groups.map((g) => [g.key, [...g.items]])));
    setCounts(Object.fromEntries(groups.flatMap((g) => (g.count ? [[g.key, g.count]] : []))));
  };

  const doneIn = (g: ChecklistGroup) =>
    g.count ? countOf(g.key) : got(g.key).filter((p) => g.items.includes(p)).length;
  const totalIn = (g: ChecklistGroup) => g.count ?? g.items.length;
  const total = groups.reduce((s, g) => s + totalIn(g), 0);
  const done = groups.reduce((s, g) => s + doneIn(g), 0);
  const missing = groups
    .map((g) => ({
      key: g.key,
      title: g.title,
      parts: g.count
        ? countOf(g.key) < g.count
          ? [
              `${(g.count - countOf(g.key)).toLocaleString("ar-EG")} من ${g.count.toLocaleString("ar-EG")}`,
            ]
          : []
        : missingParts(g.items, got(g.key)),
    }))
    .filter((m) => m.parts.length > 0);
  const noneInGroup = Boolean(requireEach) && groups.some((g) => doneIn(g) === 0);

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">{hint}</p>
          <button type="button" className="shrink-0 text-[13px] text-gold" onClick={checkAll}>
            تأشير الكل
          </button>
        </div>

        {groups.map((g) => (
          <div key={g.key} className="rounded-xl border border-line">
            <p className="border-b border-line px-4 py-2.5 text-[13.5px] font-medium">{g.title}</p>
            {g.count ? (
              <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                <span className="text-[14px]">كم وصل؟</span>
                <div className="flex items-center rounded-lg border border-line">
                  <button
                    type="button"
                    aria-label="إنقاص"
                    className="grid size-11 place-items-center text-[18px]"
                    onClick={() => setCount(g.key, g.count ?? 0, countOf(g.key) - 1)}
                  >
                    −
                  </button>
                  <span className="num w-16 text-center">
                    {countOf(g.key)} / {g.count}
                  </span>
                  <button
                    type="button"
                    aria-label="زيادة"
                    className="grid size-11 place-items-center text-[18px]"
                    onClick={() => setCount(g.key, g.count ?? 0, countOf(g.key) + 1)}
                  >
                    +
                  </button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {g.items.map((part) => {
                  const on = got(g.key).includes(part);
                  return (
                    <li key={part}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4">
                        <input
                          type="checkbox"
                          className="size-5 accent-[var(--color-gold)]"
                          checked={on}
                          onChange={() => toggle(g.key, part)}
                        />
                        <span className={cn("text-[14px]", on && "font-medium")}>{part}</span>
                      </label>
                    </li>
                  );
                })}
                {(g.skipped ?? []).map((part) => (
                  <li
                    key={part}
                    className="flex min-h-12 items-center gap-3 px-4 text-[13px] text-muted-foreground"
                  >
                    <AlertTriangle className="size-4 text-late" strokeWidth={1.75} />
                    <span className="line-through">{part}</span>
                    <span>— ما انرسل من المصدر</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

        {missing.length > 0 && done > 0 && (
          <div className="rounded-xl bg-late/8 px-4 py-3 text-[13px] text-late">
            <p className="mb-1 font-medium">{missingNote}</p>
            {missing.map((m) => (
              <p key={m.key}>
                {m.title}: {m.parts.join("، ")}
              </p>
            ))}
          </div>
        )}

        {withNotes && (
          <Field label="ملاحظة (اختياري)">
            <textarea
              className="field w-full"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        )}

        {children}

        <Btn
          className="w-full"
          disabled={done === 0 || pending || noneInGroup}
          onClick={() => onConfirm(checked, notes, counts)}
        >
          {pending
            ? "جاري الحفظ…"
            : done === 0
              ? "أشّر على القطع أول"
              : noneInGroup
                ? "أشّر على قطعة وحدة على الأقل من كل سطر"
                : done < total
                  ? `${partialLabel} (${done.toLocaleString("ar-EG")} من ${total.toLocaleString("ar-EG")})`
                  : okLabel}
        </Btn>
      </div>
    </Sheet>
  );
}

/** تأشير قطع داخل نموذج (خروج فستان الإيجار ورجوعه) */
export function PartsCheckboxes({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: string[];
  value: string[];
  onChange: (checked: string[]) => void;
}) {
  const toggle = (p: string) =>
    onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="text-[13px] font-medium">{title}</p>
        <button type="button" className="text-[12.5px] text-gold" onClick={() => onChange(items)}>
          تأشير الكل
        </button>
      </div>
      <ul className="divide-y divide-line">
        {items.map((p) => (
          <li key={p}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4">
              <input
                type="checkbox"
                className="size-5 accent-[var(--color-gold)]"
                checked={value.includes(p)}
                onChange={() => toggle(p)}
              />
              <span className={cn("text-[14px]", value.includes(p) && "font-medium")}>{p}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
