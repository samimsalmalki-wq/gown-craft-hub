import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ChecklistSheet } from "@/components/ChecklistSheet";
import { Btn, Card, Chip, Sheet } from "@/components/kit";
import { PartsPicker } from "@/components/PartsPicker";
import { useCurrentAccount } from "@/hooks/useSession";
import type { Order } from "@/lib/atelier";
import {
  DRESS_LOCATION_LABEL,
  WORKSHOP,
  dressLocationOf,
  missingParts,
  partsOrDress,
  type DressLocation,
} from "@/lib/goods";
import { useDeliverOrderParts, useUpdateOrderParts } from "@/lib/goods-data";

const LOCATION_TONE: Record<DressLocation, "neutral" | "gold" | "soon" | "ok"> = {
  production: "neutral",
  workshop: "gold",
  transit: "soon",
  branch: "ok",
  delivered: "ok",
};

/** بطاقة في صفحة الطلب: مكان الفستان وقطعه، والتسليم للعميلة بقائمة التأشير */
export function DressPartsCard({ order }: { order: Order }) {
  const { can } = useCurrentAccount();
  const canEdit = can("orders.edit") && order.state === "active";
  const canDeliver = can("orders.edit") || can("goods.transfer") || can("stages.manage");
  const update = useUpdateOrderParts();
  const deliver = useDeliverOrderParts();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [delivering, setDelivering] = useState(false);

  const loc = dressLocationOf(order.dress_location);
  const parts = partsOrDress(order.parts);
  const notGiven = order.delivered_parts ? missingParts(parts, order.delivered_parts) : [];

  return (
    <Card
      title="الفستان وقطعه"
      action={
        canEdit && (
          <button
            className="text-[13px] text-gold"
            onClick={() => {
              setDraft(parts);
              setEditing(true);
            }}
          >
            تعديل القطع
          </button>
        )
      }
    >
      <dl className="divide-y divide-line text-[13px]">
        <Row label="مكان الفستان">
          <Chip tone={LOCATION_TONE[loc]}>{DRESS_LOCATION_LABEL[loc]}</Chip>
        </Row>
        <Row label="القطع">
          <span className="flex flex-wrap justify-end gap-1.5">
            {parts.map((p) => (
              <Chip key={p}>{p}</Chip>
            ))}
          </span>
        </Row>
        {order.delivered_parts && (
          <Row label="تسلّمت العميلة">
            <span className="text-left">
              {order.delivered_parts.join("، ")}
              {notGiven.length > 0 && (
                <span className="block text-late">ما تسلّمت: {notGiven.join("، ")}</span>
              )}
            </span>
          </Row>
        )}
      </dl>

      {order.state === "active" && (loc === "workshop" || loc === "transit") && (
        <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted-foreground">
          {loc === "workshop"
            ? "الفستان جاهز في المعمل. التسليم للعميلة يصير بعد ما ينرسل للفرع ويتأكد استلامه — "
            : "الفستان في الطريق للفرع. التسليم يصير بعد ما يأكد الفرع الاستلام — "}
          <Link
            to="/goods"
            search={{ loc: loc === "workshop" ? WORKSHOP : (order.branch_id ?? undefined) }}
            className="text-gold"
          >
            افتح المخزون
          </Link>
        </p>
      )}

      {order.state === "active" && loc === "branch" && order.order_kind === "own" && canDeliver && (
        <div className="border-t border-line p-4">
          <Btn className="w-full" onClick={() => setDelivering(true)}>
            تسليم للعميلة بقائمة القطع
          </Btn>
        </div>
      )}

      {editing && (
        <Sheet open onClose={() => setEditing(false)} title="قطع الفستان">
          <div className="space-y-4 p-4">
            <p className="text-[13px] text-muted-foreground">
              هذي القائمة تطلع للتأشير عند الإرسال من المعمل والاستلام في الفرع والتسليم للعميلة.
            </p>
            <PartsPicker value={draft} onChange={setDraft} />
            <Btn
              className="w-full"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { orderId: order.id, parts: draft },
                  {
                    onSuccess: () => {
                      toast.success("تم حفظ القطع");
                      setEditing(false);
                    },
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
                  },
                )
              }
            >
              {update.isPending ? "جاري الحفظ…" : "حفظ"}
            </Btn>
          </div>
        </Sheet>
      )}

      {delivering && (
        <ChecklistSheet
          title={`تسليم طلب ${order.order_no} للعميلة`}
          hint="أشّر على كل قطعة تسلّمتها العميلة."
          groups={[{ key: order.id, title: order.client_name, items: parts }]}
          okLabel="تأكيد التسليم"
          partialLabel="تسليم مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إن العميلة ما تسلّمته:"
          requireEach
          pending={deliver.isPending}
          onClose={() => setDelivering(false)}
          onConfirm={(checked) =>
            deliver.mutate(
              { orderId: order.id, parts: checked[order.id] ?? [] },
              {
                onSuccess: () => {
                  toast.success("تم تسليم الفستان للعميلة");
                  setDelivering(false);
                },
                onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر التسليم"),
              },
            )
          }
        />
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
