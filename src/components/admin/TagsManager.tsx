"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { TextInput, Textarea } from "@/components/shared/Field";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";

interface TagRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function TagsManager({ tags }: { tags: TagRow[] }) {
  const [rows, setRows] = useState(tags);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);
  const [deleting, setDeleting] = useState<TagRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [slugLocked, setSlugLocked] = useState(false);

  function openCreate() {
    setDirty(false);
    setDraftName("");
    setDraftSlug("");
    setSlugLocked(false);
    setCreating(true);
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          slug: slugify(draftSlug),
          description: String(fd.get("description") ?? ""),
        }),
      });
      const json = (await res.json()) as { error?: string; tag?: TagRow };
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      setRows((rs) => [...rs, json.tag!].sort((a, b) => a.name.localeCompare(b.name)));
      toast("Tag created");
      setCreating(false);
      setDirty(false);
      setDraftName("");
      setDraftSlug("");
      setSlugLocked(false);
    } catch (err) {
      toast("Could not create tag", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tags/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(fd.get("name") ?? ""),
          slug: String(fd.get("slug") ?? "").toLowerCase().replace(/\s+/g, "-"),
          description: String(fd.get("description") ?? ""),
        }),
      });
      const json = (await res.json()) as { error?: string; tag?: TagRow };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setRows((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...json.tag! } : r)));
      toast("Tag updated");
      setEditing(null);
      setDirty(false);
    } catch (err) {
      toast("Could not update tag", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    const row = deleting;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tags/${row.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast("Tag deleted");
      setDeleting(null);
    } catch (err) {
      toast("Could not delete tag", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Library</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Tags</h1>
        </div>
        <Button icon="add" onClick={openCreate}>New tag</Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-on-surface-variant">No tags yet. Create tags to help organize and discover templates.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <Icon name="tune" size="md" weight="w400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading-md font-semibold !text-on-surface">{t.name}</p>
                <p className="font-body-xs text-on-surface-variant">/{t.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" icon="edit" onClick={() => { setDirty(false); setEditing(t); }}>Edit</Button>
                <Button variant="danger" size="sm" icon="delete" onClick={() => setDeleting(t)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => { setDirty(false); setCreating(false); }} title="New tag" icon="tune" blockBackdropClose={dirty}>
        <form onSubmit={create} onInput={() => setDirty(true)} className="flex flex-col gap-4">
          <TextInput
            label="Name"
            name="name"
            placeholder="e.g. Luxury"
            required
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
              if (!slugLocked) setDraftSlug(slugify(e.target.value));
            }}
          />
          <TextInput
            label="Slug"
            name="slug"
            placeholder="luxury"
            required
            hint="Auto-suggested from name. Typing your own locks it. Lowercase letters, numbers and dashes."
            value={draftSlug}
            onChange={(e) => {
              setDraftSlug(e.target.value);
              setSlugLocked(true);
            }}
          />
          <Textarea label="Description" name="description" rows={2} />
          <Button type="submit" loading={busy} fullWidth>Create tag</Button>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => { setDirty(false); setEditing(null); }} title="Edit tag" icon="edit" blockBackdropClose={dirty}>
        {editing && (
          <form onSubmit={save} onInput={() => setDirty(true)} className="flex flex-col gap-4">
            <TextInput label="Name" name="name" defaultValue={editing.name} required />
            <TextInput label="Slug" name="slug" defaultValue={editing.slug} required />
            <Textarea label="Description" name="description" defaultValue={editing.description ?? ""} rows={2} />
            <Button type="submit" loading={busy} fullWidth>Save changes</Button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => { if (!busy) setDeleting(null); }}
        title="Delete tag"
        icon="delete"
        size="sm"
        blockBackdropClose={busy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" icon="delete" loading={busy} onClick={() => void remove()}>Delete</Button>
          </>
        }
      >
        {deleting && (
          <div className="flex flex-col gap-3">
            <p className="font-body-md text-on-surface">
              Are you sure you want to delete <span className="font-semibold">“{deleting.name}”</span>?
            </p>
            <p className="font-body-sm text-on-surface-variant">
              Templates using this tag keep the name but it will no longer be suggested.
            </p>
            <p className="font-body-sm font-semibold text-error">This action cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}