import { useBranchScope } from "@/lib/branches";

/** تنبيه: المخزن الرئيسي موقع خامات فقط، فالمعروض هنا كل الفروع */
export function WarehouseScopeNote() {
  const { selectedIsWarehouse } = useBranchScope();
  if (!selectedIsWarehouse) return null;
  return (
    <p className="mb-4 rounded-xl border border-line bg-goldsoft/40 px-4 py-2.5 text-[12.5px]">
      المخزن الرئيسي موقع خامات فقط ولا توجد فيه طلبات أو حسابات — المعروض هنا كل الفروع. بدّل إلى
      فرع بيع من الأعلى لتصفية النتائج.
    </p>
  );
}
