import "server-only";

import fs from "node:fs";
import path from "node:path";

/**
 * Home-page hero imagery.
 *
 * Drop image files into `src/assets` (nested subfolders up to four levels are
 * fine) and they show up in the hero carousel in file-name order — no code
 * change needed. Files are streamed by `src/app/api/assets/[...file]/route.ts`,
 * so keep them web-sized (they are not processed by the bundler).
 *
 * Declared server-only: it touches the filesystem and is only imported by the
 * home page's server component.
 */

export interface HeroImage {
  /** URL served by the `api/assets` route. */
  src: string;
  /** Accessible description — always populated. */
  alt: string;
  /** Visible caption, only when the file name reads like a real title. */
  label?: string;
}

const ASSETS_DIR = path.join(process.cwd(), "src", "assets");
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".apng",
  ".jpg",
  ".jpeg",
  ".jfif",
  ".webp",
  ".avif",
  ".gif",
  ".bmp",
  ".svg",
]);
/** How deep to look below `src/assets` (e.g. `src/assets/hero/carousel/…`). */
const MAX_DEPTH = 4;

let hasWarned = false;

/** One actionable line in the dev terminal instead of a silent empty carousel. */
function warnOnce(message: string) {
  if (hasWarned) return;
  hasWarned = true;
  console.warn(message);
}

export function listHeroImages(): HeroImage[] {
  let files: string[];

  try {
    files = collectImageFiles(ASSETS_DIR, 0);
  } catch {
    // No assets folder (or it cannot be read) — the hero falls back to its
    // built-in preview card instead of breaking.
    warnOnce(
      `[hero-images] ${ASSETS_DIR} is missing or unreadable — the hero is showing its built-in preview card instead of the carousel.`
    );
    return [];
  }

  if (files.length === 0) {
    warnOnce(
      `[hero-images] ${ASSETS_DIR} holds no supported images (${[...IMAGE_EXTENSIONS].join(
        " "
      )}) — the hero is showing its built-in preview card instead of the carousel.`
    );
    return [];
  }

  return files.sort(naturalOrder).map((file, index) => {
    const relative = path
      .relative(ASSETS_DIR, file)
      .split(path.sep)
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const label = humanize(path.basename(file, path.extname(file)));

    return {
      src: `/api/assets/${relative}`,
      alt: label ?? `Invite Lime digital invitation preview ${index + 1}`,
      label: label ?? undefined,
    };
  });
}

function collectImageFiles(dir: string, depth: number): string[] {
  const found: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) found.push(...collectImageFiles(absolute, depth + 1));
      continue;
    }

    if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(absolute);
  }

  return found;
}

/**
 * `royal-ceremony_02.png` → `Royal ceremony 02`. Returns null for names that
 * are not readable titles (e.g. `1`, `IMG_2043`), so we never show junk
 * captions or read them out to screen readers.
 */
function humanize(fileName: string): string | null {
  const words = fileName.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!/[a-z]/i.test(words) || words.length < 3) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function naturalOrder(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
