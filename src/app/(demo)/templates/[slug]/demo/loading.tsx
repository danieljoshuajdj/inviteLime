import { PulseLoader } from "@/components/shared/PulseLoader";

/** Instant theme-coloured feedback while the demo runtime is prepared. */
export default function TemplateDemoLoading() {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-surface px-6">
      <PulseLoader label="Opening invitation…" />
    </div>
  );
}
