import { Truck, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ChecklistSheet } from "@/components/ChecklistSheet";
import { Btn, Card, Chip, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate } from "@/lib/atelier";
import { branchLabel } from "@/lib/branches";
import { missingParts, partsOrDress } from "@/lib/goods";
import { useGoodsPlaces, useSendGoods } from "@/lib/goods-data";
import { copyPlaceLabel, copyPlaceOf, type RentalBusy, type RentalDress } from "@/lib/inventory";
import { useReturnRentalCopy, useSetRentalCopyPlace } from "@/lib/inventory-data";

type Move = { to: string; fromWorkshop: boolean };

/**
 * مكان نسخة الإيجار ونقلها: المعمل يرسلها لفرع الحجز، والفرع يرجّعها للمعمل
 * (أو يرسلها لفرع الحجز المشترك)، والمدير يصحح مكانها.
 */
export function RentalCopyPlaceCard({ dress, busy }: { dress: RentalDress; busy: RentalBusy[] }) {
  const { can, profile } = useCurrentAccount();
  const places = useGoodsPlaces();
  const send = useSendGoods();
  const back = useReturnRentalCopy();
  const fix = useSetRentalCopyPlace();

  const [dest, setDest] = useState("");
  const [move, setMove] = useState<Move | null>(null);
  const [returning, setReturning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixTo, setFixTo] = useState("workshop");

  const name = (id: string | null) => branchLabel(places.branches, id);
  const place = copyPlaceOf(dress.location);
  const mine = busy.filter((b) => b.dress_id === dress.id);
  const withClient = mine.some((b) => b.delivered);
  const next =
    mine.filter((b) => !b.delivered).sort((a, b) => a.out_date.localeCompare(b.out_date))[0] ??
    null;
  const parts = partsOrDress(dress.parts);
  /** موظف هذا الفرع (أو من له كل الفروع) */
  const here = (id: string | null) => places.canAll || (Boolean(id) && profile?.branch_id === id);

  const canMove = can("goods.transfer");
  const fromWorkshop = place === "workshop" && canMove && places.workshopOk;
  const atBranch = place === "branch" && !withClient && here(dress.location_branch_id);
  const canBack = atBranch && (canMove || can("rentals.manage"));
  const toOther =
    atBranch && canMove && next?.branch_id && next.branch_id !== dress.location_branch_id
      ? next.branch_id
      : null;
  const canFix = places.canAll && (place === "workshop" || place === "branch") && !withClient;
  const sendTo = dest || next?.branch_id || dress.branch_id || places.sales[0]?.id || "";

  function confirmMove(checked: Record<string, string[]>, notes: string) {
    if (!move) return;
    const sent = checked[dress.id] ?? [];
    send.mutate(
      {
        // من المعمل: القسم هو فرع الاستلام (مثل جاهز المعمل)
        fromBranchId: move.fromWorkshop ? move.to : (dress.location_branch_id ?? move.to),
        fromWorkshop: move.fromWorkshop,
        toBranchId: move.to,
        lines: [{ dress_id: dress.id, sent }],
        notes,
      },
      {
        onSuccess: () => {
          toast.success(
            missingParts(parts, sent).length > 0
              ? "انرسلت، وانسجلت القطع اللي ما انرسلت عشان تتابعونها"
              : `انرسلت لفرع ${name(move.to)}، ويأكّدون الاستلام من شاشة المخزون`,
          );
          setMove(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الإرسال"),
      },
    );
  }

  function confirmBack(checked: Record<string, string[]>, notes: string) {
    back.mutate(
      { dressId: dress.id, parts: checked[dress.id] ?? [], note: notes },
      {
        onSuccess: () => {
          toast.success("انرسلت للمعمل، والمعمل يأكّد الاستلام");
          setReturning(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الإرسال"),
      },
    );
  }

  function saveFix() {
    fix.mutate(
      { dressId: dress.id, branchId: fixTo === "workshop" ? null : fixTo },
      {
        onSuccess: () => {
          toast.success("تم تصحيح مكان النسخة");
          setFixing(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
      },
    );
  }

  return (
    <Card title="مكان النسخة">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Chip
          tone={
            withClient
              ? "gold"
              : place === "branch"
                ? "ok"
                : place === "workshop"
                  ? "neutral"
                  : "soon"
          }
        >
          {copyPlaceLabel(dress, name, withClient)}
        </Chip>
        <span className="text-[12px] text-muted-foreground">ملك فرع {name(dress.branch_id)}</span>
      </div>

      {next && (
        <p className="border-t border-line px-4 py-2.5 text-[12px]">
          الحجز الجاي لفرع {name(next.branch_id)}:{" "}
          {next.fitting_date ? `بروفة ${fmtDate(next.fitting_date)} · ` : ""}
          يخرج {fmtDate(next.out_date)}
          {place !== "branch" || dress.location_branch_id !== next.branch_id ? (
            <span className="text-soon"> — لازم توصل النسخة الفرع قبلها</span>
          ) : null}
        </p>
      )}

      {(place === "transit" || place === "returning") && (
        <p className="border-t border-line px-4 py-2.5 text-[12px] text-muted-foreground">
          {place === "transit"
            ? "يأكّد الفرع الاستلام من شاشة المخزون."
            : "يأكّد المعمل الاستلام من شاشة المخزون، وبعدها تصير النسخة في المعمل."}
        </p>
      )}

      {(fromWorkshop || toOther || canBack || canFix) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          {fromWorkshop && (
            <>
              <select
                aria-label="فرع الاستلام"
                className="field w-44"
                value={sendTo}
                onChange={(e) => setDest(e.target.value)}
              >
                {places.sales.map((b) => (
                  <option key={b.id} value={b.id}>
                    فرع {b.name}
                  </option>
                ))}
              </select>
              <Btn
                variant="gold"
                disabled={!sendTo}
                onClick={() => setMove({ to: sendTo, fromWorkshop: true })}
              >
                <Truck className="size-4" strokeWidth={1.75} /> إرسال من المعمل
              </Btn>
            </>
          )}
          {toOther && (
            <Btn variant="gold" onClick={() => setMove({ to: toOther, fromWorkshop: false })}>
              <Truck className="size-4" strokeWidth={1.75} /> إرسال لفرع {name(toOther)}
            </Btn>
          )}
          {canBack && (
            <Btn variant="quiet" onClick={() => setReturning(true)}>
              <Undo2 className="size-4" strokeWidth={1.75} /> إرجاع للمعمل
            </Btn>
          )}
          {canFix && (
            <Btn
              variant="quiet"
              onClick={() => {
                setFixTo(
                  place === "branch" && dress.location_branch_id
                    ? dress.location_branch_id
                    : "workshop",
                );
                setFixing(true);
              }}
            >
              تصحيح المكان
            </Btn>
          )}
        </div>
      )}

      {move && (
        <ChecklistSheet
          title={`إرسال فستان ${dress.code} لفرع ${name(move.to)}`}
          hint="أشّر على كل قطعة وأنت تجهّزها للإرسال."
          groups={[{ key: dress.id, title: `فستان إيجار ${dress.code}`, items: parts }]}
          okLabel="إرسال"
          partialLabel="إرسال مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إنه ما انرسل:"
          requireEach
          withNotes
          pending={send.isPending}
          onClose={() => setMove(null)}
          onConfirm={confirmMove}
        />
      )}

      {returning && (
        <ChecklistSheet
          title={`إرجاع فستان ${dress.code} للمعمل`}
          hint="أشّر على القطع اللي بترجع للمعمل."
          groups={[{ key: dress.id, title: `فستان إيجار ${dress.code}`, items: parts }]}
          okLabel="إرسال للمعمل"
          partialLabel="إرسال مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إنه ما رجع:"
          requireEach
          withNotes
          pending={back.isPending}
          onClose={() => setReturning(false)}
          onConfirm={confirmBack}
        />
      )}

      <Sheet
        open={fixing}
        onClose={() => setFixing(false)}
        title={`تصحيح مكان فستان ${dress.code}`}
      >
        <div className="space-y-4 p-4">
          <p className="text-[13px] text-muted-foreground">
            للبداية أو لخطأ في التسجيل. النقل العادي يكون بالإرسال والاستلام عشان تنحفظ قائمة القطع.
          </p>
          <Field label="مكانها الآن">
            <select
              className="field w-full"
              value={fixTo}
              onChange={(e) => setFixTo(e.target.value)}
            >
              <option value="workshop">في المعمل</option>
              {places.sales.map((b) => (
                <option key={b.id} value={b.id}>
                  في فرع {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Btn className="w-full" disabled={fix.isPending} onClick={saveFix}>
            {fix.isPending ? "جاري الحفظ…" : "حفظ"}
          </Btn>
        </div>
      </Sheet>
    </Card>
  );
}
