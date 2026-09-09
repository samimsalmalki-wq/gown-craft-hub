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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard", replace: true });
        else setSent(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إكمال العملية");
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
              أرسلنا رابط تأكيد إلى {email}. بعد الضغط عليه يمكنك الدخول للنظام.
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-[22px] font-bold">
              {mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب موظف"}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {mode === "signin"
                ? "ادخل بحسابك للوصول إلى الطلبات والمراحل."
                : "أول حساب يُسجَّل في النظام يصبح مدير الورشة تلقائيًا."}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === "signup" && (
                <Field label="الاسم">
                  <input
                    className="field"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="مثال: نور الحكيم"
                    required
                  />
                </Field>
              )}
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
              <Field label="كلمة المرور">
                <input
                  className="field"
                  type="password"
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </Field>
              <Btn type="submit" disabled={busy} className="w-full">
                {busy ? "لحظة…" : mode === "signin" ? "دخول" : "إنشاء الحساب"}
              </Btn>
            </form>

            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="mt-5 w-full text-[13px] text-gold"
            >
              {mode === "signin" ? "ليس لديك حساب؟ إنشاء حساب" : "لدي حساب — تسجيل الدخول"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
