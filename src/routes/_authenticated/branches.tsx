import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useBranches, useSaveBranch, type Branch } from "@/lib/branches";

export const Route = createFileRoute("/_authenticated/branches")({
  component: BranchesPage,
  head: () => ({
    meta: [
      { title: "الفروع | مَعْمَل" },
      { name: "description", content: "إدارة فروع المحل: الاسم والرمز والعنوان والرقم الضريبي." },
      { property: "og:title", content: "الفروع | مَعْمَل" },
      { property: "og:description", content: "إدارة فروع محل تفصيل الفساتين وبياناتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const EMPTY = { name: "", code: "", address: "", phone: "", tax_number: "" };

function BranchesPage() {
  const { isAdmin } = useCurrentAccount();
  const { data: branches = [], isLoading } = useBranches();
  const save = useSaveBranch();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState(EMPTY);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(b: Branch) {
    setEditing(b);
    setForm({
      name: b.name,
      code: b.code,
      address: b.address ?? "",
      phone: b.phone ?? "",
      tax_number: b.tax_number ?? "",
    });
    setOpen(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    const code = form.code.trim().toUpperCase();
    if (!name || !code) return;
    try {
      await save.mutateAsync({
        ...(editing ? { id: editing.id } : { position: branches.length + 1 }),
        name,
        code,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        tax_number: form.tax_number.trim() || null,
      });
      toast.success(editing ? "تم تحديث الفرع" : "تمت إضافة الفرع");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ");
    }
  }

  async function toggle(b: Branch) {
    await save.mutateAsync({ id: b.id, is_active: !b.is_active });
  }

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="الفروع"
      subtitle="رمز الفرع يُستخدم كبادئة لأرقام الطلبات، والرقم الضريبي يظهر في رأس فواتير الفرع."
      actions={isAdmin ? <Btn onClick={openNew}>فرع جديد</Btn> : undefined}
    >
      <Card title="قائمة الفروع">
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : branches.length === 0 ? (
          <Empty>لا توجد فروع.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {branches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{b.name}</span>
                <Chip>{b.code}</Chip>
                {b.is_main && <Chip tone="gold">الفرع الرئيسي</Chip>}
                {!b.is_active && <Chip tone="late">معطّل</Chip>}
                <span className="num text-[12px] text-muted-foreground">
                  {b.order_counter} طلب
                </span>
                {isAdmin && (
                  <>
                    <Btn variant="quiet" onClick={() => openEdit(b)}>
                      تعديل
                    </Btn>
                    <Btn variant="quiet" onClick={() => toggle(b)}>
                      {b.is_active ? "تعطيل" : "تفعيل"}
                    </Btn>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title={editing ? "تعديل فرع" : "فرع جديد"}>
        <form onSubmit={submit} className="space-y-4 p-4">
          <Field label="اسم الفرع">
            <input
              className="field w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label="الرمز" hint="بادئة أرقام الطلبات، مثل MK">
            <input
              className="field w-full"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
            />
          </Field>
          <Field label="العنوان">
            <input
              className="field w-full"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="الجوال">
            <input
              className="field w-full"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="الرقم الضريبي">
            <input
              className="field w-full"
              value={form.tax_number}
              onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
            />
          </Field>
          <Btn type="submit" disabled={save.isPending} className="w-full">
            {save.isPending ? "جاري الحفظ…" : "حفظ"}
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}
