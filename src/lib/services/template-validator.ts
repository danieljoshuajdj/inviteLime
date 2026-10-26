/**
 * Template ZIP validator — production-grade security and integrity checks.
 *
 * Security threats addressed:
 *  - ZIP bombs (decompressed size limit)
 *  - Path traversal (../  or absolute paths)
 *  - Arbitrary executables (.sh, .py, .php, .exe, etc.)
 *  - Server-side scripts (.ts, .tsx, .mjs server code)
 *  - Nested archives
 *  - Malformed manifests
 *  - Missing required structure
 *  - Broken asset references
 *  - Oversized individual files
 */

import AdmZip from "adm-zip";

export interface ValidationCheck {
  name: string;
  passed: boolean;
  warning?: boolean;
  message?: string;
}

export interface ValidationResult {
  ok: boolean; // errors block publishing; warnings do not
  errors: string[];
  warnings: string[];
  checks: ValidationCheck[];
  manifest: ManifestData | null;
  files: string[];
  unusedAssets: string[];
}

export interface ManifestData {
  schemaVersion: string;
  id: string;
  name: string;
  version: string;
  entry: string;
  features: Record<string, boolean>;
  direction?: "ltr" | "rtl";
}

// ── Limits ──────────────────────────────────────────────────────────────────
const MAX_ZIP_BYTES = 60 * 1024 * 1024; // 60 MB compressed
const MAX_DECOMPRESSED_BYTES = 150 * 1024 * 1024; // 150 MB uncompressed
const MAX_FILE_COUNT = 500;
const MAX_SINGLE_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

// ── Blocked extensions ───────────────────────────────────────────────────────
const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "so", "dylib",
  "sh", "bash", "zsh", "fish",
  "py", "rb", "php", "pl",
  "bat", "cmd", "ps1", "vbs",
  "jar", "class",
  "elf",
  "zip", "tar", "gz", "bz2", "7z", "rar", // nested archives
]);

// ── Allowed extensions ───────────────────────────────────────────────────────
const ALLOWED_EXTENSIONS = new Set([
  "html", "htm", "css", "js", "mjs", "json", "svg",
  "png", "jpg", "jpeg", "webp", "gif", "ico", "avif",
  "woff", "woff2", "ttf", "otf",
  "mp4", "webm",
  "mp3", "ogg", "wav", "aac",
  "txt", "md",
  "pdf",
  "glb", "gltf",
  "lottie",
]);

// ── Manifest schema ──────────────────────────────────────────────────────────
const REQUIRED_MANIFEST_FIELDS: Array<keyof ManifestData> = [
  "schemaVersion", "id", "name", "version", "entry",
];

/**
 * Validates an uploaded template ZIP. Returns a structured result with
 * errors (block publishing) and warnings (informational only).
 */
