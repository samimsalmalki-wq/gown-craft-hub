import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  Boxes,
  Building2,
  CircleDot,
  FileText,
  Layers,
  ListTree,
  MessageCircle,
  KeyRound,
  ShieldCheck,
  Shirt,
  Store,
  Tags,
  Truck,
  UserCog,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/settings/")({
  head: () => ({
    meta: [
      { title: "الإعدادات · مَعْمَل" },
      {
        name: "description",
        content:
          "كل إعدادات المنصة في مكان واحد: المراحل وأنواع القطع والأدوار والفروع والصناديق والضريبة والحساب الشخصي.",
      },
      { property: "og:title", content: "الإعدادات · مَعْمَل" },
      { property: "og:description", content: "كل إعدادات منصة مَعْمَل في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsHub,
});

type Item = {
  to: string;
  label: string;
  hint: string;
  icon: typeof Layers;
  show: (a: Access) => boolean;
};

type Access = { isAdmin: boolean; can: (permission: string) => boolean; canFinance: boolean };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "الطلبات والإنتاج",
    items: [
      {
        to: "/workflow",
        label: "مراحل التصنيع",
        hint: "أسماء المراحل وترتيبها ومدّتها والمراجعة",
        icon: Layers,
        show: (a) => a.isAdmin,
      },
      {
        to: "/item-types",
        label: "أنواع القطع",
        hint: "فستان زواج، طرحة، فستان سهرة…",
        icon: Shirt,
        show: (a) => a.can("catalog.manage"),
      },
      {
        to: "/whatsapp",
        label: "رسائل الواتساب",
        hint: "نصوص الرسائل الجاهزة للعميلة",
        icon: MessageCircle,
        show: (a) => a.can("whatsapp.manage"),
      },
      {
        to: "/settings/rental-statuses",
        label: "حالات فساتين الإيجار",
        hint: "أضف حالات واحذفها وغيّر أسماءها وألوانها وترتيبها",
        icon: CircleDot,
        show: (a) => a.can("catalog.manage"),
      },
    ],
  },
  {
    title: "الأشخاص والصلاحيات",
    items: [
      {
        to: "/staff",
        label: "الموظفون",
        hint: "الحسابات والأدوار والفروع والمراحل المسموحة",
        icon: Users,
        show: (a) => a.can("staff.manage"),
      },
      {
        to: "/roles",
        label: "الأدوار والصلاحيات",
        hint: "أضف أدوارًا جديدة وحدّد صلاحيات كل دور",
        icon: ShieldCheck,
        show: (a) => a.isAdmin,
      },
      {
        to: "/settings/departments",
        label: "الأقسام",
        hint: "أقسام العمل التي يُنسب إليها الموظفون",
        icon: UserCog,
        show: (a) => a.isAdmin,
      },
    ],
  },
  {
    title: "الفروع والمخزون",
    items: [
      {
        to: "/branches",
        label: "الفروع والمخزن الرئيسي",
        hint: "الأسماء والرموز والعناوين والأرقام الضريبية",
        icon: Store,
        show: (a) => a.isAdmin,
      },
      {
        to: "/settings/material-categories",
        label: "تصنيفات الخامات",
        hint: "قماش، دانتيل، خيوط… تظهر في المخزون",
        icon: Boxes,
        show: (a) => a.can("catalog.manage"),
      },
    ],
  },
  {
    title: "الماليات والضريبة",
    items: [
      {
        to: "/settings/tax",
        label: "بيانات المنشأة والضريبة",
        hint: "اسم المنشأة والرقم الضريبي ونسبة الضريبة لكل فرع",
        icon: Building2,
        show: (a) => a.isAdmin,
      },
      {
        to: "/settings/receipts",
        label: "نصوص إيصالات التأمين",
        hint: "عنوان الإيصال وبياناته ونص الإقرار والتوقيعات، مع معاينة",
        icon: FileText,
        show: (a) => a.isAdmin,
      },
      {
        to: "/settings/cash-accounts",
        label: "الصناديق",
        hint: "صناديق النقد والشبكة والبنك وأرصدتها الافتتاحية",
        icon: Banknote,
        show: (a) => a.canFinance,
      },
      {
        to: "/settings/expense-categories",
        label: "تصنيفات المصروفات",
        hint: "بنود المصروفات وحساب كل بند",
        icon: Tags,
        show: (a) => a.canFinance,
      },
      {
        to: "/settings/suppliers",
        label: "الموردون",
        hint: "بيانات الموردين وأرقامهم الضريبية",
        icon: Truck,
        show: (a) => a.canFinance,
      },
      {
        to: "/finance/accounts",
        label: "دليل الحسابات",
        hint: "شجرة الحسابات المحاسبية وأرصدتها",
        icon: ListTree,
        show: (a) => a.canFinance,
      },
    ],
  },
  {
    title: "حسابي",
    items: [
      {
        to: "/settings/account",
        label: "بياناتي وكلمة المرور",
        hint: "الاسم والجوال والمسمى الوظيفي وتغيير كلمة المرور",
        icon: KeyRound,
        show: () => true,
      },
    ],
  },
];

function SettingsHub() {
  const { isAdmin, can } = useCurrentAccount();
  const access: Access = {
    isAdmin,
    can,
    canFinance:
      can("finance.payments") ||
      can("finance.invoices") ||
      can("finance.reports") ||
      can("finance.expenses") ||
      can("finance.accounts"),
  };

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.show(access)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <AppShell
      eyebrow="المنصة"
      title="الإعدادات"
      subtitle="كل ما تضبطه في النظام من مكان واحد. يظهر لك ما تسمح به صلاحياتك فقط."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title} title={g.title}>
            <ul className="divide-y divide-line">
              {g.items.map((it) => (
                <li key={it.to}>
                  <Link
                    to={it.to}
                    className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ivory"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-goldsoft/60">
                      <it.icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">{it.label}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{it.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
