import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Card, Chip, Empty, Field, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useRentalRecords } from "@/lib/inventory-data";
import { useOrders } from "@/lib/data";
import { useCashVouchers, usePayments } from "@/lib/finance-data";
import { fmtDate, money } from "@/lib/atelier";
import { PAYMENT_METHOD_LABEL, monthStartISO, todayISO } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/payments")({
  head: () => ({
    meta: [
      { title: "سجل التحصيل · مَعْمَل" },
      {
        name: "description",
        content: "كل سندات القبض والدفعات المسجّلة مع طريقة الدفع والتاريخ والمرجع.",
      },
      { property: "og:title", content: "سجل التحصيل · مَعْمَل" },
      {
        property: "og:description",
        content: "كل سندات القبض والدفعات المسجّلة في نظام الورشة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { can, ready } = useCurrentAccount();
  const { data: payments = [] } = usePayments();
  const { data: orders = [] } = useOrders();
  const { data: rentals = [] } = useRentalRecords();
  const { data: vouchers = [] } = useCashVouchers();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  if (ready && !(can("finance.payments") || can("finance.reports"))) {
    return (
      <AppShell title="سجل التحصيل">
        <Empty>لا تملك صلاحية عرض سجل التحصيل.</Empty>
      </AppShell>
    );
  }

  const rows = payments.filter((p) => p.paid_at >= from && p.paid_at <= to);
  // سندات التأمين تظهر في القائمة لكنها أمانة، فلا تدخل في مجموع التحصيل
  const total = rows
    .filter((p) => !p.is_security_deposit)
    .reduce((s, p) => s + Number(p.amount), 0);
  const orderOf = (id: string | null) => orders.find((o) => o.id === id);
  const rentalOf = (id: string | null) => rentals.find((r) => r.id === id);
  const periodVouchers = vouchers.filter((v) => v.paid_at >= from && v.paid_at <= to);
  const vouchersTotal = periodVouchers.reduce((sum, v) => sum + Number(v.amount), 0);

  return (
    <AppShell eyebrow="الماليات" title="سجل التحصيل" subtitle="سندات القبض والدفعات">
      <FinanceTabs />

      <Card title="الفترة">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <Field label="من تاريخ">
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="عدد سندات القبض" value={rows.length} />
        <Stat label="إجمالي التحصيل" value={money(total)} tone="gold" hint="بدون التأمينات" />
        <Stat label="سندات الصرف" value={money(vouchersTotal)} tone="late" hint={`${periodVouchers.length} سند`} />
      </div>

      <Card title="السندات">
        {rows.length === 0 ? (
          <Empty>لا توجد دفعات في هذه الفترة.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((p) => {
              const order = orderOf(p.order_id);
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">
                      سند {p.receipt_no} · <span className="num">{money(p.amount)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(p.paid_at)} · {PAYMENT_METHOD_LABEL[p.method]}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.scope === "rental" && <Chip tone="neutral">إيجار</Chip>}
                    {p.scope === "sale" && <Chip tone="gold">بيع بضاعة</Chip>}
                    {p.is_security_deposit && <Chip tone="soon">تأمين — أمانة</Chip>}
                    {order && (
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: order.id }}
                        className="text-[12px] text-gold"
                      >
                        {order.client_name}
                      </Link>
                    )}
                    {!order && rentalOf(p.rental_record_id) && (
                      <Link
                        to="/rentals/$dressId"
                        params={{ dressId: rentalOf(p.rental_record_id)!.dress_id }}
                        className="text-[12px] text-gold"
                      >
                        {rentalOf(p.rental_record_id)!.client_name}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="سندات الصرف" className="mt-5">
        {periodVouchers.length === 0 ? (
          <Empty>لا توجد سندات صرف في هذه الفترة.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {periodVouchers.map((v) => {
              const rental = rentalOf(v.rental_record_id);
              return (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">
                      سند {v.voucher_no} · <span className="num">{money(v.amount)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(v.paid_at)} · {PAYMENT_METHOD_LABEL[v.method]}
                      {v.notes ? ` · ${v.notes}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={v.kind === "deposit_refund" ? "soon" : "late"}>
                      {v.kind === "deposit_refund"
                        ? "رد تأمين"
                        : v.kind === "sale_refund"
                          ? "مرتجع بيع"
                          : "رد إلغاء حجز"}
                    </Chip>
                    {rental && (
                      <Link
                        to="/rentals/$dressId"
                        params={{ dressId: rental.dress_id }}
                        className="text-[12px] text-gold"
                      >
                        {rental.client_name}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
