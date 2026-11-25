/**
 * Restore (roll back) a retained previous template version.
 *
 * POST /api/admin/templates/[id]/versions/[versionId]/restore
 *
 * The target must still be inside its 72-hour retention window. The database
 * function atomically makes it current again, repoints every invitation and
 * builder draft of the template to it, and retires the rejected version. The
 * rejected version is then permanently deleted from storage and Supabase. If
 * that delete fails, the row stays `retired` (unavailable, never served) and
 * maintenance retries it.
 *
 * Invitation URLs, customer data, media, music, RSVP rows and settings are
 * untouched; only the package version changes.
 */

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getObjectStorage } from "@/lib/services/storage";
import {
  purgeTemplateVersion,
  sweepOrphanedTemplateObjects,
  type TemplateVersionRow,
} from "@/lib/services/template-version-cleanup";
import { verifyTemplateVersionCompatibility } from "@/lib/services/template-version-compatibility";
import { rollbackTemplateVersion } from "@/lib/services/template-version-retention";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

function isMissingFunction(error: Error): boolean {
  return /function .*rollback_template_version.* does not exist|42883/i.test(
    error.message
  );
}

function rpcFailure(message: string): { code: string; status: number } {
  if (/VERSION_RETENTION_EXPIRED/i.test(message)) {
    return { code: "VERSION_RETENTION_EXPIRED", status: 409 };
  }
  if (/VERSION_RETIRED/i.test(message)) {
    return { code: "VERSION_RETIRED", status: 409 };
  }
  if (/Only a retained previous version/i.test(message)) {
    return { code: "VERSION_NOT_RESTORABLE", status: 409 };
  }
  if (/NO_CURRENT_VERSION/i.test(message)) {
    return { code: "NO_CURRENT_VERSION", status: 409 };
  }
  return { code: "ROLLBACK_FAILED", status: 500 };
}

export async function POST(_req: Request, { params }: RouteContext) {
  const { id, versionId } = await params;
  const supabase = await createServerClient();

  try {
    const admin = await requireAdmin(supabase);
    const adminClient = createAdminClient();

    const { data: target, error: targetError } = await adminClient
      .from("template_versions")
      .select(
        "id, version, status, is_current, delete_after, retired_at, template_id"
      )
      .eq("id", versionId)
      .eq("template_id", id)
      .maybeSingle();

    if (targetError || !target) {
      return Response.json({ error: "Template version not found" }, { status: 404 });
    }
    if (target.status !== "previous") {
      return Response.json(
        {
          error: "Only a retained previous version can be restored.",
          code: "VERSION_NOT_RESTORABLE",
        },
        { status: 409 }
      );
    }
    if (target.retired_at) {
      return Response.json(
        {
          error: "This version is already retired and can no longer be restored.",
          code: "VERSION_RETIRED",
        },
        { status: 409 }
      );
    }
    if (
      target.delete_after &&
      Date.parse(target.delete_after) <= Date.now()
    ) {
      return Response.json(
        {
          error:
            "This version is past its 72-hour retention window and can no longer be restored.",
          code: "VERSION_RETENTION_EXPIRED",
        },
        { status: 409 }
      );
    }

    let storage;
    try {
      storage = await getObjectStorage();
    } catch (err) {
      return Response.json(
        {
          error: "Template storage is unavailable, so nothing was changed.",
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
      purpose: "rollback",
    });
    if (!compatibility.ok) {
      await logAdminAction(
        admin.user.id,
        "template.version_rollback_blocked",
        "template_version",
        versionId,
        {
          templateId: id,
          version: target.version,
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

    let rollback;
    try {
      rollback = await rollbackTemplateVersion({
        supabase: adminClient,
        templateId: id,
        targetVersionId: versionId,
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
          error: `Restore failed and the current version was kept: ${message}`,
          code: failure.code,
        },
        { status: failure.status }
      );
    }

    const warnings: string[] = [...compatibility.warnings];
    let cleanup: {
      rejectedVersion: string | null;
      deletedObjects: number;
      pending: boolean;
      warnings: string[];
    } | null = null;

    if (rollback.rejected?.id) {
      const rejectedVersion = rollback.rejected.version;
      try {
        const { data: rejectedRow } = await adminClient
          .from("template_versions")
          .select(
            "id, version, storage_prefix, status, is_current, created_at, published_at, replaced_at, delete_after, retired_at, retirement_reason"
          )
          .eq("id", rollback.rejected.id)
          .eq("template_id", id)
          .maybeSingle();

        const purged = await purgeTemplateVersion({
          supabase: adminClient,
          templateId: id,
          versionId: rollback.rejected.id,
          storage,
        });
        warnings.push(...purged.warnings);

        const sweep = await sweepOrphanedTemplateObjects({
          supabase: adminClient,
          templateId: id,
          storage,
          versions: (
            (
              await adminClient
                .from("template_versions")
                .select(
                  "id, version, storage_prefix, status, is_current, created_at, published_at, replaced_at, delete_after, retired_at, retirement_reason"
                )
                .eq("template_id", id)
            ).data ?? []
          ) as TemplateVersionRow[],
        });

        cleanup = {
          rejectedVersion: rejectedRow?.version ?? rejectedVersion,
          deletedObjects: purged.deletedObjects + sweep.deleted,
          pending: !purged.deleted && !purged.alreadyDeleted,
          warnings: [...purged.warnings, ...sweep.warnings],
        };
        warnings.push(...sweep.warnings);
      } catch (err) {
        // The rollback itself already committed. Never turn a retryable storage
        // or cleanup failure into a false "restore failed" for the admin.
        cleanup = {
          rejectedVersion,
          deletedObjects: 0,
          pending: true,
          warnings: [],
        };
        warnings.push(
          `v${rejectedVersion} is out of service, but its package cleanup could not finish yet: ${
            err instanceof Error ? err.message : String(err)
          }. Maintenance will retry.`
        );
      }
    }

    await logAdminAction(
      admin.user.id,
      "template.version_rollback",
      "template_version",
      versionId,
      {
        templateId: id,
        restoredVersion: rollback.version,
        rejectedVersion: rollback.rejected?.version ?? null,
        rejectedVersionId: rollback.rejected?.id ?? null,
        repointedInvitations: rollback.repointedInvitations,
        repointedDrafts: rollback.repointedDrafts,
        cleanup: cleanup
          ? {
              rejectedVersion: cleanup.rejectedVersion,
              deletedObjects: cleanup.deletedObjects,
              pending: cleanup.pending,
            }
          : null,
        warnings,
      }
    );

    return Response.json({
      ok: true,
      version: rollback.version,
      status: "published",
      isCurrent: true,
      rejectedVersion: rollback.rejected?.version ?? null,
      repointedInvitations: rollback.repointedInvitations,
      repointedDrafts: rollback.repointedDrafts,
      cleanup,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (e) {
    return adminApiError(e);
  }
}
