"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import type { MusicTrack } from "@/lib/library-media";

interface Props {
  /** URL of the track currently chosen from the library, if any. */
  selectedUrl: string | null;
  onSelect: (track: MusicTrack) => void;
  /** Event category slug; only tracks offered in it are listed. */
  categorySlug?: string | null;
}

/**
 * Lets a guest choose a track from the platform library.
 *
 * Degrades quietly: if the library cannot be loaded, the section reports that
 * and disappears, leaving the always-available "upload your own" path. A guest
 * with no audio in the library must still be able to finish their invitation.
 */
export function MusicLibraryPicker({ selectedUrl, onSelect, categorySlug }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [failed, setFailed] = useState(false);
  /** Category the current `tracks`/`failed` pair was loaded for. */
  const [loadedCategory, setLoadedCategory] = useState<string | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const categoryKey = categorySlug ?? null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const key = categorySlug ?? null;
    const query = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : "";

    fetch(`/api/music/library${query}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("unavailable"))))
      .then((json: { tracks?: MusicTrack[] }) => {
        if (!active) return;
        setTracks(Array.isArray(json.tracks) ? json.tracks : []);
        setFailed(false);
        setLoadedCategory(key);
      })
      .catch(() => {
        // Abort is not a failure worth surfacing.
        if (active && controller.signal.aborted === false) {
          setTracks(null);
          setFailed(true);
          setLoadedCategory(key);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [categorySlug]);

  // A category change re-queries; never show the previous category's tracks
  // while the new list is in flight.
  if (loadedCategory !== categoryKey) return null;
  if (failed) return null;
  if (tracks === null) return null;
  if (tracks.length === 0) return null;

  const visible = expanded ? tracks : tracks.slice(0, 3);

  return (
    // Deliberately not a card of its own: it already lives inside the
    // soundtrack card, and a box within a box read as two competing panels.
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name="queue_music" size="md" />
          </span>
          <div>
            <p className="font-body-sm font-semibold !text-on-surface">Choose from our library</p>
            <p className="font-body-xs text-on-surface-variant">
              Royalty-free tracks, ready to go. No upload needed.
            </p>
          </div>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {visible.map((track) => {
          const isSelected = track.url === selectedUrl;
          return (
            <li
              key={track.id}
              className={
                isSelected
                  ? "flex flex-col gap-2 rounded-xl border-2 border-primary bg-surface p-3 sm:flex-row sm:items-center"
                  : "flex flex-col gap-2 rounded-xl border border-outline-variant bg-surface p-3 sm:flex-row sm:items-center"
              }
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-body-sm font-semibold !text-on-surface">
                  {isSelected && <Icon name="check" size="sm" className="text-primary" />}
                  {track.title}
                </p>
                {track.artist && (
                  <p className="font-body-xs text-on-surface-variant">{track.artist}</p>
                )}
              </div>
              <audio
                controls
                preload="none"
                src={track.url}
                className="h-9 w-full max-w-[240px] shrink-0"
                aria-label={`Preview ${track.title}`}
              />
              <Button
                type="button"
                variant={isSelected ? "outline" : "primary"}
                size="sm"
                disabled={isSelected}
                onClick={() => onSelect(track)}
                className="shrink-0"
              >
                {isSelected ? "Selected" : "Use this"}
              </Button>
            </li>
          );
        })}
      </ul>

      {tracks.length > 3 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={expanded ? "expand_less" : "expand_more"}
          className="mt-2"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show fewer" : `Show all ${tracks.length} tracks`}
        </Button>
      )}
    </div>
  );
}