import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { PaymentStatus, Priority, StageStatus } from "@/lib/atelier";
import { PAYMENT_LABEL, PRIORITY_LABEL, STAGE_STATUS_LABEL } from "@/lib/atelier";

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-line bg-paper", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-[15px] font-medium">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Btn({
  children,
  variant = "solid",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "quiet" | "gold" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "solid" && "bg-ink text-paper ring-1 ring-black/10 hover:bg-ink/90",
        variant === "gold" && "bg-gold text-paper hover:bg-gold/90",
        variant === "quiet" && "border border-line bg-paper text-foreground hover:bg-ivory",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "gold" | "ok" | "late" | "soon";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] whitespace-nowrap",
        tone === "neutral" && "bg-goldsoft text-foreground/80",
        tone === "gold" && "bg-gold/12 text-gold",
        tone === "ok" && "bg-ok/12 text-ok",
        tone === "late" && "bg-late/12 text-late",
        tone === "soon" && "bg-soon/15 text-soon",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StageStatusChip({ status }: { status: StageStatus }) {
  const tone =
    status === "done"
      ? "ok"
      : status === "in_progress"
        ? "gold"
        : status === "blocked" || status === "late"
          ? "late"
          : status === "review"
            ? "soon"
            : "neutral";
  return <Chip tone={tone}>{STAGE_STATUS_LABEL[status]}</Chip>;
}

export function PriorityChip({ priority }: { priority: Priority }) {
  const tone = priority === "urgent" ? "late" : priority === "high" ? "soon" : "neutral";
  return <Chip tone={tone}>{PRIORITY_LABEL[priority]}</Chip>;
}

export function Avatar({
  name,
  url,
  size = 9,
}: {
  name?: string | null;
  url?: string | null;
  size?: 8 | 9 | 12 | 16;
}) {
  const cls = { 8: "size-8", 9: "size-9", 12: "size-12", 16: "size-16" }[size];
  if (url)
    return (
      <img
        src={url}
        alt={name ?? "صورة الموظف"}
        className={cn(cls, "shrink-0 rounded-full border border-line object-cover")}
      />
    );
  return (
    <div
      className={cn(
        cls,
        "grid shrink-0 place-items-center rounded-full bg-ink text-sm font-semibold text-ivory",
      )}
    >
      {(name || "؟").slice(0, 1)}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line bg-paper sm:rounded-2xl">
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-line bg-paper px-4 py-3">
          <h2 className="text-[15px] font-medium">{title}</h2>
          <button onClick={onClose} className="text-[13px] text-muted-foreground">
            إغلاق
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PaymentChip({ status }: { status: PaymentStatus }) {
  const tone = status === "paid" ? "ok" : status === "partial" ? "gold" : "late";
  return <Chip tone={tone}>{PAYMENT_LABEL[status]}</Chip>;
}

export function Stat({
  label,
  value,
  hint,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "late" | "soon" | "gold";
  onClick?: () => void;
  active?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "rounded-xl border border-line bg-paper px-4 py-3.5 text-right",
        onClick && "transition-colors hover:border-gold/50",
        active && "border-gold ring-1 ring-gold/30",
      )}
    >
      <p className="mb-1 text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "num text-[28px] leading-none",
          tone === "late" && "text-late",
          tone === "soon" && "text-soon",
          tone === "gold" && "text-gold",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </Comp>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">{children}</p>;
}
