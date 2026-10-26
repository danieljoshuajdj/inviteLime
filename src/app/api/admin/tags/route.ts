import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin, readBody } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(50),
  slug: z.string().trim().min(2).max(50).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  description: z.string().max(500).optional().default(""),
});

export async function GET() {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.from("tags").select("*").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ tags: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const body = await readBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid tag", details: parsed.error.flatten() }, { status: 400 });

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient.from("tags").select("id").eq("slug", parsed.data.slug).maybeSingle();
    if (existing) return Response.json({ error: "Slug already in use" }, { status: 409 });

    const { data, error } = await adminClient
      .from("tags")
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description || null,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return Response.json({ error: "Slug already in use" }, { status: 409 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!data) return Response.json({ error: "Failed to create tag" }, { status: 500 });

    await logAdminAction(admin.user.id, "tag.create", "tag", data.id, { name: data.name });
    return Response.json({ tag: data });
  } catch (e) {
    return adminApiError(e);
  }
}