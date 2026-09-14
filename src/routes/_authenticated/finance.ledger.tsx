import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Btn, Card, Chip, Empty, Field, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useGlAccounts, useLedger } from "@/lib/finance-data";
import { fmtDate, money } from "@/lib/atelier";
import {
  ACCOUNT_TYPE_LABEL,
  ENTRY_SOURCE_LABEL,
  monthStartISO,
  naturalBalance,
  runningLedger,
  todayISO,
} from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/ledger")({
  head: () => ({
    meta: [
      { title: "دفتر الأستاذ · مَعْمَل" },
      {
        name: "description",
        content: "كشف حركة كل حساب: الحركات بالتاريخ والرصيد المتسلسل والرصيد الافتتاحي والختامي.",
      },
      { property: "og:title", content: "دفتر الأستاذ · مَعْمَل" },
      {
        property: "og:description",
        content: "كشف حركة أي حساب محاسبي داخل فترة مع الرصيد المتسلسل وإمكانية الطباعة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const { can, ready } = useCurrentAccount();
  const { data: accounts = [] } = useGlAccounts();

  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const { data, isLoading } = useLedger(accountId, from, to);

  if (ready && !(can("finance.accounts") || can("finance.reports"))) {
    return (
      <AppShell title="دفتر الأستاذ">
        <Empty>لا تملك صلاحية عرض دفتر الأستاذ.</Empty>
      </AppShell>
    );
  }

  const postable = accounts.filter((a) => !a.is_group);
  const account = postable.find((a) => a.id === accountId) ?? null;

  const opening = account && data ? naturalBalance(account.type, data.openingDebit, data.openingCredit) : 0;
  const rows = account && data ? runningLedger(account.type, opening, data.rows) : [];
  const totalDebit = data?.rows.reduce((s, r) => s + r.debit, 0) ?? 0;
  const totalCredit = data?.rows.reduce((s, r) => s + r.credit, 0) ?? 0;
  const closing = rows.length ? rows[rows.length - 1]!.balance : opening;

  return (
    <AppShell
      eyebrow="الماليات"
      title="دفتر الأستاذ"
      subtitle="كشف حركة حساب واحد مع الرصيد المتسلسل"
      actions={
        account ? (
          <Btn variant="quiet" onClick={() => window.print()}>
            طباعة الكشف
          </Btn>
        ) : null
      }
    >
      <FinanceTabs />

      <Card title="اختيار الحساب والفترة" className="mb-5">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-[1.6fr_1fr_1fr]">
          <Field label="الحساب">
            <select
              className="field"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">— اختر حسابًا —</option>
              {postable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="من">
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى">
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      {!account ? (
        <Empty>اختر حسابًا لعرض كشف حركته.</Empty>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="الرصيد قبل الفترة" value={money(opening)} />
            <Stat label="مجموع المدين" value={money(totalDebit)} />
            <Stat label="مجموع الدائن" value={money(totalCredit)} />
            <Stat label="الرصيد الختامي" value={money(closing)} />
          </div>

          <Card
            title={`${account.code} · ${account.name}`}
            action={
              <div className="flex items-center gap-2">
                <Chip tone="neutral">{ACCOUNT_TYPE_LABEL[account.type]}</Chip>
                <span className="text-[11px] text-muted-foreground">
                  {fmtDate(from)} — {fmtDate(to)}
                </span>
              </div>
            }
          >
            {isLoading ? (
              <Empty>جارٍ التحميل…</Empty>
            ) : rows.length === 0 ? (
              <Empty>
                لا توجد حركات في هذه الفترة. الرصيد الافتتاحي {money(opening)}.
              </Empty>
            ) : (
              <ul className="divide-y divide-line">
                <li className="flex items-center justify-between gap-3 bg-goldsoft/25 px-4 py-2.5 text-[12.5px]">
                  <span>رصيد افتتاحي</span>
                  <span className="num">{money(opening)}</span>
                </li>
                {rows.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to="/finance/journal"
                        className="text-[13.5px] hover:underline"
                        title="عرض القيد في دفتر اليومية"
                      >
                        <span className="num text-muted-foreground">{r.entry_no}</span> ·{" "}
                        {r.entry_memo}
                      </Link>
                      <span className="num text-[14px]">{money(r.balance)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted-foreground">
                      <span>
                        {fmtDate(r.entry_date)} · {ENTRY_SOURCE_LABEL[r.source] ?? r.source}
                        {r.memo ? ` · ${r.memo}` : ""}
                      </span>
                      <span className="num">
                        {r.debit > 0 ? `مدين ${money(r.debit)}` : `دائن ${money(r.credit)}`}
                      </span>
                    </div>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t border-line bg-goldsoft/25 px-4 py-2.5 text-[13px] font-medium">
                  <span>رصيد ختامي</span>
                  <span className="num">{money(closing)}</span>
                </li>
              </ul>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
