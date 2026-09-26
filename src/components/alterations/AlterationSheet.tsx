import { Link, useNavigate } from "@tanstack/react-router";
import { Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ChecklistSheet } from "@/components/ChecklistSheet";
import { Btn, Chip, Empty, Field, Sheet } from "@/components/kit";
import { MethodPicker } from "@/components/RentalMoneySheets";
import { AlterationRequestSheet } from "@/components/alterations/AlterationRequestSheet";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDateTime, money } from "@/lib/atelier";
import {
  ALTERATION_STEPS,
  dueOf,
  fmtDay,
  historyOf,
  isOpen,
  isPrinted,
  itemsOf,
  sourceLabel,
  stepIndex,
  stepLabel,
  stepTone,
  stepWho,
  summaryOf,
} from "@/lib/alterations";
import {
  useAlteration,
  useAlterationAction,
  useCollectAlterationFee,
  useOrderAlterations,
  type AlterationAction,
} from "@/lib/alterations-data";
import { branchLabel, useBranches } from "@/lib/branches";
import { useOrder, useSignedUrls } from "@/lib/data";
import type { PaymentMethod } from "@/lib/finance";
import { cn } from "@/lib/utils";

/** تفاصيل التعديل ومساره: كل واحد يشوف زر خطوته حسب صلاحياته */
export function AlterationSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: alt, isLoading } = useAlteration(id);
  const { data: rounds = [] } = useOrderAlterations(alt?.order_id ?? "");
  const { data: branches = [] } = useBranches();
  const { can, userId } = useCurrentAccount();
  const act = useAlterationAction();
  const collect = useCollectAlterationFee();
  const navigate = useNavigate();
  const urls = useSignedUrls(alt?.sketch_path ? [alt.sketch_path] : []);

  const [note, setNote] = useState<string | null>(null);
  const [handover, setHandover] = useState<"send_workshop" | "send_branch" | null>(null);
  const [mode, setMode] = useState<"cancel" | "reject" | "fee" | "collect" | null>(null);
  const [text, setText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [nextRound, setNextRound] = useState(false);
  const { data: fullOrder } = useOrder(nextRound ? (alt?.order_id ?? "") : "");

  if (isLoading || !alt) {
    return (
      <Sheet open onClose={onClose} title="التعديل">
        <Empty>{isLoading ? "جاري التحميل…" : "التعديل غير موجود أو ما عندك صلاحية عليه."}</Empty>
      </Sheet>
    );
  }

  const order = alt.order;
  const items = itemsOf(alt);
  const parts = items.map((i) => i.part);
  const step = stepIndex(alt.step);
  const due = dueOf(alt.pickup_date);
  const open = isOpen(alt);
  const feeDue = alt.fee > 0 && !alt.fee_paid_at;
  // نطاق الفرع تتحقق منه قاعدة البيانات
  const canApprove = can("alterations.approve");
  const canBranch = can("alterations.request") || can("alterations.approve");
  const canWorkshop = can("alterations.workshop");
  const canCollect = can("payments.collect") || can("finance.payments");
  const canCancel =
    open &&
    !alt.fee_paid_at &&
    (can("alterations.review") ||
      (alt.step === "new" && (alt.created_by === userId || canApprove)));
  const canEditFee = open && !alt.fee_paid_at && (can("alterations.review") || canApprove);
  const supervisorNote = note ?? alt.supervisor_note ?? "";

  const run = (
    action: AlterationAction,
    extra: { note?: string; parts?: string[]; tailor?: string; fee?: number } = {},
    done?: string,
  ) =>
    act
      .mutateAsync({ id: alt.id, action, ...extra })
      .then(() => {
        if (done) toast.success(done);
        setMode(null);
        setText("");
      })
      .catch((err: Error) => toast.error(err.message));

  const title = `${order?.order_no ?? "طلب"} — ${order?.client_name ?? ""} · تعديل ${alt.number}`;

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{branchLabel(branches, alt.branch_id)}</Chip>
          <Chip>انطلب: {sourceLabel(alt)}</Chip>
          {open && (
            <Chip tone={due.tone}>
              استلام العميلة {fmtDay(alt.pickup_date)} — {due.text}
            </Chip>
          )}
          {order && (
            <Link
              to="/orders/$orderId"
              params={{ orderId: alt.order_id }}
              className="text-[13px] text-gold"
            >
              صفحة الطلب
            </Link>
          )}
          {isPrinted(alt) && (
            <Link
              to="/alterations/$alterationId/print"
              params={{ alterationId: alt.id }}
              className="ms-auto flex items-center gap-1 text-[13px] text-gold"
            >
              <Printer className="size-4" strokeWidth={1.75} /> كرت التشغيل
            </Link>
          )}
        </div>

        {alt.step === "cancelled" ? (
          <p className="rounded-xl bg-late/10 px-4 py-3 text-[13px] text-late">هذا التعديل ملغي.</p>
        ) : (
          <ol className="rounded-xl border border-line p-3">
            {ALTERATION_STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 py-1.5">
                <span
                  className={cn(
                    "num grid size-6 shrink-0 place-items-center rounded-full text-[11px]",
                    i < step || alt.step === "done"
                      ? "bg-ok text-paper"
                      : i === step
                        ? "bg-gold text-paper"
                        : "bg-goldsoft text-muted-foreground",
                  )}
                >
                  {i < step || alt.step === "done" ? "✓" : i + 1}
                </span>
                <span className={cn("flex-1 text-[13px]", i === step && "font-medium")}>
                  {s.label}
                </span>
                <span className="text-[11px] text-muted-foreground">{s.where}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">المطلوب</p>
          <ul className="divide-y divide-line text-[13px]">
            {items.map((i) => (
              <li key={i.part} className="px-4 py-2.5">
                <span className="font-medium">{i.part}</span>
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-foreground/85">
                  {i.points.map((p, k) => (
                    <li key={k}>{p}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {alt.sketch_path && urls[alt.sketch_path] && (
            <div className="border-t border-line p-3">
              <a href={urls[alt.sketch_path]} target="_blank" rel="noreferrer">
                <img
                  src={urls[alt.sketch_path]}
                  alt="رسمة التعديل"
                  className="w-full max-w-xs rounded-lg border border-line bg-white"
                />
              </a>
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="الرسوم">
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
              {alt.fee > 0 ? (
                <span>
                  {money(alt.fee)} —{" "}
                  <span className={alt.fee_paid_at ? "text-ok" : "text-late"}>
                    {alt.fee_paid_at ? "مدفوعة" : "غير مدفوعة"}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">بدون رسوم</span>
              )}
              <span className="flex gap-3">
                {feeDue && canCollect && alt.step !== "cancelled" && (
                  <button className="text-gold" onClick={() => setMode("collect")}>
                    تحصيل
                  </button>
                )}
                {canEditFee && (
                  <button
                    className="text-muted-foreground"
                    onClick={() => {
                      setText(alt.fee > 0 ? String(alt.fee) : "");
                      setMode("fee");
                    }}
                  >
                    تعديل
                  </button>
                )}
                {alt.fee_invoice_id && (
                  <Link
                    to="/goods/sales/$invoiceId"
                    params={{ invoiceId: alt.fee_invoice_id }}
                    className="flex items-center gap-1 text-gold"
                  >
                    <Receipt className="size-3.5" /> الفاتورة
                  </Link>
                )}
              </span>
            </div>
          </Field>
          <Field label="الخياط">
            <div className="flex min-h-11 items-center rounded-lg border border-line px-3 text-[13px]">
              {isPrinted(alt) && alt.tailor ? (
                alt.tailor
              ) : (
                <span className="text-muted-foreground">يتحدد عند طباعة كرت التشغيل</span>
              )}
            </div>
          </Field>
        </div>

        {mode === "collect" && (
          <div className="space-y-3 rounded-xl border border-gold/40 p-4">
            <p className="text-[13px]">
              تحصيل رسوم التعديل <span className="num font-medium">{money(alt.fee)}</span> — تطلع
              فاتورة شاملة الضريبة وسند قبض.
            </p>
            <MethodPicker value={method} onChange={setMethod} />
            <div className="grid grid-cols-2 gap-2">
              <Btn
                variant="gold"
                disabled={collect.isPending}
                onClick={() =>
                  collect
                    .mutateAsync({ id: alt.id, method })
                    .then((invoiceId) => {
                      toast.success("انحصّلت الرسوم");
                      setMode(null);
                      if (invoiceId)
                        void navigate({
                          to: "/goods/sales/$invoiceId",
                          params: { invoiceId },
                        });
                    })
                    .catch((err: Error) => toast.error(err.message))
                }
              >
                تحصيل وطباعة الفاتورة
              </Btn>
              <Btn variant="quiet" onClick={() => setMode(null)}>
                رجوع
              </Btn>
            </div>
          </div>
        )}

        {mode === "fee" && (
          <div className="space-y-3 rounded-xl border border-line p-4">
            <Field label="رسوم التعديل (شاملة الضريبة)" hint="صفر = بدون رسوم">
              <input
                type="number"
                min="0"
                inputMode="decimal"
                className="field w-full"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Btn
                disabled={act.isPending}
                onClick={() => run("set_fee", { fee: Number(text) || 0 }, "انحفظت الرسوم")}
              >
                حفظ
              </Btn>
              <Btn variant="quiet" onClick={() => setMode(null)}>
                رجوع
              </Btn>
            </div>
          </div>
        )}

        {/* الخطوة الحالية */}
        <div className="rounded-xl border border-gold/40 bg-goldsoft/20 p-4">
          {open && (
            <p className="mb-3 text-[12px] text-muted-foreground">
              الخطوة الجاية على:{" "}
              <span className="font-medium text-foreground">{stepWho(alt.step)}</span>
            </p>
          )}

          {alt.step === "new" && alt.admin_note && (
            <p className="mb-3 rounded-lg bg-late/10 px-3 py-2 text-[12.5px] text-late">
              رجّعته الإدارة: {alt.admin_note}
            </p>
          )}

          {alt.step === "new" && canApprove && (
            <>
              <Field label="تهميش مشرف الفرع">
                <textarea
                  className="field w-full"
                  rows={2}
                  value={supervisorNote}
                  placeholder="ملاحظاتك على التعديل للإدارة والمعمل"
                  onChange={(e) => setNote(e.target.value)}
                />
              </Field>
              <Btn
                className="mt-3 w-full"
                disabled={act.isPending}
                onClick={() => run("approve", { note: supervisorNote }, "انرسل للإدارة للمراجعة")}
              >
                تعميد وإرسال للإدارة
              </Btn>
            </>
          )}

          {alt.step === "review" && (
            <>
              <div className="mb-3 rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px]">
                <span className="text-muted-foreground">تهميش مشرف الفرع: </span>
                {alt.supervisor_note || "بدون ملاحظات"}
              </div>
              {can("alterations.review") && (
                <>
                  <Field label="ملاحظة الإدارة (اختيارية للاعتماد، لازمة للإرجاع)">
                    <textarea
                      className="field w-full"
                      rows={2}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </Field>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Btn
                      disabled={act.isPending}
                      onClick={() =>
                        run("review_ok", { note: text }, "اعتمدته الإدارة — جاهز للإرسال للمعمل")
                      }
                    >
                      اعتماد الإدارة
                    </Btn>
                    <Btn
                      variant="quiet"
                      disabled={act.isPending}
                      onClick={() => {
                        if (!text.trim()) {
                          toast.error("اكتب سبب الإرجاع للمشرف");
                          return;
                        }
                        void run("review_back", { note: text }, "رجع لمشرف الفرع");
                      }}
                    >
                      إرجاع للمشرف
                    </Btn>
                  </div>
                </>
              )}
            </>
          )}

          {alt.step === "approved" && canApprove && (
            <Btn className="w-full" onClick={() => setHandover("send_workshop")}>
              إرسال للمعمل بقائمة القطع
            </Btn>
          )}

          {alt.step === "to_workshop" && canWorkshop && (
            <Btn
              className="w-full"
              disabled={act.isPending}
              onClick={() =>
                act
                  .mutateAsync({ id: alt.id, action: "receive_workshop" })
                  .then(() =>
                    navigate({
                      to: "/alterations/$alterationId/print",
                      params: { alterationId: alt.id },
                    }),
                  )
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              <Printer className="size-4" strokeWidth={1.75} /> استلام المعمل وطباعة كرت التشغيل
            </Btn>
          )}

          {alt.step === "queued" && canWorkshop && (
            <Btn
              className="w-full"
              disabled={act.isPending}
              onClick={() => run("start", {}, "بدأ التنفيذ")}
            >
              بدء التنفيذ{alt.tailor ? ` — ${alt.tailor}` : ""}
            </Btn>
          )}

          {alt.step === "in_progress" && canWorkshop && (
            <Btn className="w-full" onClick={() => setHandover("send_branch")}>
              جاهز — إرسال للفرع بقائمة القطع
            </Btn>
          )}

          {alt.step === "to_branch" && canBranch && (
            <Btn
              className="w-full"
              disabled={act.isPending}
              onClick={() => run("receive_branch", {}, "وصل الفرع — جاهز للتجربة")}
            >
              استلام الفرع
            </Btn>
          )}

          {alt.step === "at_branch" && canBranch && mode !== "reject" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Btn
                variant="gold"
                disabled={act.isPending}
                onClick={() => {
                  if (feeDue) {
                    toast.error("حصّل رسوم التعديل أول");
                    return;
                  }
                  void run("accept", {}, "انتهى التعديل — العميلة قبلته");
                }}
              >
                العميلة قبلت
              </Btn>
              <Btn
                variant="quiet"
                onClick={() => {
                  setText("");
                  setMode("reject");
                }}
              >
                ما قبلت — تعديل جديد
              </Btn>
            </div>
          )}

          {alt.step === "at_branch" && mode === "reject" && (
            <div className="space-y-3">
              <Field label="وش ما عجبها؟ (اختياري)">
                <textarea
                  className="field w-full"
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Btn
                  disabled={act.isPending}
                  onClick={() =>
                    act
                      .mutateAsync({ id: alt.id, action: "reject", note: text })
                      .then(() => {
                        setMode(null);
                        setNextRound(true);
                      })
                      .catch((err: Error) => toast.error(err.message))
                  }
                >
                  إنهاء وفتح تعديل جديد
                </Btn>
                <Btn variant="quiet" onClick={() => setMode(null)}>
                  رجوع
                </Btn>
              </div>
            </div>
          )}

          {alt.step === "done" && (
            <p className="text-center text-[13px] text-muted-foreground">{stepLabel(alt)}.</p>
          )}
          {alt.step === "cancelled" && (
            <p className="text-center text-[13px] text-muted-foreground">التعديل ملغي.</p>
          )}

          {alt.step !== "new" &&
            alt.step !== "review" &&
            (alt.supervisor_note || alt.admin_note) && (
              <div className="mt-3 space-y-1 text-[12.5px] text-muted-foreground">
                {alt.supervisor_note && <p>تهميش المشرف: {alt.supervisor_note}</p>}
                {alt.admin_note && <p>ملاحظة الإدارة: {alt.admin_note}</p>}
              </div>
            )}
        </div>

        {canCancel && mode !== "cancel" && (
          <button
            className="text-[12.5px] text-late"
            onClick={() => {
              setText("");
              setMode("cancel");
            }}
          >
            إلغاء التعديل
          </button>
        )}
        {mode === "cancel" && (
          <div className="space-y-3 rounded-xl border border-late/40 p-4">
            <Field label="سبب الإلغاء">
              <textarea
                className="field w-full"
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Btn
                variant="quiet"
                className="text-late"
                disabled={act.isPending}
                onClick={() => {
                  if (!text.trim()) {
                    toast.error("اكتب سبب الإلغاء");
                    return;
                  }
                  void run("cancel", { note: text }, "انلغى التعديل");
                }}
              >
                تأكيد الإلغاء
              </Btn>
              <Btn variant="quiet" onClick={() => setMode(null)}>
                رجوع
              </Btn>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-line">
          <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">السجل</p>
          <ul className="divide-y divide-line text-[12.5px]">
            {historyOf(alt).map((h, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2">
                <span>
                  {h.text}
                  {h.name && <span className="text-muted-foreground"> — {h.name}</span>}
                </span>
                <span className="shrink-0 text-muted-foreground">{fmtDateTime(h.at)}</span>
              </li>
            ))}
          </ul>
        </div>

        {rounds.length > 1 && (
          <div className="rounded-xl border border-line">
            <p className="border-b border-line px-4 py-2.5 text-[13px] font-medium">
              كل تعديلات الطلب {order?.order_no}
            </p>
            <ul className="divide-y divide-line text-[12.5px]">
              {rounds.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex justify-between gap-3 px-4 py-2",
                    r.id === alt.id && "bg-goldsoft/20",
                  )}
                >
                  <span className="min-w-0 truncate">
                    تعديل {r.number} · {sourceLabel(r)} · {summaryOf(r)}
                  </span>
                  <Chip tone={stepTone(r)}>{stepLabel(r)}</Chip>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {handover && (
        <ChecklistSheet
          title={handover === "send_workshop" ? "إرسال التعديل للمعمل" : "إرسال التعديل للفرع"}
          hint="أشّر على كل قطعة وأنت تجهّزها للإرسال."
          groups={[
            {
              key: alt.id,
              title: `${order?.order_no ?? ""} — ${order?.client_name ?? ""}`,
              items: parts,
            },
          ]}
          okLabel="إرسال"
          partialLabel="إرسال مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إنه ما انرسل:"
          requireEach
          pending={act.isPending}
          onClose={() => setHandover(null)}
          onConfirm={(checked) =>
            act
              .mutateAsync({ id: alt.id, action: handover, parts: checked[alt.id] ?? [] })
              .then(() => {
                toast.success(handover === "send_workshop" ? "انرسل للمعمل" : "انرسل للفرع");
                setHandover(null);
              })
              .catch((err: Error) => toast.error(err.message))
          }
        />
      )}

      {nextRound && fullOrder && (
        <AlterationRequestSheet
          order={fullOrder}
          round={Math.max(alt.number, ...rounds.map((r) => r.number)) + 1}
          onClose={() => {
            setNextRound(false);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}
