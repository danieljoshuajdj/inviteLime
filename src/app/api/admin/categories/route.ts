import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin, readBody } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formTypeFromCategorySlug } from "@/lib/builder/forms";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes only"),
  description: z.string().max(500).optional().default(""),
});

export async function POST(req: Request) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const body = await readBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid category", details: parsed.error.flatten() }, { status: 400 });

    // Categories are event forms, not free-form labels. Only the four built-in
    // slugs map to a builder form, so an arbitrary category cannot be added.
    const formType = formTypeFromCategorySlug(parsed.data.slug);
    if (!formType) {
      return Response.json(
        { error: "Categories are fixed to the four event forms: wedding, engagement, birthday-celebration and birthday-wishes." },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data: existing } = await adminClient.from("categories").select("id").eq("slug", parsed.data.slug).maybeSingle();
    if (existing) return Response.json({ error: "Slug already in use" }, { status: 409 });

    const { data, error } = await adminClient
      .from("categories")
      .insert({
        name: parsed.data.name,
        slug: parsed.data.slug,
        description: parsed.data.description || null,
        form_type: formType,
      })
      .select("*")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAdminAction(admin.user.id, "category.create", "category", data.id, { name: data.name });
    return Response.json({ category: data });
  } catch (e) {
    return adminApiError(e);
  }
}