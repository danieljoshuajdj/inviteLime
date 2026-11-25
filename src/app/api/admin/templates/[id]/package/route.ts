/**
 * Template package upload endpoint.
 *
 * POST  /api/admin/templates/[id]/package
 *   Uploads and validates a ZIP package, extracts it into storage, and creates
 *   a DRAFT template version. Does NOT auto-publish. Admin must explicitly publish.
 *
 * Replacement lifecycle:
 *  - The new version is claimed in the database with status "uploading" before
 *    any object is written. The unique (template_id, version) constraint makes
 *    concurrent uploads serialise: the loser gets a 409 instead of writing into
 *    the winner's prefix.
 *  - Files are written to the claimed version's prefix. A failed upload removes
 *    the claim and its files, so a rejected package never leaves orphaned rows
 *    or objects.
 *  - Once the upload is committed as a draft, superseded draft versions are
 *    removed. Published and retained-previous versions are never touched here;
 *    the publish route switches the live release atomically and keeps the
 *    replaced one for the rollback window.
 *
 * Security:
 *  - requireAdmin() on every request
 *  - Full ZIP security scan via validateTemplateZip()
 *  - Path traversal protection before any storage write
 *  - Never overwrites published immutable version assets
 *  - Version stored as draft until admin publishes
 */

