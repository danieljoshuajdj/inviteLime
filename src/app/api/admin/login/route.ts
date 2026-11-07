import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { jsonError, readBody } from "@/lib/services/helpers";
import { clientKey, consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

/** Only allow returning to another admin screen after a successful login. */
function safeAdminNext(value: string | undefined): string {
  return value && /^\/admin(\/|$)/.test(value) ? value : "/admin/dashboard";
}

/**
 * Admin-only email/password sign-in.
 *
 * Customer authentication is Google-only, but administrators keep a dedicated
 * credential flow here. Credentials are verified by Supabase Auth server-side;
 * the browser never talks to a separate admin credential store. A valid
 * customer session is not enough — `profiles.role` must be `admin`, and any
 * non-admin session created by this request is signed out again immediately.
 */
export async function POST(req: Request) {
  try {
    const body = await readBody(req);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(400, "Enter your admin email and password.");
    }

    // Slow down password guessing without revealing whether the address exists.
    const limit = await consumeRateLimit({
      bucket: "admin_login",
      key: clientKey(req),
      limit: 10,
      windowSeconds: 15 * 60,
    });
    if (!limit.allowed) {
      return jsonError(429, "Too many sign-in attempts. Please wait a few minutes and try again.");
    }

    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error || !data.user) {
      return jsonError(401, "Incorrect email or password.");
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "admin") {
      // Do not leave a customer session behind on the admin login route.
      await supabase.auth.signOut().catch(() => undefined);
      return jsonError(403, "This account does not have admin access.");
    }

    return Response.json({ ok: true, redirect: safeAdminNext(parsed.data.next) });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Could not sign in.");
  }
}
