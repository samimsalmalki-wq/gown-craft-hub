import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useGlAccounts, useTrialBalance } from "@/lib/finance-data";
import { fmtDate, money } from "@/lib/atelier";
import { ACCOUNT_TYPE_LABEL, buildTrialBalance, monthStartISO, todayISO } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/trial-balance")({
  head: () => ({
    meta: [
      { title: "ميزان المراجعة · مَعْمَل" },
      {
        name: "description",
        content: "ميزان المراجعة لكل الحسابات داخل فترة: المدين والدائن والرصيد ومجاميع المجموعات.",
      },
      { property: "og:title", content: "ميزان المراجعة · مَعْمَل" },
      {
        property: "og:description",
        content: "ميزان مراجعة كامل بأرصدة كل الحسابات ومجاميع المدين والدائن مع الطباعة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrialBalancePage,
});

function TrialBalancePage() {
  const { can, ready } = useCurrentAccount();
  const { data: accounts = [] } = useGlAccounts();

  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [hideEmpty, setHideEmpty] = useState(true);

  const { data: totals = {}, isLoading } = useTrialBalance(from, to);

  if (ready && !(can("finance.accounts") || can("finance.reports"))) {
    return (
      <AppShell title="ميزان المراجعة">
        <Empty>لا تملك صلاحية عرض ميزان المراجعة.</Empty>
      </AppShell>
    );
  }

  const { groups, totalDebit, totalCredit } = buildTrialBalance(accounts, totals, hideEmpty);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  return (
    <AppShell
      eyebrow="الماليات"
      title="ميزان المراجعة"
      subtitle={`الفترة ${fmtDate(from)} — ${fmtDate(to)}`}
      actions={
        <div className="flex items-center gap-2">
          <Chip tone={balanced ? "ok" : "late"}>
            {balanced ? "الميزان متوازن" : "الميزان غير متوازن"}
          </Chip>
          <Btn variant="quiet" onClick={() => window.print()}>
            طباعة
          </Btn>
        </div>
      }
    >
      <FinanceTabs />

      <Card title="الفترة" className="mb-5">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-3">
          <Field label="من">
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="الحسابات">
            <label className="flex h-[42px] items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={(e) => setHideEmpty(e.target.checked)}
              />
              إخفاء الحسابات بلا حركة
            </label>
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <Empty>جارٍ التحميل…</Empty>
      ) : groups.length === 0 ? (
        <Empty>لا توجد حركات في هذه الفترة.</Empty>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Card
              key={g.id}
              title={`${g.code} · ${g.name}`}
              action={
                <div className="flex items-center gap-2">
                  <Chip tone="neutral">{ACCOUNT_TYPE_LABEL[g.type]}</Chip>
                  <span className="num text-[14px]">{money(g.balance)}</span>
                </div>
              }
            >
              {g.rows.length === 0 ? (
                <Empty>لا توجد حسابات فرعية.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {g.rows.map((r) => (
                    <li
                      key={r.id}
                      className="grid gap-1 px-4 py-2.5 sm:grid-cols-[1.8fr_1fr_1fr_1fr] sm:items-center"
                    >
                      <p className="text-[13.5px]">
                        <span className="num text-muted-foreground">{r.code}</span> · {r.name}
                      </p>
                      <p className="text-[12px] text-muted-foreground sm:text-center">
                        مدين <span className="num">{money(r.debit)}</span>
                      </p>
                      <p className="text-[12px] text-muted-foreground sm:text-center">
                        دائن <span className="num">{money(r.credit)}</span>
                      </p>
                      <p className="num text-[14px] sm:text-left">{money(r.balance)}</p>
                    </li>
                  ))}
                  <li className="grid gap-1 border-t border-line bg-goldsoft/25 px-4 py-2.5 text-[12.5px] sm:grid-cols-[1.8fr_1fr_1fr_1fr] sm:items-center">
                    <span>مجموع المجموعة</span>
                    <span className="num sm:text-center">{money(g.debit)}</span>
                    <span className="num sm:text-center">{money(g.credit)}</span>
                    <span className="num text-[14px] sm:text-left">{money(g.balance)}</span>
                  </li>
                </ul>
              )}
            </Card>
          ))}

          <Card title="الإجمالي العام">
            <div className="grid gap-1 px-4 py-3 text-[13.5px] font-medium sm:grid-cols-[1.8fr_1fr_1fr_1fr] sm:items-center">
              <span>إجمالي الحركة</span>
              <span className="num sm:text-center">مدين {money(totalDebit)}</span>
              <span className="num sm:text-center">دائن {money(totalCredit)}</span>
              <span className="sm:text-left">
                <Chip tone={balanced ? "ok" : "late"}>{balanced ? "متوازن" : "غير متوازن"}</Chip>
              </span>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
