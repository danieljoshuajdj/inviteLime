"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { createBrowserClient } from "@/lib/supabase/client";
import { friendlyAuthError, friendlyAuthParam } from "@/lib/auth-errors";
import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";

type Mode = "login" | "register" | "reset";

export function AuthForm({ mode }: { mode: Mode }) {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app/explore";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(() => friendlyAuthParam(searchParams.get("error")));
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isLogin = mode === "login";
  const isRegister = mode === "register";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);
    const supabase = createBrowserClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = next;
      } else if (mode === "register") {
        // role is forced to 'customer' server-side via trigger; admins are promoted separately.
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        // With email confirmation on, signing up an existing account returns a
        // success response carrying no identities rather than an error.
        if (data.user && (data.user.identities?.length ?? 1) === 0) {
          setError("An account with this email already exists. Try signing in instead.");
        } else {
          setSuccess("Account created! Check your inbox to confirm your email, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });
        if (error) throw error;
        setSuccess("If an account exists for that email, a reset link is on its way.");
      }
    } catch (err) {
      // Keep the raw provider error for debugging; users only see the mapped copy.
      console.warn(`[auth] ${mode} failed`, err);
      setError(friendlyAuthError(err, mode));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:gap-4">
      {mode === "register" && (
        <TextInput
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="e.g. Maya Sharma"
          icon="person"
          required
        />
      )}
      <TextInput
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        icon="mail"
        required
      />
      {mode !== "reset" && (
        <div className="relative">
          <TextInput
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            icon="lock"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute bottom-1 right-1.5 flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <Icon name={showPassword ? "visibility_off" : "visibility"} size="sm" />
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </p>
      )}
      {success && (
        <p className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 font-body-sm text-success" role="status">
          <Icon name="check_circle" size="sm" /> {success}
        </p>
      )}

      {isLogin && (
        <Link href="/forgot-password" className="-mt-1 self-end py-1 font-body-xs font-medium text-sapphire-700 hover:underline">
          Forgot password?
        </Link>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={pending}
        className="bg-sapphire-800 text-white hover:bg-sapphire-700"
      >
        {isLogin ? "Sign in" : isRegister ? "Create account" : "Send reset link"}
      </Button>

      <p className="text-center font-body-sm text-navy-700">
        {isLogin ? (
          <>
            New here?{" "}
            <Link href="/register" className="font-semibold text-sapphire-700 hover:underline">
              Create an account
            </Link>
          </>
        ) : isRegister ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-sapphire-700 hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Remembered it?{" "}
            <Link href="/login" className="font-semibold text-sapphire-700 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}