"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";

export interface HeroCarouselImage {
  src: string;
  alt: string;
  label?: string;
}

const AUTOPLAY_MS = 5000;

/**
 * Hero image carousel: auto-advances, pauses while the visitor hovers, focuses
 * or hides the tab, and can be driven by arrows, dots, swipe or ← / → keys.
 * Auto-rotation is disabled entirely when reduced motion is requested.
 */
export function HeroCarousel({ images }: { images: HeroCarouselImage[] }) {
  const [index, setIndex] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dragStart = useRef<number | null>(null);
  const swiped = useRef(false);
  const count = images.length;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const show = useCallback(
    (target: number) => {
      if (count === 0) return;
      setIndex(((target % count) + count) % count);
    },
    [count]
  );

  const autoplay = count > 1 && !engaged && !reducedMotion;

  useEffect(() => {
    if (!autoplay) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplay, count]);

  if (count === 0) return null;

  const current = images[index];

  return (
    <div
      className="relative touch-pan-y rounded-[28px] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sapphire-600"
      role="region"
      aria-roledescription="carousel"
      aria-label="Invitation previews"
      tabIndex={0}
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocusCapture={() => setEngaged(true)}
      onBlurCapture={() => setEngaged(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          show(index + 1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          show(index - 1);
        }
      }}
      onPointerDown={(event) => {
        swiped.current = false;
        dragStart.current = event.clientX;
      }}
      onPointerUp={(event) => {
        const start = dragStart.current;
        dragStart.current = null;
        if (start === null) return;
        const delta = event.clientX - start;
        if (Math.abs(delta) < 48) return;
        swiped.current = true;
        show(delta < 0 ? index + 1 : index - 1);
      }}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl border border-ivory-300 bg-ivory-100 shadow-2xl shadow-navy-500/10">
        <Link
          href="/templates"
          aria-label="Explore all templates"
          className="block h-full w-full cursor-pointer"
          onClick={(event) => {
            if (swiped.current) event.preventDefault();
          }}
        >
          {images.map((image, i) => (
            <div
              key={image.src}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={i !== index}
              className={cn(
                "absolute inset-0 transition-opacity duration-700 ease-out",
                i === index ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              <img
                src={image.src}
                alt={image.alt}
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
                className="h-full w-full select-none object-cover"
              />
            </div>
          ))}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ivory-950/85 via-ivory-950/25 to-transparent px-5 pb-4 pt-12">
            <div className="min-w-0">
              {current.label && (
                <p className="truncate font-heading-sm !text-ivory-50">{current.label}</p>
              )}
              <p className="font-body-xs uppercase tracking-[0.25em] text-ivory-200">
                {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
              </p>
            </div>
          </div>
        </Link>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => show(index - 1)}
          aria-label="Previous image"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-navy-300 bg-ivory-50 text-navy-800 transition-colors hover:bg-ivory-200"
        >
          <Icon name="chevron_left" size="sm" />
        </button>

        <div className="flex items-center gap-2">
          {images.map((image, i) => (
            <button
              key={image.src}
              type="button"
              onClick={() => show(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                "h-2 rounded-full transition-all",
                i === index ? "w-6 bg-ivory-950" : "w-2 bg-navy-300 hover:bg-navy-400"
              )}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => show(index + 1)}
          aria-label="Next image"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-navy-300 bg-ivory-50 text-navy-800 transition-colors hover:bg-ivory-200"
        >
          <Icon name="chevron_right" size="sm" />
        </button>
      </div>
    </div>
  );
}
