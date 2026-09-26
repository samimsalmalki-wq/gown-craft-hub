import type { Database } from "@/integrations/supabase/types";
import { fmtDate, money } from "./atelier";
import { PAYMENT_METHOD_LABEL } from "./finance";
import { rentalMoney, type RentalDress, type RentalRecord } from "./inventory";
import { A5, canvasToPdf } from "./pdf";
import { fillTemplate, rentalVars } from "./whatsapp";

export type ReceiptKind = "received" | "refunded";

export type ReceiptTemplate = Database["public"]["Tables"]["receipt_templates"]["Row"];

/** ما يعدّله المدير من نصوص الإيصال ومحتواه */
export type ReceiptContent = Pick<
  ReceiptTemplate,
  | "title"
  | "subtitle"
  | "amount_label"
  | "fields"
  | "terms"
  | "note"
  | "show_signatures"
  | "customer_signature_label"
  | "staff_signature_label"
  | "show_staff_name"
  | "footer"
>;

export const receiptTemplateKey = (kind: ReceiptKind) =>
  kind === "received" ? "deposit_received" : "deposit_refunded";

export type ReceiptShop = {
  name: string;
  branchName?: string | null;
  address?: string | null;
  phone?: string | null;
  taxNumber?: string | null;
};

/** البيانات التي يمكن إظهارها في الإيصال بالترتيب */
export const RECEIPT_FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "اسم العميلة" },
  { key: "client_phone", label: "رقم الجوال" },
  { key: "dress_code", label: "كود الفستان" },
  { key: "invoice_no", label: "رقم الفاتورة" },
  { key: "out_date", label: "موعد الخروج" },
  { key: "delivered_date", label: "تاريخ الاستلام" },
  { key: "due_date", label: "موعد إرجاع الفستان" },
  { key: "returned_date", label: "تاريخ الإرجاع" },
  { key: "rent_amount", label: "قيمة الإيجار" },
];

/** الحقول الجاهزة في نص الإقرار والملاحظة والتذييل */
export const RECEIPT_VARS: { key: string; label: string }[] = [
  { key: "client_name", label: "اسم العميلة" },
  { key: "dress_code", label: "كود الفستان" },
  { key: "invoice_no", label: "رقم الفاتورة" },
  { key: "deposit_paid", label: "التأمين المستلم" },
  { key: "damage_amount", label: "خصم التلف" },
  { key: "deposit_refund", label: "المبلغ المسترد" },
  { key: "return_due_date", label: "موعد الإرجاع" },
  { key: "delivered_date", label: "تاريخ الاستلام" },
  { key: "returned_date", label: "تاريخ الإرجاع" },
  { key: "shop_name", label: "اسم المنشأة" },
  { key: "issued_at", label: "وقت إصدار الإيصال" },
];

export const DEFAULT_RECEIPT_CONTENT: Record<ReceiptKind, ReceiptContent> = {
  received: {
    title: "إيصال استلام تأمين",
    subtitle: "فستان إيجار",
    amount_label: "مبلغ التأمين المستلم",
    fields: [
      "client_name",
      "client_phone",
      "dress_code",
      "invoice_no",
      "delivered_date",
      "due_date",
    ],
    terms:
      "استلمنا من العميلة المذكورة أعلاه مبلغ التأمين عن فستان الإيجار، وهو أمانة لدينا تُرد لها عند إرجاع الفستان بحالته في الموعد المحدد، ويُخصم منها ما يلزم للتلف أو التنظيف.",
    note: null,
    show_signatures: true,
    customer_signature_label: "توقيع العميلة",
    staff_signature_label: "الموظف/ة",
    show_staff_name: true,
    footer: "صدر من نظام مَعْمَل · {issued_at}",
  },
  refunded: {
    title: "إيصال رد تأمين",
    subtitle: "فستان إيجار",
    amount_label: "المبلغ المسترد للعميلة",
    fields: [
      "client_name",
      "client_phone",
      "dress_code",
      "invoice_no",
      "delivered_date",
      "returned_date",
    ],
    terms:
      "استلمنا فستان الإيجار من العميلة، ورُدّ لها مبلغ التأمين بعد خصم ما ذُكر أعلاه، وبذلك تبرأ ذمة الطرفين فيما يخص هذا التأمين.",
    note: null,
    show_signatures: true,
    customer_signature_label: "توقيع العميلة",
    staff_signature_label: "الموظف/ة",
    show_staff_name: true,
    footer: "صدر من نظام مَعْمَل · {issued_at}",
  },
};

type Line = { label: string; value: string };

