import { createAdminClient } from "@/lib/supabase/admin";

export type AnalyticsEvent =
  | "invitation_view"
  | "invitation_c7_click"
  | "rsvp_submitted"
  | "wedding_published"
  | "wedding_share_click";

export interface AnalyticsFields {
  wedding_id?: string | null;
  template_id?: string | null;
  user_id?: string | null;
  session_id?: string | null;
  [key: string]: unknown;
}

const STRUCTURED_KEYS = ["wedding_id", "template_id", "user_id", "session_id"] as const;

async function rpcEvent(event: AnalyticsEvent, fields: AnalyticsFields) {
  const supabase = createAdminClient();
  const metadata: Record<string, unknown> = { ...fields };
  for (const key of STRUCTURED_KEYS) delete metadata[key];
  await supabase.rpc("record_analytics_event", {
    p_event: event,
    p_wedding_id: fields.wedding_id ?? null,
    p_template_id: fields.template_id ?? null,
    p_user_id: fields.user_id ?? null,
    p_session_id: fields.session_id ?? null,
    p_metadata: metadata as never,
  });
}

export async function recordEvent(event: AnalyticsEvent, fields: AnalyticsFields = {}) {
  try {
    await rpcEvent(event, fields);
  } catch {
    // Analytics failures must never break the main flow.
  }
}

export async function recordCount(event: AnalyticsEvent, count: number, fields: AnalyticsFields = {}) {
  try {
    await rpcEvent(event, { ...fields, count });
  } catch {
    // best effort
  }
}