import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Card, Chip, Empty, PaymentChip, Stat } from "@/components/kit";
import { useOrders } from "@/lib/data";
import { useMaterials, useRentalDresses, useRentalRecords } from "@/lib/inventory-data";
import { available, isLowStock, isRentalLate, qty } from "@/lib/inventory";
import {
  STAGES,
  fmtDate,
  inProduction,
  isDueSoon,
  isFinanciallyOpen,
  isLate,
  isNew,
  money,
  remaining,
  stageLabel,
  type Order,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

type FilterKey =
  | "all"
  | "new"
  | "production"
  | "late"
  | "soon"
  | "fitting"
  | "alterations"
  | "finance"
  | "own"
  | "rental"
  | "rental_stock";

const FILTERS: { key: FilterKey; label: string; test: (o: Order) => boolean }[] = [
  { key: "all", label: "كل الطلبات", test: () => true },
  { key: "new", label: "طلبات جديدة", test: isNew },
  { key: "production", label: "قيد التصنيع", test: inProduction },
  { key: "late", label: "متأخرة", test: isLate },
  { key: "soon", label: "قريبة التسليم", test: isDueSoon },
  {
    key: "fitting",
    label: "تنتظر بروفة",
    test: (o) => o.state === "active" && (o.current_stage === "fitting1" || o.current_stage === "fitting2"),
  },
  {
    key: "alterations",
    label: "تحتاج تعديلات",
    test: (o) => o.state === "active" && o.current_stage === "alterations",
  },
  { key: "finance", label: "غير مكتملة ماليًا", test: (o) => isFinanciallyOpen(o) },
  { key: "own", label: "تفصيل ملك", test: (o) => o.order_kind === "own" },
  { key: "rental", label: "تفصيل إيجار", test: (o) => o.order_kind === "rental" },
  { key: "rental_stock", label: "إنتاج للإيجار", test: (o) => o.order_kind === "rental_stock" },
];

function DashboardPage() {
  const { data: orders = [], isLoading } = useOrders();
  const { data: materials = [] } = useMaterials();
  const { data: dresses = [] } = useRentalDresses();
  const { data: rentals = [] } = useRentalRecords();
  const [filter, setFilter] = useState<FilterKey>("new");

  const lowMaterials = materials.filter((m) => m.is_active && isLowStock(m));
  const lateRentals = rentals.filter(isRentalLate);

  const count = (key: FilterKey) =>
    orders.filter(FILTERS.find((f) => f.key === key)!.test).length;

  const list = useMemo(
    () => orders.filter(FILTERS.find((f) => f.key === filter)!.test),
    [orders, filter],
  );

  const perStage = STAGES.map((s) => ({
    ...s,
    count: orders.filter((o) => o.state === "active" && o.current_stage === s.key).length,
  }));

  return (
    <AppShell
      eyebrow="نظرة عامة"
      title="لوحة التحكم"
      subtitle="حالة الورشة اليوم — اضغط أي بطاقة لعرض طلباتها."
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="طلبات جديدة" value={count("new")} onClick={() => setFilter("new")} active={filter === "new"} />
        <Stat label="قيد التصنيع" value={count("production")} onClick={() => setFilter("production")} active={filter === "production"} />
        <Stat label="متأخرة" value={count("late")} tone="late" onClick={() => setFilter("late")} active={filter === "late"} />
        <Stat label="قريبة التسليم" value={count("soon")} tone="soon" hint="خلال ٧ أيام" onClick={() => setFilter("soon")} active={filter === "soon"} />
        <Stat label="تنتظر بروفة" value={count("fitting")} tone="gold" onClick={() => setFilter("fitting")} active={filter === "fitting"} />
        <Stat label="تحتاج تعديلات" value={count("alterations")} onClick={() => setFilter("alterations")} active={filter === "alterations"} />
        <Stat label="غير مكتملة ماليًا" value={count("finance")} tone="gold" onClick={() => setFilter("finance")} active={filter === "finance"} />
        <Stat label="كل الطلبات" value={orders.length} onClick={() => setFilter("all")} active={filter === "all"} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card title={FILTERS.find((f) => f.key === filter)!.label}>
          {isLoading ? (
            <Empty>جاري التحميل…</Empty>
          ) : list.length === 0 ? (
            <Empty>لا توجد طلبات في هذه القائمة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((o) => (
                <li key={o.id}>
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 hover:bg-ivory"
                  >
                    <span className="num text-[15px] text-gold">{o.order_no}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{o.client_name}</span>
                    <Chip>{stageLabel(o.current_stage)}</Chip>
                    <span className={isLate(o) ? "text-[12px] text-late" : "text-[12px] text-muted-foreground"}>
                      {fmtDate(o.due_date)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="الفساتين في كل مرحلة">
            <ul className="divide-y divide-line">
              {perStage.map((s) => (
                <li key={s.key} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
                  <span>{s.label}</span>
                  <span className="num text-[16px]">{s.count}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="متبقيات مالية">
            {orders.filter(isFinanciallyOpen).length === 0 ? (
              <Empty>كل الطلبات مسددة.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {orders
                  .filter(isFinanciallyOpen)
                  .slice(0, 8)
                  .map((o) => (
                    <li key={o.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                      <span className="num text-gold">{o.order_no}</span>
                      <span className="min-w-0 flex-1 truncate">{o.client_name}</span>
                      <span className="num">{money(remaining(o))}</span>
                      <PaymentChip status={o.payment_status} />
                    </li>
                  ))}
              </ul>
            )}
          </Card>

          <Card title="مواد تحت حد التنبيه">
            {lowMaterials.length === 0 ? (
              <Empty>كل المواد فوق حد التنبيه.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {lowMaterials.slice(0, 8).map((m) => (
                  <li key={m.id}>
                    <Link
                      to="/inventory/$materialId"
                      params={{ materialId: m.id }}
                      className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-ivory"
                    >
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      <span className="num text-late">
                        {qty(available(m))} {m.unit}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="فساتين إيجار متأخرة الإرجاع">
            {lateRentals.length === 0 ? (
              <Empty>لا توجد فساتين متأخرة.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {lateRentals.slice(0, 8).map((r) => {
                  const dress = dresses.find((d) => d.id === r.dress_id);
                  return (
                    <li key={r.id}>
                      <Link
                        to="/rentals/$dressId"
                        params={{ dressId: r.dress_id }}
                        className="flex items-center gap-2 px-4 py-2.5 text-[13px] hover:bg-ivory"
                      >
                        <span className="num text-gold">{dress?.code ?? "—"}</span>
                        <span className="min-w-0 flex-1 truncate">{r.client_name}</span>
                        <span className="text-[12px] text-late">{fmtDate(r.due_date)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
