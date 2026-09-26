import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Avatar, Chip, Empty, PriorityChip, StageStatusChip } from "@/components/kit";
import { StageSheet } from "@/components/StageWork";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useMoveOrderStage,
  useOrderThumbs,
  useProfiles,
  useStageTemplates,
  useStagesWithOrders,
} from "@/lib/data";
import {
  dueTone,
  fmtDate,
  isStageLate,
  stageLabel,
  type OrderStage,
  type StageKey,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/stages")({
  head: () => ({
    meta: [
      { title: "لوحة الإنتاج · مَعْمَل" },
      { name: "description", content: "كل فستان في مرحلته الحالية مع الموظف المسؤول وحالة العمل." },
      { property: "og:title", content: "لوحة الإنتاج · مَعْمَل" },
      {
        property: "og:description",
        content: "كل فستان في مرحلته الحالية مع الموظف المسؤول وحالة العمل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BoardPage,
});

function BoardPage() {
  const { canManageStage } = useCurrentAccount();
  const { data: templates = [] } = useStageTemplates();
  const { data: rows = [] } = useStagesWithOrders();
  const { data: profiles = [] } = useProfiles();
  const thumbs = useOrderThumbs();
  const move = useMoveOrderStage();
  const [active, setActive] = useState<OrderStage | null>(null);
  const [employee, setEmployee] = useState("");

  const columns = templates.filter((t) => t.is_active);

  const visible = rows.filter(
    (r) =>
      r.orders &&
      r.orders.state === "active" &&
      r.orders.current_stage === r.stage &&
      (!employee || r.assignee_id === employee),
  );

  const avatarOf = (id: string | null) => profiles.find((p) => p.id === id)?.avatar_url ?? null;

  return (
    <AppShell
      eyebrow="الإنتاج"
      title="لوحة الإنتاج"
      subtitle="كل فستان في عموده الحالي — اضغط البطاقة لإدارة المرحلة."
      actions={
        <select className="field h-11 w-44" value={employee} onChange={(e) => setEmployee(e.target.value)}>
          <option value="">كل الموظفين</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
      }
    >
      {columns.length === 0 ? (
        <Empty>لا توجد مراحل مُفعّلة.</Empty>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:px-0">
          {columns.map((col) => {
            const cards = visible.filter((r) => r.stage === col.stage);
            return (
              <section
                key={col.id}
                className="w-[262px] shrink-0 rounded-xl border border-line bg-paper"
              >
                <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                  <h2 className="text-[13.5px] font-medium">{col.label}</h2>
                  <span className="num text-[12px] text-muted-foreground">{cards.length}</span>
                </header>
                <div className="space-y-2 p-2">
                  {cards.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">—</p>
                  ) : (
                    cards.map((r) => (
                      <article key={r.id} className="rounded-lg border border-line bg-ivory/60 p-2.5">
                        <div className="flex gap-2.5">
                          {thumbs[r.order_id] ? (
                            <img
                              src={thumbs[r.order_id]}
                              alt="الفستان"
                              className="size-12 shrink-0 rounded-md border border-line object-cover"
                            />
                          ) : (
                            <div className="grid size-12 shrink-0 place-items-center rounded-md border border-line bg-paper text-[10px] text-muted-foreground">
                              بلا صورة
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <Link
                              to="/orders/$orderId"
                              params={{ orderId: r.order_id }}
                              className="block truncate text-[13px] font-medium"
                            >
                              {r.orders?.client_name}
                            </Link>
                            <p className="num text-[11px] text-gold">{r.orders?.order_no}</p>
                            {r.orders?.due_date && (
                              <p className={`text-[11px] ${dueTone(r.orders)}`}>
                                التسليم {fmtDate(r.orders.due_date)}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StageStatusChip status={r.status} />
                          <PriorityChip priority={r.priority} />
                          {isStageLate(r) && <Chip tone="late">متأخرة</Chip>}
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            <Avatar name={r.assignee_name} url={avatarOf(r.assignee_id)} size={8} />
                            <span className="truncate">{r.assignee_name || "غير مُسند"}</span>
                          </span>
                          <button
                            onClick={() => setActive(r)}
                            className="rounded-md border border-line bg-paper px-2 py-1 text-[11px]"
                          >
                            إدارة
                          </button>
                        </div>
                        {canManageStage(r.stage) && (
                          <select
                            className="field mt-2 h-9 min-h-0 py-0 text-[11px]"
                            value=""
                            onChange={(e) => {
                              const stage = e.target.value as StageKey;
                              if (!stage) return;
                              move
                                .mutateAsync({ orderId: r.order_id, stage })
                                .then(() => toast.success("تم نقل الطلب"))
                                .catch((err: Error) => toast.error(err.message));
                            }}
                          >
                            <option value="">نقل إلى مرحلة…</option>
                            {columns.filter((c) => canManageStage(c.stage)).map((c) => (
                              <option key={c.id} value={c.stage}>
                                {stageLabel(c.stage)}
                              </option>
                            ))}
                          </select>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <StageSheet stage={active} onClose={() => setActive(null)} />
    </AppShell>
  );
}
