"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { MusicLibraryPicker } from "@/components/builder/MusicLibraryPicker";
import { isLibraryMediaUrl, libraryTrackName } from "@/lib/library-media";
import type { WeddingData } from "@/lib/builder/defaults";

interface Props {
  /** Guest session token for draft uploads. Omit in the account editor. */
  token?: string;
  /** Wedding id for owner uploads from the account editor. */
  weddingId?: string;
  data: WeddingData;
  onChange: (patch: Partial<WeddingData> | ((prev: WeddingData) => Partial<WeddingData>)) => void;
}

type SlotRole = "bridePhoto" | "groomPhoto" | "couplePhoto" | "music";

/** A picked file shown from a local blob URL while its upload is in flight. */
interface PendingGalleryItem {
  id: number;
  /** `URL.createObjectURL(file)` — the instant, pre-upload preview. */
  preview: string;
}

export function MediaFields({ token, weddingId, data, onChange }: Props) {
  const [uploadingRole, setUploadingRole] = useState<SlotRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  /**
   * Blob-backed previews so a picked photo is on screen immediately, with a
   * spinner over it, instead of appearing only after the upload round-trip.
   * Each is dropped (and revoked) the moment the real URL replaces it.
   */
  const [previews, setPreviews] = useState<Partial<Record<SlotRole, string>>>({});
  const [pendingGallery, setPendingGallery] = useState<PendingGalleryItem[]>([]);
  /** Every blob URL we mint, so unloading mid-upload cannot leak them. */
  const objectUrls = useRef<string[]>([]);
  const nextPendingId = useRef(0);

  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    []
  );

  function makePreview(file: File) {
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    return url;
  }

  function releasePreview(url: string) {
    URL.revokeObjectURL(url);
    objectUrls.current = objectUrls.current.filter((u) => u !== url);
  }

  function clearPreview(slot: SlotRole) {
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[slot];
      return next;
    });
  }

  async function uploadFile(
    file: File,
    role: "bride" | "groom" | "couple" | "gallery" | "music",
    slot: SlotRole | "gallery"
  ) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("role", role);
    fd.append("salt", String(crypto.getRandomValues(new Uint32Array(1))[0]));
    // The account editor uploads into an existing wedding and authenticates
    // with its cookie session; the builder sends its guest token instead.
    if (weddingId) fd.append("weddingId", weddingId);
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    const json = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !json.url) throw new Error(json.error ?? "Upload failed");
    if (slot === "gallery") {
      // Appends must be relative to the latest list: several photos can be
      // uploading at once, and each one finishes independently.
      const item = { role, url: json.url, name: file.name };
      onChange((prev) => ({ gallery: [...prev.gallery, item] }));
    } else if (slot === "music") {
      onChange({ music: { role: "music", url: json.url, name: file.name } });
    } else {
      onChange({ [slot]: json.url } as Partial<WeddingData>);
    }
  }

  async function handleSlotPick(slot: SlotRole, role: "bride" | "groom" | "couple") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const preview = makePreview(file);
      setPreviews((prev) => ({ ...prev, [slot]: preview }));
      setUploadingRole(slot);
      setError(null);
      try {
        await uploadFile(file, role, slot);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        clearPreview(slot);
        releasePreview(preview);
        setUploadingRole(null);
      }
    };
    input.click();
  }

  async function handleGallery(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const picked = Array.from(files).map((file) => {
      const preview = makePreview(file);
      return { id: nextPendingId.current++, file, preview };
    });
    setPendingGallery((prev) => [...prev, ...picked]);

    // Upload in parallel so thumbnails clear one by one as each lands, rather
    // than the whole batch waiting on the slowest file.
    const results = await Promise.allSettled(
      picked.map(async (item) => {
        try {
          await uploadFile(item.file, "gallery", "gallery");
        } finally {
          releasePreview(item.preview);
          setPendingGallery((prev) => prev.filter((p) => p.id !== item.id));
        }
      })
    );

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === 1) {
      setError(((failed[0] as PromiseRejectedResult).reason as Error).message);
    } else if (failed.length > 1) {
      setError(`${failed.length} photos could not be uploaded. Please try again.`);
    }
  }

  async function handleMusicPick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploadingRole("music");
      setError(null);
      try {
        await uploadFile(file, "music", "music");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setUploadingRole(null);
      }
    };
    input.click();
  }

  const slots = [
    { slot: "groomPhoto" as SlotRole, role: "groom" as const, label: "Groom's photo", url: data.groomPhoto },
    { slot: "bridePhoto" as SlotRole, role: "bride" as const, label: "Bride's photo", url: data.bridePhoto },
    { slot: "couplePhoto" as SlotRole, role: "couple" as const, label: "Couple's photo", url: data.couplePhoto },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {slots.map((s) => {
          const preview = previews[s.slot];
          const shown = preview ?? s.url;
          const busy = uploadingRole === s.slot;
          return (
            <button
              key={s.slot}
              type="button"
              onClick={() => void handleSlotPick(s.slot, s.role)}
              aria-busy={busy || undefined}
              className="group relative aspect-[3/4] overflow-hidden rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-low text-start transition-colors hover:border-secondary"
            >
              {shown ? (
                <img src={shown} alt={s.label} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
                  <Icon name="image" size="xl" weight="w200" className="text-on-surface-variant" />
                  <span className="font-body-xs font-semibold text-on-surface-variant">{s.label}</span>
                </span>
              )}
              {busy ? (
                // Uploading: the picked photo is already on screen under the
                // spinner (blob URL below), and clears to full when it lands.
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                    <Icon name="refresh" size="md" className="animate-spin" />
                  </span>
                </span>
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/25">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <Icon name={s.url ? "edit" : "add"} size="sm" />
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Gallery */}
      <div>
        {/* Stacked on phones so the button sits under the heading rather than
            beside it; the original row from `sm` up. */}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-heading-md font-semibold !text-on-surface">Photo gallery</h3>
          <input
            ref={galleryInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              void handleGallery(e.target.files);
              // The input keeps its value, so re-picking the same photo (after
              // removing it) would fire no change event at all.
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={pendingGallery.length ? "refresh" : "add_circle"}
            loading={pendingGallery.length > 0}
            onClick={() => galleryInput.current?.click()}
          >
            Upload photos
          </Button>
        </div>
        {data.gallery.length === 0 && pendingGallery.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-outline-variant p-6 text-center font-body-sm text-on-surface-variant">
            No gallery photos yet. Guests love a peek into your world.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {data.gallery.map((g, i) => (
              <GalleryThumb
                key={`${g.url}-${i}`}
                url={g.url}
                onRemove={() => onChange((prev) => ({ gallery: prev.gallery.filter((x) => x !== g) }))}
              />
            ))}
            {/* Picked but not uploaded yet: the local preview with a spinner. */}
            {pendingGallery.map((p) => (
              <div
                key={p.id}
                aria-busy
                className="relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest"
              >
                <img src={p.preview} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Icon name="refresh" size="md" className="animate-spin" />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Music */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-4">
        {/* Side by side from `sm` up; on phones the buttons sit under the
            title and its caption instead of squeezing them. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
              <Icon name="music_note" size="lg" />
            </span>
            <div>
              <p className="font-body-sm font-semibold !text-on-surface">Wedding soundtrack</p>
              <p className="font-body-xs text-on-surface-variant">
                {data.music
                  ? isLibraryMediaUrl(data.music.url)
                    ? "Chosen from our library."
                    : "Uploaded by you."
                  : "Pick a track below, or upload your own."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:shrink-0">
            {data.music && (
              <Button type="button" variant="ghost" size="sm" icon="close" onClick={() => onChange({ music: null })}>
                Remove
              </Button>
            )}
            <Button
              type="button"
              variant={data.music && !isLibraryMediaUrl(data.music.url) ? "ghost" : "outline"}
              size="sm"
              icon={uploadingRole === "music" ? "refresh" : "cloud_upload"}
              loading={uploadingRole === "music"}
              onClick={() => void handleMusicPick()}
              className="text-[length:var(--text-body-sm)]"
            >
              {data.music && !isLibraryMediaUrl(data.music.url) ? "Change track" : "Upload own"}
            </Button>
          </div>
        </div>
        {data.music && <audio controls src={data.music.url} className="mt-3 w-full" preload="none" />}

        <MusicLibraryPicker
          selectedUrl={data.music && isLibraryMediaUrl(data.music.url) ? data.music.url : null}
          onSelect={(track) =>
            onChange({
              music: { role: "music", url: track.url, name: libraryTrackName(track) },
            })
          }
        />
      </div>

      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </p>
      )}
    </div>
  );
}

function GalleryThumb({ url, onRemove }: { url: string; onRemove: () => void }) {
  return (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
      <img src={url} alt="" className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove photo"
      >
        <Icon name="close" size="sm" />
      </button>
    </div>
  );
}
