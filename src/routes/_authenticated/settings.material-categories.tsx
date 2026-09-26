import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAddMaterialCategory,
  useMaterialCategories,
  useUpdateMaterialCategory,
} from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings/material-categories")({
  head: () => ({
    meta: [
      { title: "تصنيفات الخامات · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "أضف تصنيفات الخامات وعدّل أسماءها — قماش، دانتيل، خيوط — وتظهر في شاشة المخزون.",
      },
      { property: "og:title", content: "تصنيفات الخامات · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة تصنيفات خامات المخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MaterialCategoriesPage,
});

function MaterialCategoriesPage() {
  const { can, ready } = useCurrentAccount();
  const isManager = can("catalog.manage");
  const { data: rows = [] } = useMaterialCategories();
  const add = useAddMaterialCategory();
  const update = useUpdateMaterialCategory();
  const [label, setLabel] = useState("");

  if (ready && !isManager) {
    return (
      <AppShell title="تصنيفات الخامات">
        <Empty>هذه الشاشة متاحة لمن يملك صلاحية الموديلات والكتالوج.</Empty>
      </AppShell>
    );
  }

  const submit = () =>
    add
      .mutateAsync(label)
      .then(() => {
        toast.success("تمت الإضافة");
        setLabel("");
      })
      .catch((e: Error) => toast.error(e.message));

  const patch = (id: string, p: Record<string, unknown>) =>
    update
      .mutateAsync({ id, patch: p })
      .then(() => toast.success("تم الحفظ"))
      .catch((e: Error) => toast.error(e.message));

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="تصنيفات الخامات"
      subtitle="التصنيف يظهر في اختيار الخامة وفي فلتر المخزون. التعطيل بدل الحذف حتى لا تتأثر الخامات القديمة."
    >
      <Card title="تصنيف جديد">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="min-w-[200px] flex-1">
            <Field label="اسم التصنيف">
              <input
                className="field w-full"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="مثال: أزرار"
              />
            </Field>
          </div>
          <Btn variant="gold" onClick={submit} disabled={add.isPending}>
            إضافة
          </Btn>
        </div>
      </Card>

      <div className="mt-5">
        <Card title="القائمة">
          {rows.length === 0 ? (
            <Empty>لا توجد تصنيفات بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((c, i) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="num w-6 text-[13px] text-muted-foreground">{i + 1}</span>
                  <input
                    key={c.label}
                    className="field h-9 min-h-0 min-w-[140px] flex-1 py-0 text-[14px] font-medium"
                    defaultValue={c.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.label) patch(c.id, { label: v });
                      else e.target.value = c.label;
                    }}
                  />
                  {!c.is_active && <Chip tone="late">غير مُفعّل</Chip>}
                  <label className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      className="size-5 accent-current"
                      checked={c.is_active}
                      onChange={(e) => patch(c.id, { is_active: e.target.checked })}
                    />
                    مُفعّل
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
