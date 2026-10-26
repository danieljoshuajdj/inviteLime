import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { jsonError, readBody } from "@/lib/services/helpers";

export const dynamic = "force-dynamic";

const schema = z.object({ enabled: z.boolean() });

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await readBody(req).catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid body");

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Sign in required");

  const { data: existing } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) return jsonError(404, "Invitation not found");

  const { error } = await supabase
    .from("weddings")
    .update({ rsvp_toggle: parsed.data.enabled })
    .eq("id", id);
  if (error) return jsonError(500, error.message);

  return Response.json({ ok: true });
}