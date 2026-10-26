import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

export type Supabase = SupabaseClient<Database>;

export async function getCurrentProfile(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return { user, profile };
}

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>>;

export async function requireUser(supabase: Supabase): Promise<AuthSession> {
  const session = await getCurrentProfile(supabase);
  if (!session) {
    throw new Error("AUTH_REQUIRED");
  }
  return session;
}

export async function requireAdmin(supabase: Supabase): Promise<AuthSession> {
  const session = await requireUser(supabase);
  if (session.profile?.role !== "admin") {
    throw new Error("ADMIN_REQUIRED");
  }
  return session;
}

export async function isAdmin(supabase: Supabase): Promise<boolean> {
  try {
    await requireAdmin(supabase);
    return true;
  } catch {
    return false;
  }
}

export function parseBody<T>(data: T): T;
export function parseBody<T>(data: unknown, fallback: T): T;
export function parseBody<T>(data: unknown, fallback?: T): T {
  if (data === undefined || data === null) {
    if (fallback !== undefined) return fallback;
    throw new Error("Missing request body");
  }
  return data as T;
}

export async function readBody(req: Request): Promise<Json> {
  try {
    return await req.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function jsonError(status: number, message: string, details?: unknown) {
  return Response.json({ error: message, details }, { status });
}