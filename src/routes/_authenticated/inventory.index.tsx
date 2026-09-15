import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet, Stat } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useMaterials, useSaveMaterial } from "@/lib/inventory-data";
import {
  ALL_BRANCHES,
  useBranchScope,
  useBranches,
  useMaterialStock,
  useTransferMaterial,
  stockOf,
} from "@/lib/branches";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  categoryLabel,
  isLowStock,
  qty,
} from "@/lib/inventory";

export const Route = createFileRoute("/_authenticated/inventory/")({
  component: InventoryPage,
});

function InventoryPage() {
  const { isManager, can } = useCurrentAccount();
  const { data: materials = [], isLoading } = useMaterials();
  const { branchId, isAll } = useBranchScope();
  const { data: branches = [] } = useBranches();
  const { data: stock = [] } = useMaterialStock(ALL_BRANCHES);
  const transfer = useTransferMaterial();
  const save = useSaveMaterial();

  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [move, setMove] = useState({ materialId: "", from: "", to: "", qty: "", notes: "" });

  /** كميات المادة في الفرع المعروض (أو كل الفروع مجتمعة) */
  const at = (materialId: string) => stockOf(stock, materialId, isAll ? null : branchId);

  const canTransfer = isManager || can("inventory.transfer");

  async function submitMove(e: React.FormEvent) {
    e.preventDefault();
    if (!move.materialId || !move.from || !move.to) return;
    if (move.from === move.to) {
      toast.error("اختر فرعين مختلفين");
      return;
    }
    try {
      await transfer.mutateAsync({
        materialId: move.materialId,
        fromBranch: move.from,
        toBranch: move.to,
        qty: Number(move.qty) || 0,
        notes: move.notes.trim() || null,
      });
      toast.success("تم نقل الكمية");
      setMoveOpen(false);
      setMove({ materialId: "", from: "", to: "", qty: "", notes: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر النقل");
    }
  }

  const [form, setForm] = useState({
    name: "",
    category: "fabric",
    unit: "متر",
    min_qty: "0",
    unit_cost: "0",
    supplier: "",
    notes: "",
    opening_qty: "0",
  });
  const [image, setImage] = useState<File | null>(null);


  const list = useMemo(
    () =>
      materials.filter((m) => {
        if (cat !== "all" && m.category !== cat) return false;
        if (lowOnly && !isLowStock(m)) return false;
        const t = term.trim();
        if (!t) return true;
        return (
          m.name.includes(t) ||
          (m.supplier ?? "").includes(t) ||
          categoryLabel(m.category).includes(t)
        );
      }),
    [materials, term, cat, lowOnly],
  );

  const low = materials.filter((m) => m.is_active && isLowStock(m));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await save.mutateAsync({
      name: form.name.trim(),
      category: form.category,
      unit: form.unit,
      min_qty: Number(form.min_qty) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      supplier: form.supplier.trim() || null,
      notes: form.notes.trim() || null,
      opening_qty: Number(form.opening_qty) || 0,
      image,
    });
    setOpen(false);
    setImage(null);
    setForm({
      name: "",
      category: "fabric",
      unit: "متر",
      min_qty: "0",
      unit_cost: "0",
      supplier: "",
      notes: "",
      opening_qty: "0",
    });
  }

  return (
    <AppShell
      eyebrow="المخزون"
      title="مخزون المواد"
      subtitle="الكميات المتوفرة والمحجوزة وحد التنبيه لكل مادة."
      actions={
        <div className="flex gap-2">
          {canTransfer && branches.length > 1 && (
            <Btn variant="quiet" onClick={() => setMoveOpen(true)}>
              نقل بين الفروع
            </Btn>
          )}
          {isManager && <Btn onClick={() => setOpen(true)}>مادة جديدة</Btn>}
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="عدد المواد" value={materials.length} />
        <Stat label="تحت حد التنبيه" value={low.length} tone="late" onClick={() => setLowOnly(true)} active={lowOnly} />
        <Stat
          label="كميات محجوزة"
          value={qty(materials.reduce((s, m) => s + at(m.id).reserved, 0))}
          tone="gold"
        />
        <Stat
          label="قيمة المخزون"
          value={qty(materials.reduce((s, m) => s + at(m.id).on_hand * Number(m.unit_cost), 0))}
          hint="بسعر التكلفة"
        />
      </div>


      <div className="mt-5 flex flex-wrap items-end gap-3">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="field w-full sm:w-64"
          placeholder="ابحث باسم المادة أو المورد"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="field w-full sm:w-44">
          <option value="all">كل التصنيفات</option>
          {MATERIAL_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <Btn variant={lowOnly ? "gold" : "quiet"} onClick={() => setLowOnly((v) => !v)}>
          المنخفضة فقط
        </Btn>
      </div>

      <Card className="mt-5" title="المواد">
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : list.length === 0 ? (
          <Empty>لا توجد مواد مطابقة.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((m) => (
              <li key={m.id}>
                <Link
                  to="/inventory/$materialId"
                  params={{ materialId: m.id }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5 hover:bg-ivory"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{m.name}</span>
                  <Chip>{categoryLabel(m.category)}</Chip>
                  <span className="num text-[13px]">
                    متاح {qty(at(m.id).available)} {m.unit}
                  </span>
                  {at(m.id).reserved > 0 && <Chip tone="gold">محجوز {qty(at(m.id).reserved)}</Chip>}
                  {isLowStock(m) && <Chip tone="late">تحت الحد</Chip>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="مادة جديدة">
        <form onSubmit={submit} className="space-y-4 p-4">
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
                {MATERIAL_CATEGORIES.map((c) => (
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
            <Field label="الكمية الافتتاحية">
              <input
                type="number"
                min="0"
                step="0.01"
                className="field w-full"
                value={form.opening_qty}
                onChange={(e) => setForm({ ...form, opening_qty: e.target.value })}
              />
            </Field>
            <Field label="حد التنبيه" hint="ينبّهك النظام عند وصول المتاح لهذا الحد">
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
          </div>
          <Field label="صورة (اختياري)">
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
            {save.isPending ? "جاري الحفظ…" : "حفظ المادة"}
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}
