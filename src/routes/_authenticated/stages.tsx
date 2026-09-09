import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Card, Chip, Empty } from "@/components/kit";
import { useOrders } from "@/lib/data";
import { STAGES, fmtDate, isLate } from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/stages")({
  component: StagesPage,
});

function StagesPage() {
  const { data: orders = [], isLoading } = useOrders();
  const active = orders.filter((o) => o.state === "active");

  return (
    <AppShell
      eyebrow="سير العمل"
      title="المراحل"
      subtitle="توزيع الفساتين النشطة على المراحل الثلاث عشرة."
    >
      {isLoading ? (
        <Empty>جاري التحميل…</Empty>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map((s) => {
            const list = active.filter((o) => o.current_stage === s.key);
            return (
              <div key={s.key} className="w-64 shrink-0">
                <Card
                  title={s.label}
                  action={<Chip>{list.length}</Chip>}
                  className="h-full"
                >
                  {list.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">—</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {list.map((o) => (
                        <li key={o.id}>
                          <Link
                            to="/orders/$orderId"
                            params={{ orderId: o.id }}
                            className="block px-4 py-3 hover:bg-ivory"
                          >
                            <p className="num text-[13px] text-gold">{o.order_no}</p>
                            <p className="truncate text-[13px] font-medium">{o.client_name}</p>
                            <p className={isLate(o) ? "text-[11px] text-late" : "text-[11px] text-muted-foreground"}>
                              {fmtDate(o.due_date)}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
