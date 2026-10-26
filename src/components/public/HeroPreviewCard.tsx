import { Icon, type IconName } from "@/components/shared/Icon";

/**
 * Static invitation mock-up shown in the hero while `src/assets` holds no
 * carousel imagery yet (see `src/lib/services/hero-images.ts`), so a fresh
 * checkout still has a finished-looking hero.
 *
 * Rendered inside the hero's `relative` column, which the floating QR chip is
 * positioned against.
 */
export function HeroPreviewCard() {
  return (
    <>
      <div className="rotate-2 rounded-3xl border border-ivory-300 bg-ivory-50 p-6 shadow-2xl shadow-navy-500/10 transition-transform duration-300 hover:rotate-0">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-ivory-950 p-4 text-ivory-50">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-400 text-ivory-950">
              <Icon name="spa" size="md" weight="w600" />
            </span>
            <div>
              <p className="font-body-sm font-semibold">Zayed &amp; Maya</p>
              <p className="font-body-xs text-ivory-300">13 Feb 2026 · The Oberoi, Udaipur</p>
            </div>
          </div>
          <button className="rounded-full bg-ivory-50/20 p-2" aria-label="Play">
            <Icon name="play_circle" size="md" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {["image", "calendar_month", "map"].map((ic) => (
            <div key={ic} className="flex flex-col items-center gap-1.5 rounded-xl border border-navy-200/50 bg-ivory-50 py-3 text-navy-950">
              <Icon name={ic as IconName} size="md" className="text-gold-500" />
              <span className="font-body-xs font-medium">{ic === "image" ? "Gallery" : ic === "calendar_month" ? "Events" : "Venue"}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-navy-200/50 bg-ivory-50 p-4">
          <div className="flex items-center justify-between">
            <p className="font-body-sm font-semibold text-navy-950">RSVP &amp; live guest updates</p>
            <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 font-body-xs font-semibold text-on-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              214 attending
            </span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-highest">
            <div className="h-full w-[82%] rounded-full bg-gradient-to-r from-gold-400 to-gold-600" />
          </div>
          <p className="mt-2 font-body-xs text-navy-600">82% of guests have responded</p>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-6 hidden rotate-[-3deg] rounded-2xl border border-ivory-300 bg-ivory-50 p-3 shadow-xl sm:block">
        <p className="flex items-center gap-2 font-body-xs font-semibold text-navy-950">
          <Icon name="qr_code_2" size="sm" className="text-sapphire-600" />
          Scan &amp; open instantly
        </p>
      </div>
    </>
  );
}
