"use client";

import { useMemo, useRef, useState } from "react";

import { Badge, EmptyState } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Toggle } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";
import { formatDate } from "@/lib/utils";
// Imported from the client-safe module: `@/lib/services/music-library` pulls in
// the storage client, whose `server-only` guard cannot be bundled for the browser.
import { MAX_MUSIC_BYTES, type MusicTrack } from "@/lib/library-media";

interface Props {
  initialTracks: MusicTrack[];
}

export function MusicManager({ initialTracks }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[]>(initialTracks);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MusicTrack | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const activeCount = useMemo(() => tracks.filter((t) => t.isActive).length, [tracks]);

  function chooseFile(next: File | null) {
    setFile(next);
    setError(null);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose an audio file before adding the track.");
      return;
    }
    if (!title.trim()) {
      setError("Give the track a title before adding it.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      fd.append("artist", artist.trim());
      // Read the duration client-side so the picker can show it without the
      // server having to decode the file.
      fd.append("durationMs", String(await readDuration(file)));

      const res = await fetch("/api/admin/music", { method: "POST", body: fd });
      const json = (await res.json()) as { track?: MusicTrack; error?: string };
      if (!res.ok || !json.track) throw new Error(json.error ?? "Upload failed");

      setTracks((prev) =>
        [...prev, json.track!].sort((a, b) => a.title.localeCompare(b.title))
      );
      setTitle("");
      setArtist("");
      clearFile();
      toast("Track added", `${json.track.title} is now available in the library`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(track: MusicTrack, isActive: boolean) {
    setBusyId(track.id);
    const previous = tracks;
    // Optimistic: the toggle is trivially reversible.
    setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, isActive } : t)));
    try {
      const res = await fetch(`/api/admin/music/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Update failed");
      toast(isActive ? "Track visible" : "Track hidden", track.title);
    } catch (e) {
      setTracks(previous);
      toast("Update failed", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(track: MusicTrack) {
    setBusyId(track.id);
    try {
      const res = await fetch(`/api/admin/music/${track.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Delete failed");
      setTracks((prev) => prev.filter((t) => t.id !== track.id));
      setPendingDelete(null);
      toast("Track deleted", track.title);
    } catch (e) {
      toast("Delete failed", (e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-outline-variant bg-surface-container-low p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
            <Icon name="music_note" size="lg" />
          </span>
          <div>
            <h2 className="font-heading-md font-semibold !text-on-surface">Upload a track</h2>
            <p className="font-body-xs text-on-surface-variant">
              Couples can pick any active track for their invitation, or upload their own.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <input
            ref={fileInput}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/ogg,audio/aac,audio/wav,audio/flac,audio/webm"
            hidden
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              icon="upload"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {file ? "Choose another file" : "Choose audio file"}
            </Button>
            <p className="font-body-xs text-on-surface-variant">
              MP3, OGG, M4A, WAV or FLAC · up to {Math.floor(MAX_MUSIC_BYTES / (1024 * 1024))}MB
            </p>
          </div>

          {file && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-body-sm font-medium text-on-surface">{file.name}</p>
                <p className="font-body-xs text-on-surface-variant">
                  {formatBytes(file.size) ?? "Audio file"} selected · give it a title, then click Add to library
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon="close"
                onClick={clearFile}
                disabled={uploading}
              >
                Remove
              </Button>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              label="Title"
              required
              value={title}
              placeholder="First Dance"
              onChange={(e) => {
                setTitle(e.target.value);
                setError(null);
              }}
            />
            <TextInput
              label="Artist"
              value={artist}
              placeholder="Optional"
              onChange={(e) => setArtist(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" icon="add" loading={uploading}>
              {uploading ? "Adding track" : "Add to library"}
            </Button>
            <p className="font-body-xs text-on-surface-variant">
              The track joins the library only after you submit this form.
            </p>
          </div>
          {error && (
            <p className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
              <Icon name="error" size="sm" /> {error}
            </p>
          )}
        </form>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-heading-md font-semibold !text-on-surface">
            Library{" "}
            <span className="font-body-sm font-normal text-on-surface-variant">
              {activeCount} active of {tracks.length}
            </span>
          </h2>
        </div>

        {tracks.length === 0 ? (
          <EmptyState
            icon="music_off"
            title="No tracks yet"
            description="Upload an audio file above and it will appear in every guest's music picker."
            className="mt-3 rounded-2xl border border-dashed border-outline-variant"
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="flex flex-col gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-body-sm font-semibold !text-on-surface">{track.title}</p>
                    {!track.isActive && <Badge tone="warning">Hidden</Badge>}
                  </div>
                  <p className="font-body-xs text-on-surface-variant">
                    {[
                      track.artist,
                      formatDuration(track.durationMs),
                      formatBytes(track.sizeBytes),
                      `added ${formatDate(track.createdAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                <audio
                  controls
                  preload="none"
                  src={track.url}
                  className="h-9 w-full max-w-xs shrink-0"
                  aria-label={`Preview ${track.title}`}
                />

                <div className="flex shrink-0 items-center gap-3">
                  <Toggle
                    label={track.isActive ? "Visible" : "Hidden"}
                    checked={track.isActive}
                    disabled={busyId === track.id}
                    onChange={(next) => void toggleActive(track, next)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="delete"
                    className="!text-error"
                    aria-label={`Delete ${track.title}`}
                    onClick={() => setPendingDelete(track)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeleteTrackDialog
        key={pendingDelete?.id ?? "none"}
        track={pendingDelete}
        busy={busyId === pendingDelete?.id}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && void remove(pendingDelete)}
      />
    </div>
  );
}

function DeleteTrackDialog({
  track,
  busy,
  onCancel,
  onConfirm,
}: {
  track: MusicTrack | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!track) return null;

  return (
    <Modal
      open
      onClose={onCancel}
      title="Delete this track?"
      icon="warning"
      size="md"
      blockBackdropClose={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" icon="delete" loading={busy} onClick={onConfirm}>
            Delete track
          </Button>
        </>
      }
    >
      <div className="space-y-3 font-body-sm text-on-surface-variant">
        <p>
          <strong className="!text-on-surface">{track.title}</strong> will be removed from the
          library and its audio deleted from storage.
        </p>
        <p className="rounded-lg bg-error/10 px-3 py-2 text-error">
          Invitations that already chose this track keep working: each one holds its own copy of the
          audio. Guests who have not chosen yet will no longer see it.
        </p>
        {!track.isActive && (
          <p className="rounded-lg bg-warning/10 px-3 py-2 text-warning">
            This track is already hidden. Deleting it removes it entirely.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Reads duration via a detached audio element; 0 when the browser cannot. */
function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("audio");
    const done = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    // A corrupt or unsupported file must not block the upload, so any failure
    // resolves to "unknown duration" rather than rejecting.
    el.onloadedmetadata = () =>
      done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0);
    el.onerror = () => done(0);
    el.src = url;
  });
}

function formatDuration(ms: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number | null): string | null {
  if (bytes === null || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}