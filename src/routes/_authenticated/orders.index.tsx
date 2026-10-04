import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { WarehouseScopeNote } from "@/components/WarehouseScopeNote";
import { OrdersTabs } from "@/components/OrdersTabs";
import { Card, Chip, Empty, PaymentChip } from "@/components/kit";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { useCurrentAccount } from "@/hooks/useSession";
import { useItemTypes, useOrders } from "@/lib/data";
import {
  ORDER_KIND_LABEL,
  ORDER_STATE_LABEL,
  fmtDate,
  isLate,
  itemTypeLabel,
  money,
  remaining,
  stageLabel,
  type OrderKind,
  type OrderState,
} from "@/lib/atelier";

const KIND_FILTERS: { key: "all" | OrderKind; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "own", label: ORDER_KIND_LABEL.own },
  { key: "rental", label: ORDER_KIND_LABEL.rental },
  { key: "rental_stock", label: ORDER_KIND_LABEL.rental_stock },
];

// الطلب المسلَّم أو الملغي يختفي من القائمة، ويظهر بفلتر الحالة
const STATE_FILTERS: { key: "all" | OrderState; label: string }[] = [
  { key: "active", label: ORDER_STATE_LABEL.active },
  { key: "delivered", label: "المسلَّمة" },
  { key: "cancelled", label: "الملغاة" },
  { key: "all", label: "كل الحالات" },
];

export const Route = createFileRoute("/_authenticated/orders/")({
  validateSearch: (search: Record<string, unknown>): { q?: string | undefined } => {
    const raw = search["q"];
    return { q: typeof raw === "string" && raw ? raw : undefined };
  },
  component: OrdersPage,
});

function OrdersPage() {
  const { can } = useCurrentAccount();
  const { q } = Route.useSearch();
  const { data: orders = [], isLoading } = useOrders();
  useItemTypes();
  const [term, setTerm] = useState(q ?? "");
  const [kind, setKind] = useState<"all" | OrderKind>("all");
  const [state, setState] = useState<"all" | OrderState>("active");

  const needle = (term || "").trim().toLowerCase();
  const matches = orders
    .filter((o) => kind === "all" || o.order_kind === kind)
    .filter((o) =>
      !needle
        ? true
        : [
            o.order_no,
            o.external_invoice_no ?? "",
            o.client_name,
            o.client_phone ?? "",
            o.client_contact ?? "",
          ].some((v) =>
            v.toLowerCase().includes(needle),
          ),
    );
  const list = matches.filter((o) => state === "all" || o.state === state);
  const countOf = (s: "all" | OrderState) =>
    s === "all" ? matches.length : matches.filter((o) => o.state === s).length;
  /** طلبات تطابق البحث لكنها مخفية بفلتر الحالة */
  const hidden = matches.length - list.length;

  return (
    <AppShell
      eyebrow="السجل"
      title="الطلبات"
      subtitle="ابحث برقم الطلب أو اسم العميلة أو رقم الجوال."
      actions={
        can("orders.create") ? (
          <Link
            to="/orders/new"
            className="inline-flex min-h-11 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper ring-1 ring-black/10"
          >
            طلب جديد
          </Link>
        ) : undefined
      }
    >
      <OrdersTabs />
      <WarehouseScopeNote />

      <div className="mb-4 space-y-3">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="field w-full max-w-md"
          placeholder="رقم الطلب / اسم العميلة / الجوال"
        />
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setKind(f.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-[13px] ${
                kind === f.key
                  ? "bg-goldsoft/60 font-medium text-ink ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setState(f.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-center text-[13px] ${
                state === f.key
                  ? "bg-goldsoft/60 font-medium text-ink ring-1 ring-black/5"
                  : "text-muted-foreground hover:text-ink"
              }`}
            >
              {f.label} <span className="num">({countOf(f.key).toLocaleString("ar-EG")})</span>
            </button>
          ))}
        </div>
        {needle && hidden > 0 && state !== "all" && (
          <button type="button" onClick={() => setState("all")} className="text-[13px] text-gold">
            فيه {hidden.toLocaleString("ar-EG")} طلب بحالة ثانية يطابق البحث — اعرضها
          </button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : list.length === 0 ? (
          <Empty>
            {needle
              ? "لا توجد نتائج مطابقة."
              : state === "active"
                ? "ما فيه طلبات قيد التنفيذ. الطلبات المسلَّمة تحت «المسلَّمة»."
                : "لا توجد طلبات بهذي الحالة."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((o) => (
              <li key={o.id} className="flex items-center gap-2 pl-3 hover:bg-ivory">
                <Link
                  to="/orders/$orderId"
                  params={{ orderId: o.id }}
                  className="block min-w-0 flex-1 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="num text-[16px] text-gold">{o.order_no}</span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                      {o.client_name}
                    </span>
                    {o.order_kind !== "own" && (
                      <Chip tone="gold">{ORDER_KIND_LABEL[o.order_kind]}</Chip>
                    )}
                    <Chip>{stageLabel(o.current_stage)}</Chip>
                    <PaymentChip status={o.payment_status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                    {o.item_type_id && <span>{itemTypeLabel(o.item_type_id)}</span>}
                    <span dir="ltr">{o.client_phone || "—"}</span>
                    <span className={isLate(o) ? "text-late" : undefined}>
                      التسليم: {fmtDate(o.due_date)}
                    </span>
                    <span className="num">{money(o.total_amount)}</span>
                    <span className="num">المتبقي: {money(remaining(o))}</span>
                    <span>{ORDER_STATE_LABEL[o.state]}</span>
                  </div>
                </Link>
                <WhatsAppButton order={o} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
