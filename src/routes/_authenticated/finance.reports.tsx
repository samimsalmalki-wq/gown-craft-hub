import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Card, Chip, Empty, Field, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useOrders } from "@/lib/data";
import { useMaterials, useRentalRecords } from "@/lib/inventory-data";
import {
  useAllOrderMaterials,
  useExpenses,
  useInvoices,
  usePayments,
  useTaxSettings,
} from "@/lib/finance-data";
import { daysUntilDue, fmtDate, money } from "@/lib/atelier";
import {
  AGING_BUCKETS,
  agingBucket,
  monthKey,
  monthLabel,
  monthStartISO,
  orderDue,
  todayISO,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/reports")({
  head: () => ({
    meta: [
      { title: "التقارير المالية · مَعْمَل" },
      {
        name: "description",
        content: "تقرير ضريبة القيمة المضافة والإيرادات الشهرية وربحية كل طلب وأعمار المستحقات.",
      },
      { property: "og:title", content: "التقارير المالية · مَعْمَل" },
      {
        property: "og:description",
        content: "الضريبة والإيرادات والربحية وأعمار المستحقات لطلبات التفصيل وفساتين الإيجار.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceReportsPage,
});

function FinanceReportsPage() {
  const { can, ready } = useCurrentAccount();
  const { data: orders = [] } = useOrders();
  const { data: payments = [] } = usePayments();
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();
  const { data: materials = [] } = useMaterials();
  const { data: rentals = [] } = useRentalRecords();
  const { data: tax } = useTaxSettings();
  const { data: orderMaterials = [] } = useAllOrderMaterials();

  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  if (ready && !can("finance.reports")) {
    return (
      <AppShell title="التقارير المالية">
        <Empty>لا تملك صلاحية عرض التقارير المالية.</Empty>
      </AppShell>
    );
  }

  const within = (d: string) => d >= from && d <= to;

  /* ضريبة القيمة المضافة */
  const periodInvoices = invoices.filter((i) => i.status === "issued" && within(i.issue_date));
  const outputTax = periodInvoices.reduce((s, i) => s + Number(i.tax_amount), 0);
  const taxableSales = periodInvoices.reduce((s, i) => s + Number(i.subtotal), 0);
  const periodExpenses = expenses.filter((e) => within(e.occurred_at));
  const inputTax = periodExpenses.reduce((s, e) => s + Number(e.vat_amount), 0);
  const netTax = outputTax - inputTax;

  /* الإيرادات والتحصيل شهريًا */
  const byMonth = new Map<string, { tailoring: number; rental: number }>();
  for (const p of payments) {
    const k = monthKey(p.paid_at);
    const row = byMonth.get(k) ?? { tailoring: 0, rental: 0 };
    if (p.scope === "rental") row.rental += Number(p.amount);
    else row.tailoring += Number(p.amount);
    byMonth.set(k, row);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);

  /* ربحية الطلبات: القيمة − تكلفة الخامات المصروفة */
  const orderMaterialCost = new Map<string, number>();
  for (const row of orderMaterials) {
    const unit = Number(materials.find((m) => m.id === row.material_id)?.unit_cost ?? 0);
    orderMaterialCost.set(
      row.order_id,
      (orderMaterialCost.get(row.order_id) ?? 0) + Number(row.qty_issued) * unit,
    );
  }
  const costOf = (orderId: string) => orderMaterialCost.get(orderId) ?? 0;

  const profitRows = orders
    .filter((o) => o.state !== "cancelled")
    .map((o) => {
      const revenue = Number(o.total_amount);
      const cost = costOf(o.id);
      return { order: o, revenue, cost, profit: revenue - cost };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  /* أعمار المستحقات */
  const aging = new Map<string, number>();
  for (const o of orders.filter((x) => x.state !== "cancelled" && orderDue(x) > 0)) {
    const late = -(daysUntilDue(o) ?? 0);
    const bucket = agingBucket(late);
    aging.set(bucket, (aging.get(bucket) ?? 0) + orderDue(o));
  }

  /* الإيجارات منفصلة */
  const periodRentals = rentals.filter((r) => within(r.out_date));
  const rentalRevenue = periodRentals.reduce((s, r) => s + Number(r.amount), 0);
  const rentalDeposits = periodRentals
    .filter((r) => !r.returned_at)
    .reduce((s, r) => s + Number(r.deposit_amount), 0);

  const tailoringCollected = payments
    .filter((p) => p.scope === "order" && within(p.paid_at))
    .reduce((s, p) => s + Number(p.amount), 0);
  const rentalCollected = payments
    .filter((p) => p.scope === "rental" && within(p.paid_at))
    .reduce((s, p) => s + Number(p.amount), 0);
  const periodExpenseTotal = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <AppShell
      eyebrow="الماليات"
      title="التقارير المالية"
      subtitle={`ضريبة القيمة المضافة ${tax?.vat_enabled ? `${Number(tax.vat_rate)}%` : "غير مفعّلة"}`}
    >
      <FinanceTabs />

      <Card title="الفترة" className="mb-5">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <Field label="من تاريخ">
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="تحصيل التفصيل" value={money(tailoringCollected)} tone="gold" />
        <Stat label="تحصيل الإيجار" value={money(rentalCollected)} />
        <Stat label="المصروفات" value={money(periodExpenseTotal)} tone="late" />
        <Stat
          label="صافي التدفق"
          value={money(tailoringCollected + rentalCollected - periodExpenseTotal)}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="تقرير ضريبة القيمة المضافة">
          <dl className="divide-y divide-line text-[13px]">
            <Row label="المبيعات الخاضعة" value={money(taxableSales)} />
            <Row label="ضريبة المخرجات" value={money(outputTax)} />
            <Row label="ضريبة المدخلات" value={money(inputTax)} />
            <Row
              label={netTax >= 0 ? "الضريبة المستحقة للدفع" : "الضريبة القابلة للاسترداد"}
              value={money(Math.abs(netTax))}
              strong
            />
          </dl>
          <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted-foreground">
            محسوبة من الفواتير الصادرة والمصروفات الخاضعة للضريبة في الفترة المحددة.
          </p>
        </Card>

        <Card title="الإيرادات شهريًا">
          {months.length === 0 ? (
            <Empty>لا توجد بيانات بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {months.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <span>{monthLabel(k)}</span>
                  <span className="flex items-center gap-3">
                    <span className="num">{money(v.tailoring)}</span>
                    <Chip tone="neutral">إيجار {money(v.rental)}</Chip>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="أعمار المستحقات">
          <ul className="divide-y divide-line">
            {AGING_BUCKETS.map((b) => (
              <li key={b} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                <span>{b}</span>
                <span className="num">{money(aging.get(b) ?? 0)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="تقرير الإيجارات (منفصل)">
          <dl className="divide-y divide-line text-[13px]">
            <Row label="عدد عقود الإيجار" value={String(periodRentals.length)} />
            <Row label="قيمة الإيجارات" value={money(rentalRevenue)} />
            <Row label="تأمينات لدى المحل" value={money(rentalDeposits)} />
            <Row label="التحصيل الفعلي" value={money(rentalCollected)} strong />
          </dl>
        </Card>

        <Card title="ربحية الطلبات" className="lg:col-span-2">
          {profitRows.length === 0 ? (
            <Empty>لا توجد طلبات.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {profitRows.map((r) => (
                <li
                  key={r.order.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{r.order.client_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      طلب {r.order.order_no} · التسليم {fmtDate(r.order.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[12px]">
                    <span className="num">{money(r.revenue)}</span>
                    <span className="num text-late">− {money(r.cost)}</span>
                    <span className="num text-ok">{money(r.profit)}</span>
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

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "num text-[15px] font-medium" : "num"}>{value}</dd>
    </div>
  );
}
