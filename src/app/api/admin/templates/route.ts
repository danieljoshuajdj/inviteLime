/**
 * GET  /api/admin/templates — list all templates
 * POST /api/admin/templates — create a new template
 */

import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin, readBody } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/services/ops";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(1000).nullable().optional(),
  slug: z.string().trim().min(2).max(100).regex(/^[a-z0-9-]+$/),
  status: z.enum(["active", "disabled", "draft"]).default("draft"),
  product_id: z.string().uuid().nullable().optional(),
  price_paise: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  tags: z.array(z.string()).optional(),
  // Exactly one event category; its `form_type` is the template's form.
  category_ids: z.array(z.string().uuid()).length(1, "Select exactly one event category"),
  // Demo media pack (see the Media tab). NULL → the demo uses whatever images
  // the template package ships.
  media_pack_id: z.string().uuid().nullable().optional(),
  // Demo details pack and background song (see the Details and Music tabs).
  demo_detail_pack_id: z.string().uuid().nullable().optional(),
  music_track_id: z.string().uuid().nullable().optional(),
});

export async function GET(_req: Request) {
  const supabase = await createServerClient();
  try {
    await requireAdmin(supabase);
    const adminClient = createAdminClient();

    const { data: templates, error } = await adminClient
      .from("templates")
      .select("id, name, slug, description, status, form_type, thumbnail_path, product_id, created_at")
      .order("created_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ templates });
  } catch (e) {
    return adminApiError(e);
  }
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const limit = await consumeRateLimit({
      bucket: "admin_create",
      key: admin.user.id,
      limit: 30,
      windowSeconds: 3600,
    });
    if (!limit.allowed)
      return Response.json({ error: "Too many create operations. Please slow down." }, { status: 429 });

    const body = await readBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid template data", details: parsed.error.flatten() }, { status: 400 });

    const adminClient = createAdminClient();

    // Ensure slug is unique
    const { data: existing } = await adminClient
      .from("templates")
      .select("id")
      .eq("slug", parsed.data.slug)
      .maybeSingle();
    if (existing)
      return Response.json({ error: "A template with this slug already exists" }, { status: 400 });

    const { category_ids, price_paise, currency, ...templateData } = parsed.data;

    // The category decides which builder form this template opens. Resolve the
    // form here, server-side, so the client can never choose a mismatched one.
    const { data: category } = await adminClient
      .from("categories")
      .select("id, form_type")
      .eq("id", category_ids[0])
      .maybeSingle();
    if (!category) {
      return Response.json({ error: "The selected category no longer exists" }, { status: 400 });
    }

    // If product_id not provided but price is, find or create matching product
    let productId = templateData.product_id ?? null;
    if (!productId && price_paise !== undefined && price_paise !== null) {
      const curr = (currency ?? "INR").toUpperCase();
      const { data: existingProduct } = await adminClient
        .from("products")
        .select("id")
        .eq("price_paise", price_paise)
        .eq("currency", curr)
        .eq("active", true)
        .maybeSingle();
      if (existingProduct) {
        productId = existingProduct.id;
      } else {
        const { data: newProduct } = await adminClient
          .from("products")
          .insert({
            name: `Template – ₹${(price_paise / 100).toLocaleString()}`,
            price_paise,
            currency: curr,
            active: true,
          })
          .select("id")
          .single();
        if (newProduct) productId = newProduct.id;
      }
    }

    const { data: template, error } = await adminClient
      .from("templates")
      .insert({
        ...templateData,
        product_id: productId,
        form_type: category.form_type,
        tags: templateData.tags ?? [],
      })
      .select("*")
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const { error: catError } = await adminClient
      .from("template_categories")
      .insert({ template_id: template.id, category_id: category.id });
    if (catError) return Response.json({ error: catError.message }, { status: 500 });

    await logAdminAction(admin.user.id, "template.create", "template", template.id, parsed.data as Record<string, unknown>);
    return Response.json({ template }, { status: 201 });
  } catch (e) {
    return adminApiError(e);
  }
}
