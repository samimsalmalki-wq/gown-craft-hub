import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutGrid,
  ListOrdered,
  Layers,
  Users,
  LogOut,
  Search,
  Plus,
  CheckSquare,
  AlarmClock,
  BarChart3,
  Settings2,
  Bell,
  Boxes,
  MessageCircle,
  ShieldCheck,
  Wallet,

} from "lucide-react";
import { useState, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/hooks/useSession";
import { useMarkNotificationsRead, useNotifications, useStageTemplates } from "@/lib/data";
import { ROLE_LABEL, fmtDateTime } from "@/lib/atelier";
import { Avatar, Sheet } from "@/components/kit";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  managerOnly?: boolean;
  adminOnly?: boolean;
  financeOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "لوحة التحكم", icon: LayoutGrid },
  { to: "/tasks", label: "مهامي", icon: CheckSquare },
  { to: "/orders", label: "الطلبات", icon: ListOrdered },
  { to: "/stages", label: "لوحة الإنتاج", icon: Layers },
  { to: "/late", label: "المتأخرات", icon: AlarmClock },
  { to: "/finance", label: "الماليات", icon: Wallet, financeOnly: true },
  { to: "/inventory", label: "مخزون المواد", icon: Boxes },
  { to: "/staff", label: "الموظفون", icon: Users, managerOnly: true },
  { to: "/roles", label: "الأدوار والصلاحيات", icon: ShieldCheck, adminOnly: true },

  { to: "/reports", label: "تقرير الأداء", icon: BarChart3, managerOnly: true },
  { to: "/workflow", label: "إعداد المراحل", icon: Settings2, adminOnly: true },
  { to: "/whatsapp", label: "رسائل الواتساب", icon: MessageCircle, managerOnly: true },
];

export function AppShell({
  children,
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  const { profile, isAdmin, isManager, role, userId } = useCurrentAccount();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [bellOpen, setBellOpen] = useState(false);

  useStageTemplates(); // يحمّل أسماء المراحل وترتيبها لكل الشاشات
  const { data: notes = [] } = useNotifications(userId);
  const markRead = useMarkNotificationsRead();
  const unread = notes.filter((n) => !n.is_read);

  const canFinance =
    can("finance.payments") || can("finance.invoices") || can("finance.reports");
  const items = NAV.filter(
    (n) =>
      (!n.managerOnly || isManager) &&
      (!n.adminOnly || isAdmin) &&
      (!n.financeOnly || canFinance),
  );

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ to: "/orders", search: { q: term || undefined } });
  }

  function openBell() {
    setBellOpen(true);
    if (unread.length) markRead.mutate(unread.map((n) => n.id));
  }

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-1 overflow-y-auto border-l border-line bg-paper px-4 py-7 md:flex">
          <div className="mb-7 flex items-baseline gap-2 px-2">
            <span className="text-[19px] font-bold tracking-tight">مَعْمَل</span>
            <span className="font-en text-[15px] text-gold italic">Atelier</span>
          </div>
          <nav className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-goldsoft/50 text-ink ring-1 ring-black/5 font-medium" }}
                inactiveProps={{ className: "text-muted-foreground hover:text-ink" }}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px]"
              >
                <item.icon className="size-4" strokeWidth={1.75} />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-line pt-4">
            <div className="flex items-center gap-3 px-2">
              <Avatar name={profile?.full_name} url={profile?.avatar_url} />
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-medium">{profile?.full_name || "حساب"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ROLE_LABEL[role] ?? "موظف"}
                  {profile?.job_title ? ` · ${profile.job_title}` : ""}
                </p>
              </div>
            </div>
            <button
              onClick={signOut}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-muted-foreground hover:text-ink"
            >
              <LogOut className="size-4" strokeWidth={1.75} /> تسجيل الخروج
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-9 md:py-7 md:pb-10">
          <header className="rise mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[11px] font-medium tracking-[0.2em] text-gold uppercase">
                  {eyebrow}
                </p>
              )}
              <h1 className="text-[26px] font-bold tracking-tight text-balance md:text-[28px]">
                {title}
              </h1>
              {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
            </div>
            <div className="flex items-center gap-2">
              <form onSubmit={submitSearch} className="relative hidden sm:block">
                <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="field w-60 pr-9"
                  placeholder="رقم الطلب أو اسم العميلة أو الجوال"
                />
              </form>
              <button
                onClick={openBell}
                aria-label="التنبيهات"
                className="relative grid size-11 place-items-center rounded-lg border border-line bg-paper"
              >
                <Bell className="size-4" strokeWidth={1.75} />
                {unread.length > 0 && (
                  <span className="num absolute -top-1 -left-1 grid min-w-5 place-items-center rounded-full bg-late px-1 text-[10px] text-paper">
                    {unread.length}
                  </span>
                )}
              </button>
              {actions}
            </div>
          </header>
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-paper/95 backdrop-blur md:hidden">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeProps={{ className: "text-gold" }}
            inactiveProps={{ className: "text-muted-foreground" }}
            className="flex min-w-[68px] flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] whitespace-nowrap"
          >
            <item.icon className="size-5" strokeWidth={1.75} />
            {item.label}
          </Link>
        ))}
        <Link
          to="/orders/new"
          className="flex min-w-[68px] flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] text-muted-foreground"
        >
          <Plus className="size-5" strokeWidth={1.75} />
          جديد
        </Link>
      </nav>

      <Sheet open={bellOpen} onClose={() => setBellOpen(false)} title="التنبيهات">
        {notes.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">لا توجد تنبيهات.</p>
        ) : (
          <ul className="divide-y divide-line">
            {notes.map((n) => (
              <li key={n.id} className={cn("px-4 py-3", !n.is_read && "bg-goldsoft/30")}>
                <p className="text-[13px]">{n.message}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

export const shellCn = cn;
