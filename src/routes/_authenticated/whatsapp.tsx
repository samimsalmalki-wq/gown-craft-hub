import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { SAMPLE_VARS, TEMPLATE_VARS, fillTemplate } from "@/lib/whatsapp";
import { useSaveWhatsappTemplate, useWhatsappTemplates } from "@/lib/whatsapp-data";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "رسائل الواتساب · مَعْمَل" },
      {
        name: "description",
        content: "تعديل نصوص رسائل الواتساب المرسلة للعميلات لتأكيد الحجز والبروفات والتسليم.",
      },
      { property: "og:title", content: "رسائل الواتساب · مَعْمَل" },
      {
        property: "og:description",
        content: "تعديل نصوص رسائل الواتساب المرسلة للعميلات لتأكيد الحجز والبروفات والتسليم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WhatsappPage,
});

function WhatsappPage() {
  const { isManager } = useCurrentAccount();
  const { data: templates = [], isLoading } = useWhatsappTemplates();
  const save = useSaveWhatsappTemplate();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const t of templates) if (next[t.id] === undefined) next[t.id] = t.body;
      return next;
    });
  }, [templates]);

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="رسائل الواتساب"
      subtitle="نصوص الرسائل التي تُفتح جاهزة عند مراسلة العميلة من الطلب."
    >
      <Card title="الحقول الجاهزة" className="mb-5">
        <div className="flex flex-wrap gap-2 p-4">
          {TEMPLATE_VARS.map((v) => (
            <Chip key={v.key}>
              {v.label}: <span className="num mr-1 font-en">{`{${v.key}}`}</span>
            </Chip>
          ))}
        </div>
      </Card>

      {isLoading ? (
        <Card>
          <Empty>جاري التحميل…</Empty>
        </Card>
      ) : (
        <div className="space-y-5">
          {templates.map((t) => {
            const body = drafts[t.id] ?? t.body;
            const dirty = body !== t.body;
            return (
              <Card
                key={t.id}
                title={t.label}
                action={
                  <div className="flex items-center gap-2">
                    <Chip tone={t.is_active ? "ok" : "neutral"}>{t.is_active ? "مفعّلة" : "معطّلة"}</Chip>
                    {isManager && (
                      <button
                        onClick={() => save.mutate({ id: t.id, is_active: !t.is_active })}
                        className="text-[12px] text-muted-foreground hover:text-ink"
                      >
                        {t.is_active ? "تعطيل" : "تفعيل"}
                      </button>
                    )}
                  </div>
                }
              >
                <div className="grid gap-4 p-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-[12px] text-muted-foreground">نص الرسالة</p>
                    <textarea
                      className="field w-full"
                      rows={7}
                      value={body}
                      readOnly={!isManager}
                      onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })}
                    />
                    {isManager && (
                      <div className="mt-3 flex items-center gap-2">
                        <Btn
                          disabled={!dirty || save.isPending}
                          onClick={() => save.mutate({ id: t.id, body })}
                        >
                          حفظ
                        </Btn>
                        {dirty && (
                          <button
                            onClick={() => setDrafts({ ...drafts, [t.id]: t.body })}
                            className="text-[12px] text-muted-foreground hover:text-ink"
                          >
                            تراجع
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="mb-1.5 text-[12px] text-muted-foreground">معاينة</p>
                    <div className="rounded-xl border border-line bg-ivory p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
                      {fillTemplate(body, SAMPLE_VARS)}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
