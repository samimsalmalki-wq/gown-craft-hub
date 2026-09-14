import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useOrder } from "@/lib/data";
import {
  useAddInvoiceLine,
  useDeleteInvoiceLine,
  useInvoice,
  useInvoiceLines,
  useTaxSettings,
  useUpdateInvoice,
} from "@/lib/finance-data";
import { fmtDate, money } from "@/lib/atelier";
import { INVOICE_STATUS_LABEL } from "@/lib/finance";

export const Route = createFileRoute("/_authenticated/finance/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "فاتورة · مَعْمَل" },
      {
        name: "description",
        content: "فاتورة ضريبية ببنود التفصيل وضريبة القيمة المضافة قابلة للطباعة بالعربية.",
      },
      { property: "og:title", content: "فاتورة · مَعْمَل" },
      {
        property: "og:description",
        content: "فاتورة ضريبية ببنود التفصيل وضريبة القيمة المضافة.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const { can, ready } = useCurrentAccount();
  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const { data: lines = [] } = useInvoiceLines(invoiceId);
  const { data: tax } = useTaxSettings();
  const { data: order } = useOrder(invoice?.order_id ?? "");
  const addLine = useAddInvoiceLine(invoiceId);
  const delLine = useDeleteInvoiceLine(invoiceId);
  const update = useUpdateInvoice(invoiceId);

  const [desc, setDesc] = useState("");
  const [qtyValue, setQtyValue] = useState("1");
  const [price, setPrice] = useState("");

  if (ready && !can("finance.invoices")) {
    return (
      <AppShell title="الفاتورة">
        <Empty>لا تملك صلاحية عرض الفواتير.</Empty>
      </AppShell>
    );
  }
  if (isLoading) {
    return (
      <AppShell title="الفاتورة">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }
  if (!invoice) {
    return (
      <AppShell title="الفاتورة">
        <Empty>الفاتورة غير موجودة.</Empty>
      </AppShell>
    );
  }

  const editable = invoice.status === "draft";

  const submitLine = () => {
    addLine
      .mutateAsync({
        description: desc,
        qty: Number(qtyValue) || 1,
        unit_price: Number(price) || 0,
      })
      .then(() => {
        setDesc("");
        setQtyValue("1");
        setPrice("");
      })
      .catch((err: Error) => toast.error(err.message));
  };

  return (
    <AppShell
      eyebrow="الماليات"
      title={`فاتورة ${invoice.invoice_no}`}
      subtitle={`${fmtDate(invoice.issue_date)}${order ? ` · ${order.client_name} · طلب ${order.order_no}` : ""}`}
      actions={
        <>
          <Chip tone={invoice.status === "issued" ? "ok" : invoice.status === "draft" ? "gold" : "late"}>
            {INVOICE_STATUS_LABEL[invoice.status]}
          </Chip>
          <Btn variant="quiet" onClick={() => window.print()}>
            طباعة
          </Btn>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card title="بنود الفاتورة">
          {lines.length === 0 ? (
            <Empty>لا توجد بنود بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13.5px]">{l.description}</p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="num">{Number(l.qty)}</span> ×{" "}
                      <span className="num">{money(l.unit_price)}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num text-[14px]">
                      {money(Number(l.qty) * Number(l.unit_price))}
                    </span>
                    {editable && (
                      <button
                        onClick={() =>
                          delLine.mutateAsync(l.id).catch((e: Error) => toast.error(e.message))
                        }
                        className="text-[12px] text-late"
                      >
                        حذف
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editable && (
            <div className="grid gap-3 border-t border-line px-4 py-4 sm:grid-cols-[1fr_90px_120px_auto]">
              <Field label="وصف البند">
                <input className="field" value={desc} onChange={(e) => setDesc(e.target.value)} />
              </Field>
              <Field label="الكمية">
                <input
                  className="field num"
                  inputMode="decimal"
                  value={qtyValue}
                  onChange={(e) => setQtyValue(e.target.value)}
                />
              </Field>
              <Field label="سعر الوحدة">
                <input
                  className="field num"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <Btn variant="gold" onClick={submitLine} disabled={addLine.isPending}>
                  إضافة
                </Btn>
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="الإجمالي">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="الإجمالي قبل الضريبة" value={money(invoice.subtotal)} />
              <Row
                label={`ضريبة القيمة المضافة ${Number(invoice.vat_rate)}%`}
                value={money(invoice.tax_amount)}
              />
              <Row label="الإجمالي المستحق" value={money(invoice.total)} strong />
            </dl>
            {tax?.tax_number && (
              <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted-foreground">
                الرقم الضريبي: <span className="num">{tax.tax_number}</span>
              </p>
            )}
          </Card>

          <Card title="حالة الفاتورة">
            <div className="flex flex-wrap gap-2 px-4 py-4">
              {invoice.status === "draft" && (
                <Btn
                  variant="gold"
                  onClick={() =>
                    update
                      .mutateAsync({ status: "issued" })
                      .then(() => toast.success("تم إصدار الفاتورة"))
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  إصدار الفاتورة
                </Btn>
              )}
              {invoice.status !== "cancelled" && (
                <Btn
                  variant="quiet"
                  onClick={() =>
                    update
                      .mutateAsync({ status: "cancelled" })
                      .then(() => toast.success("تم إلغاء الفاتورة"))
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  إلغاء الفاتورة
                </Btn>
              )}
              {invoice.status === "draft" && (
                <label className="flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={invoice.is_taxable}
                    onChange={(e) =>
                      update
                        .mutateAsync({ is_taxable: e.target.checked })
                        .catch((err: Error) => toast.error(err.message))
                    }
                  />
                  خاضعة للضريبة
                </label>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "num text-[16px] font-medium" : "num"}>{value}</dd>
    </div>
  );
}
