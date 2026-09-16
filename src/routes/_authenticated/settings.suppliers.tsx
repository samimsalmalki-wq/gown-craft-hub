import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAddSupplier, useSuppliers, useUpdateSupplier } from "@/lib/finance-data";

export const Route = createFileRoute("/_authenticated/settings/suppliers")({
  head: () => ({
    meta: [
      { title: "الموردون · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "أضف الموردين وعدّل أرقام جوالهم وأرقامهم الضريبية لاستخدامها في المصروفات والمشتريات.",
      },
      { property: "og:title", content: "الموردون · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة بيانات الموردين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SuppliersPage,
});

const EMPTY = { name: "", phone: "", tax_number: "", notes: "" };

function SuppliersPage() {
  const { can, isAdmin, ready } = useCurrentAccount();
  const allowed = isAdmin || can("finance.expenses");
  const { data: rows = [] } = useSuppliers();
  const add = useAddSupplier();
  const update = useUpdateSupplier();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  if (ready && !allowed) {
    return (
      <AppShell title="الموردون">
        <Empty>تحتاج صلاحية «المصروفات والمشتريات» للوصول إلى هذه الشاشة.</Empty>
      </AppShell>
    );
  }

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await update.mutateAsync({
          id: editing,
          patch: {
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            tax_number: form.tax_number.trim() || null,
            notes: form.notes.trim() || null,
          },
        });
      } else {
        await add.mutateAsync({
          name: form.name,
          phone: form.phone,
          tax_number: form.tax_number,
        });
      }
      toast.success("تم الحفظ");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    }
  }

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="الموردون"
      subtitle="تظهر هذه القائمة عند تسجيل مصروف أو مشتريات خامات."
      actions={<Btn onClick={openNew}>مورد جديد</Btn>}
    >
      <Card title="القائمة">
        {rows.length === 0 ? (
          <Empty>لا يوجد موردون بعد.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{s.name}</span>
                {s.phone && <span className="num text-[12px] text-muted-foreground">{s.phone}</span>}
                {s.tax_number && <Chip>ض {s.tax_number}</Chip>}
                {!s.is_active && <Chip tone="late">معطّل</Chip>}
                <Btn
                  variant="quiet"
                  onClick={() => {
                    setEditing(s.id);
                    setForm({
                      name: s.name,
                      phone: s.phone ?? "",
                      tax_number: s.tax_number ?? "",
                      notes: s.notes ?? "",
                    });
                    setOpen(true);
                  }}
                >
                  تعديل
                </Btn>
                <Btn
                  variant="quiet"
                  onClick={() =>
                    update
                      .mutateAsync({ id: s.id, patch: { is_active: !s.is_active } })
                      .then(() => toast.success("تم الحفظ"))
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  {s.is_active ? "تعطيل" : "تفعيل"}
                </Btn>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? "تعديل مورد" : "مورد جديد"}>
        <form onSubmit={submit} className="space-y-4 p-4">
          <Field label="اسم المورد">
            <input
              className="field w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="الجوال">
            <input
              className="field w-full num"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="الرقم الضريبي">
            <input
              className="field w-full num"
              value={form.tax_number}
              onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
            />
          </Field>
          <Field label="ملاحظات">
            <input
              className="field w-full"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          <Btn type="submit" className="w-full" disabled={add.isPending || update.isPending}>
            حفظ
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}
