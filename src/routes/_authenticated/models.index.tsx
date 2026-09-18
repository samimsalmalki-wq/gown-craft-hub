import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useItemTypes } from "@/lib/data";
import { useInventoryUrls } from "@/lib/inventory-data";
import { useModelCovers, useModelMaterialCounts, useModels, useSaveModel } from "@/lib/models-data";
import { money } from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/models/")({
  head: () => ({
    meta: [
      { title: "الموديلات · مَعْمَل" },
      {
        name: "description",
        content: "موديلات المحل ومواد كل موديل — عند اختيار رقم الموديل في الطلب تُحجز مواده تلقائيًا.",
      },
      { property: "og:title", content: "الموديلات · مَعْمَل" },
      { property: "og:description", content: "موديلات المحل ومواد كل موديل وصورها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ModelsPage,
});

function ModelsPage() {
  const { isManager } = useCurrentAccount();
  const { data: models = [] } = useModels();
  const { data: types = [] } = useItemTypes();
  const { data: counts = {} } = useModelMaterialCounts();
  const { data: covers = {} } = useModelCovers();
  const urls = useInventoryUrls(Object.values(covers));
  const save = useSaveModel();

  const [term, setTerm] = useState("");
  const [typeId, setTypeId] = useState("");
  const [showOff, setShowOff] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    item_type_id: "",
    est_price: "0",
    description: "",
    notes: "",
  });

  const list = useMemo(() => {
    const t = term.trim();
    return models.filter(
      (m) =>
        (showOff || m.is_active) &&
        (!typeId || m.item_type_id === typeId) &&
        (!t || m.code.includes(t) || m.name.includes(t)),
    );
  }, [models, term, typeId, showOff]);

  const typeName = (id: string | null) => types.find((t) => t.id === id)?.name ?? "—";

  const submit = () =>
    save
      .mutateAsync({
        code: form.code,
        name: form.name,
        item_type_id: form.item_type_id || null,
        est_price: Number(form.est_price || 0),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
      })
      .then(() => {
        toast.success("تم إضافة الموديل");
        setOpen(false);
        setForm({ code: "", name: "", item_type_id: "", est_price: "0", description: "", notes: "" });
      })
      .catch((err: Error) => toast.error(err.message));

  return (
    <AppShell
      eyebrow="الموديلات"
      title="موديلات المحل"
      subtitle="كل موديل برقمه ومواده المستخدمة — يُختار في الطلب الجديد فتُحجز مواده تلقائيًا."
      actions={
        isManager ? (
          <Btn variant="gold" onClick={() => setOpen(true)}>
            موديل جديد
          </Btn>
        ) : undefined
      }
    >
      <Card title="بحث">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-3">
          <Field label="رقم الموديل أو الاسم">
            <input className="field" value={term} onChange={(e) => setTerm(e.target.value)} />
          </Field>
          <Field label="نوع القطعة">
            <select className="field" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">كل الأنواع</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                className="size-5 accent-current"
                checked={showOff}
                onChange={(e) => setShowOff(e.target.checked)}
              />
              إظهار الموديلات المعطّلة
            </label>
          </div>
        </div>
      </Card>

      <div className="mt-5">
        <Card title={`القائمة (${list.length})`}>
          {list.length === 0 ? (
            <Empty>لا توجد موديلات مطابقة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((m) => {
                const cover = covers[m.id];
                return (
                  <li key={m.id}>
                    <Link
                      to="/models/$modelId"
                      params={{ modelId: m.id }}
                      className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-ivory"
                    >
                      {cover && urls[cover] ? (
                        <img
                          src={urls[cover]}
                          alt={m.name}
                          className="size-12 shrink-0 rounded-lg border border-line object-cover"
                        />
                      ) : (
                        <div className="size-12 shrink-0 rounded-lg border border-line bg-ivory" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="num text-[13px] text-muted-foreground" dir="ltr">
                            {m.code}
                          </span>
                          <span className="truncate text-[14px] font-medium">{m.name}</span>
                          {!m.is_active && <Chip tone="late">معطّل</Chip>}
                        </div>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {typeName(m.item_type_id)} · {counts[m.id] ?? 0} مادة
                        </p>
                      </div>
                      <span className="num text-[13px]">{money(Number(m.est_price))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="موديل جديد">
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <Field label="رقم الموديل" hint="لا يتكرر">
            <input
              className="field"
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label="اسم الموديل">
            <input
              className="field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="نوع القطعة">
            <select
              className="field"
              value={form.item_type_id}
              onChange={(e) => setForm({ ...form, item_type_id: e.target.value })}
            >
              <option value="">اختر نوع القطعة</option>
              {types
                .filter((t) => t.is_active)
                .map((t) => (
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
              onChange={(e) => setForm({ ...form, est_price: e.target.value })}
            />
          </Field>
          <Field label="الوصف">
            <textarea
              className="field min-h-20"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="ملاحظات التصنيع">
            <textarea
              className="field min-h-20"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
        <div className="border-t border-line px-4 py-4">
          <Btn variant="gold" onClick={submit} disabled={save.isPending}>
            حفظ الموديل
          </Btn>
          <p className="mt-2 text-[12px] text-muted-foreground">
            تُضاف المواد والصور من صفحة الموديل بعد الحفظ.
          </p>
        </div>
      </Sheet>
    </AppShell>
  );
}
