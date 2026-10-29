"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { MAX_MEDIA_BYTES } from "@/lib/library-media";
import type { WeddingData } from "@/lib/builder/defaults";

interface Props {
  /** Guest session token for draft uploads. Omit in the account editor. */
  token?: string;
  /** Wedding id for owner uploads from the account editor. */
  weddingId?: string;
  data: WeddingData;
  onChange: (patch: Partial<WeddingData> | ((prev: WeddingData) => Partial<WeddingData>)) => void;
  /** Gallery cap. Birthday Wishes uses 3; the celebration form leaves it open. */
  maxGallery?: number;
}

const MAX_IMAGE_MB = Math.round(MAX_MEDIA_BYTES / (1024 * 1024));

interface PendingItem {
  id: number;
  preview: string;
}

/**
 * Media controls for the birthday forms: one main image plus an optional
 * gallery. The wedding MediaFields also covers portraits, soundtrack and the
 * larger copy deck, none of which belong on a birthday invitation.
 */
export function EventMediaFields({ token, weddingId, data, onChange, maxGallery }: Props) {
  const [uploadingMain, setUploadingMain] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [oversizedNames, setOversizedNames] = useState<string[]>([]);
  const [showOversized, setShowOversized] = useState(false);
  const [mainPreview, setMainPreview] = useState<string | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const objectUrls = useRef<string[]>([]);
  const nextPendingId = useRef(0);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    []
  );

  const remaining = maxGallery === undefined ? Infinity : Math.max(0, maxGallery - data.gallery.length);
  const atCap = remaining <= 0;

  function makePreview(file: File) {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    return url;
  }

  function releasePreview(url: string) {
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((u) => u !== url);
  }

  function isOversized(file: File) {
    return file.size > MAX_MEDIA_BYTES;
  }

  function reportOversized(files: File[]) {
    const names = files.map((file) => file.name).filter(Boolean);
    if (names.length === 0) return;
    setOversizedNames((prev) => Array.from(new Set([...prev, ...names])));
    setShowOversized(true);
  }

  function closeOversized() {
    setShowOversized(false);
    setOversizedNames([]);
  }

  async function upload(
    file: File,
    role: "couple" | "gallery",
    replaces?: string | null
  ): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("role", role);
    fd.append("salt", String(crypto.getRandomValues(new Uint32Array(1))[0]));
    if (weddingId) fd.append("weddingId", weddingId);
    if (replaces) fd.append("replaces", replaces);
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
    return json.url;
  }

  async function cleanup(urls: Array<string | null | undefined>) {
    const values = urls.filter((url): url is string => typeof url === "string" && url.length > 0);
    if (values.length === 0) return;
    try {
      await fetch("/api/uploads/cleanup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ urls: values, ...(weddingId ? { weddingId } : {}) }),
      });
    } catch {
      // The next save cleans up whatever is still unused.
    }
  }

  async function pickMain() {
    if (uploadingMain) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setError(null);
      if (isOversized(file)) {
        reportOversized([file]);
        return;
      }
      const previous = data.mainPhoto;
      const preview = makePreview(file);
      setMainPreview(preview);
      setUploadingMain(true);
      try {
        const url = await upload(file, "couple", previous);
        onChange({ mainPhoto: url });
        void cleanup([previous]);
      } catch (err) {
        if ((err as Error).message === "FILE_TOO_LARGE") reportOversized([file]);
        else setError((err as Error).message);
      } finally {
        setMainPreview(null);
        releasePreview(preview);
        setUploadingMain(false);
      }
    };
    input.click();
  }

  async function handleGallery(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const all = Array.from(files);
    const oversized = all.filter(isOversized);
    const accepted = all.filter((file) => !isOversized(file));
    if (oversized.length > 0) reportOversized(oversized);
    if (accepted.length === 0) return;

    const capacity = maxGallery === undefined ? accepted.length : Math.max(0, remaining - pending.length);
    if (capacity <= 0) {
      setError(`You can add up to ${maxGallery} gallery photos.`);
      return;
    }
    const selected = accepted.slice(0, capacity);
    if (selected.length < accepted.length) {
      setError(`Only ${maxGallery} gallery photos are allowed — ${accepted.length - selected.length} were not added.`);
    }

    const picked = selected.map((file) => {
      const preview = makePreview(file);
      return { id: nextPendingId.current++, file, preview };
    });
    setPending((prev) => [...prev, ...picked]);

    const results = await Promise.allSettled(
      picked.map(async (item) => {
        try {
          const url = await upload(item.file, "gallery");
          onChange((prev) => ({
            gallery: [...prev.gallery, { role: "gallery", url, name: item.file.name }],
          }));
        } finally {
          releasePreview(item.preview);
          setPending((prev) => prev.filter((p) => p.id !== item.id));
        }
      })
    );

    const failed = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason as Error);
    if (failed.length === 1) setError(failed[0].message);
    else if (failed.length > 1) setError(`${failed.length} photos could not be uploaded. Please try again.`);
  }

  function removeMain() {
    const previous = data.mainPhoto;
    onChange({ mainPhoto: null });
    void cleanup([previous]);
  }

  function removeGalleryItem(item: WeddingData["gallery"][number]) {
    onChange((prev) => ({ gallery: prev.gallery.filter((x) => x !== item) }));
    void cleanup([item.url]);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="font-heading-md font-semibold !text-on-surface">Main image</h3>
        <p className="mt-1 font-body-xs text-on-surface-variant">
          The hero image on the invitation. Optional — the design works without one.
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-4">
          {(mainPreview ?? data.mainPhoto) ? (
            <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-2xl border border-outline-variant">
              <img
                src={(mainPreview ?? data.mainPhoto)!}
                alt="Main invitation image"
                className="h-full w-full object-cover"
              />
              {uploadingMain && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Icon name="refresh" size="md" className="animate-spin" />
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void pickMain()}
              className="flex aspect-[3/4] w-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-low p-4 text-center transition-colors hover:border-secondary"
            >
              <Icon name="image" size="xl" weight="w200" className="text-on-surface-variant" />
              <span className="font-body-xs font-semibold text-on-surface-variant">Add main image</span>
            </button>
          )}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={uploadingMain ? "refresh" : "cloud_upload"}
              loading={uploadingMain}
              onClick={() => void pickMain()}
            >
              {data.mainPhoto ? "Change image" : "Upload image"}
            </Button>
            {data.mainPhoto && (
              <Button type="button" variant="ghost" size="sm" icon="close" onClick={removeMain}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-heading-md font-semibold !text-on-surface">Photo gallery</h3>
            <p className="mt-1 font-body-xs text-on-surface-variant">
              {maxGallery === undefined
                ? "Share as many moments as you like."
                : `Up to ${maxGallery} photos. ${remaining} slot${remaining === 1 ? "" : "s"} left.`}
            </p>
          </div>
          <input
            ref={galleryInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              void handleGallery(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={pending.length ? "refresh" : "add_circle"}
            loading={pending.length > 0}
            disabled={atCap}
            onClick={() => galleryInput.current?.click()}
          >
            Upload photos
          </Button>
        </div>

        {data.gallery.length === 0 && pending.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-6 text-center font-body-sm text-on-surface-variant">
            No gallery photos yet.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {data.gallery.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className="group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest"
              >
                <img src={item.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeGalleryItem(item)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Remove photo"
                >
                  <Icon name="close" size="sm" />
                </button>
              </div>
            ))}
            {pending.map((item) => (
              <div
                key={item.id}
                aria-busy
                className="relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest"
              >
                <img src={item.preview} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Icon name="refresh" size="md" className="animate-spin" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </p>
      )}

      <Modal
        open={showOversized}
        onClose={closeOversized}
        title={oversizedNames.length === 1 ? "Image too large" : "Images too large"}
        icon="warning"
        size="sm"
        footer={
          <Button type="button" onClick={closeOversized}>
            OK
          </Button>
        }
      >
        <p className="font-body-sm text-on-surface-variant">
          {oversizedNames.length === 1
            ? `This image is larger than ${MAX_IMAGE_MB} MB, so it was not uploaded:`
            : `These images are larger than ${MAX_IMAGE_MB} MB, so they were not uploaded:`}
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {oversizedNames.map((name) => (
            <li key={name} className="flex items-start gap-2 break-all font-body-sm text-on-surface">
              <Icon name="image" size="sm" className="mt-0.5 shrink-0 text-on-surface-variant" />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
