import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Shirt } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { MethodPicker } from "@/components/RentalMoneySheets";
import { MeasureChips } from "@/components/RentalDetailsSheet";
import { SketchBoard } from "@/components/SketchBoard";
import { Btn, Card, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, money } from "@/lib/atelier";
import type { PaymentMethod } from "@/lib/finance";
import { effectiveDressStatus, findRentalClash, isBookableStatus, localDay } from "@/lib/inventory";
import {
  useBookRental,
  useInventoryUrls,
  useRentalDress,
  useRentalRecords,
  useRentalStatuses,
  useSaveRentalDetails,
} from "@/lib/inventory-data";
import { emptySketch } from "@/lib/sketch";
import { RENTAL_SKETCH_BUCKET, type SketchResult } from "@/lib/sketch-data";

/**
 * حجز فستان الإيجار بنفس نموذج الطلب الجديد:
 * بيانات العميلة، والمالية، والمواعيد (بروفتين وتاريخ المناسبة)، والمقاسات ولوحة الرسم.
 */
export const Route = createFileRoute("/_authenticated/rentals/$dressId_/book")({
  validateSearch: (search: Record<string, unknown>): { day?: string | undefined } => {
    const day = search["day"];
    return { day: typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined };
  },
  head: () => ({ meta: [{ title: "حجز فستان إيجار · مَعْمَل" }] }),
  component: BookRentalPage,
});

