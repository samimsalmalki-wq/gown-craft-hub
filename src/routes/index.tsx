import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مَعْمَل — نظام تشغيل ورشة فساتين الزواج" },
      {
        name: "description",
        content:
          "إدارة طلبات فساتين الزواج من الحجز حتى التسليم: المقاسات، الخامات، مراحل التنفيذ، المالية وصلاحيات الموظفين.",
      },
      { property: "og:title", content: "مَعْمَل — نظام تشغيل ورشة فساتين الزواج" },
      {
        property: "og:description",
        content: "كل فستان برقم طلب واحد يجمع بيانات العميلة والمقاسات والمراحل والمالية.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, ready } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && session) navigate({ to: "/dashboard", replace: true });
  }, [ready, session, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-5 py-10">
      <div className="rise w-full max-w-md rounded-xl border border-line bg-paper px-6 py-9 text-center">
        <div className="mb-6 flex items-baseline justify-center gap-2">
          <span className="text-[22px] font-bold tracking-tight">مَعْمَل</span>
          <span className="font-en text-[16px] text-gold italic">Atelier</span>
        </div>
        <p className="text-[11px] font-medium tracking-[0.2em] text-gold uppercase">نظام تشغيل</p>
        <h1 className="mt-1 text-[26px] font-bold text-balance">إدارة تفصيل فساتين الزواج</h1>
        <p className="mt-3 text-[14px] text-muted-foreground">
          رقم طلب واحد لكل فستان يجمع بيانات العميلة، المقاسات، الخامات، مراحل التنفيذ الثلاث عشرة،
          والحالة المالية.
        </p>
        <Link
          to="/auth"
          className="mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-ink px-4 text-sm font-medium text-paper ring-1 ring-black/10"
        >
          تسجيل الدخول للنظام
        </Link>
      </div>
    </div>
  );
}
