import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/orders", label: "طلبات التفصيل" },
  { to: "/rentals", label: "فساتين الإيجار" },
] as const;

export function OrdersTabs() {
  return (
    <div className="mb-5 flex gap-1 rounded-xl border border-line bg-paper p-1">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeProps={{ className: "bg-goldsoft/60 text-ink font-medium ring-1 ring-black/5" }}
          inactiveProps={{ className: "text-muted-foreground hover:text-ink" }}
          className="flex-1 rounded-lg px-3 py-2.5 text-center text-[13.5px]"
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
