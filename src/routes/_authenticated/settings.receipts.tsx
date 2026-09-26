import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useBranchScope, ALL_BRANCHES } from "@/lib/branches";
import {
  DEFAULT_RECEIPT_CONTENT,
  RECEIPT_FIELDS,
  RECEIPT_VARS,
  buildDepositReceipt,
  drawDepositReceipt,
  renderDepositReceipt,
  type ReceiptContent,
  type ReceiptKind,
} from "@/lib/deposit-receipt";
import type { RentalRecord } from "@/lib/inventory";
import {
  receiptContentOf,
  useReceiptShop,
  useReceiptTemplates,
  useSaveReceiptTemplate,
} from "@/lib/inventory-data";
import { shareOrDownload } from "@/lib/pdf";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/receipts")({
  head: () => ({
    meta: [
      { title: "نصوص إيصالات التأمين · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "عنوان إيصال التأمين وبياناته ونص الإقرار والتوقيعات، مع معاينة مباشرة.",
      },
      { property: "og:title", content: "نصوص إيصالات التأمين · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "إدارة نصوص إيصالات التأمين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceiptsSettingsPage,
});

const KINDS: { key: ReceiptKind; label: string }[] = [
  { key: "received", label: "إيصال استلام التأمين" },
  { key: "refunded", label: "إيصال رد التأمين" },
];

/** عقد تجريبي للمعاينة */
const SAMPLE = {
  client_name: "نورة العتيبي",
  client_phone: "0551234567",
  external_invoice_no: "INV-5520",
  out_date: "2026-09-25",
  delivered_at: "2026-09-25T10:00:00",
  due_date: "2026-09-30",
  returned_at: "2026-09-30T12:00:00",
  deposit_receipt_no: "R-00231",
  refund_voucher_no: "P-00012",
  deposit_method: "cash",
  refund_method: "cash",
  amount: 1500,
  paid_amount: 1500,
  tracks_money: true,
  order_id: null,
  cancelled_at: null,
  deposit_amount: 1000,
  deposit_paid: 1000,
  deposit_refunded: 850,
  damage_amount: 150,
  fitting_date: null,
} as unknown as RentalRecord;

type TextKey = "terms" | "note" | "footer";

function ReceiptsSettingsPage() {
  const { isAdmin, ready, profile } = useCurrentAccount();
  const { branchId } = useBranchScope();
  const { data: rows = [] } = useReceiptTemplates();
  const { data: shop } = useReceiptShop(branchId === ALL_BRANCHES ? null : branchId);
  const save = useSaveReceiptTemplate();

  const [kind, setKind] = useState<ReceiptKind>("received");
  const [drafts, setDrafts] = useState<Partial<Record<ReceiptKind, ReceiptContent>>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const refs = useRef<Partial<Record<TextKey, HTMLTextAreaElement | HTMLInputElement | null>>>({});

  const saved = receiptContentOf(rows, kind);
  const content = drafts[kind] ?? saved;
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);

  const set = (patch: Partial<ReceiptContent>) =>
    setDrafts((d) => ({ ...d, [kind]: { ...content, ...patch } }));

  const receipt = () =>
    buildDepositReceipt(
      kind,
      SAMPLE,
      { code: "D-018" },
      shop ?? { name: "مَعْمَل" },
      profile?.full_name ?? "سارة",
      content,
    );

  // معاينة مباشرة بعد توقف الكتابة
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      drawDepositReceipt(receipt())
        .then((canvas) => {
          if (!cancelled) setPreview(canvas.toDataURL("image/jpeg", 0.85));
        })
        .catch(() => undefined);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, JSON.stringify(content), shop, profile?.full_name]);

  if (ready && !isAdmin) {
    return (
      <AppShell title="نصوص إيصالات التأمين">
        <Empty>هذه الشاشة متاحة لمدير النظام فقط.</Empty>
      </AppShell>
    );
  }

  /** يضيف حقلًا جاهزًا مكان المؤشر في النص */
  const insert = (key: TextKey, token: string) => {
    const el = refs.current[key];
    const value = content[key] ?? "";
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    set({ [key]: next } as Partial<ReceiptContent>);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const toggleField = (key: string, on: boolean) => {
    const enabled = new Set(content.fields);
    if (on) enabled.add(key);
    else enabled.delete(key);
    set({ fields: RECEIPT_FIELDS.map((f) => f.key).filter((k) => enabled.has(k)) });
  };

  const submit = () =>
    save
      .mutateAsync({ kind, content })
      .then(() => {
        toast.success("تم حفظ نصوص الإيصال");
        setDrafts((d) => {
          const next = { ...d };
          delete next[kind];
          return next;
        });
      })
      .catch((e: Error) => toast.error(e.message));

  const downloadSample = async () => {
    const data = receipt();
    await shareOrDownload(await renderDepositReceipt(data), `نموذج-${data.fileName}`, data.title);
  };

  const Vars = ({ target }: { target: TextKey }) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {RECEIPT_VARS.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => insert(target, `{${v.key}}`)}
          className="rounded-full border border-line bg-paper px-2.5 py-1 text-[11px] hover:border-gold"
        >
          + {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="نصوص إيصالات التأمين"
      subtitle="تحكّم بعنوان الإيصال وبياناته ونص الإقرار والتوقيعات. اسم المنشأة وعنوانها ورقمها الضريبي من «بيانات المنشأة والضريبة»."
      actions={
        <Link to="/settings/tax" className="btn-quiet">
          بيانات المنشأة والضريبة
        </Link>
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13px]",
              kind === k.key
                ? "border-gold bg-gold/10 font-medium"
                : "border-line bg-paper text-muted-foreground",
            )}
          >
            {k.label}
            {drafts[k.key] && <Chip tone="soon">غير محفوظ</Chip>}
          </button>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <Card title="العنوان">
            <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
              <Field label="عنوان الإيصال">
                <input
                  className="field w-full"
                  value={content.title}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="العنوان الفرعي" hint="يظهر تحت العنوان — اتركه فاضي لإخفائه">
                <input
                  className="field w-full"
                  value={content.subtitle ?? ""}
                  onChange={(e) => set({ subtitle: e.target.value || null })}
                />
              </Field>
              <Field label="عنوان خانة المبلغ">
                <input
                  className="field w-full"
                  value={content.amount_label}
                  onChange={(e) => set({ amount_label: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card title="البيانات الظاهرة في الإيصال">
            <div className="grid gap-2 px-4 py-4 sm:grid-cols-2">
              {RECEIPT_FIELDS.map((f) => (
                <label
                  key={f.key}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-[13px]"
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-current"
                    checked={content.fields.includes(f.key)}
                    onChange={(e) => toggleField(f.key, e.target.checked)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <p className="border-t border-line px-4 py-3 text-[12px] text-muted-foreground">
              رقم السند والتاريخ والمبلغ وطريقة الدفع تظهر دائمًا
              {kind === "refunded" ? "، ومعها التأمين المستلم وخصم التلف." : "."}
            </p>
          </Card>

          <Card title="نص الإقرار">
            <div className="px-4 py-4">
              <textarea
                ref={(el) => {
                  refs.current.terms = el;
                }}
                className="field min-h-28 w-full"
                value={content.terms ?? ""}
                onChange={(e) => set({ terms: e.target.value || null })}
                placeholder="اتركه فاضي لإخفائه"
              />
              <Vars target="terms" />
            </div>
          </Card>

          <Card title="ملاحظة إضافية">
            <div className="px-4 py-4">
              <textarea
                ref={(el) => {
                  refs.current.note = el;
                }}
                className="field min-h-20 w-full"
                value={content.note ?? ""}
                onChange={(e) => set({ note: e.target.value || null })}
                placeholder="مثال: للاستفسار تواصلي معنا على 0555555555"
              />
              <Vars target="note" />
            </div>
          </Card>

          <Card title="التوقيعات">
            <div className="space-y-4 px-4 py-4">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  className="size-5 accent-current"
                  checked={content.show_signatures}
                  onChange={(e) => set({ show_signatures: e.target.checked })}
                />
                إظهار خانات التوقيع
              </label>
              {content.show_signatures && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="خانة العميلة">
                    <input
                      className="field w-full"
                      value={content.customer_signature_label}
                      onChange={(e) => set({ customer_signature_label: e.target.value })}
                    />
                  </Field>
                  <Field label="خانة الموظف">
                    <input
                      className="field w-full"
                      value={content.staff_signature_label}
                      onChange={(e) => set({ staff_signature_label: e.target.value })}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-current"
                      checked={content.show_staff_name}
                      onChange={(e) => set({ show_staff_name: e.target.checked })}
                    />
                    كتابة اسم الموظف/ة اللي أصدر الإيصال
                  </label>
                </div>
              )}
            </div>
          </Card>

          <Card title="التذييل">
            <div className="px-4 py-4">
              <input
                ref={(el) => {
                  refs.current.footer = el;
                }}
                className="field w-full"
                value={content.footer ?? ""}
                onChange={(e) => set({ footer: e.target.value || null })}
                placeholder="اتركه فاضي لإخفائه"
              />
              <Vars target="footer" />
            </div>
          </Card>
        </div>

        <div className="space-y-3 lg:sticky lg:top-6 lg:self-start">
          <Card title="معاينة">
            <div className="bg-ivory p-3">
              {preview ? (
                <img src={preview} alt="معاينة الإيصال" className="w-full rounded shadow-sm" />
              ) : (
                <Empty>جاري تجهيز المعاينة…</Empty>
              )}
            </div>
          </Card>
          <div className="grid gap-2">
            <Btn variant="gold" disabled={!dirty || save.isPending} onClick={submit}>
              {save.isPending ? "جاري الحفظ…" : dirty ? "حفظ التعديلات" : "محفوظ"}
            </Btn>
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="quiet" onClick={() => set(DEFAULT_RECEIPT_CONTENT[kind])}>
                <RotateCcw className="size-4" />
                النص الافتراضي
              </Btn>
              <Btn variant="quiet" onClick={downloadSample}>
                <Download className="size-4" />
                نموذج PDF
              </Btn>
            </div>
            {dirty && (
              <button
                type="button"
                className="text-[12px] text-muted-foreground"
                onClick={() =>
                  setDrafts((d) => {
                    const next = { ...d };
                    delete next[kind];
                    return next;
                  })
                }
              >
                تجاهل التعديلات
              </button>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
