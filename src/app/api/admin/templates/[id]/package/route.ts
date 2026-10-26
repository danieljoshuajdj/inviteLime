/**
 * Template package upload endpoint.
 *
 * POST  /api/admin/templates/[id]/package
 *   Uploads and validates a ZIP package, extracts it into storage, and creates
 *   a DRAFT template version. Does NOT auto-publish. Admin must explicitly publish.
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
import { getObjectStorage, TEMPLATE_BUCKET } from "@/lib/services/storage";

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

    // ── Extract ZIP safely into storage ─────────────────────────────────
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      return Response.json({ error: "Could not open ZIP archive" }, { status: 400 });
    }

    const entries = zip.getEntries().filter((e) => !e.isDirectory);

    // Determine root prefix to strip (when zipped from a folder)
    const allPaths = entries.map((e) => e.entryName.replace(/\\/g, "/")).filter((p) => !p.startsWith("__MACOSX/") && !p.includes(".DS_Store"));
    const rootPrefix = getRootPrefix(allPaths);

    let uploadErr: string | null = null;
    const storage = await getObjectStorage();
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
      return Response.json({ error: `Upload failed: ${uploadErr}` }, { status: 502 });
    }

    // ── Optional thumbnail upload ────────────────────────────────────────
    let thumbnailPath: string | null = null;
    if (thumbnail instanceof File && thumbnail.size > 0) {
      if (!/^image\/(png|jpe?g|webp)$/.test(thumbnail.type)) {
        return Response.json({ error: "Thumbnail must be PNG/JPEG/WebP" }, { status: 400 });
      }
      thumbnailPath = `${id}/thumbnail`;
      try {
        await storage.upload(
          TEMPLATE_BUCKET,
          thumbnailPath,
          Buffer.from(await thumbnail.arrayBuffer()),
          { contentType: thumbnail.type, upsert: true }
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: `Thumbnail upload failed: ${message}` }, { status: 502 });
      }
    }

    // ── Build manifest for storage ───────────────────────────────────────
    const manifestForStorage: Record<string, unknown> = validation.manifest
      ? { ...(validation.manifest as unknown as Record<string, unknown>) }
      : {};
    if (!manifestForStorage.version) manifestForStorage.version = next;
    if (!manifestForStorage.entry) manifestForStorage.entry = "index.html";

    // ── Insert new DRAFT version (admin must explicitly publish) ─────────
    const { data: newVersion, error: vErr } = await adminClient
      .from("template_versions")
      .insert({
        template_id: id,
        version: next,
        storage_prefix: prefix,
        manifest: manifestForStorage as never,
        is_current: false,  // Draft: not current until published
        status: "draft",    // Requires explicit publish action
      })
      .select("id, version, status")
      .single();
    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });

    // Update thumbnail if provided
    if (thumbnailPath) {
      await adminClient.from("templates").update({ thumbnail_path: thumbnailPath }).eq("id", id);
    }

    // Sync description from manifest if provided and template has no description yet
    if (manifestForStorage.description) {
      const { data: tpl } = await adminClient.from("templates").select("description").eq("id", id).maybeSingle();
      if (!tpl?.description) {
        await adminClient.from("templates").update({ description: String(manifestForStorage.description) }).eq("id", id);
      }
    }

    await logAdminAction(admin.user.id, "template.package_upload", "template", id, {
      version: next,
      versionId: newVersion.id,
      files: validation.files.length,
      validation: {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        unusedAssets: validation.unusedAssets.length,
      },
    });

    return Response.json({
      ok: true,
      version: next,
      versionId: newVersion.id,
      status: "draft",
      files: validation.files.length,
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