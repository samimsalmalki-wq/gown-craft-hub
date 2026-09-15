import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { OrdersTabs } from "@/components/OrdersTabs";
import { Btn, Card, Chip, Empty, Field, Sheet, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import {
  DRESS_STATUS_LABEL,
  effectiveDressStatus,
  isOutNow,
  isRentalLate,
  isUpcomingRental,
  type DressStatus,
} from "@/lib/inventory";
import { useRentalDresses, useRentalRecords, useSaveDress } from "@/lib/inventory-data";

export const Route = createFileRoute("/_authenticated/rentals/")({
  component: RentalsPage,
});

const STATUS_TONE: Record<DressStatus, "ok" | "gold" | "soon" | "late" | "neutral"> = {
  in_production: "soon",
  available: "ok",
  rented: "gold",
  cleaning: "soon",
  repair: "late",
  retired: "neutral",
};

function RentalsPage() {
  const { isManager } = useCurrentAccount();
  const { data: dresses = [], isLoading } = useRentalDresses();
  const { data: records = [] } = useRentalRecords();
  const save = useSaveDress();

  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<"all" | DressStatus>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    model_no: "",
    size: "",
    color: "",
    rent_price: "0",
    deposit_amount: "0",
    notes: "",
  });
  const [image, setImage] = useState<File | null>(null);

  const outNow = records.filter(isOutNow);
  const upcoming = records.filter(isUpcomingRental);
  const lateRecords = outNow.filter(isRentalLate);
  const lateDressIds = new Set(lateRecords.map((r) => r.dress_id));
  const upcomingByDress = new Map(upcoming.map((r) => [r.dress_id, r]));
  const statusOf = (d: { id: string; status: DressStatus }): DressStatus => effectiveDressStatus(d, records);

  const list = useMemo(
    () =>
      dresses.filter((d) => {
        if (status !== "all" && effectiveDressStatus(d, records) !== status) return false;
        const t = term.trim();
        if (!t) return true;
        return (
          d.code.includes(t) ||
          (d.model_no ?? "").includes(t) ||
          (d.color ?? "").includes(t) ||
          (d.size ?? "").includes(t)
        );
      }),
    [dresses, records, term, status],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) return;
    await save.mutateAsync({
      code: form.code.trim(),
      model_no: form.model_no.trim() || null,
      size: form.size.trim() || null,
      color: form.color.trim() || null,
      rent_price: Number(form.rent_price) || 0,
      deposit_amount: Number(form.deposit_amount) || 0,
      status: "available",
      notes: form.notes.trim() || null,
      image,
    });
    setOpen(false);
    setImage(null);
    setForm({ code: "", model_no: "", size: "", color: "", rent_price: "0", deposit_amount: "0", notes: "" });
  }

  return (
    <AppShell
      eyebrow="الطلبات"
      title="فساتين الإيجار"
      subtitle="حالة كل فستان وسجل إيجاراته ومواعيد الإرجاع."
      actions={isManager ? <Btn onClick={() => setOpen(true)}>فستان جديد</Btn> : undefined}
    >
      <OrdersTabs />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="عدد الفساتين" value={dresses.length} onClick={() => setStatus("all")} active={status === "all"} />
        <Stat
          label="متاح للإيجار"
          value={dresses.filter((d) => statusOf(d) === "available").length}
          onClick={() => setStatus("available")}
          active={status === "available"}
        />
        <Stat
          label="مؤجَّر حاليًا"
          value={dresses.filter((d) => statusOf(d) === "rented").length}
          tone="gold"
          onClick={() => setStatus("rented")}
          active={status === "rented"}
        />
        <Stat label="متأخر في الإرجاع" value={lateRecords.length} tone="late" />
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="field w-full sm:w-64"
          placeholder="ابحث بالكود أو الموديل أو اللون"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | DressStatus)}
          className="field w-full sm:w-44"
        >
          <option value="all">كل الحالات</option>
          {(Object.keys(DRESS_STATUS_LABEL) as DressStatus[]).map((s) => (
            <option key={s} value={s}>
              {DRESS_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title="الفساتين">
          {isLoading ? (
            <Empty>جاري التحميل…</Empty>
          ) : list.length === 0 ? (
            <Empty>لا توجد فساتين مطابقة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((d) => (
                <li key={d.id}>
                  <Link
                    to="/rentals/$dressId"
                    params={{ dressId: d.id }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 hover:bg-ivory"
                  >
                    <span className="num text-[15px] text-gold">{d.code}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px]">
                      {[d.model_no, d.color, d.size].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <Chip tone={STATUS_TONE[statusOf(d)]}>{DRESS_STATUS_LABEL[statusOf(d)]}</Chip>
                    {upcomingByDress.has(d.id) && (
                      <Chip tone="soon">محجوز من {fmtDate(upcomingByDress.get(d.id)!.out_date)}</Chip>
                    )}
                    {lateDressIds.has(d.id) && <Chip tone="late">متأخر الإرجاع</Chip>}
                    <span className="num text-[12px] text-muted-foreground">{money(Number(d.rent_price))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="خارج المحل الآن">
            {outNow.length === 0 ? (
              <Empty>لا توجد فساتين خارج المحل.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {outNow.slice(0, 12).map((r) => {
                  const dress = dresses.find((d) => d.id === r.dress_id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-[13px]">
                      <span className="num text-gold">{dress?.code ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{r.client_name}</span>
                      <span
                        className={isRentalLate(r) ? "text-[12px] text-late" : "text-[12px] text-muted-foreground"}
                      >
                        {fmtDate(r.due_date)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="حجوزات قادمة">
            {upcoming.length === 0 ? (
              <Empty>لا توجد حجوزات قادمة.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.slice(0, 12).map((r) => {
                  const dress = dresses.find((d) => d.id === r.dress_id);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-[13px]">
                      <span className="num text-gold">{dress?.code ?? "—"}</span>
                      <span className="min-w-0 flex-1 truncate">{r.client_name}</span>
                      <span className="text-[12px] text-muted-foreground">من {fmtDate(r.out_date)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="فستان إيجار جديد">
        <form onSubmit={submit} className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="كود الفستان">
              <input
                className="field w-full"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </Field>
            <Field label="رقم الموديل">
              <input
                className="field w-full"
                value={form.model_no}
                onChange={(e) => setForm({ ...form, model_no: e.target.value })}
              />
            </Field>
            <Field label="المقاس">
              <input
                className="field w-full"
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
              />
            </Field>
            <Field label="اللون">
              <input
                className="field w-full"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </Field>
            <Field label="قيمة الإيجار">
              <input
                type="number"
                min="0"
                step="0.01"
                className="field w-full"
                value={form.rent_price}
                onChange={(e) => setForm({ ...form, rent_price: e.target.value })}
              />
            </Field>
            <Field label="مبلغ التأمين">
              <input
                type="number"
                min="0"
                step="0.01"
                className="field w-full"
                value={form.deposit_amount}
                onChange={(e) => setForm({ ...form, deposit_amount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="صورة الفستان (اختياري)">
            <input
              type="file"
              accept="image/*"
              className="field w-full"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </Field>
          <Field label="ملاحظات">
            <textarea
              className="field w-full"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <Btn type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "جاري الحفظ…" : "حفظ الفستان"}
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}
