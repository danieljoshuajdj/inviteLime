import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin, readBody } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().max(500).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const body = await readBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid category", details: parsed.error.flatten() }, { status: 400 });

    const adminClient = createAdminClient();
    if (parsed.data.slug) {
      const { data: clash } = await adminClient.from("categories").select("id").eq("slug", parsed.data.slug).neq("id", id).maybeSingle();
      if (clash) return Response.json({ error: "Slug already in use" }, { status: 409 });
    }

    const { data, error } = await adminClient
      .from("categories")
      .update({ ...parsed.data })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAdminAction(admin.user.id, "category.update", "category", id, parsed.data as Record<string, unknown>);
    return Response.json({ category: data });
  } catch (e) {
    return adminApiError(e);
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return Response.json({ error: "Too many admin operations. Please slow down." }, { status: 429 });
    const adminClient = createAdminClient();
    const { data } = await adminClient.from("categories").select("name").eq("id", id).maybeSingle();
    const { error } = await adminClient.from("categories").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logAdminAction(admin.user.id, "category.delete", "category", id, data ? { name: data.name } : {});
    return Response.json({ ok: true });
  } catch (e) {
    return adminApiError(e);
  }
}