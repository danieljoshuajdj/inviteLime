import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

/** Brand assets served from `/public` (sourced from the root SVG files). */
const ICON_SRC = "/invite-lime-icon.svg";
const WORDMARK_SRC = "/invite-lime-wordmark.svg";

/** Intrinsic width ÷ height of each asset, so the marks never distort. */
const ICON_ASPECT = 360 / 360;
const WORDMARK_ASPECT = 1000 / 220;

interface MarkProps {
  /** Rendered height in pixels; width scales with the asset ratio. */
  height?: number;
  className?: string;
  /** Preload the asset (use on the first screenful). */
  priority?: boolean;
  /** Accessible label; pass "" when paired with a visible wordmark. */
  alt?: string;
}

/**
 * The interlocked IL monogram on its own — the compact form of the logo for
 * tight spots (mobile bars, buttons, app-icon style placements).
 */
export function LogoIcon({ height = 30, className, priority = false, alt = "Invite Lime" }: MarkProps) {
  return (
    <Image
      src={ICON_SRC}
      alt={alt}
      width={Math.round(height * ICON_ASPECT)}
      height={height}
      priority={priority}
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}

/** The "Invite Lime" wordmark on its own (type only, no monogram). */
export function LogoWordmark({ height = 38, className, priority = false, alt = "Invite Lime" }: MarkProps) {
  return (
    <Image
      src={WORDMARK_SRC}
      alt={alt}
      width={Math.round(height * WORDMARK_ASPECT)}
      height={height}
      priority={priority}
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}

interface LogoProps {
  /** Height of the wordmark; the monogram scales off it. */
  height?: number;
  className?: string;
  /** Render the monogram alone — for spaces too tight for the wordmark. */
  iconOnly?: boolean;
  /**
   * Wrap the lockup on a light chip so the forest-green lettering stays legible
   * on dark surfaces (e.g. the footer).
   */
  onDark?: boolean;
  /** Preload the mark (use on the first screenful). */
  priority?: boolean;
}

/**
 * The full brand lockup — monogram + wordmark — or the monogram alone when
 * `iconOnly` is set.
 */
export function Logo({ height = 38, className, iconOnly = false, onDark = false, priority = false }: LogoProps) {
  const lockup = iconOnly ? (
    <LogoIcon height={Math.round(height * 0.8)} priority={priority} alt="Invite Lime" />
  ) : (
    <span className="inline-flex items-center gap-2">
      <LogoIcon height={Math.round(height * 0.8)} priority={priority} alt="" />
      <LogoWordmark height={height} priority={priority} alt="" />
    </span>
  );

  if (!onDark) {
    return <span className={cn("inline-flex items-center", className)}>{lockup}</span>;
  }

  return (
    <span className={cn("inline-flex items-center rounded-xl bg-ivory-50 px-3 py-2 shadow-sm", className)}>
      {lockup}
    </span>
  );
}

/** The lockup wrapped in a link, for headers, sidebars and footers. */
export function LogoLink({ href = "/", className, ...props }: LogoProps & { href?: string }) {
  return (
    <Link href={href} aria-label="Invite Lime home" className={cn("inline-flex items-center", className)}>
      <Logo {...props} />
    </Link>
  );
}
