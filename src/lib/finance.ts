import type { Database } from "@/integrations/supabase/types";
import type { Order } from "./atelier";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
export type InvoiceLine = Database["public"]["Tables"]["invoice_lines"]["Row"];
export type TaxSettings = Database["public"]["Tables"]["tax_settings"]["Row"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type InvoiceStatus = Database["public"]["Enums"]["invoice_status"];
export type FinanceScope = Database["public"]["Enums"]["finance_scope"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "نقدًا",
  card: "شبكة",
  transfer: "تحويل بنكي",
  other: "أخرى",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "مسودة",
  issued: "صادرة",
  cancelled: "ملغاة",
};

export const FINANCE_SCOPE_LABEL: Record<FinanceScope, string> = {
  order: "تفصيل",
  rental: "إيجار",
  sale: "بيع بضاعة",
};

/** المستحق على الطلب = القيمة − ما تم تحصيله */
export const orderDue = (o: Pick<Order, "total_amount" | "deposit_amount">) =>
  Math.max(0, Number(o.total_amount) - Number(o.deposit_amount));

export const collected = (rows: Pick<Payment, "amount">[]) =>
  rows.reduce((sum, p) => sum + Number(p.amount), 0);

export const vatOf = (subtotal: number, rate: number) =>
  Math.round(((subtotal * rate) / 100) * 100) / 100;

export const monthKey = (v: string) => v.slice(0, 7);

export const monthLabel = (key: string) => {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("ar-EG", {
    month: "long",
    year: "numeric",
  });
};

export const inRange = (date: string, from: string, to: string) => date >= from && date <= to;

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const monthStartISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

/* ===== المصروفات والصناديق ===== */

export type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
export type ExpenseCategory = Database["public"]["Tables"]["expense_categories"]["Row"];
export type CashAccount = Database["public"]["Tables"]["cash_accounts"]["Row"];
export type CashTransaction = Database["public"]["Tables"]["cash_transactions"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type CashAccountKind = Database["public"]["Enums"]["cash_account_kind"];

export const CASH_KIND_LABEL: Record<CashAccountKind, string> = {
  cash: "نقدي",
  card: "شبكة",
  bank: "بنكي",
};

/** رصيد الصندوق = الرصيد الافتتاحي + المقبوضات − المدفوعات */
export const cashBalance = (
  account: Pick<CashAccount, "id" | "opening_balance">,
  txs: Pick<CashTransaction, "account_id" | "direction" | "amount">[],
) =>
  txs
    .filter((t) => t.account_id === account.id)
    .reduce(
      (sum, t) => sum + (t.direction === "in" ? Number(t.amount) : -Number(t.amount)),
      Number(account.opening_balance),
    );

/* ===== دليل الحسابات والقيود ===== */

export type GlAccount = Database["public"]["Tables"]["gl_accounts"]["Row"];
export type JournalEntry = Database["public"]["Tables"]["journal_entries"]["Row"];
export type JournalLine = Database["public"]["Tables"]["journal_lines"]["Row"];
export type GlAccountType = Database["public"]["Enums"]["gl_account_type"];

export const ACCOUNT_TYPE_LABEL: Record<GlAccountType, string> = {
  asset: "أصول",
  liability: "التزامات",
  equity: "حقوق ملكية",
  revenue: "إيرادات",
  cost: "تكلفة إيراد",
  expense: "مصاريف تشغيل",
};

export const ENTRY_SOURCE_LABEL: Record<string, string> = {
  manual: "قيد يدوي",
  payment: "سند قبض",
  expense: "مصروف",
  invoice: "فاتورة",
  material_out: "صرف خامات",
  order_delivered: "تسليم طلب",
  rental_delivered: "تسليم فستان إيجار",
  rental_return: "إرجاع فستان إيجار",
  rental_cancel: "إلغاء حجز إيجار",
  invoice_fix: "تصحيح فاتورة",
  invoice_cancel: "إلغاء فاتورة",
  transfer: "تحويل بين الصناديق",
  opening_balance: "رصيد افتتاحي",
  sale: "بيع بضاعة",
  sale_return: "مرتجع بيع",
  material_out_fix: "تصحيح صرف خامات",
};

/** الرصيد بالطبيعة: الأصول والمصاريف مدينة، والباقي دائن */
export const naturalBalance = (type: GlAccountType, debit: number, credit: number) =>
  type === "asset" || type === "expense" || type === "cost" ? debit - credit : credit - debit;

/** يبني الرصيد المتسلسل لحركات حساب واحد بحسب طبيعة الحساب */
export const runningLedger = <T extends { debit: number; credit: number }>(
  type: GlAccountType,
  opening: number,
  rows: T[],
): (T & { balance: number })[] => {
  let balance = opening;
  return rows.map((r) => {
    balance += naturalBalance(type, r.debit, r.credit);
    return { ...r, balance };
  });
};

/* ===== ميزان المراجعة ===== */

export type TrialRow = {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  debit: number;
  credit: number;
  balance: number;
};

export type TrialGroup = {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  rows: TrialRow[];
  debit: number;
  credit: number;
  balance: number;
};

/** يبني ميزان المراجعة: صفوف كل حساب فرعي تحت مجموعته + المجاميع */
export const buildTrialBalance = (
  accounts: Pick<GlAccount, "id" | "code" | "name" | "type" | "is_group" | "parent_id">[],
  totals: Record<string, { debit: number; credit: number }>,
  hideEmpty: boolean,
) => {
  const groups: TrialGroup[] = accounts
    .filter((a) => a.is_group)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((g) => {
      const rows: TrialRow[] = accounts
        .filter((a) => !a.is_group && a.parent_id === g.id)
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((a) => {
          const t = totals[a.id] ?? { debit: 0, credit: 0 };
          return {
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type,
            debit: t.debit,
            credit: t.credit,
            balance: naturalBalance(a.type, t.debit, t.credit),
          };
        })
        .filter((r) => !hideEmpty || r.debit !== 0 || r.credit !== 0);

      return {
        id: g.id,
        code: g.code,
        name: g.name,
        type: g.type,
        rows,
        debit: rows.reduce((s, r) => s + r.debit, 0),
        credit: rows.reduce((s, r) => s + r.credit, 0),
        balance: rows.reduce((s, r) => s + r.balance, 0),
      };
    })
    .filter((g) => !hideEmpty || g.rows.length > 0);

  return {
    groups,
    totalDebit: groups.reduce((s, g) => s + g.debit, 0),
    totalCredit: groups.reduce((s, g) => s + g.credit, 0),
  };
};

export const agingBucket = (daysLate: number) => {
  if (daysLate <= 0) return "لم يستحق";
  if (daysLate <= 30) return "1 – 30 يومًا";
  if (daysLate <= 60) return "31 – 60 يومًا";
  if (daysLate <= 90) return "61 – 90 يومًا";
  return "أكثر من 90 يومًا";
};

export const AGING_BUCKETS = [
  "لم يستحق",
  "1 – 30 يومًا",
  "31 – 60 يومًا",
  "61 – 90 يومًا",
  "أكثر من 90 يومًا",
];
