import { FileText, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Btn, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { money } from "@/lib/atelier";
import { useProfiles } from "@/lib/data";
import { buildDepositReceipt, renderDepositReceipt, type ReceiptKind } from "@/lib/deposit-receipt";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/finance";
import {
  rentalMoney,
  returnStatusOptions,
  type RentalDress,
  type RentalRecord,
} from "@/lib/inventory";
import {
  useCloseRentalReturn,
  useDecideRentalCancel,
  useDeliverRental,
  receiptContentOf,
  useReceiptShop,
  useReceiptTemplates,
  useRequestRentalCancel,
} from "@/lib/inventory-data";
import { missingParts, partsOrDress } from "@/lib/goods";
import { useRecordRentalParts } from "@/lib/goods-data";
import { PartsCheckboxes } from "@/components/ChecklistSheet";
import { shareOrDownload } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import {
  DEPOSIT_RECEIVED_KEY,
  DEPOSIT_REFUNDED_KEY,
  fillTemplate,
  normalizePhone,
  rentalVars,
  waLink,
} from "@/lib/whatsapp";
import { useLogWhatsapp, useWhatsappTemplates } from "@/lib/whatsapp-data";

const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

const num = (v: string) => Math.max(Number(v) || 0, 0);

/** اختيار طريقة الدفع أو الرد: كاش أو شبكة أو تحويل */
export function MethodPicker({
  value,
  onChange,
  label = "طريقة الدفع",
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  label?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[12px] text-muted-foreground">{label}</span>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-ivory p-1">
        {METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              "min-h-10 rounded-md text-[13px] transition-colors",
              value === m ? "bg-paper font-medium shadow-sm ring-1 ring-line" : "text-muted-foreground",
            )}
          >
            {PAYMENT_METHOD_LABEL[m]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ErrorLine({ err }: { err: string | null }) {
  if (!err) return null;
  return <p className="rounded-lg bg-late/10 px-3 py-2 text-[13px] text-late">{err}</p>;
}

function SumRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between py-1.5", strong && "font-medium")}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="num">{money(value)}</span>
    </div>
  );
}

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** إيصال التأمين الرسمي PDF: يُشارك بقائمة المشاركة (واتساب) أو يُنزَّل على الجهاز */
export function DepositReceiptButton({
  record,
  dress,
  kind,
  variant = "quiet",
  className,
}: {
  record: RentalRecord;
  dress?: RentalDress | null | undefined;
  kind: ReceiptKind;
  variant?: "quiet" | "gold" | "solid";
  className?: string;
}) {
  const { data: shop } = useReceiptShop(record.branch_id);
  const { data: templates = [] } = useReceiptTemplates();
  const { data: profiles = [] } = useProfiles();
  const { profile } = useCurrentAccount();
  const [busy, setBusy] = useState(false);

  // إيصال الاستلام باسم من سلّم الفستان، وإيصال الرد باسم من يصدره الآن
  const staffId = kind === "received" ? (record.delivered_by ?? profile?.id) : profile?.id;
  const employee = profiles.find((p) => p.id === staffId)?.full_name ?? profile?.full_name ?? null;

  async function make() {
    setBusy(true);
    try {
      const data = buildDepositReceipt(
        kind,
        record,
        dress,
        shop ?? { name: "مَعْمَل" },
        employee,
        receiptContentOf(templates, kind),
      );
      const pdf = await renderDepositReceipt(data);
      const result = await shareOrDownload(pdf, data.fileName, data.title);
      if (result === "downloaded") toast.success("نزل الإيصال على الجهاز — أرفقه في محادثة العميلة");
    } catch (e) {
      toast.error(errorText(e, "تعذّر إنشاء الإيصال"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Btn variant={variant} className={className} disabled={busy} onClick={make}>
      <FileText className="size-4" />
      {busy ? "جاري التجهيز…" : kind === "received" ? "إيصال الاستلام PDF" : "إيصال الرد PDF"}
    </Btn>
  );
}

/** بعد التسليم أو الإرجاع: معاينة إيصال التأمين وإرساله للعميلة بالواتساب */
function ReceiptStep({
  record,
  dress,
  kind,
  templateKey,
  title,
  onClose,
}: {
  record: RentalRecord;
  dress?: RentalDress | null | undefined;
  kind: ReceiptKind;
  templateKey: string;
  title: string;
  onClose: () => void;
}) {
  const { data: templates = [] } = useWhatsappTemplates();
  const log = useLogWhatsapp();
  const template = templates.find((t) => t.key === templateKey && t.is_active);
  const phone = normalizePhone(record.client_phone);
  const text = template ? fillTemplate(template.body, rentalVars(record, dress)) : "";

  function send() {
    if (!phone || !template) return;
    window.open(waLink(phone, text), "_blank", "noopener");
    log.mutate({ orderId: record.order_id, label: template.label, to: record.client_phone ?? phone });
  }

  return (
    <div className="space-y-4 p-4">
      <p className="rounded-lg bg-ok/10 px-3 py-2 text-[13px] text-ok">{title}</p>
      {template ? (
        <>
          <p className="text-[12px] text-muted-foreground">{template.label} — تقدر تعدّل نصه من إعدادات رسائل الواتساب</p>
          <pre className="rounded-lg border border-line bg-ivory px-3 py-2 font-sans text-[13px] whitespace-pre-wrap">
            {text}
          </pre>
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground">رسالة الإيصال غير مفعّلة في إعدادات الواتساب.</p>
      )}
      {!phone && (
        <p className="rounded-lg bg-soon/10 px-3 py-2 text-[12px] text-soon">
          ما فيه رقم جوال صحيح للعميلة في الحجز.
        </p>
      )}
      <DepositReceiptButton
        record={record}
        dress={dress}
        kind={kind}
        variant="gold"
        className="w-full"
      />
      <p className="text-[12px] text-muted-foreground">
        في الآيباد والجوال تفتح قائمة المشاركة: اختر واتساب ثم العميلة. في الكمبيوتر ينزل الملف
        وترفقه بنفسك. نصوص الإيصال تتعدّل من الإعدادات ← نصوص إيصالات التأمين.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Btn variant="quiet" disabled={!phone || !template} onClick={send}>
          <MessageCircle className="size-4" />
          رسالة واتساب نصية
        </Btn>
        <Btn variant="quiet" onClick={onClose}>
          تم
        </Btn>
      </div>
    </div>
  );
}

/** تسليم الفستان: يُقبض باقي الإيجار في صندوق الفرع والتأمين في صندوق التأمينات */
export function DeliverSheet({
  record,
  dress,
  onClose,
}: {
  record: RentalRecord | null;
  dress?: RentalDress | null | undefined;
  onClose: () => void;
}) {
  const deliver = useDeliverRental();
  const recordParts = useRecordRentalParts();
  const [done, setDone] = useState(false);
  const [rent, setRent] = useState("");
  const [rentMethod, setRentMethod] = useState<PaymentMethod>("cash");
  const [deposit, setDeposit] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("cash");
  const [err, setErr] = useState<string | null>(null);
  // قطع الفستان اللي خرجت مع العميلة
  const parts = partsOrDress(dress?.parts);
  const [outParts, setOutParts] = useState<string[]>([]);

  const m = record ? rentalMoney(record) : null;

  // يُهيّأ عند فتح عقد جديد فقط، لا عند تحديث بياناته بعد التسليم
  useEffect(() => {
    if (!record) return;
    const mm = rentalMoney(record);
    setErr(null);
    setDone(false);
    setRent(mm.remaining ? String(mm.remaining) : "");
    setDeposit(mm.tracked && Number(record.deposit_amount) ? String(Number(record.deposit_amount)) : "");
    setRentMethod("cash");
    setDepositMethod("cash");
    setOutParts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  if (!record || !m) return null;

  if (done) {
    return (
      <Sheet open onClose={onClose} title={`تسليم الفستان لـ${record.client_name}`}>
        <ReceiptStep
          record={record}
          dress={dress}
          kind="received"
          templateKey={DEPOSIT_RECEIVED_KEY}
          title="تم تسليم الفستان واستلام التأمين."
          onClose={onClose}
        />
      </Sheet>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!record || !m) return;
    setErr(null);
    if (num(rent) > m.remaining) {
      setErr(`المتبقي من الإيجار ${money(m.remaining)} فقط.`);
      return;
    }
    if (outParts.length === 0) {
      setErr("أشّر على القطع اللي خرجت مع العميلة.");
      return;
    }
    try {
      await deliver.mutateAsync({
        recordId: record.id,
        rentPaid: m.tracked ? num(rent) : 0,
        rentMethod,
        depositPaid: m.tracked ? num(deposit) : 0,
        depositMethod,
      });
    } catch (e2) {
      setErr(errorText(e2, "تعذّر تسليم الفستان."));
      return;
    }
    try {
      await recordParts.mutateAsync({ recordId: record.id, stage: "out", parts: outParts });
    } catch {
      toast.error("تم التسليم لكن تعذّر حفظ قائمة القطع");
    }
    toast.success("تم تسليم الفستان للعميلة");
    if (m.tracked && num(deposit) > 0) setDone(true);
    else onClose();
  }

  const stillOwed = Math.max(m.remaining - num(rent), 0);

  return (
    <Sheet open onClose={onClose} title={`تسليم الفستان لـ${record.client_name}`}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <ErrorLine err={err} />
        {m.tracked ? (
          <>
            <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
              <SumRow label="قيمة الإيجار" value={m.rent} />
              <SumRow label="المدفوع (العربون)" value={m.paid} />
              <SumRow label="المتبقي" value={m.remaining} strong />
            </div>

            {m.remaining > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="باقي الإيجار المقبوض الآن" hint="يدخل صندوق الفرع بسند قبض">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="field w-full"
                    value={rent}
                    onChange={(e) => setRent(e.target.value)}
                  />
                </Field>
                <MethodPicker value={rentMethod} onChange={setRentMethod} />
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="التأمين المقبوض" hint="يدخل صندوق التأمينات — أمانة للعميلة وليس دخلًا">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  className="field w-full"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value)}
                />
              </Field>
              <MethodPicker value={depositMethod} onChange={setDepositMethod} />
            </div>

            {stillOwed > 0 && (
              <p className="rounded-lg bg-soon/10 px-3 py-2 text-[12px] text-soon">
                يبقى على العميلة {money(stillOwed)} من الإيجار بعد التسليم.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-lg bg-ivory px-3 py-2 text-[12px] text-muted-foreground">
            {record.order_id
              ? "إيجار هذا الفستان مسجّل على طلب التفصيل."
              : "هذا حجز قديم مسجّل قبل نظام المبالغ، فيُسلَّم بدون سندات."}
          </p>
        )}

        <PartsCheckboxes
          title="القطع اللي خرجت مع العميلة"
          items={parts}
          value={outParts}
          onChange={setOutParts}
        />
        {outParts.length > 0 && missingParts(parts, outParts).length > 0 && (
          <p className="rounded-lg bg-soon/10 px-3 py-2 text-[12px] text-soon">
            بينسجل إن هذي ما خرجت: {missingParts(parts, outParts).join("، ")}
          </p>
        )}

        <Btn type="submit" variant="gold" className="w-full" disabled={deliver.isPending}>
          {deliver.isPending ? "جاري التسليم…" : "تأكيد التسليم — يصير الفستان مؤجَّرًا"}
        </Btn>
      </form>
    </Sheet>
  );
}

/** الإرجاع: يُرد التأمين من صندوق التأمينات بسند صرف بعد خصم التلف */
export function ReturnSheet({
  record,
  dress,
  onClose,
}: {
  record: RentalRecord | null;
  dress?: RentalDress | null | undefined;
  onClose: () => void;
}) {
  const close = useCloseRentalReturn();
  const recordParts = useRecordRentalParts();
  const [done, setDone] = useState(false);
  const [condition, setCondition] = useState("available");
  const [damage, setDamage] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // اللي يرجع هو اللي خرج مع العميلة
  const parts = record?.out_parts?.length ? record.out_parts : partsOrDress(dress?.parts);
  const [backParts, setBackParts] = useState<string[]>([]);

  useEffect(() => {
    if (!record) return;
    setErr(null);
    setDone(false);
    setCondition("available");
    setDamage("");
    setNote("");
    setBackParts([]);
    setMethod(record.deposit_method && record.deposit_method !== "other" ? record.deposit_method : "cash");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  if (!record) return null;
  const m = rentalMoney(record);

  if (done) {
    return (
      <Sheet open onClose={onClose} title={`إرجاع الفستان من ${record.client_name}`}>
        <ReceiptStep
          record={record}
          dress={dress}
          kind="refunded"
          templateKey={DEPOSIT_REFUNDED_KEY}
          title="تم الإرجاع ورد التأمين."
          onClose={onClose}
        />
      </Sheet>
    );
  }
  const cut = Math.min(num(damage), m.depositHeld);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!record) return;
    setErr(null);
    if (num(damage) > m.depositHeld) {
      setErr(`الخصم ما يتعدى التأمين المقبوض ${money(m.depositHeld)}.`);
      return;
    }
    if (backParts.length === 0) {
      setErr("أشّر على القطع اللي رجعت.");
      return;
    }
    try {
      await close.mutateAsync({
        recordId: record.id,
        condition,
        damage: cut,
        note: note.trim() || null,
        method,
      });
    } catch (e2) {
      setErr(errorText(e2, "تعذّر تسجيل الإرجاع."));
      return;
    }
    try {
      await recordParts.mutateAsync({ recordId: record.id, stage: "return", parts: backParts });
    } catch {
      toast.error("تم الإرجاع لكن تعذّر حفظ قائمة القطع");
    }
    toast.success(m.depositHeld > 0 ? "تم الإرجاع ورد التأمين" : "تم تسجيل الإرجاع");
    if (m.depositHeld > 0) setDone(true);
    else onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`إرجاع الفستان من ${record.client_name}`}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <ErrorLine err={err} />
        <PartsCheckboxes
          title="القطع اللي رجعت"
          items={parts}
          value={backParts}
          onChange={setBackParts}
        />
        {backParts.length > 0 && missingParts(parts, backParts).length > 0 && (
          <p className="rounded-lg bg-late/8 px-3 py-2 text-[12px] text-late">
            ما رجع: {missingParts(parts, backParts).join("، ")} — بينسجل نقص للمتابعة، وتقدر تخصم
            قيمته من التأمين تحت.
          </p>
        )}

        <Field label="حالة الفستان بعد الإرجاع">
          <select
            className="field w-full"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {returnStatusOptions().map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        {m.depositHeld > 0 ? (
          <>
            <Field
              label="خصم تلف أو تنظيف"
              hint={`يُخصم من التأمين ويدخل الماليات إيراد «تلف وتنظيف»`}
            >
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                max={m.depositHeld}
                className="field w-full"
                value={damage}
                onChange={(e) => setDamage(e.target.value)}
                placeholder="0"
              />
            </Field>
            <MethodPicker value={method} onChange={setMethod} label="طريقة رد التأمين" />
            <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
              <SumRow label="التأمين المقبوض" value={m.depositHeld} />
              {cut > 0 && <SumRow label="خصم التلف" value={cut} />}
              <SumRow label="يُرد للعميلة بسند صرف" value={m.depositHeld - cut} strong />
            </div>
          </>
        ) : (
          <p className="rounded-lg bg-ivory px-3 py-2 text-[12px] text-muted-foreground">
            ما فيه تأمين مسجّل على هذا الإيجار في صندوق التأمينات.
          </p>
        )}

        <Field label="ملاحظات">
          <textarea
            className="field w-full"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <Btn type="submit" variant="gold" className="w-full" disabled={close.isPending}>
          {close.isPending ? "جاري التسجيل…" : "تأكيد الإرجاع"}
        </Btn>
      </form>
    </Sheet>
  );
}

/** طلب إلغاء الحجز: يصل للمدير ويبقى الحجز قائمًا حتى يقرر */
export function CancelRequestSheet({
  record,
  onClose,
}: {
  record: RentalRecord | null;
  onClose: () => void;
}) {
  const request = useRequestRentalCancel();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setReason("");
    setErr(null);
  }, [record]);

  if (!record) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!record) return;
    setErr(null);
    try {
      await request.mutateAsync({ recordId: record.id, reason: reason.trim() || null });
    } catch (e2) {
      setErr(errorText(e2, "تعذّر إرسال الطلب."));
      return;
    }
    toast.success("وصل طلب الإلغاء للمدير");
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`طلب إلغاء حجز ${record.client_name}`}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <ErrorLine err={err} />
        <p className="text-[13px] text-muted-foreground">
          يوصل الطلب للمدير، والحجز يبقى قائمًا لين يقرر: يرجّع المدفوع كامل أو جزء منه أو ما يرجّع
          شي.
        </p>
        <Field label="سبب الإلغاء">
          <textarea
            className="field w-full"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: تغيّر موعد المناسبة"
          />
        </Field>
        <Btn type="submit" className="w-full" disabled={request.isPending}>
          {request.isPending ? "جاري الإرسال…" : "إرسال طلب الإلغاء"}
        </Btn>
      </form>
    </Sheet>
  );
}

type Choice = "full" | "partial" | "none";

/** قرار الإلغاء: رد كامل أو جزئي أو بدون رد، أو رفض الطلب وإبقاء الحجز */
export function CancelDecisionSheet({
  record,
  onClose,
}: {
  record: RentalRecord | null;
  onClose: () => void;
}) {
  const decide = useDecideRentalCancel();
  const [choice, setChoice] = useState<Choice>("full");
  const [partial, setPartial] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setChoice("full");
    setPartial("");
    setMethod("cash");
    setNote("");
    setErr(null);
  }, [record]);

  if (!record) return null;
  const paid = Number(record.paid_amount);
  const refund = choice === "full" ? paid : choice === "none" ? 0 : Math.min(num(partial), paid);
  const kept = paid - refund;

  async function run(cancel: boolean) {
    if (!record) return;
    setErr(null);
    if (cancel && choice === "partial" && num(partial) > paid) {
      setErr(`المبلغ المرجّع ما يتعدى المدفوع ${money(paid)}.`);
      return;
    }
    try {
      await decide.mutateAsync({
        recordId: record.id,
        cancel,
        refund: cancel ? refund : 0,
        method,
        note: note.trim() || null,
      });
    } catch (e2) {
      setErr(errorText(e2, "تعذّر تنفيذ القرار."));
      return;
    }
    toast.success(cancel ? "تم إلغاء الحجز" : "رُفض الطلب وبقي الحجز");
    onClose();
  }

  const options: { key: Choice; label: string }[] = [
    { key: "full", label: "يرجّع المدفوع كامل" },
    { key: "partial", label: "يرجّع جزء منه" },
    { key: "none", label: "ما يرجّع شي" },
  ];

  return (
    <Sheet open onClose={onClose} title={`إلغاء حجز ${record.client_name}`}>
      <div className="space-y-4 p-4">
        <ErrorLine err={err} />
        {record.cancel_reason && (
          <p className="rounded-lg bg-ivory px-3 py-2 text-[13px]">
            <span className="text-muted-foreground">سبب الطلب: </span>
            {record.cancel_reason}
          </p>
        )}
        <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
          <SumRow label="دفعت العميلة" value={paid} strong />
        </div>

        {paid > 0 && (
          <>
            <div className="grid gap-2">
              {options.map((o) => (
                <label
                  key={o.key}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-[13px]",
                    choice === o.key ? "border-gold bg-gold/5" : "border-line",
                  )}
                >
                  <input
                    type="radio"
                    name="cancel-choice"
                    className="size-4 accent-current"
                    checked={choice === o.key}
                    onChange={() => setChoice(o.key)}
                  />
                  {o.label}
                </label>
              ))}
            </div>

            {choice === "partial" && (
              <Field label="المبلغ اللي يرجع للعميلة" hint={`من ${money(paid)} — والباقي إيراد للمحل`}>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  max={paid}
                  className="field w-full"
                  value={partial}
                  onChange={(e) => setPartial(e.target.value)}
                />
              </Field>
            )}

            {refund > 0 && (
              <MethodPicker value={method} onChange={setMethod} label="طريقة الرد" />
            )}

            <div className="rounded-lg border border-line px-3 py-2 text-[13px]">
              <SumRow label="يرجع للعميلة بسند صرف" value={refund} />
              <SumRow label="يبقى للمحل إيراد" value={kept} strong />
            </div>
          </>
        )}

        <Field label="ملاحظة على القرار">
          <input className="field w-full" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <Btn variant="gold" disabled={decide.isPending} onClick={() => run(true)}>
            تأكيد الإلغاء
          </Btn>
          {record.cancel_requested_at && (
            <Btn variant="quiet" disabled={decide.isPending} onClick={() => run(false)}>
              رفض الطلب وإبقاء الحجز
            </Btn>
          )}
        </div>
      </div>
    </Sheet>
  );
}