export type DepositReceiptData = {
  shop: ReceiptShop;
  title: string;
  subtitle: string | null;
  numberLabel: string;
  number: string;
  date: string;
  details: Line[];
  breakdown: Line[];
  amountLabel: string;
  amount: string;
  method: string;
  terms: string | null;
  note: string | null;
  signatures: { customer: string; staff: string } | null;
  footer: string | null;
  fileName: string;
};

/** بيانات الإيصال من عقد الإيجار ونصوص الإعدادات */
export function buildDepositReceipt(
  kind: ReceiptKind,
  record: RentalRecord,
  dress: Pick<RentalDress, "code"> | null | undefined,
  shop: ReceiptShop,
  employee: string | null,
  content: ReceiptContent = DEFAULT_RECEIPT_CONTENT[kind],
): DepositReceiptData {
  const m = rentalMoney(record);
  const method = (v: RentalRecord["deposit_method"]) => (v ? PAYMENT_METHOD_LABEL[v] : "—");
  const values: Record<string, string> = {
    client_name: record.client_name,
    client_phone: record.client_phone ?? "—",
    dress_code: dress?.code ?? "—",
    invoice_no: record.external_invoice_no ?? "—",
    out_date: fmtDate(record.out_date),
    delivered_date: fmtDate(record.delivered_at),
    due_date: fmtDate(record.due_date),
    returned_date: fmtDate(record.returned_at),
    rent_amount: money(record.amount),
  };
  const vars: Record<string, string> = {
    ...rentalVars(record, dress),
    shop_name: shop.name,
    issued_at: new Date().toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }),
  };
  const fill = (s: string | null) => (s && s.trim() ? fillTemplate(s, vars) : null);

  const details = content.fields
    .map((key) => {
      const field = RECEIPT_FIELDS.find((f) => f.key === key);
      return field ? { label: field.label, value: values[key] ?? "—" } : null;
    })
    .filter((row): row is Line => row !== null);

  const received = kind === "received";
  const number = (received ? record.deposit_receipt_no : record.refund_voucher_no) ?? "—";
  const staff =
    content.show_staff_name && employee
      ? `${content.staff_signature_label}: ${employee}`
      : content.staff_signature_label;

  return {
    shop,
    title: content.title,
    subtitle: content.subtitle?.trim() || null,
    numberLabel: received ? "رقم سند القبض" : "رقم سند الصرف",
    number,
    date: fmtDate(received ? record.delivered_at : record.returned_at),
    details,
    breakdown: received
      ? []
      : [
          { label: "التأمين المستلم", value: money(m.depositPaid) },
          { label: "خصم تلف أو تنظيف", value: money(m.damage) },
        ],
    amountLabel: content.amount_label,
    amount: money(received ? m.depositPaid : m.depositRefunded),
    method: method(received ? record.deposit_method : record.refund_method),
    terms: fill(content.terms),
    note: fill(content.note),
    signatures: content.show_signatures
      ? { customer: content.customer_signature_label, staff }
      : null,
    footer: fill(content.footer),
    fileName: `${received ? "ايصال-استلام-تأمين" : "ايصال-رد-تأمين"}-${number}.pdf`,
  };
}

/* ===== الرسم ===== */

const W = 1240;
const MIN_H = 1754; // نسبة A5
const M = 96;
const FONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
const INK = "#2a2622";
const MUTED = "#7a7266";
const GOLD = "#9a7a45";
const LINE = "#e4dcc6";
const IVORY = "#f7f2e6";

