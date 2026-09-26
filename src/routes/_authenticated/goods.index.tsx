import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Crown, Gem, Package, Search, Shirt, Truck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ChecklistSheet, type ChecklistGroup } from "@/components/ChecklistSheet";
import { GoodsDetailSheet, type GoodsPlace } from "@/components/goods/GoodsDetailSheet";
import { GoodsItemSheet } from "@/components/goods/GoodsItemSheet";
import { SaleSheet } from "@/components/goods/SaleSheet";
import { Btn, Card, Chip, Empty, Stat } from "@/components/kit";
import { StockTabs } from "@/components/StockTabs";
import { useCurrentAccount } from "@/hooks/useSession";
import { fmtDate, fmtDateTime, itemTypeLabel } from "@/lib/atelier";
import { branchLabel, type Branch } from "@/lib/branches";
import { useItemTypes } from "@/lib/data";
import {
  DRESS,
  GOODS_PERMS,
  ISSUE_STAGE_CHIP,
  ISSUE_STAGE_LABEL,
  PURPOSE_LABEL,
  PURPOSE_TONE,
  WORKSHOP,
  goodsChecklist,
  missingParts,
  partsOrDress,
  purposeOf,
  qtyAt,
  sar,
  type GoodsItem,
  type GoodsPurpose,
  type GoodsStock,
  type GoodsTransferWithLines,
  type PartIssue,
  type ReadyOrder,
} from "@/lib/goods";
import {
  useDeliverOrderParts,
  useGoodsItems,
  useGoodsPlaces,
  useGoodsStock,
  useGoodsTransfers,
  usePartIssues,
  useReadyOrders,
  useReceiveGoods,
  useResolveIssue,
  useSaleInvoices,
  useSendGoods,
  useSendMissingParts,
  type SendLine,
} from "@/lib/goods-data";
import { ALL_BRANCHES, useBranchScope } from "@/lib/branches";
import { useInventoryUrls } from "@/lib/inventory-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/goods/")({
  validateSearch: (search: Record<string, unknown>): { loc?: string | undefined } => {
    const loc = search["loc"];
    return { loc: typeof loc === "string" && loc ? loc : undefined };
  },
  head: () => ({
    meta: [
      { title: "المخزون · مَعْمَل" },
      {
        name: "description",
        content:
          "الجاهز في المعمل لكل فرع، ومخزن كل فرع من فساتين وطرح وعينات، والإرسال والاستلام والبيع.",
      },
    ],
  }),
  component: GoodsPage,
});

/** سطر شحنة قبل الإرسال: قائمة التأشير وما يُرسل للخادم */
type DraftLine = {
  key: string;
  title: string;
  checklist: string[];
  payload: { item_id: string; qty: number } | { order_id: string };
};

type SendDraft = {
  fromBranchId: string;
  fromWorkshop: boolean;
  toBranchId: string;
  lines: DraftLine[];
};

const itemLine = (item: GoodsItem, qty: number): DraftLine => ({
  key: `item:${item.id}`,
  title: item.name + (qty > 1 ? ` × ${qty}` : ""),
  checklist: goodsChecklist(item.name, item.parts, qty),
  payload: { item_id: item.id, qty },
});

const orderLine = (o: ReadyOrder): DraftLine => ({
  key: `order:${o.id}`,
  title: `طلب ${o.order_no} — ${o.client_name}`,
  checklist: partsOrDress(o.parts),
  payload: { order_id: o.id },
});

const KIND_ICON = (typeName: string) =>
  typeName.includes("فستان")
    ? Shirt
    : typeName.includes("تاج")
      ? Crown
      : typeName.includes("اكسسوار") || typeName.includes("إكسسوار")
        ? Gem
        : Package;

