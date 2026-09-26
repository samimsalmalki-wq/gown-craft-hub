import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Avatar, Card, Chip, Empty, Stat, StageStatusChip } from "@/components/kit";
import { StageSheet } from "@/components/StageWork";
import { useCurrentAccount } from "@/hooks/useSession";
import { useAllRoles, useDepartments, useMyTasks, useProfiles, useRoles } from "@/lib/data";
import {
  OPEN_STATUSES,
  ROLE_LABEL,
  fmtDateTime,
  fmtDuration,
  isStageLate,
  stageLabel,
  type AppRole,
  type OrderStage,
} from "@/lib/atelier";

export const Route = createFileRoute("/_authenticated/staff/$userId")({
  head: () => ({
    meta: [
      { title: "ملف الموظف · مَعْمَل" },
      { name: "description", content: "مهام الموظف الحالية وإنجازه ومتوسط زمن تنفيذه." },
      { property: "og:title", content: "ملف الموظف · مَعْمَل" },
      { property: "og:description", content: "مهام الموظف الحالية وإنجازه ومتوسط زمن تنفيذه." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffProfilePage,
});

function StaffProfilePage() {
  const { userId } = Route.useParams();
  const { can, ready } = useCurrentAccount();
  const { data: profiles = [] } = useProfiles();
  const { data: departments = [] } = useDepartments();
  const { data: roles = [] } = useAllRoles();
  const { data: catalog = [] } = useRoles();
  const { data: tasks = [] } = useMyTasks(userId);
  const [active, setActive] = useState<OrderStage | null>(null);

  const profile = profiles.find((p) => p.id === userId);
  const role = (roles.find((r) => r.user_id === userId)?.role ?? "staff") as AppRole;
  const dept = departments.find((d) => d.id === profile?.department_id);

  if (ready && !can("staff.manage")) {
    return (
      <AppShell title="ملف الموظف">
        <Empty>هذه الشاشة متاحة لمن يملك صلاحية عرض الموظفين.</Empty>
      </AppShell>
    );
  }
  if (ready && !profile) {
    return (
      <AppShell title="ملف الموظف">
        <Empty>الموظف غير موجود.</Empty>
      </AppShell>
    );
  }

  const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
  const done = tasks.filter((t) => t.status === "done");
  const durations = done.map((t) => t.duration_minutes).filter((d): d is number => d != null);
  const avg = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  return (
    <AppShell
      eyebrow="ملف موظف"
      title={profile?.full_name || "—"}
      subtitle={`${catalog.find((r) => r.id === profile?.role_id)?.label ?? ROLE_LABEL[role]}${dept ? ` · ${dept.name}` : ""}${profile?.job_title ? ` · ${profile.job_title}` : ""}`}
      actions={
        <Link to="/staff" className="text-[13px] text-gold">
          كل الموظفين
        </Link>
      }
    >
      <div className="mb-5 flex items-center gap-3">
        <Avatar name={profile?.full_name} url={profile?.avatar_url} size={16} />
        <div className="text-[13px] text-muted-foreground">
          <p dir="ltr">{profile?.phone || "—"}</p>
          <p>{profile?.is_active ? "موظف نشط" : "موقوف"}</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="مهام مفتوحة" value={open.length} />
        <Stat label="مراحل منجزة" value={done.length} />
        <Stat label="مراحل متأخرة" value={open.filter((t) => isStageLate(t)).length} tone="late" />
        <Stat label="متوسط التنفيذ" value={fmtDuration(avg)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="المهام الحالية">
          {open.length === 0 ? (
            <Empty>لا توجد مهام مفتوحة.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {open.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 text-[13.5px] font-medium">
                      {stageLabel(t.stage)} · {t.orders?.client_name}
                    </span>
                    {isStageLate(t) && <Chip tone="late">متأخرة</Chip>}
                    <StageStatusChip status={t.status} />
                  </div>
                  <button
                    onClick={() => setActive(t)}
                    className="mt-2 rounded-lg border border-line px-3 py-1.5 text-[12px]"
                  >
                    فتح
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="سجل الإنجاز">
          {done.length === 0 ? (
            <Empty>لا يوجد إنجاز مسجّل.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {done.slice(0, 30).map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <p className="text-[13px] font-medium">
                    {stageLabel(t.stage)} · {t.orders?.client_name}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {fmtDateTime(t.completed_at)} · {fmtDuration(t.duration_minutes)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <StageSheet stage={active} onClose={() => setActive(null)} />
    </AppShell>
  );
}
