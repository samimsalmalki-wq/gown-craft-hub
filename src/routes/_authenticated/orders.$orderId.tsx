import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, PaymentChip, Sheet } from "@/components/kit";
import { PaymentsCard } from "@/components/PaymentsCard";
import { StageRow, StageSheet } from "@/components/StageWork";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import {
  useActivityLog,
  useAddAlteration,
  useAlterations,
  useOrder,
  useOrderFiles,
  useOrderStages,
  useProfiles,
  useSignedUrls,
  useUpdateAlteration,
  useUpdateOrder,
  useUploadFiles,
} from "@/lib/data";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useCloseRentalReturn,
  useDeliverRentalOrder,
  useDressesOfOrder,
  useIssueMaterial,
  useMaterials,
  useOrderMaterials,
  useRecordsOfOrder,
  useReleaseMaterial,
} from "@/lib/inventory-data";
import { DRESS_STATUS_LABEL, RETURN_CONDITIONS, isOutNow, qty } from "@/lib/inventory";
import { useItemTypes } from "@/lib/data";
import {
  ALTERATION_STATUS_LABEL,
  ORDER_KIND_LABEL,
  ORDER_STATE_LABEL,
  activityLabel,
  fmtDate,
  fmtDateTime,
  itemTypeLabel,
  money,
  remaining,
  stageLabel,
  type AlterationStatus,
  type Order,
  type OrderStage,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  head: () => ({
    meta: [
      { title: "تفاصيل الطلب · مَعْمَل" },
      { name: "description", content: "بيانات الفستان والعميلة ومراحل التنفيذ والتعديلات والسجل الزمني." },
      { property: "og:title", content: "تفاصيل الطلب · مَعْمَل" },
      {
        property: "og:description",
        content: "بيانات الفستان والعميلة ومراحل التنفيذ والتعديلات والسجل الزمني.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const { data: order, isLoading } = useOrder(orderId);
  const { data: stages = [] } = useOrderStages(orderId);
  const { data: files = [] } = useOrderFiles(orderId);
  const { data: profiles = [] } = useProfiles();
  const { data: alterations = [] } = useAlterations(orderId);
  const { data: log = [] } = useActivityLog(orderId);
  const { can, isManager } = useCurrentAccount();
  const urls = useSignedUrls(files.map((f) => f.storage_path));
  const updateOrder = useUpdateOrder(orderId);
  const upload = useUploadFiles(orderId);
  const addAlteration = useAddAlteration(orderId);
  const updateAlteration = useUpdateAlteration(orderId);
  const [activeStage, setActiveStage] = useState<OrderStage | null>(null);
  const [altOpen, setAltOpen] = useState(false);

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
  const canUpload = can("files.upload");

  return (
    <AppShell
      eyebrow={`طلب ${order.order_no}`}
      title={order.client_name}
      subtitle={`الحجز ${fmtDate(order.booked_at)} · التسليم ${fmtDate(order.due_date)} · ${ORDER_STATE_LABEL[order.state]}`}
      actions={
        <>
          <Chip tone={order.order_kind === "own" ? "neutral" : "gold"}>
            {ORDER_KIND_LABEL[order.order_kind]}
          </Chip>
          <Chip tone="gold">{stageLabel(order.current_stage)}</Chip>
          <WhatsAppButton order={order} />
        </>
      }
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

          <Card title="المواعيد">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="تاريخ الحجز" value={fmtDate(order.booked_at)} />
              <Row label="البروفة الأولى" value={fmtDate(order.fitting1_date)} />
              <Row label="البروفة الثانية" value={fmtDate(order.fitting2_date)} />
              <Row label="التسليم النهائي" value={fmtDate(order.due_date)} />
              <Row label="تاريخ المناسبة" value={fmtDate(order.event_date)} />
            </dl>
          </Card>

          <Card title="الموديل">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="نوع الموديل" value={order.is_new_model ? "موديل جديد" : "موديل موجود"} />
              <Row label="رقم الموديل" value={order.model_no || "—"} />
              <Row label="موديل التطريز" value={order.embroidery_model || "—"} />
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

          <OrderMaterialsCard orderId={order.id} canEdit={isManager} />

          {can("finance.view") && (
            <Card title="المالية" action={<PaymentChip status={order.payment_status} />}>
              <dl className="divide-y divide-line text-[13px]">
                <Row label="قيمة الفستان" value={<span className="num">{money(order.total_amount)}</span>} />
                <Row label="المحصَّل" value={<span className="num">{money(order.deposit_amount)}</span>} />
                <Row label="المتبقي" value={<span className="num">{money(remaining(order))}</span>} />
              </dl>
            </Card>
          )}

          <PaymentsCard order={order} />

          <Card title="السجل الزمني">
            {log.length === 0 ? (
              <Empty>لا يوجد سجل بعد.</Empty>
            ) : (
              <ol className="max-h-96 divide-y divide-line overflow-y-auto">
                {log.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <p className="text-[12.5px]">
                      <span className="font-medium">{activityLabel(a.action)}</span>
                      {a.details ? ` · ${a.details}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {profiles.find((p) => p.id === a.actor_id)?.full_name || "النظام"} ·{" "}
                      {fmtDateTime(a.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="مراحل التنفيذ">
            <ol className="divide-y divide-line">
              {stages.map((s) => (
                <li key={s.id}>
                  <StageRow stage={s} onOpen={() => setActiveStage(s)} />
                </li>
              ))}
            </ol>
          </Card>

          <Card
            title="التعديلات والبروفات"
            action={
              can("stages.edit") ? (
                <button className="text-[13px] text-gold" onClick={() => setAltOpen(true)}>
                  إضافة تعديل
                </button>
              ) : undefined
            }
          >
            {alterations.length === 0 ? (
              <Empty>لا توجد تعديلات مسجّلة.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {alterations.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-[12px] text-muted-foreground">#{a.number}</span>
                      <span className="min-w-0 flex-1 text-[13.5px] font-medium">{a.description}</span>
                      <Chip tone={a.status === "done" ? "ok" : a.status === "cancelled" ? "neutral" : "soon"}>
                        {ALTERATION_STATUS_LABEL[a.status]}
                      </Chip>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      طُلب {fmtDateTime(a.requested_at)}
                      {a.completed_at ? ` · أُنجز ${fmtDateTime(a.completed_at)}` : ""}
                    </p>
                    {a.notes && <p className="mt-1 text-[12px] whitespace-pre-wrap">{a.notes}</p>}
                    {can("stages.edit") && a.status !== "done" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <select
                          className="field h-9 min-h-0 py-0 text-[12px]"
                          value={a.status}
                          onChange={(e) =>
                            updateAlteration
                              .mutateAsync({
                                id: a.id,
                                patch: {
                                  status: e.target.value as AlterationStatus,
                                  completed_at:
                                    e.target.value === "done" ? new Date().toISOString() : null,
                                },
                              })
                              .then(() => toast.success("تم تحديث التعديل"))
                              .catch((err: Error) => toast.error(err.message))
                          }
                        >
                          {(Object.keys(ALTERATION_STATUS_LABEL) as AlterationStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {ALTERATION_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        {isManager && (
                          <select
                            className="field h-9 min-h-0 py-0 text-[12px]"
                            value={a.assignee_id ?? ""}
                            onChange={(e) =>
                              updateAlteration.mutate({
                                id: a.id,
                                patch: { assignee_id: e.target.value || null },
                              })
                            }
                          >
                            <option value="">بدون مسؤول</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
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

      <StageSheet stage={activeStage} onClose={() => setActiveStage(null)} />

      {altOpen && (
        <NewAlterationSheet
          stages={stages}
          onClose={() => setAltOpen(false)}
          onSave={(v) =>
            addAlteration
              .mutateAsync(v)
              .then(() => {
                toast.success("تم تسجيل التعديل");
                setAltOpen(false);
              })
              .catch((err: Error) => toast.error(err.message))
          }
        />
      )}
    </AppShell>
  );
}

function NewAlterationSheet({
  stages,
  onClose,
  onSave,
}: {
  stages: OrderStage[];
  onClose: () => void;
  onSave: (v: {
    description: string;
    notes: string | null;
    assigneeId: string | null;
    stageId: string | null;
  }) => void;
}) {
  const { data: profiles = [] } = useProfiles();
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [assignee, setAssignee] = useState("");
  const [stageId, setStageId] = useState("");

  return (
    <Sheet open onClose={onClose} title="تعديل جديد">
      <div className="space-y-3 px-4 py-4">
        <Field label="وصف التعديل المطلوب">
          <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <textarea className="field min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Field label="المرحلة المرتبطة">
          <select className="field" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            <option value="">بدون ربط</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {stageLabel(s.stage)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الموظف المسؤول">
          <select className="field" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">بدون مسؤول</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex gap-2 pt-1">
          <Btn
            variant="gold"
            onClick={() => {
              if (!description.trim()) {
                toast.error("اكتب وصف التعديل");
                return;
              }
              onSave({
                description,
                notes: notes || null,
                assigneeId: assignee || null,
                stageId: stageId || null,
              });
            }}
          >
            حفظ التعديل
          </Btn>
          <Btn variant="quiet" onClick={onClose}>
            إلغاء
          </Btn>
        </div>
      </div>
    </Sheet>
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

function OrderMaterialsCard({ orderId, canEdit }: { orderId: string; canEdit: boolean }) {
  const { data: rows = [] } = useOrderMaterials(orderId);
  const { data: materials = [] } = useMaterials();
  const issue = useIssueMaterial();
  const release = useReleaseMaterial();

  if (rows.length === 0) return null;

  return (
    <Card title="المواد المحجوزة للطلب">
      <ul className="divide-y divide-line">
        {rows.map((r) => {
          const material = materials.find((m) => m.id === r.material_id);
          const reserved = Number(r.qty_reserved);
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[14px]">{material?.name ?? "مادة"}</span>
              <span className="num text-[12px] text-muted-foreground">
                محجوز {qty(reserved)} · مصروف {qty(r.qty_issued)} {material?.unit ?? ""}
              </span>
              {canEdit && reserved > 0 && (
                <div className="flex gap-2">
                  <Btn variant="quiet" onClick={() => issue.mutate({ row: r, qty: reserved })}>
                    صرف
                  </Btn>
                  <Btn variant="quiet" onClick={() => release.mutate(r)}>
                    تحرير الحجز
                  </Btn>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
