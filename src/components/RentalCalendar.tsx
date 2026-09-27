import { addDays, addMonths, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { Btn } from "@/components/kit";
import { fmtDate } from "@/lib/atelier";
import { dressStatusLabel, localDay, type RentalRecord } from "@/lib/inventory";
import { cn } from "@/lib/utils";

const WEEK_DAYS = ["سبت", "أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة"];

type Tone = "out" | "upcoming" | "late" | "past";

const TONE_CLASS: Record<Tone, string> = {
  out: "bg-gold/15 text-gold",
  upcoming: "bg-soon/15 text-soon",
  late: "bg-late/15 text-late",
  past: "bg-goldsoft/60 text-muted-foreground",
};

const TONES: Tone[] = ["out", "upcoming", "late", "past"];

/** أسماء الخارج والمتأخر تتبع قائمة حالات الإيجار في الإعدادات */
const toneLabel = (t: Tone) =>
  t === "out"
    ? dressStatusLabel("rented")
    : t === "late"
      ? dressStatusLabel("late_return")
      : t === "upcoming"
        ? "حجز قادم"
        : "إيجار سابق";

/** حجز فرع ثاني على نفس النسخة: المواعيد فقط بدون بيانات العميلة */
export type OtherBooking = {
  out_date: string;
  due_date: string;
  delivered: boolean;
  label: string;
};

type DayBooking = { tone: Tone; title: string; from: string; to: string };

/** تقويم شهري يوضح الأيام المحجوزة للفستان */
export function RentalCalendar({
  records,
  others = [],
  onPickDay,
}: {
  records: RentalRecord[];
  others?: OtherBooking[];
  onPickDay?: ((day: string) => void) | undefined;
}) {
  const today = localDay();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(null);

  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 6 });
    const last = endOfWeek(endOfMonth(month), { weekStartsOn: 6 });
    const out: Date[] = [];
    for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
    return out;
  }, [month]);

  const bookingOn = (day: string): DayBooking | null => {
    for (const r of records) {
      const hit = (tone: Tone): DayBooking => ({
        tone,
        title: r.client_name,
        from: r.out_date,
        to: r.due_date,
      });
      if (r.cancelled_at) continue;
      if (r.returned_at) {
        const from = r.delivered_at ? localDay(r.delivered_at) : r.out_date;
        if (from <= day && day <= localDay(r.returned_at)) return hit("past");
        continue;
      }
      // لم يُسلَّم بعد: حجز حتى لو فات موعد استلامه
      if (!r.delivered_at) {
        if (r.out_date <= day && day <= r.due_date) return hit("upcoming");
        continue;
      }
      const from = localDay(r.delivered_at) < r.out_date ? localDay(r.delivered_at) : r.out_date;
      const end = r.due_date < today ? today : r.due_date;
      if (from > day || day > end) continue;
      return hit(day > r.due_date ? "late" : "out");
    }
    for (const o of others) {
      const end = o.delivered && o.due_date < today ? today : o.due_date;
      if (o.out_date <= day && day <= end) {
        return {
          tone: o.delivered ? (day > o.due_date ? "late" : "out") : "upcoming",
          title: o.label,
          from: o.out_date,
          to: o.due_date,
        };
      }
    }
    return null;
  };

  const picked = selected ? bookingOn(selected) : null;
  const monthKey = localDay(month).slice(0, 7);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="grid size-10 place-items-center rounded-lg border border-line hover:bg-ivory"
          aria-label="الشهر السابق"
        >
          <ChevronRight className="size-4" />
        </button>
        <p className="text-[14px] font-medium">
          {month.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="grid size-10 place-items-center rounded-lg border border-line hover:bg-ivory"
          aria-label="الشهر التالي"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK_DAYS.map((d) => (
          <span key={d} className="pb-1 text-[11px] text-muted-foreground">
            {d}
          </span>
        ))}
        {days.map((date) => {
          const day = localDay(date);
          const inMonth = day.slice(0, 7) === monthKey;
          const booking = bookingOn(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelected(day === selected ? null : day)}
              className={cn(
                "num relative grid aspect-square place-items-center rounded-lg text-[13px] transition-colors",
                !inMonth && "opacity-35",
                booking ? TONE_CLASS[booking.tone] : "hover:bg-ivory",
                day === today && "ring-1 ring-ink/40",
                day === selected && "ring-2 ring-gold",
              )}
            >
              {date.getDate().toLocaleString("ar-EG")}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {TONES.map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5">
            <span className={cn("size-3 rounded", TONE_CLASS[t])} />
            {toneLabel(t)}
          </span>
        ))}
      </div>

      {selected && (
        <div className="mt-3 rounded-lg border border-line bg-ivory px-3 py-2.5 text-[13px]">
          {picked ? (
            <>
              <p className="font-medium">
                {toneLabel(picked.tone)} — {picked.title}
              </p>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                من {fmtDate(picked.from)} إلى {fmtDate(picked.to)}
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                {fmtDate(selected)} — <span className="text-ok">الفستان متاح</span>
              </p>
              {onPickDay && selected >= today && (
                <Btn variant="gold" className="min-h-9" onClick={() => onPickDay(selected)}>
                  حجز من هذا اليوم
                </Btn>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
