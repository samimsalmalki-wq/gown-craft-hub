import { useState } from "react";
import { toast } from "sonner";

import { Btn, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/finance";
import { qtyAt, sar, splitVat, type GoodsItem, type GoodsStock } from "@/lib/goods";
import { useBranchTax, useSellGoods } from "@/lib/goods-data";
import { cn } from "@/lib/utils";

type Line = { itemId: string; qty: number; price: string };

const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

/** بيع من مخزن الفرع بفاتورة ضريبية (السعر شامل الضريبة ويقدر الموظف يعدّله) */
export function SaleSheet({
  branchId,
  branchName,
  items,
  stock,
  firstItemId,
  onClose,
  onDone,
}: {
  branchId: string;
  branchName: string;
  items: GoodsItem[];
  stock: GoodsStock[];
  firstItemId: string | null;
  onClose: () => void;
  onDone: (invoiceId: string) => void;
}) {
  const sell = useSellGoods();
  const { can } = useCurrentAccount();
  // البيع بأقل من السعر المفترض لمن عنده صلاحية الخصم
  const canDiscount = can("goods.discount");
  const { data: tax } = useBranchTax(branchId);
  const rate = tax ? (tax.vat_enabled ? Number(tax.vat_rate) : 0) : 15;

  const available = (id: string) => qtyAt(stock, id, branchId, false);
  const sellable = items.filter((it) => it.is_active && it.sellable && available(it.id) > 0);
  const byId = new Map(items.map((it) => [it.id, it]));
  const lineFor = (it: GoodsItem): Line => ({
    itemId: it.id,
    qty: 1,
    price: String(Number(it.price)),
  });

  const first = sellable.find((it) => it.id === firstItemId);
  const [lines, setLines] = useState<Line[]>(first ? [lineFor(first)] : []);
  const [client, setClient] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  const others = sellable.filter((it) => !lines.some((l) => l.itemId === it.id));
  const patch = (i: number, p: Partial<Line>) =>
    setLines((cur) => cur.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const total = lines.reduce((s, l) => s + l.qty * (Number(l.price) || 0), 0);
  const { net, vat } = splitVat(total, rate);
  const belowList = lines.some(
    (l) => (Number(l.price) || 0) < Number(byId.get(l.itemId)?.price ?? 0),
  );
  const blocked = belowList && !canDiscount;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) return;
    sell.mutate(
      {
        branchId,
        clientName: client,
        clientPhone: phone,
        method,
        lines: lines.map((l) => ({ item_id: l.itemId, qty: l.qty, price: Number(l.price) || 0 })),
      },
      {
        onSuccess: (invoiceId) => {
          toast.success("صدرت الفاتورة وانخصمت القطع من مخزن الفرع");
          onDone(invoiceId);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر إصدار الفاتورة"),
      },
    );
  }

  return (
    <Sheet open onClose={onClose} title={`بيع — فرع ${branchName}`}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">القطع</p>
          <ul className="divide-y divide-line">
            {lines.map((l, i) => {
              const it = byId.get(l.itemId);
              const listPrice = Number(it?.price ?? 0);
              const price = Number(l.price) || 0;
              const diff = price - listPrice;
              return (
                <li key={l.itemId} className="space-y-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {it?.name}
                      <span className="num ms-2 text-[11.5px] font-normal text-muted-foreground">
                        {it?.code}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="text-[12px] text-late"
                      onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))}
                    >
                      حذف
                    </button>
                  </div>
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex items-center rounded-lg border border-line">
                      <button
                        type="button"
                        aria-label="إنقاص"
                        className="grid size-10 place-items-center text-[18px]"
                        onClick={() => patch(i, { qty: Math.max(1, l.qty - 1) })}
                      >
                        −
                      </button>
                      <span className="num w-8 text-center">{l.qty}</span>
                      <button
                        type="button"
                        aria-label="زيادة"
                        className="grid size-10 place-items-center text-[18px] disabled:opacity-30"
                        disabled={l.qty >= available(l.itemId)}
                        onClick={() => patch(i, { qty: l.qty + 1 })}
                      >
                        +
                      </button>
                    </div>
                    <label className="block min-w-0 flex-1">
                      <span className="sr-only">سعر القطعة</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="field w-full"
                        value={l.price}
                        onChange={(e) => patch(i, { price: e.target.value })}
                        required
                      />
                      <span
                        className={cn(
                          "mt-1 block text-[11.5px]",
                          diff < 0 ? "text-late" : "text-muted-foreground",
                        )}
                      >
                        السعر المفترض {sar(listPrice)}
                        {diff < 0 && ` — خصم ${sar(-diff)}`}
                        {diff > 0 && ` — أعلى بـ ${sar(diff)}`}
                        {diff < 0 && !canDiscount && " — الخصم يحتاج صلاحية"}
                      </span>
                    </label>
                  </div>
                </li>
              );
            })}
            {lines.length === 0 && <Empty>أضف قطعة للبيع.</Empty>}
          </ul>
          {others.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <select
                className="field w-full text-[13px]"
                value=""
                onChange={(e) => {
                  const it = others.find((x) => x.id === e.target.value);
                  if (it) setLines((cur) => [...cur, lineFor(it)]);
                }}
              >
                <option value="">+ إضافة قطعة ثانية (طرحة، تاج…)</option>
                {others.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name} — {sar(it.price)} (المتوفر {available(it.id)})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم العميلة">
            <input
              className="field w-full"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              required
            />
          </Field>
          <Field label="الجوال">
            <input
              className="field w-full"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
          </Field>
        </div>

        <Field label="طريقة الدفع" hint="المبلغ ينسجل تلقائيًا في صندوق الفرع حسب طريقة الدفع">
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

        <dl className="space-y-1.5 rounded-xl bg-ivory px-4 py-3 text-[13.5px]">
          {rate > 0 && (
            <>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">المبلغ قبل الضريبة</dt>
                <dd>{sar(net)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">ضريبة القيمة المضافة {rate}٪</dt>
                <dd>{sar(vat)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-line pt-1.5 text-[15px] font-bold">
            <dt>الإجمالي{rate > 0 ? " شامل الضريبة" : ""}</dt>
            <dd>{sar(total)}</dd>
          </div>
        </dl>

        {blocked && (
          <p className="rounded-xl bg-late/8 px-4 py-3 text-[13px] text-late">
            ما عندك صلاحية البيع بأقل من السعر المفترض. رجّع السعر أو اطلب من المشرف.
          </p>
        )}
        <Btn
          type="submit"
          className="w-full"
          disabled={lines.length === 0 || sell.isPending || blocked}
        >
          {sell.isPending ? "جاري الإصدار…" : `إصدار الفاتورة وتحصيل ${sar(total)}`}
        </Btn>
      </form>
    </Sheet>
  );
}
