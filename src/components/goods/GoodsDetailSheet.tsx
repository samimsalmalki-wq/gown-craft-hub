import { useState } from "react";
import { toast } from "sonner";

import { Btn, Chip, Field, Sheet } from "@/components/kit";
import { fmtDateTime, itemTypeLabel } from "@/lib/atelier";
import { branchLabel, type Branch } from "@/lib/branches";
import {
  MOVEMENT_LABEL,
  PURPOSE_LABEL,
  PURPOSE_TONE,
  purposeOf,
  qtyAt,
  sar,
  type GoodsItem,
  type GoodsStock,
} from "@/lib/goods";
import { useAdjustGoods, useGoodsMovements, useUpdateGoodsItem } from "@/lib/goods-data";

export type GoodsPlace = { branchId: string; atWorkshop: boolean };

/** تفاصيل الصنف في مكان معيّن: الكميات، والبيع، والإرسال، وتعديل الكمية */
export function GoodsDetailSheet({
  item,
  place,
  stock,
  branches,
  destinations,
  imageUrl,
  canManage,
  canAdjust,
  canTransfer,
  canSell,
  onSell,
  onSend,
  onEdit,
  onClose,
}: {
  item: GoodsItem;
  place: GoodsPlace;
  stock: GoodsStock[];
  branches: Branch[];
  /** فروع البيع اللي يقدر يرسل لها */
  destinations: Branch[];
  imageUrl: string | undefined;
  canManage: boolean;
  /** تعديل الكمية في هذا المكان */
  canAdjust: boolean;
  canTransfer: boolean;
  canSell: boolean;
  onSell: () => void;
  onSend: (toBranchId: string, qty: number) => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const purpose = purposeOf(item.purpose);
  const here = qtyAt(stock, item.id, place.branchId, place.atWorkshop);
  const places = stock.filter((s) => s.item_id === item.id && s.qty > 0);
  const { data: moves = [] } = useGoodsMovements(item.id);
  const adjust = useAdjustGoods();
  const update = useUpdateGoodsItem();

  const targets = destinations.filter((b) => place.atWorkshop || b.id !== place.branchId);
  const [to, setTo] = useState(place.atWorkshop ? place.branchId : (targets[0]?.id ?? ""));
  const [sendQty, setSendQty] = useState("1");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  const placeName = (s: GoodsPlace) =>
    s.atWorkshop
      ? `المعمل — جاهز لفرع ${branchLabel(branches, s.branchId)}`
      : `مخزن فرع ${branchLabel(branches, s.branchId)}`;

  function submitAdjust(sign: 1 | -1) {
    const n = Math.floor(Number(delta) || 0);
    if (n <= 0) {
      toast.error("اكتب الكمية");
      return;
    }
    adjust.mutate(
      { itemId: item.id, ...place, delta: sign * n, notes: note },
      {
        onSuccess: () => {
          toast.success(sign > 0 ? "أُضيفت الكمية" : "خُصمت الكمية");
          setDelta("");
          setNote("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
      },
    );
  }

  return (
    <Sheet open onClose={onClose} title={item.name}>
      <div className="space-y-4 p-4">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={item.name}
            className="max-h-80 w-full rounded-xl border border-line object-contain"
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Chip>
            <span className="num">{item.code}</span>
          </Chip>
          {item.item_type_id && <Chip>{itemTypeLabel(item.item_type_id)}</Chip>}
          <Chip tone={PURPOSE_TONE[purpose]}>{PURPOSE_LABEL[purpose]}</Chip>
          {purpose !== "sale" && (
            <Chip tone={item.sellable ? "ok" : "late"}>
              {item.sellable ? "قابل للبيع" : "غير قابل للبيع"}
            </Chip>
          )}
          {!item.is_active && <Chip tone="late">موقوف</Chip>}
        </div>

        <dl className="grid grid-cols-3 gap-3 text-[13px]">
          <Info label="المقاس" value={item.size || "—"} />
          <Info label="اللون" value={item.color || "—"} />
          <Info label="سعر البيع" value={item.sellable ? sar(item.price) : "—"} />
        </dl>

        {item.parts.length > 0 && (
          <div className="rounded-xl border border-line px-4 py-3">
            <p className="mb-2 text-[13px] font-medium">قطع الفستان</p>
            <div className="flex flex-wrap gap-1.5">
              {item.parts.map((p) => (
                <Chip key={p}>{p}</Chip>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">وين موجودة</p>
          <ul className="divide-y divide-line text-[13px]">
            {places.length === 0 && (
              <li className="px-4 py-2.5 text-muted-foreground">ما فيه كمية</li>
            )}
            {places.map((s) => (
              <li
                key={`${s.branch_id}-${s.at_workshop}`}
                className="flex justify-between px-4 py-2.5"
              >
                <span>{placeName({ branchId: s.branch_id, atWorkshop: s.at_workshop })}</span>
                <span className="num">{s.qty}</span>
              </li>
            ))}
          </ul>
        </div>

        {canManage && purpose !== "sale" && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <span>
              <span className="block text-[13.5px] font-medium">قابل للبيع</span>
              <span className="block text-[11.5px] text-muted-foreground">
                إذا طفيته ما أحد يقدر يبيع هذي القطعة، وتبقى {PURPOSE_LABEL[purpose]} بس
              </span>
            </span>
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-gold)]"
              checked={item.sellable}
              disabled={update.isPending}
              onChange={() =>
                update.mutate(
                  { id: item.id, patch: { sellable: !item.sellable } },
                  {
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
                  },
                )
              }
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          {canSell && !place.atWorkshop && (
            <Btn disabled={!item.sellable || here < 1} onClick={onSell}>
              بيع
            </Btn>
          )}
          {canManage && (
            <Btn variant="quiet" onClick={onEdit}>
              تعديل الصنف
            </Btn>
          )}
        </div>
        {canSell && !place.atWorkshop && !item.sellable && (
          <p className="text-center text-[12px] text-late">
            هذي القطعة غير قابلة للبيع، فزر البيع مقفول.
          </p>
        )}

        {canTransfer && here > 0 && targets.length > 0 && (
          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 text-[13px] font-medium">
              {place.atWorkshop ? "إرسال من المعمل" : "نقل لفرع ثاني"}
            </p>
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
              <Field label="إلى">
                <select className="field w-full" value={to} onChange={(e) => setTo(e.target.value)}>
                  {targets.map((b) => (
                    <option key={b.id} value={b.id}>
                      فرع {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الكمية">
                <input
                  type="number"
                  min="1"
                  max={here}
                  className="field w-full"
                  value={sendQty}
                  onChange={(e) => setSendQty(e.target.value)}
                />
              </Field>
              <Btn
                variant="quiet"
                disabled={!to}
                onClick={() =>
                  onSend(to, Math.min(here, Math.max(1, Math.floor(Number(sendQty) || 1))))
                }
              >
                التالي: تأشير القطع
              </Btn>
            </div>
          </div>
        )}

        {canAdjust && (
          <div className="rounded-xl border border-line p-4">
            <p className="mb-3 text-[13px] font-medium">
              تعديل الكمية في {placeName(place)} (الحالية {here})
            </p>
            <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
              <Field label="الكمية">
                <input
                  type="number"
                  min="1"
                  className="field w-full"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </Field>
              <Field label="السبب">
                <input
                  className="field w-full"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="مثال: جرد، إنتاج جديد، تالف"
                />
              </Field>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Btn variant="quiet" disabled={adjust.isPending} onClick={() => submitAdjust(1)}>
                إضافة
              </Btn>
              <Btn
                variant="quiet"
                disabled={adjust.isPending || here < 1}
                onClick={() => submitAdjust(-1)}
              >
                خصم
              </Btn>
            </div>
          </div>
        )}

        {moves.length > 0 && (
          <div className="rounded-xl border border-line">
            <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">آخر الحركات</p>
            <ul className="divide-y divide-line text-[12.5px]">
              {moves.slice(0, 10).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{MOVEMENT_LABEL[m.kind] ?? m.kind}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {placeName({ branchId: m.branch_id, atWorkshop: m.at_workshop })}
                      {m.notes ? ` · ${m.notes}` : ""}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {fmtDateTime(m.created_at)}
                    </span>
                  </span>
                  <span className={`num ${m.qty < 0 ? "text-late" : "text-ok"}`}>
                    {m.qty > 0 ? `+${m.qty}` : m.qty}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ivory px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
