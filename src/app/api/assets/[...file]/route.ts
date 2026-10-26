import fs from "node:fs/promises";
import path from "node:path";

/**
 * Streams the static imagery that lives in `src/assets` (home-page hero
 * carousel, see `src/lib/services/hero-images.ts`).
 *
 * Only whitelisted image extensions inside that folder are served; every other
 * path — including traversal attempts — answers 404. The folder is intentionally
 * narrow so this route can never expose source files.
 */

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ file: string[] }>;
}

const ASSETS_DIR = path.resolve(process.cwd(), "src", "assets");

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".apng": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".jfif": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

export async function GET(_req: Request, { params }: RouteContext) {
  const { file } = await params;
  const segments = file ?? [];

  if (segments.length === 0 || !segments.every(isSafeSegment)) {
    return notFound();
  }

  const fileName = segments[segments.length - 1];
  const contentType = CONTENT_TYPES[path.extname(fileName).toLowerCase()];
  if (!contentType) return notFound();

  const target = path.resolve(ASSETS_DIR, ...segments);
  if (target !== ASSETS_DIR && !target.startsWith(ASSETS_DIR + path.sep)) {
    return notFound();
  }

  try {
    const data = await fs.readFile(target);

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(data.byteLength),
        "Cache-Control": "public, max-age=3600, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}

function isSafeSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    segment.length <= 128 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("\\") &&
    !segment.includes("/") &&
    !segment.includes(":")
  );
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "X-Content-Type-Options": "nosniff" } });
}
