"use client";

import { useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Icon, type IconName } from "@/components/shared/Icon";
import { TextInput, Select, Textarea, MultiSelect } from "@/components/shared/Field";
import { Modal } from "@/components/shared/Modal";
import { cn, formatPrice, slugify } from "@/lib/utils";
import { toast } from "@/components/account/toast";
// Client-safe module: importing the media-packs service would pull the storage
// client (and its `server-only` guard) into the browser bundle.
import {
  demoDetailPackCouple,
  mediaPackMatchesForm,
  musicTrackInCategory,
  type DemoDetailPack,
  type MediaPack,
  type MusicTrack,
} from "@/lib/library-media";
import {
  categorySlugForFormType,
  formDefinition,
  formTypeFromCategorySlug,
  formTypeOrDefault,
  type FormType,
} from "@/lib/builder/forms";

interface ValidationCheck {
  name: string;
  passed: boolean;
  warning?: boolean;
  message?: string;
}

interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checks: ValidationCheck[];
  unusedAssets: string[];
}

interface UploadResponse {
  ok?: boolean;
  version?: string;
  versionId?: string;
  status?: string;
  files?: number;
  validation?: ValidationResult;
  error?: string;
  message?: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Tag {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  pricePaise: number;
  currency: string;
  active: boolean;
}

interface TemplatesManagerProps {
  templates: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    status: "active" | "disabled" | "draft";
    /** Event form derived from the template's single category. */
    formType?: string;
    thumbnailUrl: string | null;
    product: { id: string; name: string; pricePaise: number; currency: string; active: boolean } | null;
    currentVersion: string | null;
    versionCount: number;
    activeInvitations: number;
    totalInvitations: number;
    categories: string[];
    /** Demo media pack assigned to the template, if any. */
    mediaPackId: string | null;
    mediaPackName: string | null;
    /** Demo details pack (couple, venue, events, dress code) assigned, if any. */
    demoDetailPackId: string | null;
    demoDetailPackName: string | null;
    /** Background song assigned to the demo, if any. */
    musicTrackId: string | null;
    musicTrackName: string | null;
  }>;
  categories: Category[];
  products: Product[];
  tags: Tag[];
  /** Packs from the Media tab, offered in the wizard's Demo Content step. */
  mediaPacks: MediaPack[];
  /** Packs from the Details tab. */
  detailPacks: DemoDetailPack[];
  /** Tracks from the Music tab. */
  musicTracks: MusicTrack[];
}

/** "Title — Artist" (or just the title) for selects and summaries. */
function musicTrackLabel(track: { title: string; artist: string | null } | null | undefined): string | null {
  if (!track) return null;
  return track.artist ? `${track.title} — ${track.artist}` : track.title;
}

/** The builder form of a category, or null for one outside the fixed taxonomy. */
function formTypeForCategoryId(
  categoryId: string | null,
  categories: Category[]
): FormType | null {
  if (!categoryId) return null;
  return formTypeFromCategorySlug(categories.find((category) => category.id === categoryId)?.slug);
}

