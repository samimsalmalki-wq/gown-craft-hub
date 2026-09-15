import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Btn, Card, Chip, Empty, Field, Sheet } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useMaterials } from "@/lib/inventory-data";
import { qty } from "@/lib/inventory";
import { fmtDateTime } from "@/lib/atelier";
import {
  ALL_BRANCHES,
  STOCK_REQUEST_LABEL,
  branchLabel,
  stockOf,
  useBranchScope,
  useBranches,
  useCreateStockRequest,
  useDecideStockRequest,
  useMaterialStock,
  useStockRequests,
  warehouseOf,
  type StockRequest,
} from "@/lib/branches";

export const Route = createFileRoute("/_authenticated/inventory/requests")({
  component: RequestsPage,
  head: () => ({
    meta: [
      { title: "طلبات صرف الخامات | مَعْمَل" },
      {
        name: "description",
        content: "طلبات صرف الخامات من المخزن الرئيسي إلى الفروع واعتمادها.",
      },
      { property: "og:title", content: "طلبات صرف الخامات | مَعْمَل" },
      { property: "og:description", content: "طلب الخامات من المخزن الرئيسي واعتماد الصرف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RequestsPage() {
  const { isManager, can } = useCurrentAccount();
  const { writeBranchId } = useBranchScope();
  const { data: branches = [] } = useBranches();
  const { data: materials = [] } = useMaterials();
  const { data: stock = [] } = useMaterialStock(ALL_BRANCHES);
  const { data: requests = [], isLoading } = useStockRequests();
  const create = useCreateStockRequest();
  const decide = useDecideStockRequest();

  const warehouse = warehouseOf(branches);
  const canApprove = isManager || can("inventory.approve") || can("inventory.transfer");
  const canRequest = isManager || can("inventory.request") || can("inventory.manage");

  const [tab, setTab] = useState<"mine" | "pending">(canApprove ? "pending" : "mine");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ materialId: "", toBranch: "", qty: "", reason: "" });

  const salesBranchList = useMemo(() => branches.filter((b) => !b.is_warehouse), [branches]);
  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? "—";

  const list = useMemo(
    () =>
      tab === "pending"
        ? requests.filter((r) => r.status === "pending")
        : requests.filter((r) => !writeBranchId || r.to_branch_id === writeBranchId),
    [requests, tab, writeBranchId],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!warehouse) {
      toast.error("لا يوجد مخزن رئيسي");
      return;
    }
    const to = form.toBranch || writeBranchId;
    if (!to || !form.materialId) return;
    try {
      await create.mutateAsync({
        fromBranchId: warehouse.id,
        toBranchId: to,
        materialId: form.materialId,
        qty: Number(form.qty) || 0,
        reason: form.reason.trim() || null,
      });
      toast.success("تم إرسال الطلب");
      setOpen(false);
      setForm({ materialId: "", toBranch: "", qty: "", reason: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إرسال الطلب");
    }
  }

  async function act(r: StockRequest, approve: boolean) {
    const note = approve ? null : window.prompt("سبب الرفض (اختياري)") ?? null;
    try {
      await decide.mutateAsync({ id: r.id, approve, note });
      toast.success(approve ? "تم اعتماد الصرف" : "تم رفض الطلب");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر تنفيذ القرار");
    }
  }

  return (
    <AppShell
      eyebrow="المخزون"
      title="طلبات صرف الخامات"
      subtitle="يطلب الفرع الخامات من المخزن الرئيسي، وعند الاعتماد تُنقل الكمية فعليًا."
      actions={canRequest && warehouse ? <Btn onClick={() => setOpen(true)}>طلب صرف</Btn> : undefined}
    >
      <div className="flex flex-wrap gap-2">
        <Btn variant={tab === "mine" ? "gold" : "quiet"} onClick={() => setTab("mine")}>
          طلبات فرعي
        </Btn>
        {canApprove && (
          <Btn variant={tab === "pending" ? "gold" : "quiet"} onClick={() => setTab("pending")}>
            بانتظار الاعتماد
          </Btn>
        )}
      </div>

      <Card className="mt-5" title={tab === "pending" ? "طلبات بانتظار الاعتماد" : "طلبات فرعي"}>
        {isLoading ? (
          <Empty>جاري التحميل…</Empty>
        ) : list.length === 0 ? (
          <Empty>لا توجد طلبات.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                  {materialName(r.material_id)}
                </span>
                <span className="num text-[13px]">{qty(Number(r.qty))}</span>
                <Chip>{branchLabel(branches, r.to_branch_id)}</Chip>
                <Chip
                  tone={
                    r.status === "approved" ? "gold" : r.status === "rejected" ? "late" : undefined
                  }
                >
                  {STOCK_REQUEST_LABEL[r.status]}
                </Chip>
                <span className="text-[12px] text-muted-foreground">
                  {fmtDateTime(r.created_at)}
                </span>
                {r.reason && (
                  <span className="w-full text-[12px] text-muted-foreground">
                    السبب: {r.reason}
                  </span>
                )}
                {r.decision_note && (
                  <span className="w-full text-[12px] text-muted-foreground">
                    ملاحظة القرار: {r.decision_note}
                  </span>
                )}
                {canApprove && r.status === "pending" && (
                  <span className="flex gap-2">
                    <Btn
                      variant="quiet"
                      onClick={() => act(r, true)}
                      disabled={decide.isPending}
                    >
                      اعتماد
                    </Btn>
                    <Btn variant="quiet" onClick={() => act(r, false)} disabled={decide.isPending}>
                      رفض
                    </Btn>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Sheet open={open} onClose={() => setOpen(false)} title="طلب صرف من المخزن الرئيسي">
        <form onSubmit={submit} className="space-y-4 p-4">
          <Field
            label="المادة"
            hint={
              form.materialId && warehouse
                ? `المتاح في المخزن: ${qty(stockOf(stock, form.materialId, warehouse.id).available)}`
                : ""
            }
          >
            <select
              className="field w-full"
              value={form.materialId}
              onChange={(e) => setForm({ ...form, materialId: e.target.value })}
              required
            >
              <option value="">اختر المادة</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الفرع الطالب">
            <select
              className="field w-full"
              value={form.toBranch || writeBranchId || ""}
              onChange={(e) => setForm({ ...form, toBranch: e.target.value })}
              required
            >
              <option value="">اختر الفرع</option>
              {salesBranchList.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="الكمية">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="field w-full"
              value={form.qty}
              onChange={(e) => setForm({ ...form, qty: e.target.value })}
              required
            />
          </Field>
          <Field label="سبب الطلب">
            <textarea
              className="field w-full"
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>
          <Btn type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? "جاري الإرسال…" : "إرسال الطلب"}
          </Btn>
        </form>
      </Sheet>
    </AppShell>
  );
}
