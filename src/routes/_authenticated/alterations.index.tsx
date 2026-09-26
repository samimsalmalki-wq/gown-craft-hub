import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { AlterationSheet } from "@/components/alterations/AlterationSheet";
import { Card, Chip, Empty, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { money } from "@/lib/atelier";
import {
  dueOf,
  fmtDay,
  inWorkshop,
  isOpen,
  isPrinted,
  sourceLabel,
  stepLabel,
  stepTone,
  summaryOf,
} from "@/lib/alterations";
import { useAlterationQueue, type AlterationWithOrder } from "@/lib/alterations-data";
import { branchLabel, useBranches } from "@/lib/branches";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/alterations/")({
  head: () => ({
    meta: [
      { title: "التعديلات · مَعْمَل" },
      {
        name: "description",
        content:
          "طابور التعديلات مرتب بموعد استلام العميلة، ومسار كل تعديل من الفرع للمعمل ورجوعه.",
      },
      { property: "og:title", content: "التعديلات · مَعْمَل" },
      { property: "og:description", content: "طابور التعديلات ومسارها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AlterationsPage,
});

type Filter = "all" | "today" | "late" | "review" | "workshop" | "branch" | "closed";

function AlterationsPage() {
  const { can, ready } = useCurrentAccount();
  const { data: list = [], isLoading } = useAlterationQueue();
  const { data: branches = [] } = useBranches();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const allowed =
    can("alterations.request") ||
    can("alterations.approve") ||
    can("alterations.review") ||
    can("alterations.workshop");
  if (ready && !allowed) {
    return (
      <AppShell title="التعديلات">
        <Empty>ما عندك صلاحية على التعديلات.</Empty>
      </AppShell>
    );
  }

  const open = list.filter(isOpen);
  const days = (a: AlterationWithOrder) => dueOf(a.pickup_date).days;
  const late = open.filter((a) => (days(a) ?? 0) < 0);
  const today = open.filter((a) => days(a) === 0);
  const review = open.filter((a) => a.step === "review");
  const workshop = open.filter(inWorkshop);
  const toggle = (f: Filter) => setFilter((cur) => (cur === f ? "all" : f));

  const term = q.trim();
  const shown = list
    .filter((a) => {
      if (filter === "closed") return !isOpen(a);
      if (!isOpen(a)) return false;
      if (filter === "today") return days(a) === 0;
      if (filter === "late") return (days(a) ?? 0) < 0;
      if (filter === "review") return a.step === "review";
      if (filter === "workshop") return inWorkshop(a);
      if (filter === "branch") return !inWorkshop(a);
      return true;
    })
    .filter(
      (a) =>
        !term ||
        (a.order?.order_no ?? "").includes(term) ||
        (a.order?.client_name ?? "").includes(term),
    );

  return (
    <AppShell
      eyebrow="الإنتاج"
      title="التعديلات"
      subtitle="التعديل ينطلب من صفحة الطلب، وهنا تتابعونه كلكم — الأقرب موعدًا أول."
    >
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="تعديلات مفتوحة"
          value={open.length}
          onClick={() => setFilter("all")}
          active={filter === "all"}
        />
        <Stat
          label="مطلوبة اليوم"
          value={today.length}
          tone="soon"
          onClick={() => toggle("today")}
          active={filter === "today"}
        />
        <Stat
          label="متأخرة"
          value={late.length}
          tone="late"
          onClick={() => toggle("late")}
          active={filter === "late"}
        />
        <Stat
          label="بانتظار الإدارة"
          value={review.length}
          tone="soon"
          onClick={() => toggle("review")}
          active={filter === "review"}
        />
        <Stat
          label="في المعمل"
          value={workshop.length}
          tone="gold"
          onClick={() => toggle("workshop")}
          active={filter === "workshop"}
        />
        <Stat
          label="في الفروع"
          value={open.length - workshop.length}
          onClick={() => toggle("branch")}
          active={filter === "branch"}
        />
      </div>

      <Card
        title={
          filter === "closed" ? "آخر التعديلات المنتهية" : "طابور التعديلات — الأقرب موعدًا أول"
        }
        action={
          <button className="text-[13px] text-gold" onClick={() => toggle("closed")}>
            {filter === "closed" ? "رجوع للمفتوحة" : "المنتهية"}
          </button>
        }
      >
        <div className="border-b border-line px-4 py-2.5">
          <input
            className="field h-10 min-h-0 w-full py-0 text-[13px]"
            placeholder="ابحث برقم الطلب أو اسم العميلة"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : shown.length === 0 ? (
          <Empty>ما فيه تعديلات هنا.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((a) => {
              const due = dueOf(a.pickup_date);
              const openNow = isOpen(a);
              return (
                <li key={a.id}>
                  <button
                    onClick={() => setOpenId(a.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 text-right hover:bg-ivory"
                  >
                    <span
                      className={cn(
                        "grid size-12 shrink-0 place-items-center rounded-xl text-center text-[11px] leading-tight",
                        !openNow
                          ? "bg-ok/12 text-ok"
                          : due.tone === "late"
                            ? "bg-late/12 text-late"
                            : due.tone === "soon"
                              ? "bg-soon/15 text-soon"
                              : "bg-goldsoft/60 text-foreground/70",
                      )}
                    >
                      {openNow ? due.text : a.step === "cancelled" ? "ملغي" : "✓"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">
                        <span className="num">{a.order?.order_no ?? "—"}</span> —{" "}
                        {a.order?.client_name ?? ""}
                        <span className="text-muted-foreground">
                          {" "}
                          · تعديل {a.number} · {sourceLabel(a)}
                        </span>
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {summaryOf(a)}
                      </span>
                      <span className="block text-[11.5px] text-muted-foreground">
                        {branchLabel(branches, a.branch_id)} · استلام العميلة{" "}
                        {fmtDay(a.pickup_date)}
                        {isPrinted(a) && a.tailor ? ` · ${a.tailor}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {a.fee > 0 && (
                        <Chip tone={a.fee_paid_at ? "ok" : "late"}>
                          {money(a.fee)} {a.fee_paid_at ? "مدفوعة" : "غير مدفوعة"}
                        </Chip>
                      )}
                      <Chip tone={stepTone(a)}>{stepLabel(a)}</Chip>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {openId && <AlterationSheet id={openId} onClose={() => setOpenId(null)} />}
    </AppShell>
  );
}