import AdmZip from "adm-zip";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/services/ops";
import { validateTemplateZip } from "@/lib/services/template-validator";
import {
  getObjectStorage,
  TEMPLATE_BUCKET,
  type ObjectStorage,
} from "@/lib/services/storage";
import {
  cleanupStaleVersionUploads,
  cleanupSupersededDraftVersions,
  deleteTemplateVersionObjects,
  type VersionCleanupResult,
} from "@/lib/services/template-version-cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ZIP_BYTES = 60 * 1024 * 1024;
const MAX_VERSION_COUNT = 25;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const limit = await consumeRateLimit({
      bucket: "admin_template_upload",
      key: admin.user.id,
      limit: 20,
      windowSeconds: 3600,
    });
    if (!limit.allowed)
      return Response.json({ error: "Too many template uploads. Please slow down." }, { status: 429 });

    const adminClient = createAdminClient();

    const { data: template, error: tErr } = await adminClient
      .from("templates")
      .select("id, name, slug")
      .eq("id", id)
      .maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!template) return Response.json({ error: "Template not found" }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    const thumbnail = form.get("thumbnail");

    if (!(file instanceof File))
      return Response.json({ error: "A package ZIP file is required" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".zip"))
      return Response.json({ error: "Package must be a .zip file" }, { status: 400 });
    if (file.size > MAX_ZIP_BYTES)
      return Response.json({ error: "Package exceeds 60 MB limit" }, { status: 400 });

    // Validate the thumbnail before claiming a version, so a bad image cannot
    // leave a half-written package behind.
    const thumbnailFile =
      thumbnail instanceof File && thumbnail.size > 0 ? thumbnail : null;
    if (thumbnailFile && !/^image\/(png|jpe?g|webp)$/.test(thumbnailFile.type)) {
      return Response.json({ error: "Thumbnail must be PNG/JPEG/WebP" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // ── Full security + integrity validation ─────────────────────────────
    const validation = validateTemplateZip(buffer, file.size);

    // If there are hard errors, reject upload completely (validation result still returned).
    if (!validation.ok) {
      return Response.json(
        {
          error: "Template validation failed",
          validation,
        },
        { status: 422 }
      );
    }

    // ── Build the manifest before claiming the version ───────────────────
    const manifestForStorage: Record<string, unknown> = validation.manifest
      ? { ...(validation.manifest as unknown as Record<string, unknown>) }
      : {};
    if (!manifestForStorage.version) manifestForStorage.version = null;
    if (!manifestForStorage.entry) manifestForStorage.entry = "index.html";

    const storage = await getObjectStorage();

    // A previous upload may have crashed after claiming a version. Clear stale
    // claims first so they do not consume a version number forever.
    try {
      const stale = await cleanupStaleVersionUploads({
        supabase: adminClient,
        templateId: id,
        storage,
      });
      if (stale.deletedVersions.length > 0) {
        console.info("[template-upload] removed stale upload claims", {
          templateId: id,
          versions: stale.deletedVersions.map((version) => version.version),
          objects: stale.deletedObjects,
        });
      }
    } catch (err) {
      console.warn("[template-upload] stale-claim cleanup failed", err);
    }

    // ── Calculate next version ───────────────────────────────────────────
    const { data: versions } = await adminClient
      .from("template_versions")
      .select("version")
      .eq("template_id", id)
      .order("created_at", { ascending: false })
      .limit(MAX_VERSION_COUNT);

    const last = versions?.[0]?.version as string | undefined;
    const next = nextVersion(last);
    const prefix = `${id}/v${next}`;
    if (manifestForStorage.version == null) manifestForStorage.version = next;

    // ── Claim the version before writing any objects ─────────────────────
    // The unique (template_id, version) constraint is the concurrency lock.
    const { data: claimed, error: claimError } = await adminClient
      .from("template_versions")
      .insert({
        template_id: id,
        version: next,
        storage_prefix: prefix,
        manifest: manifestForStorage as never,
        is_current: false,
        status: "uploading",
      })
      .select("id, version, status, created_at")
      .single();

    if (claimError) {
      if ((claimError as { code?: string }).code === "23505") {
        return Response.json(
          {
            error:
              "Another upload for this template is already in progress. Wait for it to finish and try again.",
            code: "UPLOAD_IN_PROGRESS",
          },
          { status: 409 }
        );
      }
      return Response.json({ error: claimError.message }, { status: 500 });
    }

    // We own this prefix now. Remove any orphaned files left by an earlier
    // failed attempt at the same version before writing new ones.
    const prepared = await deleteTemplateVersionObjects(storage, id, prefix);
    if (prepared.error) {
      await rollbackVersionClaim(adminClient, storage, id, claimed.id, prefix);
      return Response.json(
        {
          error: "Upload could not start because its storage prefix could not be prepared.",
          detail: prepared.error.message,
        },
        { status: 502 }
      );
    }

    // ── Extract ZIP safely into storage ─────────────────────────────────
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      await rollbackVersionClaim(adminClient, storage, id, claimed.id, prefix);
      return Response.json({ error: "Could not open ZIP archive" }, { status: 400 });
    }

    const entries = zip.getEntries().filter((e) => !e.isDirectory);

    // Determine root prefix to strip (when zipped from a folder)
    const allPaths = entries.map((e) => e.entryName.replace(/\\/g, "/")).filter((p) => !p.startsWith("__MACOSX/") && !p.includes(".DS_Store"));
    const rootPrefix = getRootPrefix(allPaths);

    let uploadErr: string | null = null;
    for (const entry of entries) {
      const rawName = entry.entryName.replace(/\\/g, "/");

      // Security: skip Mac artifacts
      if (rawName.startsWith("__MACOSX/") || rawName.includes("/.DS_Store") || rawName.endsWith(".DS_Store")) continue;

      // Strip root folder prefix if present
      const strippedName = rootPrefix ? rawName.slice(rootPrefix.length) : rawName;
      if (!strippedName) continue;

      // Security: path traversal prevention — every segment must be safe
      const segments = strippedName.split("/");
      const unsafe = segments.some((s) => s === ".." || s === "." || s.startsWith("../") || s === "" && segments.length > 1);
      if (unsafe) {
        uploadErr = `Unsafe path rejected: ${rawName}`;
        break;
      }
      if (strippedName.startsWith("/")) {
        uploadErr = `Absolute path rejected: ${rawName}`;
        break;
      }

      // Security: block executables and nested archives
      const ext = (strippedName.split(".").pop() ?? "").toLowerCase();
      const BLOCKED = new Set(["exe", "dll", "so", "sh", "bash", "py", "rb", "php", "bat", "cmd", "ps1", "jar", "zip", "tar", "gz", "rar", "7z"]);
      if (BLOCKED.has(ext)) continue; // skip silently (already validated, just skip)

      const data = entry.getData();
      const uploadPath = `${prefix}/${strippedName}`;
      try {
        await storage.upload(TEMPLATE_BUCKET, uploadPath, data, {
          contentType: mimeFromName(strippedName) ?? "application/octet-stream",
          upsert: false, // Never overwrite: versions are immutable
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // If the file already exists with this version, that's a conflict
        if (message.includes("already exists")) {
          uploadErr = `Version ${next} already exists in storage — version numbering conflict`;
        } else {
          uploadErr = message;
        }
        break;
      }
    }

    if (uploadErr) {
      const rollback = await rollbackVersionClaim(
        adminClient,
        storage,
        id,
        claimed.id,
        prefix
      );
      return Response.json(
        {
          error: `Upload failed: ${uploadErr}`,
          ...(rollback.warnings.length > 0 ? { warnings: rollback.warnings } : {}),
        },
        { status: 502 }
      );
    }

    // ── Commit the claimed row as a normal draft ─────────────────────────
    const { data: draftRow, error: finalizeError } = await adminClient
      .from("template_versions")
      .update({ status: "draft" })
      .eq("id", claimed.id)
      .eq("status", "uploading")
      .select("id")
      .single();
    if (finalizeError || !draftRow) {
      const rollback = await rollbackVersionClaim(
        adminClient,
        storage,
        id,
        claimed.id,
        prefix
      );
      return Response.json(
        {
          error:
            finalizeError?.message ??
            "Upload completed but the version could not be committed.",
          ...(rollback.warnings.length > 0 ? { warnings: rollback.warnings } : {}),
        },
        { status: 500 }
      );
    }

    const warnings: string[] = [];

    // ── Optional thumbnail upload ────────────────────────────────────────
    // The package is already committed, so a thumbnail failure is a warning,
    // not a failed upload. The previous thumbnail (or no thumbnail) stays.
    let thumbnailPath: string | null = null;
    if (thumbnailFile) {
      thumbnailPath = `${id}/thumbnail`;
      try {
        await storage.upload(
          TEMPLATE_BUCKET,
          thumbnailPath,
          Buffer.from(await thumbnailFile.arrayBuffer()),
          { contentType: thumbnailFile.type, upsert: true }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Package uploaded, but the thumbnail could not be saved: ${message}`);
        thumbnailPath = null;
      }
    }

    if (thumbnailPath) {
      const { error: thumbnailError } = await adminClient
        .from("templates")
        .update({ thumbnail_path: thumbnailPath })
        .eq("id", id);
      if (thumbnailError) {
        warnings.push(`Thumbnail saved but template record update failed: ${thumbnailError.message}`);
      }
    }

    // Sync description from manifest if provided and template has no description yet
    if (manifestForStorage.description) {
      const { data: tpl } = await adminClient.from("templates").select("description").eq("id", id).maybeSingle();
      if (!tpl?.description) {
        const { error: descriptionError } = await adminClient
          .from("templates")
          .update({ description: String(manifestForStorage.description) })
          .eq("id", id);
        if (descriptionError) {
          warnings.push(`Description sync failed: ${descriptionError.message}`);
        }
      }
    }

    // ── Remove superseded drafts that are safe to delete now ─────────────
    // Published/previous releases are retained: they are the live package or
    // a rollback candidate until the admin publishes this draft.
    let cleanup: VersionCleanupResult | null = null;
    try {
      const result = await cleanupSupersededDraftVersions({
        supabase: adminClient,
        templateId: id,
        newVersionId: claimed.id,
        storage,
      });
      cleanup = result;
      warnings.push(...result.warnings);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Draft cleanup will retry on the next upload: ${message}`);
      console.error("[template-upload] cleanup failed", { templateId: id, error: message });
    }

    await logAdminAction(admin.user.id, "template.package_upload", "template", id, {
      version: next,
      versionId: claimed.id,
      files: validation.files.length,
      cleanup: cleanup
        ? {
            deletedVersions: cleanup.deletedVersions.map((version) => version.version),
            deletedObjects: cleanup.deletedObjects,
            skipped: cleanup.skipped,
          }
        : null,
      ...(warnings.length > 0 ? { warnings } : {}),
      validation: {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        unusedAssets: validation.unusedAssets.length,
      },
    });

    return Response.json({
      ok: true,
      version: next,
      versionId: claimed.id,
      status: "draft",
      files: validation.files.length,
      ...(cleanup ? { versionCount: cleanup.remainingVersions } : {}),
      ...(cleanup
        ? {
            cleanup: {
              deletedVersions: cleanup.deletedVersions,
              deletedObjects: cleanup.deletedObjects,
              skipped: cleanup.skipped,
              warnings: cleanup.warnings,
            },
          }
        : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
      validation: {
        ok: validation.ok,
        errors: validation.errors,
        warnings: validation.warnings,
        checks: validation.checks,
        unusedAssets: validation.unusedAssets,
      },
      message: "Template uploaded as draft. Review and publish when ready.",
    });
  } catch (e) {
    return adminApiError(e);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Removes an `uploading` claim and its objects after a failed upload. The row
 * is removed first: if storage cleanup fails, the next upload's orphan sweep
 * can retry without any live row pointing at missing files.
 */
async function rollbackVersionClaim(
  adminClient: ReturnType<typeof createAdminClient>,
  storage: ObjectStorage,
  templateId: string,
  versionId: string,
  prefix: string
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const { data, error } = await adminClient
    .from("template_versions")
    .delete()
    .eq("id", versionId)
    .eq("template_id", templateId)
    .eq("status", "uploading")
    .select("id");
  if (error) {
    warnings.push(`Could not remove the failed upload claim: ${error.message}`);
    return { warnings };
  }
  if (!Array.isArray(data) || data.length === 0) {
    warnings.push("The failed upload claim had already changed; storage was left untouched.");
    return { warnings };
  }

  // If another row somehow shares this prefix, its files must stay.
  const { data: shared, error: sharedError } = await adminClient
    .from("template_versions")
    .select("id")
    .eq("template_id", templateId)
    .eq("storage_prefix", prefix)
    .limit(1);
  if (sharedError) {
    warnings.push(`Could not verify prefix ownership: ${sharedError.message}`);
    return { warnings };
  }
  if ((shared ?? []).length > 0) {
    warnings.push("Storage was left in place because another version uses the same prefix.");
    return { warnings };
  }

  const result = await deleteTemplateVersionObjects(storage, templateId, prefix);
  if (result.error) {
    warnings.push(`Failed-upload objects could not be removed yet: ${result.error.message}`);
  }
  return { warnings };
}

function nextVersion(last: string | undefined): string {
  if (!last) return "1.0.0";
  const parts = last.split(".").map(Number);
  if (!parts.every(Number.isFinite)) return "1.0.0";
  const [major = 1, minor = 0, patch = 0] = parts;
  return `${major}.${minor}.${patch + 1}`;
}

function getRootPrefix(files: string[]): string {
  if (files.length === 0) return "";
  const firstSlash = files[0]!.indexOf("/");
  if (firstSlash < 0) return "";
  const candidate = files[0]!.slice(0, firstSlash + 1);
  return files.every((f) => f.startsWith(candidate)) ? candidate : "";
}

function mimeFromName(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    html: "text/html", htm: "text/html",
    css: "text/css",
    js: "text/javascript", mjs: "text/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    webp: "image/webp", gif: "image/gif", avif: "image/avif",
    ico: "image/x-icon",
    woff: "font/woff", woff2: "font/woff2",
    ttf: "font/ttf", otf: "font/otf",
    mp4: "video/mp4", webm: "video/webm",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac",
    txt: "text/plain",
    pdf: "application/pdf",
  };
  return ext ? (map[ext] ?? "application/octet-stream") : null;
}
