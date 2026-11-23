import { cn } from "@/lib/utils";

interface Props {
  /** Visible copy under the pulse, e.g. "Opening invitation…". */
  label?: string;
  className?: string;
  /** Override the dot colour when the loader sits outside the ivory theme. */
  dotClassName?: string;
}

/**
 * Quiet three-dot pulse used while a template boots. `animate-pulse` carries
 * the motion; the staggered delays turn the dots into a gentle wave.
 */
export function PulseLoader({ label, className, dotClassName }: Props) {
  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className={cn("flex flex-col items-center gap-3 text-center", className)}
    >
      <span className="flex items-center gap-1.5" aria-hidden>
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className={cn(
              "h-2.5 w-2.5 animate-pulse rounded-full bg-secondary motion-reduce:animate-none",
              dotClassName
            )}
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      {label ? (
        <p className="font-body-sm text-on-surface-variant" aria-hidden>
          {label}
        </p>
      ) : null}
    </div>
  );
}
