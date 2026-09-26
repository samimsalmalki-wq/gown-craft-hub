import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ALL_BRANCHES, useBranchScope } from "./branches";
import { fetchAll } from "./fetch-all";
import type { Invoice, InvoiceLine, Payment, PaymentMethod, TaxSettings } from "./finance";

/** يضيف شرط الفرع على الاستعلام إن كان فرعًا محددًا */
const onBranch = <T>(q: T, branchId: string, column = "branch_id"): T =>
  branchId === ALL_BRANCHES
    ? q
    : ((q as { eq: (c: string, v: string) => T }).eq(column, branchId) as T);

/* ===== إعدادات الضريبة ===== */

export function useTaxSettings() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["tax-settings", branchId],
    queryFn: async (): Promise<TaxSettings | null> => {
      const { data, error } = await onBranch(
        supabase.from("tax_settings").select("*"),
        branchId,
      ).limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}

export function useUpdateTaxSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("tax_settings").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax-settings"] }),
  });
}

/* ===== الدفعات وسندات القبض ===== */

export function usePayments() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["payments", branchId],
    queryFn: async (): Promise<Payment[]> => {
      return fetchAll<Payment>((a, b) =>
        onBranch(supabase.from("payments").select("*"), branchId)
          .order("paid_at", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
    },
  });
}

