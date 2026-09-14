import { Link } from "@tanstack/react-router";

import { useCurrentAccount } from "@/hooks/useSession";

const TABS = [
  { to: "/finance", label: "اللوحة", perms: ["finance.payments", "finance.invoices", "finance.reports"] },
  { to: "/finance/payments", label: "التحصيل", perms: ["finance.payments", "finance.reports"] },
  { to: "/finance/expenses", label: "المصروفات", perms: ["finance.expenses", "finance.reports"] },
  { to: "/finance/accounts", label: "الحسابات", perms: ["finance.accounts", "finance.reports"] },
  { to: "/finance/journal", label: "القيود", perms: ["finance.accounts", "finance.reports"] },
  { to: "/finance/ledger", label: "دفتر الأستاذ", perms: ["finance.accounts", "finance.reports"] },
  { to: "/finance/reports", label: "التقارير", perms: ["finance.reports"] },
] as const;

export function FinanceTabs() {
  const { can } = useCurrentAccount();
  const tabs = TABS.filter((t) => t.perms.some((p) => can(p)));

  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-paper p-1">
      {tabs.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeOptions={{ exact: t.to === "/finance" }}
          activeProps={{ className: "bg-goldsoft/60 text-ink font-medium" }}
          inactiveProps={{ className: "text-muted-foreground hover:text-ink" }}
          className="rounded-lg px-3.5 py-2 text-[13px] whitespace-nowrap"
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
