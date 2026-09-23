import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { Btn, Field } from "@/components/kit";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — مَعْمَل" },
      { name: "description", content: "دخول الموظفين والمدير إلى نظام إدارة تفصيل فساتين الزواج." },
      { property: "og:title", content: "تسجيل الدخول — مَعْمَل" },
      { property: "og:description", content: "دخول فريق الورشة إلى نظام إدارة الطلبات والمراحل." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, ready } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (ready && session) navigate({ to: "/dashboard", replace: true });
  }, [ready, session, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(
        message.includes("Invalid login credentials")
          ? "البريد أو كلمة المرور غير صحيحة"
          : message || "تعذر إكمال العملية",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-5 py-10">
      <div className="rise w-full max-w-md rounded-xl border border-line bg-paper px-6 py-8">
        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-[20px] font-bold tracking-tight">مَعْمَل</span>
          <span className="font-en text-[15px] text-gold italic">Atelier</span>
        </div>

        {sent ? (
          <div className="text-center">
            <h1 className="text-[20px] font-bold">تحقق من بريدك</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              إن كان {email} مسجّلًا لدينا فسيصلك رابط لتعيين كلمة مرور جديدة.
            </p>
            <button
              onClick={() => {
                setSent(false);
                setMode("signin");
              }}
              className="mt-5 text-[13px] text-gold"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-[22px] font-bold">
              {mode === "signin" ? "تسجيل الدخول" : "نسيت كلمة المرور"}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {mode === "signin"
                ? "ادخل بحسابك للوصول إلى الطلبات والمراحل."
                : "اكتب بريدك وسنرسل لك رابطًا لتعيين كلمة مرور جديدة."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label="البريد الإلكتروني">
                <input
                  className="field"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              {mode === "signin" && (
                <Field label="كلمة المرور">
                  <input
                    className="field"
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
              )}
              <Btn type="submit" disabled={busy} className="w-full">
                {busy ? "لحظة…" : mode === "signin" ? "دخول" : "إرسال الرابط"}
              </Btn>
            </form>

            <button
              onClick={() => setMode(mode === "signin" ? "forgot" : "signin")}
              className="mt-5 w-full text-[13px] text-gold"
            >
              {mode === "signin" ? "نسيت كلمة المرور؟" : "العودة لتسجيل الدخول"}
            </button>
            {mode === "signin" && (
              <p className="mt-3 text-center text-[12px] text-muted-foreground">
                ليس لديك حساب؟ يضيفك مدير الورشة من شاشة الموظفين.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
