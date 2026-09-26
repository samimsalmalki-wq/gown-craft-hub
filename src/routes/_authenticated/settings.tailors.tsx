import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAddTailor, useTailors, useUpdateTailor } from "@/lib/alterations-data";

export const Route = createFileRoute("/_authenticated/settings/tailors")({
  head: () => ({
    meta: [
      { title: "خياطين التعديلات · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "أسماء الخياطين اللي يظهرون في كرت تشغيل التعديل، والخياط الافتراضي.",
      },
      { property: "og:title", content: "خياطين التعديلات · مَعْمَل" },
      { property: "og:description", content: "أسماء خياطين التعديلات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TailorsPage,
});

function TailorsPage() {
  const { can, ready } = useCurrentAccount();
  const { data: rows = [], isLoading } = useTailors();
  const add = useAddTailor();
  const update = useUpdateTailor();
  const [name, setName] = useState("");

  if (ready && !(can("alterations.workshop") || can("catalog.manage"))) {
    return (
      <AppShell title="خياطين التعديلات">
        <Empty>هذه الشاشة لمشرف المعمل والإدارة.</Empty>
      </AppShell>
    );
  }

  const save = (id: string, patch: Parameters<typeof update.mutateAsync>[0]["patch"]) =>
    update
      .mutateAsync({ id, patch })
      .then(() => toast.success("تم الحفظ"))
      .catch((err: Error) => toast.error(err.message));

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
      title="خياطين التعديلات"
      subtitle="الخياط الافتراضي يطلع تلقائيًا في كرت تشغيل التعديل، ومشرف المعمل يقدر يغيّره عند الطباعة."
    >
      <Card title="خياط جديد">
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="min-w-[200px] flex-1">
            <Field label="اسم الخياط">
              <input
                className="field w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                }}
                placeholder="مثال: أبو محمد"
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
          {isLoading ? (
            <Empty>جاري التحميل…</Empty>
          ) : rows.length === 0 ? (
            <Empty>ما فيه خياطين بعد.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <input
                    key={t.name}
                    className="field h-9 min-h-0 min-w-[160px] flex-1 py-0 text-[14px] font-medium"
                    defaultValue={t.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== t.name) void save(t.id, { name: v });
                      else e.target.value = t.name;
                    }}
                  />
                  {t.is_default ? (
                    <Chip tone="gold">الافتراضي</Chip>
                  ) : (
                    t.is_active && (
                      <button
                        className="text-[13px] text-gold"
                        onClick={() => void save(t.id, { is_default: true })}
                      >
                        اجعله الافتراضي
                      </button>
                    )
                  )}
                  <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-gold)]"
                      checked={t.is_active}
                      onChange={(e) =>
                        void save(t.id, {
                          is_active: e.target.checked,
                          ...(e.target.checked ? {} : { is_default: false }),
                        })
                      }
                    />
                    شغّال
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
