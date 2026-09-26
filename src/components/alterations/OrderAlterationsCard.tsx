import { Scissors } from "lucide-react";
import { useState } from "react";

import { Btn, Card, Chip, Empty } from "@/components/kit";
import { AlterationRequestSheet } from "@/components/alterations/AlterationRequestSheet";
import { AlterationSheet } from "@/components/alterations/AlterationSheet";
import { useCurrentAccount } from "@/hooks/useSession";
import type { Order } from "@/lib/atelier";
import { dueOf, isOpen, sourceLabel, stepLabel, stepTone, summaryOf } from "@/lib/alterations";
import { useOrderAlterations } from "@/lib/alterations-data";

/** قسم التعديلات في صفحة الطلب: الجولات، وزر طلب تعديل جديد */
export function OrderAlterationsCard({ order }: { order: Order }) {
  const { can } = useCurrentAccount();
  const { data: rounds = [] } = useOrderAlterations(order.id);
  const [openId, setOpenId] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const current = rounds.find(isOpen);
  const nextRound = rounds.reduce((m, r) => Math.max(m, r.number), 0) + 1;
  const canRequest = can("alterations.request") && order.state !== "cancelled" && !current;

  return (
    <>
      <Card
        title={`التعديلات (${rounds.length.toLocaleString("ar-EG")})`}
        action={
          canRequest ? (
            <Btn className="min-h-9 px-3 text-[13px]" onClick={() => setRequesting(true)}>
              <Scissors className="size-4" strokeWidth={1.75} /> طلب تعديل
            </Btn>
          ) : undefined
        }
      >
        {current && !current.after_delivery && (
          <p className="border-b border-line bg-soon/10 px-4 py-2.5 text-[12.5px] text-soon">
            فيه تعديل مفتوح — الطلب واقف عند «{sourceLabel(current)}» والتسليم للعميلة ينقفل لين
            يخلص.
          </p>
        )}
        {rounds.length === 0 ? (
          <Empty>ما فيه تعديلات على هذا الطلب.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rounds.map((a) => {
              const due = dueOf(a.pickup_date);
              return (
                <li key={a.id}>
                  <button
                    onClick={() => setOpenId(a.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-right hover:bg-ivory"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium">
                        تعديل {a.number} · {sourceLabel(a)}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {summaryOf(a)}
                      </span>
                    </span>
                    {isOpen(a) && <Chip tone={due.tone}>{due.text}</Chip>}
                    <Chip tone={stepTone(a)}>{stepLabel(a)}</Chip>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {openId && <AlterationSheet id={openId} onClose={() => setOpenId(null)} />}
      {requesting && (
        <AlterationRequestSheet
          order={order}
          round={nextRound}
          onClose={() => setRequesting(false)}
        />
      )}
    </>
  );
}
