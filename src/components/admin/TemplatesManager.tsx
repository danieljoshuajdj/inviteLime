"use client";

import { useState } from "react";

import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { TextInput, Select, Textarea, MultiSelect } from "@/components/shared/Field";
import { Modal } from "@/components/shared/Modal";
import { cn, formatPrice, slugify } from "@/lib/utils";
import { toast } from "@/components/account/toast";
// Client-safe module: importing the media-packs service would pull the storage
// client (and its `server-only` guard) into the browser bundle.
import {
  demoDetailPackCouple,
  type DemoDetailPack,
  type MediaPack,
  type MusicTrack,
} from "@/lib/library-media";

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

const STEPS = [
  { key: "info", label: "Basic Info", icon: "info" },
  { key: "pricing", label: "Pricing", icon: "dashboard" },
  { key: "categories", label: "Categories", icon: "category" },
  { key: "package", label: "Package", icon: "inventory_2" },
  { key: "media", label: "Demo Content", icon: "auto_awesome" },
  { key: "preview", label: "Preview", icon: "visibility" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

interface FormData {
  name: string;
  slug: string;
  description: string;
  status: "draft" | "active" | "disabled";
  tags: string[];
  product_id: string | null;
  price_paise: number | null;
  currency: string;
  category_ids: string[];
  zip: File | null;
  thumbnail: File | null;
  media_pack_id: string | null;
  demo_detail_pack_id: string | null;
  music_track_id: string | null;
}

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
  // Selected demo sources in the manage panel, for the single expanded row.
  const [mediaDraft, setMediaDraft] = useState<string>("");
  const [detailDraft, setDetailDraft] = useState<string>("");
  const [musicDraft, setMusicDraft] = useState<string>("");
  const [demoSaving, setDemoSaving] = useState(false);
const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<StepKey>("info");
  const [wizardLoading, setWizardLoading] = useState(false);
  const [wizardSubmitted, setWizardSubmitted] = useState(false);
  const [wizardData, setWizardData] = useState<FormData>({
    name: "",
    slug: "",
    description: "",
    status: "draft",
    tags: [],
    product_id: null,
    price_paise: null,
    currency: "INR",
    category_ids: [],
    zip: null,
    thumbnail: null,
    media_pack_id: null,
    demo_detail_pack_id: null,
    music_track_id: null,
  });
  const [wizardErrors, setWizardErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [createdTemplateId, setCreatedTemplateId] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{ templateId: string; result: UploadResponse } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(typeof templates)[number] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const currentStepIndex = STEPS.findIndex((s) => s.key === wizardStep);
  const canGoBack = currentStepIndex > 0;
  const canGoNext = currentStepIndex < STEPS.length - 1;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  function validateStep(step: StepKey): boolean {
    const errors: Partial<Record<keyof FormData, string>> = {};
    if (step === "info") {
      if (!wizardData.name.trim()) errors.name = "Template name is required";
      if (!wizardData.slug.trim()) errors.slug = "Slug is required";
      else if (!/^[a-z0-9-]+$/.test(wizardData.slug)) errors.slug = "Slug must be lowercase letters, numbers, and dashes only";
    }
    if (step === "pricing") {
      if (!wizardData.product_id && (wizardData.price_paise === null || wizardData.price_paise < 0)) {
        errors.price_paise = "Enter a price or select an existing product";
      }
    }
    if (step === "categories") {
      if (wizardData.category_ids.length === 0) errors.category_ids = "Select at least one category";
    }
    if (step === "package") {
      if (!wizardData.zip) errors.zip = "A .zip package is required";
      else if (!wizardData.zip.name.toLowerCase().endsWith(".zip")) errors.zip = "Package must be a .zip file";
      else if (wizardData.zip.size > 60 * 1024 * 1024) errors.zip = "Package exceeds 60 MB limit";
    }
    setWizardErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleBack() {
    if (canGoBack) setWizardStep(STEPS[currentStepIndex - 1].key);
  }

  async function handleNext() {
    if (!validateStep(wizardStep)) return;
    if (canGoNext) setWizardStep(STEPS[currentStepIndex + 1].key);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateStep(wizardStep)) return;

    setWizardLoading(true);
    try {
      // Step 1: Create the template (reuse the id from a previous attempt in
      // this wizard so fixing a rejected package doesn't hit a slug conflict)
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
            category_ids: wizardData.category_ids,
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

      // Step 2: Upload package
      const fd = new FormData();
      fd.append("file", wizardData.zip!);
      if (wizardData.thumbnail) fd.append("thumbnail", wizardData.thumbnail);
      const uploadRes = await fetch(`/api/admin/templates/${templateId}/package`, { method: "POST", body: fd });
      const uploadJson = await uploadRes.json();

      if (uploadRes.status === 422 && uploadJson.validation) {
        setValidationResult({ templateId, result: uploadJson });
        toast("Validation failed", "Fix errors before publishing");
        setWizardStep("preview");
        return;
      }
      if (!uploadRes.ok) throw new Error(uploadJson.error ?? "Upload failed");

      // Success
      setValidationResult({ templateId, result: uploadJson });
      setRows((rs) => rs.map((r) => (r.id === templateId ? { ...r, versionCount: r.versionCount + 1 } : r)));
      setWizardSubmitted(true);
      toast(`v${uploadJson.version} uploaded as draft`, "Review validation results, then publish");
      setWizardStep("preview");
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
          thumbnailUrl: null,
          product,
          currentVersion: null,
          versionCount: 0,
          activeInvitations: 0,
          totalInvitations: 0,
          categories: wizardData.category_ids
            .map((cid) => categories.find((c) => c.id === cid)?.name ?? "")
            .filter(Boolean),
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

  function closeWizard() {
    setWizardOpen(false);
    setWizardStep("info");
    setWizardSubmitted(false);
    setCreatedTemplateId(null);
    setValidationResult(null);
    setWizardData({
      name: "", slug: "", description: "", status: "draft", tags: [],
      product_id: null, price_paise: null, currency: "INR",
      category_ids: [], zip: null, thumbnail: null, media_pack_id: null,
      demo_detail_pack_id: null, music_track_id: null,
    });
    setWizardErrors({});
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
    wizardData.category_ids.length > 0 ||
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

      {/* Add Template Wizard */}
      <Modal open={wizardOpen} onClose={closeWizard} title="Add Template" icon="add_circle" size="xl" blockBackdropClose={wizardDirty}>
        <div className="flex flex-col h-full">
          {/* Step indicator */}
          <div className="flex items-center gap-1 mb-4 p-2 bg-surface-container-low rounded-lg overflow-x-auto">
            {STEPS.map((step, idx) => (
              <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-all",
                  idx < currentStepIndex
                    ? "bg-success text-on-success"
                    : idx === currentStepIndex
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-highest text-on-surface-variant"
                )}>
                  {idx < currentStepIndex ? "✓" : <Icon name={step.icon} size="sm" />}
                </div>
                <span className={cn(
                  "hidden sm:block font-body-xs font-medium px-2",
                  idx === currentStepIndex ? "text-primary" : "text-on-surface-variant"
                )}>
                  {step.label}
                </span>
                {idx < STEPS.length - 1 && <span className={cn("hidden sm:block w-8 border-t-2", idx < currentStepIndex ? "border-success" : "border-outline-variant")} />}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            {/* Step: Basic Info */}
            {wizardStep === "info" && (
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
                  }}
                  placeholder="e.g. Royal Mughal Palace"
                  required
                  error={wizardErrors.name}
                />
                <TextInput
                  label="Slug"
                  name="slug"
                  value={wizardData.slug}
                  onChange={(e) => setWizardData((p) => ({ ...p, slug: (e.target as HTMLInputElement).value.toLowerCase() }))}
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
            )}

            {/* Step: Pricing */}
            {wizardStep === "pricing" && (
              <div className="flex flex-col gap-4">
                <p className="font-body-sm text-on-surface-variant">
                  Link an existing pricing product or enter a new price to create one automatically.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Existing Product (optional)"
                    name="product_id"
                    value={wizardData.product_id ?? ""}
                    onChange={(e) => setWizardData((p) => ({ ...p, product_id: (e.target as HTMLSelectElement).value || null, price_paise: null }))}
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
                    }}
                    placeholder="e.g. 1499"
                    error={wizardErrors.price_paise}
                  />
                  <TextInput
                    label="Currency"
                    value={wizardData.currency}
                    onChange={(e) => setWizardData((p) => ({ ...p, currency: (e.target as HTMLInputElement).value.toUpperCase() }))}
                    maxLength={3}
                  />
                </div>
              </div>
            )}

            {/* Step: Categories */}
            {wizardStep === "categories" && (
              <div className="flex flex-col gap-4">
                <p className="font-body-sm text-on-surface-variant">Select one or more categories for this template.</p>
                <MultiSelect
                  label="Categories"
                  value={wizardData.category_ids}
                  onChange={(v: string[]) => setWizardData((p) => ({ ...p, category_ids: v }))}
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Select categories..."
                  error={wizardErrors.category_ids}
                  required
                />
              </div>
            )}

            {/* Step: Package */}
            {wizardStep === "package" && (
              <div className="flex flex-col gap-4">
                <p className="font-body-sm text-on-surface-variant">
                  Upload the template package (.zip) and an optional thumbnail.
                  The package must contain <code className="font-mono">index.html</code> and <code className="font-mono">manifest.json</code> at its root.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="font-body-xs font-semibold text-on-surface-variant">Package (.zip) *</span>
                    <input
                      type="file"
                      accept=".zip"
                      className="mt-1 block w-full cursor-pointer rounded-lg border border-outline-variant bg-surface p-2 text-sm"
                      onChange={(e) => setWizardData((p) => ({ ...p, zip: e.target.files?.[0] ?? null }))}
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
                      onChange={(e) => setWizardData((p) => ({ ...p, thumbnail: e.target.files?.[0] ?? null }))}
                    />
                    {wizardData.thumbnail && <p className="mt-1 font-body-xs text-success">Selected: {wizardData.thumbnail.name}</p>}
                  </label>
                </div>
              </div>
            )}

            {/* Step: Demo Content */}
            {wizardStep === "media" && (
              <div className="flex flex-col gap-4">
                <p className="font-body-sm text-on-surface-variant">
                  Choose the sample content this template&apos;s demo should render: photos, a
                  sample wedding and a background song. Each is uploaded once in the library
                  and reused by every template assigned to it, so nothing needs to be bundled
                  into the ZIP. Live invitations always show the customer&apos;s own content.
                </p>

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

                {mediaPacks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                    No media packs yet. Create one in the Media tab (Library → Media), upload
                    its photos, then come back to assign it.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {mediaPacks.map((pack) => {
                      const selected = wizardData.media_pack_id === pack.id;
                      const counts = { bride: 0, groom: 0, couple: 0, gallery: 0 };
                      for (const item of pack.items) counts[item.role]++;
                      const previewUrls = (["groom", "bride", "couple"] as const)
                        .map((role) => pack.items.find((i) => i.role === role)?.url)
                        .filter(Boolean) as string[];
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
                              {counts.groom ? "groom" : "no groom"} · {counts.bride ? "bride" : "no bride"} ·{" "}
                              {counts.couple ? "couple" : "no couple"} ·{" "}
                              {counts.gallery} gallery photo{counts.gallery === 1 ? "" : "s"}
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
                    Adds a music control to the demo. Upload songs in the Music tab; the song
                    can be changed later without re-uploading the template package.
                  </p>
                  {musicTracks.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                      No songs yet. Upload one in the Music tab (Library → Music), then come
                      back to assign it.
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
                          ...musicTracks.map((track) => ({
                            value: track.id,
                            label: musicTrackLabel(track) ?? track.title,
                          })),
                        ]}
                      />
                      {(() => {
                        const selected = musicTracks.find(
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
                    The couple, venue, ceremonies, dress colours and RSVP contact shown in the
                    demo. Manage packs in the Details tab.
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
                        Generic couple and venue copy from the platform, not a real customer.
                      </span>
                    </span>
                    {wizardData.demo_detail_pack_id === null && (
                      <Icon name="check_circle" size="sm" className="text-primary" />
                    )}
                  </button>

                  {detailPacks.length === 0 ? (
                    <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-4 font-body-sm text-on-surface-variant">
                      No details packs yet. Create one in the Details tab (Library → Details),
                      then come back to assign it.
                    </p>
                  ) : (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {detailPacks.map((pack) => {
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
            )}

            {/* Step: Preview */}
            {wizardStep === "preview" && (() => {
              const linkedProduct = availableProducts.find((p) => p.id === wizardData.product_id);
              const priceDisplay = wizardData.product_id
                ? linkedProduct
                  ? `${formatPrice(linkedProduct.pricePaise, linkedProduct.currency)} (linked)`
                  : "Linked product"
                : wizardData.price_paise !== null
                ? `${formatPrice(wizardData.price_paise, wizardData.currency)} (new)`
                : "—";
              const categoryNames = categories
                .filter((c) => wizardData.category_ids.includes(c.id))
                .map((c) => c.name)
                .join(", ") || "—";
              const mediaPackName = wizardData.media_pack_id
                ? mediaPacks.find((p) => p.id === wizardData.media_pack_id)?.name ?? "Selected pack"
                : "Package images (none selected)";
              const detailPackName = wizardData.demo_detail_pack_id
                ? detailPacks.find((p) => p.id === wizardData.demo_detail_pack_id)?.name ?? "Selected pack"
                : "Stock demo details (none selected)";
              const musicTrackName = wizardData.music_track_id
                ? musicTrackLabel(musicTracks.find((t) => t.id === wizardData.music_track_id)) ?? "Selected song"
                : "Silent demo (no song)";

              return (
                <div className="flex flex-col gap-4">
                  <p className="font-body-sm text-on-surface-variant">
                    Review the template details before creating.
                  </p>
                  <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                    <dt className="text-on-surface-variant">Name</dt>
                    <dd className="font-medium">{wizardData.name}</dd>
                    <dt className="text-on-surface-variant">Slug</dt>
                    <dd className="font-mono">{wizardData.slug}</dd>
                    <dt className="text-on-surface-variant">Status</dt>
                    <dd>
                      <Badge
                        tone={
                          wizardData.status === "active"
                            ? "success"
                            : wizardData.status === "disabled"
                            ? "danger"
                            : "default"
                        }
                      >
                        {wizardData.status}
                      </Badge>
                    </dd>
                    <dt className="text-on-surface-variant">Price</dt>
                    <dd>{priceDisplay}</dd>
                    <dt className="text-on-surface-variant">Categories</dt>
                    <dd>{categoryNames}</dd>
                    <dt className="text-on-surface-variant">Tags</dt>
                    <dd>{wizardData.tags.join(", ") || "—"}</dd>
                    <dt className="text-on-surface-variant">Media source</dt>
                    <dd>{mediaPackName}</dd>
                    <dt className="text-on-surface-variant">Details source</dt>
                    <dd>{detailPackName}</dd>
                    <dt className="text-on-surface-variant">Background song</dt>
                    <dd>{musicTrackName}</dd>
                    <dt className="text-on-surface-variant">Package</dt>
                    <dd className={wizardData.zip ? "text-success" : "text-error"}>
                      {wizardData.zip ? wizardData.zip.name : "Not selected"}
                    </dd>
                    <dt className="text-on-surface-variant">Thumbnail</dt>
                    <dd>{wizardData.thumbnail ? wizardData.thumbnail.name : "—"}</dd>
                  </dl>
                  {validationResult && <ValidationReport result={validationResult.result} />}
                </div>
              );
            })()}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-outline-variant mt-auto">
              <Button type="button" variant="outline" onClick={handleBack} disabled={!canGoBack || wizardLoading}>
                <Icon name="arrow_back" size="sm" /> Back
              </Button>
              <div className="flex items-center gap-2">
                {isLastStep ? (
                  wizardSubmitted ? (
                    <Button type="button" onClick={closeWizard} icon="check">
                      Done
                    </Button>
                  ) : (
                    <Button type="submit" loading={wizardLoading} icon="save">
                      Create Template
                    </Button>
                  )
                ) : (
                  <Button type="button" onClick={handleNext} icon="arrow_forward" disabled={wizardLoading}>
                    Next
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>
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
        {rows.map((t) => (
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
                        ...mediaPacks.map((p) => ({ value: p.id, label: p.name })),
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
                        ...detailPacks.map((p) => ({ value: p.id, label: p.name })),
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
                        ...musicTracks.map((track) => ({
                          value: track.id,
                          label: musicTrackLabel(track) ?? track.title,
                        })),
                      ]}
                    />
                  </div>
                  <p className="mt-2 font-body-xs text-on-surface-variant">
                    The demo updates as soon as you change these; the published package itself is
                    unchanged. Live invitations always show the customer&apos;s own content.
                  </p>
                </div>

                <PackageUpload
                  onUpload={(zip, thumb) => void uploadPackage(t.id, { zip, thumbnail: thumb })}
                  uploading={uploading === t.id}
                  currentVersion={t.currentVersion}
                />
              </div>
            )}
          </div>
        ))}
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
  uploading,
  currentVersion,
}: {
  onUpload: (zip: File | undefined, thumbnail: File | undefined) => void;
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
        Current published version: {currentVersion ? `v${currentVersion}` : "none"}.
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
      <Button
        className="mt-3"
        size="sm"
        icon="cloud_upload"
        loading={uploading}
        onClick={() => onUpload(zip ?? undefined, thumb ?? undefined)}
        disabled={!zip}
      >
        Upload & validate
      </Button>
    </div>
  );
}