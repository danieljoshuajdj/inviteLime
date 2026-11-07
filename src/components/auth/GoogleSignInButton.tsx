"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { createBrowserClient } from "@/lib/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";

interface Props {
  /** Path to return to after Google completes the sign-in. */
  next: string;
  onError?: (message: string) => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * The only sign-in affordance for customers: Google OAuth through Supabase.
 *
 * Supabase verifies the Google identity, links it to an existing account by
 * verified email and sets the same session cookies the rest of the app reads.
 * No provider secret ever reaches the browser.
 */
export function GoogleSignInButton({
  next,
  onError,
  className,
  label = "Continue with Google",
  disabled = false,
}: Props) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    onError?.("");

    try {
      const supabase = createBrowserClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
      // On success the browser is already navigating to Google.
    } catch (err) {
      console.warn("[auth] google sign-in failed", err);
      onError?.(friendlyAuthError(err, "login"));
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      fullWidth
      loading={pending}
      disabled={disabled}
      onClick={() => void handleClick()}
      className={
        className ??
        "border-navy-200 bg-white text-navy-900 hover:bg-ivory-100"
      }
    >
      {!pending && <GoogleMark />}
      {label}
    </Button>
  );
}

/** Official four-colour Google "G" mark. */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795Z"
      />
    </svg>
  );
}
