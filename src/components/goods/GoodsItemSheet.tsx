import { useState } from "react";
import { toast } from "sonner";

import { Btn, Field, Sheet } from "@/components/kit";
import { PartsPicker } from "@/components/PartsPicker";
import { useItemTypes } from "@/lib/data";
import {
  DEFAULT_DRESS_PARTS,
  PURPOSE_LABEL,
  isDressType,
  purposeOf,
  type GoodsItem,
  type GoodsPurpose,
} from "@/lib/goods";
import { useGoodsPlaces, useSaveGoodsItem } from "@/lib/goods-data";
import { cn } from "@/lib/utils";

/** مكان الرصيد الافتتاحي: «ws:<فرع>» للمعمل أو معرّف الفرع */
const placeKey = (branchId: string, atWorkshop: boolean) =>
  atWorkshop ? `ws:${branchId}` : branchId;

export function GoodsItemSheet({
  item,
  defaultPlace,
  onClose,
}: {
  /** null لصنف جديد */
  item: GoodsItem | null;
  defaultPlace: { branchId: string; atWorkshop: boolean } | null;
  onClose: () => void;
}) {
  const save = useSaveGoodsItem();
  const { data: types = [] } = useItemTypes();
  const { sales, visible, workshopSections, canAll, workshopOk } = useGoodsPlaces();

  const [form, setForm] = useState({
    name: item?.name ?? "",
    code: item?.code ?? "",
    item_type_id: item?.item_type_id ?? "",
    purpose: purposeOf(item?.purpose),
    sellable: item?.sellable ?? true,
    price: item ? String(Number(item.price)) : "",
    cost: item && Number(item.cost) > 0 ? String(Number(item.cost)) : "",
    size: item?.size ?? "",
    color: item?.color ?? "",
    notes: item?.notes ?? "",
    parts: item?.parts ?? [],
    opening_qty: "1",
    place: defaultPlace ? placeKey(defaultPlace.branchId, defaultPlace.atWorkshop) : "",
  });
  const [image, setImage] = useState<File | null>(null);

  const hasParts = form.parts.length > 0;
  const sellable = form.purpose === "sale" || form.sellable;

  // أماكن الرصيد الافتتاحي اللي يقدر يكتب فيها
  const places = [
    ...(workshopOk ? workshopSections : []).map((b) => ({
      key: placeKey(b.id, true),
      label: `المعمل — جاهز لفرع ${b.name}`,
    })),
    ...(canAll ? sales : visible).map((b) => ({
      key: placeKey(b.id, false),
      label: `مخزن فرع ${b.name}`,
    })),
  ];
  const place = form.place || places[0]?.key || "";

  function pickType(id: string) {
    const name = types.find((t) => t.id === id)?.name;
    // نوع الفستان يبدأ بقطعه الافتراضية (إذا ما حُددت قطع)
    const parts = !hasParts && isDressType(name) ? DEFAULT_DRESS_PARTS : form.parts;
    setForm({ ...form, item_type_id: id, parts });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const qty = Math.max(0, Math.floor(Number(form.opening_qty) || 0));
    const [branchId, atWorkshop] = place.startsWith("ws:")
      ? [place.slice(3), true]
      : [place, false];
    save.mutate(
      {
        ...(item ? { id: item.id } : {}),
        code: form.code,
        name: form.name,
        item_type_id: form.item_type_id || null,
        purpose: form.purpose,
        sellable,
        price: sellable ? Number(form.price) || 0 : Number(item?.price ?? 0),
        cost: Number(form.cost) || 0,
        size: form.size,
        color: form.color,
        parts: form.parts,
        notes: form.notes,
        image,
        opening: !item && qty > 0 && branchId ? { qty, branchId, atWorkshop } : null,
      },
      {
        onSuccess: () => {
          toast.success(item ? "تم حفظ التعديل" : "أُضيف الصنف");
          onClose();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
      },
    );
  }

  return (
    <Sheet open onClose={onClose} title={item ? `تعديل ${item.name}` : "صنف جديد"}>
      <form onSubmit={submit} className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="اسم الصنف">
            <input
              className="field w-full"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: فستان زفاف كلوش"
              required
            />
          </Field>
          <Field label="الكود" {...(item ? {} : { hint: "يتولد تلقائيًا إذا تركته فاضي" })}>
            <input
              className="field w-full"
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
        </div>

        <Field label="النوع">
          <select
            className="field w-full"
            value={form.item_type_id}
            onChange={(e) => pickType(e.target.value)}
          >
            <option value="">بدون نوع</option>
            {types
              .filter((t) => t.is_active || t.id === form.item_type_id)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </Field>

        <Field
          label="قطع الفستان"
          hint="تطلع للتأشير عند الإرسال والاستلام. إذا الصنف ينعدّ بالكمية (طرح، تيجان) خلّها فاضية."
        >
          <PartsPicker value={form.parts} onChange={(parts) => setForm({ ...form, parts })} />
        </Field>

        <Field label="الغرض">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PURPOSE_LABEL) as GoodsPurpose[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    purpose: p,
                    // من «للبيع» للعرض أو العينة: قابلية البيع اختيار صريح
                    sellable: p === "sale" || (form.sellable && form.purpose !== "sale"),
                  })
                }
                className={cn(
                  "min-h-11 rounded-lg border text-[13.5px]",
                  form.purpose === p
                    ? "border-gold bg-gold/10 font-medium text-gold"
                    : "border-line",
                )}
              >
                {PURPOSE_LABEL[p]}
              </button>
            ))}
          </div>
        </Field>

        {form.purpose !== "sale" && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <span>
              <span className="block text-[13.5px] font-medium">قابل للبيع</span>
              <span className="block text-[11.5px] text-muted-foreground">
                فعّله إذا تقدرون تبيعون هذي القطعة لو طلبتها عميلة
              </span>
            </span>
            <input
              type="checkbox"
              className="size-5 accent-[var(--color-gold)]"
              checked={form.sellable}
              onChange={(e) => setForm({ ...form, sellable: e.target.checked })}
            />
          </label>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {sellable && (
            <Field label="سعر البيع (شامل الضريبة)">
              <input
                type="number"
                min="0"
                step="0.01"
                className="field w-full"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </Field>
          )}
          <Field label="سعر التكلفة (اختياري)" hint="لحساب قيمة المخزون وربح البيع">
            <input
              type="number"
              min="0"
              step="0.01"
              className="field w-full"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
            />
          </Field>
          <Field label="المقاس">
            <input
              className="field w-full"
              value={form.size}
              onChange={(e) => setForm({ ...form, size: e.target.value })}
            />
          </Field>
          <Field label="اللون">
            <input
              className="field w-full"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
          </Field>
        </div>

        {!item && (
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="الكمية">
              <input
                type="number"
                min="0"
                step="1"
                className="field w-full"
                value={form.opening_qty}
                onChange={(e) => setForm({ ...form, opening_qty: e.target.value })}
              />
            </Field>
            <Field label="وين تنحفظ">
              <select
                className="field w-full"
                value={place}
                onChange={(e) => setForm({ ...form, place: e.target.value })}
              >
                {places.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label={item?.image_path ? "تغيير الصورة" : "صورة (اختياري)"}>
          <input
            type="file"
            accept="image/*"
            className="field w-full"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field label="ملاحظات">
          <textarea
            className="field w-full"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        <Btn type="submit" disabled={save.isPending} className="w-full">
          {save.isPending ? "جاري الحفظ…" : item ? "حفظ التعديل" : "حفظ الصنف"}
        </Btn>
      </form>
    </Sheet>
  );
}