/** One titled block of the single add-template form. */
function FormSection({
  id,
  title,
  description,
  icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`template-section-${id}`}
      className="scroll-mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
    >
      <div className="mb-3 flex items-start gap-2">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon name={icon} size="sm" />
        </span>
        <div className="min-w-0">
          <h3 className="font-body-sm font-semibold text-on-surface">{title}</h3>
          <p className="mt-0.5 font-body-xs text-on-surface-variant">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

interface FormData {
  name: string;
  slug: string;
  description: string;
  status: "draft" | "active" | "disabled";
  tags: string[];
  product_id: string | null;
  price_paise: number | null;
  currency: string;
  category_id: string | null;
  zip: File | null;
  thumbnail: File | null;
  media_pack_id: string | null;
  demo_detail_pack_id: string | null;
  music_track_id: string | null;
}

/** A blank add-template form. */
function emptyWizardData(): FormData {
  return {
    name: "",
    slug: "",
    description: "",
    status: "draft",
    tags: [],
    product_id: null,
    price_paise: null,
    currency: "INR",
    category_id: null,
    zip: null,
    thumbnail: null,
    media_pack_id: null,
    demo_detail_pack_id: null,
    music_track_id: null,
  };
}

/** The section a failed field lives in, used to scroll the form to it. */
const ERROR_SECTION: Partial<Record<keyof FormData, string>> = {
  name: "basic-info",
  slug: "basic-info",
  price_paise: "pricing",
  currency: "pricing",
  category_id: "categories",
  zip: "package",
  thumbnail: "package",
};

export function TemplatesManager({
  templates,
  categories,
  products,
  tags,
  mediaPacks,
  detailPacks,
  musicTracks,
}: TemplatesManagerProps) {
  const [rows, setRows] = useState(templates);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [thumbnailUploading, setThumbnailUploading] = useState<string | null>(null);
  // Selected demo sources in the manage panel, for the single expanded row.
  const [mediaDraft, setMediaDraft] = useState<string>("");
  const [detailDraft, setDetailDraft] = useState<string>("");
  const [musicDraft, setMusicDraft] = useState<string>("");
  const [demoSaving, setDemoSaving] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardData, setWizardData] = useState<FormData>(emptyWizardData());
  const [wizardErrors, setWizardErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ templateId: string; result: UploadResponse } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof templates)[number] | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Demo content is category-specific: only songs offered in the selected
  // category and detail packs authored for its form are available.
  const wizardFormType = formTypeForCategoryId(wizardData.category_id, categories);
  const wizardCategorySlug = wizardFormType ? categorySlugForFormType(wizardFormType) : null;
  const wizardMusicTracks = wizardCategorySlug
    ? musicTracks.filter((track) => musicTrackInCategory(track, wizardCategorySlug))
    : [];
  const wizardDetailPacks = wizardFormType
    ? detailPacks.filter((pack) => pack.formType === wizardFormType)
    : [];
  const wizardMediaPacks = wizardFormType
    ? mediaPacks.filter((pack) => mediaPackMatchesForm(pack, wizardFormType))
    : [];

  /** Clears a field error as soon as the admin starts fixing that field. */
  function clearError(key: keyof FormData) {
    setWizardErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }

  /** Validates every section at once — there are no more per-step gates. */
  function validateForm(): boolean {
    const errors: Partial<Record<keyof FormData, string>> = {};

    const name = wizardData.name.trim();
    if (!name) errors.name = "Template name is required";
    else if (name.length < 2) errors.name = "Template name must be at least 2 characters";

    const slug = wizardData.slug.trim();
    if (!slug) errors.slug = "Slug is required";
    else if (slug.length < 2) errors.slug = "Slug must be at least 2 characters";
    else if (!/^[a-z0-9-]+$/.test(slug)) {
      errors.slug = "Slug must be lowercase letters, numbers, and dashes only";
    }

    if (!wizardData.product_id && wizardData.price_paise === null) {
      errors.price_paise = "Enter a price or select an existing product";
    } else if (wizardData.price_paise !== null && wizardData.price_paise < 0) {
      errors.price_paise = "Price cannot be negative";
    }
    if (!/^[A-Z]{3}$/.test(wizardData.currency)) {
      errors.currency = "Currency must be a 3-letter code, e.g. INR";
    }

    if (!wizardData.category_id) errors.category_id = "Select an event category";

    if (!wizardData.zip) errors.zip = "A .zip package is required";
    else if (!wizardData.zip.name.toLowerCase().endsWith(".zip")) {
      errors.zip = "Package must be a .zip file";
    } else if (wizardData.zip.size > 60 * 1024 * 1024) {
      errors.zip = "Package exceeds 60 MB limit";
    }

    if (wizardData.thumbnail && !/^image\/(png|jpe?g|webp)$/.test(wizardData.thumbnail.type)) {
      errors.thumbnail = "Thumbnail must be PNG, JPEG, or WebP";
    }

    setWizardErrors(errors);
    const firstError = (Object.keys(errors) as (keyof FormData)[]).find(
      (key) => ERROR_SECTION[key]
    );
    if (firstError) {
      const sectionId = `template-section-${ERROR_SECTION[firstError]}`;
      requestAnimationFrame(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      toast("Check the form", "Fix the highlighted fields before creating the template.");
    }
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (wizardLoading) return;
    if (!validateForm()) return;

    setWizardLoading(true);
    try {
      // Create the template once per attempt. Reusing its id on a retry means
      // fixing a rejected package never hits a slug conflict.
      let templateId: string;
      if (createdTemplateId) {
        templateId = createdTemplateId;
      } else {
        const res = await fetch("/api/admin/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: wizardData.name.trim(),
            slug: wizardData.slug.trim().toLowerCase(),
            description: wizardData.description.trim() || null,
            status: wizardData.status,
            product_id: wizardData.product_id,
            price_paise: wizardData.price_paise,
            currency: wizardData.currency.toUpperCase(),
            tags: wizardData.tags,
            category_ids: wizardData.category_id ? [wizardData.category_id] : [],
            media_pack_id: wizardData.media_pack_id,
            demo_detail_pack_id: wizardData.demo_detail_pack_id,
            music_track_id: wizardData.music_track_id,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Create failed");

        templateId = json.template.id;
        setCreatedTemplateId(templateId);
        appendTemplateRow(templateId, json.template.product_id ?? null);
      }

      // Upload the package. A 422 keeps the form open so the package can be
      // fixed and submitted again; the template draft is already created.
      const fd = new FormData();
      fd.append("file", wizardData.zip!);
      if (wizardData.thumbnail) fd.append("thumbnail", wizardData.thumbnail);
      const uploadRes = await fetch(`/api/admin/templates/${templateId}/package`, { method: "POST", body: fd });
      const uploadJson = await uploadRes.json();

      if (uploadRes.status === 422 && uploadJson.validation) {
        setValidationResult({ templateId, result: uploadJson });
        toast("Validation failed", "Fix the package errors, then submit again");
        return;
      }
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? "Upload failed");

      // Success: close the form and leave the validation report on screen so
      // the admin can review it and publish the new version.
      setValidationResult({ templateId, result: uploadJson });
      setRows((rs) => rs.map((r) => (r.id === templateId ? { ...r, versionCount: r.versionCount + 1 } : r)));
      toast(`v${uploadJson.version} uploaded as draft`, "Review validation results, then publish");
      finishWizard();
    } catch (err) {
      toast("Create failed", (err as Error).message);
    } finally {
      setWizardLoading(false);
    }
  }

  // Add a freshly created template to the visible list so the user sees it
  // without reloading. Product/usage details are best-effort until refresh.
  function appendTemplateRow(templateId: string, productId: string | null) {
    setRows((rs) => {
      if (rs.some((r) => r.id === templateId)) return rs;
      const linked = productId ? products.find((p) => p.id === productId) ?? null : null;
      const product =
        linked ?? (wizardData.price_paise !== null && wizardData.price_paise !== undefined
          ? {
              id: productId ?? "",
              name: `Template – ${wizardData.price_paise / 100}`,
              pricePaise: wizardData.price_paise,
              currency: wizardData.currency,
              active: true,
            }
          : null);
      return [
        {
          id: templateId,
          name: wizardData.name.trim(),
          slug: wizardData.slug.trim().toLowerCase(),
          description: wizardData.description.trim() || null,
          status: wizardData.status,
          formType: wizardFormType ?? undefined,
          thumbnailUrl: null,
          product,
          currentVersion: null,
          versionCount: 0,
          activeInvitations: 0,
          totalInvitations: 0,
          categories: categories
            .filter((category) => category.id === wizardData.category_id)
            .map((category) => category.name),
          mediaPackId: wizardData.media_pack_id,
          mediaPackName: wizardData.media_pack_id
            ? mediaPacks.find((p) => p.id === wizardData.media_pack_id)?.name ?? null
            : null,
          demoDetailPackId: wizardData.demo_detail_pack_id,
          demoDetailPackName: wizardData.demo_detail_pack_id
            ? detailPacks.find((p) => p.id === wizardData.demo_detail_pack_id)?.name ?? null
            : null,
          musicTrackId: wizardData.music_track_id,
          musicTrackName: musicTrackLabel(
            musicTracks.find((t) => t.id === wizardData.music_track_id)
          ),
        },
        ...rs,
      ];
    });
  }

  /** Clears the add form but leaves the page state untouched. */
  function resetWizard() {
    setWizardOpen(false);
    setCreatedTemplateId(null);
    setWizardData(emptyWizardData());
    setWizardErrors({});
  }

  function closeWizard() {
    resetWizard();
    setValidationResult(null);
  }

  /** Successful submit: close the form but keep its validation report open. */
  function finishWizard() {
    resetWizard();
  }

  // --- Existing template management functions ---
  async function api(id: string, body: Record<string, unknown>, method = "PATCH") {
    const res = await fetch(`/api/admin/templates/${id}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json.template;
  }

  async function setStatus(id: string, status: string) {
    setSaving(true);
    try {
      await api(id, { status });
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: status as typeof r.status } : r)));
      toast("Status updated");
    } catch (e) { toast("Update failed", (e as Error).message); }
    finally { setSaving(false); }
  }

  async function savePrice(id: string, pricePaise: number) {
    setSaving(true);
    try {
      await api(id, { price_paise: pricePaise });
      setRows((rs) => rs.map((r) => (r.id === id && r.product ? { ...r, product: { ...r.product, pricePaise } } : r)));
      toast("Price saved");
    } catch (e) { toast("Price update failed", (e as Error).message); }
    finally { setSaving(false); }
  }

  /** Assigns demo sources. Every picker change saves immediately. */
  async function saveDemoContent(
    id: string,
    patch: { mediaPackId?: string; detailPackId?: string; musicTrackId?: string }
  ) {
    const mediaPackId =
      patch.mediaPackId !== undefined ? patch.mediaPackId : mediaDraft;
    const detailPackId =
      patch.detailPackId !== undefined ? patch.detailPackId : detailDraft;
    const musicTrackId =
      patch.musicTrackId !== undefined ? patch.musicTrackId : musicDraft;

    setDemoSaving(true);
    try {
      await api(id, {
        media_pack_id: mediaPackId || null,
        demo_detail_pack_id: detailPackId || null,
        music_track_id: musicTrackId || null,
      });
      setRows((rs) => rs.map((r) => (r.id === id
        ? {
            ...r,
            mediaPackId: mediaPackId || null,
            mediaPackName: mediaPackId ? mediaPacks.find((p) => p.id === mediaPackId)?.name ?? null : null,
            demoDetailPackId: detailPackId || null,
            demoDetailPackName: detailPackId
              ? detailPacks.find((p) => p.id === detailPackId)?.name ?? null
              : null,
            musicTrackId: musicTrackId || null,
            musicTrackName: musicTrackId
              ? musicTrackLabel(musicTracks.find((t) => t.id === musicTrackId))
              : null,
          }
        : r)));
      toast("Demo content saved");
    } catch (e) {
      // The picker changed before the request; put it back on the saved value.
      const current = rows.find((row) => row.id === id);
      if (patch.mediaPackId !== undefined) setMediaDraft(current?.mediaPackId ?? "");
      if (patch.detailPackId !== undefined) setDetailDraft(current?.demoDetailPackId ?? "");
      if (patch.musicTrackId !== undefined) setMusicDraft(current?.musicTrackId ?? "");
      toast("Demo content update failed", (e as Error).message);
    } finally {
      setDemoSaving(false);
    }
  }

  async function publishVersion(templateId: string, versionId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/templates/${templateId}/versions/${versionId}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Publish failed");
      setRows((rs) => rs.map((r) => r.id === templateId ? { ...r, currentVersion: json.version ?? r.currentVersion, status: "active" } : r));
      setValidationResult(null);
      toast(`v${json.version} published`, "Template is now live for new invitations");
    } catch (e) { toast("Publish failed", (e as Error).message); }
    finally { setSaving(false); }
  }

  async function uploadPackage(id: string, files: { zip?: File; thumbnail?: File }) {
    if (!files.zip) return toast("Pick a .zip file first");
    setUploading(id);
    setValidationResult(null);
    try {
      const fd = new FormData();
      fd.append("file", files.zip);
      if (files.thumbnail) fd.append("thumbnail", files.thumbnail);
      const res = await fetch(`/api/admin/templates/${id}/package`, { method: "POST", body: fd });
      const json = await res.json();

      if (res.status === 422 && json.validation) {
        setValidationResult({ templateId: id, result: json });
        toast("Validation failed", "Fix errors before uploading");
        return;
      }
      if (!res.ok) throw new Error(json.error ?? "Upload failed");

      setValidationResult({ templateId: id, result: json });
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, versionCount: r.versionCount + 1 } : r)));
      toast(`v${json.version} uploaded as draft`, "Review validation results, then publish");
    } catch (e) { toast("Upload failed", (e as Error).message); }
    finally { setUploading(null); }
  }

  async function uploadThumbnail(id: string, file: File) {
    setThumbnailUploading(id);
    try {
      const fd = new FormData();
      fd.append("thumbnail", file);
      const res = await fetch(`/api/admin/templates/${id}/thumbnail`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Thumbnail upload failed");

      setRows((rs) =>
        rs.map((r) =>
          r.id === id ? { ...r, thumbnailUrl: json.thumbnailUrl ?? r.thumbnailUrl } : r
        )
      );
      toast("Thumbnail updated", "The new image now appears on the template cards");
    } catch (e) {
      toast("Thumbnail upload failed", (e as Error).message);
    } finally {
      setThumbnailUploading(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/templates/${deleteTarget.id}`, { method: "DELETE" });
      const json = await res.json();
      if (res.status === 409) throw new Error(json.error ?? "Template is in use and cannot be deleted");
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setRows((rs) => rs.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast(
        "Template deleted",
        `Removed ${json.versionsDeleted ?? 0} version(s), ${json.objectsDeleted ?? 0} stored object(s), and any demo media used only by this template`
      );
    } catch (e) { toast("Delete failed", (e as Error).message); }
    finally { setDeleting(false); }
  }

  // --- Render ---
  const availableProducts = products.filter((p) => p.active);
  const productOptions = [
    { value: "", label: "— Create new from price below —" },
    ...availableProducts.map((p) => ({
      value: p.id,
      label: `${p.name} — ${formatPrice(p.pricePaise, p.currency)}`,
    })),
  ];

  // Only block backdrop dismissal while the user has actually entered data.
  const wizardDirty =
    wizardData.name.trim() !== "" ||
    wizardData.slug.trim() !== "" ||
    wizardData.description.trim() !== "" ||
    wizardData.status !== "draft" ||
    wizardData.tags.length > 0 ||
    wizardData.product_id !== null ||
    wizardData.price_paise !== null ||
    wizardData.currency !== "INR" ||
    wizardData.category_id !== null ||
    wizardData.zip !== null ||
    wizardData.thumbnail !== null ||
    wizardData.media_pack_id !== null ||
    wizardData.demo_detail_pack_id !== null ||
    wizardData.music_track_id !== null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Library</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Templates</h1>
        </div>
        <div className="flex items-center gap-2">
          <p className="font-body-xs text-on-surface-variant">{rows.length} templates</p>
          <Button onClick={() => setWizardOpen(true)} icon="add">
            New Template
          </Button>
        </div>
      </div>

      {/* Add Template form */}
      <Modal open={wizardOpen} onClose={closeWizard} title="Add Template" icon="add_circle" size="xl" blockBackdropClose={wizardDirty}>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <FormSection
            id="basic-info"
            title="Basic Info"
            description="Name, slug, description, status, and tags shown in the library."
            icon="info"
          >
              <div className="flex flex-col gap-4">
                <TextInput
                  label="Name"
                  name="name"
                  value={wizardData.name}
                  onChange={(e) => {
                    const newName = (e.target as HTMLInputElement).value;
                    setWizardData((p) => ({
                      ...p,
                      name: newName,
                      // Only auto-update slug if it still matches the slugified previous name
                      // (meaning the user hasn't manually edited it)
                      slug: p.slug === slugify(p.name) ? slugify(newName) : p.slug,
                    }));
                    clearError("name");
                  }}
                  placeholder="e.g. Royal Mughal Palace"
                  required
                  error={wizardErrors.name}
                />
                <TextInput
                  label="Slug"
                  name="slug"
                  value={wizardData.slug}
                  onChange={(e) => {
                    setWizardData((p) => ({ ...p, slug: (e.target as HTMLInputElement).value.toLowerCase() }));
                    clearError("slug");
                  }}
                  placeholder="auto-generated from name"
                  hint="Lowercase letters, numbers, and dashes only"
                  required
                  error={wizardErrors.slug}
                />
                <Textarea
                  label="Description"
                  name="description"
                  value={wizardData.description}
                  onChange={(e) => setWizardData((p) => ({ ...p, description: (e.target as HTMLTextAreaElement).value }))}
                  rows={3}
                  placeholder="Brief description of the template..."
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Status"
                    name="status"
                    value={wizardData.status}
                    onChange={(e) => setWizardData((p) => ({ ...p, status: (e.target as HTMLSelectElement).value as FormData["status"] }))}
                    options={[
                      { value: "draft", label: "Draft" },
                      { value: "active", label: "Active" },
                      { value: "disabled", label: "Disabled" },
                    ]}
                  />
                  <MultiSelect
                    label="Tags (optional)"
                    value={wizardData.tags}
                    onChange={(v: string[]) => setWizardData((p) => ({ ...p, tags: v }))}
                    options={tags.map((t) => ({ value: t.name, label: t.name }))}
                    placeholder="Add tags..."
                    emptyText="No tags found"
                  />
                </div>
              </div>
          </FormSection>

          <FormSection
            id="pricing"
            title="Pricing"
            description="Link an existing product or create one from a new price."
            icon="dashboard"
          >
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Existing Product (optional)"
                    name="product_id"
                    value={wizardData.product_id ?? ""}
                    onChange={(e) => {
                      setWizardData((p) => ({ ...p, product_id: (e.target as HTMLSelectElement).value || null, price_paise: null }));
                      clearError("price_paise");
                    }}
                    options={productOptions}
                    placeholder="Select a product"
                  />
                  <TextInput
                    label="New Price (₹)"
                    type="number"
                    min="0"
                    step="100"
                    value={wizardData.price_paise ? (wizardData.price_paise / 100).toFixed(0) : ""}
                    onChange={(e) => {
                      const n = Number((e.target as HTMLInputElement).value);
                      setWizardData((p) => ({ ...p, price_paise: Number.isNaN(n) ? null : Math.round(n * 100), product_id: null }));
                      clearError("price_paise");
                    }}
                    placeholder="e.g. 1499"
                    error={wizardErrors.price_paise}
                  />
                  <TextInput
                    label="Currency"
                    value={wizardData.currency}
                    onChange={(e) => {
                      setWizardData((p) => ({ ...p, currency: (e.target as HTMLInputElement).value.toUpperCase() }));
                      clearError("currency");
                    }}
                    maxLength={3}
                    error={wizardErrors.currency}
                  />
                </div>
              </div>
          </FormSection>

          <FormSection
            id="categories"
            title="Categories"
            description="Choose the single event category that decides which builder form customers fill in."
            icon="category"
          >
              <div className="flex flex-col gap-4">
                <Select
                  label="Event category"
                  value={wizardData.category_id ?? ""}
                  onChange={(e) => {
                    const value = (e.target as HTMLSelectElement).value || null;
                    const nextForm = formTypeForCategoryId(value, categories);
                    const nextSlug = nextForm ? categorySlugForFormType(nextForm) : null;
                    setWizardData((p) => {
                      // Keep the current demo picks only when they still belong
                      // to the newly selected category.
                      const track = p.music_track_id
                        ? musicTracks.find((item) => item.id === p.music_track_id)
                        : null;
                      const detailPack = p.demo_detail_pack_id
                        ? detailPacks.find((item) => item.id === p.demo_detail_pack_id)
                        : null;
                      const mediaPack = p.media_pack_id
                        ? mediaPacks.find((item) => item.id === p.media_pack_id)
                        : null;
                      return {
                        ...p,
                        category_id: value,
                        music_track_id:
                          track && nextSlug && musicTrackInCategory(track, nextSlug)
                            ? p.music_track_id
                            : null,
                        demo_detail_pack_id:
                          detailPack && nextForm && detailPack.formType === nextForm
                            ? p.demo_detail_pack_id
                            : null,
                        media_pack_id:
                          mediaPack && mediaPackMatchesForm(mediaPack, nextForm)
                            ? p.media_pack_id
                            : null,
                      };
                    });
                    if (value) clearError("category_id");
                  }}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select an event category"
                  error={wizardErrors.category_id}
                  hint="Demo photos, songs and sample details are filtered to this category."
                  required
                />
              </div>
          </FormSection>

          <FormSection
            id="package"
            title="Package"
            description="Upload the template ZIP and an optional thumbnail."
            icon="inventory_2"
          >
              <div className="flex flex-col gap-4">
                <p className="font-body-xs text-on-surface-variant">
                  The package must contain <code className="font-mono">index.html</code> and <code className="font-mono">manifest.json</code> at its root.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-body-xs font-semibold text-on-surface-variant">Package (.zip) *</span>
                    <input
                      type="file"
                      accept=".zip"
                      className="mt-1 block w-full cursor-pointer rounded-lg border border-outline-variant bg-surface p-2 text-sm"
                      onChange={(e) => {
                        setWizardData((p) => ({ ...p, zip: e.target.files?.[0] ?? null }));
                        clearError("zip");
                      }}
                    />
                    {wizardErrors.zip && <p className="mt-1 font-body-xs text-error">{wizardErrors.zip}</p>}
                    {wizardData.zip && <p className="mt-1 font-body-xs text-success">Selected: {wizardData.zip.name} ({Math.round(wizardData.zip.size / 1024)} KB)</p>}
                  </label>
                  <label className="block">
                    <span className="font-body-xs font-semibold text-on-surface-variant">Thumbnail (PNG/JPEG/WebP)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="mt-1 block w-full cursor-pointer rounded-lg border border-outline-variant bg-surface p-2 text-sm"
                      onChange={(e) => {
                        setWizardData((p) => ({ ...p, thumbnail: e.target.files?.[0] ?? null }));
                        clearError("thumbnail");
                      }}
                    />
                    {wizardErrors.thumbnail && <p className="mt-1 font-body-xs text-error">{wizardErrors.thumbnail}</p>}
                    {wizardData.thumbnail && <p className="mt-1 font-body-xs text-success">Selected: {wizardData.thumbnail.name}</p>}
                  </label>
                </div>
              </div>
          </FormSection>

          <FormSection
            id="demo-content"
            title="Demo Content"
            description="Pick the sample photos, details, and background song the demo renders. Live invitations always show the customer's own content."
            icon="auto_awesome"
          >
              <div className="flex flex-col gap-4">
                <p className="font-body-sm font-semibold text-on-surface">Sample photos</p>

                <button
                  type="button"
                  onClick={() => setWizardData((p) => ({ ...p, media_pack_id: null }))}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                    wizardData.media_pack_id === null
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-outline-variant hover:bg-surface-container"
                  )}
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
                    <Icon name="inventory_2" size="md" weight="w400" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-body-sm font-semibold !text-on-surface">
                      None — use images bundled in the package
                    </span>
                    <span className="mt-0.5 block font-body-xs text-on-surface-variant">
                      The demo renders the template&apos;s own placeholder images, if the package ships any.
                    </span>
                  </span>
                  {wizardData.media_pack_id === null && (
                    <Icon name="check_circle" size="sm" className="text-primary" />
                  )}
                </button>

                {!wizardFormType ? (
                  <p className="rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                    Select an event category above to see its media packs.
                  </p>
                ) : wizardMediaPacks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                    No {formDefinition(wizardFormType).label.toLowerCase()} media packs yet.
                    Create one in the Media tab (Library → Media), upload its photos, then come
                    back to assign it.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {wizardMediaPacks.map((pack) => {
                      const selected = wizardData.media_pack_id === pack.id;
                      const counts = { bride: 0, groom: 0, couple: 0, gallery: 0 };
                      for (const item of pack.items) counts[item.role]++;
                      const previewUrls = (["groom", "bride", "couple"] as const)
                        .map((role) => pack.items.find((i) => i.role === role)?.url)
                        .filter(Boolean) as string[];
                      const coupleFormPack =
                        pack.formType === "wedding" || pack.formType === "engagement";
                      return (
                        <button
                          key={pack.id}
                          type="button"
                          onClick={() => setWizardData((p) => ({ ...p, media_pack_id: pack.id }))}
                          className={cn(
                            "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                            selected
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-outline-variant hover:bg-surface-container"
                          )}
                        >
                          <span className="grid h-16 w-16 flex-shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-lg bg-surface-container">
                            {previewUrls.length === 0 ? (
                              <span className="col-span-2 row-span-2 flex items-center justify-center text-on-surface-variant">
                                <Icon name="image" size="sm" weight="w400" />
                              </span>
                            ) : (
                              previewUrls.slice(0, 4).map((url, idx) => (
                                <img key={idx} src={url} alt="" className="h-full w-full object-cover" />
                              ))
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-body-sm font-semibold !text-on-surface">
                              {pack.name}
                            </span>
                            <span className="mt-0.5 block font-body-xs text-on-surface-variant">
                              {coupleFormPack ? (
                                <>
                                  {counts.groom ? "groom" : "no groom"} ·{" "}
                                  {counts.bride ? "bride" : "no bride"} ·{" "}
                                  {counts.couple ? "couple" : "no couple"}
                                </>
                              ) : (
                                <>{counts.couple ? "main photo" : "no main photo"}</>
                              )}{" "}
                              · {counts.gallery} gallery photo{counts.gallery === 1 ? "" : "s"}
                            </span>
                          </span>
                          {selected && <Icon name="check_circle" size="sm" className="text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Background song: one track per template, played by the demo. */}
                <div className="border-t border-outline-variant pt-4">
                  <p className="font-body-sm font-semibold text-on-surface">Background song</p>
                  <p className="mt-1 font-body-xs text-on-surface-variant">
                    Adds a music control to the demo. Only songs offered in the selected category
                    appear here; manage them in the Music tab.
                  </p>
                  {!wizardFormType ? (
                    <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                      Select an event category first to see the songs offered for it.
                    </p>
                  ) : wizardMusicTracks.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                      No songs are offered for {formDefinition(wizardFormType).label} templates
                      yet. Upload one in the Music tab (Library → Music), then come back to assign
                      it.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
                      <Select
                        label="Song"
                        value={wizardData.music_track_id ?? ""}
                        onChange={(e) =>
                          setWizardData((p) => ({
                            ...p,
                            music_track_id: (e.target as HTMLSelectElement).value || null,
                          }))
                        }
                        options={[
                          { value: "", label: "None — silent demo" },
                          ...wizardMusicTracks.map((track) => ({
                            value: track.id,
                            label: musicTrackLabel(track) ?? track.title,
                          })),
                        ]}
                      />
                      {(() => {
                        const selected = wizardMusicTracks.find(
                          (track) => track.id === wizardData.music_track_id
                        );
                        if (!selected) return null;
                        return selected.url ? (
                          <audio controls preload="none" src={selected.url} className="w-full" />
                        ) : (
                          <p className="font-body-xs text-on-surface-variant">
                            This track has no playable file yet.
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Sample details: couple, venue, events, dress code and RSVP. */}
                <div className="border-t border-outline-variant pt-4">
                  <p className="font-body-sm font-semibold text-on-surface">Sample details</p>
                  <p className="mt-1 font-body-xs text-on-surface-variant">
                    Only packs authored for the selected category appear here. Manage packs in the
                    Details tab.
                  </p>

                  <button
                    type="button"
                    onClick={() => setWizardData((p) => ({ ...p, demo_detail_pack_id: null }))}
                    className={cn(
                      "mt-3 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                      wizardData.demo_detail_pack_id === null
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-outline-variant hover:bg-surface-container"
                    )}
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant">
                      <Icon name="text_fields" size="md" weight="w400" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-body-sm font-semibold !text-on-surface">
                        None — use the stock demo details
                      </span>
                      <span className="mt-0.5 block font-body-xs text-on-surface-variant">
                        Generic {wizardFormType ? formDefinition(wizardFormType).label.toLowerCase() : "event"} copy
                        from the platform, not a real customer.
                      </span>
                    </span>
                    {wizardData.demo_detail_pack_id === null && (
                      <Icon name="check_circle" size="sm" className="text-primary" />
                    )}
                  </button>

                  {!wizardFormType ? (
                    <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                      Select an event category first to see the details packs authored for it.
                    </p>
                  ) : wizardDetailPacks.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                      No {formDefinition(wizardFormType).label} details packs yet. Create one in the
                      Details tab (Library → Details), then come back to assign it.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {wizardDetailPacks.map((pack) => {
                        const selected = wizardData.demo_detail_pack_id === pack.id;
                        return (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() =>
                              setWizardData((p) => ({ ...p, demo_detail_pack_id: pack.id }))
                            }
                            className={cn(
                              "flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                              selected
                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                : "border-outline-variant hover:bg-surface-container"
                            )}
                          >
                            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                              <Icon name="text_fields" size="sm" weight="w400" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-body-sm font-semibold !text-on-surface">
                                {pack.name}
                              </span>
                              <span className="mt-0.5 block truncate font-body-xs text-on-surface-variant">
                                {demoDetailPackCouple(pack)}
                              </span>
                              <span className="mt-0.5 block font-body-xs text-on-surface-variant">
                                {pack.events.length} event{pack.events.length === 1 ? "" : "s"}
                                {pack.venue ? ` · ${pack.venue}` : ""}
                              </span>
                            </span>
                            {selected && <Icon name="check_circle" size="sm" className="text-primary" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
          </FormSection>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-4">
            <p className="font-body-xs text-on-surface-variant">
              Required fields are validated when you submit.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={closeWizard} disabled={wizardLoading}>
                Cancel
              </Button>
              <Button type="submit" loading={wizardLoading} icon="save">
                Create Template
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Validation Result Modal (existing flow) */}
      {validationResult && (
        <Modal
          open={!!validationResult}
          onClose={() => setValidationResult(null)}
          title={validationResult.result.validation?.ok ? "Template Validation Passed" : "Template Validation Failed"}
          icon={validationResult.result.validation?.ok ? "check_circle" : "error"}
        >
          <div className="flex flex-col gap-4">
            <ValidationReport result={validationResult.result} />

            {validationResult.result.validation?.ok && validationResult.result.versionId && (
              <div className="rounded-xl border border-outline-variant bg-surface-container p-4">
                <p className="font-body-sm font-semibold !text-on-surface">Ready to publish</p>
                <p className="mt-1 font-body-xs text-on-surface-variant">
                  Version {validationResult.result.version} passed validation. Publish to make it available for new invitations.
                  Existing invitations are not affected.
                </p>
                <Button
                  className="mt-3"
                  size="sm"
                  icon="publish"
                  loading={saving}
                  onClick={() => {
                    const vId = validationResult.result.versionId;
                    const tId = validationResult.templateId;
                    if (vId) void publishVersion(tId, vId);
                  }}
                >
                  Publish v{validationResult.result.version}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Permanent delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
        title="Delete template"
        icon="delete"
        blockBackdropClose={deleting}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="delete"
              loading={deleting}
              disabled={!deleteTarget || deleteTarget.activeInvitations > 0}
              onClick={() => void confirmDelete()}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <div className="flex flex-col gap-4">
            <p className="font-body-sm text-on-surface">
              Are you sure you want to permanently delete <strong className="font-semibold">{deleteTarget.name}</strong>?
            </p>
            <div className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Active invitations</span>
                <span className={cn("font-medium", deleteTarget.activeInvitations > 0 && "text-error")}>{deleteTarget.activeInvitations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Total invitations</span>
                <span className="font-medium">{deleteTarget.totalInvitations}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Versions</span>
                <span className="font-medium">{deleteTarget.versionCount}</span>
              </div>
            </div>
            {deleteTarget.activeInvitations > 0 ? (
              <p className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-3 font-body-sm text-error">
                <Icon name="error" size="sm" className="mt-0.5" />
                Delete is blocked while this template powers an active invitation. Existing invitations keep working, but you must wait for them to expire before deleting (or disable the template instead to stop new purchases).
              </p>
            ) : (
              <p className="font-body-sm text-on-surface-variant">
                This permanently removes the template, all {deleteTarget.versionCount} version{deleteTarget.versionCount === 1 ? "" : "s"}, every package file and thumbnail in storage, plus its demo photos, details, soundtrack and pricing row when no other template uses them. Non-active invitations referencing it are detached and guest drafts are removed. Order and payment history is preserved.
              </p>
            )}
          </div>
        )}
      </Modal>

      <div className="mt-6 flex flex-col gap-4">
        {rows.map((t) => {
          const rowFormType = formTypeOrDefault(t.formType);
          const rowCategorySlug = categorySlugForFormType(rowFormType);
          const rowMusicTracks = musicTracks.filter((track) =>
            musicTrackInCategory(track, rowCategorySlug)
          );
          const rowDetailPacks = detailPacks.filter((pack) => pack.formType === rowFormType);
          const rowMediaPacks = mediaPacks.filter((pack) =>
            mediaPackMatchesForm(pack, rowFormType)
          );
          // Keep an already-assigned item visible even if it belongs to another
          // category, so the picker never looks empty by accident.
          const currentDetail = detailPacks.find((pack) => pack.id === detailDraft);
          const detailOptions =
            currentDetail && !rowDetailPacks.some((pack) => pack.id === currentDetail.id)
              ? [currentDetail, ...rowDetailPacks]
              : rowDetailPacks;
          const currentMedia = mediaPacks.find((pack) => pack.id === mediaDraft);
          const mediaOptions =
            currentMedia && !rowMediaPacks.some((pack) => pack.id === currentMedia.id)
              ? [currentMedia, ...rowMediaPacks]
              : rowMediaPacks;
          const currentTrack = musicTracks.find((track) => track.id === musicDraft);
          const trackOptions =
            currentTrack && !rowMusicTracks.some((track) => track.id === currentTrack.id)
              ? [currentTrack, ...rowMusicTracks]
              : rowMusicTracks;

          return (
          <div key={t.id} className="rounded-2xl border border-outline-variant bg-surface p-5">
            <div className="flex flex-wrap items-center gap-4">
              {t.thumbnailUrl ? (
                <img src={t.thumbnailUrl} alt={t.name} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                  <Icon name="inventory_2" size="lg" weight="w400" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-heading-md font-semibold !text-on-surface">
                  {t.name}
                  <Badge tone={t.status === "active" ? "success" : t.status === "disabled" ? "danger" : "default"}>
                    {t.status}
                  </Badge>
                </p>
                <p className="font-body-xs text-on-surface-variant">
                  {t.currentVersion ? `v${t.currentVersion}` : "no published version"} · {t.versionCount} release{t.versionCount === 1 ? "" : "s"}
                  {t.product ? ` · ${formatPrice(t.product.pricePaise, t.product.currency)}` : " · no pricing"}
                  {t.categories.length ? ` · ${t.categories.join(", ")}` : ""}
                  {t.mediaPackName ? ` · media: ${t.mediaPackName}` : ""}
                  {t.demoDetailPackName ? ` · details: ${t.demoDetailPackName}` : ""}
                  {t.musicTrackName ? ` · song: ${t.musicTrackName}` : ""}
                </p>
                <p className="mt-0.5 font-body-xs text-on-surface-variant">
                  <span className={cn(t.activeInvitations > 0 ? "font-semibold text-success" : "")}>
                    {t.activeInvitations} active
                  </span>
                  {" · "}
                  {t.totalInvitations} invitation{t.totalInvitations === 1 ? "" : "s"} total
                </p>
              </div>
              <div className="flex items-center gap-2">
                {t.currentVersion && (
                  <a
                    href={`/templates/${t.slug}/demo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 font-body-xs text-on-surface-variant hover:bg-surface-container"
                  >
                    <Icon name="preview" size="xs" />
                    Preview
                  </a>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  icon="tune"
                  onClick={() => {
                    const next = expanded === t.id ? null : t.id;
                    setExpanded(next);
                    // Seed every demo picker from the row being opened.
                    if (next) {
                      setMediaDraft(t.mediaPackId ?? "");
                      setDetailDraft(t.demoDetailPackId ?? "");
                      setMusicDraft(t.musicTrackId ?? "");
                    }
                  }}
                >
                  {expanded === t.id ? "Close" : "Manage"}
                </Button>
              </div>
            </div>

            {expanded === t.id && (
              <div className="mt-5 border-t border-outline-variant pt-5">
                <form
                  className="grid gap-4 lg:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    const price = Number((fd.get("price") as string) ?? "");
                    void savePrice(t.id, Math.round(price * 100));
                  }}
                >
                  <TextInput label="Template name" name="name" defaultValue={t.name} disabled />
                  <TextInput label="Slug" name="slug" defaultValue={t.slug} disabled />
                  <TextInput label="Price ₹ (display)" name="price" defaultValue={t.product ? (t.product.pricePaise / 100).toFixed(0) : ""} />
                  <Select
                    label="Status"
                    name="status"
                    defaultValue={t.status}
                    options={[
                      { value: "active", label: "active" },
                      { value: "disabled", label: "disabled" },
                      { value: "draft", label: "draft" },
                    ]}
                  />
                  <div className="lg:col-span-2 flex items-center gap-2">
                    <Button type="submit" size="sm" loading={saving} icon="save">Save price</Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={saving}
                      disabled={t.status !== "active" && t.status !== "disabled"}
                      icon={t.status === "active" ? "block" : "check_circle"}
                      onClick={() => void setStatus(t.id, t.status === "active" ? "disabled" : "active")}
                    >
                      {t.status === "active" ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon="delete"
                      onClick={() => setDeleteTarget(t)}
                    >
                      Delete
                    </Button>
                  </div>
                </form>

                {/* Demo content: which library packs this template's demo renders. */}
                <div className="mt-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-body-sm font-semibold text-on-surface">Demo content</p>
                    <p className="font-body-xs text-on-surface-variant">
                      {demoSaving ? "Saving…" : "Changes save automatically"}
                    </p>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <Select
                      label="Sample photos"
                      value={mediaDraft}
                      disabled={demoSaving}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMediaDraft(value);
                        void saveDemoContent(t.id, { mediaPackId: value });
                      }}
                      options={[
                        { value: "", label: "None — package images" },
                        ...mediaOptions.map((p) => ({
                          value: p.id,
                          label:
                            p.formType === rowFormType
                              ? p.name
                              : `${p.name} (different category)`,
                        })),
                      ]}
                    />
                    <Select
                      label="Sample details"
                      value={detailDraft}
                      disabled={demoSaving}
                      onChange={(e) => {
                        const value = e.target.value;
                        setDetailDraft(value);
                        void saveDemoContent(t.id, { detailPackId: value });
                      }}
                      options={[
                        { value: "", label: "None — stock demo details" },
                        ...detailOptions.map((p) => ({
                          value: p.id,
                          label:
                            p.formType === rowFormType
                              ? p.name
                              : `${p.name} (different category)`,
                        })),
                      ]}
                    />
                    <Select
                      label="Background song"
                      value={musicDraft}
                      disabled={demoSaving}
                      onChange={(e) => {
                        const value = e.target.value;
                        setMusicDraft(value);
                        void saveDemoContent(t.id, { musicTrackId: value });
                      }}
                      options={[
                        { value: "", label: "None — silent demo" },
                        ...trackOptions.map((track) => ({
                          value: track.id,
                          label:
                            (musicTrackLabel(track) ?? track.title) +
                            (rowMusicTracks.some((item) => item.id === track.id)
                              ? ""
                              : " (different category)"),
                        })),
                      ]}
                    />
                  </div>
                  <p className="mt-2 font-body-xs text-on-surface-variant">
                    Showing {formDefinition(rowFormType).label} photos, songs and details only. The
                    demo updates as soon as you change these; the published package itself is
                    unchanged. Live invitations always show the customer&apos;s own content.
                  </p>
                  {rowMediaPacks.length === 0 && (
                    <p className="mt-1 font-body-xs text-on-surface-variant">
                      No {formDefinition(rowFormType).label} media packs exist yet. Create one in
                      the Media tab.
                    </p>
                  )}
                  {rowDetailPacks.length === 0 && (
                    <p className="mt-1 font-body-xs text-on-surface-variant">
                      No {formDefinition(rowFormType).label} details packs exist yet. Create one in
                      the Details tab.
                    </p>
                  )}
                  {rowMusicTracks.length === 0 && (
                    <p className="mt-1 font-body-xs text-on-surface-variant">
                      No songs are offered for {formDefinition(rowFormType).label} templates yet.
                      Add one in the Music tab.
                    </p>
                  )}
                </div>

                <PackageUpload
                  onUpload={(zip, thumb) => void uploadPackage(t.id, { zip, thumbnail: thumb })}
                  onThumbnail={(thumb) => void uploadThumbnail(t.id, thumb)}
                  uploading={uploading === t.id || thumbnailUploading === t.id}
                  currentVersion={t.currentVersion}
                />
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

function ValidationReport({ result }: { result: UploadResponse }) {
  const v = result.validation;
  if (!v) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <p className="font-body-xs font-semibold uppercase tracking-[0.1em] text-on-surface-variant mb-2">
          Validation Checks
        </p>
        <ul className="space-y-1">
          {v.checks.map((check, i) => (
            <li key={i} className="flex items-start gap-2 font-body-sm">
              <span className={cn(
                "mt-0.5 flex-shrink-0",
                check.passed && !check.warning ? "text-success" : check.warning ? "text-warning" : "text-error"
              )}>
                {check.passed && !check.warning ? "✓" : check.warning ? "⚠" : "✗"}
              </span>
              <span className={cn(!check.passed && !check.warning ? "text-error" : "text-on-surface")}>
                {check.name}
                {check.message ? ` — ${check.message}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {v.errors.length > 0 && (
        <div className="rounded-xl border border-error/30 bg-error/5 p-4">
          <p className="font-body-sm font-semibold text-error mb-1">
            ✗ {v.errors.length} error{v.errors.length > 1 ? "s" : ""} must be fixed before publishing
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {v.errors.map((e, i) => (
              <li key={i} className="font-body-xs text-error">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {v.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <p className="font-body-sm font-semibold text-warning mb-1">
            ⚠ {v.warnings.length} warning{v.warnings.length > 1 ? "s" : ""}
          </p>
          <ul className="list-disc list-inside space-y-0.5">
            {v.warnings.map((w, i) => (
              <li key={i} className="font-body-xs text-on-surface-variant">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {v.unusedAssets.length > 0 && (
        <p className="font-body-xs text-on-surface-variant">
          ⚠ {v.unusedAssets.length} unused asset{v.unusedAssets.length > 1 ? "s" : ""} will be uploaded but are not referenced in index.html.
        </p>
      )}
    </div>
  );
}

function PackageUpload({
  onUpload,
  onThumbnail,
  uploading,
  currentVersion,
}: {
  onUpload: (zip: File | undefined, thumbnail: File | undefined) => void;
  onThumbnail: (thumbnail: File) => void;
  uploading: boolean;
  currentVersion: string | null;
}) {
  const [zip, setZip] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);

  return (
    <div className="mt-5 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-4">
      <p className="flex items-center gap-2 font-body-sm font-semibold !text-on-surface">
        <Icon name="upload" size="sm" className="text-secondary" /> Upload a new version
      </p>
      <p className="mt-1 font-body-xs text-on-surface-variant">
        Upload a ZIP of the template package (HTML/CSS/JS/assets + manifest.json). The package is validated
        and saved as a <strong>draft</strong>. You can review validation results before publishing.
        Current published version: {currentVersion ? `v${currentVersion}` : "none"}. To replace only the
        thumbnail, select an image below and save — no package upload is needed.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-body-xs font-semibold text-on-surface-variant">Package (.zip) *</span>
          <input
            type="file"
            accept=".zip"
            className="mt-1 block w-full cursor-pointer rounded-lg border border-outline-variant bg-surface p-2 text-sm"
            onChange={(e) => setZip(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="block">
          <span className="font-body-xs font-semibold text-on-surface-variant">Thumbnail (PNG/JPEG/WebP)</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="mt-1 block w-full cursor-pointer rounded-lg border border-outline-variant bg-surface p-2 text-sm"
            onChange={(e) => setThumb(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <p className={cn("mt-2 font-body-xs", zip ? "text-success" : "text-on-surface-variant")}>
        {zip ? `Selected: ${zip.name} (${Math.round(zip.size / 1024)} KB)` : "No package selected"}
      </p>
      {thumb && <p className="mt-1 font-body-xs text-success">Selected thumbnail: {thumb.name}</p>}
      <Button
        className="mt-3"
        size="sm"
        icon={zip ? "cloud_upload" : "save"}
        loading={uploading}
        onClick={() => {
          if (zip) onUpload(zip, thumb ?? undefined);
          else if (thumb) onThumbnail(thumb);
        }}
        disabled={!zip && !thumb}
      >
        {zip ? "Upload & validate" : "Save thumbnail"}
      </Button>
    </div>
  );
}