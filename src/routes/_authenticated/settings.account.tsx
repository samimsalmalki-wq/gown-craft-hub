import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Avatar, Btn, Card, Chip, Empty, Field } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentAccount } from "@/hooks/useSession";
import { ROLE_LABEL } from "@/lib/atelier";
import { useUpdateProfile } from "@/lib/data";
import { branchLabel, useBranches } from "@/lib/branches";

export const Route = createFileRoute("/_authenticated/settings/account")({
  head: () => ({
    meta: [
      { title: "حسابي · الإعدادات · مَعْمَل" },
      {
        name: "description",
        content: "عدّل اسمك وجوالك ومسمّاك الوظيفي، وغيّر كلمة المرور الخاصة بحسابك.",
      },
      { property: "og:title", content: "حسابي · الإعدادات · مَعْمَل" },
      { property: "og:description", content: "بيانات الحساب وكلمة المرور." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { profile, role, userId } = useCurrentAccount();
  const { data: branches = [] } = useBranches();
  const update = useUpdateProfile();

  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  if (!profile || !userId) {
    return (
      <AppShell title="حسابي">
        <Empty>جاري التحميل…</Empty>
      </AppShell>
    );
  }

  const save = (patch: Record<string, unknown>) =>
    update
      .mutateAsync({ id: userId, patch })
      .then(() => toast.success("تم الحفظ"))
      .catch((e: Error) => toast.error(e.message));

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pass.length < 8) {
      toast.error("كلمة المرور يجب أن تكون ٨ أحرف على الأقل");
      return;
    }
    if (pass !== pass2) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPass("");
    setPass2("");
    toast.success("تم تغيير كلمة المرور");
  }

  return (
    <AppShell eyebrow="الإعدادات" title="حسابي" subtitle="بياناتك الشخصية وكلمة المرور.">
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="بياناتي">
          <div className="flex items-center gap-3 border-b border-line px-4 py-4">
            <Avatar name={profile.full_name} url={profile.avatar_url} size={12} />
            <div>
              <p className="text-[14px] font-medium">{profile.full_name}</p>
              <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <Chip tone="gold">{ROLE_LABEL[role] ?? "موظف"}</Chip>
                {branchLabel(branches, profile.branch_id)}
              </p>
            </div>
          </div>
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="الاسم">
              <input
                className="field w-full"
                defaultValue={profile.full_name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== profile.full_name) save({ full_name: v });
                }}
              />
            </Field>
            <Field label="الجوال">
              <input
                className="field num w-full"
                defaultValue={profile.phone ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (profile.phone ?? "")) save({ phone: v || null });
                }}
              />
            </Field>
            <Field label="المسمى الوظيفي">
              <input
                className="field w-full"
                defaultValue={profile.job_title ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (profile.job_title ?? "")) save({ job_title: v || null });
                }}
              />
            </Field>
            <Field label="رابط الصورة">
              <input
                className="field w-full"
                defaultValue={profile.avatar_url ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (profile.avatar_url ?? "")) save({ avatar_url: v || null });
                }}
              />
            </Field>
          </div>
        </Card>

        <Card title="تغيير كلمة المرور">
          <form onSubmit={changePassword} className="space-y-4 px-4 py-4">
            <Field label="كلمة المرور الجديدة" hint="٨ أحرف على الأقل">
              <input
                type="password"
                className="field w-full"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="تأكيد كلمة المرور">
              <input
                type="password"
                className="field w-full"
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Btn type="submit" className="w-full" disabled={busy}>
              {busy ? "جاري الحفظ…" : "تغيير كلمة المرور"}
            </Btn>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
