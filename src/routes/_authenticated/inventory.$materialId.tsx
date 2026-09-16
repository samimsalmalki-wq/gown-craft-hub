import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useMaterialCategories } from "@/lib/data";
import { fmtDateTime, money } from "@/lib/atelier";
import {
  MATERIAL_UNITS,
  MOVEMENT_LABEL,
  available,
  categoryLabel,
  isLowStock,
  qty,
} from "@/lib/inventory";
import {
  useAddMovement,
  useInventoryUrls,
  useMaterial,
  useMaterialMovements,
  useSaveMaterial,
} from "@/lib/inventory-data";

export const Route = createFileRoute("/_authenticated/inventory/$materialId")({
  component: MaterialPage,
});

function MaterialPage() {
  const { materialId } = Route.useParams();
  const { isManager } = useCurrentAccount();
  const { data: catRows = [] } = useMaterialCategories();
  const matCats = catRows.filter((c) => c.is_active);
  const { data: material, isLoading } = useMaterial(materialId);
  const { data: movements = [] } = useMaterialMovements(materialId);
  const addMovement = useAddMovement();
  const save = useSaveMaterial();

  const urls = useInventoryUrls([material?.image_path]);
  const image = material?.image_path ? urls[material.image_path] : undefined;

  const [moveOpen, setMoveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [move, setMove] = useState({ kind: "in" as "in" | "out", qty: "1", notes: "" });

  if (isLoading) {
    return (
      <AppShell title="المادة">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }
  if (!material) {
    return (
      <AppShell title="المادة">
        <Empty>هذه المادة غير موجودة.</Empty>
      </AppShell>
    );
  }

  async function submitMove(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(move.qty);
    if (!amount || amount <= 0) return;
    await addMovement.mutateAsync({
      material_id: materialId,
      kind: move.kind,
      qty: amount,
      notes: move.notes.trim() || null,
    });
    setMoveOpen(false);
    setMove({ kind: "in", qty: "1", notes: "" });
  }

  return (
    <AppShell
      eyebrow="مخزون المواد"
      title={material.name}
      subtitle={`${categoryLabel(material.category)} · وحدة ${material.unit}`}
      actions={
        isManager ? (
          <div className="flex gap-2">
            <Btn variant="quiet" onClick={() => setEditOpen(true)}>
              تعديل
            </Btn>
            <Btn onClick={() => setMoveOpen(true)}>حركة مخزون</Btn>
          </div>
        ) : undefined
      }
    >
      <Link to="/inventory" className="mb-4 inline-block text-[13px] text-muted-foreground">
        ← رجوع لمخزون المواد
      </Link>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-5">
          <Card title="الحالة">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="الكمية بالمخزن" value={`${qty(material.qty_on_hand)} ${material.unit}`} />
              <Row label="محجوز على طلبات" value={`${qty(material.qty_reserved)} ${material.unit}`} />
              <Row label="المتاح للاستخدام" value={`${qty(available(material))} ${material.unit}`} />
              <Row label="حد التنبيه" value={`${qty(material.min_qty)} ${material.unit}`} />
              <Row label="تكلفة الوحدة" value={money(Number(material.unit_cost))} />
              <Row label="المورد" value={material.supplier || "—"} />
            </dl>
            {isLowStock(material) && (
              <div className="border-t border-line px-4 py-3">
                <Chip tone="late">الكمية المتاحة وصلت حد التنبيه</Chip>
              </div>
            )}
            {material.notes && (
              <p className="border-t border-line px-4 py-3 text-[13px] whitespace-pre-wrap">
                {material.notes}
              </p>
            )}
          </Card>

          {image && (
            <Card title="صورة المادة">
              <img src={image} alt={material.name} className="w-full rounded-b-xl object-cover" />
            </Card>
          )}
        </div>

        <Card title="سجل الحركات">
          {movements.length === 0 ? (
            <Empty>لا توجد حركات بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {movements.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <Chip
                    tone={m.kind === "in" ? "ok" : m.kind === "out" ? "late" : "gold"}
                  >
                    {MOVEMENT_LABEL[m.kind]}
                  </Chip>
                  <span className="num text-[14px]">
                    {qty(m.qty)} {material.unit}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                    {m.notes || ""}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{fmtDateTime(m.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Sheet open={moveOpen} onClose={() => setMoveOpen(false)} title="حركة مخزون">
        <form onSubmit={submitMove} className="space-y-4 p-4">
          <Field label="نوع الحركة">
            <select
              className="field w-full"
              value={move.kind}
              onChange={(e) => setMove({ ...move, kind: e.target.value as "in" | "out" })}
            >
              <option value="in">إدخال للمخزن</option>
              <option value="out">صرف من المخزن</option>
            </select>
          </Field>
          <Field label={`الكمية (${material.unit})`}>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="field w-full"
              value={move.qty}
              onChange={(e) => setMove({ ...move, qty: e.target.value })}
              required
            />
          </Field>
          <Field label="ملاحظات">
            <input
              className="field w-full"
              value={move.notes}
              onChange={(e) => setMove({ ...move, notes: e.target.value })}
            />
          </Field>
          <Btn type="submit" className="w-full" disabled={addMovement.isPending}>
            {addMovement.isPending ? "جاري التسجيل…" : "تسجيل الحركة"}
          </Btn>
        </form>
      </Sheet>

      <EditSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        material={material}
        onSave={async (values) => {
          await save.mutateAsync({ id: material.id, ...values });
          setEditOpen(false);
        }}
        saving={save.isPending}
      />
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

function EditSheet({
  open,
  onClose,
  material,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  material: { name: string; category: string; unit: string; min_qty: number; unit_cost: number; supplier: string | null; notes: string | null };
  onSave: (v: {
    name: string;
    category: string;
    unit: string;
    min_qty: number;
    unit_cost: number;
    supplier: string | null;
    notes: string | null;
    image?: File | null;
  }) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    name: material.name,
    category: material.category,
    unit: material.unit,
    min_qty: String(material.min_qty),
    unit_cost: String(material.unit_cost),
    supplier: material.supplier ?? "",
    notes: material.notes ?? "",
  });
  const [image, setImage] = useState<File | null>(null);
  const { data: catRows = [] } = useMaterialCategories();
  const matCats = catRows.filter((c) => c.is_active);

  return (
    <Sheet open={open} onClose={onClose} title="تعديل المادة">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSave({
            name: form.name.trim(),
            category: form.category,
            unit: form.unit,
            min_qty: Number(form.min_qty) || 0,
            unit_cost: Number(form.unit_cost) || 0,
            supplier: form.supplier.trim() || null,
            notes: form.notes.trim() || null,
            image,
          });
        }}
        className="space-y-4 p-4"
      >
        <Field label="اسم المادة">
          <input
            className="field w-full"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="التصنيف">
            <select
              className="field w-full"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {matCats.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="وحدة القياس">
            <select
              className="field w-full"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            >
              {MATERIAL_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="حد التنبيه">
            <input
              type="number"
              min="0"
              step="0.01"
              className="field w-full"
              value={form.min_qty}
              onChange={(e) => setForm({ ...form, min_qty: e.target.value })}
            />
          </Field>
          <Field label="تكلفة الوحدة">
            <input
              type="number"
              min="0"
              step="0.01"
              className="field w-full"
              value={form.unit_cost}
              onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
            />
          </Field>
          <Field label="المورد">
            <input
              className="field w-full"
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </Field>
          <Field label="صورة جديدة (اختياري)">
            <input
              type="file"
              accept="image/*"
              className="field w-full"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea
            className="field w-full"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
        <Btn type="submit" className="w-full" disabled={saving}>
          {saving ? "جاري الحفظ…" : "حفظ التعديلات"}
        </Btn>
      </form>
    </Sheet>
  );
}
