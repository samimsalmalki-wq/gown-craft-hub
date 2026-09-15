import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import {
  DRESS_STATUS_LABEL,
  RETURN_CONDITIONS,
  effectiveDressStatus,
  isOutNow,
  isRentalLate,
  isUpcomingRental,
  type DressStatus,
} from "@/lib/inventory";
import {
  useInventoryUrls,
  useRentalDress,
  useRentalRecords,
  useReturnRental,
  useSetDressStatus,
  useStartRental,
} from "@/lib/inventory-data";

export const Route = createFileRoute("/_authenticated/rentals/$dressId")({
  head: () => ({
    meta: [
      { title: "فستان إيجار · مَعْمَل" },
      { name: "description", content: "حالة الفستان وسجل إيجاراته ومواعيد الخروج والإرجاع." },
      { property: "og:title", content: "فستان إيجار · مَعْمَل" },
      { property: "og:description", content: "حالة الفستان وسجل إيجاراته ومواعيد الخروج والإرجاع." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DressPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function DressPage() {
  const { dressId } = Route.useParams();
  const { isManager } = useCurrentAccount();
  const { data: dress, isLoading } = useRentalDress(dressId);
  const { data: records = [] } = useRentalRecords(dressId);
  const startRental = useStartRental();
  const returnRental = useReturnRental();
  const setStatus = useSetDressStatus();

  const urls = useInventoryUrls([dress?.image_path]);
  const image = dress?.image_path ? urls[dress.image_path] : undefined;

  const openRecord = records.find(isOutNow) ?? null;
  const nextUpcoming =
    [...records].filter(isUpcomingRental).sort((a, b) => a.out_date.localeCompare(b.out_date))[0] ?? null;
  const effStatus = dress ? effectiveDressStatus(dress, records) : "available";

  const [outOpen, setOutOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    out_date: today(),
    due_date: today(),
    amount: "",
    deposit_amount: "",
    notes: "",
  });
  const [ret, setRet] = useState({ condition: "ok", notes: "" });
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) {
    return (
      <AppShell title="فستان الإيجار">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }
  if (!dress) {
    return (
      <AppShell title="فستان الإيجار">
        <Empty>هذا الفستان غير موجود.</Empty>
      </AppShell>
    );
  }

  async function submitOut(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim()) return;
    setErr(null);
    if (form.due_date < form.out_date) {
      setErr("تاريخ الإرجاع لا يمكن أن يكون قبل تاريخ الخروج.");
      return;
    }
    const clash = records.find(
      (r) => !r.returned_at && r.out_date <= form.due_date && r.due_date >= form.out_date,
    );
    if (clash) {
      setErr(`الفستان محجوز من ${fmtDate(clash.out_date)} إلى ${fmtDate(clash.due_date)} لـ${clash.client_name}.`);
      return;
    }
    try {
      await startRental.mutateAsync({
        dress_id: dressId,
        client_name: form.client_name.trim(),
        client_phone: form.client_phone.trim() || null,
        out_date: form.out_date,
        due_date: form.due_date,
        amount: Number(form.amount) || Number(dress!.rent_price),
        deposit_amount: Number(form.deposit_amount) || Number(dress!.deposit_amount),
        notes: form.notes.trim() || null,
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "تعذّر تسجيل الإيجار.");
      return;
    }
    setOutOpen(false);
    setForm({
      client_name: "",
      client_phone: "",
      out_date: today(),
      due_date: today(),
      amount: "",
      deposit_amount: "",
      notes: "",
    });
  }

  async function submitReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!openRecord) return;
    await returnRental.mutateAsync({
      id: openRecord.id,
      returned_at: new Date().toISOString(),
      return_condition: ret.condition,
      notes: ret.notes.trim() || null,
    });
    setRetOpen(false);
    setRet({ condition: "ok", notes: "" });
  }

  return (
    <AppShell
      eyebrow="فساتين الإيجار"
      title={`فستان ${dress.code}`}
      subtitle={[dress.model_no, dress.color, dress.size].filter(Boolean).join(" · ") || "فستان إيجار"}
      actions={
        <>
          {(openRecord ?? nextUpcoming) && (
            <WhatsAppButton rental={{ record: (openRecord ?? nextUpcoming)!, dress }} />
          )}
          {isManager ? (
            openRecord ? (
              <Btn onClick={() => setRetOpen(true)}>تسجيل الإرجاع</Btn>
            ) : (
              <Btn onClick={() => setOutOpen(true)} disabled={effStatus === "retired"}>
                تأجير الفستان أو حجزه
              </Btn>
            )
          ) : null}
          {isManager && (
            <Link
              to="/orders/new"
              search={{ kind: "rental_stock", model: dress.model_no ?? undefined }}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-paper px-4 text-sm font-medium"
            >
              طلب إنتاج قطعة بديلة
            </Link>
          )}
        </>
      }
    >
      <Link to="/rentals" className="mb-4 inline-block text-[13px] text-muted-foreground">
        ← رجوع لفساتين الإيجار
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card title="بيانات الفستان">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="الحالة" value={DRESS_STATUS_LABEL[effStatus]} />
              {nextUpcoming && (
                <Row label="حجز قادم" value={`${nextUpcoming.client_name} — من ${fmtDate(nextUpcoming.out_date)}`} />
              )}
              <Row label="قيمة الإيجار" value={money(Number(dress.rent_price))} />
              <Row label="مبلغ التأمين" value={money(Number(dress.deposit_amount))} />
              <Row label="المقاس" value={dress.size || "—"} />
              <Row label="اللون" value={dress.color || "—"} />
              <Row label="رقم الموديل" value={dress.model_no || "—"} />
            </dl>
            {dress.notes && (
              <p className="border-t border-line px-4 py-3 text-[13px] whitespace-pre-wrap">{dress.notes}</p>
            )}
            {isManager && !openRecord && (
              <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                {(["available", "cleaning", "repair", "retired"] as DressStatus[]).map((s) => (
                  <Btn
                    key={s}
                    variant={effStatus === s ? "gold" : "quiet"}
                    onClick={() => setStatus.mutate({ id: dress.id, status: s })}
                  >
                    {DRESS_STATUS_LABEL[s]}
                  </Btn>
                ))}
              </div>
            )}
          </Card>

          {image && (
            <Card title="صورة الفستان">
              <img src={image} alt={dress.code} className="w-full rounded-b-xl object-cover" />
            </Card>
          )}
        </div>

        <Card title="سجل الإيجارات">
          {records.length === 0 ? (
            <Empty>لا توجد إيجارات مسجلة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {records.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[14px] font-medium">{r.client_name}</span>
                    {r.client_phone && <span className="num text-[12px] text-muted-foreground">{r.client_phone}</span>}
                    {r.returned_at ? (
                      <Chip tone="ok">تم الإرجاع</Chip>
                    ) : isUpcomingRental(r) ? (
                      <Chip tone="soon">حجز قادم</Chip>
                    ) : isRentalLate(r) ? (
                      <Chip tone="late">متأخر الإرجاع</Chip>
                    ) : (
                      <Chip tone="gold">خارج المحل</Chip>
                    )}
                    <span className="num mr-auto text-[13px]">{money(Number(r.amount))}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    خرج {fmtDate(r.out_date)} · الإرجاع {fmtDate(r.due_date)}
                    {r.returned_at ? ` · رجع ${fmtDate(r.returned_at)}` : ""}
                  </p>
                  {r.notes && <p className="mt-1 text-[12px]">{r.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Sheet open={outOpen} onClose={() => setOutOpen(false)} title="تأجير الفستان أو حجزه">
        <form onSubmit={submitOut} className="space-y-4 p-4">
          {err && (
            <p className="rounded-lg bg-late/10 px-3 py-2 text-[13px] text-late">{err}</p>
          )}
          <p className="text-[12px] text-muted-foreground">
            إذا كان تاريخ الخروج في المستقبل يبقى الفستان متاحًا في المحل ويظهر كحجز قادم حتى يوم الخروج.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم العميلة">
              <input
                className="field w-full"
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                required
              />
            </Field>
            <Field label="رقم الجوال">
              <input
                className="field w-full"
                value={form.client_phone}
                onChange={(e) => setForm({ ...form, client_phone: e.target.value })}
              />
            </Field>
            <Field label="تاريخ الخروج">
              <input
                type="date"
                className="field w-full"
                value={form.out_date}
                onChange={(e) => setForm({ ...form, out_date: e.target.value })}
                required
              />
            </Field>
            <Field label="تاريخ الإرجاع المتوقع">
              <input
                type="date"
                className="field w-full"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                required
              />
            </Field>
            <Field label="قيمة الإيجار" hint={`الافتراضي ${money(Number(dress.rent_price))}`}>
              <input
                type="number"
                min="0"
                step="0.01"
                className="field w-full"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="التأمين" hint={`الافتراضي ${money(Number(dress.deposit_amount))}`}>
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
          <Field label="ملاحظات">
            <textarea
              className="field w-full"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <Btn type="submit" className="w-full" disabled={startRental.isPending}>
            {startRental.isPending ? "جاري التسجيل…" : "تسجيل الإيجار"}
          </Btn>
        </form>
      </Sheet>

      <Sheet open={retOpen} onClose={() => setRetOpen(false)} title="تسجيل الإرجاع">
        <form onSubmit={submitReturn} className="space-y-4 p-4">
          <Field label="حالة الفستان عند الإرجاع">
            <select
              className="field w-full"
              value={ret.condition}
              onChange={(e) => setRet({ ...ret, condition: e.target.value })}
            >
              {RETURN_CONDITIONS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ملاحظات">
            <textarea
              className="field w-full"
              rows={2}
              value={ret.notes}
              onChange={(e) => setRet({ ...ret, notes: e.target.value })}
            />
          </Field>
          <Btn type="submit" className="w-full" disabled={returnRental.isPending}>
            {returnRental.isPending ? "جاري التسجيل…" : "تأكيد الإرجاع"}
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
