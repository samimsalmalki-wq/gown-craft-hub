import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import type { Order } from "@/lib/atelier";
import {
  useAddPayment,
  useCreateInvoice,
  useInvoices,
  useOrderPayments,
  useTaxSettings,
} from "@/lib/finance-data";
import { PAYMENT_METHOD_LABEL, collected, todayISO } from "@/lib/finance";
import type { PaymentMethod } from "@/lib/finance";

const METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

export function PaymentsCard({ order }: { order: Order }) {
  const { can } = useCurrentAccount();
  const navigate = useNavigate();
  const { data: payments = [] } = useOrderPayments(order.id);
  const { data: invoices = [] } = useInvoices();
  const { data: tax } = useTaxSettings();
  const add = useAddPayment();
  const createInvoice = useCreateInvoice();

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const canPay = can("finance.payments");
  const canInvoice = can("finance.invoices");
  if (!canPay && !canInvoice) return null;

  const paid = collected(payments);
  const due = Math.max(0, Number(order.total_amount) - paid);
  const orderInvoices = invoices.filter((i) => i.order_id === order.id);

  const submit = () => {
    const value = Number(amount);
    if (!(value > 0)) {
      toast.error("اكتب مبلغًا صحيحًا");
      return;
    }
    add
      .mutateAsync({
        orderId: order.id,
        amount: value,
        method,
        paidAt,
        reference,
        notes,
      })
      .then((p) => {
        toast.success(`تم تسجيل الدفعة — سند ${p.receipt_no}`);
        setOpen(false);
        setAmount("");
        setReference("");
        setNotes("");
      })
      .catch((err: Error) => toast.error(err.message));
  };

  const issueInvoice = () => {
    createInvoice
      .mutateAsync({
        orderId: order.id,
        isTaxable: tax?.vat_enabled ?? true,
        vatRate: Number(tax?.vat_rate ?? 15),
        lines: [
          {
            description: `تفصيل فستان — طلب ${order.order_no}`,
            qty: 1,
            unit_price: Number(order.total_amount),
          },
        ],
      })
      .then((inv) => {
        toast.success(`تم إنشاء الفاتورة ${inv.invoice_no}`);
        navigate({ to: "/finance/invoices/$invoiceId", params: { invoiceId: inv.id } });
      })
      .catch((err: Error) => toast.error(err.message));
  };

  return (
    <>
      <Card
        title="الدفعات والفواتير"
        action={<Chip tone={due > 0 ? "late" : "ok"}>{due > 0 ? `متبقٍ ${money(due)}` : "مسدَّد"}</Chip>}
      >
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-line border-b border-line text-center">
          <Cell label="قيمة الفستان" value={money(order.total_amount)} />
          <Cell label="المحصَّل" value={money(paid)} />
          <Cell label="المتبقي" value={money(due)} />
        </div>

        {payments.length === 0 ? (
          <Empty>لا توجد دفعات مسجّلة.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    <span className="num">{money(p.amount)}</span> · {PAYMENT_METHOD_LABEL[p.method]}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    سند {p.receipt_no} · {fmtDate(p.paid_at)}
                    {p.reference ? ` · ${p.reference}` : ""}
                  </p>
                </div>
                {p.is_deposit && <Chip tone="gold">عربون</Chip>}
              </li>
            ))}
          </ul>
        )}

        {orderInvoices.length > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {orderInvoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="text-[13px] font-medium">فاتورة {inv.invoice_no}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {fmtDate(inv.issue_date)} · <span className="num">{money(inv.total)}</span>
                  </p>
                </div>
                <Btn
                  variant="quiet"
                  className="h-9 min-h-0 px-3 text-[12px]"
                  onClick={() =>
                    navigate({ to: "/finance/invoices/$invoiceId", params: { invoiceId: inv.id } })
                  }
                >
                  عرض
                </Btn>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          {canPay && (
            <Btn variant="gold" onClick={() => setOpen(true)}>
              تسجيل دفعة
            </Btn>
          )}
          {canPay && due > 0 && (
            <Btn
              variant="quiet"
              onClick={() =>
                add
                  .mutateAsync({
                    orderId: order.id,
                    amount: due,
                    method: "cash",
                    paidAt: todayISO(),
                    notes: "سداد كامل المتبقي",
                  })
                  .then((p) => toast.success(`تم السداد — سند ${p.receipt_no}`))
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              سداد المتبقي
            </Btn>
          )}
          {canInvoice && (
            <Btn variant="quiet" onClick={issueInvoice} disabled={createInvoice.isPending}>
              إصدار فاتورة
            </Btn>
          )}
        </div>
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="تسجيل دفعة">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <Field label="المبلغ">
            <input
              className="field num"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(due)}
            />
          </Field>
          <Field label="طريقة الدفع">
            <select
              className="field"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="تاريخ الدفع">
            <input
              type="date"
              className="field"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
            />
          </Field>
          <Field label="المرجع" hint="رقم العملية أو الحوالة">
            <input
              className="field"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="ملاحظة">
              <input className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Btn variant="quiet" onClick={() => setOpen(false)}>
            إلغاء
          </Btn>
          <Btn variant="gold" onClick={submit} disabled={add.isPending}>
            حفظ الدفعة
          </Btn>
        </div>
      </Sheet>
    </>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="num text-[15px]">{value}</p>
    </div>
  );
}
