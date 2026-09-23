import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Btn, Field } from "@/components/kit";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "كلمة مرور جديدة — مَعْمَل" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { session, ready } = useSession();
  const navigate = useNavigate();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
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
    toast.success("تم تعيين كلمة المرور الجديدة");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-5 py-10">
      <div className="rise w-full max-w-md rounded-xl border border-line bg-paper px-6 py-8">
        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-[20px] font-bold tracking-tight">مَعْمَل</span>
          <span className="font-en text-[15px] text-gold italic">Atelier</span>
        </div>

        {!ready ? (
          <p className="text-[14px] text-muted-foreground">لحظة…</p>
        ) : !session ? (
          <div className="text-center">
            <h1 className="text-[20px] font-bold">الرابط غير صالح</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطًا جديدًا من صفحة الدخول.
            </p>
            <button onClick={() => navigate({ to: "/auth" })} className="mt-5 text-[13px] text-gold">
              صفحة الدخول
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-[22px] font-bold">كلمة مرور جديدة</h1>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="كلمة المرور الجديدة">
                <input
                  className="field"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Field label="تأكيد كلمة المرور">
                <input
                  className="field"
                  type="password"
                  dir="ltr"
                  autoComplete="new-password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Btn type="submit" disabled={busy} className="w-full">
                {busy ? "لحظة…" : "حفظ كلمة المرور"}
              </Btn>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
