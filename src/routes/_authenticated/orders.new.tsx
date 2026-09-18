import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Field } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useMaterials, useReserveMaterial } from "@/lib/inventory-data";
import { available, qty } from "@/lib/inventory";
import { useBranchScope } from "@/lib/branches";
import { useItemTypes } from "@/lib/data";
import { useAddPayment, useCashAccounts } from "@/lib/finance-data";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/finance";
import { ORDER_KIND_HINT, ORDER_KIND_LABEL, money, type OrderKind } from "@/lib/atelier";

const KINDS: OrderKind[] = ["own", "rental", "rental_stock"];
const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"];


export const Route = createFileRoute("/_authenticated/orders/new")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { kind?: OrderKind | undefined; model?: string | undefined } => {
    const kind = search["kind"];
    const model = search["model"];
    return {
      kind: KINDS.includes(kind as OrderKind) ? (kind as OrderKind) : undefined,
      model: typeof model === "string" && model ? model : undefined,
    };
  },
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

const EMBROIDERY_MODELS = [
  "تطريز خرز",
  "تطريز ترتر",
  "تطريز كريستال",
  "تطريز خيوط حرير",
  "دانتيل مطرز",
  "تطريز مشجر ثلاثي الأبعاد",
] as const;

function NewOrderPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  const { data: itemTypes = [] } = useItemTypes();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<OrderKind>(search.kind ?? "own");
  const [itemTypeId, setItemTypeId] = useState("");
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
    security_deposit: "",
    external_invoice_no: "",
    materials: "",
    notes: "",
    model_no: search.model ?? "",
    embroidery_model: "",
  });
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [secondFitting, setSecondFitting] = useState(false);
  const [newModel, setNewModel] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const { data: materials = [] } = useMaterials();
  const { data: cashAccounts = [] } = useCashAccounts();
  const addPayment = useAddPayment();
  const reserve = useReserveMaterial();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const paidNow = Number(form.deposit_amount || 0);
  const remaining = Number(form.total_amount || 0) - paidNow;

  useEffect(() => {
    if (cashAccountId || cashAccounts.length === 0) return;
    const preferred = cashAccounts.find((a) => a.kind === "cash") ?? cashAccounts[0];
    if (preferred) setCashAccountId(preferred.id);
  }, [cashAccounts, cashAccountId]);


  // عند اختيار موديل تطريز لموديل جديد: نحجز قطع التطريز المطابقة تلقائيًا
  useEffect(() => {
    if (!newModel || !form.embroidery_model) return;
    const match = materials.filter(
      (m) =>
        m.is_active &&
        (m.category === "embroidery" || m.category === "beads") &&
        (form.embroidery_model.includes(m.name) || m.name.includes(form.embroidery_model.replace("تطريز ", ""))),
    );
    if (match.length === 0) return;
    setPicked((p) => {
      const next = { ...p };
      match.forEach((m) => {
        if (!next[m.id]) next[m.id] = "1";
      });
      return next;
    });
  }, [newModel, form.embroidery_model, materials]);

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const total = Number(form.total_amount || 0);
      const paid = Number(form.deposit_amount || 0);
      const isStock = kind === "rental_stock";
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const { data, error } = await supabase
        .from("orders")
        .insert({
          order_kind: kind,
          item_type_id: itemTypeId || null,
          security_deposit: kind === "rental" ? Number(form.security_deposit || 0) : 0,
          external_invoice_no: form.external_invoice_no.trim() || null,
          client_name: isStock ? form.client_name || "مخزون المحل" : form.client_name,
          client_phone: form.client_phone || null,
          client_contact: form.client_contact || null,
          booked_at: form.booked_at,
          fitting1_date: form.fitting1_date || null,
          fitting2_date: secondFitting ? form.fitting2_date || null : null,
          due_date: form.due_date || null,
          event_date: form.event_date || null,
          total_amount: total,
          deposit_amount: 0,
          payment_status: "unpaid",
          materials: form.materials || null,
          notes: form.notes || null,
          measurements: measures,
          model_no: newModel ? null : form.model_no || null,
          is_new_model: newModel,
          embroidery_model: newModel ? form.embroidery_model || null : null,
          branch_id: writeBranchId,
          created_by: uid,
        })
        .select("id")
        .single();
      if (error) {
        if (error.code === "23505" && String(error.message).includes("external_invoice_no")) {
          throw new Error("رقم الفاتورة الخارجي مستخدم في طلب آخر");
        }
        throw error;
      }

      if (paid > 0) {
        try {
          await addPayment.mutateAsync({
            scope: "order",
            orderId: data.id,
            amount: paid,
            method,
            paidAt: form.booked_at,
            cashAccountId: cashAccountId || undefined,
            notes: "دفعة عند إنشاء الطلب",
          });
        } catch {
          toast.error("تم حفظ الطلب لكن تعذر تسجيل سند القبض — سجّله من صفحة الطلب");
        }
      }


      if (attachments.length) {
        try {
          for (const file of attachments) {
            const path = `${data.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, "_")}`;
            const up = await supabase.storage.from("order-files").upload(path, file);
            if (up.error) throw up.error;
            const ins = await supabase.from("order_files").insert({
              order_id: data.id,
              storage_path: path,
              kind: "measurements",
              created_by: uid,
            });
            if (ins.error) throw ins.error;
          }
        } catch {
          toast.error("تم حفظ الطلب لكن تعذر رفع بعض المرفقات");
        }
      }

      const wanted = Object.entries(picked)
        .map(([materialId, value]) => ({ materialId, amount: Number(value) }))
        .filter((r) => r.amount > 0);
      if (wanted.length) {
        try {
          for (const row of wanted) {
            await reserve.mutateAsync({ orderId: data.id, materialId: row.materialId, qty: row.amount });
          }
        } catch {
          toast.error("تم حفظ الطلب لكن تعذر حجز بعض المواد");
        }
      }

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
            <Field label="نوع التفصيل" hint={ORDER_KIND_HINT[kind]}>
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value as OrderKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ORDER_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="نوع القطعة">
              <select className="field" value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}>
                <option value="">اختر نوع القطعة</option>
                {itemTypes
                  .filter((t) => t.is_active)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </Field>
            {kind !== "rental_stock" && (
              <>
                <Field label="اسم العميلة">
                  <input className="field" value={form.client_name} onChange={set("client_name")} required />
                </Field>
                <Field label="رقم الجوال">
                  <input className="field" dir="ltr" value={form.client_phone} onChange={set("client_phone")} />
                </Field>
                <Field label="بيانات تواصل أخرى">
                  <input className="field" value={form.client_contact} onChange={set("client_contact")} />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card title="المالية">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label={kind === "rental_stock" ? "تكلفة القطعة التقديرية" : "قيمة الطلب"}>
              <input className="field" dir="ltr" inputMode="decimal" value={form.total_amount} onChange={set("total_amount")} />
            </Field>
            {kind !== "rental_stock" && (
              <>
                <Field label="المدفوع" hint="يُسجَّل سند قبض تلقائيًا بهذا المبلغ">
                  <input className="field" dir="ltr" inputMode="decimal" value={form.deposit_amount} onChange={set("deposit_amount")} />
                </Field>
                <Field label="طريقة الدفع">
                  <select className="field" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="الصندوق" hint="المبلغ يدخل هذا الصندوق">
                  <select className="field" value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
                    <option value="">بدون صندوق</option>
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="المتبقي" hint="يُحسب تلقائيًا">
                  <input className="field num" dir="ltr" value={money(remaining)} readOnly disabled />
                </Field>
              </>
            )}
            {kind === "rental" && (
              <Field label="مبلغ التأمين" hint="يُحصَّل عند التسليم ويُرد عند إرجاع الفستان سليمًا">
                <input
                  className="field"
                  dir="ltr"
                  inputMode="decimal"
                  value={form.security_deposit}
                  onChange={set("security_deposit")}
                />
              </Field>
            )}
            <Field label="رقم الفاتورة الخارجي" hint="اختياري — لا يتكرر بين الطلبات">
              <input
                className="field"
                dir="ltr"
                value={form.external_invoice_no}
                onChange={set("external_invoice_no")}
              />
            </Field>
            <Field label="الخامات المطلوبة">
              <textarea className="field min-h-24" value={form.materials} onChange={set("materials")} />
            </Field>
            <Field label="ملاحظات العميلة">
              <textarea className="field min-h-24" value={form.notes} onChange={set("notes")} />
            </Field>
          </div>
        </Card>


        <Card title="المواعيد">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="تاريخ الحجز" hint="يُسجَّل تلقائيًا بتاريخ اليوم وغير قابل للتعديل">
              <input className="field" type="date" value={form.booked_at} readOnly disabled />
            </Field>

            <Field label="تاريخ البروفة الأولى">
              <input className="field" type="date" value={form.fitting1_date} onChange={set("fitting1_date")} />
            </Field>
            {secondFitting ? (
              <Field label="تاريخ البروفة الثانية">
                <input className="field" type="date" value={form.fitting2_date} onChange={set("fitting2_date")} />
              </Field>
            ) : (
              <div className="flex items-end">
                <Btn type="button" variant="quiet" onClick={() => setSecondFitting(true)}>
                  إضافة بروفة ثانية
                </Btn>
              </div>
            )}
            <Field label="تاريخ التسليم النهائي">
              <input className="field" type="date" value={form.due_date} onChange={set("due_date")} />
            </Field>
            <Field label="تاريخ المناسبة">
              <input className="field" type="date" value={form.event_date} onChange={set("event_date")} />
            </Field>
          </div>
        </Card>

        <Card title="الموديل">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="نوع الموديل">
              <select
                className="field"
                value={newModel ? "new" : "existing"}
                onChange={(e) => setNewModel(e.target.value === "new")}
              >
                <option value="existing">موديل موجود برقم</option>
                <option value="new">موديل جديد</option>
              </select>
            </Field>
            {newModel ? (
              <Field label="موديل التطريز المطلوب" hint="اختياري للموديل الجديد">
                <select className="field" value={form.embroidery_model} onChange={set("embroidery_model")}>
                  <option value="">اختر موديل التطريز</option>
                  {EMBROIDERY_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field label="رقم الموديل المطلوب">
                <input className="field" dir="ltr" value={form.model_no} onChange={set("model_no")} />
              </Field>
            )}
          </div>
        </Card>

        <Card title="المواد المطلوبة" action={<span className="text-[12px] text-muted-foreground">تُحجز من المخزون بعد الحفظ</span>}>
          {materials.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
              لا توجد مواد في المخزون بعد.
            </p>
          ) : (
            <ul className="divide-y divide-black/5">
              {materials
                .filter((m) => m.is_active)
                .map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-[14px]">{m.name}</span>
                    <span className="num text-[12px] text-muted-foreground">
                      متاح {qty(available(m))} {m.unit}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="field w-24"
                      placeholder="0"
                      value={picked[m.id] ?? ""}
                      onChange={(e) => setPicked((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                  </li>
                ))}
            </ul>
          )}
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
          <div className="border-t border-black/5 px-4 py-4">
            <Field label="مرفق" hint="صور أو ملفات ورقة المقاسات">
              <input
                className="field"
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
              />
            </Field>
            {attachments.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm text-muted-foreground">
                {attachments.map((f) => (
                  <li key={f.name}>{f.name}</li>
                ))}
              </ul>
            )}
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
