import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { jsonError, readBody, requireUser } from "@/lib/services/helpers";
import {
  getPlannerBrand,
  isSafeExternalUrl,
  savePlannerBrand,
} from "@/lib/services/planner-branding";

export const dynamic = "force-dynamic";

const brandSchema = z.object({
  brandName: z.string().trim().min(2).max(120),
  contactPhone: z
    .string()
    .trim()
    .min(5)
    .max(40)
    .refine((value) => value.replace(/[^\d]/g, "").length >= 5, "Enter a valid contact number"),
  address: z.string().trim().max(500).optional().nullable(),
  mapsUrl: z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  try {
    const supabase = await createServerClient();
    const session = await requireUser(supabase);
    if (session.profile?.role !== "planner") return jsonError(403, "Planner accounts only");
    return Response.json({ brand: await getPlannerBrand(session.user.id) });
  } catch (e) {
    if (e instanceof Error && e.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    return jsonError(500, e instanceof Error ? e.message : "Could not load brand");
  }
}

export async function PUT(req: Request) {
  try {
    const supabase = await createServerClient();
    const session = await requireUser(supabase);
    if (session.profile?.role !== "planner") return jsonError(403, "Planner accounts only");

    const parsed = brandSchema.safeParse(await readBody(req));
    if (!parsed.success) return jsonError(400, "Check your brand details", parsed.error.flatten());

    const mapsUrl = parsed.data.mapsUrl?.trim() || null;
    if (mapsUrl && !isSafeExternalUrl(mapsUrl)) {
      return jsonError(400, "Location map must be a full http(s) link");
    }

    const brand = await savePlannerBrand({
      profileId: session.user.id,
      brandName: parsed.data.brandName,
      contactPhone: parsed.data.contactPhone,
      address: parsed.data.address ?? null,
      mapsUrl,
    });
    return Response.json({ brand });
  } catch (e) {
    if (e instanceof Error && e.message === "AUTH_REQUIRED") return jsonError(401, "Sign in required");
    return jsonError(500, e instanceof Error ? e.message : "Could not save brand");
  }
}
