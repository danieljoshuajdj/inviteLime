"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { TextInput, Textarea, FieldWrap, Select } from "@/components/shared/Field";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";
import { EVENT_CATEGORIES, formTypeFromCategorySlug } from "@/lib/builder/forms";

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  templateCount: number;
}

/** The four slugs that define the builder's event forms (see forms.ts). */
function isBuiltIn(slug: string): boolean {
  return formTypeFromCategorySlug(slug) !== null;
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
  // Create form: the category is chosen from the built-in event forms, so its
  // slug (and therefore its form) can never be arbitrary.
  const [draftName, setDraftName] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  // Edit form: only a legacy, non-event slug that still matches its name
  // follows renames. Built-in slugs are fixed.
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSlugLocked, setEditSlugLocked] = useState(false);

  const missing = EVENT_CATEGORIES.filter(
    (category) => !rows.some((row) => row.slug === category.slug)
  );

  function openCreate() {
    setDirty(false);
    const first = missing[0];
    setDraftName(first?.name ?? "");
    setDraftSlug(first?.slug ?? "");
    setCreating(true);
  }

  function openEdit(category: CategoryRow) {
    setDirty(false);
    setEditName(category.name);
    setEditSlug(category.slug);
    setEditSlugLocked(isBuiltIn(category.slug) || category.slug !== slugify(category.name));
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
          slug: draftSlug,
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
      const slug = slugify(editSlug);
      const res = await fetch(`/api/admin/categories/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          // A built-in slug is fixed: it selects the builder form, and the API
          // rejects arbitrary replacements. Send it only when a legacy row's
          // slug was actually edited.
          ...(slug !== editing.slug ? { slug } : {}),
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
          <p className="mt-1 max-w-2xl font-body-sm text-on-surface-variant">
            The four event categories decide which builder form a template opens. Their
            slugs are fixed, and each template belongs to exactly one of them.
          </p>
        </div>
        <Button icon="add" onClick={openCreate} disabled={missing.length === 0}>
          {missing.length === 0 ? "All categories present" : "Add missing category"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-on-surface-variant">
            No categories yet. Add the four event categories to organize your template library.
          </p>
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
                {!isBuiltIn(c.slug) && (
                  <Button variant="danger" size="sm" icon="delete" onClick={() => setDeleting(c)}>Delete</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => { setDirty(false); setCreating(false); }} title="New category" icon="category" blockBackdropClose={dirty}>
        <form onSubmit={create} onInput={() => setDirty(true)} className="flex flex-col gap-4">
          <Select
            label="Event category"
            name="category"
            required
            value={draftSlug}
            placeholder="Select an event category"
            options={missing.map((category) => ({
              value: category.slug,
              label: category.name,
            }))}
            hint="The category determines which builder form every template in it uses."
            onChange={(e) => {
              const slug = (e.target as HTMLSelectElement).value;
              setDraftSlug(slug);
              setDraftName(EVENT_CATEGORIES.find((category) => category.slug === slug)?.name ?? "");
            }}
          />
          <TextInput
            label="Display name"
            name="name"
            placeholder="e.g. Birthday Celebration"
            required
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
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
              disabled={isBuiltIn(editing.slug)}
              hint={
                isBuiltIn(editing.slug)
                  ? "Fixed — the slug selects the builder form this category opens."
                  : "Follows the name unless it was set manually. Lowercase letters, numbers and dashes."
              }
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