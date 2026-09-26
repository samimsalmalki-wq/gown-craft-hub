import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Empty, Field } from "@/components/kit";
import { PartsPicker } from "@/components/PartsPicker";
import { useCurrentAccount } from "@/hooks/useSession";
import { DEFAULT_DRESS_PARTS, isDressType } from "@/lib/goods";
import { supabase } from "@/integrations/supabase/client";
import { useMaterials, useReserveMaterial } from "@/lib/inventory-data";
import { qty } from "@/lib/inventory";
import {
  useBranchScope,
  useBranches,
  useMaterialStock,
  stockOf,
  warehouseOf,
} from "@/lib/branches";
import { useItemTypes } from "@/lib/data";
import { useModelMaterials, useModels } from "@/lib/models-data";
import { useAddPayment, useCashAccounts } from "@/lib/finance-data";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/finance";
import { SketchBoard } from "@/components/SketchBoard";
import { emptySketch } from "@/lib/sketch";
import { saveSketch, type SketchResult } from "@/lib/sketch-data";
import {
  ORDER_KIND_HINT,
  ORDER_KIND_LABEL,
  measurementLabel,
  money,
  type OrderKind,
} from "@/lib/atelier";

const KINDS: OrderKind[] = ["own", "rental", "rental_stock"];
// إنتاج للإيجار يُفتح من شاشة فساتين الإيجار فقط
const SELECTABLE_KINDS: OrderKind[] = ["own", "rental"];
const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"];
const METHOD_ACCOUNT_KIND: Record<PaymentMethod, "cash" | "card" | "bank" | null> = {
  cash: "cash",
  card: "card",
  transfer: "bank",
  other: null,
};


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

