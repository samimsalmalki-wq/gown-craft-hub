import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Btn, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, fmtDateTime } from "@/lib/atelier";
import { branchLabel, useBranches } from "@/lib/branches";
import { PAYMENT_METHOD_LABEL, type InvoiceLine, type PaymentMethod } from "@/lib/finance";
import { sar } from "@/lib/goods";
import { useBranchTax, useReturnSale, useSaleInvoice, useSaleReturns } from "@/lib/goods-data";
import { cn } from "@/lib/utils";

/** فاتورة بيع من المخزون: فاتورة ضريبية مبسطة قابلة للطباعة (الأسعار شاملة الضريبة) ومرتجعاتها */
export const Route = createFileRoute("/_authenticated/goods/sales/$invoiceId")({
  head: () => ({ meta: [{ title: "فاتورة بيع · مَعْمَل" }] }),
  component: SaleInvoicePage,
});

const unitIncl = (l: InvoiceLine) => Number(l.unit_price_incl ?? l.unit_price);

function SaleInvoicePage() {
  const { invoiceId } = Route.useParams();
  const { can } = useCurrentAccount();
  const { data, isLoading } = useSaleInvoice(invoiceId);
  const { data: returns = [] } = useSaleReturns(invoiceId);
  const { data: branches = [] } = useBranches();
  const invoice = data?.invoice ?? null;
  const { data: tax } = useBranchTax(invoice?.branch_id ?? null);
  const [returning, setReturning] = useState(false);

  if (isLoading) return <Empty>جاري التحميل…</Empty>;
  if (!invoice) return <Empty>الفاتورة غير موجودة أو ما عندك صلاحية عليها.</Empty>;

  const lines = data?.lines ?? [];
  const rate = Number(invoice.vat_rate);
  const returnable = lines.some((l) => Number(l.qty) - Number(l.returned_qty) > 0);
  const returnedTotal = returns.reduce((s, r) => s + Number(r.total), 0);

  return (
    <div className="min-h-screen bg-ivory py-4 print:min-h-0 print:bg-white print:py-0">
      <style>{`@page { size: auto; margin: 8mm; }`}</style>

      <div className="mx-auto mb-4 flex max-w-md items-center justify-between gap-2 px-4 print:hidden">
        {invoice.scope === "sale" ? (
          <Link
            to="/goods"
            search={{ loc: invoice.branch_id ?? undefined }}
            className="text-[13px] text-gold"
          >
            رجوع للمخزون
          </Link>
        ) : (
          <button className="text-[13px] text-gold" onClick={() => window.history.back()}>
            رجوع
          </button>
        )}
        <div className="flex gap-2">
          {can("goods.return") &&
            invoice.scope === "sale" &&
            returnable &&
            invoice.status === "issued" && (
              <Btn variant="quiet" onClick={() => setReturning(true)}>
                مرتجع
              </Btn>
            )}
          <Btn onClick={() => window.print()}>طباعة</Btn>
        </div>
      </div>

      <div className="mx-auto max-w-md bg-white p-6 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 border-b border-neutral-300 pb-3 text-center">
          <p className="text-[18px] font-bold">{tax?.business_name || "مَعْمَل"}</p>
          <p className="text-[12px] text-neutral-600">
            فرع {branchLabel(branches, invoice.branch_id)}
          </p>
          {tax?.business_address && (
            <p className="text-[11px] text-neutral-600">{tax.business_address}</p>
          )}
          {invoice.is_taxable && tax?.tax_number && (
            <p className="text-[11px] text-neutral-600">
              الرقم الضريبي <span className="num">{tax.tax_number}</span>
            </p>
          )}
          <p className="mt-2 text-[14px] font-medium">
            {invoice.is_taxable ? "فاتورة ضريبية مبسطة" : "فاتورة بيع"}
          </p>
        </header>

        <dl className="mb-4 grid grid-cols-2 gap-y-1 text-[12.5px]">
          <dt className="text-neutral-600">رقم الفاتورة</dt>
          <dd className="num text-left">{invoice.invoice_no}</dd>
          <dt className="text-neutral-600">التاريخ</dt>
          <dd className="text-left">{fmtDate(invoice.issue_date)}</dd>
          <dt className="text-neutral-600">العميلة</dt>
          <dd className="text-left">{invoice.client_name ?? "—"}</dd>
          {invoice.client_phone && (
            <>
              <dt className="text-neutral-600">الجوال</dt>
              <dd className="num text-left" dir="ltr">
                {invoice.client_phone}
              </dd>
            </>
          )}
        </dl>

        <table className="mb-4 w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-neutral-300 text-neutral-600">
              <th className="py-1.5 text-right font-normal">الصنف</th>
              <th className="py-1.5 text-center font-normal">الكمية</th>
              <th className="py-1.5 text-left font-normal">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200 align-top">
                <td className="py-2">
                  {l.description}
                  {Number(l.qty) > 1 && (
                    <span className="block text-[11px] text-neutral-500">
                      {sar(unitIncl(l))} للقطعة
                    </span>
                  )}
                  {Number(l.returned_qty) > 0 && (
                    <span className="block text-[11px] text-red-700 print:hidden">
                      مرتجع {Number(l.returned_qty)}
                    </span>
                  )}
                </td>
                <td className="num py-2 text-center">{Number(l.qty)}</td>
                <td className="py-2 text-left">{sar(unitIncl(l) * Number(l.qty))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="space-y-1 text-[13px]">
          {invoice.is_taxable && (
            <>
              <div className="flex justify-between">
                <dt className="text-neutral-600">المبلغ قبل الضريبة</dt>
                <dd>{sar(invoice.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-600">ضريبة القيمة المضافة {rate}٪</dt>
                <dd>{sar(invoice.tax_amount)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-[15px] font-bold">
            <dt>الإجمالي{invoice.is_taxable ? " شامل الضريبة" : ""}</dt>
            <dd>{sar(invoice.total)}</dd>
          </div>
        </dl>

        <p className="mt-6 text-center text-[11px] text-neutral-500">شكرًا لزيارتكم 🌸</p>
      </div>

      {returns.length > 0 && (
        <div className="mx-auto mt-4 max-w-md rounded-xl border border-line bg-paper print:hidden">
          <p className="border-b border-line px-4 py-2.5 text-[13.5px] font-medium">
            المرتجعات — {sar(returnedTotal)}
          </p>
          <ul className="divide-y divide-line text-[13px]">
            {returns.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <p className="flex justify-between gap-3 font-medium">
                  <span>
                    <span className="num">{r.return_no}</span> · {PAYMENT_METHOD_LABEL[r.method]}
                    {r.voucher_no && (
                      <span className="text-muted-foreground">
                        {" "}
                        · سند <span className="num">{r.voucher_no}</span>
                      </span>
                    )}
                  </span>
                  <span>{sar(r.total)}</span>
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {r.sale_return_lines
                    .map((x) => {
                      const line = lines.find((l) => l.id === x.invoice_line_id);
                      return `${line?.description ?? "قطعة"} × ${x.qty}`;
                    })
                    .join("، ")}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  {r.reason} · {fmtDateTime(r.created_at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {returning && (
        <ReturnSheet
          invoiceId={invoice.id}
          lines={lines}
          rate={invoice.is_taxable ? rate : 0}
          onClose={() => setReturning(false)}
        />
      )}
    </div>
  );
}

const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

/** مرتجع: القطع ترجع لمخزن الفرع، والمبلغ يطلع بسند صرف من صندوق الفرع */
function ReturnSheet({
  invoiceId,
  lines,
  rate,
  onClose,
}: {
  invoiceId: string;
  lines: InvoiceLine[];
  rate: number;
  onClose: () => void;
}) {
  const ret = useReturnSale();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reason, setReason] = useState("");

  const open = lines.filter((l) => Number(l.qty) - Number(l.returned_qty) > 0);
  const left = (l: InvoiceLine) => Number(l.qty) - Number(l.returned_qty);
  const set = (l: InvoiceLine, v: number) =>
    setQty((cur) => ({ ...cur, [l.id]: Math.min(left(l), Math.max(0, v)) }));
  const total = open.reduce((s, l) => s + (qty[l.id] ?? 0) * unitIncl(l), 0);
  const vat = rate > 0 ? Math.round((total - (total * 100) / (100 + rate)) * 100) / 100 : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const picked = open
      .filter((l) => (qty[l.id] ?? 0) > 0)
      .map((l) => ({ line_id: l.id, qty: qty[l.id] ?? 0 }));
    if (picked.length === 0) {
      toast.error("اختر القطع المرتجعة");
      return;
    }
    ret.mutate(
      { invoiceId, lines: picked, method, reason },
      {
        onSuccess: () => {
          toast.success("انسجل المرتجع ورجعت القطع لمخزن الفرع");
          onClose();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر تسجيل المرتجع"),
      },
    );
  }

  return (
    <Sheet open onClose={onClose} title="مرتجع بيع">
      <form onSubmit={submit} className="space-y-4 p-4">
        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">القطع المرتجعة</p>
          <ul className="divide-y divide-line">
            {open.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-[13.5px]">
                  {l.description}
                  <span className="block text-[11.5px] text-muted-foreground">
                    {sar(unitIncl(l))} للقطعة · يقبل الإرجاع {left(l)}
                  </span>
                </span>
                <div className="flex items-center rounded-lg border border-line">
                  <button
                    type="button"
                    aria-label="إنقاص"
                    className="grid size-10 place-items-center text-[18px]"
                    onClick={() => set(l, (qty[l.id] ?? 0) - 1)}
                  >
                    −
                  </button>
                  <span className="num w-8 text-center">{qty[l.id] ?? 0}</span>
                  <button
                    type="button"
                    aria-label="زيادة"
                    className="grid size-10 place-items-center text-[18px]"
                    onClick={() => set(l, (qty[l.id] ?? 0) + 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <Field label="طريقة رد المبلغ" hint="يطلع سند صرف من صندوق الفرع حسب الطريقة">
          <div className="grid grid-cols-3 gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  "min-h-11 rounded-lg border text-[13.5px]",
                  method === m ? "border-gold bg-gold/10 font-medium text-gold" : "border-line",
                )}
              >
                {PAYMENT_METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="سبب المرتجع">
          <input
            className="field w-full"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: المقاس ما ناسب"
            required
          />
        </Field>

        <dl className="space-y-1.5 rounded-xl bg-ivory px-4 py-3 text-[13.5px]">
          {rate > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">منها ضريبة القيمة المضافة</dt>
              <dd>{sar(vat)}</dd>
            </div>
          )}
          <div className="flex justify-between text-[15px] font-bold">
            <dt>المبلغ المسترد</dt>
            <dd>{sar(total)}</dd>
          </div>
        </dl>

        <Btn type="submit" className="w-full" disabled={ret.isPending || total <= 0}>
          {ret.isPending ? "جاري التسجيل…" : `تسجيل المرتجع ورد ${sar(total)}`}
        </Btn>
      </form>
    </Sheet>
  );
}
