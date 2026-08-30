"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Truck, Loader2, LogIn, AlertCircle } from "lucide-react";
import { getSupabase, supabaseConfigured } from "@/lib/supabase";
import { Field, Input } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = getSupabase();
    if (!supabase) {
      setError("No backend configured. Add your Supabase keys to .env.local.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (error) {
      // Deliberately vague — don't reveal whether the account exists.
      setError(
        error.message === "Invalid login credentials"
          ? "Those details don't match. Check the ID and password and try again."
          : error.message
      );
      return;
    }

    router.replace(params.get("next") || "/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4 py-10">
      {/* Brand bar, echoing the invoice letterhead */}
      <div className="animate-pop w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-16 w-16 place-items-center rounded-full border-2 border-gold-500 bg-white/5">
            <Truck size={28} className="text-gold-400" />
          </div>
          <p className="font-serif text-lg font-extrabold leading-none text-gold-400">श्री</p>
          <h1 className="mt-1.5 text-lg font-extrabold leading-tight text-white">
            CHAKRADHAR SWAMI TRANSPORT
          </h1>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold-500">
            Transport Billing
          </p>
        </div>

        <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-pop">
          <h2 className="text-base font-bold text-navy-900">Sign in</h2>
          <p className="mb-5 mt-0.5 text-xs text-navy-500">
            This system is private. Enter your credentials to continue.
          </p>

          <div className="grid gap-4">
            <Field label="ID">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                autoFocus
                required
              />
            </Field>

            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
            >
              <AlertCircle size={14} className="mt-px shrink-0" />
              {error}
            </p>
          )}

          {!supabaseConfigured && (
            <p className="mt-4 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-900">
              Running without a backend — no sign-in is required in this mode.
            </p>
          )}

          <button type="submit" className="btn-primary mt-5 w-full py-2.5" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Signing in…
              </>
            ) : (
              <>
                <LogIn size={16} /> Sign in
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-navy-400">
          Access is restricted to authorised staff.
        </p>
      </div>
    </div>
  );
}