export function useOrderPayments(orderId: string) {
  return useQuery({
    queryKey: ["payments", "order", orderId],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("order_id", orderId)
        .order("paid_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRentalPayments(rentalId: string) {
  return useQuery({
    queryKey: ["payments", "rental", rentalId],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
        .eq("rental_record_id", rentalId)
        .order("paid_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type NewPayment = {
  scope?: "order" | "rental";
  orderId?: string;
  rentalRecordId?: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string | undefined;
  notes?: string | undefined;
  cashAccountId?: string | undefined;
  branchId?: string | null | undefined;
};

export function useAddPayment() {
  const qc = useQueryClient();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async (input: NewPayment) => {
      if (!(input.amount > 0)) throw new Error("اكتب مبلغًا أكبر من صفر");
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("payments")
        .insert({
          scope: input.scope ?? "order",
          order_id: input.orderId ?? null,
          rental_record_id: input.rentalRecordId ?? null,
          amount: input.amount,
          method: input.method,
          paid_at: input.paidAt,
          reference: input.reference?.trim() || null,
          notes: input.notes?.trim() || null,
          cash_account_id: input.cashAccountId || null,
          branch_id: input.branchId ?? writeBranchId,
          created_by: auth.user?.id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;
      return data as Payment;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["cash-transactions"] });
    },
  });
}

/* ===== الفواتير ===== */

export function useInvoices() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["invoices", branchId],
    queryFn: async (): Promise<Invoice[]> => {
      return fetchAll<Invoice>((a, b) =>
        onBranch(supabase.from("invoices").select("*"), branchId)
          .order("issue_date", { ascending: false })
          .order("id")
          .range(a, b),
      );
    },
  });
}

export function useInvoice(invoiceId: string) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async (): Promise<Invoice | null> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useInvoiceLines(invoiceId: string) {
  return useQuery({
    queryKey: ["invoice-lines", invoiceId],
    queryFn: async (): Promise<InvoiceLine[]> => {
      const { data, error } = await supabase
        .from("invoice_lines")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async (input: {
      scope?: "order" | "rental";
      orderId?: string;
      rentalRecordId?: string;
      isTaxable: boolean;
      vatRate: number;
      lines: { description: string; qty: number; unit_price: number }[];
      notes?: string;
      branchId?: string | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { data: invoice, error } = await supabase
        .from("invoices")
        .insert({
          scope: input.scope ?? "order",
          order_id: input.orderId ?? null,
          rental_record_id: input.rentalRecordId ?? null,
          is_taxable: input.isTaxable,
          vat_rate: input.vatRate,
          notes: input.notes?.trim() || null,
          branch_id: input.branchId ?? writeBranchId,
          created_by: auth.user?.id ?? null,
        } as never)
        .select()
        .single();
      if (error) throw error;

      const lines = input.lines.filter((l) => l.description.trim());
      if (lines.length) {
        const { error: lineError } = await supabase.from("invoice_lines").insert(
          lines.map((l, i) => ({
            invoice_id: (invoice as Invoice).id,
            description: l.description.trim(),
            qty: l.qty,
            unit_price: l.unit_price,
            position: i + 1,
          })) as never,
        );
        if (lineError) throw lineError;
      }
      return invoice as Invoice;
    },
    onSuccess: (inv) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice", inv.id] });
    },
  });
}

export function useUpdateInvoice(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("invoices").update(patch as never).eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useAddInvoiceLine(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (line: { description: string; qty: number; unit_price: number }) => {
      if (!line.description.trim()) throw new Error("اكتب وصف البند");
      const { count } = await supabase
        .from("invoice_lines")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoiceId);
      const { error } = await supabase.from("invoice_lines").insert({
        invoice_id: invoiceId,
        description: line.description.trim(),
        qty: line.qty,
        unit_price: line.unit_price,
        position: (count ?? 0) + 1,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-lines", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}

export function useDeleteInvoiceLine(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase.from("invoice_lines").delete().eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice-lines", invoiceId] });
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });
}

/* ===== المصروفات والصناديق والموردون ===== */

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string; tax_number?: string }) => {
      if (!input.name.trim()) throw new Error("اسم المورد مطلوب");
      const { error } = await supabase.from("suppliers").insert({
        name: input.name.trim(),
        phone: input.phone?.trim() || null,
        tax_number: input.tax_number?.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("suppliers").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

/** كل تصنيفات المصروفات بما فيها المعطّلة — لشاشة الإعدادات */
export function useAllExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("expense_categories")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-categories"] }),
  });
}

/** كل الصناديق بما فيها المعطّلة — لشاشة الإعدادات */
export function useAllCashAccounts() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-accounts", "all", branchId],
    queryFn: async () => {
      const { data, error } = await onBranch(
        supabase.from("cash_accounts").select("*"),
        branchId,
      ).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveCashAccount() {
  const qc = useQueryClient();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      kind: "cash" | "card" | "bank";
      gl_code: string;
      opening_balance: number;
      branch_id?: string | null;
      notes?: string | null;
      is_active?: boolean;
    }) => {
      const { id, ...rest } = input;
      if (!rest.name.trim()) throw new Error("اسم الصندوق مطلوب");
      if (id) {
        const { error } = await supabase
          .from("cash_accounts")
          .update({ ...rest, name: rest.name.trim() } as never)
          .eq("id", id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("cash_accounts").insert({
        ...rest,
        name: rest.name.trim(),
        branch_id: rest.branch_id ?? writeBranchId,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cash-accounts"] }),
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .eq("is_active", true)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!name.trim()) throw new Error("اسم التصنيف مطلوب");
      const max = await supabase
        .from("expense_categories")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from("expense_categories").insert({
        name: name.trim(),
        position: (max.data?.position ?? 0) + 1,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-categories"] }),
  });
}

/** صناديق القبض والصرف العادية (بدون صناديق التأمينات، فهي أمانات للعميلات) */
export function useCashAccounts() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-accounts", branchId],
    queryFn: async () => {
      const { data, error } = await onBranch(
        supabase
          .from("cash_accounts")
          .select("*")
          .eq("is_active", true)
          .eq("is_deposit_box", false),
        branchId,
      ).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCashTransactions() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-transactions", branchId],
    queryFn: async () => {
      return fetchAll((a, b) =>
        onBranch(
          supabase.from("cash_transactions").select("*, cash_accounts!inner(branch_id)"),
          branchId,
          "cash_accounts.branch_id",
        )
          .order("occurred_at", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
    },
  });
}

export function useExpenses() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["expenses", branchId],
    queryFn: async () => {
      return fetchAll((a, b) =>
        onBranch(supabase.from("expenses").select("*"), branchId)
          .order("occurred_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
  const { opsWriteBranchId: writeBranchId } = useBranchScope();
  return useMutation({
    mutationFn: async (input: {
      description: string;
      amount: number;
      occurredAt: string;
      categoryId?: string | undefined;
      supplierId?: string | undefined;
      cashAccountId?: string | undefined;
      isTaxable: boolean;
      reference?: string | undefined;
      materialId?: string | undefined;
      materialQty?: number | undefined;
    }) => {
      if (!input.description.trim()) throw new Error("اكتب وصف المصروف");
      if (!(input.amount > 0)) throw new Error("اكتب مبلغًا أكبر من صفر");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("expenses").insert({
        description: input.description.trim(),
        amount: input.amount,
        occurred_at: input.occurredAt,
        category_id: input.categoryId || null,
        supplier_id: input.supplierId || null,
        cash_account_id: input.cashAccountId || null,
        is_taxable: input.isTaxable,
        reference: input.reference?.trim() || null,
        material_id: input.materialId || null,
        material_qty: input.materialQty ?? null,
        branch_id: writeBranchId,
        created_by: auth.user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["cash-transactions"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/* ===== دليل الحسابات والقيود ===== */

export function useGlAccounts() {
  return useQuery({
    queryKey: ["gl-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gl_accounts").select("*").order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddGlAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      name: string;
      type: string;
      parentId?: string | undefined;
    }) => {
      if (!/^\d{3,6}$/.test(input.code.trim())) throw new Error("رقم الحساب يجب أن يكون أرقامًا");
      if (!input.name.trim()) throw new Error("اسم الحساب مطلوب");
      const { error } = await supabase.from("gl_accounts").insert({
        code: input.code.trim(),
        name: input.name.trim(),
        type: input.type,
        parent_id: input.parentId || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gl-accounts"] }),
  });
}

export function useUpdateGlAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("gl_accounts").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gl-accounts"] }),
  });
}

export function useJournalEntries() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["journal-entries", branchId],
    queryFn: async () => {
      return fetchAll((a, b) =>
        onBranch(supabase.from("journal_entries").select("*"), branchId)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(a, b),
      );
    },
  });
}

export function useJournalLines() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["journal-lines", branchId],
    queryFn: async () => {
      return fetchAll((a, b) =>
        onBranch(
          supabase.from("journal_lines").select("*, journal_entries!inner(branch_id)"),
          branchId,
          "journal_entries.branch_id",
        )
          .order("id")
          .range(a, b),
      );
    },
  });
}

export function useAddJournalEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entryDate: string;
      memo: string;
      lines: { code: string; debit: number; credit: number; memo?: string }[];
    }) => {
      const lines = input.lines.filter((l) => l.code && (l.debit > 0 || l.credit > 0));
      if (lines.length < 2) throw new Error("القيد يحتاج سطرين على الأقل");
      const debit = lines.reduce((s, l) => s + l.debit, 0);
      const credit = lines.reduce((s, l) => s + l.credit, 0);
      if (Math.round(debit * 100) !== Math.round(credit * 100))
        throw new Error("مجموع المدين لا يساوي مجموع الدائن");

      const { error } = await supabase.rpc("add_journal_entry", {
        _entry_date: input.entryDate,
        _memo: input.memo,
        _lines: lines as never,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal-entries"] });
      qc.invalidateQueries({ queryKey: ["journal-lines"] });
    },
  });
}

/* ===== مجاميع الحسابات (تُحسب في قاعدة البيانات) ===== */

const dayBefore = (day: string) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** مدين ودائن كل حساب في فترة (أو كل الفترات إن لم تُحدَّد) */
async function accountTotals(
  from: string | null,
  to: string | null,
  branchId: string,
): Promise<Record<string, { debit: number; credit: number }>> {
  const { data, error } = await supabase.rpc("finance_account_totals", {
    ...(from ? { p_from: from } : {}),
    ...(to ? { p_to: to } : {}),
    ...(branchId !== ALL_BRANCHES ? { p_branch: branchId } : {}),
  });
  if (error) throw error;
  const totals: Record<string, { debit: number; credit: number }> = {};
  for (const r of data ?? []) {
    totals[r.account_id] = { debit: Number(r.debit), credit: Number(r.credit) };
  }
  return totals;
}

/** مجاميع الحسابات لفترة — لدليل الحسابات وقائمة الدخل */
export function useAccountTotals(from: string | null = null, to: string | null = null) {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["account-totals", from, to, branchId],
    queryFn: () => accountTotals(from, to, branchId),
  });
}

/** أرصدة الصناديق (ومنها صناديق التأمينات) = الافتتاحي + المقبوض − المصروف */
export function useCashBoxBalances() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-box-balances", branchId],
    queryFn: async () => {
      const [accounts, totals] = await Promise.all([
        onBranch(supabase.from("cash_accounts").select("*").eq("is_active", true), branchId).order(
          "created_at",
        ),
        supabase.rpc(
          "cash_box_totals",
          branchId !== ALL_BRANCHES ? { p_branch: branchId } : {},
        ),
      ]);
      if (accounts.error) throw accounts.error;
      if (totals.error) throw totals.error;
      return (accounts.data ?? []).map((a) => {
        const t = (totals.data ?? []).find((x) => x.account_id === a.id);
        const totalIn = Number(t?.total_in ?? 0);
        const totalOut = Number(t?.total_out ?? 0);
        return { account: a, totalIn, totalOut, balance: Number(a.opening_balance) + totalIn - totalOut };
      });
    },
  });
}

