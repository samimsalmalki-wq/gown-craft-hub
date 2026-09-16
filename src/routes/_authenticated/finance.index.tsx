import { Link, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";

import { Btn, Card, Chip, Empty, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useOrders } from "@/lib/data";
import { usePayments, useTaxSettings } from "@/lib/finance-data";
import { fmtDate, isLate, money } from "@/lib/atelier";
import { monthKey, monthLabel, monthStartISO, orderDue, todayISO } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/")({
  head: () => ({
    meta: [
      { title: "الماليات · مَعْمَل" },
      {
        name: "description",
        content: "المستحقات والتحصيل والفواتير وضريبة القيمة المضافة لطلبات التفصيل وفساتين الإيجار.",
      },
      { property: "og:title", content: "الماليات · مَعْمَل" },
      {
        property: "og:description",
        content: "المستحقات والتحصيل والفواتير وضريبة القيمة المضافة في نظام الورشة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinancePage,
});

function FinancePage() {
  const { can, ready } = useCurrentAccount();
  const { data: orders = [] } = useOrders();
  const { data: payments = [] } = usePayments();
  const { data: tax } = useTaxSettings();

  const allowed = can("finance.payments") || can("finance.invoices") || can("finance.reports");
  if (ready && !allowed) {
    return (
      <AppShell title="الماليات">
        <Empty>لا تملك صلاحية عرض الماليات.</Empty>
      </AppShell>
    );
  }

  const active = orders.filter((o) => o.state !== "cancelled");
  const totalValue = active.reduce((s, o) => s + Number(o.total_amount), 0);
  const totalCollected = active.reduce((s, o) => s + Number(o.deposit_amount), 0);
  const outstanding = active.reduce((s, o) => s + orderDue(o), 0);
  const lateDue = active.filter((o) => isLate(o) && orderDue(o) > 0);

  const thisMonth = monthStartISO();
  const today = todayISO();
  const monthCollected = payments
    .filter((p) => p.paid_at >= thisMonth && p.paid_at <= today)
    .reduce((s, p) => s + Number(p.amount), 0);

  const byMonth = new Map<string, number>();
  for (const p of payments) {
    const k = monthKey(p.paid_at);
    byMonth.set(k, (byMonth.get(k) ?? 0) + Number(p.amount));
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);

  const receivables = active
    .filter((o) => orderDue(o) > 0)
    .sort((a, b) => orderDue(b) - orderDue(a));

  return (
    <AppShell
      eyebrow="الماليات"
      title="لوحة الماليات"
      subtitle={`ضريبة القيمة المضافة ${tax?.vat_enabled ? `${Number(tax.vat_rate)}%` : "غير مفعّلة"}`}
      actions={
        <Link to="/finance/payments">
          <Btn variant="quiet">سجل التحصيل</Btn>
        </Link>
      }
    >
      <FinanceTabs />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="إجمالي قيمة الطلبات" value={money(totalValue)} />
        <Stat label="المحصَّل" value={money(totalCollected)} tone="gold" />
        <Stat label="المستحق" value={money(outstanding)} tone="late" hint={`${receivables.length} طلب`} />
        <Stat label="تحصيل هذا الشهر" value={money(monthCollected)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="المستحقات على الطلبات">
          {receivables.length === 0 ? (
            <Empty>لا توجد مستحقات — كل الطلبات مسدَّدة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {receivables.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ivory"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{o.client_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        طلب {o.order_no} · التسليم {fmtDate(o.due_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isLate(o) && <Chip tone="late">متأخر</Chip>}
                      <span className="num text-[14px]">{money(orderDue(o))}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="التحصيل شهريًا">
            {months.length === 0 ? (
              <Empty>لا توجد دفعات بعد.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {months.map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span>{monthLabel(k)}</span>
                    <span className="num">{money(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="متأخرات السداد" action={<Chip tone="late">{lateDue.length}</Chip>}>
            {lateDue.length === 0 ? (
              <Empty>لا توجد متأخرات سداد.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {lateDue.map((o) => (
                  <li key={o.id} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                    <span className="truncate">{o.client_name}</span>
                    <span className="num text-late">{money(orderDue(o))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

    </AppShell>
  );
}
