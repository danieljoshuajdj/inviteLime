import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Supabase } from "@/lib/services/helpers";

export const GUEST_TOKEN_COOKIE = "vc_guest_token";
export const GUEST_SESSION_COOKIE = "vc_guest_session";

export interface GuestSession {
  id: string;
  access_token: string;
  expires_at: string;
}

export interface GuestDraft {
  id: string;
  session_id: string;
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

/** Creates a guest session server-side and stores it in an httpOnly cookie. */
export async function createGuestSession(): Promise<GuestSession> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("create_guest_session");
  if (error) throw error;
  return data as unknown as GuestSession;
}

/** Creates a session cookie (used by client callers via /api/guest/session). */
export function setGuestCookies(
  documentRef: { cookie: string },
  session: GuestSession
) {
  const maxAge = Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000);
  documentRef.cookie = `${GUEST_TOKEN_COOKIE}=${session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax; ${
    location.protocol === "https:" ? "Secure;" : ""
  }`;
  documentRef.cookie = `${GUEST_SESSION_COOKIE}=${session.id}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export async function fetchGuestSessionFromApi(): Promise<GuestSession> {
  const res = await fetch("/api/guest/session", { method: "POST" });
  if (!res.ok) throw new Error("Could not start a guest session");
  const json = (await res.json()) as { session: GuestSession };
  return json.session;
}

export async function getGuestDraft(
  supabase: Supabase,
  token: string
): Promise<GuestDraft | null> {
  const { data, error } = await supabase.rpc("get_guest_draft", { p_token: token });
  if (error) throw error;
  if (!data || data === "null") return null;
  return data as unknown as GuestDraft;
}

export async function saveGuestDraft(input: {
  token: string;
  templateId: string;
  templateVersionId: string;
  weddingData: Record<string, unknown>;
  email?: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("save_guest_draft", {
    p_token: input.token,
    p_template_id: input.templateId,
    p_template_version_id: input.templateVersionId,
    p_wedding_data: input.weddingData as never,
    p_email: input.email ?? null,
  });
  if (error) throw error;
  return data as unknown as GuestDraft;
}

export async function linkDraftToAccount(input: {
  draft: GuestDraft;
  userId: string;
}) {
  const supabase = createAdminClient();
  const { data: wedding, error: weddingError } = await supabase
    .from("weddings")
    .select("id")
    .eq("guest_session_id", input.draft.session_id)
    .maybeSingle();

  return { wedding, weddingError };
}

export function guestTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${GUEST_TOKEN_COOKIE}=`));
  return match ? match.slice(GUEST_TOKEN_COOKIE.length + 1) : null;
}