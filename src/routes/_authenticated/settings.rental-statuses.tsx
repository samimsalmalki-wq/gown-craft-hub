import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { STATUS_TONES, type StatusTone } from "@/lib/inventory";
import {
  useAddRentalStatus,
  useDeleteRentalStatus,
  useRentalStatuses,
  useReorderRentalStatuses,
  useUpdateRentalStatus,
} from "@/lib/inventory-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/rental-statuses")({
  head: () => ({
    meta: [
      { title: "حالات فساتين الإيجار · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "أضف حالات فساتين الإيجار واحذفها وغيّر أسماءها وألوانها وترتيبها.",
      },
      { property: "og:title", content: "حالات فساتين الإيجار · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة حالات فساتين الإيجار." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RentalStatusesPage,
});

/** شرح الحالات الأساسية التي يحددها النظام بنفسه */
const AUTO_NOTE: Record<string, string> = {
  available: "الحالة الافتراضية للفستان الموجود في المحل وبعد الإرجاع السليم",
  rented: "تتحدد تلقائيًا لما يطلع الفستان مع العميلة",
  late_return: "تتحدد تلقائيًا لما يتأخر الفستان عن موعد إرجاعه",
};

const SWATCH: Record<StatusTone, string> = {
  ok: "bg-ok",
  gold: "bg-gold",
  soon: "bg-soon",
  late: "bg-late",
  neutral: "bg-muted-foreground/50",
};

function RentalStatusesPage() {
  const { can, ready } = useCurrentAccount();
  const { data: rows = [], isLoading } = useRentalStatuses();
  const add = useAddRentalStatus();
  const update = useUpdateRentalStatus();
  const remove = useDeleteRentalStatus();
  const reorder = useReorderRentalStatuses();

  const [label, setLabel] = useState("");
  const [tone, setTone] = useState<StatusTone>("neutral");
  const [bookable, setBookable] = useState(true);

  if (ready && !can("catalog.manage")) {
    return (
      <AppShell title="حالات فساتين الإيجار">
        <Empty>هذه الشاشة متاحة لمن يملك صلاحية الموديلات والكتالوج.</Empty>
      </AppShell>
    );
  }

  const submit = () =>
    add
      .mutateAsync({ label, tone, bookable })
      .then(() => {
        toast.success("تمت إضافة الحالة");
        setLabel("");
        setTone("neutral");
        setBookable(true);
      })
      .catch((e: Error) => toast.error(e.message));

  const patch = (id: string, p: { label?: string; tone?: StatusTone; bookable?: boolean }) =>
    update
      .mutateAsync({ id, patch: p })
      .then(() => toast.success("تم الحفظ"))
      .catch((e: Error) => toast.error(e.message));

  const move = (index: number, step: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutateAsync(ids).catch((e: Error) => toast.error(e.message));
  };

  const del = (id: string, name: string) => {
    if (!window.confirm(`حذف حالة «${name}»؟`)) return;
    remove
      .mutateAsync(id)
      .then(() => toast.success("تم حذف الحالة"))
      .catch((e: Error) => toast.error(e.message));
  };

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="حالات فساتين الإيجار"
      subtitle="الحالات تظهر في صفحة الفستان وفي فلتر معرض الإيجار وعند تسجيل الإرجاع. الحالات الأساسية يحددها النظام تلقائيًا، فتقدر تغيّر اسمها ولونها وترتيبها لكن ما تنحذف."
      actions={
        <Link to="/rentals" className="btn-quiet">
          فساتين الإيجار
        </Link>
      }
    >
      <Card title="حالة جديدة">
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1">
              <Field label="اسم الحالة">
                <input
                  className="field w-full"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="مثال: عند الخياط للتعديل"
                />
              </Field>
            </div>
            <Btn variant="gold" onClick={submit} disabled={add.isPending || !label.trim()}>
              إضافة
            </Btn>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ToneSwatches value={tone} onChange={setTone} />
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-5 accent-current"
                checked={bookable}
                onChange={(e) => setBookable(e.target.checked)}
              />
              الفستان يقبل الحجز وهو في هذه الحالة
            </label>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <Card title="الحالات">
          {isLoading ? (
            <Empty>جاري التحميل…</Empty>
          ) : rows.length === 0 ? (
            <Empty>لا توجد حالات بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((s, i) => (
                <li key={s.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-col">
                      <button
                        type="button"
                        aria-label="تحريك للأعلى"
                        disabled={i === 0 || reorder.isPending}
                        onClick={() => move(i, -1)}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-ivory disabled:opacity-30"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="تحريك للأسفل"
                        disabled={i === rows.length - 1 || reorder.isPending}
                        onClick={() => move(i, 1)}
                        className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-ivory disabled:opacity-30"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>
                    <input
                      key={s.label}
                      className="field h-10 min-h-0 min-w-[140px] flex-1 py-0 text-[14px] font-medium"
                      defaultValue={s.label}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== s.label) patch(s.id, { label: v });
                        else e.target.value = s.label;
                      }}
                    />
                    <Chip
                      tone={
                        STATUS_TONES.some((t) => t.key === s.tone)
                          ? (s.tone as StatusTone)
                          : "neutral"
                      }
                    >
                      {s.label}
                    </Chip>
                    {s.is_builtin ? (
                      <Chip>أساسية</Chip>
                    ) : (
                      <button
                        type="button"
                        aria-label={`حذف ${s.label}`}
                        onClick={() => del(s.id, s.label)}
                        disabled={remove.isPending}
                        className="grid size-10 place-items-center rounded-lg text-late hover:bg-late/10"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 ps-11">
                    <ToneSwatches
                      value={s.tone as StatusTone}
                      onChange={(t) => t !== s.tone && patch(s.id, { tone: t })}
                    />
                    {AUTO_NOTE[s.key] ? (
                      <span className="text-[12px] text-muted-foreground">{AUTO_NOTE[s.key]}</span>
                    ) : (
                      <label className="flex items-center gap-2 text-[13px]">
                        <input
                          type="checkbox"
                          className="size-5 accent-current"
                          checked={s.bookable}
                          onChange={(e) => patch(s.id, { bookable: e.target.checked })}
                        />
                        يقبل الحجز
                      </label>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

function ToneSwatches({
  value,
  onChange,
}: {
  value: StatusTone;
  onChange: (t: StatusTone) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-muted-foreground">اللون</span>
      {STATUS_TONES.map((t) => (
        <button
          key={t.key}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-pressed={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "grid size-8 place-items-center rounded-full border-2",
            value === t.key ? "border-ink" : "border-transparent",
          )}
        >
          <span className={cn("size-5 rounded-full", SWATCH[t.key])} />
        </button>
      ))}
    </div>
  );
}
