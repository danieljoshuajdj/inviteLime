import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Supabase } from "@/lib/services/helpers";
import { getObjectStorage, TEMPLATE_BUCKET } from "@/lib/services/storage";
import { isBackblazeConfigured } from "@/lib/services/storage/urls";
import {
  injectRuntimePayload,
  looksLikeHtmlDocument,
  templateAssetBaseUrl,
  type RuntimePayload,
} from "@/lib/runtime/payload";
import { formTypeOrDefault, type FormType } from "@/lib/builder/forms";

interface TemplateVersionRow {
  id: string;
  version: string;
  storage_prefix: string;
  manifest: Record<string, unknown>;
  template_id: string;
  status: string;
  is_current: boolean;
  templates:
    | { id: string; name: string; slug: string; form_type: string | null }
    | { id: string; name: string; slug: string; form_type: string | null }[]
    | null;
}

export interface RuntimeTemplateSource {
  /** Version row id. Alias of `versionId`, convenient for identity checks. */
  id: string;
  templateId: string;
  templateName: string;
  templateSlug: string;
  /** The template's event form, used for previews of unpublished drafts. */
  formType: FormType;
  versionId: string;
  version: string;
  storagePrefix: string;
  entry: string;
  manifest: Record<string, unknown>;
  status: string;
  isCurrent: boolean;
}

export interface RuntimeDocument {
  source: RuntimeTemplateSource;
  html: string;
}

function rowToRuntimeSource(row: TemplateVersionRow): RuntimeTemplateSource | null {
  const manifest = (row.manifest ?? {}) as Record<string, unknown>;
  const template = row.templates as
    | { id: string; name: string; slug: string; form_type: string | null }
    | { id: string; name: string; slug: string; form_type: string | null }[]
    | null;
  const t = Array.isArray(template) ? template[0] : template;
  if (!t) return null;

  return {
    id: row.id,
    templateId: row.template_id,
    templateName: t.name,
    templateSlug: t.slug,
    formType: formTypeOrDefault(t.form_type),
    versionId: row.id,
    version: row.version,
    storagePrefix: row.storage_prefix,
    entry: typeof manifest.entry === "string" ? manifest.entry : "index.html",
    manifest,
    status: row.status,
    isCurrent: row.is_current,
  };
}

/**
 * Resolves the template version pinned by an invitation. A replaced release
 * stays renderable (`previous`) during its 72-hour rollback window, so an
 * invitation never breaks if a repoint is racing a publish or cleanup.
 * Retired/draft/uploading releases are never served here.
 */
export async function resolveRuntimeTemplate(
  supabase: Supabase,
  templateVersionId: string
): Promise<RuntimeTemplateSource | null> {
  const { data, error } = await supabase
    .from("template_versions")
    .select(
      "id, version, storage_prefix, manifest, template_id, status, is_current, templates:template_id(id, name, slug, form_type)"
    )
    .eq("id", templateVersionId)
    .in("status", ["published", "previous"])
    .maybeSingle();

  if (error || !data) return null;
  return rowToRuntimeSource(data as TemplateVersionRow);
}

/** Current published version for a template — used by demo mode. */
export async function resolveCurrentTemplateVersion(
  supabase: Supabase,
  templateId: string
): Promise<RuntimeTemplateSource | null> {
  const { data, error } = await supabase
    .from("template_versions")
    .select("id")
    .eq("template_id", templateId)
    .eq("is_current", true)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data?.id) return null;
  return resolveRuntimeTemplate(supabase, data.id);
}

/**
 * Fetches the template's entry document from object storage. Published
 * template assets are immutable, so the response is cached for a day.
 *
 * With B2 the bucket is private and the signed `<base href>` is only emitted
 * for the browser, so the server reads the entry directly through the storage
 * abstraction instead of round-tripping through its own proxy route.
 */
