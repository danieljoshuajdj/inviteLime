import { jsonError } from "@/lib/services/helpers";
import { getObjectStorage, TEMPLATE_BUCKET } from "@/lib/services/storage";
import { verifyTemplateAssetToken } from "@/lib/services/storage/sign";

export const dynamic = "force-dynamic";

/**
 * Serves template package assets out of the private `templates` B2 bucket.
 *
 * Templates are immutable product assets shown to the public (listings, admin
 * previews and invitations), but the bucket itself stays private so nothing is
 * addressable at rest. Every URL points here with a short-lived HMAC signature
 * scoped to one immutable version folder (`{templateId}/v{n}`) or thumbnail,
 * which the runtime injects as the template's `<base href>`.
 *
 * Paths are `{signature}/{templateId}/v{n}/{...}` or
 * `{signature}/{templateId}/thumbnail`. The signature is re-verified on every
 * request before bytes are streamed.
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params;
  if (!path || path.length < 3) return jsonError(404, "Not found");

  const token = path[0];
  const objectKey = path.slice(1).join("/");

  // Only immutable template folders are served by this route.
  const folder = path[2];
  const isVersionFolder = /^v\d+/i.test(folder);
  if (!isVersionFolder && folder !== "thumbnail") return jsonError(404, "Not found");

  const subject = `${path[1]}/${folder}`;
  if (!verifyTemplateAssetToken(token, subject)) {
    return jsonError(403, "Invalid or expired template asset link");
  }

  const object = await (await getObjectStorage()).download(TEMPLATE_BUCKET, objectKey);
  if (!object) return jsonError(404, "Not found");

  const body = object.body.buffer.slice(
    object.body.byteOffset,
    object.body.byteOffset + object.body.byteLength
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Type": object.contentType || "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      // Versioned files never change; thumbnails may be republished.
      "Cache-Control": isVersionFolder
        ? "public, max-age=31536000, immutable"
        : "public, max-age=3600",
    },
  });
}