function NewOrderPage() {
  const navigate = useNavigate();
  const { can, ready } = useCurrentAccount();
  const search = Route.useSearch();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  const { data: itemTypes = [] } = useItemTypes();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<OrderKind>(search.kind ?? "own");
  const [itemTypeId, setItemTypeId] = useState("");
  // قطع الفستان: الافتراضية حسب نوع القطعة لين يغيّرها الموظف
  const [parts, setParts] = useState<string[]>(DEFAULT_DRESS_PARTS);
  const [partsTouched, setPartsTouched] = useState(false);
  const typeName = itemTypes.find((t) => t.id === itemTypeId)?.name ?? "";
  const pickItemType = (id: string) => {
    setItemTypeId(id);
    if (partsTouched) return;
    const name = itemTypes.find((t) => t.id === id)?.name ?? "";
    setParts(!name || isDressType(name) ? DEFAULT_DRESS_PARTS : [name]);
  };
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
    model_notes: "",
  });
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // المقاسات تُكتب داخل لوحة الرسم (الثابتة + المضافة باسمها)
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [secondFitting, setSecondFitting] = useState(false);
  const [newModel, setNewModel] = useState(false);
  // الرسمة تُحفظ هنا مؤقتًا وتُرفع مع الطلب بعد إنشائه
  const [sketch, setSketch] = useState<{ result: SketchResult; url: string } | null>(null);
  const [sketchOpen, setSketchOpen] = useState(false);
  const { data: materials = [] } = useMaterials();
  const { data: models = [] } = useModels();
  const { data: stock = [] } = useMaterialStock();
  const { data: branches = [] } = useBranches();
  const [modelId, setModelId] = useState("");
  const { data: modelMaterials = [] } = useModelMaterials(newModel ? null : modelId);
  const { data: cashAccounts = [] } = useCashAccounts();
  const addPayment = useAddPayment();
  const reserve = useReserveMaterial();
  const [fabricIds, setFabricIds] = useState<string[]>([]);
  const [laceIds, setLaceIds] = useState<string[]>([]);

  const paidNow = Number(form.deposit_amount || 0);
  const remaining = Number(form.total_amount || 0) - paidNow;

  // الصندوق يُشتق تلقائيًا من طريقة الدفع وفرع الطلب
  const autoAccount = useMemo(() => {
    const wanted = METHOD_ACCOUNT_KIND[method];
    if (!wanted) return null;
    const same = cashAccounts.filter((a) => a.kind === wanted);
    return same.find((a) => a.branch_id === writeBranchId) ?? same[0] ?? null;
  }, [cashAccounts, method, writeBranchId]);


  // ربط رقم الموديل القادم من صفحة الفستان بالموديل المسجّل
  useEffect(() => {
    if (modelId || !form.model_no || models.length === 0) return;
    const hit = models.find((m) => m.code === form.model_no);
    if (hit) setModelId(hit.id);
  }, [models, form.model_no, modelId]);

  const selectedModel = models.find((m) => m.id === modelId) ?? null;
  // خامات الطلبات تنحجز من المخزن الرئيسي مباشرة
  const reserveFrom = warehouseOf(branches)?.id ?? writeBranchId;
  const shortMaterials = modelMaterials.filter(
    (r) => stockOf(stock, r.material_id, reserveFrom).available < Number(r.qty),
  );
  const activeMaterials = materials.filter((m) => m.is_active);
  const fabricOptions = activeMaterials.filter((m) => m.category === "fabric");
  const laceOptions = activeMaterials.filter((m) => m.category === "lace");
  const nameOf = (id: string) => materials.find((m) => m.id === id)?.name ?? "";

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const filledMeasures = Object.fromEntries(
    Object.entries(measures).filter(([, v]) => v.trim() !== ""),
  );

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
          parts,
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
          materials: newModel
            ? [...fabricIds, ...laceIds].map(nameOf).filter(Boolean).join(", ") || null
            : form.materials || null,
          notes:
            [form.notes.trim(), form.model_notes.trim() && `ملاحظات الموديل: ${form.model_notes.trim()}`]
              .filter(Boolean)
              .join("\n") || null,
          measurements: filledMeasures,
          model_no: newModel ? null : (selectedModel?.code ?? (form.model_no || null)),
          model_id: newModel ? null : modelId || null,
          is_new_model: newModel,
          embroidery_model: null,
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
            cashAccountId: autoAccount?.id ?? undefined,
            notes: "دفعة عند إنشاء الطلب",
          });
        } catch {
          toast.error("تم حفظ الطلب لكن تعذر تسجيل سند القبض — سجّله من صفحة الطلب");
        }
      }


      if (sketch) {
        try {
          await saveSketch(data.id, { ...sketch.result, caption: "تصميم 1" });
        } catch {
          toast.error("تم حفظ الطلب لكن تعذر رفع الرسمة — ارسميها من صفحة الطلب");
        }
      }

      const wanted =
        !newModel && modelId
          ? modelMaterials.map((r) => ({ materialId: r.material_id, amount: Number(r.qty) }))
          : [];
      // كل مادة تنحجز لحالها من المخزن الرئيسي، واللي ما تكفي تنذكر بالاسم
      const failed: string[] = [];
      for (const row of wanted) {
        try {
          await reserve.mutateAsync({ orderId: data.id, materialId: row.materialId, qty: row.amount });
        } catch {
          failed.push(nameOf(row.materialId) || "مادة");
        }
      }
      if (failed.length) {
        toast.error(`تم حفظ الطلب، وما انحجز من المخزن الرئيسي: ${failed.join("، ")}`);
      }

      toast.success("تم إنشاء الطلب");
      navigate({ to: "/orders/$orderId", params: { orderId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء الطلب");
    } finally {
      setBusy(false);
    }
  }

  if (ready && !can("orders.create")) {
    return (
      <AppShell title="طلب جديد">
        <Empty>تسجيل الطلبات الجديدة غير متاح لحسابك.</Empty>
      </AppShell>
    );
  }

  return (
    <AppShell eyebrow="إضافة" title="طلب جديد" subtitle="رقم الطلب يُنشأ تلقائيًا بعد الحفظ.">
      <form onSubmit={submit} className="grid max-w-3xl gap-5">
        <Card title="بيانات العميلة">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="رقم الفاتورة من نظام المبيعات" hint="إلزامي — لا يتكرر بين الطلبات">
              <input
                className="field"
                dir="ltr"
                value={form.external_invoice_no}
                onChange={set("external_invoice_no")}
                required
              />
            </Field>
            {kind !== "rental_stock" && (
              <>
                <Field label="اسم العميلة">
                  <input className="field" value={form.client_name} onChange={set("client_name")} required />
                </Field>
                <Field label="رقم الجوال">
                  <input className="field" dir="ltr" value={form.client_phone} onChange={set("client_phone")} />
                </Field>
              </>
            )}
            <Field label="نوع التفصيل" hint={ORDER_KIND_HINT[kind]}>
              <select className="field" value={kind} onChange={(e) => setKind(e.target.value as OrderKind)}>
                {(kind === "rental_stock" ? KINDS : SELECTABLE_KINDS).map((k) => (
                  <option key={k} value={k}>
                    {ORDER_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="نوع القطعة">
              <select className="field" value={itemTypeId} onChange={(e) => pickItemType(e.target.value)}>
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
            <Field
              label="قطع الفستان"
              hint="قائمة تأشير عند إرسال الفستان من المعمل واستلامه وتسليمه للعميلة"
            >
              <PartsPicker
                value={parts}
                onChange={(next) => {
                  setParts(next);
                  setPartsTouched(true);
                }}
                {...(typeName && !isDressType(typeName) ? { extraOptions: [typeName] } : {})}
              />
            </Field>
            <Field label="ملاحظات العمل">
              <textarea className="field min-h-24" value={form.notes} onChange={set("notes")} />
            </Field>
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
                <Field
                  label="طريقة الدفع"
                  hint={
                    autoAccount
                      ? `يُسجَّل في: ${autoAccount.name}`
                      : method === "other"
                        ? "يُسجَّل بدون صندوق"
                        : "لا يوجد صندوق مناسب لهذه الطريقة — أضِفه من الإعدادات › الصناديق"
                  }
                >
                  <select className="field" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABEL[m]}
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
          </div>
        </Card>


        <Card title="المواعيد">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="تاريخ الحجز" hint="يُسجَّل تلقائيًا بتاريخ اليوم وغير قابل للتعديل">
              <input className="field" type="date" value={form.booked_at} readOnly disabled />
            </Field>

            {/* الإيجار ما فيه بروفة مقاسات أولى — بروفة كاملة بس */}
            <Field label={kind === "own" ? "تاريخ البروفة الأولى" : "تاريخ البروفة الكاملة"}>
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

        <Card title="الموديل والمواد">
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
            {!newModel && (
              <Field label="رقم الموديل" hint="مواد الموديل تُحجز تلقائيًا بعد الحفظ">
                <select className="field" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                  <option value="">اختر الموديل</option>
                  {models
                    .filter((m) => m.is_active)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
          </div>

          {!newModel &&
            (modelId ? (
              <div className="border-t border-black/5 px-4 py-3">
                <p className="text-[12px] text-muted-foreground">مواد الموديل تُحجز تلقائيًا بعد الحفظ</p>
                {shortMaterials.length > 0 && (
                  <p className="mt-2 text-[13px] text-late">
                    ما تكفي في المخزن الرئيسي:{" "}
                    {shortMaterials.map((r) => nameOf(r.material_id)).join("، ")} — ينحفظ الطلب
                    وتنحجز باقي المواد، وهذي تحجزها بعد ما تتوفر.
                  </p>
                )}
              </div>
            ) : (
              <p className="border-t border-black/5 px-4 py-4 text-[13px] text-muted-foreground">
                اختر الموديل لتُحجز مواده تلقائيًا بعد الحفظ.
              </p>
            ))}

          {newModel && (
            <div className="grid gap-4 border-t border-black/5 px-4 py-4 sm:grid-cols-2">
              <MultiPick
                label="نوع القماش"
                options={fabricOptions}
                value={fabricIds}
                onChange={setFabricIds}
              />
              <MultiPick label="نوع الدانتيل" options={laceOptions} value={laceIds} onChange={setLaceIds} />
            </div>
          )}

          <div className="border-t border-black/5 px-4 py-4">
            <Field label="ملاحظات الموديل" hint="تفاصيل التصنيع أو طلبات خاصة على الموديل">
              <textarea className="field min-h-20" value={form.model_notes} onChange={set("model_notes")} />
            </Field>
          </div>
        </Card>

        <Card title="المقاسات والتصميم">
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-medium">لوحة الرسم</p>
                <p className="text-[11px] text-muted-foreground">
                  اكتبي المقاسات بجانب الرسمة (ويمكن إضافة مقاس جديد باسمه)، وارسمي التصميم بالقلم فوق رسمة
                  الجسم.
                </p>
              </div>
              <div className="flex gap-2">
                <Btn type="button" variant="quiet" onClick={() => setSketchOpen(true)}>
                  {sketch ? "تعديل الرسمة والمقاسات" : "افتح لوحة الرسم"}
                </Btn>
                {sketch && (
                  <Btn
                    type="button"
                    variant="quiet"
                    onClick={() => {
                      URL.revokeObjectURL(sketch.url);
                      setSketch(null);
                    }}
                  >
                    حذف
                  </Btn>
                )}
              </div>
            </div>
            {Object.keys(filledMeasures).length > 0 ? (
              <dl className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
                {Object.entries(filledMeasures).map(([key, v]) => (
                  <div key={key} className="rounded-full bg-ivory px-3 py-1">
                    <dt className="inline text-muted-foreground">{measurementLabel(key)}: </dt>
                    <dd className="num inline">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-[12px] text-muted-foreground">لم تُكتب المقاسات بعد.</p>
            )}
            {sketch && (
              <img
                src={sketch.url}
                alt="التصميم"
                className="mt-3 w-full max-w-xs rounded-lg border border-line bg-white"
              />
            )}
          </div>
        </Card>

        {sketchOpen && (
          <SketchBoard
            order={{
              client_name: form.client_name || "عميلة جديدة",
              order_no: "",
              measurements: measures,
            }}
            initial={sketch?.result.doc ?? emptySketch()}
            initialFiles={sketch?.result.files ?? []}
            onMeasuresChange={setMeasures}
            onClose={() => setSketchOpen(false)}
            onSave={async (result) => {
              const first = result.pngs[0];
              if (!first) return;
              if (sketch) URL.revokeObjectURL(sketch.url);
              setSketch({
                result,
                url: URL.createObjectURL(first),
              });
              setSketchOpen(false);
              toast.success("تم حفظ الرسمة — تُرفع مع الطلب عند الحفظ");
            }}
          />
        )}

        <div>
          <Btn type="submit" disabled={busy}>
            {busy ? "جاري الحفظ…" : "حفظ الطلب"}
          </Btn>
        </div>
      </form>
    </AppShell>
  );
}

/** خانة تقبل أكثر من صنف: اختيار من القائمة ثم عرض المختار كوسوم قابلة للحذف */
function MultiPick({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Field label={label} hint="يمكن اختيار أكثر من صنف">
      <select
        className="field"
        value=""
        onChange={(e) => {
          const id = e.target.value;
          if (id && !value.includes(id)) onChange([...value, id]);
        }}
      >
        <option value="">أضف صنفًا</option>
        {options
          .filter((o) => !value.includes(o.id))
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
      </select>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((id) => (
            <button
              key={id}
              type="button"
              className="rounded-full bg-ivory px-3 py-1 text-[12px]"
              onClick={() => onChange(value.filter((v) => v !== id))}
            >
              {options.find((o) => o.id === id)?.name ?? "—"} ×
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