export async function fetchTemplateHtml(source: RuntimeTemplateSource): Promise<string | null> {
  const entry = source.entry.replace(/^\/+/, "");

  if (isBackblazeConfigured()) {
    try {
      const storage = await getObjectStorage();
      const prefix = source.storagePrefix.replace(/^\/+|\/+$/g, "");
      const object = await storage.download(TEMPLATE_BUCKET, `${prefix}/${entry}`);
      if (!object) return null;
      const html = object.body.toString("utf8");
      return looksLikeHtmlDocument(html) ? html : null;
    } catch {
      return null;
    }
  }

  const base = templateAssetBaseUrl(source.storagePrefix);
  try {
    const res = await fetch(`${base}${entry}`, {
      next: { revalidate: 86_400, tags: [`template:${source.versionId}`] },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return looksLikeHtmlDocument(html) ? html : null;
  } catch {
    return null;
  }
}

/** Fetch + bind a template package into a renderable sandbox document. */
export async function buildRuntimeDocument(
  source: RuntimeTemplateSource,
  payload: RuntimePayload
): Promise<RuntimeDocument | null> {
  const html = await fetchTemplateHtml(source);
  if (!html) return null;

  return {
    source,
    html: injectRuntimePayload(html, {
      baseHref: templateAssetBaseUrl(source.storagePrefix),
      payload,
    }),
  };
}

/**
 * Decides which releases a live invitation should try.
 *
 * The template's current published release always wins. A pinned `previous`
 * release is only the fallback while a publish is in flight, for invitations
 * created before the first publish under automatic updates, or when the current
 * package is temporarily unreadable. `templateId` is authoritative when the
 * caller has it (the public invitation page does), so a stale or corrupted pin
 * can never pull in another template.
 */
export async function resolveInvitationTemplateSources(
  supabase: Supabase,
  templateVersionId: string | null,
  templateId: string | null | undefined
): Promise<{
  preferred: RuntimeTemplateSource;
  fallback: RuntimeTemplateSource | null;
} | null> {
  const pinned = templateVersionId
    ? await resolveRuntimeTemplate(supabase, templateVersionId)
    : null;
  const ownerId = templateId ?? pinned?.templateId ?? null;
  if (!ownerId) return null;

  const pinnedMatchesOwner = pinned?.templateId === ownerId;
  const fallback = pinnedMatchesOwner ? pinned : null;

  if (fallback?.isCurrent && fallback.status === "published") {
    return { preferred: fallback, fallback: null };
  }

  const current = await resolveCurrentTemplateVersion(supabase, ownerId);
  if (current) {
    return { preferred: current, fallback };
  }
  return fallback ? { preferred: fallback, fallback: null } : null;
}

/**
 * Convenience wrapper for the public invitation page.
 *
 * Prefers the template's live release even when the stored invitation still
 * names a retained previous release, then falls back to that retained package
 * if the live release cannot be read. This keeps every invitation on the
 * latest successful release without breaking a working one during a failed
 * update or cleanup.
 */
export async function loadInvitationRuntime(
  templateVersionId: string | null,
  payload: RuntimePayload,
  options: { templateId?: string | null } = {}
): Promise<RuntimeDocument | null> {
  const supabase = createAdminClient();
  const sources = await resolveInvitationTemplateSources(
    supabase,
    templateVersionId,
    options.templateId
  );
  if (!sources) return null;

  const preferred = await buildRuntimeDocument(sources.preferred, payload);
  if (preferred) return preferred;
  if (!sources.fallback) return null;
  return buildRuntimeDocument(sources.fallback, payload);
}

/** Convenience wrapper for template demo mode. */
export async function loadDemoRuntime(
  templateId: string,
  payload: RuntimePayload
): Promise<RuntimeDocument | null> {
  const supabase = createAdminClient();
  const source = await resolveCurrentTemplateVersion(supabase, templateId);
  if (!source) return null;
  return buildRuntimeDocument(source, payload);
}

/**
 * Admin-only version preview. Drafts are allowed so an admin can inspect a
 * package before publishing it. The caller must enforce the admin gate; this
 * function never exposes a version through a public route by itself.
 */
export async function loadTemplateVersionRuntime(
  templateId: string,
  versionId: string,
  payload: RuntimePayload,
  options: { allowDraft?: boolean } = {}
): Promise<RuntimeDocument | null> {
  const supabase = createAdminClient();
  const statuses = options.allowDraft
    ? ["published", "previous", "draft"]
    : ["published", "previous"];
  const { data, error } = await supabase
    .from("template_versions")
    .select(
      "id, version, storage_prefix, manifest, template_id, status, is_current, templates:template_id(id, name, slug, form_type)"
    )
    .eq("id", versionId)
    .eq("template_id", templateId)
    .in("status", statuses)
    .maybeSingle();
  if (error || !data) return null;

  const source = rowToRuntimeSource(data as TemplateVersionRow);
  if (!source) return null;
  return buildRuntimeDocument(source, payload);
}
