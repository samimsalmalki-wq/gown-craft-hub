import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarSearch, Search, Shirt, X } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { DressFormSheet } from "@/components/DressFormSheet";
import { OrdersTabs } from "@/components/OrdersTabs";
import { Btn, Card, Chip, Empty, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance";
import {
  daysFromToday,
  dressStatusLabel,
  dressStatusTone,
  effectiveDressStatus,
  findRentalClash,
  isOutNow,
  isPickupOverdue,
  isRentalLate,
  isBookableStatus,
  isUpcomingRental,
  localDay,
  rentalMoney,
  rentalStatusList,
  type DressStatus,
  type RentalDress,
  type RentalRecord,
} from "@/lib/inventory";
import {
  useInventoryUrls,
  useRentalDresses,
  useRentalRecords,
  useRentalStatuses,
} from "@/lib/inventory-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/rentals/")({
  component: RentalsPage,
});

/** «all» لكل الفساتين، والباقي مفاتيح الحالات */
type Filter = string;

const dayCount = (n: number) =>
  n === 1 ? "يوم" : n === 2 ? "يومين" : `${n.toLocaleString("ar-EG")} ${n <= 10 ? "أيام" : "يوم"}`;

const inDays = (day: string) => {
  const n = daysFromToday(day);
  if (n === 0) return "اليوم";
  if (n === 1) return "غدًا";
  if (n > 0) return `بعد ${dayCount(n)}`;
  return `قبل ${dayCount(-n)}`;
};

