import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAddJournalEntry,
  useGlAccounts,
  useJournalEntries,
  useJournalLines,
} from "@/lib/finance-data";
import { fmtDate, money } from "@/lib/atelier";
import { ENTRY_SOURCE_LABEL } from "@/lib/finance";
import { todayISO } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/journal")({
  head: () => ({
    meta: [
      { title: "قيود اليومية · مَعْمَل" },
      {
        name: "description",
        content: "دفتر اليومية: القيود التلقائية من السندات والفواتير والمصروفات مع إضافة قيود يدوية.",
      },
      { property: "og:title", content: "قيود اليومية · مَعْمَل" },
      {
        property: "og:description",
        content: "دفتر اليومية بالقيود التلقائية واليدوية للورشة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JournalPage,
});

type Draft = { code: string; debit: string; credit: string };

const emptyDraft = (): Draft[] => [
  { code: "", debit: "", credit: "" },
  { code: "", debit: "", credit: "" },
];

function JournalPage() {
  const { can, ready } = useCurrentAccount();
  const { data: entries = [] } = useJournalEntries();
  const { data: lines = [] } = useJournalLines();
  const { data: accounts = [] } = useGlAccounts();
  const add = useAddJournalEntry();

  const [entryDate, setEntryDate] = useState(todayISO());
  const [memo, setMemo] = useState("");
  const [draft, setDraft] = useState<Draft[]>(emptyDraft());

  if (ready && !(can("finance.accounts") || can("finance.reports"))) {
    return (
      <AppShell title="قيود اليومية">
        <Empty>لا تملك صلاحية عرض القيود.</Empty>
      </AppShell>
    );
  }

  const canEdit = can("finance.accounts");
  const postable = accounts.filter((a) => !a.is_group && a.is_active);
  const accountLabel = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    return a ? `${a.code} · ${a.name}` : "حساب";
  };

  const setRow = (i: number, patch: Partial<Draft>) =>
    setDraft((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = () => {
    add
      .mutateAsync({
        entryDate,
        memo,
        lines: draft.map((r) => ({
          code: r.code,
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
        })),
      })
      .then(() => {
        toast.success("تم تسجيل القيد");
        setMemo("");
        setDraft(emptyDraft());
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const draftDebit = draft.reduce((s, r) => s + (Number(r.debit) || 0), 0);
  const draftCredit = draft.reduce((s, r) => s + (Number(r.credit) || 0), 0);

  return (
    <AppShell eyebrow="الماليات" title="قيود اليومية" subtitle="دفتر اليومية المزدوج">
      <FinanceTabs />

      {canEdit && (
        <Card
          title="قيد يدوي"
          className="mb-5"
          action={
            <Chip tone={Math.round(draftDebit) === Math.round(draftCredit) ? "ok" : "late"}>
              مدين {money(draftDebit)} · دائن {money(draftCredit)}
            </Chip>
          }
        >
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
            <Field label="التاريخ">
              <input
                type="date"
                className="field"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </Field>
            <Field label="البيان">
              <input className="field" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </Field>
          </div>

          <ul className="divide-y divide-line border-t border-line">
            {draft.map((row, i) => (
              <li key={i} className="grid gap-3 px-4 py-3 sm:grid-cols-[1.6fr_1fr_1fr]">
                <Field label="الحساب">
                  <select
                    className="field"
                    value={row.code}
                    onChange={(e) => setRow(i, { code: e.target.value })}
                  >
                    <option value="">— اختر —</option>
                    {postable.map((a) => (
                      <option key={a.id} value={a.code}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="مدين">
                  <input
                    className="field num"
                    inputMode="decimal"
                    value={row.debit}
                    onChange={(e) => setRow(i, { debit: e.target.value, credit: "" })}
                  />
                </Field>
                <Field label="دائن">
                  <input
                    className="field num"
                    inputMode="decimal"
                    value={row.credit}
                    onChange={(e) => setRow(i, { credit: e.target.value, debit: "" })}
                  />
                </Field>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
            <Btn
              variant="quiet"
              onClick={() => setDraft((r) => [...r, { code: "", debit: "", credit: "" }])}
            >
              إضافة سطر
            </Btn>
            <Btn variant="gold" onClick={submit} disabled={add.isPending}>
              حفظ القيد
            </Btn>
          </div>
        </Card>
      )}

      <Card title="القيود">
        {entries.length === 0 ? (
          <Empty>لا توجد قيود بعد.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {entries.slice(0, 60).map((e) => {
              const rows = lines.filter((l) => l.entry_id === e.id);
              return (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[13.5px] font-medium">
                      <span className="num">{e.entry_no}</span> · {e.memo}
                    </p>
                    <div className="flex items-center gap-2">
                      <Chip tone="neutral">{ENTRY_SOURCE_LABEL[e.source] ?? e.source}</Chip>
                      <span className="text-[11px] text-muted-foreground">
                        {fmtDate(e.entry_date)}
                      </span>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {rows.map((l) => (
                      <li
                        key={l.id}
                        className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground"
                      >
                        <span>{accountLabel(l.account_id)}</span>
                        <span className="num">
                          {Number(l.debit) > 0
                            ? `مدين ${money(l.debit)}`
                            : `دائن ${money(l.credit)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
