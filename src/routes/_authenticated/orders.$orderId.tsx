import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, PaymentChip, Sheet } from "@/components/kit";
import { PaymentsCard } from "@/components/PaymentsCard";
import { DressPartsCard } from "@/components/goods/DressPartsCard";
import { OrderAlterationsCard } from "@/components/alterations/OrderAlterationsCard";
import { branchLabel, useBranches } from "@/lib/branches";
import { StageRow, StageSheet } from "@/components/StageWork";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import {
  useActivityLog,
  useOrder,
  useOrderFiles,
  useOrderStages,
  useProfiles,
  useSignedUrls,
  useUpdateOrder,
  useUploadFiles,
} from "@/lib/data";
import { useCurrentAccount } from "@/hooks/useSession";
import {
  useDeliverRentalOrder,
  useDressesOfOrder,
  useIssueMaterial,
  useMaterials,
  useOrderMaterials,
  useRecordsOfOrder,
  useRentalStatuses,
  useReleaseMaterial,
} from "@/lib/inventory-data";
import {
  dressStatusLabel,
  dressStatusTone,
  isOutNow,
  qty,
  rentalMoney,
} from "@/lib/inventory";
import { DepositReceiptButton, MethodPicker, ReturnSheet } from "@/components/RentalMoneySheets";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/finance";
import { useItemTypes } from "@/lib/data";
import { useModel } from "@/lib/models-data";
import { SketchBoard } from "@/components/SketchBoard";
import { SKETCH_KIND, emptySketch, pagePngPath, type SketchDoc } from "@/lib/sketch";
import {
  ALTERATION_SKETCH_KIND,
  loadSketchDoc,
  useSaveSketch,
  useSketchDoc,
} from "@/lib/sketch-data";
import {
  measurementLabel,
  ORDER_KIND_LABEL,
  ORDER_STATE_LABEL,
  activityLabel,
  fmtDate,
  fmtDateTime,
  itemTypeLabel,
  money,
  remaining,
  stageLabel,
  type Order,
  type OrderFile,
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
  const { data: log = [] } = useActivityLog(orderId);
  const { can } = useCurrentAccount();
  const urls = useSignedUrls(files.map((f) => f.storage_path));
  const updateOrder = useUpdateOrder(orderId);
  const upload = useUploadFiles(orderId);
  const [activeStage, setActiveStage] = useState<OrderStage | null>(null);

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
  const attachments = files.filter(
    (f) => f.kind !== SKETCH_KIND && f.kind !== ALTERATION_SKETCH_KIND,
  );

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
          <Link to="/orders/$orderId/print" params={{ orderId: order.id }} className="btn-quiet">
            طباعة للمعمل
          </Link>
          <WhatsAppButton order={order} />
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <Card title="بيانات العميلة">
            <dl className="divide-y divide-line text-[13px]">
              <Row label="رقم الطلب" value={<span className="num text-gold">{order.order_no}</span>} />
              <Row
                label="رقم الفاتورة الخارجي"
                value={<span className="num" dir="ltr">{order.external_invoice_no || "—"}</span>}
              />

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
              <Row label="نوع التفصيل" value={ORDER_KIND_LABEL[order.order_kind]} />
              <Row label="نوع القطعة" value={<ItemTypeValue id={order.item_type_id} />} />
              <Row label="نوع الموديل" value={order.is_new_model ? "موديل جديد" : "موديل موجود"} />
              <Row
                label="رقم الموديل"
                value={<ModelValue modelId={order.model_id} fallback={order.model_no} />}
              />
              <Row label="موديل التطريز" value={order.embroidery_model || "—"} />
            </dl>
          </Card>

          <DressPartsCard order={order} />

          {order.order_kind !== "own" && <RentalOrderCard order={order} canEdit={can("rentals.manage")} />}





          <Card title="المقاسات">
            {Object.keys(measures).length === 0 ? (
              <Empty>لم تُسجَّل المقاسات بعد.</Empty>
            ) : (
              <dl className="divide-y divide-line text-[13px]">
                {Object.entries(measures).map(([k, v]) => (
                  <Row
                    key={k}
                    label={measurementLabel(k)}
                    value={<span className="num">{String(v)}</span>}
                  />
                ))}
              </dl>
            )}
          </Card>

          <Card title="الخامات">
            <p className="px-4 py-3 text-[13px] whitespace-pre-wrap">{order.materials || "—"}</p>
          </Card>

          <OrderMaterialsCard orderId={order.id} canEdit={can("inventory.manage")} />

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

          <OrderAlterationsCard order={order} />

          <SketchCard
            order={order}
            sketches={files.filter((f) => f.kind === SKETCH_KIND)}
            urls={urls}
            canDraw={canUpload}
          />

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
            {attachments.length === 0 ? (
              <Empty>لا توجد صور مرفقة.</Empty>
            ) : (
              <div className="grid grid-cols-3 gap-2 px-4 py-4 sm:grid-cols-4">
                {attachments.map((f) => (
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

    </AppShell>
  );
}

/** لوحة التصميم: رسم بقلم الآيباد فوق رسمة الجسم، وكل حفظ نسخة جديدة */
function SketchCard({
  order,
  sketches,
  urls,
  canDraw,
}: {
  order: Order;
  sketches: OrderFile[];
  urls: Record<string, string>;
  canDraw: boolean;
}) {
  const save = useSaveSketch(order.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [board, setBoard] = useState<SketchDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const selected = sketches.find((s) => s.id === selectedId) ?? sketches[0] ?? null;
  const { data: doc } = useSketchDoc(selected?.storage_path);
  const pagePaths = selected
    ? (doc?.pages ?? [null]).map((_, i) => pagePngPath(selected.storage_path, i))
    : [];
  const extraUrls = useSignedUrls([
    ...pagePaths.slice(1),
    ...(doc?.attachments ?? []).map((a) => a.path),
  ]);
  const urlOf = (path: string | undefined) => (path ? (urls[path] ?? extraUrls[path]) : undefined);
  const shownPage = Math.min(pageIdx, Math.max(0, pagePaths.length - 1));
  const selectedUrl = urlOf(pagePaths[shownPage]);

  async function continueFrom(file: OrderFile) {
    setLoading(true);
    try {
      setBoard(await loadSketchDoc(file.storage_path));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      title="لوحة التصميم"
      action={
        canDraw ? (
          <div className="flex items-center gap-3">
            {selected && (
              <button
                className="text-[13px] text-gold disabled:opacity-50"
                disabled={loading}
                onClick={() => continueFrom(selected)}
              >
                {loading ? "لحظة…" : "إكمال الرسم"}
              </button>
            )}
            <button className="text-[13px] text-gold" onClick={() => setBoard(emptySketch())}>
              رسمة جديدة
            </button>
          </div>
        ) : undefined
      }
    >
      {!selected ? (
        <Empty>
          {canDraw
            ? "ارسمي التصميم بالقلم فوق رسمة الجسم وعليها مقاسات العميلة."
            : "لا يوجد تصميم مرسوم بعد."}
        </Empty>
      ) : (
        <div className="space-y-3 px-4 py-4">
          <a
            href={selectedUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded-lg border border-line bg-white"
          >
            {selectedUrl ? (
              <img src={selectedUrl} alt={selected.caption ?? "التصميم"} className="w-full" />
            ) : (
              <div className="aspect-[5/7]" />
            )}
          </a>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground">
              {selected.caption ?? "تصميم"} · {fmtDateTime(selected.created_at)}
            </p>
            {pagePaths.length > 1 && (
              <div className="flex gap-1">
                {pagePaths.map((p, i) => (
                  <button
                    key={p}
                    onClick={() => setPageIdx(i)}
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      i === shownPage ? "bg-ink text-paper" : "border border-line"
                    }`}
                  >
                    صفحة {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {doc && doc.attachments.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium">صور مرفقة</p>
              <div className="grid grid-cols-4 gap-2">
                {doc.attachments.map((a) => (
                  <a
                    key={a.path}
                    href={extraUrls[a.path]}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square overflow-hidden rounded-lg border border-line bg-ivory"
                  >
                    {extraUrls[a.path] && (
                      <img src={extraUrls[a.path]} alt={a.name} className="size-full object-cover" />
                    )}
                  </a>
                ))}
              </div>
            </div>
          )}

          {doc && doc.links.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12px] font-medium">روابط</p>
              <ul className="space-y-1">
                {doc.links.map((l) => (
                  <li key={l.id}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-[12.5px] text-gold"
                      dir={l.title ? "rtl" : "ltr"}
                    >
                      {l.title || l.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sketches.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {sketches.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedId(s.id);
                    setPageIdx(0);
                  }}
                  className={`w-16 shrink-0 overflow-hidden rounded-md border bg-white ${
                    s.id === selected.id ? "border-gold ring-1 ring-gold" : "border-line"
                  }`}
                  title={s.caption ?? ""}
                >
                  {urls[s.storage_path] ? (
                    <img src={urls[s.storage_path]} alt={s.caption ?? ""} className="w-full" />
                  ) : (
                    <div className="aspect-[5/7]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {board && (
        <SketchBoard
          order={order}
          initial={board}
          onClose={() => setBoard(null)}
          onSave={async (result) => {
            await save.mutateAsync({ ...result, caption: `تصميم ${sketches.length + 1}` });
            toast.success("تم حفظ التصميم");
            setSelectedId(null);
            setPageIdx(0);
            setBoard(null);
          }}
        />
      )}
    </Card>
  );
}

function ModelValue({ modelId, fallback }: { modelId: string | null; fallback: string | null }) {
  const { data: model } = useModel(modelId ?? "");
  if (model) {
    return (
      <Link to="/models/$modelId" params={{ modelId: model.id }} className="text-gold hover:underline">
        {model.code} — {model.name}
      </Link>
    );
  }
  return <>{fallback || "—"}</>;
}

function ItemTypeValue({ id }: { id: string | null }) {
  useItemTypes();
  return <>{itemTypeLabel(id)}</>;
}

/** بطاقة الإيجار: إدخال الفستان المخزون بعد التسليم، والإرجاع ورد التأمين */
function RentalOrderCard({ order, canEdit }: { order: Order; canEdit: boolean }) {
  const { data: dresses = [] } = useDressesOfOrder(order.id);
  const { data: records = [] } = useRecordsOfOrder(order.id);
  useRentalStatuses();
  const deliver = useDeliverRentalOrder();
  const [dueDate, setDueDate] = useState("");
  const [deposit, setDeposit] = useState(String(Number(order.security_deposit) || ""));
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("cash");
  // نحفظ رقم العقد حتى تبقى نافذة الإيصال بعد الإرجاع
  const [retId, setRetId] = useState<string | null>(null);

  const dress = dresses[0] ?? null;
  const openRecord = records.find(isOutNow) ?? null;
  const lastRecord = records[0] ?? null;
  const isStock = order.order_kind === "rental_stock";
  const held = lastRecord ? rentalMoney(lastRecord) : null;

  return (
    <Card
      title={isStock ? "قطعة للمخزون" : "الإيجار والتأمين"}
      action={
        dress ? (
          <Chip tone={dressStatusTone(dress.status)}>{dressStatusLabel(dress.status)}</Chip>
        ) : undefined
      }
    >
      <dl className="divide-y divide-line text-[13px]">
        {!isStock && (
          <Row label="مبلغ التأمين" value={<span className="num">{money(order.security_deposit)}</span>} />
        )}
        {held && held.depositPaid > 0 && (
          <Row
            label="التأمين المقبوض"
            value={
              <span className="num">
                {money(held.depositPaid)}
                {lastRecord?.deposit_method ? ` · ${PAYMENT_METHOD_LABEL[lastRecord.deposit_method]}` : ""}
              </span>
            }
          />
        )}
        {held && held.depositRefunded > 0 && (
          <Row label="رُد للعميلة" value={<span className="num">{money(held.depositRefunded)}</span>} />
        )}
        {held && held.damage > 0 && (
          <Row label="خصم تلف" value={<span className="num text-late">{money(held.damage)}</span>} />
        )}
        <Row
          label="فستان المخزون"
          value={
            dress ? (
              <a className="text-gold" href={`/rentals/${dress.id}`}>
                {dress.code}
              </a>
            ) : (
              "لم يدخل المخزون بعد"
            )
          }
        />
        {openRecord && <Row label="موعد رجوع الفستان" value={fmtDate(openRecord.due_date)} />}
      </dl>

      {canEdit && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {!dress && (
            <>
              {!isStock && (
                <>
                  <Field label="موعد رجوع الفستان من العميلة">
                    <input
                      className="field"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="التأمين المقبوض عند التسليم"
                      hint="يدخل صندوق التأمينات — أمانة للعميلة"
                    >
                      <input
                        className="field"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={deposit}
                        onChange={(e) => setDeposit(e.target.value)}
                      />
                    </Field>
                    <MethodPicker value={depositMethod} onChange={setDepositMethod} />
                  </div>
                </>
              )}
              <Btn
                variant="gold"
                disabled={deliver.isPending}
                onClick={() =>
                  deliver
                    .mutateAsync({
                      orderId: order.id,
                      dueDate: dueDate || null,
                      ...(isStock
                        ? {}
                        : { depositPaid: Math.max(Number(deposit) || 0, 0), depositMethod }),
                    })
                    .then(() =>
                      toast.success(isStock ? "دخلت القطعة مخزون الإيجار" : "تم التسليم وسُجل خروج الفستان"),
                    )
                    .catch((err: Error) => toast.error(err.message))
                }
              >
                {isStock ? "إدخال القطعة للمخزون" : "تسليم العميلة وتسجيل الخروج"}
              </Btn>
            </>
          )}

          {openRecord && <Btn onClick={() => setRetId(openRecord.id)}>تسجيل إرجاع الفستان</Btn>}
        </div>
      )}

      {lastRecord && Number(lastRecord.deposit_paid) > 0 && (
        <div className="space-y-2 border-t border-line px-4 py-3 text-[12px]">
          <p className="text-muted-foreground">إيصالات التأمين للعميلة</p>
          <div className="flex flex-wrap gap-2">
            <DepositReceiptButton record={lastRecord} dress={dress} kind="received" className="min-h-9 px-3 text-[12px]" />
            {lastRecord.refund_voucher_no && (
              <DepositReceiptButton record={lastRecord} dress={dress} kind="refunded" className="min-h-9 px-3 text-[12px]" />
            )}
            {lastRecord.client_phone && (
              <WhatsAppButton size="sm" rental={{ record: lastRecord, dress }} />
            )}
          </div>
        </div>
      )}

      <ReturnSheet
        record={records.find((r) => r.id === retId) ?? null}
        dress={dress}
        onClose={() => setRetId(null)}
      />
    </Card>
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
  const { data: branches = [] } = useBranches();
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
                {r.branch_id && ` · ${branchLabel(branches, r.branch_id)}`}
              </span>
              {canEdit && reserved > 0 && (
                <div className="flex gap-2">
                  <Btn
                    variant="quiet"
                    disabled={issue.isPending}
                    onClick={() =>
                      issue.mutate(
                        { row: r, qty: reserved },
                        {
                          onSuccess: () => toast.success("انصرفت المادة على الطلب"),
                          onError: (err) =>
                            toast.error(err instanceof Error ? err.message : "تعذّر الصرف"),
                        },
                      )
                    }
                  >
                    صرف
                  </Btn>
                  <Btn
                    variant="quiet"
                    disabled={release.isPending}
                    onClick={() =>
                      release.mutate(r, {
                        onSuccess: () => toast.success("انفك الحجز"),
                        onError: (err) =>
                          toast.error(err instanceof Error ? err.message : "تعذّر فك الحجز"),
                      })
                    }
                  >
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
