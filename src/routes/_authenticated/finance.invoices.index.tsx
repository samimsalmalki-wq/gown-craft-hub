import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { FinanceTabs } from "@/components/FinanceTabs";
import { Card, Chip, Empty, Field, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import { useOrders } from "@/lib/data";
import {
  FINANCE_SCOPE_LABEL,
  INVOICE_STATUS_LABEL,
  monthStartISO,
  todayISO,
  type InvoiceStatus,
} from "@/lib/finance";
import { useInvoices } from "@/lib/finance-data";

export const Route = createFileRoute("/_authenticated/finance/invoices/")({
  head: () => ({
    meta: [
      { title: "الفواتير · الماليات · مَعْمَل" },
      { name: "description", content: "كل الفواتير الصادرة والمسودات والملغاة مع مجاميع الضريبة." },
      { property: "og:title", content: "الفواتير · الماليات · مَعْمَل" },
      { property: "og:description", content: "قائمة الفواتير." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvoicesPage,
});

const STATUS_TONE: Record<InvoiceStatus, "ok" | "neutral" | "late"> = {
  issued: "ok",
  draft: "neutral",
  cancelled: "late",
};

function InvoicesPage() {
  const { can, ready } = useCurrentAccount();
  const { data: invoices = [], isLoading } = useInvoices();
  const { data: orders = [] } = useOrders();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [term, setTerm] = useState("");

  if (ready && !(can("finance.invoices") || can("finance.reports"))) {
    return (
      <AppShell title="الفواتير">
        <Empty>لا تملك صلاحية عرض الفواتير.</Empty>
      </AppShell>
    );
  }

  const orderOf = (id: string | null) => orders.find((o) => o.id === id);
  const clientOf = (i: (typeof invoices)[number]) =>
    i.client_name || orderOf(i.order_id)?.client_name || "—";

  const t = term.trim();
  const rows = invoices.filter(
    (i) =>
      i.issue_date >= from &&
      i.issue_date <= to &&
      (status === "all" || i.status === status) &&
      (!t || i.invoice_no.includes(t) || clientOf(i).includes(t)),
  );
  const issued = rows.filter((i) => i.status === "issued");
  const sum = (key: "subtotal" | "tax_amount" | "total") =>
    issued.reduce((s, i) => s + Number(i[key]), 0);

  return (
    <AppShell eyebrow="الماليات" title="الفواتير" subtitle="الفواتير الصادرة والمسودات والملغاة">
      <FinanceTabs />

      <Card title="البحث والفترة">
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="من تاريخ">
            <input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ">
            <input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <Field label="الحالة">
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value as "all" | InvoiceStatus)}
            >
              <option value="all">الكل</option>
              {(Object.keys(INVOICE_STATUS_LABEL) as InvoiceStatus[]).map((s) => (
                <option key={s} value={s}>
                  {INVOICE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="بحث">
            <input
              className="field"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="رقم الفاتورة أو اسم العميلة"
            />
          </Field>
        </div>
      </Card>

      <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="فواتير صادرة" value={issued.length} />
        <Stat label="قبل الضريبة" value={money(sum("subtotal"))} />
        <Stat label="ضريبة القيمة المضافة" value={money(sum("tax_amount"))} tone="gold" />
        <Stat label="الإجمالي شامل الضريبة" value={money(sum("total"))} />
      </div>

      <Card title={`الفواتير (${rows.length.toLocaleString("ar-EG")})`}>
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : rows.length === 0 ? (
          <Empty>لا توجد فواتير في هذه الفترة.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((i) => (
              <li key={i.id}>
                <Link
                  to={i.scope === "sale" ? "/goods/sales/$invoiceId" : "/finance/invoices/$invoiceId"}
                  params={{ invoiceId: i.id }}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ivory"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium">
                      <span className="num" dir="ltr">
                        {i.invoice_no}
                      </span>{" "}
                      · {clientOf(i)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtDate(i.issue_date)} · {FINANCE_SCOPE_LABEL[i.scope]}
                      {Number(i.tax_amount) > 0 ? ` · ضريبة ${money(i.tax_amount)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip tone={STATUS_TONE[i.status]}>{INVOICE_STATUS_LABEL[i.status]}</Chip>
                    <span className="num text-[14px]">{money(i.total)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
