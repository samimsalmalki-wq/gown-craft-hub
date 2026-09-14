import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useMaterials } from "@/lib/inventory-data";
import {
  useAddExpense,
  useAddExpenseCategory,
  useAddSupplier,
  useCashAccounts,
  useCashTransactions,
  useExpenseCategories,
  useExpenses,
  useSuppliers,
} from "@/lib/finance-data";
import { fmtDate, money } from "@/lib/atelier";
import { CASH_KIND_LABEL, cashBalance, monthStartISO, todayISO } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/expenses")({
  head: () => ({
    meta: [
      { title: "المصروفات والصناديق · مَعْمَل" },
      {
        name: "description",
        content: "تسجيل المصروفات والمشتريات وربطها بالموردين والصناديق ومخزون الخامات.",
      },
      { property: "og:title", content: "المصروفات والصناديق · مَعْمَل" },
      {
        property: "og:description",
        content: "تسجيل المصروفات والمشتريات ومتابعة أرصدة الصناديق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { can, ready } = useCurrentAccount();
  const { data: expenses = [] } = useExpenses();
  const { data: categories = [] } = useExpenseCategories();
  const { data: suppliers = [] } = useSuppliers();
  const { data: accounts = [] } = useCashAccounts();
  const { data: txs = [] } = useCashTransactions();
  const { data: materials = [] } = useMaterials();
  const add = useAddExpense();
  const addCategory = useAddExpenseCategory();
  const addSupplier = useAddSupplier();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayISO());
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [isTaxable, setIsTaxable] = useState(false);
  const [reference, setReference] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [materialQty, setMaterialQty] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newSupplier, setNewSupplier] = useState("");

  if (ready && !(can("finance.expenses") || can("finance.reports"))) {
    return (
      <AppShell title="المصروفات">
        <Empty>لا تملك صلاحية عرض المصروفات.</Empty>
      </AppShell>
    );
  }

  const canEdit = can("finance.expenses");
  const monthStart = monthStartISO();
  const monthExpenses = expenses.filter((e) => e.occurred_at >= monthStart);
  const monthTotal = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const vatTotal = monthExpenses.reduce((s, e) => s + Number(e.vat_amount), 0);

  const submit = () => {
    add
      .mutateAsync({
        description,
        amount: Number(amount),
        occurredAt,
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        cashAccountId: cashAccountId || undefined,
        isTaxable,
        reference,
        materialId: materialId || undefined,
        materialQty: materialQty ? Number(materialQty) : undefined,
      })
      .then(() => {
        toast.success("تم تسجيل المصروف");
        setDescription("");
        setAmount("");
        setReference("");
        setMaterialId("");
        setMaterialQty("");
      })
      .catch((err: Error) => toast.error(err.message));
  };

  return (
    <AppShell
      eyebrow="الماليات"
      title="المصروفات والصناديق"
      subtitle="سجّل المصروفات والمشتريات وتابع أرصدة الصناديق"
    >
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="مصروفات هذا الشهر" value={money(monthTotal)} tone="late" />
        <Stat label="ضريبة مدخلات الشهر" value={money(vatTotal)} />
        {accounts.slice(0, 2).map((a) => (
          <Stat
            key={a.id}
            label={`${a.name} (${CASH_KIND_LABEL[a.kind]})`}
            value={money(cashBalance(a, txs))}
            tone="gold"
          />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-5">
          {canEdit && (
            <Card title="مصروف جديد">
              <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="الوصف">
                    <input
                      className="field"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="مثال: شراء قماش دانتيل"
                    />
                  </Field>
                </div>
                <Field label="المبلغ">
                  <input
                    className="field num"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <Field label="التاريخ">
                  <input
                    type="date"
                    className="field"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                  />
                </Field>
                <Field label="التصنيف">
                  <select
                    className="field"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">— بدون —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="المورد">
                  <select
                    className="field"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">— بدون —</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="الصندوق" hint="يُخصم منه المبلغ">
                  <select
                    className="field"
                    value={cashAccountId}
                    onChange={(e) => setCashAccountId(e.target.value)}
                  >
                    <option value="">— بدون —</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="المرجع">
                  <input
                    className="field"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="رقم فاتورة المورد"
                  />
                </Field>
                <Field label="إدخال خامة للمخزون" hint="اختياري">
                  <select
                    className="field"
                    value={materialId}
                    onChange={(e) => setMaterialId(e.target.value)}
                  >
                    <option value="">— بدون —</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="الكمية المُدخلة">
                  <input
                    className="field num"
                    inputMode="decimal"
                    value={materialQty}
                    onChange={(e) => setMaterialQty(e.target.value)}
                    disabled={!materialId}
                  />
                </Field>
                <label className="flex items-center gap-2 text-[12px] sm:col-span-2">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={isTaxable}
                    onChange={(e) => setIsTaxable(e.target.checked)}
                  />
                  المبلغ يشمل ضريبة القيمة المضافة (تُحتسب كضريبة مدخلات)
                </label>
              </div>
              <div className="flex justify-end border-t border-line px-4 py-3">
                <Btn variant="gold" onClick={submit} disabled={add.isPending}>
                  حفظ المصروف
                </Btn>
              </div>
            </Card>
          )}

          {canEdit && (
            <Card title="التصنيفات والموردون">
              <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="تصنيف جديد">
                      <input
                        className="field"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Btn
                    variant="quiet"
                    onClick={() =>
                      addCategory
                        .mutateAsync(newCategory)
                        .then(() => {
                          toast.success("تمت الإضافة");
                          setNewCategory("");
                        })
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    إضافة
                  </Btn>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="مورد جديد">
                      <input
                        className="field"
                        value={newSupplier}
                        onChange={(e) => setNewSupplier(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Btn
                    variant="quiet"
                    onClick={() =>
                      addSupplier
                        .mutateAsync({ name: newSupplier })
                        .then(() => {
                          toast.success("تمت الإضافة");
                          setNewSupplier("");
                        })
                        .catch((e: Error) => toast.error(e.message))
                    }
                  >
                    إضافة
                  </Btn>
                </div>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="أرصدة الصناديق">
            <ul className="divide-y divide-line">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                  <span>
                    {a.name} <Chip tone="neutral">{CASH_KIND_LABEL[a.kind]}</Chip>
                  </span>
                  <span className="num text-[14px]">{money(cashBalance(a, txs))}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="آخر المصروفات">
            {expenses.length === 0 ? (
              <Empty>لا توجد مصروفات مسجّلة.</Empty>
            ) : (
              <ul className="max-h-[420px] divide-y divide-line overflow-y-auto">
                {expenses.slice(0, 40).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-medium">{e.description}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {e.expense_no} · {fmtDate(e.occurred_at)} ·{" "}
                        {categories.find((c) => c.id === e.category_id)?.name ?? "بدون تصنيف"}
                      </p>
                    </div>
                    <span className="num text-[14px] text-late">{money(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="حركة الصناديق">
            {txs.length === 0 ? (
              <Empty>لا توجد حركات بعد.</Empty>
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                {txs.slice(0, 40).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px]">{t.description || "حركة"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {fmtDate(t.occurred_at)} ·{" "}
                        {accounts.find((a) => a.id === t.account_id)?.name ?? "صندوق"}
                      </p>
                    </div>
                    <span className={t.direction === "in" ? "num text-ok" : "num text-late"}>
                      {t.direction === "in" ? "+" : "−"}
                      {money(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