function painter(ctx: CanvasRenderingContext2D) {
  const right = W - M;
  const left = M;
  const text = (
    s: string,
    x: number,
    y: number,
    size: number,
    weight = 400,
    color = INK,
    align: CanvasTextAlign = "right",
  ) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  const rule = (y: number, color = LINE, width = 2) => {
    ctx.fillStyle = color;
    ctx.fillRect(left, y, right - left, width);
  };
  const wrap = (s: string, size: number, maxWidth: number) => {
    ctx.font = `400 ${size}px ${FONT}`;
    const lines: string[] = [];
    for (const paragraph of s.split(/\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      lines.push(line);
    }
    return lines;
  };
  return { right, left, text, rule, wrap };
}

function prepare(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("المتصفح لا يدعم إنشاء الإيصال");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.direction = "rtl";
  ctx.textBaseline = "alphabetic";
  return ctx;
}

/** يرسم الإيصال على canvas (للمعاينة وللتحويل إلى PDF) */
export async function drawDepositReceipt(d: DepositReceiptData): Promise<HTMLCanvasElement> {
  try {
    await Promise.all([
      document.fonts.load(`400 28px ${FONT}`),
      document.fonts.load(`700 28px ${FONT}`),
    ]);
  } catch {
    // نكمل بالخط البديل
  }

  // الجزء العلوي على لوحة طويلة، ثم نقصّه بالطول المطلوب ونضيف التوقيعات والتذييل
  const draft = document.createElement("canvas");
  draft.width = W;
  draft.height = 4000;
  const ctx = prepare(draft);
  const { right, left, text, rule, wrap } = painter(ctx);

  // الرأس: المنشأة وعنوان الإيصال
  let y = M + 40;
  text(d.shop.name, right, y, 46, 700);
  text(d.title, left, y, 38, 700, GOLD, "left");
  const branch =
    d.shop.branchName && d.shop.branchName !== d.shop.name
      ? d.shop.branchName.startsWith("فرع")
        ? d.shop.branchName
        : `فرع ${d.shop.branchName}`
      : null;
  const sub = [branch, d.shop.address, d.shop.phone ? `هاتف ${d.shop.phone}` : null].filter(
    Boolean,
  ) as string[];
  y += 50;
  if (sub.length) text(sub.join("  ·  "), right, y, 24, 400, MUTED);
  if (d.subtitle) text(d.subtitle, left, y, 24, 400, MUTED, "left");
  if (d.shop.taxNumber) {
    y += 38;
    text(`الرقم الضريبي ${d.shop.taxNumber}`, right, y, 24, 400, MUTED);
  }
  y += 34;
  rule(y, GOLD, 3);

  // رقم السند والتاريخ
  y += 72;
  text(d.numberLabel, right, y, 24, 400, MUTED);
  text("التاريخ", left + 330, y, 24, 400, MUTED, "left");
  y += 46;
  text(d.number, right, y, 34, 700);
  text(d.date, left + 330, y, 30, 600, INK, "left");

  // البيانات
  y += 50;
  const rowH = 62;
  d.details.forEach((row, i) => {
    if (i % 2 === 0) {
      ctx.fillStyle = IVORY;
      ctx.fillRect(left, y, right - left, rowH);
    }
    text(row.label, right - 20, y + 41, 26, 400, MUTED);
    text(row.value, right - 330, y + 41, 28, 600);
    y += rowH;
  });

  // تفصيل الرد
  if (d.breakdown.length) {
    y += 24;
    d.breakdown.forEach((row) => {
      text(row.label, right - 20, y + 41, 26, 400, MUTED);
      text(row.value, left + 20, y + 41, 28, 600, INK, "left");
      y += rowH - 8;
      rule(y, LINE, 1);
    });
  }

  // المبلغ
  y += 36;
  const boxH = 150;
  ctx.fillStyle = IVORY;
  ctx.fillRect(left, y, right - left, boxH);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(left + 1.5, y + 1.5, right - left - 3, boxH - 3);
  text(d.amountLabel, right - 30, y + 64, 30, 600);
  text(`طريقة الدفع: ${d.method}`, right - 30, y + 112, 24, 400, MUTED);
  text(d.amount, left + 30, y + 96, 56, 700, GOLD, "left");
  y += boxH;

  // نص الإقرار والملاحظة
  if (d.terms) {
    y += 64;
    for (const line of wrap(d.terms, 26, right - left)) {
      text(line, right, y, 26, 400, MUTED);
      y += 44;
    }
  }
  if (d.note) {
    y += d.terms ? 16 : 64;
    for (const line of wrap(d.note, 26, right - left)) {
      text(line, right, y, 26, 600, INK);
      y += 44;
    }
  }

  // طول الصفحة: A5 على الأقل، وتطول إذا زاد المحتوى
  const height = Math.max(MIN_H, y + (d.signatures ? 440 : 260));
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = height;
  const out = prepare(canvas);
  out.drawImage(draft, 0, 0, W, Math.min(y + 20, height), 0, 0, W, Math.min(y + 20, height));
  const p = painter(out);

  if (d.signatures) {
    const sigY = height - 330;
    const sigW = 400;
    out.fillStyle = INK;
    out.fillRect(p.right - sigW, sigY, sigW, 2);
    out.fillRect(p.left, sigY, sigW, 2);
    p.text(d.signatures.customer, p.right, sigY + 44, 24, 400, MUTED);
    p.text(d.signatures.staff, p.left + sigW, sigY + 44, 24, 400, MUTED);
  }

  if (d.footer) {
    p.rule(height - M - 60, LINE, 2);
    p.text(d.footer, W / 2, height - M - 14, 22, 400, MUTED, "center");
  }

  return canvas;
}

/** الإيصال ملف PDF بعرض A5 */
export async function renderDepositReceipt(d: DepositReceiptData): Promise<Blob> {
  const canvas = await drawDepositReceipt(d);
  return canvasToPdf(canvas, {
    width: A5.width,
    height: (A5.width * canvas.height) / canvas.width,
  });
}
