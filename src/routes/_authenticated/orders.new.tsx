import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Field } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/orders/new")({
  component: NewOrderPage,
});

const MEASURES = [
  ["bust", "الصدر"],
  ["waist", "الوسط"],
  ["hips", "الأرداف"],
  ["shoulder", "الكتف"],
  ["sleeve", "طول الكم"],
  ["length", "طول الفستان"],
] as const;

function NewOrderPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    client_phone: "",
    client_contact: "",
    booked_at: new Date().toISOString().slice(0, 10),
    fitting1_date: "",
    fitting2_date: "",
    due_date: "",
    event_date: "",
    total_amount: "",
    deposit_amount: "",
    materials: "",
    notes: "",
  });
  const [measures, setMeasures] = useState<Record<string, string>>({});

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const total = Number(form.total_amount || 0);
      const deposit = Number(form.deposit_amount || 0);
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("orders")
        .insert({
          client_name: form.client_name,
          client_phone: form.client_phone || null,
          client_contact: form.client_contact || null,
          booked_at: form.booked_at,
          fitting1_date: form.fitting1_date || null,
          fitting2_date: secondFitting ? form.fitting2_date || null : null,
          due_date: form.due_date || null,
          event_date: form.event_date || null,
          total_amount: total,
          deposit_amount: deposit,
          payment_status: deposit <= 0 ? "unpaid" : deposit >= total ? "paid" : "partial",
          materials: form.materials || null,
          notes: form.notes || null,
          measurements: measures,
          created_by: userData.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("تم إنشاء الطلب");
      navigate({ to: "/orders/$orderId", params: { orderId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء الطلب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell eyebrow="إضافة" title="طلب جديد" subtitle="رقم الطلب يُنشأ تلقائيًا بعد الحفظ.">
      <form onSubmit={submit} className="grid max-w-3xl gap-5">
        <Card title="بيانات العميلة">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="اسم العميلة">
              <input className="field" value={form.client_name} onChange={set("client_name")} required />
            </Field>
            <Field label="رقم الجوال">
              <input className="field" dir="ltr" value={form.client_phone} onChange={set("client_phone")} />
            </Field>
            <Field label="بيانات تواصل أخرى">
              <input className="field" value={form.client_contact} onChange={set("client_contact")} />
            </Field>
            <Field label="تاريخ الحجز">
              <input className="field" type="date" value={form.booked_at} onChange={set("booked_at")} />
            </Field>
            <Field label="تاريخ التسليم المتوقع">
              <input className="field" type="date" value={form.due_date} onChange={set("due_date")} />
            </Field>
          </div>
        </Card>

        <Card title="المقاسات (سم)">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-3">
            {MEASURES.map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  className="field"
                  dir="ltr"
                  value={measures[key] ?? ""}
                  onChange={(e) => setMeasures((m) => ({ ...m, [key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </Card>

        <Card title="المالية والملاحظات">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="قيمة الفستان">
              <input className="field" dir="ltr" inputMode="decimal" value={form.total_amount} onChange={set("total_amount")} />
            </Field>
            <Field label="العربون">
              <input className="field" dir="ltr" inputMode="decimal" value={form.deposit_amount} onChange={set("deposit_amount")} />
            </Field>
            <Field label="الخامات المطلوبة">
              <textarea className="field min-h-24" value={form.materials} onChange={set("materials")} />
            </Field>
            <Field label="ملاحظات العميلة">
              <textarea className="field min-h-24" value={form.notes} onChange={set("notes")} />
            </Field>
          </div>
        </Card>

        <div>
          <Btn type="submit" disabled={busy}>
            {busy ? "جاري الحفظ…" : "حفظ الطلب"}
          </Btn>
        </div>
      </form>
    </AppShell>
  );
}
