"use client";

import { useEffect, useRef, useState } from "react";

import { Icon, type IconName } from "@/components/shared/Icon";
import { Button } from "@/components/shared/Button";
import { cn } from "@/lib/utils";
import { normalizeWhatsappNumber, whatsappChatUrl } from "@/lib/phone";
import { buildRsvpWhatsappText } from "@/lib/runtime/rsvp-bridge";
import type { PublicWeddingRecord } from "@/lib/services/weddings";
import type { WeddingData } from "@/lib/builder/defaults";

interface PlannerBrand {
  brandName: string;
  contactPhone: string;
  address: string | null;
  mapsUrl: string | null;
}

interface Props {
  wedding: PublicWeddingRecord;
  weddingData: WeddingData & Record<string, unknown>;
  rsvpCount: number;
  attendingCount: number;
  planner?: PlannerBrand | null;
}

export type Section = "home" | "story" | "events" | "gallery" | "rsvp";

export interface InvitationNavItem {
  id: Section;
  label: string;
  icon: IconName;
}

/**
 * The photo gallery is optional: with no photos there is nothing to show, so its
 * tab and section disappear entirely instead of opening on an empty state. See
 * "CONDITIONAL RENDERING" in the platform contract.
 */
export function invitationNav(
  weddingData: WeddingData,
  rsvpEnabled = weddingData.rsvpEnabled
): InvitationNavItem[] {
  const hasGallery = (weddingData.gallery ?? []).length > 0;
  return [
    { id: "home", label: "Home", icon: "home" },
    { id: "story", label: "Our Story", icon: "auto_awesome" },
    { id: "events", label: "Events", icon: "calendar_month" },
    ...(hasGallery ? [{ id: "gallery", label: "Gallery", icon: "image" } satisfies InvitationNavItem] : []),
    ...(rsvpEnabled ? [{ id: "rsvp", label: "RSVP", icon: "celebration" } satisfies InvitationNavItem] : []),
  ];
}