function RentalsPage() {
  const { can } = useCurrentAccount();
  const isManager = can("rentals.manage");
  const { data: dresses = [], isLoading } = useRentalDresses();
  const { data: records = [] } = useRentalRecords();
  useRentalStatuses(); // يحمّل أسماء الحالات وألوانها من الإعدادات

  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(false);

  const urls = useInventoryUrls(dresses.map((d) => d.image_path));
  const dressById = useMemo(() => new Map(dresses.map((d) => [d.id, d])), [dresses]);
  const recordsByDress = useMemo(() => {
    const m = new Map<string, RentalRecord[]>();
    records.forEach((r) => m.set(r.dress_id, [...(m.get(r.dress_id) ?? []), r]));
    return m;
  }, [records]);

  const outNow = records.filter(isOutNow).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const upcoming = records
    .filter(isUpcomingRental)
    .sort((a, b) => a.out_date.localeCompare(b.out_date));
  const cancelRequests = records.filter((r) => r.cancel_requested_at && !r.cancelled_at);
  const heldDeposits = records.filter(
    (r) => !r.returned_at && !r.cancelled_at && rentalMoney(r).depositHeld > 0,
  );
  const nextBooking = new Map<string, RentalRecord>();
  upcoming.forEach((r) => {
    if (!nextBooking.has(r.dress_id)) nextBooking.set(r.dress_id, r);
  });

  const statusOf = (d: RentalDress) => effectiveDressStatus(d, records);
  const countOf = (s: DressStatus) => dresses.filter((d) => statusOf(d) === s).length;

  const dateTo = to && to >= from ? to : from;
  const list = dresses.filter((d) => {
    if (filter !== "all" && statusOf(d) !== filter) return false;
    if (from) {
      if (!isBookableStatus(statusOf(d))) return false;
      if (findRentalClash(recordsByDress.get(d.id) ?? [], from, dateTo)) return false;
    }
    const t = term.trim();
    if (!t) return true;
    if ([d.code, d.model_no, d.color, d.size].some((v) => (v ?? "").includes(t))) return true;
    // البحث باسم العميلة أو جوالها أو رقم فاتورة الحجز يُظهر فستانها
    return (recordsByDress.get(d.id) ?? []).some(
      (r) =>
        !r.cancelled_at &&
        [r.client_name, r.client_phone, r.external_invoice_no].some((v) => (v ?? "").includes(t)),
    );
  });

  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? "all" : f));

  return (
    <AppShell
      eyebrow="الطلبات"
      title="فساتين الإيجار"
      subtitle="معرض الفساتين، وحالة كل فستان، ومواعيد الخروج والإرجاع."
      actions={
        isManager ? (
          <div className="flex flex-wrap gap-2">
            <Btn onClick={() => setOpen(true)}>فستان جديد</Btn>
            <Link to="/orders/new" search={{ kind: "rental_stock" }}>
              <Btn variant="quiet">طلب إنتاج قطعة للإيجار</Btn>
            </Link>
          </div>
        ) : undefined
      }
    >
      <OrdersTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="كل الفساتين"
          value={dresses.length}
          onClick={() => setFilter("all")}
          active={filter === "all"}
        />
        <Stat
          label={dressStatusLabel("available")}
          value={countOf("available")}
          onClick={() => toggle("available")}
          active={filter === "available"}
        />
        <Stat
          label={dressStatusLabel("rented")}
          value={countOf("rented")}
          tone="gold"
          onClick={() => toggle("rented")}
          active={filter === "rented"}
        />
        <Stat
          label={dressStatusLabel("late_return")}
          value={countOf("late_return")}
          tone="late"
          onClick={() => toggle("late_return")}
          active={filter === "late_return"}
        />
      </div>

      {(outNow.length > 0 || upcoming.length > 0) && (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <ActivityCard
            title="خارج المحل الآن"
            empty="لا توجد فساتين خارج المحل."
            rows={outNow.map((r) => ({
              record: r,
              dress: dressById.get(r.dress_id),
              when: isRentalLate(r)
                ? `متأخر ${dayCount(-daysFromToday(r.due_date))}`
                : `الإرجاع ${inDays(r.due_date)}`,
              late: isRentalLate(r),
            }))}
            urls={urls}
          />
          <ActivityCard
            title="حجوزات قادمة"
            empty="لا توجد حجوزات قادمة."
            rows={upcoming.map((r) => ({
              record: r,
              dress: dressById.get(r.dress_id),
              when: r.cancel_requested_at
                ? "طلب إلغاء"
                : isPickupOverdue(r)
                  ? `فات موعد الاستلام ${inDays(r.out_date)}`
                  : r.fitting_date && r.fitting_date >= localDay()
                    ? `بروفة ${inDays(r.fitting_date)} · يخرج ${inDays(r.out_date)}`
                    : `يخرج ${inDays(r.out_date)}`,
              late: Boolean(r.cancel_requested_at) || isPickupOverdue(r),
            }))}
            urls={urls}
          />
        </div>
      )}

      {(cancelRequests.length > 0 && can("rentals.cancel")) || heldDeposits.length > 0 ? (
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          {cancelRequests.length > 0 && can("rentals.cancel") && (
            <Card title={`طلبات إلغاء بانتظار قرارك (${cancelRequests.length.toLocaleString("ar-EG")})`}>
              <ul className="divide-y divide-line">
                {cancelRequests.map((r) => {
                  const dress = dressById.get(r.dress_id);
                  return (
                    <li key={r.id}>
                      <Link
                        to="/rentals/$dressId"
                        params={{ dressId: r.dress_id }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">
                            {r.client_name}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {r.cancel_reason || "بدون سبب"}
                          </span>
                        </span>
                        <span className="num text-[12px] text-gold">{dress?.code ?? "—"}</span>
                        <span className="num text-[12px]">دفعت {money(Number(r.paid_amount))}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {heldDeposits.length > 0 && (
            <DepositBoxCard records={heldDeposits} dressById={dressById} />
          )}
        </div>
      ) : null}

      <section className="mt-5 rounded-xl border border-line bg-paper p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="field w-full pr-9"
              placeholder="ابحث بالكود أو الموديل أو اسم العميلة أو رقم الفاتورة"
            />
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
            className="field w-full md:w-44"
          >
            <option value="all">كل الحالات</option>
            {rentalStatusList().map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 rounded-lg bg-ivory p-3">
          <p className="mb-2 flex items-center gap-2 text-[13px] font-medium">
            <CalendarSearch className="size-4 text-gold" />
            الفساتين المتاحة في تاريخ المناسبة
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">من تاريخ</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="field w-40"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-muted-foreground">
                إلى تاريخ (اختياري)
              </span>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="field w-40"
              />
            </label>
            {from && (
              <button
                type="button"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="inline-flex min-h-11 items-center gap-1 text-[13px] text-muted-foreground"
              >
                <X className="size-4" />
                مسح التاريخ
              </button>
            )}
          </div>
          {from && (
            <p className="mt-2 text-[12px] text-ok">
              {list.length.toLocaleString("ar-EG")} فستان متاح
              {dateTo === from
                ? ` يوم ${fmtDate(from)}`
                : ` من ${fmtDate(from)} إلى ${fmtDate(dateTo)}`}
            </p>
          )}
        </div>
      </section>

      <div className="mt-5">
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : list.length === 0 ? (
          <Card>
            <Empty>
              {dresses.length === 0
                ? "لا توجد فساتين بعد. أضف أول فستان من زر «فستان جديد»."
                : from
                  ? "لا يوجد فستان متاح في هذا التاريخ."
                  : "لا توجد فساتين مطابقة."}
            </Empty>
          </Card>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((d) => {
              const st = statusOf(d);
              const img = d.image_path ? urls[d.image_path] : undefined;
              const booking = nextBooking.get(d.id);
              return (
                <li key={d.id}>
                  <Link
                    to="/rentals/$dressId"
                    params={{ dressId: d.id }}
                    className="group block overflow-hidden rounded-xl border border-line bg-paper transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[3/4] bg-ivory">
                      {img ? (
                        <img
                          src={img}
                          alt={d.code}
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground/50">
                          <Shirt className="size-10" strokeWidth={1.2} />
                        </div>
                      )}
                      <div className="absolute inset-x-2 top-2 flex flex-wrap gap-1">
                        <Chip tone={dressStatusTone(st)} className="bg-paper/90 backdrop-blur">
                          {dressStatusLabel(st)}
                        </Chip>
                      </div>
                    </div>
                    <div className="space-y-1 p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="num text-[15px] font-medium text-gold">{d.code}</span>
                        <span className="num text-[13px]">{money(Number(d.rent_price))}</span>
                      </div>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {[d.model_no && `موديل ${d.model_no}`, d.color, d.size && `مقاس ${d.size}`]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {booking && (
                        <p className="truncate text-[11px] text-soon">
                          محجوز من {fmtDate(booking.out_date)}
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DressFormSheet open={open} onClose={() => setOpen(false)} />
    </AppShell>
  );
}

function ActivityCard({
  title,
  empty,
  rows,
  urls,
}: {
  title: string;
  empty: string;
  rows: { record: RentalRecord; dress: RentalDress | undefined; when: string; late: boolean }[];
  urls: Record<string, string>;
}) {
  return (
    <Card title={`${title} (${rows.length.toLocaleString("ar-EG")})`}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {rows.map(({ record: r, dress, when, late }) => {
            const img = dress?.image_path ? urls[dress.image_path] : undefined;
            const body = (
              <>
                {img ? (
                  <img
                    src={img}
                    alt=""
                    className="h-12 w-9 shrink-0 rounded-md border border-line object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-9 shrink-0 place-items-center rounded-md bg-ivory text-muted-foreground/50">
                    <Shirt className="size-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{r.client_name}</span>
                  <span className="num block text-[12px] text-gold">{dress?.code ?? "—"}</span>
                </span>
                <span
                  className={cn(
                    "text-[12px] whitespace-nowrap",
                    late ? "text-late" : "text-muted-foreground",
                  )}
                >
                  {when}
                </span>
              </>
            );
            return (
              <li key={r.id}>
                {dress ? (
                  <Link
                    to="/rentals/$dressId"
                    params={{ dressId: dress.id }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** صندوق التأمينات: الرصيد حسب طريقة الدفع وقائمة العميلات اللي لهن تأمين عندنا */
function DepositBoxCard({
  records,
  dressById,
}: {
  records: RentalRecord[];
  dressById: Map<string, RentalDress>;
}) {
  const held = records.map((r) => ({ r, amount: rentalMoney(r).depositHeld }));
  const total = held.reduce((sum, h) => sum + h.amount, 0);
  const byMethod = new Map<string, number>();
  held.forEach(({ r, amount }) => {
    const key = r.deposit_method ? PAYMENT_METHOD_LABEL[r.deposit_method] : "غير محدد";
    byMethod.set(key, (byMethod.get(key) ?? 0) + amount);
  });

  return (
    <Card
      title="صندوق التأمينات"
      action={<span className="num text-[15px] font-medium">{money(total)}</span>}
    >
      <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 text-[12px]">
        {[...byMethod.entries()].map(([label, amount]) => (
          <span key={label} className="rounded-md bg-ivory px-2 py-1">
            <span className="text-muted-foreground">{label} </span>
            <span className="num">{money(amount)}</span>
          </span>
        ))}
      </div>
      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
        {held.map(({ r, amount }) => (
          <li key={r.id}>
            <Link
              to="/rentals/$dressId"
              params={{ dressId: r.dress_id }}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-ivory"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{r.client_name}</span>
                <span className="block text-[12px] text-muted-foreground">
                  ترجع {fmtDate(r.due_date)}
                  {r.deposit_method ? ` · ${PAYMENT_METHOD_LABEL[r.deposit_method]}` : ""}
                </span>
              </span>
              <span className="num text-[12px] text-gold">{dressById.get(r.dress_id)?.code ?? "—"}</span>
              <span className="num text-[13px]">{money(amount)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
