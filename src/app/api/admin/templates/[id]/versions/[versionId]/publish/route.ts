/**
 * Publish a template version.
 *
 * POST /api/admin/templates/[id]/versions/[versionId]/publish
 *   Transitions a draft version to published and marks it as is_current.
 *   Superseded versions are then removed when nothing still pins them.
 *   Existing invitations keep whatever version they were published on, so a
 *   referenced old version is retained instead of being deleted.
 *
 * POST /api/admin/templates/[id]/versions/[versionId]/unpublish
 *   Marks a published version as draft. Only affects new invitations.
 *   Existing invitations using this version continue to work.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getObjectStorage } from "@/lib/services/storage";
import {
  cleanupSupersededTemplateVersions,
  type VersionCleanupResult,
} from "@/lib/services/template-version-cleanup";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id, versionId } = await params;
  const url = new URL(req.url);
  const action = url.pathname.endsWith("/unpublish") ? "unpublish" : "publish";

  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const adminClient = createAdminClient();

    // Verify the version belongs to this template
    const { data: version, error: verErr } = await adminClient
      .from("template_versions")
      .select("id, version, status, template_id")
      .eq("id", versionId)
      .eq("template_id", id)
      .maybeSingle();

    if (verErr || !version) {
      return Response.json({ error: "Template version not found" }, { status: 404 });
    }

    if (action === "publish") {
      if (version.status === "uploading") {
        return Response.json(
          {
            error: "This version is still uploading. Wait for the package to finish, then publish.",
            code: "UPLOAD_IN_PROGRESS",
          },
          { status: 409 }
        );
      }
      if (version.status === "published") {
        return Response.json({ error: "Version is already published" }, { status: 409 });
      }

      // Mark all other versions of this template as not-current
      await adminClient
        .from("template_versions")
        .update({ is_current: false })
        .eq("template_id", id);

      // Publish this version and make it current
      const { error: pubErr } = await adminClient
        .from("template_versions")
        .update({ status: "published", is_current: true })
        .eq("id", versionId);

      if (pubErr) return Response.json({ error: pubErr.message }, { status: 500 });

      // Ensure the template itself is active when a version is published
      await adminClient
        .from("templates")
        .update({ status: "active" })
        .eq("id", id)
        .eq("status", "draft"); // Only promote from draft → active

      // Finish the replacement: old versions are removed unless an invitation
      // still pins them. Guest builder drafts are moved to the new version so
      // the old row can go without breaking an in-progress session.
      let cleanup: VersionCleanupResult | null = null;
      const warnings: string[] = [];
      try {
        const storage = await getObjectStorage();
        cleanup = await cleanupSupersededTemplateVersions({
          supabase: adminClient,
          templateId: id,
          newVersionId: versionId,
          storage,
          protectCurrent: false,
          repointGuestDrafts: true,
        });
        warnings.push(...cleanup.warnings);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Previous-version cleanup will retry on the next upload: ${message}`);
        console.error("[template-publish] cleanup failed", {
          templateId: id,
          versionId,
          error: message,
        });
      }

      await logAdminAction(admin.user.id, "template.version_publish", "template_version", versionId, {
        templateId: id,
        version: version.version,
        cleanup: cleanup
          ? {
              deletedVersions: cleanup.deletedVersions.map((item) => item.version),
              deletedObjects: cleanup.deletedObjects,
              skipped: cleanup.skipped,
            }
          : null,
        ...(warnings.length > 0 ? { warnings } : {}),
      });

      return Response.json({
        ok: true,
        version: version.version,
        status: "published",
        isCurrent: true,
        ...(cleanup ? { versionCount: cleanup.remainingVersions } : {}),
        ...(cleanup
          ? {
              cleanup: {
                deletedVersions: cleanup.deletedVersions,
                deletedObjects: cleanup.deletedObjects,
                skipped: cleanup.skipped,
                warnings: cleanup.warnings,
              },
            }
          : {}),
        ...(warnings.length > 0 ? { warnings } : {}),
      });
    } else {
      // Unpublish — mark draft but leave is_current potentially alone
      // (if this was the current version, the template has no current published version now)
      const { error: unpubErr } = await adminClient
        .from("template_versions")
        .update({ status: "draft", is_current: false })
        .eq("id", versionId);

      if (unpubErr) return Response.json({ error: unpubErr.message }, { status: 500 });

      // Check if there are any remaining published versions for this template
      const { count } = await adminClient
        .from("template_versions")
        .select("id", { count: "exact", head: true })
        .eq("template_id", id)
        .eq("status", "published");

      if ((count ?? 0) === 0) {
        // No published versions remain — mark template as draft
        await adminClient.from("templates").update({ status: "draft" }).eq("id", id);
      }

      await logAdminAction(admin.user.id, "template.version_unpublish", "template_version", versionId, {
        templateId: id,
        version: version.version,
      });

      return Response.json({ ok: true, version: version.version, status: "draft" });
    }
  } catch (e) {
    return adminApiError(e);
  }
}
