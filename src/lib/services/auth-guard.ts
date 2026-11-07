import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Server-component guard for pages that require an account.
 *
 * `next` is the exact path (including its query string) the person should land
 * on after Google sign-in. The auth callback validates it before redirecting,
 * so it can safely carry the template a visitor chose.
 */
export async function requireSignedIn(next: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return { supabase, user };
}
