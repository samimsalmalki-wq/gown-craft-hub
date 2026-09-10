import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Card, Chip, Empty, PriorityChip, StageStatusChip } from "@/components/kit";
import { StageSheet } from "@/components/StageWork";
import { useCurrentAccount } from "@/hooks/useSession";
import { useMyTasks, type StageWithOrder } from "@/lib/data";
import {
  OPEN_STATUSES,
  PRIORITY_ORDER,
  fmtDate,
  fmtDateTime,
  isStageLate,
  stageLabel,
  stageLateDays,
  type OrderStage,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "مهامي · مَعْمَل" },
      { name: "description", content: "المراحل المُسندة إليك مع مواعيدها وأولويتها." },
      { property: "og:title", content: "مهامي · مَعْمَل" },
      { property: "og:description", content: "المراحل المُسندة إليك مع مواعيدها وأولويتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const { userId, profile } = useCurrentAccount();
  const { data: tasks = [] } = useMyTasks(userId);
  const [active, setActive] = useState<OrderStage | null>(null);

  const open = tasks
    .filter((t) => OPEN_STATUSES.includes(t.status))
    .sort(
      (a, b) =>
        PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] ||
        (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"),
    );
  const done = tasks.filter((t) => t.status === "done").slice(0, 20);

  return (
    <AppShell
      eyebrow="مهامي"
      title={`مهام ${profile?.full_name || "اليوم"}`}
      subtitle="المراحل المُسندة إليك مرتبة بالأولوية وموعد الإنجاز."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={`مهام مفتوحة (${open.length})`}>
          {open.length === 0 ? (
            <Empty>لا توجد مهام مفتوحة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {open.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => setActive(t)} />
              ))}
            </ul>
          )}
        </Card>

        <Card title="آخر ما أنجزته">
          {done.length === 0 ? (
            <Empty>لا يوجد إنجاز مسجّل بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {done.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium">
                      {stageLabel(t.stage)} · {t.orders?.client_name}
                    </span>
                    <StageStatusChip status={t.status} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    انتهت {fmtDateTime(t.completed_at)}
                  </p>
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

function TaskRow({ task, onOpen }: { task: StageWithOrder; onOpen: () => void }) {
  const late = isStageLate(task);
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-[14px] font-medium">{stageLabel(task.stage)}</span>
        <PriorityChip priority={task.priority} />
        {late && <Chip tone="late">متأخرة {stageLateDays(task)} يوم</Chip>}
        <StageStatusChip status={task.status} />
      </div>
      <p className="mt-1 text-[12px] text-muted-foreground">
        {task.orders ? (
          <Link to="/orders/$orderId" params={{ orderId: task.order_id }} className="text-gold">
            {task.orders.order_no} · {task.orders.client_name}
          </Link>
        ) : (
          "—"
        )}
        {task.due_at ? ` · الاستحقاق ${fmtDate(task.due_at)}` : ""}
      </p>
      <button onClick={onOpen} className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[12px]">
        فتح المهمة
      </button>
    </li>
  );
}
