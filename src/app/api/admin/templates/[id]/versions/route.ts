/**
 * Admin version history for one template.
 *
 * GET /api/admin/templates/[id]/versions
 *
 * Returns every version row with its retention state, remaining rollback time
 * and an admin-only preview URL. This is read-only; publish, restore and
 * cleanup have their own routes.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  listTemplateVersionHistory,
  resolveTemplateVersionRetentionHours,
} from "@/lib/services/template-version-retention";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();

  try {
    await requireAdmin(supabase);
    const adminClient = createAdminClient();
    const history = await listTemplateVersionHistory(adminClient, id);
    if (!history.template) {
      return Response.json({ error: "Template not found" }, { status: 404 });
    }

    return Response.json({
      ok: true,
      template: history.template,
      retentionHours: resolveTemplateVersionRetentionHours(),
      versions: history.versions,
    });
  } catch (e) {
    return adminApiError(e);
  }
}
