import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAddDepartment, useDepartments, useUpdateDepartment } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/settings/departments")({
  head: () => ({
    meta: [
      { title: "الأقسام · الإعدادات · مَعْمَل" },
      { name: "description", content: "أضف أقسام العمل التي يُنسب إليها الموظفون وعدّل أسماءها وترتيبها." },
      { property: "og:title", content: "الأقسام · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة أقسام العمل في المحل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DepartmentsPage,
});

function DepartmentsPage() {
  const { isManager, ready } = useCurrentAccount();
  const { data: rows = [] } = useDepartments();
  const add = useAddDepartment();
  const update = useUpdateDepartment();
  const [name, setName] = useState("");

  if (ready && !isManager) {
    return (
      <AppShell title="الأقسام">
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
      .catch((e: Error) => toast.error(e.message));

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="الأقسام"
      subtitle="أقسام العمل تظهر في ملف كل موظف وفي تقارير الأداء."
    >
      <Card title="قسم جديد">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="min-w-[200px] flex-1">
            <Field label="اسم القسم">
              <input
                className="field w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: التطريز"
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
            <Empty>لا توجد أقسام بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((d, i) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3.5">
                  <span className="num w-6 text-[13px] text-muted-foreground">{i + 1}</span>
                  <input
                    key={d.name}
                    className="field h-9 min-h-0 flex-1 py-0 text-[14px] font-medium"
                    defaultValue={d.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== d.name)
                        update
                          .mutateAsync({ id: d.id, patch: { name: v } })
                          .then(() => toast.success("تم الحفظ"))
                          .catch((err: Error) => toast.error(err.message));
                      else e.target.value = d.name;
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
