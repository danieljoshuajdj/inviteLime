import "server-only";

import type { Supabase } from "@/lib/services/helpers";
import { TEMPLATE_BUCKET, type ObjectStorage } from "@/lib/services/storage";
import { looksLikeHtmlDocument } from "@/lib/runtime/payload";
import { normalizeWeddingData } from "@/lib/builder/defaults";
import { formTypeOrDefault } from "@/lib/builder/forms";

/**
 * Compatibility gate for applying a template release to real invitations.
 *
 * A version may only replace the live one when:
 *  - its row belongs to the template and is in an allowed state;
 *  - its storage prefix is inside the template namespace;
 *  - its manifest entry exists and is an HTML document;
 *  - the features it explicitly drops are not used by the invitations and
 *    builder drafts that will be moved to it.
 *
 * A form-type mismatch is surfaced as a warning rather than a hard failure:
 * the runtime payload carries the invitation's own form, and older data may
 * legitimately differ from a template that was recategorised after purchase.
 */

export type TemplateCompatibilityPurpose = "publish" | "rollback" | "retire";

export interface TemplateCompatibilityIssue {
  code:
    | "unsafe-prefix"
    | "invalid-entry"
    | "entry-missing"
    | "invalid-html"
    | "package-unavailable"
    | "feature-missing"
    | "not-found"
    | "wrong-status";
  message: string;
  invitationId?: string;
  invitationSlug?: string;
  draftId?: string;
  feature?: string;
}

export interface TemplateCompatibilityResult {
  ok: boolean;
  issues: TemplateCompatibilityIssue[];
  warnings: string[];
  /** Inventory rows that belong to the template (or selected versions). */
  affectedInvitations: number;
  activeInvitations: number;
  affectedDrafts: number;
}

export interface TemplateCompatibilityOptions {
  supabase: Supabase;
  templateId: string;
  versionId: string;
  storage: ObjectStorage;
  purpose: TemplateCompatibilityPurpose;
  /**
   * Limit the data check to invitations/drafts pinned to these versions.
   * Omit for publish/rollback, which repoints every invitation of the template.
   */
  sourceVersionIds?: string[];
}

interface TemplateRow {
  id: string;
  name: string;
  form_type: string | null;
  status: string;
}

interface VersionRow {
  id: string;
  template_id: string;
  version: string;
  storage_prefix: string;
  manifest: Record<string, unknown> | null;
  status: string;
  delete_after: string | null;
  retired_at: string | null;
}

interface WeddingRow {
  id: string;
  slug: string | null;
  status: string;
  form_type: string | null;
  bride_name: string | null;
  groom_name: string | null;
  rsvp_toggle: boolean;
  planner_id: string | null;
  wedding_data: unknown;
  template_version_id: string | null;
}

interface DraftRow {
  id: string;
  wedding_data: unknown;
  template_version_id: string | null;
}

