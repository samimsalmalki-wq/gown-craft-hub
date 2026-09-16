import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Card, Empty, Field } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useTaxSettings, useUpdateTaxSettings } from "@/lib/finance-data";

export const Route = createFileRoute("/_authenticated/settings/tax")({
  head: () => ({
    meta: [
      { title: "بيانات المنشأة والضريبة · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "اسم المنشأة والعنوان والرقم الضريبي ونسبة ضريبة القيمة المضافة التي تظهر في الفواتير.",
      },
      { property: "og:title", content: "بيانات المنشأة والضريبة · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "ضبط بيانات المنشأة وضريبة القيمة المضافة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaxSettingsPage,
});

function TaxSettingsPage() {
  const { isAdmin, ready } = useCurrentAccount();
  const { data: tax, isLoading } = useTaxSettings();
  const update = useUpdateTaxSettings();

  if (ready && !isAdmin) {
    return (
      <AppShell title="بيانات المنشأة والضريبة">
        <Empty>هذه الشاشة متاحة للمدير فقط.</Empty>
      </AppShell>
    );
  }

  const save = (patch: Record<string, unknown>) =>
    tax &&
    update
      .mutateAsync({ id: tax.id, patch })
      .then(() => toast.success("تم الحفظ"))
      .catch((e: Error) => toast.error(e.message));

  return (
    <AppShell
      eyebrow="الإعدادات"
      title="بيانات المنشأة والضريبة"
      subtitle="هذه البيانات تظهر في رأس الفواتير وسندات القبض. لكل فرع بياناته — بدّل الفرع من الأعلى."
    >
      <Card title="بيانات الفاتورة">
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : !tax ? (
          <Empty>اختر فرعًا محددًا من مبدّل الفروع في الأعلى لعرض بياناته.</Empty>
        ) : (
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="اسم المنشأة">
              <input
                className="field w-full"
                defaultValue={tax.business_name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== tax.business_name) save({ business_name: v });
                }}
              />
            </Field>
            <Field label="الرقم الضريبي">
              <input
                className="field num w-full"
                defaultValue={tax.tax_number ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (tax.tax_number ?? "")) save({ tax_number: v || null });
                }}
              />
            </Field>
            <Field label="عنوان المنشأة">
              <input
                className="field w-full"
                defaultValue={tax.business_address ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (tax.business_address ?? "")) save({ business_address: v || null });
                }}
              />
            </Field>
            <Field label="نسبة ضريبة القيمة المضافة %">
              <input
                className="field num w-full"
                inputMode="decimal"
                defaultValue={String(Number(tax.vat_rate))}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v >= 0 && v !== Number(tax.vat_rate)) save({ vat_rate: v });
                }}
              />
            </Field>
            <label className="flex items-center gap-2 text-[12.5px] sm:col-span-2">
              <input
                type="checkbox"
                className="size-5 accent-current"
                checked={tax.vat_enabled}
                onChange={(e) => save({ vat_enabled: e.target.checked })}
              />
              تطبيق ضريبة القيمة المضافة على الفواتير الجديدة
            </label>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
