import { createAdminClient } from "@/lib/supabase/admin";
import type { Supabase } from "@/lib/services/helpers";

import {
  reconcileMediaForLiveWedding,
  weddingColumnsFromData,
} from "./wedding-media-reconcile";

export interface ActiveGuestWedding {
  id: string;
  slug: string | null;
  template_id: string | null;
  template_version_id: string | null;
  wedding_data: Record<string, unknown>;
}

/**
 * The live invitation created from a guest session, if there is one.
 *
 * A session can create a draft wedding at checkout before payment. Only an
 * `active` row is the published invitation this builder should keep in sync;
 * unpaid drafts still use the guest-draft media folder and preview signatures.
 */
export async function getActiveGuestWedding(
  supabase: Supabase,
  sessionId: string
): Promise<ActiveGuestWedding | null> {
  const { data, error } = await supabase
    .from("weddings")
    .select("id, slug, template_id, template_version_id, wedding_data")
    .eq("guest_session_id", sessionId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    slug: data.slug,
    template_id: data.template_id,
    template_version_id: data.template_version_id,
    wedding_data: (data.wedding_data ?? {}) as Record<string, unknown>,
  };
}

export interface SyncedGuestWedding {
  id: string;
  slug: string | null;
  data: Record<string, unknown>;
}

/**
 * Mirrors a builder autosave onto the live invitation created by the same
 * guest session.
 *
 * The builder is still the only place a couple can edit photos and music after
 * publishing, so its draft cannot remain a detached copy. Media is reconciled
 * first: if the tab predates publishing, its draft-scoped URLs are replaced by
 * the already-published equivalents instead of overwriting the live data with
 * paths whose objects were moved during the publish migration.
 */
export async function syncActiveWeddingFromDraft(input: {
  sessionId: string;
  draftId?: string;
  weddingData: Record<string, unknown>;
}): Promise<SyncedGuestWedding | null> {
  const supabase = createAdminClient();
  const active = await getActiveGuestWedding(supabase, input.sessionId);
  if (!active) return null;

  const data = reconcileMediaForLiveWedding(
    active.id,
    input.weddingData,
    active.wedding_data
  );

  const { error } = await supabase
    .from("weddings")
    .update({
      ...weddingColumnsFromData(data),
      wedding_data: data as never,
    })
    .eq("id", active.id);
  if (error) throw new Error(`WEDDING_UPDATE_FAILED: ${error.message}`);

  // Keep the draft pointing at the same published URLs. This means a later
  // reload of the builder starts from valid media even before the page has a
  // chance to read the wedding row directly.
  if (input.draftId) {
    const { error: draftError } = await supabase
      .from("guest_drafts")
      .update({ wedding_data: data as never })
      .eq("id", input.draftId);
    if (draftError) {
      console.warn("[guest-wedding] could not mirror media URLs to draft", {
        draftId: input.draftId,
        error: draftError.message,
      });
    }
  }

  return { id: active.id, slug: active.slug, data };
}
