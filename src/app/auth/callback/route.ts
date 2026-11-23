import { NextResponse } from "next/server";

import { createServerClient } from "@/lib/supabase/server";

const DEFAULT_NEXT = "/app/explore";

/**
 * Only allow post-login redirects back into this application. `new URL` also
 * normalises tricks such as `//evil.example` or `/\evil.example`, so the final
 * origin check is what makes the redirect safe.
 */
function safeNextPath(value: string | null, origin: string): string {
  if (!value) return DEFAULT_NEXT;
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin) return DEFAULT_NEXT;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return DEFAULT_NEXT;
  }
}

/**
 * Copies the Google profile fields Supabase stores on the auth user into the
 * application's existing `profiles` row. The sign-up trigger already seeds
 * `full_name`; this also fills `avatar_url` for new and existing accounts
 * without overwriting a name the customer has chosen themselves.
 */
async function syncGoogleProfile(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  user: {
    id: string;
    app_metadata?: { provider?: string };
    user_metadata?: Record<string, unknown>;
    identities?: Array<{
      provider: string;
      provider_id?: string;
      identity_data?: Record<string, unknown>;
    }>;
  } | null
) {
  if (!user) return;

  const googleIdentity = user.identities?.find((identity) => identity.provider === "google");
  if (user.app_metadata?.provider !== "google" && !googleIdentity) return;

  const metadata = {
    ...(user.user_metadata ?? {}),
    ...(googleIdentity?.identity_data ?? {}),
  };
  const fullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;
  const avatarUrl =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : null;
  const googleId =
    googleIdentity?.provider_id ??
    (typeof metadata.sub === "string" ? metadata.sub : null);

  if (!fullName && !avatarUrl && !googleId) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return;

  const patch: { full_name?: string; avatar_url?: string; google_id?: string } = {};
  if (!profile.full_name && fullName) patch.full_name = fullName;
  if (avatarUrl && avatarUrl !== profile.avatar_url) patch.avatar_url = avatarUrl;
  if (googleId) patch.google_id = googleId;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (!error) return;

  // Older deployments may not have run migration 00021 yet. The name and
  // picture are still worth saving even when the google_id column is absent.
  if (/google_id/i.test(error.message)) {
    const fallback = { ...patch };
    delete fallback.google_id;
    if (Object.keys(fallback).length > 0) {
      const { error: retryError } = await supabase
        .from("profiles")
        .update(fallback)
        .eq("id", user.id);
      if (!retryError) return;
    }
  }

  // A profile sync failure must never block a successful sign-in.
  console.warn("[auth/callback] could not sync Google profile", error.message);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), origin);

  /** Login URL that keeps the chosen template so a retry returns to it. */
  const loginError = (key: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", key);
    if (next !== DEFAULT_NEXT) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  // Google (or Supabase) returns an error when the person cancels the consent
  // screen or the provider is misconfigured. Map it to stable keys the login
  // page owns, never reflecting provider text from the URL.
  const providerError = searchParams.get("error");
  if (providerError) {
    const description = searchParams.get("error_description") ?? "";
    const detail = `${providerError} ${description}`;
    const cancelled = /access_denied|consent|cancel/i.test(detail);
    const misconfigured = /redirect_uri_mismatch|invalid_client|invalid_request/i.test(detail);
    const googleError = cancelled || /google|oauth|external provider/i.test(detail);
    const key = cancelled
      ? "google_cancelled"
      : misconfigured
        ? "google_unavailable"
        : googleError
          ? "google_failed"
          : "exchange_failed";
    return loginError(key);
  }

  if (!code) {
    return loginError("missing_code");
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Redirect with a stable key, not the provider message: the login page
    // maps keys to copy (src/lib/auth-errors.ts) and would otherwise render
    // whatever an attacker puts in the URL.
    return loginError("exchange_failed");
  }

  await syncGoogleProfile(supabase, data.user);

  return NextResponse.redirect(new URL(next, origin));
}