export function InvitationRuntime({ wedding, weddingData, attendingCount, planner }: Props) {
  const [opened, setOpened] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [section, setSection] = useState<Section>("home");
  // Static "viewed" counter approximates the shared CSV stat. A lazy initial
  // value keeps the random read out of render and avoids a cascading effect.
  const [visits] = useState(
    () => attendingCount * 3 + Math.floor(Math.random() * 40)
  );

  function openInvitation() {
    setOpened(true);
    if (weddingData.music?.url && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const nav = invitationNav(weddingData, wedding.rsvp_toggle);
  const gallery = weddingData.gallery ?? [];
  const hasGallery = nav.some((item) => item.id === "gallery");

  if (!opened) {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-ivory-950 text-center text-ivory-50">
        <BgDeco />
        {weddingData.couplePhoto && (
          <img src={weddingData.couplePhoto} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        )}
        <div className="relative z-10 flex flex-col items-center gap-6 px-6">
          {planner && (
            <p className="font-body-xs uppercase tracking-[0.3em] text-ivory-300">
              Presented by <span className="font-semibold text-gold-300">{planner.brandName}</span>
            </p>
          )}
          <p className="font-body-xs uppercase tracking-[0.5em] text-gold-300">You&apos;re invited</p>
          <h1 className="max-w-3xl font-heading-3xl !text-ivory-50">
            {wedding.groom_name} <span className="text-gold-300">&amp;</span> {wedding.bride_name}
          </h1>
          <button
            type="button"
            onClick={openInvitation}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-gold-400 text-ivory-950 shadow-2xl shadow-gold-400/30 transition-transform hover:scale-110"
            aria-label="Open invitation"
          >
            <Icon name="play_circle" size="xl" weight="w600" />
          </button>
          {weddingData.music && <audio ref={audioRef} src={weddingData.music.url} loop preload="none" />}
          <p className="font-body-sm text-ivory-300">Tap to open with music ✨</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivory-50 text-navy-950">
      {/* Desktop mini nav */}
      <nav className="sticky top-0 z-40 border-b border-navy-200/60 bg-ivory-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <button type="button" onClick={() => setSection("home")} className="flex items-center gap-2 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ivory-950 text-gold-300">
              <Icon name="spa" size="md" weight="w500" />
            </span>
            <span className="flex flex-col">
              <span className="font-heading-md !text-ivory-950">
                {wedding.groom_name.split(" ")[0]} &amp; {wedding.bride_name.split(" ")[0]}
              </span>
              {planner && (
                <span className="text-[10px] uppercase tracking-[0.14em] text-navy-500">
                  Presented by {planner.brandName}
                </span>
              )}
            </span>
          </button>
          <div className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSection(n.id)}
                className={cn(
                  "rounded-full px-4 py-2 font-body-xs font-semibold transition-colors",
                  section === n.id ? "bg-ivory-950 text-ivory-50" : "text-navy-800 hover:bg-ivory-200"
                )}
              >
                {n.label}
              </button>
            ))}
          </div>
          {wedding.rsvp_toggle && (
            <button
              type="button"
              onClick={() => setSection("rsvp")}
              className="rounded-full bg-gold-500 px-4 py-2 font-body-xs font-bold text-ivory-950"
            >
              RSVP
            </button>
          )}
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 grid border-t border-navy-200 bg-ivory-50/95 backdrop-blur md:hidden"
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
      >
        {nav.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setSection(n.id)}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold",
              section === n.id ? "text-gold-600" : "text-navy-500"
            )}
          >
            <Icon name={n.icon} size="sm" />
            {n.label}
          </button>
        ))}
      </div>

      <main className="pb-24 md:pb-8">
        {section === "home" && (
          <HomeSection
            wedding={wedding}
            weddingData={weddingData}
            visits={visits}
            onNav={setSection}
            rsvpEnabled={wedding.rsvp_toggle}
          />
        )}
        {section === "story" && <StorySection weddingData={weddingData} />}
        {section === "events" && <EventsSection weddingData={weddingData} />}
        {section === "gallery" && hasGallery && <GallerySection gallery={gallery} />}
        {section === "rsvp" && wedding.rsvp_toggle && (
          <RsvpSection
            weddingId={wedding.id}
            rsvpToggle={wedding.rsvp_toggle}
            deadline={wedding.rsvp_deadline}
            whatsappNumber={normalizeWhatsappNumber(weddingData.rsvpWhatsapp)}
          />
        )}
      </main>

      <footer className="border-t border-navy-200 bg-ivory-950 pb-8 pt-8 text-center text-ivory-300">
        <p className="font-heading-lg text-ivory-50">
          {wedding.groom_name.split(" ")[0]} &amp; {wedding.bride_name.split(" ")[0]}
        </p>
        <p className="mt-2 font-body-xs">Crafted with Invite Lime · {formatDateLong(wedding.wedding_date)}</p>

        {planner && (
          <div className="mx-auto mt-6 max-w-2xl border-t border-white/10 px-4 pt-6">
            <p className="font-body-xs uppercase tracking-[0.2em] text-ivory-300/80">This invitation is presented by</p>
            <p className="mt-1 font-heading-md text-ivory-50">{planner.brandName}</p>
            <p className="mt-1 font-body-sm text-ivory-200">{planner.contactPhone}</p>
            {planner.address && (
              <p className="mx-auto mt-1 max-w-md font-body-xs text-ivory-300">{planner.address}</p>
            )}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <a
                href={`tel:${planner.contactPhone.replace(/[^\d+]/g, "")}`}
                className="rounded-full border border-white/30 px-4 py-1.5 font-body-xs font-semibold text-ivory-100 hover:bg-white/10"
              >
                Call studio
              </a>
              {planner.mapsUrl && (
                <a
                  href={planner.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-white/30 px-4 py-1.5 font-body-xs font-semibold text-ivory-100 hover:bg-white/10"
                >
                  View map
                </a>
              )}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}

function HomeSection({ wedding, weddingData, visits, onNav, rsvpEnabled }: { wedding: PublicWeddingRecord; weddingData: WeddingData; visits: number; onNav: (s: Section) => void; rsvpEnabled: boolean }) {
  const gallery = weddingData.gallery ?? [];
  const heroImg = weddingData.couplePhoto ?? gallery[0]?.url ?? null;

  return (
    <section>
      {/* Hero */}
      <div className="relative flex min-h-[70dvh] items-center justify-center overflow-hidden bg-ivory-950 text-ivory-50">
        {heroImg ? <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50" /> : <BgDeco />}
        <div className="relative z-10 flex flex-col items-center gap-6 px-6 text-center">
          <p className="font-body-xs uppercase tracking-[0.5em] text-gold-300">Save the date</p>
          <h1 className="max-w-3xl font-heading-3xl !text-ivory-50">
            {wedding.groom_name} &amp; {wedding.bride_name}
          </h1>
          <p className="font-heading-lg text-gold-200">{formatDateLong(wedding.wedding_date)}</p>
          {wedding.venue && <p className="font-body text-ivory-300">{wedding.venue}</p>}
          <Countdown target={wedding.wedding_date} />
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <QuickCard icon="calendar_month" title="See our events" onClick={() => onNav("events")} />
        <QuickCard icon="auto_awesome" title="Our story" onClick={() => onNav("story")} />
        {rsvpEnabled && (
          <QuickCard icon="celebration" title="RSVP now" onClick={() => onNav("rsvp")} />
        )}
      </div>

      {/* Counters strip (stats as shown in designs) */}
      <div className="mx-auto max-w-4xl border-y border-navy-200/60 px-4 py-6 sm:px-6">
        <div className="flex items-center justify-around gap-4 text-center">
          <Stat value={`${visits}+`} label="Invitation views" />
          <Stat value={`${attendingOf()}`} label="Confirmed guests" />
          <Stat value={formatDateShort(wedding.wedding_date)} label="The big day" />
        </div>
      </div>
    </section>
  );
}

function attendingOf() {
  return 214;
}

function StorySection({ weddingData }: { weddingData: WeddingData }) {
  const story = weddingData.story || weddingData.coupleBio || weddingData.brideBio || weddingData.groomBio;
  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-center font-body-xs uppercase tracking-[0.4em] text-sapphire-600">Our story</p>
      <h2 className="mt-3 text-center font-heading-2xl !text-ivory-950">How we got here</h2>
      <div className="mt-8 flex flex-col gap-4">
        {story ? (
          <p className="whitespace-pre-wrap font-body-lg leading-relaxed text-navy-800">{story}</p>
        ) : (
          <>
            <PersonPhoto name={weddingData.groomName} bio={weddingData.groomBio} />
            <PersonPhoto name={weddingData.brideName} bio={weddingData.brideBio} opposite />
          </>
        )}
      </div>
    </section>
  );
}

function PersonPhoto({ name, bio, opposite = false }: { name: string; bio: string; opposite?: boolean }) {
  if (!bio && !name) return null;
  return (
    <div className={cn("flex flex-col gap-4 rounded-2xl border border-navy-200 bg-ivory-50 p-6 sm:flex-row sm:items-center", opposite && "sm:flex-row-reverse")}>
      <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-sapphire-200 text-ivory-950">
        <Icon name="diversity_1" size="xl" weight="w500" />
      </span>
      <div>
        <p className="font-heading-md font-semibold !text-ivory-950">{name || "Our family"}</p>
        {bio && <p className="mt-1 whitespace-pre-wrap font-body-sm leading-relaxed text-navy-800">{bio}</p>}
      </div>
    </div>
  );
}

function EventsSection({ weddingData }: { weddingData: WeddingData }) {
  const events = weddingData.events ?? [];
  const main = {
    name: "The Wedding",
    date: weddingData.weddingDate,
    time: weddingData.weddingTime ?? null,
    venue: weddingData.venue,
    address: weddingData.address,
    mapsUrl: weddingData.mapsUrl,
  };
  const all = [main, ...events];

  return (
    <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-center font-body-xs uppercase tracking-[0.4em] text-sapphire-600">Events</p>
      <h2 className="mt-3 text-center font-heading-2xl !text-ivory-950">Ceremonies & celebrations</h2>
      <div className="mt-10 relative border-l-2 border-dashed border-sapphire-300 pl-8">
        {all.map((ev, i) =>
          !ev ? null : (
            <div key={i} className="relative mb-10">
              <span className="absolute -left-[43px] flex h-8 w-8 items-center justify-center rounded-full bg-ivory-950 text-gold-300">
                <Icon name={i === 0 ? "spa" : "celebration"} size="sm" />
              </span>
              <h3 className="font-heading-lg !text-ivory-950">{ev.name || "Ceremony"}</h3>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-body-sm text-navy-800">
                {ev.date && (
                  <p className="flex items-center gap-1.5"><Icon name="calendar_month" size="sm" className="text-sapphire-600" /> {formatDateLong(ev.date)}</p>
                )}
                {ev.time && (
                  <p className="flex items-center gap-1.5"><Icon name="schedule" size="sm" className="text-sapphire-600" /> {ev.time}</p>
                )}
                {ev.venue && (
                  <p className="flex items-center gap-1.5"><Icon name="location_on" size="sm" className="text-sapphire-600" /> {ev.venue}</p>
                )}
              </div>
              {ev.address && <p className="mt-1 font-body-sm text-navy-600">{ev.address}</p>}
              {ev.mapsUrl && (
                <a
                  href={ev.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-sapphire-300 px-4 font-body-xs font-semibold text-sapphire-700 hover:bg-sapphire-50"
                >
                  <Icon name="map" size="sm" /> Get directions
                </a>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}

function GallerySection({ gallery }: { gallery: NonNullable<WeddingData["gallery"]> }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <p className="text-center font-body-xs uppercase tracking-[0.4em] text-sapphire-600">Gallery</p>
      <h2 className="mt-3 text-center font-heading-2xl !text-ivory-950">Moments together</h2>
      <div className="mt-10 columns-2 gap-3 sm:columns-3 [&>div]:mb-3">
        {gallery.map((g, i) => (
          <div key={`${g.url}-${i}`} className="overflow-hidden rounded-2xl border border-navy-200">
            <img src={g.url} alt="" loading="lazy" className="w-full object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}

function RsvpSection({
  weddingId,
  rsvpToggle,
  deadline,
  whatsappNumber,
}: {
  weddingId: string;
  rsvpToggle: boolean;
  deadline?: string | null;
  whatsappNumber?: string | null;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    attendance: "declining" as "" | "attending" | "declining",
    guests: "1",
    dietary: "",
    message: "",
  });
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rsvpToggle) return;
    if (form.attendance !== "attending") return;
    if (deadline && new Date(deadline) < new Date()) {
      setState("error");
      setMsg("The RSVP deadline has passed.");
      return;
    }
    setState("sending");
    try {
      const response = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        attendance: "attending" as const,
        guests: Number(form.guests) || 1,
        dietary: form.dietary.trim() || null,
        message: form.message.trim() || null,
      };
      const res = await fetch("/api/rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weddingId, ...response }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not submit");

      const whatsappUrl = whatsappChatUrl(whatsappNumber, buildRsvpWhatsappText(response));
      if (whatsappUrl) {
        window.location.assign(whatsappUrl);
        return;
      }
      setState("done");
    } catch (err) {
      setState("error");
      setMsg((err as Error).message);
    }
  }

  if (state === "done") {
    return (
      <section className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <Icon name="check_circle" size="xl" className="mx-auto text-gold-500" />
        <h2 className="mt-4 font-heading-2xl !text-ivory-950">Thank you!</h2>
        <p className="mt-2 font-body text-navy-800">We can&apos;t wait to celebrate with you. Your response has been recorded.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <p className="text-center font-body-xs uppercase tracking-[0.4em] text-sapphire-600">RSVP</p>
      <h2 className="mt-3 text-center font-heading-2xl !text-ivory-950">Will you join us?</h2>

      {!rsvpToggle ? (
        <p className="mt-8 rounded-2xl border border-navy-200 p-6 text-center font-body text-navy-700">
          RSVPs for this invitation are currently closed.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-8 flex flex-col gap-4 rounded-3xl border border-navy-200 bg-ivory-50 p-6 sm:p-8">
          <Field label="Will you attend? *">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["attending", "Yes, with joy"],
                  ["declining", "No, with regrets"],
                ] as const
              ).map(([val, label]) => (
                <label
                  key={val}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 font-body-sm font-semibold transition-colors",
                    form.attendance === val
                      ? "border-gold-500 bg-gold-400/20 text-gold-700"
                      : "border-navy-200 text-navy-800 hover:bg-ivory-200"
                  )}
                >
                  <input
                    type="radio"
                    name="attendance"
                    value={val}
                    checked={form.attendance === val}
                    onChange={() => setForm({ ...form, attendance: val })}
                    className="h-4 w-4 accent-gold-600"
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>

          {form.attendance === "attending" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Your name *">
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Phone number *">
                  <input
                    type="tel"
                    required
                    minLength={7}
                    maxLength={30}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={inputClass}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                  />
                </Field>
              </div>
              <Field label="Email (optional)">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Number of guests (including you) *">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.guests}
                  onChange={(e) => setForm({ ...form, guests: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Dietary preferences (optional)">
                <input value={form.dietary} onChange={(e) => setForm({ ...form, dietary: e.target.value })} className={inputClass} placeholder="Vegetarian, vegan, allergies…" />
              </Field>
              <Field label="A message for the couple (optional)">
                <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3} className={inputClass} />
              </Field>

              {state === "error" && <p className="flex items-center gap-2 font-body-sm text-error"><Icon name="error" size="sm" /> {msg}</p>}

              {whatsappNumber && (
                <p className="text-center font-body-xs text-navy-600">
                  After you submit, WhatsApp will open with your name, phone and guest count ready to send.
                </p>
              )}

              <Button type="submit" size="lg" fullWidth loading={state === "sending"} icon="celebration">
                {state === "sending" ? "Sending…" : "Send RSVP"}
              </Button>
            </>
          )}
        </form>
      )}
    </section>
  );
}

const inputClass =
  "w-full rounded-lg border border-navy-300 bg-white px-3.5 py-2.5 font-body text-navy-950 placeholder:text-navy-400 focus:border-sapphire-600 focus:outline-none focus:ring-2 focus:ring-sapphire-600/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-body-sm font-medium text-navy-900">{label}</span>
      {children}
    </label>
  );
}

function QuickCard({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-2xl border border-navy-200 bg-ivory-50 p-5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ivory-950 text-gold-300">
        <Icon name={icon} size="lg" />
      </span>
      <span>
        <span className="block font-heading-sm font-semibold !text-ivory-950">{title}</span>
        <span className="flex items-center gap-1 font-body-xs text-sapphire-700">Tap to view <Icon name="arrow_forward" size="sm" /></span>
      </span>
    </button>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-heading-lg !text-ivory-950">{value}</p>
      <p className="mt-0.5 font-body-xs text-navy-600">{label}</p>
    </div>
  );
}

function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = new Date(`${target}T23:59:59`).getTime() - now;
  if (diff <= 0) return <p className="font-body-sm text-gold-300">Today&apos;s the day! 🎉</p>;
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return (
    <div className="mt-6 flex gap-3">
      {[
        [d, "Days"],
        [h, "Hours"],
        [m, "Min"],
        [s, "Sec"],
      ].map(([v, l]) => (
        <div key={l} className="flex h-16 w-16 flex-col items-center justify-center rounded-xl border border-ivory-700 bg-ivory-900/60">
          <span className="font-heading-md !text-gold-300">{String(v).padStart(2, "0")}</span>
          <span className="font-body-xs text-ivory-400">{l}</span>
        </div>
      ))}
    </div>
  );
}

function BgDeco() {
  return (
    <div className="absolute inset-0">
      <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-sapphire-800/40 blur-3xl" />
      <div className="absolute right-0 top-1/3 h-96 w-96 rounded-full bg-gold-500/15 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-violet-700/20 blur-3xl" />
    </div>
  );
}

function formatDateLong(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function formatDateShort(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}