import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin, readBody } from "@/lib/services/helpers";
import { adminApiError, logAdminAction } from "@/lib/services/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/services/ops";
import {
  listTemplateVersions,
  weddingsReferencingTemplate,
  computeTemplateUsage,
  isActiveWedding,
} from "@/lib/services/template-lifecycle";
import { deleteMediaPack } from "@/lib/services/media-packs";
import { deleteDemoDetailPack } from "@/lib/services/demo-details";
import { deleteMusicTrack } from "@/lib/services/music-library";
import { getObjectStorage, TEMPLATE_BUCKET } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().max(1000).nullable().optional(),
    status: z.enum(["active", "disabled", "draft"]).optional(),
    product_id: z.string().uuid().nullable().optional(),
    price_paise: z.number().int().min(0).optional(),
    // Demo media pack (see the Media tab). NULL → package images.
    media_pack_id: z.string().uuid().nullable().optional(),
    demo_detail_pack_id: z.string().uuid().nullable().optional(),
    music_track_id: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
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
    const body = await readBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid template update", details: parsed.error.flatten() }, { status: 400 });

    const adminClient = createAdminClient();

    if (parsed.data.price_paise !== undefined) {
      const { data: tpl } = await adminClient.from("templates").select("product_id").eq("id", id).maybeSingle();
      if (!tpl?.product_id) return Response.json({ error: "This template has no product to price" }, { status: 400 });
      const { error: priceErr } = await adminClient
        .from("products")
        .update({ price_paise: parsed.data.price_paise })
        .eq("id", tpl.product_id);
      if (priceErr) return Response.json({ error: priceErr.message }, { status: 500 });
    }

    const update = {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.product_id !== undefined ? { product_id: parsed.data.product_id } : {}),
      ...(parsed.data.media_pack_id !== undefined ? { media_pack_id: parsed.data.media_pack_id } : {}),
      ...(parsed.data.demo_detail_pack_id !== undefined
        ? { demo_detail_pack_id: parsed.data.demo_detail_pack_id }
        : {}),
      ...(parsed.data.music_track_id !== undefined
        ? { music_track_id: parsed.data.music_track_id }
        : {}),
    };

    const { data, error } = await adminClient.from("templates").update(update).eq("id", id).select("*").single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await logAdminAction(admin.user.id, "template.update", "template", id, parsed.data as unknown as Record<string, unknown>);
    return Response.json({ template: data });
  } catch (e) {
    return adminApiError(e);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TemplateResourceField =
  | "media_pack_id"
  | "demo_detail_pack_id"
  | "music_track_id"
  | "product_id";

interface TemplateResourceRef {
  id: string;
  media_pack_id?: string | null;
  demo_detail_pack_id?: string | null;
  music_track_id?: string | null;
  product_id?: string | null;
}

/**
 * Returns the resource id only when no other template references it. Shared
 * packs, detail packs and library tracks are left in place for their other
 * templates.
 */
function exclusivelyUsedBy(
  rows: TemplateResourceRef[] | null | undefined,
  templateId: string,
  value: string | null | undefined,
  field: TemplateResourceField
): string | null {
  if (!value) return null;
  const usedElsewhere = (rows ?? []).some(
    (row) => row.id !== templateId && row[field] === value
  );
  return usedElsewhere ? null : value;
}

function storageKey(value: string | null | undefined): string | null {
  const key = value?.trim().replace(/^\/+/, "");
  if (!key || /^https?:\/\//i.test(key)) return null;
  return key;
}

function storagePrefix(value: string | null | undefined): string | null {
  const key = storageKey(value);
  if (!key) return null;
  return key.endsWith("/") ? key : `${key}/`;
}

function isMissingResource(message: string): boolean {
  return /not found/i.test(message);
}

/**
 * DELETE /api/admin/templates/[id] — permanent template deletion.
 *
 * Rules enforced server-side (never trusted from the client):
 *  - The template must not be referenced by any *active* invitation (a live,
 *    unexpired wedding). Active invitations block deletion with a 409.
 *  - Non-active invitations are detached (their template columns are cleared)
 *    and guest drafts pinned to the template are deleted, so the NOT NULL FKs
 *    do not block the row delete.
 *  - Template package objects (all version prefixes + thumbnail/preview) are
 *    removed from the object store; deletion is idempotent.
 *  - Demo photos, the demo detail pack, the soundtrack and the pricing row are
 *    deleted too, but only when no other template references them. Shared
 *    library assets are left available.
 *  - Order and payment history keep their template ids as immutable data and
 *    are never touched.
 *  - Deleting an already-deleted template is a safe no-op (200, alreadyDeleted).
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createServerClient();
  try {
    const admin = await requireAdmin(supabase);
    if (!UUID_RE.test(id)) return Response.json({ error: "Invalid template id" }, { status: 400 });

    const limit = await consumeRateLimit({
      bucket: "admin_destructive",
      key: admin.user.id,
      limit: 60,
      windowSeconds: 3600,
    });
    if (!limit.allowed) return Response.json({ error: "Too many admin operations. Please slow down." }, { status: 429 });

    const adminClient = createAdminClient();

    const { data: templateRow, error: templateError } = await adminClient
      .from("templates")
      .select(
        "id, name, thumbnail_path, preview_gif_path, media_pack_id, demo_detail_pack_id, music_track_id, product_id"
      )
      .eq("id", id)
      .maybeSingle();
    if (templateError) return Response.json({ error: templateError.message }, { status: 500 });
    if (!templateRow) {
      return Response.json({ ok: true, alreadyDeleted: true, templateId: id });
    }

    const versions = await listTemplateVersions(adminClient, id);
    const versionIds = versions.map((v) => v.id);

    // Server-side re-check: the client never supplies counts.
    const weddings = await weddingsReferencingTemplate(adminClient, id, versionIds);
    const usage = computeTemplateUsage(weddings, id, versionIds);
    if (usage.activeInvitations > 0) {
      return Response.json(
        {
          error: `Cannot delete: this template is used by ${usage.activeInvitations} active invitation${usage.activeInvitations === 1 ? "" : "s"}.`,
          code: "TEMPLATE_IN_USE",
          activeInvitations: usage.activeInvitations,
          totalInvitations: usage.totalInvitations,
        },
        { status: 409 }
      );
    }

    // Demo media, details, soundtrack and pricing row belong to the template
    // only when no other template still references them. Query the references
    // before deleting anything so shared library assets are left untouched.
    const { data: templateRefs, error: refsError } = await adminClient
      .from("templates")
      .select("id, media_pack_id, demo_detail_pack_id, music_track_id, product_id");
    if (refsError) return Response.json({ error: refsError.message }, { status: 500 });

    const exclusiveMediaPackId = exclusivelyUsedBy(
      templateRefs as TemplateResourceRef[] | null,
      id,
      templateRow.media_pack_id,
      "media_pack_id"
    );
    const exclusiveDetailPackId = exclusivelyUsedBy(
      templateRefs as TemplateResourceRef[] | null,
      id,
      templateRow.demo_detail_pack_id,
      "demo_detail_pack_id"
    );
    const exclusiveMusicTrackId = exclusivelyUsedBy(
      templateRefs as TemplateResourceRef[] | null,
      id,
      templateRow.music_track_id,
      "music_track_id"
    );
    let exclusiveProductId = exclusivelyUsedBy(
      templateRefs as TemplateResourceRef[] | null,
      id,
      templateRow.product_id,
      "product_id"
    );

    // A product that already backs an order is financial history; keep it.
    if (exclusiveProductId) {
      const { data: productOrders, error: ordersError } = await adminClient
        .from("orders")
        .select("id")
        .eq("product_id", exclusiveProductId);
      if (ordersError) {
        exclusiveProductId = null;
      } else if ((productOrders ?? []).length > 0) {
        exclusiveProductId = null;
      }
    }

    // Detach non-active invitations so the NOT NULL template FKs cannot block
    // the delete. Active ones are gone by the check above.
    const detachableIds = weddings.filter((w) => !isActiveWedding(w)).map((w) => w.id);
    if (detachableIds.length > 0) {
      const { error: detachError } = await adminClient
        .from("weddings")
        .update({ template_id: null, template_version_id: null })
        .in("id", detachableIds);
      if (detachError) return Response.json({ error: detachError.message }, { status: 500 });
    }

    // Guest drafts are throwaway session state pinned to templates/versions
    // with NOT NULL FKs and no cascade — remove them explicitly.
    const draftFilter = versionIds.length
      ? `template_id.eq.${id},template_version_id.in.(${versionIds.join(",")})`
      : `template_id.eq.${id}`;
    const drafts = await adminClient.from("guest_drafts").delete().or(draftFilter).select("id");
    if (drafts.error) return Response.json({ error: drafts.error.message }, { status: 500 });
    const deletedDrafts = (drafts.data ?? []).length;

    // Delete every object that belongs to this template: the whole
    // "{templateId}/" tree (package versions + thumbnail), each version's
    // declared storage prefix (covers imported/legacy rows) and the explicit
    // thumbnail/preview keys. If storage cleanup fails we abort BEFORE removing
    // the template row, so a retry completes the job.
    const storage = await getObjectStorage();
    let objectsDeleted = 0;
    try {
      const prefixes = new Set<string>([`${id}/`]);
      for (const version of versions) {
        const prefix = storagePrefix(version.storage_prefix);
        if (prefix && !prefix.startsWith(`${id}/`)) prefixes.add(prefix);
      }

      const keys = new Set<string>();
      for (const prefix of prefixes) {
        for (const key of await storage.list(TEMPLATE_BUCKET, prefix)) {
          keys.add(key);
        }
      }
      for (const value of [templateRow.thumbnail_path, templateRow.preview_gif_path]) {
        const key = storageKey(value);
        if (key) keys.add(key);
      }

      for (const key of keys) {
        await storage.delete(TEMPLATE_BUCKET, key);
        objectsDeleted += 1;
      }
    } catch (err) {
      return Response.json(
        {
          error: "Template could not be deleted: removing package objects failed.",
          step: "storage",
          detail: err instanceof Error ? err.message : "storage error",
          objectsDeleted,
        },
        { status: 500 }
      );
    }

    // Exclusive demo assets are removed too, including the photos/audio in the
    // private wedding bucket. Shared packs stay available for other templates.
    const warnings: string[] = [];
    let removedMediaPacks = 0;
    let removedDetailPacks = 0;
    let removedMusicTracks = 0;
    let removedProducts = 0;

    if (exclusiveMediaPackId) {
      try {
        const removed = await deleteMediaPack(exclusiveMediaPackId);
        objectsDeleted += removed.removedObjects;
        removedMediaPacks = 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "media pack cleanup failed";
        if (!isMissingResource(message)) {
          return Response.json(
            {
              error: "Template could not be deleted: removing its demo photos failed.",
              step: "media_pack",
              detail: message,
              objectsDeleted,
            },
            { status: 500 }
          );
        }
        removedMediaPacks = 1;
      }
    }

    if (exclusiveDetailPackId) {
      try {
        await deleteDemoDetailPack(exclusiveDetailPackId);
        removedDetailPacks = 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "details pack cleanup failed";
        if (!isMissingResource(message)) {
          return Response.json(
            {
              error: "Template could not be deleted: removing its demo details failed.",
              step: "demo_details",
              detail: message,
              objectsDeleted,
            },
            { status: 500 }
          );
        }
        removedDetailPacks = 1;
      }
    }

    if (exclusiveMusicTrackId) {
      try {
        const removed = await deleteMusicTrack(exclusiveMusicTrackId);
        if (removed.removedObject) objectsDeleted += 1;
        removedMusicTracks = 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : "soundtrack cleanup failed";
        if (!isMissingResource(message)) {
          return Response.json(
            {
              error: "Template could not be deleted: removing its soundtrack failed.",
              step: "music",
              detail: message,
              objectsDeleted,
            },
            { status: 500 }
          );
        }
        removedMusicTracks = 1;
      }
    }

    const { error: deleteError } = await adminClient.from("templates").delete().eq("id", id);
    if (deleteError) {
      // A concurrent purchase/checkout may have re-attached the template while
      // we cleaned up. Re-check instead of inventing a reason.
      if ((deleteError as { code?: string }).code === "23503") {
        const recheck = await weddingsReferencingTemplate(adminClient, id, versionIds);
        const after = computeTemplateUsage(recheck, id, versionIds);
        return Response.json(
          {
            error: `Cannot delete: the template now has ${after.activeInvitations} active invitation${after.activeInvitations === 1 ? "" : "s"}.`,
            code: "TEMPLATE_IN_USE",
            activeInvitations: after.activeInvitations,
            totalInvitations: after.totalInvitations,
          },
          { status: 409 }
        );
      }
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    // The template row is gone, so an exclusive product is now unreferenced.
    // Orders keep their product reference; those products were skipped above.
    if (exclusiveProductId) {
      const { error: productError } = await adminClient
        .from("products")
        .delete()
        .eq("id", exclusiveProductId);
      if (productError) {
        warnings.push(`Pricing product was kept: ${productError.message}`);
      } else {
        removedProducts = 1;
      }
    }

    await logAdminAction(admin.user.id, "template.delete", "template", id, {
      name: templateRow.name,
      versionsDeleted: versionIds.length,
      objectsDeleted,
      detachedWeddings: detachableIds.length,
      deletedDrafts,
      removedMediaPacks,
      removedDetailPacks,
      removedMusicTracks,
      removedProducts,
      ...(warnings.length > 0 ? { warnings } : {}),
    });

    return Response.json({
      ok: true,
      templateId: id,
      name: templateRow.name,
      versionsDeleted: versionIds.length,
      objectsDeleted,
      detachedWeddings: detachableIds.length,
      deletedDrafts,
      removedMediaPacks,
      removedDetailPacks,
      removedMusicTracks,
      removedProducts,
      ...(warnings.length > 0 ? { warnings } : {}),
    });
  } catch (e) {
    return adminApiError(e);
  }
}