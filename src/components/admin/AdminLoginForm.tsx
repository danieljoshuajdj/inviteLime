"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";

/**
 * Dedicated administrator credential form.
 *
 * Deliberately separate from the customer auth form: no Google button, no
 * registration and no password-reset links. The API route verifies the
 * credentials and the admin role before this page navigates anywhere.
 */
export function AdminLoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      const json = (await res.json()) as { redirect?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not sign in.");
      window.location.href = json.redirect ?? "/admin/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:gap-4">
      <TextInput
        label="Email address"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="admin@example.com"
        icon="mail"
        autoComplete="username"
        required
      />

      <div className="relative">
        <TextInput
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          icon="lock"
          autoComplete="current-password"
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="absolute bottom-1 right-1.5 flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          <Icon name={showPassword ? "visibility_off" : "visibility"} size="sm" />
        </button>
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={pending}
        className="bg-sapphire-800 text-white hover:bg-sapphire-700"
      >
        Login as Admin
      </Button>
    </form>
  );
}
