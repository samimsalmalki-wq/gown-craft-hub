import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Card, Chip, Empty, Stat, StageStatusChip } from "@/components/kit";
import { StageSheet } from "@/components/StageWork";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { useOrders, useStagesWithOrders } from "@/lib/data";
import {
  daysUntilDue,
  fmtDate,
  isDueSoon,
  isLate,
  isStageLate,
  stageLabel,
  stageLateDays,
  type OrderStage,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/late")({
  head: () => ({
    meta: [
      { title: "المتأخرات · مَعْمَل" },
      { name: "description", content: "الطلبات والمراحل المتأخرة عن موعدها مع سبب التأخير." },
      { property: "og:title", content: "المتأخرات · مَعْمَل" },
      { property: "og:description", content: "الطلبات والمراحل المتأخرة عن موعدها مع سبب التأخير." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LatePage,
});

function LatePage() {
  const { data: orders = [] } = useOrders();
  const { data: rows = [] } = useStagesWithOrders();
  const [active, setActive] = useState<OrderStage | null>(null);

  const lateOrders = orders.filter(isLate);
  const soonOrders = orders.filter(isDueSoon);
  const lateStages = rows.filter((r) => r.orders?.state === "active" && isStageLate(r));
  const blocked = rows.filter((r) => r.orders?.state === "active" && r.status === "blocked");

  return (
    <AppShell
      eyebrow="المتابعة"
      title="المتأخرات والتنبيهات"
      subtitle="ما تجاوز موعده وما يقترب منه، ومَن يعمل عليه الآن."
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="طلبات متأخرة" value={lateOrders.length} tone="late" />
        <Stat label="قريبة من التسليم" value={soonOrders.length} tone="soon" />
        <Stat label="مراحل متأخرة" value={lateStages.length} tone="late" />
        <Stat label="مراحل متوقفة" value={blocked.length} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="طلبات تجاوزت موعد التسليم">
          {lateOrders.length === 0 ? (
            <Empty>لا توجد طلبات متأخرة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {lateOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: o.id }}
                      className="text-[13.5px] font-medium"
                    >
                      {o.client_name}
                    </Link>
                    <p className="num text-[11px] text-gold">{o.order_no}</p>
                  </div>
                  <Chip tone="late">متأخر {Math.abs(daysUntilDue(o) ?? 0)} يوم</Chip>
                  <span className="text-[11px] text-muted-foreground">{fmtDate(o.due_date)}</span>
                  <WhatsAppButton order={o} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="مراحل متأخرة أو متوقفة">
          {lateStages.length + blocked.length === 0 ? (
            <Empty>كل المراحل داخل موعدها.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {[...lateStages, ...blocked.filter((b) => !lateStages.includes(b))].map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium">
                      {stageLabel(r.stage)} · {r.orders?.client_name}
                    </span>
                    {isStageLate(r) && <Chip tone="late">{stageLateDays(r)} يوم</Chip>}
                    <StageStatusChip status={r.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    المسؤول: {r.assignee_name || "غير مُسند"}
                    {r.delay_reason ? ` · السبب: ${r.delay_reason}` : ""}
                  </p>
                  <button
                    onClick={() => setActive(r)}
                    className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[12px]"
                  >
                    معالجة
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <StageSheet stage={active} onClose={() => setActive(null)} />
    </AppShell>
  );
}
