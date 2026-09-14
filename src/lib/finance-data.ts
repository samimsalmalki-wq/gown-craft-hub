import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Invoice, InvoiceLine, Payment, PaymentMethod, TaxSettings } from "./finance";

/* ===== إعدادات الضريبة ===== */

export function useTaxSettings() {
  return useQuery({
    queryKey: ["tax-settings"],
    queryFn: async (): Promise<TaxSettings | null> => {
      const { data, error } = await supabase.from("tax_settings").select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data;
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
  return useQuery({
    queryKey: ["payments"],
    queryFn: async (): Promise<Payment[]> => {
      const { data, error } = await supabase
        .from("payments")
        .select("*")
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
  reference?: string;
  notes?: string;
};

export function useAddPayment() {
  const qc = useQueryClient();
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
    },
  });
}

/* ===== الفواتير ===== */

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issue_date", { ascending: false });
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
  return useMutation({
    mutationFn: async (input: {
      scope?: "order" | "rental";
      orderId?: string;
      rentalRecordId?: string;
      isTaxable: boolean;
      vatRate: number;
      lines: { description: string; qty: number; unit_price: number }[];
      notes?: string;
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
  return useQuery({
    queryKey: ["cash-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_accounts")
        .select("*")
        .eq("is_active", true)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCashTransactions() {
  return useQuery({
    queryKey: ["cash-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_transactions")
        .select("*")
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExpenses() {
  return useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .order("occurred_at", { ascending: false });
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
      categoryId?: string;
      supplierId?: string;
      cashAccountId?: string;
      isTaxable: boolean;
      reference?: string;
      materialId?: string;
      materialQty?: number;
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
