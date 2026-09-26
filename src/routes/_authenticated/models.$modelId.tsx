import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useItemTypes } from "@/lib/data";
import { useInventoryUrls, useMaterials } from "@/lib/inventory-data";
import { useBranchScope, useMaterialStock, stockOf } from "@/lib/branches";
import { qty as fmtQty } from "@/lib/inventory";
import {
  useDeleteModelImage,
  useModel,
  useModelImages,
  useModelMaterials,
  useRemoveModelMaterial,
  useSaveModel,
  useSetModelMaterial,
  useUploadModelImages,
} from "@/lib/models-data";

export const Route = createFileRoute("/_authenticated/models/$modelId")({
  head: () => ({
    meta: [
      { title: "بطاقة الموديل · مَعْمَل" },
      {
        name: "description",
        content: "بيانات الموديل وصوره والمواد المستخدمة فيه بكمياتها القياسية.",
      },
      { property: "og:title", content: "بطاقة الموديل · مَعْمَل" },
      { property: "og:description", content: "بيانات الموديل وصوره ومواده المستخدمة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModelPage,
});

function ModelPage() {
  const { modelId } = Route.useParams();
  const { can } = useCurrentAccount();
  const isManager = can("catalog.manage");
  const { data: model, isLoading } = useModel(modelId);
  const { data: types = [] } = useItemTypes();
  const { data: materials = [] } = useMaterials();
  const { data: rows = [] } = useModelMaterials(modelId);
  const { data: images = [] } = useModelImages(modelId);
  const { branchId } = useBranchScope();
  const { data: stock = [] } = useMaterialStock();
  const urls = useInventoryUrls(images.map((i) => i.storage_path));

  const save = useSaveModel();
  const setMaterial = useSetModelMaterial();
  const removeMaterial = useRemoveModelMaterial();
  const upload = useUploadModelImages();
  const delImage = useDeleteModelImage();

  const [form, setForm] = useState({
    code: "",
    name: "",
    item_type_id: "",
    est_price: "0",
    description: "",
    notes: "",
    is_active: true,
  });
  const [pick, setPick] = useState({ materialId: "", qty: "" });

  useEffect(() => {
    if (!model) return;
    setForm({
      code: model.code,
      name: model.name,
      item_type_id: model.item_type_id ?? "",
      est_price: String(model.est_price ?? 0),
      description: model.description ?? "",
      notes: model.notes ?? "",
      is_active: model.is_active,
    });
  }, [model]);

  if (!isLoading && !model) {
    return (
      <AppShell title="الموديل">
        <Empty>لم يُعثر على الموديل.</Empty>
      </AppShell>
    );
  }

  const saveModel = () =>
    save
      .mutateAsync({
        id: modelId,
        code: form.code,
        name: form.name,
        item_type_id: form.item_type_id || null,
        est_price: Number(form.est_price || 0),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      })
      .then(() => toast.success("تم الحفظ"))
      .catch((err: Error) => toast.error(err.message));

  const addMaterial = () =>
    setMaterial
      .mutateAsync({ modelId, materialId: pick.materialId, qty: Number(pick.qty || 0) })
      .then(() => {
        toast.success("تمت إضافة المادة");
        setPick({ materialId: "", qty: "" });
      })
      .catch((err: Error) => toast.error(err.message));

  return (
    <AppShell
      eyebrow="الموديلات"
      title={model ? `${model.code} — ${model.name}` : "الموديل"}
      subtitle="عدّل بيانات الموديل وصوره والمواد المستخدمة فيه."
      actions={
        <Link to="/models" className="text-[13px] text-muted-foreground hover:text-ink">
          كل الموديلات
        </Link>
      }
    >
      <div className="grid gap-5">
        <Card title="بيانات الموديل">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="رقم الموديل">
              <input
                className="field"
                dir="ltr"
                value={form.code}
                disabled={!isManager}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </Field>
            <Field label="اسم الموديل">
              <input
                className="field"
                value={form.name}
                disabled={!isManager}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="نوع القطعة">
              <select
                className="field"
                value={form.item_type_id}
                disabled={!isManager}
                onChange={(e) => setForm({ ...form, item_type_id: e.target.value })}
              >
                <option value="">اختر نوع القطعة</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="السعر التقديري">
              <input
                className="field"
                dir="ltr"
                inputMode="decimal"
                value={form.est_price}
                disabled={!isManager}
                onChange={(e) => setForm({ ...form, est_price: e.target.value })}
              />
            </Field>
            <Field label="الوصف">
              <textarea
                className="field min-h-20"
                value={form.description}
                disabled={!isManager}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </Field>
            <Field label="ملاحظات التصنيع">
              <textarea
                className="field min-h-20"
                value={form.notes}
                disabled={!isManager}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
          </div>
          {isManager && (
            <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-4">
              <Btn variant="gold" onClick={saveModel} disabled={save.isPending}>
                حفظ
              </Btn>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="size-5 accent-current"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                مُفعّل — يظهر للاختيار في الطلبات الجديدة
              </label>
            </div>
          )}
        </Card>

        <Card title="المواد المستخدمة">
          {rows.length === 0 ? (
            <Empty>لم تُضف مواد لهذا الموديل بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const mat = materials.find((m) => m.id === r.material_id);
                const s = stockOf(stock, r.material_id, branchId);
                const short = s.available < Number(r.qty);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 truncate text-[14px]">{mat?.name ?? "—"}</span>
                    <span className="num text-[12px] text-muted-foreground">
                      متاح {fmtQty(s.available)} {mat?.unit ?? ""}
                    </span>
                    {short && <Chip tone="late">غير كافٍ</Chip>}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="field w-24"
                      defaultValue={String(r.qty)}
                      disabled={!isManager}
                      onBlur={(e) => {
                        const v = Number(e.target.value || 0);
                        if (v === Number(r.qty)) return;
                        setMaterial
                          .mutateAsync({ modelId, materialId: r.material_id, qty: v })
                          .then(() => toast.success("تم الحفظ"))
                          .catch((err: Error) => {
                            toast.error(err.message);
                            e.target.value = String(r.qty);
                          });
                      }}
                    />
                    <span className="text-[12px] text-muted-foreground">{mat?.unit ?? ""}</span>
                    {isManager && (
                      <button
                        className="text-[12px] text-late"
                        onClick={() =>
                          removeMaterial
                            .mutateAsync({ id: r.id, modelId })
                            .then(() => toast.success("تم الحذف"))
                            .catch((err: Error) => toast.error(err.message))
                        }
                      >
                        حذف
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {isManager && (
            <div className="flex flex-wrap items-end gap-3 border-t border-line px-4 py-4">
              <div className="min-w-[200px] flex-1">
                <Field label="إضافة مادة">
                  <select
                    className="field"
                    value={pick.materialId}
                    onChange={(e) => setPick({ ...pick, materialId: e.target.value })}
                  >
                    <option value="">اختر المادة</option>
                    {materials
                      .filter((m) => m.is_active && !rows.some((r) => r.material_id === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.unit})
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              <Field label="الكمية">
                <input
                  className="field w-28"
                  type="number"
                  min="0"
                  step="0.01"
                  value={pick.qty}
                  onChange={(e) => setPick({ ...pick, qty: e.target.value })}
                />
              </Field>
              <Btn variant="quiet" onClick={addMaterial} disabled={setMaterial.isPending}>
                إضافة
              </Btn>
            </div>
          )}
        </Card>

        <Card title="الصور">
          {images.length === 0 ? (
            <Empty>لا توجد صور بعد.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-4">
              {images.map((img) => (
                <div key={img.id} className="grid gap-2">
                  {urls[img.storage_path] ? (
                    <img
                      src={urls[img.storage_path]}
                      alt={model?.name ?? "صورة الموديل"}
                      className="aspect-[3/4] w-full rounded-lg border border-line object-cover"
                    />
                  ) : (
                    <div className="aspect-[3/4] w-full rounded-lg border border-line bg-ivory" />
                  )}
                  {isManager && (
                    <button
                      className="text-[12px] text-late"
                      onClick={() =>
                        delImage
                          .mutateAsync({ id: img.id, path: img.storage_path, modelId })
                          .then(() => toast.success("تم حذف الصورة"))
                          .catch((err: Error) => toast.error(err.message))
                      }
                    >
                      حذف الصورة
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isManager && (
            <div className="border-t border-line px-4 py-4">
              <Field label="إضافة صور" hint="صور الموديل تظهر في القائمة وفي اختيار الطلب">
                <input
                  className="field"
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    upload
                      .mutateAsync({ modelId, files })
                      .then(() => toast.success("تم رفع الصور"))
                      .catch((err: Error) => toast.error(err.message));
                    e.target.value = "";
                  }}
                />
              </Field>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
