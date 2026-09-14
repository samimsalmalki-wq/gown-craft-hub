import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Card, Chip, Empty, Field, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useOrders } from "@/lib/data";
import { usePayments } from "@/lib/finance-data";
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
  const total = rows.reduce((s, p) => s + Number(p.amount), 0);
  const orderOf = (id: string | null) => orders.find((o) => o.id === id);

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

      <div className="my-5 grid grid-cols-2 gap-3">
        <Stat label="عدد السندات" value={rows.length} />
        <Stat label="إجمالي التحصيل" value={money(total)} tone="gold" />
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
                    {order && (
                      <Link
                        to="/orders/$orderId"
                        params={{ orderId: order.id }}
                        className="text-[12px] text-gold"
                      >
                        {order.client_name}
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
