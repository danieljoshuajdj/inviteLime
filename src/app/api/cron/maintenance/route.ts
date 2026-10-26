import { timingSafeEqual } from "node:crypto";

import { runMaintenance } from "@/lib/services/ops";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Scheduled maintenance endpoint. Each run expires invitations whose validity
 * has passed, purges expired/cancelled invitations and abandoned checkout
 * drafts from the database AND object storage, cleans expired guest-draft
 * folders before their session rows disappear, and drops stale rate-limit
 * counters. Order and payment history is kept (their `wedding_id` is nulled).
 *
 * Protect it with CRON_SECRET and point your scheduler at it, e.g.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app.example.com/api/cron/maintenance
 *
 * Vercel Cron, Supabase pg_cron + pg_net, GitHub Actions or any uptime
 * scheduler can drive this. It is idempotent and safe to run repeatedly; a
 * purge that storage refuses is retried on the next run.
 */
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;

  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const query = new URL(req.url).searchParams.get("secret")?.trim() ?? "";
  const provided = bearer || query;
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runMaintenance();
  return Response.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
