import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAddGlAccount, useGlAccounts, useJournalLines, useUpdateGlAccount } from "@/lib/finance-data";
import { money } from "@/lib/atelier";
import { ACCOUNT_TYPE_LABEL, naturalBalance } from "@/lib/finance";
import type { GlAccountType } from "@/lib/finance";

const TYPES: GlAccountType[] = ["asset", "liability", "equity", "revenue", "cost", "expense"];

export const Route = createFileRoute("/_authenticated/finance/accounts")({
  head: () => ({
    meta: [
      { title: "دليل الحسابات · مَعْمَل" },
      {
        name: "description",
        content: "شجرة الحسابات المحاسبية للورشة وأرصدة كل حساب وميزان المراجعة.",
      },
      { property: "og:title", content: "دليل الحسابات · مَعْمَل" },
      {
        property: "og:description",
        content: "شجرة الحسابات المحاسبية وأرصدتها وميزان المراجعة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const { can, ready } = useCurrentAccount();
  const { data: accounts = [] } = useGlAccounts();
  const { data: lines = [] } = useJournalLines();
  const add = useAddGlAccount();
  const update = useUpdateGlAccount();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<GlAccountType>("expense");
  const [parentId, setParentId] = useState("");

  if (ready && !(can("finance.accounts") || can("finance.reports"))) {
    return (
      <AppShell title="دليل الحسابات">
        <Empty>لا تملك صلاحية عرض الحسابات.</Empty>
      </AppShell>
    );
  }

  const canEdit = can("finance.accounts");
  const totalsOf = (accountId: string) => {
    const rows = lines.filter((l) => l.account_id === accountId);
    return {
      debit: rows.reduce((s, l) => s + Number(l.debit), 0),
      credit: rows.reduce((s, l) => s + Number(l.credit), 0),
    };
  };

  const groups = accounts.filter((a) => a.is_group);
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);

  const submit = () => {
    add
      .mutateAsync({ code, name, type, parentId: parentId || undefined })
      .then(() => {
        toast.success("تمت إضافة الحساب");
        setCode("");
        setName("");
      })
      .catch((err: Error) => toast.error(err.message));
  };

  return (
    <AppShell
      eyebrow="الماليات"
      title="دليل الحسابات"
      subtitle="شجرة الحسابات وأرصدتها"
      actions={
        <Chip tone={Math.round(totalDebit) === Math.round(totalCredit) ? "ok" : "late"}>
          {Math.round(totalDebit) === Math.round(totalCredit) ? "الميزان متوازن" : "الميزان غير متوازن"}
        </Chip>
      }
    >
      <FinanceTabs />

      {canEdit && (
        <Card title="حساب جديد" className="mb-5">
          <div className="grid gap-3 px-4 py-4 sm:grid-cols-4">
            <Field label="رقم الحساب">
              <input className="field num" value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Field label="اسم الحساب">
              <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="النوع">
              <select
                className="field"
                value={type}
                onChange={(e) => setType(e.target.value as GlAccountType)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الحساب الرئيسي">
              <select className="field" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">— بدون —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.code} · {g.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex justify-end border-t border-line px-4 py-3">
            <Btn variant="gold" onClick={submit} disabled={add.isPending}>
              إضافة الحساب
            </Btn>
          </div>
        </Card>
      )}

      <div className="space-y-5">
        {groups.map((group) => {
          const children = accounts.filter((a) => a.parent_id === group.id);
          const groupBalance = children.reduce((sum, c) => {
            const t = totalsOf(c.id);
            return sum + naturalBalance(c.type, t.debit, t.credit);
          }, 0);

          return (
            <Card
              key={group.id}
              title={`${group.code} · ${group.name}`}
              action={<span className="num text-[14px]">{money(groupBalance)}</span>}
            >
              {children.length === 0 ? (
                <Empty>لا توجد حسابات فرعية.</Empty>
              ) : (
                <ul className="divide-y divide-line">
                  {children.map((a) => {
                    const t = totalsOf(a.id);
                    return (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-[13.5px]">
                            <span className="num text-muted-foreground">{a.code}</span> · {a.name}
                            {!a.is_active && <span className="text-[11px] text-late"> (معطّل)</span>}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            مدين <span className="num">{money(t.debit)}</span> · دائن{" "}
                            <span className="num">{money(t.credit)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="num text-[14px]">
                            {money(naturalBalance(a.type, t.debit, t.credit))}
                          </span>
                          {canEdit && (
                            <button
                              className="text-[12px] text-muted-foreground"
                              onClick={() =>
                                update
                                  .mutateAsync({ id: a.id, patch: { is_active: !a.is_active } })
                                  .catch((e: Error) => toast.error(e.message))
                              }
                            >
                              {a.is_active ? "تعطيل" : "تفعيل"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}

      </div>
    </AppShell>
  );
}
