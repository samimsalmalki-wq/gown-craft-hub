import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Btn, Empty } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { dueOf, firstName, fmtDay, itemsOf, localDate, sourceLabel } from "@/lib/alterations";
import { useAlteration, useAlterationAction, useTailors } from "@/lib/alterations-data";
import { branchLabel, useBranches } from "@/lib/branches";
import { useItemTypes, useSignedUrls, useStageTemplates } from "@/lib/data";
import { useModel } from "@/lib/models-data";
import { cn } from "@/lib/utils";

/**
 * كرت تشغيل التعديل (A5): يطبعه مشرف المعمل عند الاستلام ويمشي مع القطع.
 * الخياط يتحدد هنا ويتغيّر قبل الطباعة، ولكل نقطة مربع «تم».
 */
export const Route = createFileRoute("/_authenticated/alterations/$alterationId/print")({
  head: () => ({ meta: [{ title: "كرت تشغيل تعديل · مَعْمَل" }] }),
  component: AlterationJobCard,
});

function AlterationJobCard() {
  const { alterationId } = Route.useParams();
  const { data: alt, isLoading } = useAlteration(alterationId);
  const { data: tailors = [] } = useTailors();
  const { data: branches = [] } = useBranches();
  const { data: model } = useModel(alt?.order?.model_id ?? "");
  const { can } = useCurrentAccount();
  const act = useAlterationAction();
  const urls = useSignedUrls(alt?.sketch_path ? [alt.sketch_path] : []);
  const { data: itemTypes = [] } = useItemTypes();
  // أسماء المراحل من الإعداد (الصفحة خارج الإطار اللي يحمّلها)
  useStageTemplates();

  if (isLoading) return <Empty>جاري التحميل…</Empty>;
  if (!alt) return <Empty>التعديل غير موجود أو ما عندك صلاحية عليه.</Empty>;

  const order = alt.order;
  const items = itemsOf(alt);
  const due = dueOf(alt.pickup_date);
  const canTailor =
    can("alterations.workshop") && (alt.step === "queued" || alt.step === "in_progress");
  const active = tailors.filter((t) => t.is_active);
  // الخياط الحالي حتى لو انوقف من القائمة
  const options =
    alt.tailor && !active.some((t) => t.name === alt.tailor)
      ? [alt.tailor, ...active.map((t) => t.name)]
      : active.map((t) => t.name);
  const modelText = model
    ? model.code
    : order?.is_new_model
      ? "موديل جديد"
      : order?.model_no || "—";
  const typeName = itemTypes.find((t) => t.id === order?.item_type_id)?.name;
  const sketchUrl = alt.sketch_path ? urls[alt.sketch_path] : undefined;

  return (
    <div className="min-h-screen bg-ivory py-4 print:min-h-0 print:bg-white print:py-0">
      <style>{`@page { size: A5 portrait; margin: 8mm; }`}</style>

      <div className="mx-auto mb-4 flex max-w-[148mm] flex-wrap items-center justify-between gap-2 px-4 print:hidden">
        <Link to="/alterations" className="text-[13px] text-gold">
          رجوع للتعديلات
        </Link>
        {canTailor && (
          <label className="flex items-center gap-2 text-[13px]">
            الخياط:
            <select
              className="field h-10 min-h-0 w-auto py-0 text-[13px]"
              value={alt.tailor ?? ""}
              disabled={act.isPending}
              onChange={(e) =>
                act
                  .mutateAsync({ id: alt.id, action: "set_tailor", tailor: e.target.value })
                  .then(() => toast.success("تحدد الخياط"))
                  .catch((err: Error) => toast.error(err.message))
              }
            >
              {!alt.tailor && <option value="">اختر الخياط</option>}
              {options.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        )}
        <Btn onClick={() => window.print()}>
          <Printer className="size-4" strokeWidth={1.75} /> طباعة
        </Btn>
      </div>

      <div className="mx-auto w-[148mm] max-w-full bg-white p-[7mm] text-black shadow-sm print:w-auto print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-2 border-black pb-2">
          <div>
            <p className="text-[17px] font-bold">كرت تشغيل · تعديل</p>
            <p className="text-[11px] text-neutral-600">
              استلمه المعمل{" "}
              {fmtDay(localDate(alt.printed_at ? new Date(alt.printed_at) : new Date()))}
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-neutral-600">رقم الطلب</p>
            <p className="num text-[28px] leading-none font-bold">{order?.order_no ?? "—"}</p>
            <p className="text-[13px] font-bold">تعديل {alt.number}</p>
          </div>
        </header>

        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[12px]">
          <Box label="العميلة">{order ? firstName(order.client_name) : "—"}</Box>
          <Box label="الفرع">{branchLabel(branches, alt.branch_id)}</Box>
          <Box label="القطعة · الموديل">
            {typeName ? `${typeName} · ` : ""}
            {modelText}
          </Box>
          <Box label="انطلب في">{sourceLabel(alt)}</Box>
          <Box label="الخياط">{alt.tailor || "—"}</Box>
          <Box label="مطلوب جاهز في الفرع" strong>
            {fmtDay(alt.pickup_date)}
            <span className="block text-[11px] font-normal">{due.text}</span>
          </Box>
        </div>

        <table className="mt-2 w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="w-20 border border-black px-2 py-1 text-right">القطعة</th>
              <th className="border border-black px-2 py-1 text-right">المطلوب</th>
              <th className="w-14 border border-black px-2 py-1">تم ✓</th>
            </tr>
          </thead>
          <tbody>
            {items.flatMap((i) =>
              i.points.map((pt, k) => (
                <tr key={`${i.part}-${k}`}>
                  {k === 0 && (
                    <td
                      rowSpan={i.points.length}
                      className="border border-black px-2 py-1.5 align-top font-bold"
                    >
                      {i.part}
                    </td>
                  )}
                  <td className="border border-black px-2 py-1.5 align-top">{pt}</td>
                  <td className="border border-black" />
                </tr>
              )),
            )}
          </tbody>
        </table>

        {sketchUrl && (
          <div className="mt-2 border border-black p-1">
            <img
              src={sketchUrl}
              alt="رسمة التعديل"
              className="mx-auto max-h-[70mm] object-contain"
            />
          </div>
        )}

        {(alt.supervisor_note || alt.admin_note) && (
          <div className="mt-2 space-y-0.5 border border-black px-2 py-1.5 text-[12px]">
            {alt.supervisor_note && (
              <p>
                <span className="font-bold">تهميش المشرف: </span>
                {alt.supervisor_note}
              </p>
            )}
            {alt.admin_note && (
              <p>
                <span className="font-bold">ملاحظة الإدارة: </span>
                {alt.admin_note}
              </p>
            )}
          </div>
        )}

        <div className="mt-2 min-h-16 border border-dashed border-neutral-500 px-2 py-1.5 text-[11px] text-neutral-600">
          ملاحظات الخياط:
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
          <Sign label="توقيع الخياط" />
          <Sign label="تاريخ الإنجاز" />
          <Sign label="تشييك مشرف المعمل" />
        </div>
      </div>
    </div>
  );
}

function Box({
  label,
  children,
  strong,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={cn("border border-black px-2 py-1", strong && "bg-neutral-100")}>
      <p className="text-[10px] text-neutral-600">{label}</p>
      <div className={cn("text-[12.5px]", strong && "font-bold")}>{children}</div>
    </div>
  );
}

function Sign({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-black" />
      <p className="mt-1 text-center">{label}</p>
    </div>
  );
}
