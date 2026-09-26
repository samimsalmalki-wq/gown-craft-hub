import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ImagePlus, Pencil, Shirt } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { DressFormSheet } from "@/components/DressFormSheet";
import { RentalCalendar } from "@/components/RentalCalendar";
import {
  CancelDecisionSheet,
  CancelRequestSheet,
  DeliverSheet,
  DepositReceiptButton,
  ReturnSheet,
} from "@/components/RentalMoneySheets";
import { RentalDetailsSheet } from "@/components/RentalDetailsSheet";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import { PAYMENT_METHOD_LABEL } from "@/lib/finance";
import {
  dressStatusLabel,
  dressStatusTone,
  effectiveDressStatus,
  hasRentalDetails,
  isBookableStatus,
  isOutNow,
  isPickupOverdue,
  isRentalLate,
  isUpcomingRental,
  manualStatusList,
  rentalMoney,
  returnConditionLabel,
  type RentalRecord,
} from "@/lib/inventory";
import {
  useInventoryUrls,
  useRentalDress,
  useRentalRecords,
  useRentalStatuses,
  useSetDressStatus,
  useUpdateRentalBooking,
} from "@/lib/inventory-data";

export const Route = createFileRoute("/_authenticated/rentals/$dressId")({
  validateSearch: (search: Record<string, unknown>): { deliver?: string | undefined } => {
    const deliver = search["deliver"];
    return { deliver: typeof deliver === "string" && deliver ? deliver : undefined };
  },
  head: () => ({
    meta: [
      { title: "فستان إيجار · مَعْمَل" },
      { name: "description", content: "حالة الفستان وسجل إيجاراته ومواعيد الخروج والإرجاع." },
      { property: "og:title", content: "فستان إيجار · مَعْمَل" },
      {
        property: "og:description",
        content: "حالة الفستان وسجل إيجاراته ومواعيد الخروج والإرجاع.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DressPage,
});

type SheetKind =
  "deliver" | "return" | "cancel-request" | "cancel-decision" | "fitting" | "details";

function DressPage() {
  const { dressId } = Route.useParams();
  const { deliver } = Route.useSearch();
  const navigate = useNavigate();
  const { can } = useCurrentAccount();
  useRentalStatuses(); // يحمّل أسماء الحالات وألوانها من الإعدادات
  const isManager = can("rentals.manage");
  const canDecideCancel = can("rentals.cancel");
  const { data: dress, isLoading } = useRentalDress(dressId);
  const { data: records = [] } = useRentalRecords(dressId);
  const setStatus = useSetDressStatus();

  const urls = useInventoryUrls([dress?.image_path]);
  const image = dress?.image_path ? urls[dress.image_path] : undefined;

  const openRecord = records.find(isOutNow) ?? null;
  const nextUpcoming =
    [...records].filter(isUpcomingRental).sort((a, b) => a.out_date.localeCompare(b.out_date))[0] ??
    null;
  const effStatus = dress ? effectiveDressStatus(dress, records) : "available";
  const wentOut = records.filter((r) => r.delivered_at && !r.cancelled_at);
  const income =
    wentOut.reduce((sum, r) => sum + Number(r.amount), 0) +
    records.reduce((sum, r) => sum + Number(r.cancel_kept), 0);

  const [editOpen, setEditOpen] = useState(false);
  const [sheet, setSheet] = useState<{ kind: SheetKind; id: string } | null>(null);

  const sheetRecord = (kind: SheetKind) =>
    sheet?.kind === kind ? (records.find((r) => r.id === sheet.id) ?? null) : null;
  const closeSheet = () => setSheet(null);

  // بعد الحجز من صفحة الحجز والخروج اليوم: تنفتح نافذة التسليم مباشرة
  useEffect(() => {
    if (!deliver || !records.some((r) => r.id === deliver)) return;
    setSheet({ kind: "deliver", id: deliver });
    void navigate({ to: "/rentals/$dressId", params: { dressId }, search: {}, replace: true });
  }, [deliver, records, dressId, navigate]);

  if (isLoading) {
    return (
      <AppShell title="فستان الإيجار">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }
  if (!dress) {
    return (
      <AppShell title="فستان الإيجار">
        <Empty>هذا الفستان غير موجود.</Empty>
      </AppShell>
    );
  }

  const canBook = isManager && isBookableStatus(effStatus);
  /** صفحة الحجز الكاملة (من يوم محدد في التقويم) */
  const openBooking = (day?: string) =>
    void navigate({
      to: "/rentals/$dressId/book",
      params: { dressId },
      search: day ? { day } : {},
    });

  const specs = [
    { label: "المقاس", value: dress.size },
    { label: "اللون", value: dress.color },
    { label: "رقم الموديل", value: dress.model_no },
  ];

  /** أزرار العقد حسب حالته وصلاحيات الموظف */
  const recordActions = (r: RentalRecord) => {
    if (!isManager || r.cancelled_at || r.returned_at) return null;
    const small = "min-h-9 px-3 text-[12px]";
    if (isOutNow(r)) {
      return (
        <Btn className={small} onClick={() => setSheet({ kind: "return", id: r.id })}>
          تسجيل الإرجاع
        </Btn>
      );
    }
    return (
      <>
        {!r.cancel_requested_at && (
          <Btn
            variant="gold"
            className={small}
            onClick={() => setSheet({ kind: "deliver", id: r.id })}
          >
            تسليم للعميلة
          </Btn>
        )}
        <Btn
          variant="quiet"
          className={small}
          onClick={() => setSheet({ kind: "fitting", id: r.id })}
        >
          {r.fitting_date ? "تعديل البروفة" : "إضافة بروفة"}
        </Btn>
        {canDecideCancel ? (
          <Btn
            variant="quiet"
            className={small}
            onClick={() => setSheet({ kind: "cancel-decision", id: r.id })}
          >
            {r.cancel_requested_at ? "قرار الإلغاء" : "إلغاء الحجز"}
          </Btn>
        ) : (
          !r.cancel_requested_at && (
            <Btn
              variant="quiet"
              className={small}
              onClick={() => setSheet({ kind: "cancel-request", id: r.id })}
            >
              طلب إلغاء
            </Btn>
          )
        )}
      </>
    );
  };

  return (
    <AppShell
      eyebrow="فساتين الإيجار"
      title={`فستان ${dress.code}`}
      subtitle={
        [dress.model_no, dress.color, dress.size].filter(Boolean).join(" · ") || "فستان إيجار"
      }
      actions={
        <>
          {(openRecord ?? nextUpcoming) && (
            <WhatsAppButton rental={{ record: (openRecord ?? nextUpcoming)!, dress }} />
          )}
          {isManager ? (
            openRecord ? (
              <Btn onClick={() => setSheet({ kind: "return", id: openRecord.id })}>
                تسجيل الإرجاع
              </Btn>
            ) : (
              <Btn onClick={() => openBooking()} disabled={!canBook}>
                حجز الفستان
              </Btn>
            )
          ) : null}
          {isManager && (
            <Btn variant="quiet" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              تعديل البيانات
            </Btn>
          )}
          {isManager && (
            <Link
              to="/orders/new"
              search={{ kind: "rental_stock", model: dress.model_no ?? undefined }}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-paper px-4 text-sm font-medium"
            >
              طلب إنتاج قطعة بديلة
            </Link>
          )}
        </>
      }
    >
      <Link to="/rentals" className="mb-4 inline-block text-[13px] text-muted-foreground">
        ← رجوع لفساتين الإيجار
      </Link>

      <div className="grid gap-5 md:grid-cols-[260px_1fr] lg:grid-cols-[340px_1fr]">
        <div className="overflow-hidden rounded-xl border border-line bg-paper">
          {image ? (
            <a href={image} target="_blank" rel="noreferrer" className="block">
              <img src={image} alt={dress.code} className="aspect-[3/4] w-full object-cover" />
            </a>
          ) : isManager ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="grid aspect-[3/4] w-full place-items-center bg-ivory text-muted-foreground hover:text-foreground"
            >
              <span className="flex flex-col items-center gap-2 text-[13px]">
                <ImagePlus className="size-8" strokeWidth={1.4} />
                إضافة صورة الفستان
              </span>
            </button>
          ) : (
            <div className="grid aspect-[3/4] w-full place-items-center bg-ivory text-muted-foreground/50">
              <Shirt className="size-12" strokeWidth={1.2} />
            </div>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <span className="num text-[20px] font-medium text-gold">{dress.code}</span>
              <Chip tone={dressStatusTone(effStatus)}>{dressStatusLabel(effStatus)}</Chip>
            </div>

            <div className="grid grid-cols-2 divide-x divide-x-reverse divide-line border-b border-line sm:grid-cols-4">
              <Figure label="قيمة الإيجار" value={money(Number(dress.rent_price))} />
              <Figure label="مبلغ التأمين" value={money(Number(dress.deposit_amount))} />
              <Figure label="مرات الإيجار" value={wentOut.length.toLocaleString("ar-EG")} />
              <Figure label="دخل الإيجار" value={money(income)} />
            </div>

            <dl className="grid grid-cols-3 divide-x divide-x-reverse divide-line">
              {specs.map((s) => (
                <div key={s.label} className="px-4 py-3">
                  <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
                  <dd className="mt-0.5 truncate text-[14px]">{s.value || "—"}</dd>
                </div>
              ))}
            </dl>

            {dress.notes && (
              <p className="border-t border-line px-4 py-3 text-[13px] whitespace-pre-wrap">
                {dress.notes}
              </p>
            )}
          </Card>

          {(openRecord ?? nextUpcoming) && (
            <div className="space-y-2">
              {openRecord && (
                <NowBox
                  tone={isRentalLate(openRecord) ? "late" : "gold"}
                  title={`الفستان الآن مع ${openRecord.client_name}`}
                  line={`تسلّمته ${fmtDate(openRecord.delivered_at)} · الإرجاع ${fmtDate(openRecord.due_date)}`}
                  money={openRecord}
                />
              )}
              {nextUpcoming && (
                <NowBox
                  tone={nextUpcoming.cancel_requested_at || isPickupOverdue(nextUpcoming) ? "late" : "soon"}
                  title={`حجز قادم لـ${nextUpcoming.client_name}`}
                  line={`من ${fmtDate(nextUpcoming.out_date)} إلى ${fmtDate(nextUpcoming.due_date)}${
                    nextUpcoming.fitting_date ? ` · بروفة ${fmtDate(nextUpcoming.fitting_date)}` : ""
                  }${
                    nextUpcoming.cancel_requested_at
                      ? " · طلب إلغاء بانتظار القرار"
                      : isPickupOverdue(nextUpcoming)
                        ? " · فات موعد الاستلام"
                        : ""
                  }`}
                  money={nextUpcoming}
                  actions={recordActions(nextUpcoming)}
                />
              )}
            </div>
          )}

          {isManager && !openRecord && (
            <Card
              title="حالة الفستان في المحل"
              action={
                can("catalog.manage") ? (
                  <Link to="/settings/rental-statuses" className="text-[12px] text-gold">
                    تعديل الحالات
                  </Link>
                ) : undefined
              }
            >
              <div className="flex flex-wrap gap-2 px-4 py-3">
                {manualStatusList().map((s) => (
                  <Btn
                    key={s.key}
                    variant={effStatus === s.key ? "gold" : "quiet"}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate(
                        { id: dress.id, status: s.key },
                        { onError: (e) => toast.error(e.message) },
                      )
                    }
                  >
                    {s.label}
                  </Btn>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card title="تقويم الحجوزات">
          <RentalCalendar records={records} onPickDay={canBook ? openBooking : undefined} />
        </Card>

        <Card title={`سجل الإيجارات (${records.length.toLocaleString("ar-EG")})`}>
          {records.length === 0 ? (
            <Empty>لا توجد إيجارات مسجلة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {records.map((r) => {
                const condition = returnConditionLabel(r.return_condition);
                const actions = recordActions(r);
                return (
                  <li key={r.id} className="px-4 py-3.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[14px] font-medium">{r.client_name}</span>
                      {r.client_phone && (
                        <a
                          href={`tel:${r.client_phone}`}
                          className="num text-[12px] text-muted-foreground"
                          dir="ltr"
                        >
                          {r.client_phone}
                        </a>
                      )}
                      <span className="mr-auto">
                        <RecordChip record={r} />
                      </span>
                    </div>

                    <p className="mt-1.5 text-[12px] text-muted-foreground">
                      {r.delivered_at
                        ? `تسلّمته ${fmtDate(r.delivered_at)}`
                        : `الخروج ${fmtDate(r.out_date)}`}{" "}
                      · موعد الإرجاع {fmtDate(r.due_date)}
                      {r.returned_at ? ` · رجع ${fmtDate(r.returned_at)}` : ""}
                      {r.cancelled_at ? ` · أُلغي ${fmtDate(r.cancelled_at)}` : ""}
                    </p>
                    {(r.external_invoice_no || r.fitting_date) && (
                      <p className="mt-1 text-[12px]">
                        {r.external_invoice_no && (
                          <span>
                            فاتورة{" "}
                            <span className="num" dir="ltr">
                              {r.external_invoice_no}
                            </span>
                          </span>
                        )}
                        {r.external_invoice_no && r.fitting_date && " · "}
                        {r.fitting_date && (
                          <span className="text-gold">بروفة {fmtDate(r.fitting_date)}</span>
                        )}
                      </p>
                    )}

                    {(r.event_date || r.fitting2_date) && (
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        {[
                          r.event_date && `المناسبة ${fmtDate(r.event_date)}`,
                          r.fitting2_date && `بروفة ثانية ${fmtDate(r.fitting2_date)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}

                    <RecordMoney record={r} />

                    {(condition || r.order_id) && (
                      <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
                        {condition && (
                          <span
                            className={
                              r.return_condition === "ok" || r.return_condition === "available"
                                ? "rounded-md bg-ok/10 px-2 py-1 text-ok"
                                : "rounded-md bg-soon/15 px-2 py-1 text-soon"
                            }
                          >
                            {condition}
                          </span>
                        )}
                        {r.order_id && (
                          <Link
                            to="/orders/$orderId"
                            params={{ orderId: r.order_id }}
                            className="rounded-md border border-line px-2 py-1 text-gold"
                          >
                            الطلب المرتبط
                          </Link>
                        )}
                      </div>
                    )}

                    {r.cancel_reason && !r.cancelled_at && (
                      <p className="mt-2 text-[12px] text-late">سبب طلب الإلغاء: {r.cancel_reason}</p>
                    )}
                    {r.notes && <p className="mt-2 text-[12px] whitespace-pre-wrap">{r.notes}</p>}
                    {(actions ||
                      r.client_phone ||
                      Number(r.deposit_paid) > 0 ||
                      hasRentalDetails(r) ||
                      isManager) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {actions}
                        {(hasRentalDetails(r) ||
                          (isManager && !r.cancelled_at && !r.returned_at)) && (
                          <Btn
                            variant="quiet"
                            className="min-h-9 px-3 text-[12px]"
                            onClick={() => setSheet({ kind: "details", id: r.id })}
                          >
                            المقاسات والرسمة
                          </Btn>
                        )}
                        {Number(r.deposit_paid) > 0 && (
                          <DepositReceiptButton record={r} dress={dress} kind="received" className="min-h-9 px-3 text-[12px]" />
                        )}
                        {r.refund_voucher_no && (
                          <DepositReceiptButton record={r} dress={dress} kind="refunded" className="min-h-9 px-3 text-[12px]" />
                        )}
                        {r.client_phone && <WhatsAppButton size="sm" rental={{ record: r, dress }} />}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <DressFormSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        dress={dress}
        imageUrl={image}
      />

      <DeliverSheet record={sheetRecord("deliver")} dress={dress} onClose={closeSheet} />
      <ReturnSheet record={sheetRecord("return")} dress={dress} onClose={closeSheet} />
      <FittingSheet record={sheetRecord("fitting")} onClose={closeSheet} />
      <RentalDetailsSheet
        record={sheetRecord("details")}
        dress={dress}
        canEdit={isManager}
        onClose={closeSheet}
      />
      <CancelRequestSheet record={sheetRecord("cancel-request")} onClose={closeSheet} />
      <CancelDecisionSheet record={sheetRecord("cancel-decision")} onClose={closeSheet} />
    </AppShell>
  );
}

/** موعد بروفة الحجز: إضافة أو تعديل أو إلغاء */
function FittingSheet({ record, onClose }: { record: RentalRecord | null; onClose: () => void }) {
  const update = useUpdateRentalBooking();
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDate(record?.fitting_date ?? "");
    setErr(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  if (!record) return null;

  const save = (value: string | null) => {
    setErr(null);
    if (value && value > record.out_date) {
      setErr("موعد البروفة لازم يكون قبل موعد الخروج أو في نفس اليوم.");
      return;
    }
    update
      .mutateAsync({ id: record.id, patch: { fitting_date: value } })
      .then(() => {
        toast.success(value ? "تم حفظ موعد البروفة" : "أُلغي موعد البروفة");
        onClose();
      })
      .catch((e: Error) => setErr(e.message));
  };

  return (
    <Sheet open onClose={onClose} title={"موعد بروفة " + record.client_name}>
      <div className="space-y-4 p-4">
        {err && <p className="rounded-lg bg-late/10 px-3 py-2 text-[13px] text-late">{err}</p>}
        <Field label="موعد البروفة" hint={"قبل موعد الخروج " + fmtDate(record.out_date)}>
          <input
            type="date"
            className="field w-full"
            max={record.out_date}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Btn variant="gold" disabled={!date || update.isPending} onClick={() => save(date)}>
            حفظ الموعد
          </Btn>
          {record.fitting_date && (
            <Btn variant="quiet" disabled={update.isPending} onClick={() => save(null)}>
              ما تحتاج بروفة
            </Btn>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function RecordChip({ record: r }: { record: RentalRecord }) {
  if (r.cancelled_at) return <Chip>ملغي</Chip>;
  if (r.returned_at) return <Chip tone="ok">تم الإرجاع</Chip>;
  if (isOutNow(r)) {
    return isRentalLate(r) ? (
      <Chip tone="late">{dressStatusLabel("late_return")}</Chip>
    ) : (
      <Chip tone="gold">{dressStatusLabel("rented")}</Chip>
    );
  }
  if (r.cancel_requested_at) return <Chip tone="late">طلب إلغاء بانتظار القرار</Chip>;
  if (isPickupOverdue(r)) return <Chip tone="late">فات موعد الاستلام</Chip>;
  return <Chip tone="soon">حجز قادم</Chip>;
}

/** مبالغ العقد: الإيجار والمدفوع والمتبقي، والتأمين وما رُد منه، ونتيجة الإلغاء */
function RecordMoney({ record: r }: { record: RentalRecord }) {
  const m = rentalMoney(r);
  const method = r.deposit_method ? ` · ${PAYMENT_METHOD_LABEL[r.deposit_method]}` : "";

  if (r.cancelled_at) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
        <Amount label="دفعت" value={money(m.paid)} />
        <Amount label="رجع لها" value={money(Number(r.cancel_refund))} />
        <Amount label="بقي للمحل" value={money(Number(r.cancel_kept))} />
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[12px]">
      {r.order_id ? (
        <Amount label="الإيجار" value="مسجّل على الطلب" />
      ) : (
        <Amount label="الإيجار" value={money(m.rent)} />
      )}
      {m.tracked && <Amount label="المدفوع" value={money(m.paid)} />}
      {m.remaining > 0 && <Amount label="المتبقي" value={money(m.remaining)} late />}
      {m.depositPaid > 0 ? (
        <Amount label="التأمين المقبوض" value={`${money(m.depositPaid)}${method}`} />
      ) : (
        !r.delivered_at &&
        Number(r.deposit_amount) > 0 && (
          <Amount label="التأمين عند التسليم" value={money(Number(r.deposit_amount))} />
        )
      )}
      {m.depositRefunded > 0 && <Amount label="رُد للعميلة" value={money(m.depositRefunded)} />}
      {m.damage > 0 && <Amount label="خصم تلف" value={money(m.damage)} late />}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="num mt-0.5 text-[16px]">{value}</p>
    </div>
  );
}

function NowBox({
  tone,
  title,
  line,
  money: record,
  actions,
}: {
  tone: "gold" | "late" | "soon";
  title: string;
  line: string;
  money?: RentalRecord;
  actions?: React.ReactNode;
}) {
  const cls = {
    gold: "border-gold/30 bg-gold/8",
    late: "border-late/30 bg-late/8",
    soon: "border-soon/30 bg-soon/10",
  }[tone];
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <p className="text-[14px] font-medium">{title}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{line}</p>
      {record && <RecordMoney record={record} />}
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function Amount({ label, value, late }: { label: string; value: string; late?: boolean }) {
  return (
    <span
      className={
        late ? "rounded-md bg-late/10 px-2 py-1 text-late" : "rounded-md bg-paper/70 px-2 py-1 ring-1 ring-line"
      }
    >
      <span className="text-muted-foreground">{label} </span>
      <span className="num">{value}</span>
    </span>
  );
}