/** التحويل بين الصناديق (مثل إيداع كاش الصندوق في البنك) */
export function useTransferCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      from: string;
      to: string;
      amount: number;
      date: string;
      note: string | null;
    }) => {
      const { error } = await supabase.rpc("transfer_cash", {
        p_from: input.from,
        p_to: input.to,
        p_amount: input.amount,
        p_date: input.date,
        ...(input.note ? { p_note: input.note } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const key of ["cash-transactions", "cash-box-balances", "journal-entries", "journal-lines", "account-totals"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

/** سندات الصرف (رد التأمين ورد مبالغ الإلغاء) */
export function useCashVouchers() {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-vouchers", branchId],
    queryFn: () =>
      fetchAll((a, b) =>
        onBranch(supabase.from("cash_vouchers").select("*"), branchId)
          .order("paid_at", { ascending: false })
          .order("id")
          .range(a, b),
      ),
  });
}

/* ===== دفتر الأستاذ ===== */

export type LedgerRow = {
  id: string;
  entry_id: string;
  debit: number;
  credit: number;
  memo: string | null;
  entry_no: string;
  entry_date: string;
  entry_memo: string;
  source: string;
};

type RawLedgerRow = {
  id: string;
  entry_id: string;
  debit: number | string;
  credit: number | string;
  memo: string | null;
  journal_entries: {
    entry_no: string;
    entry_date: string;
    memo: string;
    source: string;
  } | null;
};

const LEDGER_SELECT =
  "id, entry_id, debit, credit, memo, journal_entries!inner(entry_no, entry_date, memo, source, branch_id)";

/** حركات حساب واحد داخل فترة + رصيد ما قبل الفترة */
export function useLedger(accountId: string, from: string, to: string) {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["ledger", accountId, from, to, branchId],
    enabled: Boolean(accountId),
    queryFn: async (): Promise<{
      rows: LedgerRow[];
      openingDebit: number;
      openingCredit: number;
    }> => {
      const [period, before] = await Promise.all([
        fetchAll((a, b) =>
          onBranch(
            supabase
              .from("journal_lines")
              .select(LEDGER_SELECT)
              .eq("account_id", accountId)
              .gte("journal_entries.entry_date", from)
              .lte("journal_entries.entry_date", to),
            branchId,
            "journal_entries.branch_id",
          )
            .order("id")
            .range(a, b),
        ),
        accountTotals(null, dayBefore(from), branchId),
      ]);

      const raw = period as unknown as RawLedgerRow[];
      const rows: LedgerRow[] = raw
        .map((l) => ({
          id: l.id,
          entry_id: l.entry_id,
          debit: Number(l.debit),
          credit: Number(l.credit),
          memo: l.memo,
          entry_no: l.journal_entries?.entry_no ?? "",
          entry_date: l.journal_entries?.entry_date ?? "",
          entry_memo: l.journal_entries?.memo ?? "",
          source: l.journal_entries?.source ?? "manual",
        }))
        .sort((a, b) =>
          a.entry_date === b.entry_date
            ? a.entry_no.localeCompare(b.entry_no)
            : a.entry_date.localeCompare(b.entry_date),
        );

      const prior = before[accountId] ?? { debit: 0, credit: 0 };
      return { rows, openingDebit: prior.debit, openingCredit: prior.credit };
    },
  });
}

/** مجاميع المدين والدائن لكل حساب داخل فترة — لميزان المراجعة */
export function useTrialBalance(from: string, to: string) {
  const { opsBranchId: branchId } = useBranchScope();
  return useQuery({
    queryKey: ["trial-balance", from, to, branchId],
    queryFn: async (): Promise<Record<string, { debit: number; credit: number }>> => {
      return accountTotals(from, to, branchId);
    },
  });
}

/** كل مواد الطلبات — لحساب تكلفة الخامات وربحية كل طلب */
export function useAllOrderMaterials() {
  return useQuery({
    queryKey: ["order-materials", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_materials")
        .select("order_id, material_id, qty_issued");
      if (error) throw error;
      return data ?? [];
    },
  });
}
