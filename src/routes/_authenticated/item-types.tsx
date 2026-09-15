import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAddItemType, useItemTypes, useUpdateItemType } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/item-types")({
  head: () => ({
    meta: [
      { title: "أنواع القطع · مَعْمَل" },
      {
        name: "description",
        content: "أضف أنواع القطع التي تفصّلها — فستان زواج، طرحة، فستان سهرة — وعدّل أسماءها وترتيبها.",
      },
      { property: "og:title", content: "أنواع القطع · مَعْمَل" },
      {
        property: "og:description",
        content: "أضف أنواع القطع التي تفصّلها وعدّل أسماءها وترتيبها.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ItemTypesPage,
});

function ItemTypesPage() {
  const { isManager, ready } = useCurrentAccount();
  const { data: types = [] } = useItemTypes();
  const add = useAddItemType();
  const update = useUpdateItemType();
  const [name, setName] = useState("");

  if (ready && !isManager) {
    return (
      <AppShell title="أنواع القطع">
        <Empty>هذه الشاشة متاحة للمدير والمشرف فقط.</Empty>
      </AppShell>
    );
  }

  const submit = () =>
    add
      .mutateAsync(name)
      .then(() => {
        toast.success("تمت الإضافة");
        setName("");
      })
      .catch((err: Error) => toast.error(err.message));

  const patch = (id: string, p: Record<string, unknown>) =>
    update
      .mutateAsync({ id, patch: p })
      .then(() => toast.success("تم الحفظ"))
      .catch((err: Error) => toast.error(err.message));

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="أنواع القطع"
      subtitle="حدّد أنواع القطع التي تفصّلها، وتظهر في اختيار الطلب الجديد. التعطيل بدل الحذف حتى لا تتأثر الطلبات القديمة."
    >
      <Card title="نوع جديد">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="min-w-[200px] flex-1">
            <Field label="اسم النوع">
              <input
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: فستان سهرة"
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
          {types.length === 0 ? (
            <Empty>لا توجد أنواع بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {types.map((t, i) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="num w-6 text-[13px] text-muted-foreground">{i + 1}</span>
                  <input
                    key={t.name}
                    className="field h-9 min-h-0 min-w-[140px] flex-1 py-0 text-[14px] font-medium"
                    defaultValue={t.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.name) patch(t.id, { name: v });
                      else e.target.value = t.name;
                    }}
                  />
                  {!t.is_active && <Chip tone="late">غير مُفعّل</Chip>}
                  <label className="flex items-center gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      className="size-5 accent-current"
                      checked={t.is_active}
                      onChange={(e) => patch(t.id, { is_active: e.target.checked })}
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
