import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAddExpenseCategory,
  useAllExpenseCategories,
  useUpdateExpenseCategory,
} from "@/lib/finance-data";

export const Route = createFileRoute("/_authenticated/settings/expense-categories")({
  head: () => ({
    meta: [
      { title: "تصنيفات المصروفات · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "أضف بنود المصروفات وعدّل أسماءها وحساب كل بند في دليل الحسابات.",
      },
      { property: "og:title", content: "تصنيفات المصروفات · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة بنود المصروفات وحساباتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpenseCategoriesPage,
});

function ExpenseCategoriesPage() {
  const { can, isAdmin, ready } = useCurrentAccount();
  const allowed = isAdmin || can("finance.expenses");
  const { data: rows = [] } = useAllExpenseCategories();
  const add = useAddExpenseCategory();
  const update = useUpdateExpenseCategory();
  const [name, setName] = useState("");

  if (ready && !allowed) {
    return (
      <AppShell title="تصنيفات المصروفات">
        <Empty>تحتاج صلاحية «المصروفات والمشتريات» للوصول إلى هذه الشاشة.</Empty>
      </AppShell>
    );
  }

  const submit = () =>
    add
      .mutateAsync(name)
      .then(() => {
        toast.success("تمت الإضافة");
        setName("");
      })
      .catch((e: Error) => toast.error(e.message));

  const patch = (id: string, p: Record<string, unknown>) =>
    update
      .mutateAsync({ id, patch: p })
      .then(() => toast.success("تم الحفظ"))
      .catch((e: Error) => toast.error(e.message));

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="تصنيفات المصروفات"
      subtitle="كل تصنيف يُرحَّل إلى حسابه في دليل الحسابات. التعطيل بدل الحذف حتى لا تتأثر المصروفات القديمة."
    >
      <Card title="تصنيف جديد">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="min-w-[200px] flex-1">
            <Field label="اسم التصنيف">
              <input
                className="field w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: صيانة مكائن"
              />
            </Field>
          </div>
          <Btn variant="gold" onClick={submit} disabled={add.isPending}>
            إضافة
          </Btn>
        </div>
      </Card>

      <div className="mt-5">
        <Card title="القائمة">
          {rows.length === 0 ? (
            <Empty>لا توجد تصنيفات بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="num w-6 text-[13px] text-muted-foreground">{i + 1}</span>
                  <input
                    key={c.name}
                    className="field h-9 min-h-0 min-w-[140px] flex-1 py-0 text-[14px] font-medium"
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name) patch(c.id, { name: v });
                      else e.target.value = c.name;
                    }}
                  />
                  <input
                    key={c.gl_code}
                    className="field num h-9 min-h-0 w-24 py-0 text-[13px]"
                    defaultValue={c.gl_code}
                    aria-label="رقم الحساب"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.gl_code) patch(c.id, { gl_code: v });
                      else e.target.value = c.gl_code;
                    }}
                  />
                  {!c.is_active && <Chip tone="late">غير مُفعّل</Chip>}
                  <label className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      className="size-5 accent-current"
                      checked={c.is_active}
                      onChange={(e) => patch(c.id, { is_active: e.target.checked })}
                    />
                    مُفعّل
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
