import { Link } from "@tanstack/react-router";
import { Boxes, Factory, Store } from "lucide-react";

import { useCurrentAccount } from "@/hooks/useSession";
import { useGoodsPlaces } from "@/lib/goods-data";
import { GOODS_PERMS, MATERIALS_PERMS, WORKSHOP } from "@/lib/goods";
import { cn } from "@/lib/utils";

/** مواقع المخزون: المخزن الرئيسي (المواد)، المعمل، ومخزن كل فرع */
export function StockTabs({
  current,
  badges = {},
}: {
  /** «materials» للمخزن الرئيسي، «workshop» للمعمل، وإلا معرّف الفرع */
  current: string;
  badges?: Record<string, number>;
}) {
  const { can } = useCurrentAccount();
  const { visible } = useGoodsPlaces();
  const showMaterials = MATERIALS_PERMS.some(can);
  const showGoods = GOODS_PERMS.some(can);

  const tabs: { key: string; label: string; hint: string; icon: typeof Boxes }[] = [
    ...(showMaterials
      ? [{ key: "materials", label: "المخزن الرئيسي", hint: "المواد الخام", icon: Boxes }]
      : []),
    ...(showGoods
      ? [
          { key: WORKSHOP, label: "المعمل", hint: "الجاهز لكل فرع", icon: Factory },
          ...visible.map((b) => ({
            key: b.id,
            label: `فرع ${b.name}`,
            hint: "جاهز · عرض · بضاعة · عينات",
            icon: Store,
          })),
        ]
      : []),
  ];

  if (tabs.length < 2) return null;

  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tabs.map((t) => {
        const active = current === t.key;
        const badge = badges[t.key] ?? 0;
        const body = (
          <>
            <t.icon
              className={cn(
                "mt-0.5 size-5 shrink-0",
                active ? "text-gold" : "text-muted-foreground",
              )}
              strokeWidth={1.75}
            />
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{t.label}</span>
              <span className="block text-[11.5px] text-muted-foreground">{t.hint}</span>
            </span>
            {badge > 0 && (
              <span className="num absolute top-2 left-2 grid min-w-5 place-items-center rounded-full bg-soon px-1 text-[10px] text-paper">
                {badge}
              </span>
            )}
          </>
        );
        const cls = cn(
          "relative flex items-start gap-3 rounded-xl border border-line bg-paper px-4 py-3.5 text-right transition-colors hover:border-gold/50",
          active && "border-gold ring-1 ring-gold/30",
        );
        return t.key === "materials" ? (
          <Link key={t.key} to="/inventory" className={cls}>
            {body}
          </Link>
        ) : (
          <Link key={t.key} to="/goods" search={{ loc: t.key }} className={cls}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}
