import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Card, Chip, Empty } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useSaveTemplate, useStageTemplates } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({
    meta: [
      { title: "إعداد مراحل التصنيع · مَعْمَل" },
      { name: "description", content: "تفعيل المراحل وتحديد مدتها المتوقعة وأيها يحتاج مراجعة مشرف." },
      { property: "og:title", content: "إعداد مراحل التصنيع · مَعْمَل" },
      {
        property: "og:description",
        content: "تفعيل المراحل وتحديد مدتها المتوقعة وأيها يحتاج مراجعة مشرف.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WorkflowPage,
});

function WorkflowPage() {
  const { isAdmin, ready } = useCurrentAccount();
  const { data: templates = [] } = useStageTemplates();
  const save = useSaveTemplate();

  const patch = (id: string, p: Record<string, unknown>) =>
    save
      .mutateAsync({ id, patch: p })
      .then(() => toast.success("تم الحفظ"))
      .catch((err: Error) => toast.error(err.message));

  if (ready && !isAdmin) {
    return (
      <AppShell title="إعداد المراحل">
        <Empty>هذه الشاشة متاحة لمدير الورشة فقط.</Empty>
      </AppShell>
    );
  }

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="مراحل التصنيع"
      subtitle="فعّل المراحل، وحدّد المدة المتوقعة وأي مرحلة تحتاج اعتماد مشرف. لا تُحذف مراحل الطلبات القائمة."
    >
      <Card title="قائمة المراحل">
        {templates.length === 0 ? (
          <Empty>لا توجد مراحل.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <span className="num w-6 text-[13px] text-muted-foreground">{t.position}</span>
                <span className="min-w-[120px] flex-1 text-[14px] font-medium">{t.label}</span>
                {!t.is_active && <Chip tone="late">غير مُفعّلة</Chip>}
                <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  مدة متوقعة
                  <input
                    type="number"
                    min={0}
                    defaultValue={t.expected_days}
                    className="field h-9 min-h-0 w-16 py-0 text-center text-[12px]"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== t.expected_days) patch(t.id, { expected_days: v });
                    }}
                  />
                  يوم
                </label>
                <label className="flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={t.requires_review}
                    onChange={(e) => patch(t.id, { requires_review: e.target.checked })}
                  />
                  تحتاج مراجعة
                </label>
                <label className="flex items-center gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={t.is_active}
                    onChange={(e) => patch(t.id, { is_active: e.target.checked })}
                  />
                  مُفعّلة
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
