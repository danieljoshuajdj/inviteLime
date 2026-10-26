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

interface TemplateVersionRow {
  id: string;
  version: string;
  storage_prefix: string;
  manifest: Record<string, unknown>;
  template_id: string;
  templates: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
}

export interface RuntimeTemplateSource {
  templateId: string;
  templateName: string;
  templateSlug: string;
  versionId: string;
  version: string;
  storagePrefix: string;
  entry: string;
  manifest: Record<string, unknown>;
}

export interface RuntimeDocument {
  source: RuntimeTemplateSource;
  html: string;
}

/**
 * Resolves the immutable template version that an invitation was purchased on
 * (or the current published version for demo mode). Returns null when the
 * template package has not been uploaded yet, so callers can fall back to the
 * built-in runtime instead of failing.
 */
export async function resolveRuntimeTemplate(
  supabase: Supabase,
  templateVersionId: string
): Promise<RuntimeTemplateSource | null> {
  const { data, error } = await supabase
    .from("template_versions")
    .select(
      "id, version, storage_prefix, manifest, template_id, templates:template_id(id, name, slug)"
    )
    .eq("id", templateVersionId)
    .eq("status", "published")
    .maybeSingle();

  if (error || !data) return null;

  const row = data as TemplateVersionRow;
  const manifest = (row.manifest ?? {}) as Record<string, unknown>;
  const template = row.templates as
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null;
  const t = Array.isArray(template) ? template[0] : template;
  if (!t) return null;

  return {
    templateId: row.template_id,
    templateName: t.name,
    templateSlug: t.slug,
    versionId: row.id,
    version: row.version,
    storagePrefix: row.storage_prefix,
    entry: typeof manifest.entry === "string" ? manifest.entry : "index.html",
    manifest,
  };
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

/** Convenience wrapper for the public invitation page. */
export async function loadInvitationRuntime(
  templateVersionId: string | null,
  payload: RuntimePayload
): Promise<RuntimeDocument | null> {
  if (!templateVersionId) return null;
  const supabase = createAdminClient();
  const source = await resolveRuntimeTemplate(supabase, templateVersionId);
  if (!source) return null;
  return buildRuntimeDocument(source, payload);
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