function hasSafePrefix(prefix: string, templateId: string): boolean {
  const clean = (prefix ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!clean || !clean.startsWith(`${templateId}/`)) return false;
  return clean
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function entryPath(manifest: Record<string, unknown> | null): string | null {
  const raw = typeof manifest?.entry === "string" ? manifest.entry : "index.html";
  const clean = raw.trim().replace(/^\/+/, "");
  if (!clean) return null;
  if (clean.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return clean;
}

function featuresOf(manifest: Record<string, unknown> | null): Record<string, unknown> {
  const value = manifest?.features;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function featureMissing(features: Record<string, unknown>, key: string): boolean {
  return features[key] === false;
}

function usedFeatures(
  data: ReturnType<typeof normalizeWeddingData>,
  options: {
    rsvpEnabled: boolean;
    brideName?: string | null;
    groomName?: string | null;
    hasPlannerBrand?: boolean;
  }
): string[] {
  const used: string[] = [];
  if (data.includeGallery && data.gallery.length > 0) used.push("gallery");
  if (data.music) used.push("music");
  if (data.events.length > 0) used.push("events");
  if (data.story.trim()) used.push("story");
  if (data.dress?.enabled) used.push("dress");
  if (options.rsvpEnabled) used.push("rsvp");
  if (
    data.brideName.trim() ||
    data.groomName.trim() ||
    options.brideName?.trim() ||
    options.groomName?.trim()
  ) {
    used.push("couple");
  }
  if (options.hasPlannerBrand) used.push("plannerBranding");
  return used;
}

function addFeatureIssues(
  issues: TemplateCompatibilityIssue[],
  warnings: string[],
  features: Record<string, unknown>,
  data: ReturnType<typeof normalizeWeddingData>,
  options: {
    subject: "invitation" | "draft";
    id: string;
    slug?: string | null;
    rsvpEnabled: boolean;
    brideName?: string | null;
    groomName?: string | null;
    hasPlannerBrand?: boolean;
    hard: boolean;
  }
): void {
  const missing = usedFeatures(data, options).filter((feature) =>
    featureMissing(features, feature)
  );
  for (const feature of missing) {
    if (!options.hard) {
      warnings.push(
        `A builder draft uses "${feature}", but this version declares that feature as unavailable. The draft will still be moved; review it before publishing.`
      );
      continue;
    }
    issues.push({
      code: "feature-missing",
      feature,
      message:
        options.subject === "invitation"
          ? `Invitation ${options.slug ?? options.id} uses "${feature}", but this version declares that feature as unavailable.`
          : `A builder draft uses "${feature}", but this version declares that feature as unavailable.`,
      ...(options.subject === "invitation"
        ? { invitationId: options.id, invitationSlug: options.slug ?? undefined }
        : { draftId: options.id }),
    });
  }
}

export async function verifyTemplateVersionCompatibility(
  options: TemplateCompatibilityOptions
): Promise<TemplateCompatibilityResult> {
  const { supabase, templateId, versionId, storage, purpose, sourceVersionIds } = options;
  const issues: TemplateCompatibilityIssue[] = [];
  const warnings: string[] = [];

  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, name, form_type, status")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) throw new Error(templateError.message);
  if (!template) {
    return {
      ok: false,
      issues: [{ code: "not-found", message: "Template not found" }],
      warnings,
      affectedInvitations: 0,
      activeInvitations: 0,
      affectedDrafts: 0,
    };
  }

  const { data: version, error: versionError } = await supabase
    .from("template_versions")
    .select(
      "id, template_id, version, storage_prefix, manifest, status, delete_after, retired_at"
    )
    .eq("id", versionId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (!version) {
    return {
      ok: false,
      issues: [{ code: "not-found", message: "Template version not found" }],
      warnings,
      affectedInvitations: 0,
      activeInvitations: 0,
      affectedDrafts: 0,
    };
  }

  const target = version as VersionRow;
  const allowed =
    purpose === "publish"
      ? ["draft"]
      : purpose === "rollback"
        ? ["previous"]
        : ["published", "previous"];
  if (!allowed.includes(target.status)) {
    issues.push({
      code: "wrong-status",
      message: `v${target.version} is not eligible for this action (status: ${target.status}).`,
    });
  }
  if (purpose === "rollback") {
    if (target.retired_at) {
      issues.push({
        code: "wrong-status",
        message: `v${target.version} has already been retired.`,
      });
    }
    if (target.delete_after && Date.parse(target.delete_after) <= Date.now()) {
      issues.push({
        code: "wrong-status",
        message: `v${target.version} has passed its retention window.`,
      });
    }
  }

  if (!hasSafePrefix(target.storage_prefix, templateId)) {
    issues.push({
      code: "unsafe-prefix",
      message: "The package storage prefix is outside this template's namespace.",
    });
  } else {
    const entry = entryPath(target.manifest);
    if (!entry) {
      issues.push({
        code: "invalid-entry",
        message: "The package manifest has an unsafe entry path.",
      });
    } else {
      const key = `${target.storage_prefix.replace(/^\/+|\/+$/g, "")}/${entry}`;
      try {
        const object = await storage.download(TEMPLATE_BUCKET, key);
        if (!object) {
          issues.push({
            code: "entry-missing",
            message: `The package entry ${entry} is missing from storage.`,
          });
        } else if (!looksLikeHtmlDocument(object.body.toString("utf8"))) {
          issues.push({
            code: "invalid-html",
            message: `The package entry ${entry} is not an HTML document.`,
          });
        }
      } catch (err) {
        issues.push({
          code: "package-unavailable",
          message: `The package entry could not be read: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
  }

  let weddingQuery = supabase
    .from("weddings")
    .select(
      "id, slug, status, form_type, bride_name, groom_name, rsvp_toggle, planner_id, wedding_data, template_version_id"
    );
  weddingQuery =
    sourceVersionIds && sourceVersionIds.length > 0
      ? weddingQuery.in("template_version_id", sourceVersionIds)
      : weddingQuery.eq("template_id", templateId);
  const { data: weddings, error: weddingsError } = await weddingQuery;
  if (weddingsError) throw new Error(weddingsError.message);

  let draftQuery = supabase
    .from("guest_drafts")
    .select("id, wedding_data, template_version_id");
  draftQuery =
    sourceVersionIds && sourceVersionIds.length > 0
      ? draftQuery.in("template_version_id", sourceVersionIds)
      : draftQuery.eq("template_id", templateId);
  const { data: drafts, error: draftsError } = await draftQuery;
  if (draftsError) throw new Error(draftsError.message);

  const weddingRows = (weddings ?? []) as WeddingRow[];
  const draftRows = (drafts ?? []) as DraftRow[];
  const features = featuresOf(target.manifest);
  const templateForm = formTypeOrDefault((template as TemplateRow).form_type);
  let activeInvitations = 0;
  let formMismatchWarned = false;

  for (const wedding of weddingRows) {
    const data = normalizeWeddingData(wedding.wedding_data);
    const live = wedding.status === "active" || wedding.status === "draft";
    if (live) activeInvitations += 1;

    if (
      live &&
      formTypeOrDefault(wedding.form_type) !== templateForm &&
      !formMismatchWarned
    ) {
      formMismatchWarned = true;
      warnings.push(
        "One or more invitations use a different event form from this template. Their saved form is preserved, but review the package before switching them."
      );
    }

    addFeatureIssues(issues, warnings, features, data, {
      subject: "invitation",
      id: wedding.id,
      slug: wedding.slug,
      rsvpEnabled: wedding.rsvp_toggle,
      brideName: wedding.bride_name,
      groomName: wedding.groom_name,
      hasPlannerBrand: Boolean(wedding.planner_id),
      hard: live,
    });
  }

  for (const draft of draftRows) {
    const data = normalizeWeddingData(draft.wedding_data);
    addFeatureIssues(issues, warnings, features, data, {
      subject: "draft",
      id: draft.id,
      rsvpEnabled: data.rsvpEnabled,
      hard: false,
    });
  }

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    affectedInvitations: weddingRows.length,
    activeInvitations,
    affectedDrafts: draftRows.length,
  };
}
