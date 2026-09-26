import { ImagePlus } from "lucide-react";
import { useEffect, useState } from "react";

import { Btn, Field, Sheet } from "@/components/kit";
import { PartsPicker } from "@/components/PartsPicker";
import { DEFAULT_DRESS_PARTS, partsOrDress } from "@/lib/goods";
import type { RentalDress } from "@/lib/inventory";
import { useSaveDress } from "@/lib/inventory-data";

const emptyForm = {
  code: "",
  model_no: "",
  size: "",
  color: "",
  rent_price: "",
  deposit_amount: "",
  notes: "",
};

/** نموذج إضافة فستان إيجار أو تعديل بياناته */
export function DressFormSheet({
  open,
  onClose,
  dress,
  imageUrl,
}: {
  open: boolean;
  onClose: () => void;
  dress?: RentalDress | undefined;
  imageUrl?: string | undefined;
}) {
  const save = useSaveDress();
  const [form, setForm] = useState(emptyForm);
  const [parts, setParts] = useState<string[]>(DEFAULT_DRESS_PARTS);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    setImage(null);
    setForm(
      dress
        ? {
            code: dress.code,
            model_no: dress.model_no ?? "",
            size: dress.size ?? "",
            color: dress.color ?? "",
            rent_price: String(Number(dress.rent_price) || ""),
            deposit_amount: String(Number(dress.deposit_amount) || ""),
            notes: dress.notes ?? "",
          }
        : emptyForm,
    );
    setParts(dress ? partsOrDress(dress.parts) : DEFAULT_DRESS_PARTS);
  }, [open, dress]);

  useEffect(() => {
    if (!image) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const set = (key: keyof typeof emptyForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.code.trim()) return;
    setErr(null);
    try {
      await save.mutateAsync({
        ...(dress ? { id: dress.id } : {}),
        code: form.code.trim(),
        model_no: form.model_no.trim() || null,
        size: form.size.trim() || null,
        color: form.color.trim() || null,
        rent_price: Number(form.rent_price) || 0,
        deposit_amount: Number(form.deposit_amount) || 0,
        status: dress?.status ?? "available",
        notes: form.notes.trim() || null,
        parts,
        image,
      });
    } catch (e2) {
      const msg = e2 instanceof Error ? e2.message : "";
      setErr(
        msg.includes("duplicate") ? "هذا الكود مستخدم لفستان آخر." : msg || "تعذّر حفظ الفستان.",
      );
      return;
    }
    onClose();
  }

  const shown = preview ?? imageUrl ?? null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={dress ? `تعديل فستان ${dress.code}` : "فستان إيجار جديد"}
    >
      <form onSubmit={submit} className="space-y-4 p-4">
        {err && <p className="rounded-lg bg-late/10 px-3 py-2 text-[13px] text-late">{err}</p>}

        <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-line p-3 hover:bg-ivory">
          {shown ? (
            <img
              src={shown}
              alt=""
              className="h-28 w-20 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <span className="grid h-28 w-20 shrink-0 place-items-center rounded-lg bg-ivory text-muted-foreground">
              <ImagePlus className="size-6" />
            </span>
          )}
          <span className="text-[13px]">
            <span className="block font-medium">
              {shown ? "تغيير صورة الفستان" : "إضافة صورة الفستان"}
            </span>
            <span className="mt-1 block text-[12px] text-muted-foreground">
              صورة واضحة للفستان كامل تساعد في عرضه للعميلات.
            </span>
          </span>
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="كود الفستان">
            <input className="field w-full" value={form.code} onChange={set("code")} required />
          </Field>
          <Field label="رقم الموديل">
            <input className="field w-full" value={form.model_no} onChange={set("model_no")} />
          </Field>
          <Field label="المقاس">
            <input className="field w-full" value={form.size} onChange={set("size")} />
          </Field>
          <Field label="اللون">
            <input className="field w-full" value={form.color} onChange={set("color")} />
          </Field>
          <Field label="قيمة الإيجار">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="field w-full"
              value={form.rent_price}
              onChange={set("rent_price")}
              placeholder="0"
            />
          </Field>
          <Field label="مبلغ التأمين">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              className="field w-full"
              value={form.deposit_amount}
              onChange={set("deposit_amount")}
              placeholder="0"
            />
          </Field>
        </div>
        <Field label="قطع الفستان" hint="تطلع للتأشير عند خروج الفستان مع العميلة ورجوعه">
          <PartsPicker value={parts} onChange={setParts} />
        </Field>
        <Field label="ملاحظات">
          <textarea className="field w-full" rows={2} value={form.notes} onChange={set("notes")} />
        </Field>
        <Btn type="submit" className="w-full" disabled={save.isPending}>
          {save.isPending ? "جاري الحفظ…" : dress ? "حفظ التعديلات" : "حفظ الفستان"}
        </Btn>
      </form>
    </Sheet>
  );
}