function GoodsPage() {
  const { loc } = Route.useSearch();
  const navigate = useNavigate();
  const { can, ready } = useCurrentAccount();
  const canManage = can("goods.manage");
  const canTransfer = can("goods.transfer");
  const canSell = can("goods.sell");
  const canDeliver = canTransfer || can("orders.edit") || can("stages.manage");

  const places = useGoodsPlaces();
  const { data: items = [] } = useGoodsItems();
  const { data: stock = [] } = useGoodsStock();
  const { data: orders = [] } = useReadyOrders();
  const { data: transfers = [] } = useGoodsTransfers();
  const { data: issues = [] } = usePartIssues();
  useItemTypes(); // أسماء الأنواع
  const urls = useInventoryUrls(items.map((i) => i.image_path));

  const send = useSendGoods();
  const receive = useReceiveGoods();
  const deliver = useDeliverOrderParts();
  const resolve = useResolveIssue();
  const sendMissing = useSendMissingParts();
  const { branchId: switcherBranch } = useBranchScope();

  // بدون اختيار: الفرع المثبّت، أو الفرع المختار من أعلى الشاشة، وإلا المعمل
  const pinned = !places.canAll && !places.atWarehouse && places.visible.length === 1;
  const switcherSales =
    switcherBranch !== ALL_BRANCHES && places.visible.some((b) => b.id === switcherBranch)
      ? switcherBranch
      : null;
  const current =
    loc ?? (pinned ? (places.visible[0]?.id ?? WORKSHOP) : (switcherSales ?? WORKSHOP));
  const branch = places.visible.find((b) => b.id === current) ?? null;

  const [form, setForm] = useState<{ item: GoodsItem | null; place: GoodsPlace | null } | null>(
    null,
  );
  const [detail, setDetail] = useState<{ itemId: string; place: GoodsPlace } | null>(null);
  const [draft, setDraft] = useState<SendDraft | null>(null);
  const [receiving, setReceiving] = useState<GoodsTransferWithLines | null>(null);
  const [delivering, setDelivering] = useState<ReadyOrder | null>(null);
  const [sale, setSale] = useState<{ branchId: string; itemId: string | null } | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const badges = Object.fromEntries(
    places.visible.map((b) => [b.id, transfers.filter((t) => t.to_branch_id === b.id).length]),
  );

  if (!ready || places.isLoading) {
    return (
      <AppShell title="المخزون">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }

  if (!GOODS_PERMS.some(can)) {
    return (
      <AppShell title="المخزون">
        <StockTabs current={WORKSHOP} />
        <Empty>ما عندك صلاحية على المخزون الجاهز.</Empty>
      </AppShell>
    );
  }

  const detailItem = detail ? itemById.get(detail.itemId) : undefined;
  const defaultPlace: GoodsPlace | null = branch
    ? { branchId: branch.id, atWorkshop: false }
    : places.workshopSections[0]
      ? { branchId: places.workshopSections[0].id, atWorkshop: true }
      : null;

  function confirmSend(checked: Record<string, string[]>, notes: string) {
    if (!draft) return;
    const lines: SendLine[] = draft.lines.map((l) => ({
      ...l.payload,
      sent: checked[l.key] ?? [],
    }));
    send.mutate(
      {
        fromBranchId: draft.fromBranchId,
        fromWorkshop: draft.fromWorkshop,
        toBranchId: draft.toBranchId,
        lines,
        notes,
      },
      {
        onSuccess: () => {
          const partial = draft.lines.some(
            (l) => missingParts(l.checklist, checked[l.key] ?? []).length > 0,
          );
          toast.success(
            partial
              ? "انرسلت، وانسجلت القطع اللي ما انرسلت عشان تتابعونها"
              : `انرسلت لفرع ${branchLabel(places.branches, draft.toBranchId)}، وتظهر عندهم «في الطريق»`,
          );
          setDraft(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الإرسال"),
      },
    );
  }

  function confirmReceive(
    checked: Record<string, string[]>,
    _notes: string,
    counts: Record<string, number>,
  ) {
    if (!receiving) return;
    receive.mutate(
      {
        transferId: receiving.id,
        // الأصناف اللي تنعدّ (أكثر من قطعة) تُستلم بالعدد، والباقي بالتأشير
        lines: receiving.goods_transfer_lines.map((l) =>
          l.is_count && l.qty > 1
            ? { line_id: l.id, received: [], received_qty: counts[l.id] ?? 0 }
            : { line_id: l.id, received: checked[l.id] ?? [] },
        ),
      },
      {
        onSuccess: () => {
          const partial = receiving.goods_transfer_lines.some((l) =>
            l.is_count && l.qty > 1
              ? (counts[l.id] ?? 0) < l.qty
              : missingParts(l.sent, checked[l.id] ?? []).length > 0,
          );
          toast.success(
            partial
              ? "انسجل الاستلام مع النواقص، ويشوفها المعمل للمتابعة"
              : "تم تأكيد الاستلام ودخلت القطع مخزن الفرع",
          );
          setReceiving(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
      },
    );
  }

  function confirmDeliver(checked: Record<string, string[]>) {
    if (!delivering) return;
    deliver.mutate(
      { orderId: delivering.id, parts: checked[delivering.id] ?? [] },
      {
        onSuccess: () => {
          toast.success("تم تسليم الفستان للعميلة");
          setDelivering(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر التسليم"),
      },
    );
  }

  const onResolve = (issue: PartIssue) =>
    resolve.mutate(
      { issueId: issue.id },
      {
        onSuccess: () => toast.success("تمت المتابعة"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الحفظ"),
      },
    );

  const onSendMissing = (issue: PartIssue) =>
    sendMissing.mutate(
      { issueId: issue.id },
      {
        onSuccess: () => toast.success("انرسلت القطع الناقصة، وتظهر عند الفرع «في الطريق»"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "تعذّر الإرسال"),
      },
    );

  return (
    <AppShell
      eyebrow="المخزون"
      title={branch ? `مخزن فرع ${branch.name}` : "المعمل"}
      subtitle={
        branch
          ? "الجاهز والعرض والبضاعة والعينات في الفرع، واستلام الشحنات والبيع."
          : "الجاهز في المعمل لكل فرع: طلبات العميلات اللي خلصت والإنتاج للمخزون."
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {branch && canSell && (
            <Btn variant="gold" onClick={() => setSale({ branchId: branch.id, itemId: null })}>
              بيع
            </Btn>
          )}
          {canManage && (
            <Btn onClick={() => setForm({ item: null, place: defaultPlace })}>صنف جديد</Btn>
          )}
        </div>
      }
    >
      <StockTabs current={current} badges={badges} />

      {current === WORKSHOP ? (
        <WorkshopView
          sections={places.workshopSections}
          branches={places.branches}
          items={items}
          stock={stock}
          orders={orders}
          transfers={transfers.filter((t) => t.from_workshop)}
          issues={issues}
          canTransfer={canTransfer && places.workshopOk}
          canResolve={canTransfer || can("orders.edit")}
          canSeeCost={canManage}
          onOpenItem={(item, branchId) =>
            setDetail({ itemId: item.id, place: { branchId, atWorkshop: true } })
          }
          onSend={(toBranchId, lines) =>
            setDraft({ fromBranchId: toBranchId, fromWorkshop: true, toBranchId, lines })
          }
          onResolve={onResolve}
          onSendMissing={onSendMissing}
        />
      ) : branch ? (
        <BranchView
          key={branch.id}
          branch={branch}
          branches={places.branches}
          items={items}
          stock={stock}
          urls={urls}
          orders={orders.filter((o) => o.branch_id === branch.id && o.dress_location === "branch")}
          incoming={transfers.filter((t) => t.to_branch_id === branch.id)}
          outgoing={transfers.filter((t) => !t.from_workshop && t.from_branch_id === branch.id)}
          issues={issues.filter((x) => x.branch_id === branch.id)}
          canTransfer={canTransfer}
          canDeliver={canDeliver}
          canSell={canSell}
          canResolve={canTransfer || can("orders.edit")}
          canSeeCost={canManage}
          onOpenItem={(item) =>
            setDetail({ itemId: item.id, place: { branchId: branch.id, atWorkshop: false } })
          }
          onReceive={setReceiving}
          onDeliver={setDelivering}
          onResolve={onResolve}
        />
      ) : (
        <Empty>اختر موقعًا من الأعلى.</Empty>
      )}

      {form && (
        <GoodsItemSheet item={form.item} defaultPlace={form.place} onClose={() => setForm(null)} />
      )}

      {detail && detailItem && (
        <GoodsDetailSheet
          item={detailItem}
          place={detail.place}
          stock={stock}
          branches={places.branches}
          destinations={places.sales}
          imageUrl={detailItem.image_path ? urls[detailItem.image_path] : undefined}
          canManage={canManage}
          canAdjust={canManage && (!detail.place.atWorkshop || places.workshopOk)}
          canTransfer={canTransfer && (!detail.place.atWorkshop || places.workshopOk)}
          canSell={canSell}
          onSell={() => {
            setSale({ branchId: detail.place.branchId, itemId: detailItem.id });
            setDetail(null);
          }}
          onSend={(toBranchId, qty) => {
            setDraft({
              fromBranchId: detail.place.branchId,
              fromWorkshop: detail.place.atWorkshop,
              toBranchId,
              lines: [itemLine(detailItem, qty)],
            });
            setDetail(null);
          }}
          onEdit={() => {
            setForm({ item: detailItem, place: null });
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {draft && (
        <ChecklistSheet
          title={`إرسال لفرع ${branchLabel(places.branches, draft.toBranchId)}`}
          hint="أشّر على كل قطعة وأنت تجهّزها للإرسال."
          groups={draft.lines.map((l): ChecklistGroup => ({
            key: l.key,
            title: l.title,
            items: l.checklist,
          }))}
          okLabel="إرسال"
          partialLabel="إرسال مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إنه ما انرسل:"
          requireEach
          withNotes
          pending={send.isPending}
          onClose={() => setDraft(null)}
          onConfirm={confirmSend}
        />
      )}

      {receiving && (
        <ChecklistSheet
          title={
            receiving.from_workshop
              ? "استلام من المعمل"
              : `استلام من فرع ${branchLabel(places.branches, receiving.from_branch_id)}`
          }
          hint="أشّر على كل قطعة وصلتك فعلًا."
          groups={receiving.goods_transfer_lines.map((l): ChecklistGroup =>
            l.is_count && l.qty > 1
              ? { key: l.id, title: l.title, items: l.sent, count: l.qty }
              : {
                  key: l.id,
                  title: l.title,
                  items: l.sent,
                  skipped: missingParts(l.checklist, l.sent),
                },
          )}
          okLabel="تأكيد الاستلام"
          partialLabel="استلام مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إنه ما وصل، ويشوفه المعمل:"
          pending={receive.isPending}
          onClose={() => setReceiving(null)}
          onConfirm={confirmReceive}
        >
          {receiving.notes && (
            <p className="rounded-xl bg-ivory px-4 py-3 text-[13px]">
              ملاحظة المرسل: {receiving.notes}
            </p>
          )}
        </ChecklistSheet>
      )}

      {delivering && (
        <ChecklistSheet
          title={`تسليم طلب ${delivering.order_no} للعميلة`}
          hint="أشّر على كل قطعة تسلّمتها العميلة."
          groups={[
            {
              key: delivering.id,
              title: `${delivering.client_name}${delivering.client_phone ? ` · ${delivering.client_phone}` : ""}`,
              items: partsOrDress(delivering.parts),
            },
          ]}
          okLabel="تأكيد التسليم"
          partialLabel="تسليم مع النواقص"
          missingNote="ما تأشّر عليه بينسجل إن العميلة ما تسلّمته:"
          requireEach
          pending={deliver.isPending}
          onClose={() => setDelivering(null)}
          onConfirm={confirmDeliver}
        />
      )}

      {sale && (
        <SaleSheet
          branchId={sale.branchId}
          branchName={branchLabel(places.branches, sale.branchId)}
          items={items}
          stock={stock}
          firstItemId={sale.itemId}
          onClose={() => setSale(null)}
          onDone={(invoiceId) => {
            setSale(null);
            navigate({ to: "/goods/sales/$invoiceId", params: { invoiceId } });
          }}
        />
      )}
    </AppShell>
  );
}

/* ===== المعمل: الجاهز مقسّم حسب الفرع ===== */

function WorkshopView({
  sections,
  branches,
  items,
  stock,
  orders,
  transfers,
  issues,
  canTransfer,
  canResolve,
  canSeeCost,
  onOpenItem,
  onSend,
  onResolve,
  onSendMissing,
}: {
  sections: Branch[];
  branches: Branch[];
  items: GoodsItem[];
  stock: GoodsStock[];
  orders: ReadyOrder[];
  transfers: GoodsTransferWithLines[];
  issues: PartIssue[];
  canTransfer: boolean;
  canResolve: boolean;
  canSeeCost: boolean;
  onOpenItem: (item: GoodsItem, branchId: string) => void;
  onSend: (toBranchId: string, lines: DraftLine[]) => void;
  onResolve: (issue: PartIssue) => void;
  onSendMissing: (issue: PartIssue) => void;
}) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const ready = orders.filter((o) => o.dress_location === "workshop");
  const wsStock = stock.filter((s) => s.at_workshop && s.qty > 0);
  const pieces = wsStock.reduce((s, r) => s + r.qty, 0);
  const value = wsStock.reduce((s, r) => s + r.qty * Number(itemById.get(r.item_id)?.cost ?? 0), 0);

  return (
    <>
      <Flow />

      <IssuesCard
        issues={issues}
        branches={branches}
        showBranch
        canResolve={canResolve}
        onResolve={onResolve}
        {...(canTransfer ? { onSendMissing } : {})}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="طلبات عميلات جاهزة" value={ready.length} tone="gold" />
        <Stat
          label="قطع إنتاج جاهزة"
          value={pieces}
          {...(canSeeCost && value > 0 ? { hint: `قيمتها بالتكلفة ${sar(value)}` } : {})}
        />
        <Stat label="في الطريق للفروع" value={transfers.length} tone="soon" />
      </div>

      {sections.length === 0 ? (
        <Card>
          <Empty>ما فيه فروع بيع.</Empty>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {sections.map((b) => {
            const bOrders = ready.filter((o) => o.branch_id === b.id);
            const bStock = wsStock.filter((s) => s.branch_id === b.id);
            const all: DraftLine[] = [
              ...bOrders.map(orderLine),
              ...bStock.flatMap((s) => {
                const item = itemById.get(s.item_id);
                return item ? [itemLine(item, s.qty)] : [];
              }),
            ];
            return (
              <Card
                key={b.id}
                title={`جاهز لفرع ${b.name}`}
                action={
                  canTransfer && (
                    <Btn
                      variant="quiet"
                      className="min-h-9 px-3 text-[13px]"
                      disabled={all.length === 0}
                      onClick={() => onSend(b.id, all)}
                    >
                      <Truck className="size-4" strokeWidth={1.75} /> إرسال الكل
                    </Btn>
                  )
                }
              >
                {all.length === 0 ? (
                  <Empty>ما فيه شي جاهز لهذا الفرع.</Empty>
                ) : (
                  <>
                    {bOrders.length > 0 && <SubHead>طلبات عميلات</SubHead>}
                    <ul className="divide-y divide-line">
                      {bOrders.map((o) => (
                        <Row
                          key={o.id}
                          title={
                            <Link
                              to="/orders/$orderId"
                              params={{ orderId: o.id }}
                              className="hover:text-gold"
                            >
                              <span className="num">{o.order_no}</span> — {o.client_name}
                            </Link>
                          }
                          sub={partsOrDress(o.parts).join("، ")}
                          chips={
                            (o.event_date || o.due_date) && (
                              <Chip tone="gold">
                                {o.event_date
                                  ? `المناسبة ${fmtDate(o.event_date)}`
                                  : `التسليم ${fmtDate(o.due_date)}`}
                              </Chip>
                            )
                          }
                          action={
                            canTransfer && (
                              <SmallBtn onClick={() => onSend(b.id, [orderLine(o)])}>
                                إرسال
                              </SmallBtn>
                            )
                          }
                        />
                      ))}
                    </ul>
                    {bStock.length > 0 && <SubHead>إنتاج للمخزون</SubHead>}
                    <ul className="divide-y divide-line">
                      {bStock.map((s) => {
                        const item = itemById.get(s.item_id);
                        if (!item) return null;
                        const purpose = purposeOf(item.purpose);
                        return (
                          <Row
                            key={s.item_id}
                            title={
                              <button
                                className="text-right hover:text-gold"
                                onClick={() => onOpenItem(item, b.id)}
                              >
                                {item.name}
                              </button>
                            }
                            {...(item.parts.length ? { sub: item.parts.join("، ") } : {})}
                            chips={
                              <>
                                <Chip tone={PURPOSE_TONE[purpose]}>{PURPOSE_LABEL[purpose]}</Chip>
                                <span className="num text-[13px]">الكمية {s.qty}</span>
                              </>
                            }
                            action={
                              canTransfer && (
                                <SmallBtn onClick={() => onSend(b.id, [itemLine(item, s.qty)])}>
                                  إرسال
                                </SmallBtn>
                              )
                            }
                          />
                        );
                      })}
                    </ul>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {transfers.length > 0 && (
        <Card title="في الطريق للفروع" className="mt-5">
          <ul className="divide-y divide-line">
            {transfers.map((t) => (
              <Row
                key={t.id}
                title={
                  <>
                    <span className="num">{t.transfer_no}</span> — إلى فرع{" "}
                    {branchLabel(branches, t.to_branch_id)}
                  </>
                }
                sub={transferSummary(t)}
                chips={<Chip tone="soon">بانتظار استلام الفرع · {fmtDateTime(t.sent_at)}</Chip>}
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

const transferSummary = (t: GoodsTransferWithLines) =>
  t.goods_transfer_lines
    .map((l) =>
      l.item_id && l.checklist.length === 1 ? l.title : `${l.title} (${l.sent.join("، ")})`,
    )
    .join(" · ");

function Flow() {
  const steps = [
    "يوصل الطلب لمرحلة «التسليم للمحل»",
    "يدخل «جاهز المعمل» لفرعه تلقائيًا",
    "المعمل يأشّر القطع ويرسلها",
    "الفرع يأشّر اللي وصله ويأكد الاستلام، وتخلص المرحلة",
  ];
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2 text-[12.5px]">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span className="flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5">
            <span className="num grid size-5 place-items-center rounded-full bg-goldsoft text-[11px]">
              {i + 1}
            </span>
            {s}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground">←</span>}
        </li>
      ))}
    </ol>
  );
}

/* ===== مخزن الفرع ===== */

function BranchView({
  branch,
  branches,
  items,
  stock,
  urls,
  orders,
  incoming,
  outgoing,
  issues,
  canTransfer,
  canDeliver,
  canSell,
  canResolve,
  canSeeCost,
  onOpenItem,
  onReceive,
  onDeliver,
  onResolve,
}: {
  branch: Branch;
  branches: Branch[];
  items: GoodsItem[];
  stock: GoodsStock[];
  urls: Record<string, string>;
  orders: ReadyOrder[];
  incoming: GoodsTransferWithLines[];
  outgoing: GoodsTransferWithLines[];
  issues: PartIssue[];
  canTransfer: boolean;
  canDeliver: boolean;
  canSell: boolean;
  canResolve: boolean;
  canSeeCost: boolean;
  onOpenItem: (item: GoodsItem) => void;
  onReceive: (t: GoodsTransferWithLines) => void;
  onDeliver: (o: ReadyOrder) => void;
  onResolve: (issue: PartIssue) => void;
}) {
  const [purpose, setPurpose] = useState<GoodsPurpose | "all">("all");
  const [type, setType] = useState("all");
  const [term, setTerm] = useState("");
  const { data: sales = [] } = useSaleInvoices(canSell ? branch.id : null);

  const qty = (id: string) => qtyAt(stock, id, branch.id, false);
  const here = items.filter((it) => qty(it.id) > 0);
  const sum = (p: GoodsPurpose | "all") =>
    here
      .filter((it) => p === "all" || purposeOf(it.purpose) === p)
      .reduce((s, it) => s + qty(it.id), 0);
  const types = [...new Set(here.map((it) => it.item_type_id ?? ""))];
  const t = term.trim();
  const list = here.filter(
    (it) =>
      (purpose === "all" || purposeOf(it.purpose) === purpose) &&
      (type === "all" || (it.item_type_id ?? "") === type) &&
      (!t || it.name.includes(t) || it.code.includes(t) || (it.color ?? "").includes(t)),
  );
  const togglePurpose = (p: GoodsPurpose) => setPurpose((cur) => (cur === p ? "all" : p));
  const value = here.reduce((s, it) => s + qty(it.id) * Number(it.cost), 0);

  return (
    <>
      {incoming.length > 0 && (
        <Card title="وصلتك شحنة" className="mb-5 border-soon/60 ring-1 ring-soon/20">
          <ul className="divide-y divide-line">
            {incoming.map((tr) => (
              <Row
                key={tr.id}
                title={
                  <>
                    <span className="num">{tr.transfer_no}</span> —{" "}
                    {tr.from_workshop
                      ? "من المعمل"
                      : `من فرع ${branchLabel(branches, tr.from_branch_id)}`}
                  </>
                }
                sub={transferSummary(tr)}
                action={
                  canTransfer && (
                    <Btn className="min-h-9 px-3 text-[13px]" onClick={() => onReceive(tr)}>
                      <CheckCircle2 className="size-4" strokeWidth={1.75} /> استلام
                    </Btn>
                  )
                }
              />
            ))}
          </ul>
        </Card>
      )}

      <IssuesCard
        issues={issues}
        branches={branches}
        canResolve={canResolve}
        onResolve={onResolve}
      />

      {outgoing.length > 0 && (
        <Card title="أرسلتها لفروع ثانية" className="mb-5">
          <ul className="divide-y divide-line">
            {outgoing.map((tr) => (
              <Row
                key={tr.id}
                title={
                  <>
                    <span className="num">{tr.transfer_no}</span> — إلى فرع{" "}
                    {branchLabel(branches, tr.to_branch_id)}
                  </>
                }
                sub={transferSummary(tr)}
                chips={<Chip tone="soon">بانتظار استلامهم · {fmtDateTime(tr.sent_at)}</Chip>}
              />
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="كل القطع"
          {...(canSeeCost && value > 0 ? { hint: `قيمتها بالتكلفة ${sar(value)}` } : {})}
          value={sum("all")}
          onClick={() => setPurpose("all")}
          active={purpose === "all"}
        />
        <Stat
          label="للبيع"
          value={sum("sale")}
          tone="gold"
          onClick={() => togglePurpose("sale")}
          active={purpose === "sale"}
        />
        <Stat
          label="للعرض"
          value={sum("display")}
          onClick={() => togglePurpose("display")}
          active={purpose === "display"}
        />
        <Stat
          label="عينات"
          value={sum("sample")}
          tone="soon"
          onClick={() => togglePurpose("sample")}
          active={purpose === "sample"}
        />
      </div>

      {orders.length > 0 && (
        <Card title="جاهز للتسليم للعميلات" className="mb-5">
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <Row
                key={o.id}
                title={
                  <Link
                    to="/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="hover:text-gold"
                  >
                    <span className="num">{o.order_no}</span> — {o.client_name}
                  </Link>
                }
                sub={partsOrDress(o.parts).join("، ")}
                chips={o.event_date && <Chip tone="gold">المناسبة {fmtDate(o.event_date)}</Chip>}
                action={
                  canDeliver &&
                  (o.order_kind === "own" ? (
                    <SmallBtn onClick={() => onDeliver(o)}>تسليم للعميلة</SmallBtn>
                  ) : (
                    <Link
                      to="/orders/$orderId"
                      params={{ orderId: o.id }}
                      className="btn-quiet min-h-9 px-3 text-[13px]"
                    >
                      تسليم من صفحة الطلب
                    </Link>
                  ))
                }
              />
            ))}
          </ul>
        </Card>
      )}

      {canSell && sales.length > 0 && (
        <Card title="آخر فواتير البيع" className="mb-5">
          <ul className="divide-y divide-line">
            {sales.slice(0, 6).map((s) => (
              <li key={s.id}>
                <Link
                  to="/goods/sales/$invoiceId"
                  params={{ invoiceId: s.id }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ivory"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium">
                      <span className="num">{s.invoice_no}</span> — {s.client_name}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">
                      {fmtDate(s.issue_date)}
                    </span>
                  </span>
                  <span className="text-[13.5px] font-medium">{sar(s.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title={`البضاعة في فرع ${branch.name}`}
        action={
          <div className="relative">
            <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="field w-40 py-1.5 pr-9 text-[13px] sm:w-56"
              placeholder="اسم أو كود أو لون"
            />
          </div>
        }
      >
        {types.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
            {["all", ...types].map((k) => (
              <button
                key={k || "none"}
                onClick={() => setType(k)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12.5px]",
                  type === k
                    ? "border-gold bg-gold/10 text-gold"
                    : "border-line text-muted-foreground",
                )}
              >
                {k === "all" ? "الكل" : k ? itemTypeLabel(k) : "بدون نوع"}
              </button>
            ))}
          </div>
        )}
        {list.length === 0 ? (
          <Empty>
            {here.length === 0 ? "ما فيه بضاعة في هذا الفرع بعد." : "ما فيه قطع بهذا التصنيف."}
          </Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-4">
            {list.map((it) => {
              const p = purposeOf(it.purpose);
              const Icon = KIND_ICON(itemTypeLabel(it.item_type_id));
              const url = it.image_path ? urls[it.image_path] : undefined;
              return (
                <li key={it.id}>
                  <button
                    onClick={() => onOpenItem(it)}
                    className="block w-full rounded-xl border border-line bg-paper p-2.5 text-right transition-colors hover:border-gold/50"
                  >
                    <div className="mb-2.5 grid aspect-[4/5] place-items-center overflow-hidden rounded-lg bg-goldsoft/50 text-gold/70">
                      {url ? (
                        <img src={url} alt={it.name} className="size-full object-cover" />
                      ) : (
                        <Icon className="size-10" strokeWidth={1.1} />
                      )}
                    </div>
                    <p className="truncate text-[13.5px] font-medium">{it.name}</p>
                    <p className="num mb-2 text-[11.5px] text-muted-foreground">{it.code}</p>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <Chip tone={PURPOSE_TONE[p]}>{PURPOSE_LABEL[p]}</Chip>
                      {p !== "sale" && (
                        <Chip tone={it.sellable ? "ok" : "late"}>
                          {it.sellable ? "قابل للبيع" : "غير قابل للبيع"}
                        </Chip>
                      )}
                    </div>
                    {it.parts.length > 1 && (
                      <p className="mb-1.5 truncate text-[11.5px] text-muted-foreground">
                        معه: {it.parts.filter((x) => x !== DRESS).join("، ")}
                      </p>
                    )}
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="num">الكمية {qty(it.id)}</span>
                      {it.sellable && Number(it.price) > 0 && (
                        <span className="text-muted-foreground">{sar(it.price)}</span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ===== النواقص ===== */

function IssuesCard({
  issues,
  branches,
  showBranch,
  canResolve,
  onResolve,
  onSendMissing,
}: {
  issues: PartIssue[];
  branches: Branch[];
  showBranch?: boolean;
  canResolve: boolean;
  onResolve: (issue: PartIssue) => void;
  /** إرسال القطع اللي ما انرسلت بشحنة لاحقة (للمعمل) */
  onSendMissing?: (issue: PartIssue) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <Card title="نواقص تحتاج متابعة" className="mb-5 border-late/40 ring-1 ring-late/15">
      <ul className="divide-y divide-line">
        {issues.map((x) => (
          <Row
            key={x.id}
            title={x.title}
            sub={`${ISSUE_STAGE_LABEL[x.stage] ?? ""}: ${x.missing.join("، ")}${
              showBranch && x.branch_id ? ` — فرع ${branchLabel(branches, x.branch_id)}` : ""
            } · ${fmtDateTime(x.created_at)}`}
            chips={<Chip tone="late">{ISSUE_STAGE_CHIP[x.stage] ?? x.stage}</Chip>}
            action={
              <span className="flex gap-2">
                {onSendMissing && x.stage === "send" && x.transfer_line_id && (
                  <Btn className="min-h-9 px-3 text-[13px]" onClick={() => onSendMissing(x)}>
                    <Truck className="size-4" strokeWidth={1.75} /> إرسال الناقص
                  </Btn>
                )}
                {canResolve && <SmallBtn onClick={() => onResolve(x)}>تمت المتابعة</SmallBtn>}
              </span>
            }
          />
        ))}
      </ul>
    </Card>
  );
}

/* ===== أجزاء صغيرة ===== */

function Row({
  title,
  sub,
  chips,
  action,
}: {
  title: ReactNode;
  sub?: string;
  chips?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{title}</span>
        {sub && <span className="block text-[12px] text-muted-foreground">{sub}</span>}
      </span>
      {chips}
      {action}
    </li>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return (
    <p className="bg-ivory/60 px-4 py-1.5 text-[11.5px] font-medium text-muted-foreground">
      {children}
    </p>
  );
}

function SmallBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Btn variant="quiet" className="min-h-9 px-3 text-[13px]" onClick={onClick}>
      {children}
    </Btn>
  );
}