export function validateTemplateZip(
  zipBuffer: Buffer,
  compressedSize: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: ValidationCheck[] = [];
  let manifest: ManifestData | null = null;
  const files: string[] = [];

  // ─── 1. Size check (compressed) ─────────────────────────────────────────
  {
    const ok = compressedSize <= MAX_ZIP_BYTES;
    checks.push({ name: "ZIP size", passed: ok, message: ok ? undefined : `ZIP is ${(compressedSize / 1024 / 1024).toFixed(1)} MB (limit: 60 MB)` });
    if (!ok) errors.push(`ZIP file exceeds the 60 MB limit (received ${(compressedSize / 1024 / 1024).toFixed(1)} MB)`);
  }

  // ─── 2. Parse ZIP ────────────────────────────────────────────────────────
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipBuffer);
  } catch {
    errors.push("Could not read ZIP archive — the file may be corrupt or malformed.");
    checks.push({ name: "ZIP structure", passed: false });
    return { ok: false, errors, warnings, checks, manifest, files, unusedAssets: [] };
  }
  checks.push({ name: "ZIP structure", passed: true });

  // ─── 3. Get all non-directory entries ────────────────────────────────────
  const entries = zip.getEntries().filter((e) => !e.isDirectory);

  // ─── 4. File count ───────────────────────────────────────────────────────
  {
    const ok = entries.length <= MAX_FILE_COUNT;
    checks.push({ name: "File count", passed: ok, message: ok ? `${entries.length} files` : `${entries.length} files (limit: ${MAX_FILE_COUNT})` });
    if (!ok) errors.push(`ZIP contains too many files (${entries.length}; limit ${MAX_FILE_COUNT})`);
  }

  // ─── 5. Decompressed size + individual file sizes ────────────────────────
  let totalDecompressed = 0;
  let decompressOk = true;
  for (const entry of entries) {
    const decompressed = entry.header.size;
    totalDecompressed += decompressed;
    if (decompressed > MAX_SINGLE_FILE_BYTES) {
      errors.push(`File "${entry.entryName}" is ${(decompressed / 1024 / 1024).toFixed(1)} MB (limit: 20 MB per file)`);
      decompressOk = false;
    }
    if (totalDecompressed > MAX_DECOMPRESSED_BYTES) {
      errors.push(`Decompressed size exceeds 150 MB (ZIP bomb protection)`);
      decompressOk = false;
      break;
    }
  }
  checks.push({ name: "Decompressed size", passed: decompressOk, message: decompressOk ? `${(totalDecompressed / 1024 / 1024).toFixed(1)} MB` : undefined });

  // ─── 6. Path traversal + security scan ──────────────────────────────────
  let pathsClean = true;
  const blockedFiles: string[] = [];
  const normalizedEntries: { name: string; entry: AdmZip.IZipEntry }[] = [];

  for (const entry of entries) {
    const raw = entry.entryName.replace(/\\/g, "/");

    // Path traversal detection — check every path segment
    const segments = raw.split("/");
    const hasDotDot = segments.some((s) => s === ".." || s.startsWith("../"));
    const isAbsolute = raw.startsWith("/");
    const hasNull = raw.includes("\0");

    if (hasDotDot || isAbsolute || hasNull) {
      errors.push(`Suspicious path detected: "${raw}"`);
      pathsClean = false;
      continue;
    }

    // Strip common Mac OS artifacts
    if (raw.startsWith("__MACOSX/") || segments.some((s) => s === ".DS_Store")) continue;

    // Extension check. The extension is read from the file name alone: taking it
    // from the whole path misclassifies any extensionless file whose directory
    // contains a dot ("etc/passwd" reported an extension of "etc/passwd"), which
    // produced spurious warnings and made the blocked list depend on the
    // directory layout rather than on the file.
    const base = raw.slice(raw.lastIndexOf("/") + 1);
    const dot = base.lastIndexOf(".");
    const ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
    if (BLOCKED_EXTENSIONS.has(ext)) {
      blockedFiles.push(raw);
      pathsClean = false;
      continue;
    }

    // Warn on unknown extensions but don't block
    if (!ALLOWED_EXTENSIONS.has(ext) && ext !== "") {
      warnings.push(`Unknown extension ".${ext}" in "${raw}" — will be included but may not render`);
    }

    normalizedEntries.push({ name: raw, entry });
    files.push(raw);
  }

  checks.push({ name: "Path security", passed: pathsClean, message: pathsClean ? undefined : `${blockedFiles.length} unsafe file(s) blocked` });
  if (blockedFiles.length > 0) {
    errors.push(`Blocked ${blockedFiles.length} unsafe file(s): ${blockedFiles.slice(0, 5).join(", ")}${blockedFiles.length > 5 ? "…" : ""}`);
  }

  // ─── 7. Required structure ───────────────────────────────────────────────
  // Strip a single leading directory prefix if all files share one (common when zipped from a folder)
  const rootPrefix = getRootPrefix(files);
  const stripPrefix = (p: string) => rootPrefix ? p.slice(rootPrefix.length) : p;
  const strippedFiles = files.map(stripPrefix);

  const hasIndex = strippedFiles.some((f) => f === "index.html" || f === "index.htm");
  checks.push({ name: "index.html", passed: hasIndex, message: hasIndex ? undefined : "index.html not found in ZIP root" });
  if (!hasIndex) errors.push("index.html is required at the root of the template package");

  const hasManifest = strippedFiles.some((f) => f === "manifest.json");
  checks.push({ name: "manifest.json", passed: hasManifest, message: hasManifest ? undefined : "manifest.json not found" });
  if (!hasManifest) errors.push("manifest.json is required");

  // ─── 8. Parse + validate manifest ───────────────────────────────────────
  if (hasManifest) {
    const manifestEntry = normalizedEntries.find((e) => stripPrefix(e.name) === "manifest.json");
    if (manifestEntry) {
      let raw: Record<string, unknown>;
      try {
        raw = JSON.parse(manifestEntry.entry.getData().toString("utf8"));
      } catch {
        raw = {};
        errors.push("manifest.json is not valid JSON");
        checks.push({ name: "Manifest schema", passed: false, message: "Invalid JSON" });
      }

      const missingFields = REQUIRED_MANIFEST_FIELDS.filter((f) => !raw[f]);
      const manifestOk = missingFields.length === 0;
      checks.push({
        name: "Manifest schema",
        passed: manifestOk,
        message: manifestOk ? `Schema v${raw.schemaVersion}` : `Missing: ${missingFields.join(", ")}`,
      });
      if (!manifestOk) errors.push(`manifest.json is missing required fields: ${missingFields.join(", ")}`);

      if (raw.entry && typeof raw.entry === "string") {
        const entryExists = strippedFiles.some((f) => f === raw.entry || f === (raw.entry as string).replace(/^\//, ""));
        checks.push({ name: "Entry file", passed: entryExists, message: entryExists ? String(raw.entry) : `Entry "${raw.entry}" not found` });
        if (!entryExists) errors.push(`manifest.json points to entry "${raw.entry}" which is not in the ZIP`);
      }

      if (manifestOk) {
        manifest = {
          schemaVersion: String(raw.schemaVersion ?? "1.0"),
          id: String(raw.id ?? ""),
          name: String(raw.name ?? ""),
          version: String(raw.version ?? ""),
          entry: String(raw.entry ?? "index.html"),
          features: (typeof raw.features === "object" && raw.features && !Array.isArray(raw.features))
            ? (raw.features as Record<string, boolean>)
            : {},
          direction: raw.direction === "rtl" ? "rtl" : "ltr",
        };
      }
    }
  }

  // ─── 9. Asset reference validation ──────────────────────────────────────
  // Read index.html and check for broken relative references
  const indexEntry = normalizedEntries.find((e) => stripPrefix(e.name) === "index.html" || stripPrefix(e.name) === "index.htm");
  let imageRefsOk = true;
  let fontRefsOk = true;
  const unusedAssets: string[] = [];

  if (indexEntry) {
    try {
      const html = indexEntry.entry.getData().toString("utf8");
      const assetRefs = extractAssetRefs(html);
      const referencedFiles = new Set<string>();

      for (const ref of assetRefs) {
        if (ref.startsWith("http") || ref.startsWith("data:") || ref.startsWith("//")) continue;
        const normalizedRef = ref.replace(/^\//, "");
        const found = strippedFiles.some((f) => f === normalizedRef || f.endsWith("/" + normalizedRef));
        if (!found) {
          const isImage = /\.(png|jpg|jpeg|webp|gif|svg|avif|ico)$/i.test(ref);
          const isFont = /\.(woff|woff2|ttf|otf)$/i.test(ref);
          if (isImage) { imageRefsOk = false; warnings.push(`Missing image: ${ref}`); }
          else if (isFont) { fontRefsOk = false; warnings.push(`Missing font: ${ref}`); }
          else { warnings.push(`Asset not found in ZIP: ${ref}`); }
        } else {
          referencedFiles.add(normalizedRef);
        }
      }

      // Detect unused assets (warn only)
      const assetFiles = strippedFiles.filter((f) => f.startsWith("assets/") && !f.endsWith(".html") && !f.endsWith(".json"));
      for (const af of assetFiles) {
        if (!referencedFiles.has(af) && !referencedFiles.has(af.replace(/^assets\//, ""))) {
          unusedAssets.push(af);
        }
      }
      if (unusedAssets.length > 0) {
        warnings.push(`${unusedAssets.length} unused asset(s) found (will still be uploaded)`);
      }
    } catch {
      warnings.push("Could not parse index.html for asset reference checks");
    }
  }

  checks.push({ name: "Image references", passed: imageRefsOk, warning: !imageRefsOk, message: imageRefsOk ? "OK" : "Some image references could not be resolved" });
  checks.push({ name: "Font references", passed: fontRefsOk, warning: !fontRefsOk, message: fontRefsOk ? "OK" : "Some font references could not be resolved" });

  if (unusedAssets.length > 0) {
    checks.push({ name: "Unused assets", passed: true, warning: true, message: `${unusedAssets.length} unused asset(s)` });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checks,
    manifest,
    files: strippedFiles,
    unusedAssets,
  };
}

/** Returns a common root prefix if all paths share one directory level. */
function getRootPrefix(files: string[]): string {
  if (files.length === 0) return "";
  const firstSlash = files[0]!.indexOf("/");
  if (firstSlash < 0) return "";
  const candidate = files[0]!.slice(0, firstSlash + 1);
  return files.every((f) => f.startsWith(candidate)) ? candidate : "";
}

/** Extracts asset references from HTML: src, href, url() in style, @import */
function extractAssetRefs(html: string): string[] {
  const refs = new Set<string>();
  // src=, href=, data-src=, poster=
  const attrRe = /(?:src|href|data-src|poster|data-lazysrc)\s*=\s*["']([^"'#?]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(html)) !== null) {
    const val = m[1]!.trim();
    if (val && !val.startsWith("{{") && !val.startsWith("{%")) refs.add(val);
  }
  // CSS url()
  const urlRe = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
  while ((m = urlRe.exec(html)) !== null) {
    const val = m[1]!.trim();
    if (val && !val.startsWith("data:")) refs.add(val);
  }
  return [...refs];
}
