import { useBranchScope } from "@/lib/branches";

/**
 * تنبيه عند اختيار المعمل من الأعلى: المعمل ليس فرع بيع.
 * «cost» لشاشات الماليات: المعمل مركز تكلفة، فمصروفاته وقيوده له وحده والباقي لكل الفروع.
 */
export function WarehouseScopeNote({ scope = "ops" }: { scope?: "ops" | "cost" }) {
  const { selectedIsWarehouse } = useBranchScope();
  if (!selectedIsWarehouse) return null;
  return (
    <p className="mb-4 rounded-xl border border-line bg-goldsoft/40 px-4 py-2.5 text-[12.5px]">
      {scope === "cost"
        ? "المعمل مركز تكلفة: المصروفات والقيود وقائمة الدخل هنا للمعمل وحده، والتحصيل والفواتير والصناديق لكل الفروع لأن المعمل ما فيه بيع."
        : "المعمل ما فيه طلبات بيع ولا حسابات عملاء — المعروض هنا كل الفروع. بدّل إلى فرع بيع من الأعلى لتصفية النتائج."}
    </p>
  );
}
