"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { TextInput, Textarea, FieldWrap } from "@/components/shared/Field";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  templateCount: number;
}

/**
 * ASCII slug matching the categories API rule (`^[a-z0-9-]+$`). Deliberately
 * not the shared `@/lib/utils` slugify: that one keeps Devanagari, which the
 * category endpoint rejects today.
 */
function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CategoriesManager({ categories }: { categories: CategoryRow[] }) {
  const [rows, setRows] = useState(categories);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Create form: the slug trails the name until the admin types their own.
  const [draftName, setDraftName] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [slugLocked, setSlugLocked] = useState(false);
  // Edit form: only a slug that still matches its name follows renames — a
  // hand-written slug must not be overwritten by accident.
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSlugLocked, setEditSlugLocked] = useState(false);

  function openCreate() {
    setDirty(false);
    setDraftName("");
    setDraftSlug("");
    setSlugLocked(false);
    setCreating(true);
  }

  function openEdit(category: CategoryRow) {
    setDirty(false);
    setEditName(category.name);
    setEditSlug(category.slug);
    setEditSlugLocked(category.slug !== slugify(category.name));
    setEditing(category);
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          slug: slugify(draftSlug),
          description: String(fd.get("description") ?? ""),
        }),
      });
      const json = (await res.json()) as { error?: string; category?: CategoryRow };
      if (!res.ok) throw new Error(json.error ?? "Create failed");
      setRows((rs) => [...rs, json.category!].sort((a, b) => a.name.localeCompare(b.name)));
      toast("Category created");
      setCreating(false);
      setDirty(false);
      setDraftName("");
      setDraftSlug("");
      setSlugLocked(false);
    } catch (err) {
      toast("Could not create category", (err as Error).message);
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
      const res = await fetch(`/api/admin/categories/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          slug: slugify(editSlug),
          description: String(fd.get("description") ?? ""),
        }),
      });
      const json = (await res.json()) as { error?: string; category?: CategoryRow };
      if (!res.ok) throw new Error(json.error ?? "Update failed");
      setRows((rs) => rs.map((r) => (r.id === editing.id ? { ...r, ...json.category! } : r)));
      toast("Category updated");
      setEditing(null);
      setDirty(false);
    } catch (err) {
      toast("Could not update category", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    const row = deleting;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/categories/${row.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast("Category deleted");
      setDeleting(null);
    } catch (err) {
      toast("Could not delete category", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Library</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Categories</h1>
        </div>
        <Button icon="add" onClick={openCreate}>New category</Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-on-surface-variant">No categories yet. Create the first one to organize your template library.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-outline-variant bg-surface p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                <Icon name="category" size="md" weight="w400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-heading-md font-semibold !text-on-surface">{c.name}</p>
                <p className="font-body-xs text-on-surface-variant">
                  /{c.slug} · {c.templateCount} template{c.templateCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" icon="edit" onClick={() => openEdit(c)}>Edit</Button>
                <Button variant="danger" size="sm" icon="delete" onClick={() => setDeleting(c)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => { setDirty(false); setCreating(false); }} title="New category" icon="category" blockBackdropClose={dirty}>
        <form onSubmit={create} onInput={() => setDirty(true)} className="flex flex-col gap-4">
          <TextInput
            label="Name"
            name="name"
            placeholder="e.g. Villa destination"
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
            placeholder="villa-destination"
            required
            hint="Auto-filled from the name. Typing your own locks it. Lowercase letters, numbers and dashes."
            value={draftSlug}
            onChange={(e) => {
              setDraftSlug(e.target.value);
              setSlugLocked(true);
            }}
          />
          <Textarea label="Description" name="description" rows={2} />
          <FieldWrap>
            <Button type="submit" loading={busy} fullWidth>Create category</Button>
          </FieldWrap>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => { setDirty(false); setEditing(null); }} title="Edit category" icon="edit" blockBackdropClose={dirty}>
        {editing && (
          <form onSubmit={save} onInput={() => setDirty(true)} className="flex flex-col gap-4">
            <TextInput
              label="Name"
              name="name"
              required
              value={editName}
              onChange={(e) => {
                setEditName(e.target.value);
                if (!editSlugLocked) setEditSlug(slugify(e.target.value));
              }}
            />
            <TextInput
              label="Slug"
              name="slug"
              required
              hint="Follows the name unless it was set manually. Lowercase letters, numbers and dashes."
              value={editSlug}
              onChange={(e) => {
                setEditSlug(e.target.value);
                setEditSlugLocked(true);
              }}
            />
            <Textarea label="Description" name="description" defaultValue={editing.description ?? ""} rows={2} />
            <FieldWrap>
              <Button type="submit" loading={busy} fullWidth>Save changes</Button>
            </FieldWrap>
          </form>
        )}
      </Modal>
      <Modal
        open={!!deleting}
        onClose={() => { if (!busy) setDeleting(null); }}
        title="Delete category"
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
              {deleting.templateCount > 0
                ? `${deleting.templateCount} template${deleting.templateCount === 1 ? "" : "s"} use this category. They keep their data but will lose this tag.`
                : "Templates keep their data but will lose this tag."}
            </p>
            <p className="font-body-sm font-semibold text-error">This action cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}