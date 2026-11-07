import { randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Supabase } from "@/lib/services/helpers";

/**
 * Storage for in-progress invitation drafts.
 *
 * Drafts used to be reachable without an account. They are now created only
 * for an authenticated Supabase user and every read/write is checked against
 * the owning user id. The database tables keep their historical `guest_*`
 * names so existing rows and media folders continue to work; the application
 * no longer exposes an anonymous creation path.
 */

export const BUILDER_TOKEN_COOKIE = "vc_builder_token";
export const BUILDER_SESSION_COOKIE = "vc_builder_session";

export interface BuilderSession {
  id: string;
  access_token: string;
  expires_at: string;
  user_id: string;
}

export interface BuilderDraft {
  id: string;
  session_id: string;
  /** Owner of the session. Always set for drafts created after auth was required. */
  user_id: string | null;
  template_id: string;
  template_version_id: string;
  wedding_data: Record<string, unknown>;
  email: string | null;
  status: string;
  expires_at: string;
  updated_at: string;
  planner_id: string | null;
  planner_subscription_id: string | null;
}

/** Creates an authenticated builder session owned by `userId`. */
export async function createBuilderSession(input: {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<BuilderSession> {
  const supabase = createAdminClient();
  const accessToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("guest_sessions")
    .insert({
      access_token: accessToken,
      user_id: input.userId,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
      expires_at: expiresAt,
    })
    .select("id, access_token, expires_at, user_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Could not create a builder session");
  }

  return data as BuilderSession;
}

/** Latest unexpired draft for a session token, including its owner. */
export async function getBuilderDraft(
  supabase: Supabase,
  token: string
): Promise<BuilderDraft | null> {
  const now = new Date().toISOString();
  const { data: session, error: sessionError } = await supabase
    .from("guest_sessions")
    .select("id, user_id")
    .eq("access_token", token)
    .gt("expires_at", now)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session) return null;

  const { data: draft, error: draftError } = await supabase
    .from("guest_drafts")
    .select(
      "id, session_id, template_id, template_version_id, wedding_data, email, status, expires_at, updated_at, planner_id, planner_subscription_id"
    )
    .eq("session_id", session.id)
    .gt("expires_at", now)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (draftError) throw draftError;
  if (!draft) return null;

  return {
    ...(draft as Omit<BuilderDraft, "user_id">),
    user_id: session.user_id ?? null,
  };
}

/**
 * A draft is readable only by the user who created its session. A token is
 * still an opaque capability in the URL, but it is never sufficient on its
 * own: the caller must also hold the matching Supabase session.
 */
export async function getOwnedBuilderDraft(
  supabase: Supabase,
  token: string,
  userId: string
): Promise<BuilderDraft | null> {
  const draft = await getBuilderDraft(supabase, token);
  if (!draft || draft.user_id !== userId) return null;
  return draft;
}

export async function saveBuilderDraft(input: {
  token: string;
  userId: string;
  templateId: string;
  templateVersionId: string;
  weddingData: Record<string, unknown>;
  email?: string | null;
}): Promise<BuilderDraft> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("save_guest_draft", {
    p_token: input.token,
    p_template_id: input.templateId,
    p_template_version_id: input.templateVersionId,
    p_wedding_data: input.weddingData as never,
    p_email: input.email ?? null,
  });
  if (error) throw error;

  return {
    ...(data as unknown as Omit<BuilderDraft, "user_id">),
    user_id: input.userId,
  };
}

export function builderTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${BUILDER_TOKEN_COOKIE}=`));
  return match ? match.slice(BUILDER_TOKEN_COOKIE.length + 1) : null;
}
