import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { money } from "@/lib/atelier";
import { CASH_KIND_LABEL, type CashAccountKind } from "@/lib/finance";
import { useAllCashAccounts, useSaveCashAccount } from "@/lib/finance-data";
import { branchLabel, useBranchScope, useBranches } from "@/lib/branches";

export const Route = createFileRoute("/_authenticated/settings/cash-accounts")({
  head: () => ({
    meta: [
      { title: "الصناديق · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "أضف صناديق النقد والشبكة والبنك لكل فرع مع رصيدها الافتتاحي وحسابها المحاسبي.",
      },
      { property: "og:title", content: "الصناديق · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة صناديق النقد والشبكة والبنك." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CashAccountsPage,
});

const KINDS: CashAccountKind[] = ["cash", "card", "bank"];

const EMPTY = {
  name: "",
  kind: "cash" as CashAccountKind,
  gl_code: "1110",
  opening_balance: "0",
  branch_id: "",
  notes: "",
};

function CashAccountsPage() {
  const { can, isAdmin, ready } = useCurrentAccount();
  const allowed = isAdmin || can("finance.expenses");
  const { data: rows = [] } = useAllCashAccounts();
  const { data: branches = [] } = useBranches();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  const save = useSaveCashAccount();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  if (ready && !allowed) {
    return (
      <AppShell title="الصناديق">
        <Empty>تحتاج صلاحية «المصروفات والمشتريات» للوصول إلى هذه الشاشة.</Empty>
      </AppShell>
    );
  }

  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY, branch_id: writeBranchId ?? "" });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({
        ...(editing ? { id: editing } : {}),
        name: form.name,
        kind: form.kind,
        gl_code: form.gl_code.trim() || "1110",
        opening_balance: Number(form.opening_balance) || 0,
        branch_id: form.branch_id || null,
        notes: form.notes.trim() || null,
      });
      toast.success("تم الحفظ");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    }
  }

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="الصناديق"
      subtitle="كل دفعة أو مصروف يُسجَّل على صندوق. الرصيد الافتتاحي هو ما كان في الصندوق قبل بداية التسجيل في النظام."
      actions={<Btn onClick={openNew}>صندوق جديد</Btn>}
    >
      <Card title="القائمة">
        {rows.length === 0 ? (
          <Empty>لا توجد صناديق بعد — أضف صندوق النقد أولًا.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{a.name}</span>
                {a.is_deposit_box ? (
                  <Chip tone="soon">صندوق تأمينات — أمانات العميلات</Chip>
                ) : (
                  <Chip>{CASH_KIND_LABEL[a.kind]}</Chip>
                )}
                <Chip tone="neutral">{branchLabel(branches, a.branch_id)}</Chip>
                <span className="num text-[12px] text-muted-foreground">حساب {a.gl_code}</span>
                <span className="num text-[13px]">{money(Number(a.opening_balance))}</span>
                {!a.is_active && <Chip tone="late">معطّل</Chip>}
                <Btn
                  variant="quiet"
                  onClick={() => {
                    setEditing(a.id);
                    setForm({
                      name: a.name,
                      kind: a.kind,
                      gl_code: a.gl_code,
                      opening_balance: String(Number(a.opening_balance)),
                      branch_id: a.branch_id ?? "",
                      notes: a.notes ?? "",
                    });
                    setOpen(true);
                  }}
                >
                  تعديل
                </Btn>
                <Btn
                  variant="quiet"
                  onClick={() =>
                    save
                      .mutateAsync({
                        id: a.id,
                        name: a.name,
                        kind: a.kind,
                        gl_code: a.gl_code,
                        opening_balance: Number(a.opening_balance),
                        branch_id: a.branch_id,
                        is_active: !a.is_active,
                      })
                      .then(() => toast.success("تم الحفظ"))
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  {a.is_active ? "تعطيل" : "تفعيل"}
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "تعديل صندوق" : "صندوق جديد"}
      >
        <form onSubmit={submit} className="space-y-4 p-4">
          <Field label="اسم الصندوق">
            <input
              className="field w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: صندوق النقد — سوق مكة"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="النوع">
              <select
                className="field w-full"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as CashAccountKind })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CASH_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الفرع">
              <select
                className="field w-full"
                value={form.branch_id}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              >
                <option value="">بدون فرع</option>
                {branches
                  .filter((b) => !b.is_warehouse)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="الرصيد الافتتاحي">
              <input
                className="field num w-full"
                inputMode="decimal"
                value={form.opening_balance}
                onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
              />
            </Field>
            <Field label="رقم الحساب" hint="1110 للنقد، 1120 للشبكة، 1130 للبنك">
              <input
                className="field num w-full"
                value={form.gl_code}
                onChange={(e) => setForm({ ...form, gl_code: e.target.value })}
              />
            </Field>
          </div>
          <Field label="ملاحظات">
            <input
              className="field w-full"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <Btn type="submit" className="w-full" disabled={save.isPending}>
            حفظ
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}
