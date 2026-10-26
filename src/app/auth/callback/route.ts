import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app/explore";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Redirect with a stable key, not the provider message: the login page
    // maps keys to copy (src/lib/auth-errors.ts) and would otherwise render
    // whatever an attacker puts in the URL.
    return NextResponse.redirect(new URL("/login?error=exchange_failed", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}