/**
 * Publish a template version.
 *
 * POST /api/admin/templates/[id]/versions/[versionId]/publish
 *   Verifies the draft package is loadable and compatible with every live
 *   invitation of the template, then atomically:
 *     - makes the draft the single current published version;
 *     - repoints every invitation and builder draft of the template to it;
 *     - keeps the replaced version as `previous` for 72 hours.
 *
 *   Invitation URLs, customer data, media, music, RSVP rows and settings are
 *   untouched; only the package version changes.
 *
 * POST /api/admin/templates/[id]/versions/[versionId]/unpublish
 *   Marks a published version as draft. Only affects new invitations.
 *   Existing invitations continue to work.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getObjectStorage } from "@/lib/services/storage";
import { verifyTemplateVersionCompatibility } from "@/lib/services/template-version-compatibility";
import {
  publishTemplateVersion,
  resolveTemplateVersionRetentionHours,
} from "@/lib/services/template-version-retention";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

function isMissingFunction(error: Error): boolean {
  return /function .*publish_template_version.* does not exist|42883/i.test(
    error.message
  );
}

/**
 * The database function raises these messages when a concurrent request
 * changed the version between our pre-check and the transaction. They are
 * conflicts, not server faults, so the caller can refresh and retry.
 */
function rpcFailure(message: string): { code: string; status: number } {
  if (/UPLOAD_IN_PROGRESS/i.test(message)) {
    return { code: "UPLOAD_IN_PROGRESS", status: 409 };
  }
  if (/VERSION_RETIRED/i.test(message)) {
    return { code: "VERSION_RETIRED", status: 409 };
  }
  if (/VERSION_RETENTION_EXPIRED/i.test(message)) {
    return { code: "VERSION_RETENTION_EXPIRED", status: 409 };
  }
  if (/Only a draft version/i.test(message)) {
    return { code: "NOT_A_DRAFT", status: 409 };
  }
  return { code: "PUBLISH_FAILED", status: 500 };
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id, versionId } = await params;
  const url = new URL(req.url);
  const action = url.pathname.endsWith("/unpublish") ? "unpublish" : "publish";

  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    const adminClient = createAdminClient();

    // Verify the version belongs to this template.
    const { data: version, error: verErr } = await adminClient
      .from("template_versions")
      .select("id, version, status, template_id, is_current")
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
      if (version.status === "retired") {
        return Response.json(
          {
            error: "This version has been retired and can no longer be published.",
            code: "VERSION_RETIRED",
          },
          { status: 409 }
        );
      }
      if (version.status === "published" && version.is_current) {
        return Response.json(
          { error: "Version is already the current published release" },
          { status: 409 }
        );
      }
      if (version.status !== "draft") {
        return Response.json(
          {
            error:
              "Only a draft version can be published. Use Restore to return to a previous version.",
            code: "NOT_A_DRAFT",
          },
          { status: 409 }
        );
      }

      // Never change the live version until the replacement is proven
      // loadable and compatible with the invitations it will serve.
      let storage;
      try {
        storage = await getObjectStorage();
      } catch (err) {
        return Response.json(
          {
            error: "Template storage is unavailable, so the current version was kept.",
            detail: err instanceof Error ? err.message : String(err),
          },
          { status: 503 }
        );
      }

      const compatibility = await verifyTemplateVersionCompatibility({
        supabase: adminClient,
        templateId: id,
        versionId,
        storage,
        purpose: "publish",
      });

      if (!compatibility.ok) {
        await logAdminAction(
          admin.user.id,
          "template.version_publish_blocked",
          "template_version",
          versionId,
          {
            templateId: id,
            version: version.version,
            issues: compatibility.issues,
            warnings: compatibility.warnings,
          }
        );
        return Response.json(
          {
            error:
              "This version is not compatible with the live invitations. The current version and all invitations were kept unchanged.",
            code: "VERSION_INCOMPATIBLE",
            issues: compatibility.issues,
            warnings: compatibility.warnings,
          },
          { status: 409 }
        );
      }

      let published;
      try {
        published = await publishTemplateVersion({
          supabase: adminClient,
          templateId: id,
          versionId,
          retentionHours: resolveTemplateVersionRetentionHours(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isMissingFunction(err as Error)) {
          return Response.json(
            {
              error:
                "Template version retention is not available yet. Apply migration 00025_template_version_retention.sql and try again.",
              code: "MIGRATION_REQUIRED",
            },
            { status: 503 }
          );
        }
        const failure = rpcFailure(message);
        return Response.json(
          {
            error: `Publish failed and the current version was kept: ${message}`,
            code: failure.code,
          },
          { status: failure.status }
        );
      }

      const { count } = await adminClient
        .from("template_versions")
        .select("id", { count: "exact", head: true })
        .eq("template_id", id);

      await logAdminAction(
        admin.user.id,
        "template.version_publish",
        "template_version",
        versionId,
        {
          templateId: id,
          version: version.version,
          previous: published.previous,
          repointedInvitations: published.repointedInvitations,
          repointedDrafts: published.repointedDrafts,
          retentionHours: published.retentionHours,
          warnings: compatibility.warnings,
        }
      );

      return Response.json({
        ok: true,
        version: version.version,
        versionId: version.id,
        status: "published",
        isCurrent: true,
        previous: published.previous,
        repointedInvitations: published.repointedInvitations,
        repointedDrafts: published.repointedDrafts,
        retentionHours: published.retentionHours,
        ...(typeof count === "number" ? { versionCount: count } : {}),
        ...(compatibility.warnings.length > 0
          ? { warnings: compatibility.warnings }
          : {}),
      });
    }

    // Unpublish — only affects new invitations. Existing invitations keep
    // their pinned version and continue to render.
    const { error: unpubErr } = await adminClient
      .from("template_versions")
      .update({ status: "draft", is_current: false })
      .eq("id", versionId);

    if (unpubErr) return Response.json({ error: unpubErr.message }, { status: 500 });

    const { count } = await adminClient
      .from("template_versions")
      .select("id", { count: "exact", head: true })
      .eq("template_id", id)
      .eq("status", "published");

    if ((count ?? 0) === 0) {
      await adminClient.from("templates").update({ status: "draft" }).eq("id", id);
    }

    await logAdminAction(
      admin.user.id,
      "template.version_unpublish",
      "template_version",
      versionId,
      {
        templateId: id,
        version: version.version,
      }
    );

    return Response.json({ ok: true, version: version.version, status: "draft" });
  } catch (e) {
    return adminApiError(e);
  }
}
