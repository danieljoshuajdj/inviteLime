"use client";

import { useRef, useState } from "react";

import { EmptyState } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { TextInput, Textarea } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";
import { cn } from "@/lib/utils";
// Client-safe module: the service pulls in the storage client, whose
// `server-only` guard cannot be bundled for the browser.
import {
  MAX_MEDIA_BYTES,
  MEDIA_PACK_ROLE_LABELS,
  type MediaPack,
  type MediaPackItem,
  type MediaPackRole,
} from "@/lib/library-media";

interface Props {
  initialPacks: MediaPack[];
}

const SINGLE_ROLES: readonly MediaPackRole[] = ["groom", "bride", "couple"];

const MAX_PHOTO_LABEL = `${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))}MB`;

/**
 * Media packs: shared sample photos (groom, bride, couple, gallery) that
 * templates render while people preview their demo.
 *
 * A pack is uploaded once here and assigned to any number of templates in the
 * template wizard, so the same pictures are never bundled into each ZIP.
 */
export function MediaManager({ initialPacks }: Props) {
  const [packs, setPacks] = useState<MediaPack[]>(initialPacks);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [editing, setEditing] = useState<MediaPack | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const [deletingPack, setDeletingPack] = useState<MediaPack | null>(null);
  const [deletePackBusy, setDeletePackBusy] = useState(false);

  const [removingItem, setRemovingItem] = useState<{ pack: MediaPack; item: MediaPackItem } | null>(null);
  const [removeItemBusy, setRemoveItemBusy] = useState(false);

  const [uploadTarget, setUploadTarget] = useState<{ packId: string; role: MediaPackRole } | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function openCreate() {
    setCreateName("");
    setCreateDescription("");
    setCreateOpen(true);
  }

  async function createPack(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateBusy(true);
    try {
      const res = await fetch("/api/admin/media-packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDescription.trim() || null }),
      });
      const json = (await res.json()) as { pack?: MediaPack; error?: string };
      if (!res.ok || !json.pack) throw new Error(json.error ?? "Create failed");

      setPacks((prev) => [json.pack!, ...prev]);
      toast("Media pack created", "Upload its photos next");
      setCreateOpen(false);
    } catch (err) {
      toast("Could not create pack", (err as Error).message);
    } finally {
      setCreateBusy(false);
    }
  }

  function openEdit(pack: MediaPack) {
    setEditName(pack.name);
    setEditDescription(pack.description ?? "");
    setEditing(pack);
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setEditBusy(true);
    try {
      const res = await fetch(`/api/admin/media-packs/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || null }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Update failed");

      setPacks((prev) =>
        prev.map((p) =>
          p.id === editing.id
            ? { ...p, name: editName.trim(), description: editDescription.trim() || null }
            : p
        )
      );
      toast("Pack updated");
      setEditing(null);
    } catch (err) {
      toast("Could not update pack", (err as Error).message);
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmDeletePack() {
    if (!deletingPack) return;
    const pack = deletingPack;
    setDeletePackBusy(true);
    try {
      const res = await fetch(`/api/admin/media-packs/${pack.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setPacks((prev) => prev.filter((p) => p.id !== pack.id));
      toast("Media pack deleted");
      setDeletingPack(null);
    } catch (err) {
      toast("Could not delete pack", (err as Error).message);
    } finally {
      setDeletePackBusy(false);
    }
  }

  function pickFiles(pack: MediaPack, role: MediaPackRole) {
    setUploadTarget({ packId: pack.id, role });
    fileInput.current?.click();
  }

  async function handleFiles(files: File[]) {
    if (!uploadTarget || files.length === 0) return;
    const { packId, role } = uploadTarget;
    // Single slots hold one photo: an extra selection would be thrown away by
    // the server anyway, so only the first is sent.
    const selected = role === "gallery" ? files : files.slice(0, 1);
    setUploadingKey(`${packId}:${role}`);
    setUploadTarget(null);

    const added: MediaPackItem[] = [];
    let failure: string | null = null;

    for (const file of selected) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("role", role);
        const res = await fetch(`/api/admin/media-packs/${packId}/items`, { method: "POST", body: fd });
        const json = (await res.json()) as { item?: MediaPackItem; error?: string };
        if (!res.ok || !json.item) throw new Error(json.error ?? "Upload failed");
        added.push(json.item);
      } catch (err) {
        failure = (err as Error).message;
        break;
      }
    }

    if (added.length > 0) {
      setPacks((prev) =>
        prev.map((pack) => {
          if (pack.id !== packId) return pack;
          // The server replaces single-slot photos; the gallery accumulates.
          const kept = role === "gallery" ? pack.items : pack.items.filter((i) => i.role !== role);
          return { ...pack, items: [...kept, ...added] };
        })
      );
      toast(added.length === 1 ? "Photo added" : `${added.length} photos added`);
    }
    if (failure) toast("Could not upload photo", failure);

    setUploadingKey(null);
  }

  async function confirmRemoveItem() {
    if (!removingItem) return;
    const { pack, item } = removingItem;
    setRemoveItemBusy(true);
    try {
      const res = await fetch(`/api/admin/media-packs/${pack.id}/items/${item.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setPacks((prev) =>
        prev.map((p) => (p.id === pack.id ? { ...p, items: p.items.filter((i) => i.id !== item.id) } : p))
      );
      toast("Photo removed");
      setRemovingItem(null);
    } catch (err) {
      toast("Could not remove photo", (err as Error).message);
    } finally {
      setRemoveItemBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Library</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Media</h1>
        </div>
        <Button icon="add" onClick={openCreate}>New media pack</Button>
      </div>

      <p className="mt-4 max-w-2xl font-body-sm text-on-surface-variant">
        Packs of sample photos — groom, bride, couple and a gallery — that template demos
        render while people preview them. Assign a pack to a template while uploading it:
        the same pictures are then reused by every demo, so they are uploaded once instead
        of being bundled into each template ZIP. Live invitations always show the couple&apos;s
        own photos.
      </p>

      {packs.length === 0 ? (
        <EmptyState
          icon="image"
          title="No media packs yet"
          description="Create a pack, upload groom, bride, couple and gallery photos, then assign it to any template while uploading its package."
          className="mt-6 rounded-2xl border border-dashed border-outline-variant"
        />
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {packs.map((pack) => {
            // A single slot shows its newest photo — the same one the demo
            // picks — while the gallery keeps upload order.
            const singlePhoto = (role: MediaPackRole) =>
              pack.items
                .filter((i) => i.role === role)
                .sort((a, b) => b.sortOrder - a.sortOrder)[0] ?? null;
            const gallery = pack.items
              .filter((i) => i.role === "gallery")
              .sort((a, b) => a.sortOrder - b.sortOrder);

            return (
              <div key={pack.id} className="rounded-2xl border border-outline-variant bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-heading-md font-semibold !text-on-surface">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                        <Icon name="image" size="md" weight="w400" />
                      </span>
                      {pack.name}
                    </p>
                    <p className="mt-1 font-body-xs text-on-surface-variant">
                      {pack.items.length} photo{pack.items.length === 1 ? "" : "s"} ·{" "}
                      {pack.templateCount === 0
                        ? "not used by any template yet"
                        : `used by ${pack.templateCount} template${pack.templateCount === 1 ? "" : "s"}`}
                    </p>
                    {pack.description && (
                      <p className="mt-1 font-body-sm text-on-surface-variant">{pack.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" icon="edit" onClick={() => openEdit(pack)}>Edit</Button>
                    <Button variant="danger" size="sm" icon="delete" onClick={() => setDeletingPack(pack)}>Delete</Button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  {SINGLE_ROLES.map((role) => {
                    const item = singlePhoto(role);
                    const busy = uploadingKey === `${pack.id}:${role}`;
                    return (
                      <div key={role} className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                        <p className="font-body-xs font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                          {MEDIA_PACK_ROLE_LABELS[role]}
                        </p>
                        <div className="relative mt-2 aspect-[3/4] overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
                          <PhotoFrame url={item?.url ?? null} alt={`${pack.name} — ${MEDIA_PACK_ROLE_LABELS[role]}`} />
                          {item && (
                            <RemoveButton
                              label={`Remove ${MEDIA_PACK_ROLE_LABELS[role].toLowerCase()}`}
                              onClick={() => setRemovingItem({ pack, item })}
                            />
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            icon="upload"
                            loading={busy}
                            onClick={() => pickFiles(pack, role)}
                          >
                            {item ? "Replace" : "Upload"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-body-xs font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
                      {MEDIA_PACK_ROLE_LABELS.gallery}{" "}
                      <span className="font-normal normal-case tracking-normal">
                        {gallery.length} photo{gallery.length === 1 ? "" : "s"}
                      </span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      icon="add"
                      loading={uploadingKey === `${pack.id}:gallery`}
                      onClick={() => pickFiles(pack, "gallery")}
                    >
                      Add photos
                    </Button>
                  </div>
                  {gallery.length === 0 ? (
                    <p className="mt-2 font-body-xs text-on-surface-variant">
                      No gallery photos yet. These appear in the template&apos;s gallery section in demo mode.
                    </p>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                      {gallery.map((item) => (
                        <div
                          key={item.id}
                          className="relative aspect-[3/4] overflow-hidden rounded-lg border border-outline-variant bg-surface-container"
                        >
                          <PhotoFrame url={item.url} alt={`${pack.name} — gallery photo`} />
                          <RemoveButton
                            label="Remove gallery photo"
                            onClick={() => setRemovingItem({ pack, item })}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 font-body-xs text-on-surface-variant">
        Photos can be PNG, JPEG, WebP, AVIF or GIF, up to {MAX_PHOTO_LABEL}. Large images are
        optimised automatically.
      </p>

      {/* One hidden picker serves every upload button; `uploadTarget` remembers
          which pack and role the selection belongs to. */}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void handleFiles(files);
        }}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New media pack"
        icon="image"
      >
        <form onSubmit={createPack} className="flex flex-col gap-4">
          <TextInput
            label="Name"
            required
            value={createName}
            placeholder="e.g. Royal couple"
            onChange={(e) => setCreateName(e.target.value)}
          />
          <Textarea
            label="Description (optional)"
            rows={2}
            value={createDescription}
            placeholder="What kind of wedding this set suits..."
            onChange={(e) => setCreateDescription(e.target.value)}
          />
          <Button type="submit" loading={createBusy} fullWidth>Create pack</Button>
        </form>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit media pack"
        icon="edit"
      >
        {editing && (
          <form onSubmit={saveEdit} className="flex flex-col gap-4">
            <TextInput
              label="Name"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <Textarea
              label="Description (optional)"
              rows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
            <Button type="submit" loading={editBusy} fullWidth>Save changes</Button>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deletingPack}
        onClose={() => { if (!deletePackBusy) setDeletingPack(null); }}
        title="Delete media pack"
        icon="delete"
        size="sm"
        blockBackdropClose={deletePackBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingPack(null)} disabled={deletePackBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon="delete" loading={deletePackBusy} onClick={() => void confirmDeletePack()}>
              Delete pack
            </Button>
          </>
        }
      >
        {deletingPack && (
          <div className="flex flex-col gap-3">
            <p className="font-body-md text-on-surface">
              Are you sure you want to delete <span className="font-semibold">“{deletingPack.name}”</span>?
            </p>
            <p className="font-body-sm text-on-surface-variant">
              All {deletingPack.items.length} photo{deletingPack.items.length === 1 ? "" : "s"} in the pack
              are removed from storage.
            </p>
            {deletingPack.templateCount > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 font-body-sm text-warning">
                {deletingPack.templateCount} template{deletingPack.templateCount === 1 ? "" : "s"} currently
                use this pack. They will fall back to the images bundled in their package.
              </p>
            )}
            <p className="font-body-sm font-semibold text-error">This action cannot be undone.</p>
          </div>
        )}
      </Modal>

      <Modal
        open={!!removingItem}
        onClose={() => { if (!removeItemBusy) setRemovingItem(null); }}
        title="Remove photo"
        icon="delete"
        size="sm"
        blockBackdropClose={removeItemBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemovingItem(null)} disabled={removeItemBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon="delete" loading={removeItemBusy} onClick={() => void confirmRemoveItem()}>
              Remove photo
            </Button>
          </>
        }
      >
        {removingItem && (
          <div className="flex flex-col gap-3">
            <p className="font-body-md text-on-surface">
              Remove this {MEDIA_PACK_ROLE_LABELS[removingItem.item.role].toLowerCase()} from{" "}
              <span className="font-semibold">“{removingItem.pack.name}”</span>?
            </p>
            <p className="font-body-sm text-on-surface-variant">
              It will be deleted from storage and stop appearing in every demo that uses this pack.
            </p>
            <p className="font-body-sm font-semibold text-error">This action cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Photo or a neutral placeholder when the pack has no image for the slot. */
function PhotoFrame({ url, alt }: { url: string | null; alt: string }) {
  if (!url) {
    return (
      <span className="flex h-full w-full items-center justify-center text-on-surface-variant">
        <Icon name="image" size="lg" weight="w400" ariaLabel={alt} />
      </span>
    );
  }
  return <img src={url} alt={alt} className="h-full w-full object-cover" />;
}

/** Small overlay control for removing one photo from a slot or gallery tile. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white",
        "transition-colors hover:bg-error focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      )}
    >
      <Icon name="close" size="xs" />
    </button>
  );
}
