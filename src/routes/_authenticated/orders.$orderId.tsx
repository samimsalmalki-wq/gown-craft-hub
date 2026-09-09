import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, PaymentChip, StageStatusChip } from "@/components/kit";
import {
  useOrder,
  useOrderFiles,
  useOrderStages,
  useProfiles,
  useSetCurrentStage,
  useSignedUrls,
  useUpdateOrder,
  useUpdateStage,
  useUploadFiles,
} from "@/lib/data";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  ORDER_STATE_LABEL,
  fmtDate,
  fmtDateTime,
  money,
  remaining,
  stageLabel,
  type OrderStage,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { data: order, isLoading } = useOrder(orderId);
  const { data: stages = [] } = useOrderStages(orderId);
  const { data: files = [] } = useOrderFiles(orderId);
  const { data: profiles = [] } = useProfiles();
  const { can } = useCurrentAccount();
  const urls = useSignedUrls(files.map((f) => f.storage_path));
  const updateOrder = useUpdateOrder(orderId);
  const updateStage = useUpdateStage(orderId);
  const setCurrent = useSetCurrentStage(orderId);
  const upload = useUploadFiles(orderId);

  if (isLoading) {
    return (
      <AppShell title="الطلب">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }
  if (!order) {
    return (
      <AppShell title="الطلب">
        <Empty>الطلب غير موجود.</Empty>
      </AppShell>
    );
  }

  const measures = (order.measurements ?? {}) as Record<string, unknown>;
  const canEditStages = can("stages.edit");
  const canUpload = can("files.upload");

  async function stageAction(stage: OrderStage, action: "start" | "done" | "block") {
    const now = new Date().toISOString();
    const patch =
      action === "start"
        ? { status: "in_progress" as const, started_at: stage.started_at ?? now }
        : action === "done"
          ? { status: "done" as const, completed_at: now, started_at: stage.started_at ?? now }
          : { status: "blocked" as const };
    await updateStage.mutateAsync({ id: stage.id, patch });
    if (action !== "block") await setCurrent.mutateAsync(stage.stage);
    toast.success("تم تحديث المرحلة");
  }

  return (
    <AppShell
      eyebrow={`طلب ${order.order_no}`}
      title={order.client_name}
      subtitle={`الحجز ${fmtDate(order.booked_at)} · التسليم ${fmtDate(order.due_date)} · ${ORDER_STATE_LABEL[order.state]}`}
      actions={<Chip tone="gold">{stageLabel(order.current_stage)}</Chip>}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Card title="بيانات العميلة">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="رقم الطلب" value={<span className="num text-gold">{order.order_no}</span>} />
              <Row label="الاسم" value={order.client_name} />
              <Row label="الجوال" value={<span dir="ltr">{order.client_phone || "—"}</span>} />
              <Row label="تواصل" value={order.client_contact || "—"} />
              <Row label="ملاحظات" value={order.notes || "—"} />
            </dl>
          </Card>

          <Card title="المقاسات">
            {Object.keys(measures).length === 0 ? (
              <Empty>لم تُسجَّل المقاسات بعد.</Empty>
            ) : (
              <dl className="divide-y divide-line text-[13px]">
                {Object.entries(measures).map(([k, v]) => (
                  <Row key={k} label={k} value={<span className="num">{String(v)}</span>} />
                ))}
              </dl>
            )}
          </Card>

          <Card title="الخامات">
            <p className="px-4 py-3 text-[13px] whitespace-pre-wrap">{order.materials || "—"}</p>
          </Card>

          {can("finance.view") && (
            <Card title="المالية" action={<PaymentChip status={order.payment_status} />}>
              <dl className="divide-y divide-line text-[13px]">
                <Row label="قيمة الفستان" value={<span className="num">{money(order.total_amount)}</span>} />
                <Row label="العربون" value={<span className="num">{money(order.deposit_amount)}</span>} />
                <Row label="المتبقي" value={<span className="num">{money(remaining(order))}</span>} />
              </dl>
              {can("orders.edit") && remaining(order) > 0 && (
                <div className="border-t border-line px-4 py-3">
                  <Btn
                    variant="quiet"
                    onClick={() =>
                      updateOrder.mutate({
                        deposit_amount: Number(order.total_amount),
                        payment_status: "paid",
                      })
                    }
                  >
                    تسجيل سداد كامل
                  </Btn>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title="مراحل التنفيذ">
            <ol className="divide-y divide-line">
              {stages.map((s) => (
                <li key={s.id} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="num text-[13px] text-muted-foreground">{s.position}</span>
                    <span className="min-w-0 flex-1 text-[14px] font-medium">{stageLabel(s.stage)}</span>
                    <StageStatusChip status={s.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-muted-foreground">
                    <span>بدء: {fmtDateTime(s.started_at)}</span>
                    <span>انتهاء: {fmtDateTime(s.completed_at)}</span>
                    <span>المسؤول: {s.assignee_name || "—"}</span>
                  </div>
                  {canEditStages && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <button className="rounded-lg border border-line px-3 py-1.5 text-[12px]" onClick={() => stageAction(s, "start")}>
                        بدء
                      </button>
                      <button className="rounded-lg border border-line px-3 py-1.5 text-[12px]" onClick={() => stageAction(s, "done")}>
                        إنهاء
                      </button>
                      <button className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-late" onClick={() => stageAction(s, "block")}>
                        إيقاف
                      </button>
                      <select
                        className="field h-9 min-h-0 py-0 text-[12px]"
                        value={s.assignee_id ?? ""}
                        onChange={(e) => {
                          const p = profiles.find((x) => x.id === e.target.value);
                          updateStage.mutate({
                            id: s.id,
                            patch: { assignee_id: p?.id ?? null, assignee_name: p?.full_name ?? null },
                          });
                        }}
                      >
                        <option value="">بدون مسؤول</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name}
                          </option>
                        ))}
                      </select>
                      <StageNote stage={s} onSave={(notes) => updateStage.mutate({ id: s.id, patch: { notes } })} />
                    </div>
                  )}
                  {s.notes && <p className="mt-2 text-[12px] whitespace-pre-wrap">{s.notes}</p>}
                </li>
              ))}
            </ol>
          </Card>

          <Card
            title="الصور والملفات"
            action={
              canUpload ? (
                <label className="cursor-pointer text-[13px] text-gold">
                  إرفاق
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      if (list.length) upload.mutate({ files: list, kind: "design" });
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : undefined
            }
          >
            {files.length === 0 ? (
              <Empty>لا توجد صور مرفقة.</Empty>
            ) : (
              <div className="grid grid-cols-3 gap-2 px-4 py-4 sm:grid-cols-4">
                {files.map((f) => (
                  <a
                    key={f.id}
                    href={urls[f.storage_path]}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square overflow-hidden rounded-lg border border-line bg-ivory"
                  >
                    {urls[f.storage_path] ? (
                      <img src={urls[f.storage_path]} alt="مرفق الطلب" className="size-full object-cover" />
                    ) : null}
                  </a>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[60%] text-left whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function StageNote({ stage, onSave }: { stage: OrderStage; onSave: (notes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(stage.notes ?? "");
  if (!open)
    return (
      <button className="text-[12px] text-gold" onClick={() => setOpen(true)}>
        ملاحظة
      </button>
    );
  return (
    <span className="flex w-full items-center gap-2">
      <input className="field h-9 min-h-0 flex-1 py-0 text-[12px]" value={text} onChange={(e) => setText(e.target.value)} />
      <button
        className="text-[12px] text-gold"
        onClick={() => {
          onSave(text);
          setOpen(false);
        }}
      >
        حفظ
      </button>
    </span>
  );
}
