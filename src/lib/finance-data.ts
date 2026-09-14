import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { ALL_BRANCHES, useBranchScope } from "./branches";
import type { Invoice, InvoiceLine, Payment, PaymentMethod, TaxSettings } from "./finance";

/** يضيف شرط الفرع على الاستعلام إن كان فرعًا محددًا */
const onBranch = <T>(q: T, branchId: string, column = "branch_id"): T =>
  branchId === ALL_BRANCHES
    ? q
    : ((q as { eq: (c: string, v: string) => T }).eq(column, branchId) as T);

/* ===== إعدادات الضريبة ===== */

export function useTaxSettings() {
  const { branchId } = useBranchScope();
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
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["payments", branchId],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await onBranch(supabase.from("payments").select("*"), branchId)
        .order("paid_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
  const { writeBranchId } = useBranchScope();
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
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["invoices", branchId],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await onBranch(
        supabase.from("invoices").select("*"),
        branchId,
      ).order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
  const { writeBranchId } = useBranchScope();
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

export function useCashAccounts() {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-accounts", branchId],
    queryFn: async () => {
      const { data, error } = await onBranch(
        supabase.from("cash_accounts").select("*").eq("is_active", true),
        branchId,
      ).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCashTransactions() {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["cash-transactions", branchId],
    queryFn: async () => {
      const { data, error } = await onBranch(
        supabase.from("cash_transactions").select("*, cash_accounts!inner(branch_id)"),
        branchId,
        "cash_accounts.branch_id",
      )
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExpenses() {
  const { branchId } = useBranchScope();
  return useQuery({
    queryKey: ["expenses", branchId],
    queryFn: async () => {
      const { data, error } = await onBranch(
        supabase.from("expenses").select("*"),
        branchId,
      ).order("occurred_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddExpense() {
  const qc = useQueryClient();
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
  return useQuery({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useJournalLines() {
  return useQuery({
    queryKey: ["journal-lines"],
    queryFn: async () => {
      const { data, error } = await supabase.from("journal_lines").select("*");
      if (error) throw error;
      return data ?? [];
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

const LEDGER_SELECT = "id, entry_id, debit, credit, memo, journal_entries!inner(entry_no, entry_date, memo, source)";

/** حركات حساب واحد داخل فترة + رصيد ما قبل الفترة */
export function useLedger(accountId: string, from: string, to: string) {
  return useQuery({
    queryKey: ["ledger", accountId, from, to],
    enabled: Boolean(accountId),
    queryFn: async (): Promise<{
      rows: LedgerRow[];
      openingDebit: number;
      openingCredit: number;
    }> => {
      const [period, before] = await Promise.all([
        supabase
          .from("journal_lines")
          .select(LEDGER_SELECT)
          .eq("account_id", accountId)
          .gte("journal_entries.entry_date", from)
          .lte("journal_entries.entry_date", to)
          .order("entry_date", { referencedTable: "journal_entries", ascending: true }),
        supabase
          .from("journal_lines")
          .select("debit, credit, journal_entries!inner(entry_date)")
          .eq("account_id", accountId)
          .lt("journal_entries.entry_date", from),
      ]);

      if (period.error) throw period.error;
      if (before.error) throw before.error;

      const raw = (period.data ?? []) as unknown as RawLedgerRow[];
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

      const prior = (before.data ?? []) as unknown as { debit: number | string; credit: number | string }[];
      return {
        rows,
        openingDebit: prior.reduce((s, l) => s + Number(l.debit), 0),
        openingCredit: prior.reduce((s, l) => s + Number(l.credit), 0),
      };
    },
  });
}

/** مجاميع المدين والدائن لكل حساب داخل فترة — لميزان المراجعة */
export function useTrialBalance(from: string, to: string) {
  return useQuery({
    queryKey: ["trial-balance", from, to],
    queryFn: async (): Promise<Record<string, { debit: number; credit: number }>> => {
      const { data, error } = await supabase
        .from("journal_lines")
        .select("account_id, debit, credit, journal_entries!inner(entry_date)")
        .gte("journal_entries.entry_date", from)
        .lte("journal_entries.entry_date", to);
      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        account_id: string;
        debit: number | string;
        credit: number | string;
      }[];

      const totals: Record<string, { debit: number; credit: number }> = {};
      for (const r of rows) {
        const t = (totals[r.account_id] ??= { debit: 0, credit: 0 });
        t.debit += Number(r.debit);
        t.credit += Number(r.credit);
      }
      return totals;
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
