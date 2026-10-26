"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthShell } from "@/components/auth/AuthShell";
import { createBrowserClient } from "@/lib/supabase/client";
import { friendlyAuthError, friendlyAuthParam } from "@/lib/auth-errors";
import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";

export function UpdatePasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = friendlyAuthParam(searchParams.get("error"));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show] = useState(false);
  const [error, setError] = useState<string | null>(errorParam);
  const [pending, setPending] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setPending(!(data?.session ? true : false));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setSaving(true);
    const supabase = createBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      console.warn("[auth] password update failed", updateError);
      return setError(friendlyAuthError(updateError, "password"));
    }
    router.push("/app/explore");
  }

  return (
    <AuthShell>
      <h1 className="font-heading-xl text-ivory-950 sm:font-heading-2xl">Set a new password</h1>
      <p className="mb-6 mt-2 font-body-sm text-navy-700">
        Choose a strong password to protect your account.
      </p>

      {pending && !error ? (
        <p className="flex items-center gap-2 font-body-sm text-navy-700">
          <Icon name="refresh" size="sm" className="animate-spin" /> Verifying your session…
        </p>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextInput
            label="New password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            icon="lock"
            required
            minLength={8}
          />
          <TextInput
            label="Confirm password"
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            icon="lock"
            required
            minLength={8}
          />
          <Button type="submit" size="lg" fullWidth loading={saving}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  );
}