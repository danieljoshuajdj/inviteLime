"use client";

import { useRef, useState } from "react";

import { toast } from "@/components/account/toast";
import { Button } from "@/components/shared/Button";
import { TextInput, Textarea } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import {
  MAX_HERO_EYEBROW_LENGTH,
  MAX_HERO_IMAGES,
  MAX_HERO_SUBTITLE_LENGTH,
  MAX_HERO_TITLE_LENGTH,
  type HeroContentImageWithUrl,
  type HeroContentWithUrls,
} from "@/lib/hero-content";

interface Props {
  /** Loaded server-side so the form and carousel are usable on first paint. */
  initial: HeroContentWithUrls;
}

/**
 * Admin editor for the public home page: the hero headline, its supporting copy
 * and the invitation carousel.
 *
 * Copy is saved as `site_settings.hero`; images are uploaded to the public
 * templates bucket and referenced by object key, so switching between Supabase
 * and Backblaze B2 never invalidates a saved image.
 */
export function HeroContentCard({ initial }: Props) {
  const [eyebrow, setEyebrow] = useState(initial.eyebrow);
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [images, setImages] = useState<HeroContentImageWithUrl[]>(initial.images);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const full = images.length >= MAX_HERO_IMAGES;

  async function saveCopy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings/hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eyebrow, title, subtitle }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        hero?: HeroContentWithUrls;
        error?: string;
      };
      if (!res.ok || !json.hero) throw new Error(json.error ?? "Could not save the home page copy.");

      setEyebrow(json.hero.eyebrow);
      setTitle(json.hero.title);
      setSubtitle(json.hero.subtitle);
      setSuccess("Saved. The public home page now shows this copy.");
      toast("Home page copy saved");
    } catch (err) {
      const message = (err as Error).message || "Could not save the home page copy.";
      setError(message);
      toast("Could not save home page copy", message);
    } finally {
      setSaving(false);
    }
  }

  function pickImages() {
    if (full) {
      toast("Carousel is full", `Remove an image before adding more than ${MAX_HERO_IMAGES}.`);
      return;
    }
    fileInput.current?.click();
  }

  async function uploadImages(files: File[]) {
    const remaining = MAX_HERO_IMAGES - images.length;
    const selected = files.slice(0, remaining);
    if (selected.length === 0) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    const added: HeroContentImageWithUrl[] = [];
    let failure: string | null = null;

    for (const file of selected) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/settings/hero/images", {
          method: "POST",
          body: fd,
        });
        const json = (await res.json().catch(() => ({}))) as {
          image?: HeroContentImageWithUrl;
          error?: string;
        };
        if (!res.ok || !json.image) throw new Error(json.error ?? "Upload failed");
        added.push(json.image);
      } catch (err) {
        failure = (err as Error).message;
        break;
      }
    }

    if (added.length > 0) {
      setImages((prev) => [...prev, ...added]);
      toast(added.length === 1 ? "Image added" : `${added.length} images added`);
    }
    if (failure) {
      setError(failure);
      toast("Could not upload image", failure);
    }
    setUploading(false);
  }

  async function removeImage(key: string) {
    setRemovingKey(key);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings/hero/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not remove the image.");

      setImages((prev) => prev.filter((image) => image.key !== key));
      toast("Image removed");
    } catch (err) {
      const message = (err as Error).message || "Could not remove the image.";
      setError(message);
      toast("Could not remove image", message);
    } finally {
      setRemovingKey(null);
    }
  }

  async function moveImage(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= images.length || reordering) return;

    const previous = images;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    setReordering(true);
    try {
      const res = await fetch("/api/admin/settings/hero/images", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keys: next.map((image) => image.key) }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save the order.");
    } catch (err) {
      setImages(previous);
      toast("Could not reorder images", (err as Error).message);
    } finally {
      setReordering(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
          <Icon name="home" size="md" />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading-md font-semibold !text-on-surface">Home Page Hero</h3>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            The headline, supporting copy and invitation carousel visitors see
            first. Changes go live on the next page load.
          </p>
        </div>
      </div>

      <form onSubmit={saveCopy} className="mt-5 flex max-w-2xl flex-col gap-4">
        <TextInput
          label="Eyebrow label"
          name="heroEyebrow"
          value={eyebrow}
          maxLength={MAX_HERO_EYEBROW_LENGTH}
          onChange={(event) => {
            setEyebrow(event.target.value);
            if (error) setError(null);
            if (success) setSuccess(null);
          }}
          placeholder="Trusted for 5,00,000+ happy couples"
          hint="The small pill above the headline."
        />
        <TextInput
          label="Headline"
          name="heroTitle"
          value={title}
          maxLength={MAX_HERO_TITLE_LENGTH}
          onChange={(event) => {
            setTitle(event.target.value);
            if (error) setError(null);
            if (success) setSuccess(null);
          }}
          placeholder="Create a Breathtaking Wedding Website"
          hint="A closing “Wedding Website” is highlighted automatically. Leave blank to use the default."
        />
        <Textarea
          label="Supporting copy"
          name="heroSubtitle"
          value={subtitle}
          maxLength={MAX_HERO_SUBTITLE_LENGTH}
          rows={3}
          onChange={(event) => {
            setSubtitle(event.target.value);
            if (error) setError(null);
            if (success) setSuccess(null);
          }}
          hint="One or two sentences shown under the carousel. Leave blank to use the default."
        />

        <div>
          <Button type="submit" icon="save" loading={saving}>
            Save Copy
          </Button>
        </div>

        {error ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 px-3 py-2 font-body-sm text-on-surface"
          >
            <Icon name="error" size="sm" className="mt-0.5 shrink-0 text-error" />
            {error}
          </p>
        ) : null}

        {success ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 font-body-sm text-on-surface"
          >
            <Icon name="check_circle" size="sm" className="mt-0.5 shrink-0 text-success" />
            {success}
          </p>
        ) : null}
      </form>

      <div className="mt-6 border-t border-outline-variant pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="font-heading-sm font-semibold !text-on-surface">Carousel images</h4>
            <p className="mt-1 font-body-sm text-on-surface-variant">
              Up to {MAX_HERO_IMAGES} portrait images, shown in this order. Photos
              are optimised automatically. Without any uploads the page uses its
              bundled preview artwork.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-body-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
              {images.length} of {MAX_HERO_IMAGES}
            </span>
            <Button
              type="button"
              variant="outline"
              icon="upload"
              loading={uploading}
              onClick={pickImages}
            >
              Upload
            </Button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          className="sr-only"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length > 0) void uploadImages(files);
          }}
        />

        {images.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-4 py-6 text-center font-body-sm text-on-surface-variant">
            No carousel images yet. Upload a few invitation previews to replace
            the default artwork.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {images.map((image, index) => (
              <li
                key={image.key}
                className="group overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
              >
                <div className="relative aspect-[4/5] bg-surface-container">
                  {image.url ? (
                    <img
                      src={image.url}
                      alt={image.alt}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-2 text-center font-body-xs text-on-surface-variant">
                      Preview unavailable
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 font-body-xs font-semibold text-white">
                    {index + 1}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 p-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void moveImage(index, -1)}
                      disabled={index === 0 || reordering}
                      aria-label={`Move image ${index + 1} earlier`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Icon name="chevron_left" size="sm" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveImage(index, 1)}
                      disabled={index === images.length - 1 || reordering}
                      aria-label={`Move image ${index + 1} later`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
                    >
                      <Icon name="chevron_right" size="sm" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeImage(image.key)}
                    disabled={removingKey === image.key}
                    aria-label={`Remove image ${index + 1}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error disabled:pointer-events-none disabled:opacity-40"
                  >
                    {removingKey === image.key ? (
                      <span
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                        aria-hidden
                      />
                    ) : (
                      <Icon name="delete" size="sm" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
