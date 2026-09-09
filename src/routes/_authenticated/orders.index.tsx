import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Card, Chip, Empty, PaymentChip } from "@/components/kit";
import { useOrders } from "@/lib/data";
import {
  ORDER_STATE_LABEL,
  fmtDate,
  isLate,
  money,
  remaining,
  stageLabel,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/orders/")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const raw = search["q"];
    return { q: typeof raw === "string" && raw ? raw : undefined };
  },
  component: OrdersPage,
});

function OrdersPage() {
  const { q } = Route.useSearch();
  const { data: orders = [], isLoading } = useOrders();
  const [term, setTerm] = useState(q ?? "");

  const needle = (term || "").trim().toLowerCase();
  const list = orders.filter((o) =>
    !needle
      ? true
      : [o.order_no, o.client_name, o.client_phone ?? "", o.client_contact ?? ""].some((v) =>
          v.toLowerCase().includes(needle),
        ),
  );

  return (
    <AppShell
      eyebrow="السجل"
      title="الطلبات"
      subtitle="ابحث برقم الطلب أو اسم العميلة أو رقم الجوال."
      actions={
        <Link
          to="/orders/new"
          className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper ring-1 ring-black/10"
        >
          طلب جديد
        </Link>
      }
    >
      <div className="mb-4">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="field w-full max-w-md"
          placeholder="رقم الطلب / اسم العميلة / الجوال"
        />
      </div>

      <Card>
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : list.length === 0 ? (
          <Empty>لا توجد نتائج مطابقة.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((o) => (
              <li key={o.id}>
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="block px-4 py-4 hover:bg-ivory"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="num text-[16px] text-gold">{o.order_no}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {o.client_name}
                    </span>
                    <Chip>{stageLabel(o.current_stage)}</Chip>
                    <PaymentChip status={o.payment_status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                    <span dir="ltr">{o.client_phone || "—"}</span>
                    <span className={isLate(o) ? "text-late" : undefined}>
                      التسليم: {fmtDate(o.due_date)}
                    </span>
                    <span className="num">{money(o.total_amount)}</span>
                    <span className="num">المتبقي: {money(remaining(o))}</span>
                    <span>{ORDER_STATE_LABEL[o.state]}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
