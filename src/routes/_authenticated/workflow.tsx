import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useAddTemplate,
  useReorderTemplates,
  useSaveTemplate,
  useStageTemplates,
} from "@/lib/data";
import { ORDER_KIND_LABEL, type OrderKind, type StageTemplate } from "@/lib/atelier";
import { cn } from "@/lib/utils";

const ORDER_KINDS = Object.keys(ORDER_KIND_LABEL) as OrderKind[];

export const Route = createFileRoute("/_authenticated/workflow")({
  head: () => ({
    meta: [
      { title: "إعداد مراحل التصنيع · مَعْمَل" },
      {
        name: "description",
        content: "رتّب المراحل بالسحب، وسمّها كما تريد، وأضف مراحل جديدة، وحدّد مدتها ومراجعتها.",
      },
      { property: "og:title", content: "إعداد مراحل التصنيع · مَعْمَل" },
      {
        property: "og:description",
        content: "رتّب المراحل بالسحب، وسمّها كما تريد، وأضف مراحل جديدة، وحدّد مدتها ومراجعتها.",
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
  const reorder = useReorderTemplates();
  const add = useAddTemplate();

  const [order, setOrder] = useState<StageTemplate[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setOrder(templates);
  }, [templates]);

  const patch = (id: string, p: Record<string, unknown>) =>
    save
      .mutateAsync({ id, patch: p })
      .then(() => toast.success("تم الحفظ"))
      .catch((err: Error) => toast.error(err.message));

  const commit = (rows: StageTemplate[]) => {
    setOrder(rows);
    reorder
      .mutateAsync(rows.map((r) => r.id))
      .then(() => toast.success("تم تحديث الترتيب"))
      .catch((err: Error) => {
        toast.error(err.message);
        setOrder(templates);
      });
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const rows = [...order];
    const row = rows.splice(from, 1)[0]!;
    rows.splice(to, 0, row);
    commit(rows);
  };

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
      subtitle="اسحب المراحل لترتيبها، عدّل الأسماء، أضف مراحل جديدة، وحدّد المدة والمراجعة وأنواع الطلبات اللي تنطبق عليها كل مرحلة. الترتيب يُطبّق على الطلبات الجارية دون المساس بالعمل المنجز."
      actions={
        <Btn onClick={() => setAdding((v) => !v)}>{adding ? "إلغاء" : "إضافة مرحلة"}</Btn>
      }
    >
      {adding && <AddStage onDone={() => setAdding(false)} add={add} />}

      <Card title="قائمة المراحل">
        {order.length === 0 ? (
          <Empty>لا توجد مراحل.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {order.map((t, i) => (
              <li
                key={t.id}
                draggable
                onDragStart={() => setDragId(t.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = order.findIndex((r) => r.id === dragId);
                  setDragId(null);
                  if (from >= 0) move(from, i);
                }}
                className={`flex flex-wrap items-center gap-3 px-4 py-3.5 ${
                  dragId === t.id ? "opacity-50" : ""
                }`}
              >
                <span className="cursor-grab select-none text-[16px] text-muted-foreground">⠿</span>
                <span className="num w-6 text-[13px] text-muted-foreground">{i + 1}</span>

                <input
                  className="field h-9 min-h-0 min-w-[120px] flex-1 py-0 text-[14px] font-medium"
                  defaultValue={t.label}
                  key={t.label}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== t.label) patch(t.id, { label: v });
                    else e.target.value = t.label;
                  }}
                />

                {!t.is_active && <Chip tone="late">غير مُفعّلة</Chip>}

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="لأعلى"
                    className="size-9 rounded-lg border border-line text-[14px]"
                    onClick={() => move(i, i - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label="لأسفل"
                    className="size-9 rounded-lg border border-line text-[14px]"
                    onClick={() => move(i, i + 1)}
                  >
                    ↓
                  </button>
                </div>

                <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-2 ps-9">
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
                  <Toggle
                    label="تحتاج مراجعة"
                    checked={t.requires_review}
                    onChange={(v) => patch(t.id, { requires_review: v })}
                  />
                  <Toggle
                    label="مرحلة بروفة"
                    hint="الطلبات الواقفة عليها تنحسب في «تنتظر بروفة» في لوحة التحكم"
                    checked={t.is_fitting}
                    onChange={(v) => patch(t.id, { is_fitting: v })}
                  />
                  <Toggle
                    label="إرسال للبروفة"
                    hint="القطعة تنرسل من المعمل للفرع للبروفة، وبعدها يسجّل المشرف النتيجة ويرجّعها للمعمل"
                    checked={t.sends_for_fitting}
                    onChange={(v) =>
                      patch(
                        t.id,
                        v
                          ? { sends_for_fitting: true, sends_to_branch: false }
                          : { sends_for_fitting: false },
                      )
                    }
                  />
                  <Toggle
                    label="التسليم للمحل"
                    hint="لما يوصل الطلب لهذي المرحلة يدخل «جاهز المعمل» ويُرسل للفرع بقائمة القطع"
                    checked={t.sends_to_branch}
                    onChange={(v) =>
                      patch(
                        t.id,
                        v
                          ? { sends_to_branch: true, sends_for_fitting: false }
                          : { sends_to_branch: false },
                      )
                    }
                  />
                  <Toggle
                    label="مُفعّلة"
                    checked={t.is_active}
                    onChange={(v) => patch(t.id, { is_active: v })}
                  />
                </div>

                <div className="flex basis-full flex-wrap items-center gap-2 ps-9 text-[12px]">
                  <span className="text-muted-foreground">تنطبق على:</span>
                  {ORDER_KINDS.map((k) => {
                    const on = t.order_kinds.includes(k);
                    return (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={on}
                        className={cn(
                          "min-h-8 rounded-full border px-3",
                          on
                            ? "border-gold bg-gold/10 text-gold"
                            : "border-line text-muted-foreground",
                        )}
                        onClick={() => {
                          const next = on
                            ? t.order_kinds.filter((x) => x !== k)
                            : [...t.order_kinds, k];
                          if (next.length === 0) {
                            toast.error("المرحلة لازم تنطبق على نوع طلب واحد على الأقل");
                            return;
                          }
                          patch(t.id, { order_kinds: ORDER_KINDS.filter((x) => next.includes(x)) });
                        }}
                      >
                        {ORDER_KIND_LABEL[k]}
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}

function AddStage({
  add,
  onDone,
}: {
  add: ReturnType<typeof useAddTemplate>;
  onDone: () => void;
}) {
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(2);
  const [review, setReview] = useState(false);

  const submit = () => {
    if (!label.trim()) {
      toast.error("اكتب اسم المرحلة");
      return;
    }
    add
      .mutateAsync({ label: label.trim(), expectedDays: days, requiresReview: review })
      .then(() => {
        toast.success("تمت إضافة المرحلة");
        onDone();
      })
      .catch((err: Error) => toast.error(err.message));
  };

  return (
    <Card title="مرحلة جديدة">
      <div className="flex flex-wrap items-end gap-3 px-4 py-4">
        <div className="min-w-[180px] flex-1">
          <Field label="اسم المرحلة">
            <input
              className="field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: تركيب الكريستال"
            />
          </Field>
        </div>
        <div className="w-28">
          <Field label="مدة متوقعة (يوم)">
            <input
              type="number"
              min={0}
              className="field"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            />
          </Field>
        </div>
        <label className="flex h-11 items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="size-5 accent-current"
            checked={review}
            onChange={(e) => setReview(e.target.checked)}
          />
          تحتاج مراجعة
        </label>
        <Btn variant="gold" onClick={submit} disabled={add.isPending}>
          إضافة
        </Btn>
      </div>
    </Card>
  );
}

/** خيار تشغيل وإيقاف في سطر المرحلة */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[12px]" title={hint}>
      <input
        type="checkbox"
        className="size-5 accent-current"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
