import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { Avatar, Card, Chip, Empty } from "@/components/kit";
import { useCurrentAccount } from "@/hooks/useSession";
import { useProfiles, useStagesWithOrders } from "@/lib/data";
import { fmtDuration, isStageLate, OPEN_STATUSES } from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "تقرير أداء الفريق · مَعْمَل" },
      { name: "description", content: "عدد المراحل المنجزة ومتوسط زمن التنفيذ وإعادة العمل لكل موظف." },
      { property: "og:title", content: "تقرير أداء الفريق · مَعْمَل" },
      {
        property: "og:description",
        content: "عدد المراحل المنجزة ومتوسط زمن التنفيذ وإعادة العمل لكل موظف.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { can, ready } = useCurrentAccount();
  const { data: profiles = [] } = useProfiles();
  const { data: rows = [] } = useStagesWithOrders();

  if (ready && !can("reports.view")) {
    return (
      <AppShell title="تقرير الأداء">
        <Empty>هذه الشاشة متاحة لمن يملك صلاحية تقارير الأداء.</Empty>
      </AppShell>
    );
  }

  const stats = profiles.map((p) => {
    const mine = rows.filter((r) => r.assignee_id === p.id);
    const done = mine.filter((r) => r.status === "done");
    const durations = done.map((r) => r.duration_minutes).filter((d): d is number => d != null);
    const avg = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    return {
      profile: p,
      done: done.length,
      open: mine.filter((r) => OPEN_STATUSES.includes(r.status)).length,
      late: mine.filter((r) => isStageLate(r)).length,
      rework: mine.reduce((a, r) => a + (r.rework_count ?? 0), 0),
      avg,
    };
  });

  const ranked = [...stats].sort((a, b) => b.done - a.done);

  return (
    <AppShell
      eyebrow="التقارير"
      title="أداء الفريق"
      subtitle="الإنجاز ومتوسط زمن التنفيذ وإعادة العمل والمتأخرات لكل موظف."
    >
      <Card title="مقارنة الموظفين">
        {ranked.length === 0 ? (
          <Empty>لا يوجد موظفون بعد.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[13px]">
              <thead className="border-b border-line text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">الموظف</th>
                  <th className="px-3 py-2.5 font-medium">منجزة</th>
                  <th className="px-3 py-2.5 font-medium">مفتوحة</th>
                  <th className="px-3 py-2.5 font-medium">متأخرة</th>
                  <th className="px-3 py-2.5 font-medium">إعادة عمل</th>
                  <th className="px-3 py-2.5 font-medium">متوسط التنفيذ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranked.map((s) => (
                  <tr key={s.profile.id}>
                    <td className="px-4 py-3">
                      <Link
                        to="/staff/$userId"
                        params={{ userId: s.profile.id }}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar name={s.profile.full_name} url={s.profile.avatar_url} size={8} />
                        <span className="font-medium">{s.profile.full_name}</span>
                      </Link>
                    </td>
                    <td className="num px-3 py-3">{s.done}</td>
                    <td className="num px-3 py-3">{s.open}</td>
                    <td className="px-3 py-3">
                      {s.late > 0 ? <Chip tone="late">{s.late}</Chip> : <span className="num">0</span>}
                    </td>
                    <td className="num px-3 py-3">{s.rework}</td>
                    <td className="px-3 py-3 text-muted-foreground">{fmtDuration(s.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