function BookRentalPage() {
  const { dressId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { can, ready } = useCurrentAccount();
  useRentalStatuses();
  const { data: dress, isLoading } = useRentalDress(dressId);
  const { data: records = [] } = useRentalRecords(dressId);
  const book = useBookRental();
  const saveDetails = useSaveRentalDetails();
  const urls = useInventoryUrls([dress?.image_path]);
  const image = dress?.image_path ? urls[dress.image_path] : undefined;

  const start = search.day && search.day >= localDay() ? search.day : localDay();
  const [form, setForm] = useState({
    invoice_no: "",
    client_name: "",
    client_phone: "",
    notes: "",
    amount: "",
    deposit_amount: "",
    paid: "",
    fitting1_date: "",
    fitting2_date: "",
    out_date: start,
    due_date: start,
    event_date: "",
  });
  const [secondFitting, setSecondFitting] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  // المقاسات تُكتب داخل لوحة الرسم (الثابتة + المضافة باسمها)
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [sketch, setSketch] = useState<{ result: SketchResult; url: string } | null>(null);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // تنظيف رابط معاينة الرسمة
  useEffect(
    () => () => {
      if (sketch) URL.revokeObjectURL(sketch.url);
    },
    [sketch],
  );

  if (isLoading) {
    return (
      <AppShell title="حجز فستان إيجار">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }
  if (!dress) {
    return (
      <AppShell title="حجز فستان إيجار">
        <Empty>هذا الفستان غير موجود.</Empty>
      </AppShell>
    );
  }
  if (ready && !can("rentals.manage")) {
    return (
      <AppShell title="حجز فستان إيجار">
        <Empty>حجز فساتين الإيجار غير متاح لحسابك.</Empty>
      </AppShell>
    );
  }
  const status = effectiveDressStatus(dress, records);
  if (!isBookableStatus(status)) {
    return (
      <AppShell title={`حجز فستان ${dress.code}`}>
        <Empty>الفستان غير متاح للحجز الحين.</Empty>
      </AppShell>
    );
  }

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const rent = Number(form.amount) || Number(dress.rent_price);
  const paidNow = Math.max(Number(form.paid) || 0, 0);
  const filled = Object.fromEntries(Object.entries(measures).filter(([, v]) => v.trim() !== ""));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dress) return;
    const f1 = form.fitting1_date;
    const f2 = secondFitting ? form.fitting2_date : "";
    const clash = findRentalClash(records, form.out_date, form.due_date);
    const problem = !form.client_name.trim()
      ? "اكتب اسم العميلة"
      : form.due_date < form.out_date
        ? "تاريخ الإرجاع لا يمكن أن يكون قبل تاريخ الخروج."
        : paidNow > rent
          ? "العربون أكبر من قيمة الإيجار."
          : f1 && f1 > form.out_date
            ? "البروفة الأولى لازم تكون قبل موعد الخروج أو في نفس اليوم."
            : f2 && !f1
              ? "حدد البروفة الأولى قبل الثانية."
              : f2 && (f2 < f1 || f2 > form.out_date)
                ? "البروفة الثانية لازم تكون بعد الأولى وقبل موعد الخروج."
                : clash
                  ? `الفستان محجوز من ${fmtDate(clash.out_date)} إلى ${fmtDate(clash.due_date)} لـ${clash.client_name}.`
                  : null;
    if (problem) {
      toast.error(problem);
      return;
    }

    setBusy(true);
    let id: string;
    try {
      id = await book.mutateAsync({
        dressId,
        clientName: form.client_name.trim(),
        clientPhone: form.client_phone.trim() || null,
        outDate: form.out_date,
        dueDate: form.due_date,
        amount: rent,
        depositAmount: Number(form.deposit_amount) || Number(dress.deposit_amount),
        notes: form.notes.trim() || null,
        paid: paidNow,
        method,
        invoiceNo: form.invoice_no.trim() || null,
        fittingDate: f1 || null,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تسجيل الحجز.");
      setBusy(false);
      return;
    }

    // المقاسات والرسمة وباقي المواعيد بعد إنشاء الحجز
    if (Object.keys(filled).length || sketch || f2 || form.event_date) {
      try {
        await saveDetails.mutateAsync({
          recordId: id,
          dressId,
          measurements: filled,
          sketch: sketch?.result ?? null,
          fitting2Date: f2 || null,
          eventDate: form.event_date || null,
        });
      } catch {
        toast.error("تم الحجز لكن تعذّر حفظ المقاسات أو الرسمة — أضفها من سجل الإيجارات");
      }
    }

    setBusy(false);
    toast.success(paidNow > 0 ? "تم الحجز وتسجيل العربون" : "تم الحجز");
    // الخروج اليوم: ننتقل مباشرة للتسليم
    void navigate({
      to: "/rentals/$dressId",
      params: { dressId },
      search: form.out_date <= localDay() ? { deliver: id } : {},
    });
  }

  return (
    <AppShell
      eyebrow="فساتين الإيجار"
      title={`حجز فستان ${dress.code}`}
      subtitle="الفستان يبقى في المحل كحجز قادم، ويصير «مؤجَّر» لما تضغط «تسليم للعميلة» يوم الاستلام."
    >
      <Link
        to="/rentals/$dressId"
        params={{ dressId }}
        className="mb-4 inline-block text-[13px] text-muted-foreground"
      >
        ← رجوع للفستان
      </Link>

      <form onSubmit={submit} className="grid max-w-3xl gap-5">
        <Card title="الفستان">
          <div className="flex items-center gap-4 px-4 py-4">
            <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-ivory">
              {image ? (
                <img src={image} alt={dress.code} className="size-full object-cover" />
              ) : (
                <Shirt className="size-8 text-muted-foreground/50" strokeWidth={1.2} />
              )}
            </div>
            <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-[11px] text-muted-foreground">رقم الفستان</dt>
                <dd className="num text-gold">{dress.code}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">الموديل</dt>
                <dd>{dress.model_no || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">المقاس · اللون</dt>
                <dd>{[dress.size, dress.color].filter(Boolean).join(" · ") || "—"}</dd>
              </div>
            </dl>
          </div>
        </Card>

        <Card title="بيانات العميلة">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="رقم الفاتورة من نظام المبيعات" hint="إلزامي">
              <input
                className="field"
                dir="ltr"
                value={form.invoice_no}
                onChange={set("invoice_no")}
                required
              />
            </Field>
            <Field label="اسم العميلة">
              <input
                className="field"
                value={form.client_name}
                onChange={set("client_name")}
                required
              />
            </Field>
            <Field label="رقم الجوال">
              <input
                className="field"
                dir="ltr"
                type="tel"
                inputMode="tel"
                value={form.client_phone}
                onChange={set("client_phone")}
              />
            </Field>
            <Field label="ملاحظات">
              <textarea className="field min-h-20" value={form.notes} onChange={set("notes")} />
            </Field>
          </div>
        </Card>

        <Card title="المالية">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="قيمة الإيجار" hint={`الافتراضي ${money(Number(dress.rent_price))}`}>
              <input
                className="field"
                dir="ltr"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={set("amount")}
              />
            </Field>
            <Field
              label="التأمين"
              hint={`يُقبض عند التسليم · الافتراضي ${money(Number(dress.deposit_amount))}`}
            >
              <input
                className="field"
                dir="ltr"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.deposit_amount}
                onChange={set("deposit_amount")}
              />
            </Field>
            <Field label="العربون المدفوع الآن" hint="سند قبض في صندوق الفرع">
              <input
                className="field"
                dir="ltr"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.paid}
                onChange={set("paid")}
              />
            </Field>
            {paidNow > 0 ? <MethodPicker value={method} onChange={setMethod} /> : <div />}
            <Field label="المتبقي على العميلة" hint="يُحسب تلقائيًا">
              <input
                className="field num"
                dir="ltr"
                value={money(Math.max(rent - paidNow, 0))}
                readOnly
                disabled
              />
            </Field>
          </div>
        </Card>

        <Card title="المواعيد">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="تاريخ الحجز" hint="يُسجَّل تلقائيًا بتاريخ اليوم">
              <input className="field" type="date" value={localDay()} readOnly disabled />
            </Field>
            <Field label="تاريخ البروفة الأولى" hint="اختياري — قبل الخروج">
              <input
                className="field"
                type="date"
                min={localDay()}
                max={form.out_date}
                value={form.fitting1_date}
                onChange={set("fitting1_date")}
              />
            </Field>
            {secondFitting ? (
              <Field label="تاريخ البروفة الثانية">
                <input
                  className="field"
                  type="date"
                  min={form.fitting1_date || localDay()}
                  max={form.out_date}
                  value={form.fitting2_date}
                  onChange={set("fitting2_date")}
                />
              </Field>
            ) : (
              <div className="flex items-end">
                <Btn type="button" variant="quiet" onClick={() => setSecondFitting(true)}>
                  إضافة بروفة ثانية
                </Btn>
              </div>
            )}
            <Field label="تاريخ الخروج (استلام العميلة)">
              <input
                className="field"
                type="date"
                min={localDay()}
                value={form.out_date}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    out_date: e.target.value,
                    due_date: f.due_date < e.target.value ? e.target.value : f.due_date,
                  }))
                }
                required
              />
            </Field>
            <Field label="تاريخ الإرجاع المتوقع">
              <input
                className="field"
                type="date"
                min={form.out_date}
                value={form.due_date}
                onChange={set("due_date")}
                required
              />
            </Field>
            <Field label="تاريخ المناسبة">
              <input
                className="field"
                type="date"
                value={form.event_date}
                onChange={set("event_date")}
              />
            </Field>
          </div>
        </Card>

        <Card title="المقاسات والتصميم">
          <div className="px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-medium">لوحة الرسم</p>
                <p className="text-[11px] text-muted-foreground">
                  اكتبي المقاسات بجانب الرسمة (ويمكن إضافة مقاس جديد باسمه)، وارسمي أي تعديل على
                  الفستان بالقلم فوق رسمة الجسم.
                </p>
              </div>
              <div className="flex gap-2">
                <Btn type="button" variant="quiet" onClick={() => setSketchOpen(true)}>
                  {sketch || Object.keys(filled).length
                    ? "تعديل الرسمة والمقاسات"
                    : "افتح لوحة الرسم"}
                </Btn>
                {sketch && (
                  <Btn type="button" variant="quiet" onClick={() => setSketch(null)}>
                    حذف الرسمة
                  </Btn>
                )}
              </div>
            </div>
            {Object.keys(filled).length > 0 ? (
              <MeasureChips measures={filled} className="mt-3" />
            ) : (
              <p className="mt-3 text-[12px] text-muted-foreground">لم تُكتب المقاسات بعد.</p>
            )}
            {sketch && (
              <img
                src={sketch.url}
                alt="الرسمة"
                className="mt-3 w-full max-w-xs rounded-lg border border-line bg-white"
              />
            )}
          </div>
        </Card>

        <div>
          <Btn type="submit" disabled={busy}>
            {busy ? "جاري الحفظ…" : "تسجيل الحجز"}
          </Btn>
        </div>
      </form>

      {sketchOpen && (
        <SketchBoard
          order={{
            client_name: form.client_name || "عميلة جديدة",
            order_no: dress.code,
            measurements: measures,
          }}
          initial={sketch?.result.doc ?? emptySketch()}
          initialFiles={sketch?.result.files ?? []}
          bucket={RENTAL_SKETCH_BUCKET}
          onMeasuresChange={setMeasures}
          onClose={() => setSketchOpen(false)}
          onSave={async (result) => {
            const first = result.pngs[0];
            if (!first) return;
            setSketch({ result, url: URL.createObjectURL(first) });
            setSketchOpen(false);
            toast.success("تم حفظ الرسمة — تنرفع مع الحجز عند الحفظ");
          }}
        />
      )}
    </AppShell>
  );
}
