import { money } from "@/lib/atelier";
import { cn } from "@/lib/utils";

/**
 * المتبقي على العميلة عند تسليم الطلب: المبالغ لمن عنده «عرض المبالغ»،
 * وإلا تنبيه بدون أرقام إذا عليها مبلغ متبقي.
 */
export function DeliveryDue({
  total,
  paid,
  hasDue,
}: {
  /** قيمة الطلب (فاضية لمن ما عنده «عرض المبالغ») */
  total: number | null;
  /** المدفوع (فاضي لمن ما عنده «عرض المبالغ») */
  paid: number | null;
  /** عليها مبلغ متبقي */
  hasDue: boolean;
}) {
  const showMoney = total !== null && paid !== null;
  const left = showMoney ? Math.max(0, Number(total) - Number(paid)) : 0;
  const due = showMoney ? left > 0 : hasDue;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-[13px]",
        due ? "border-late/40 bg-late/8" : "border-ok/30 bg-ok/8",
      )}
    >
      {showMoney && (
        <dl className="mb-2 grid grid-cols-3 gap-2 text-[12px]">
          <div>
            <dt className="text-muted-foreground">قيمة الطلب</dt>
            <dd className="num">{money(total)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">المدفوع</dt>
            <dd className="num">{money(paid)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">المتبقي</dt>
            <dd className={cn("num font-medium", due ? "text-late" : "text-ok")}>{money(left)}</dd>
          </div>
        </dl>
      )}
      <p className={due ? "font-medium text-late" : "text-ok"}>
        {due
          ? showMoney
            ? `المتبقي على العميلة ${money(left)} — حصّله وسجّل سند القبض قبل التسليم.`
            : "على العميلة مبلغ متبقي — تأكّد من التحصيل قبل التسليم."
          : "المبلغ مدفوع كامل."}
      </p>
    </div>
  );
}
