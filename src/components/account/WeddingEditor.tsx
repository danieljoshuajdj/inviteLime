"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/shared/Button";
import { TextInput, Textarea, FieldWrap } from "@/components/shared/Field";
import { GuestSettingsFields } from "@/components/shared/GuestSettingsFields";
import { Icon } from "@/components/shared/Icon";
import { MediaFields } from "@/components/builder/sections/MediaFields";
import { toast } from "@/components/account/toast";
import {
  EMPTY_EVENT,
  defaultWeddingData,
  normalizeWeddingData,
  type BuilderEvent,
  type WeddingData,
} from "@/lib/builder/defaults";
import { useClientNow } from "@/lib/use-client-now";
import { minSelectable, toDateInputValue, toTimeInputValue } from "@/lib/utils";

export function WeddingEditor({ weddingId }: { weddingId: string }) {
  const [loading, setLoading] = useState(true);
  const [found, setFound] = useState(true);
  const [saving, setSaving] = useState(false);
  // Hold the full wedding payload so media controls can read and write the
  // same fields the builder uses. Normalizing prevents a null from the API
  // reaching a controlled input.
  const [form, setForm] = useState<WeddingData>(() => defaultWeddingData());

  useEffect(() => {
    fetch(`/api/weddings/${weddingId}`)
      .then(async (r) => {
        if (r.status === 404) {
          setFound(false);
          return;
        }
        const json = await r.json();
        setForm(normalizeWeddingData(json));
      })
      .catch(() => setFound(false))
      .finally(() => setLoading(false));
  }, [weddingId]);

  function setEvent(i: number, patch: Partial<BuilderEvent>) {
    setForm((prev) => ({ ...prev, events: prev.events.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) }));
  }

  function applyMedia(
    patch: Partial<WeddingData> | ((prev: WeddingData) => Partial<WeddingData>)
  ) {
    setForm((prev) => ({ ...prev, ...(typeof patch === "function" ? patch(prev) : patch) }));
  }

  // Past dates cannot be picked here either. Unlike the builder, this form is
  // submitted through the browser, which refuses to submit a date below `min`
  // with a "value must be … or later" bubble — so the bound steps aside for a
  // value that is already saved (a wedding that has happened) and only applies
  // to fresh selections.
  const now = useClientNow();
  const today = now ? toDateInputValue(now) : undefined;
  const nowTime = now ? toTimeInputValue(now) : undefined;
  const timeMin = (date: string | null | undefined, value: string | null | undefined) =>
    minSelectable(date === today ? nowTime : undefined, value);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/weddings/${weddingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      toast("Changes saved", "Your published link is unchanged.");
    } catch (err) {
      toast("Could not save", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="font-body text-on-surface-variant">Loading your invitation…</p>;
  }

  if (!found) {
    return (
      <div className="rounded-2xl border border-dashed border-outline-variant p-12 text-center">
        <Icon name="error" size="xl" className="mx-auto text-on-surface-variant" />
        <h2 className="mt-3 font-heading-md font-semibold !text-on-surface">Invitation not found</h2>
        <p className="mt-1 font-body-sm text-on-surface-variant">It may belong to another account, or may have been removed.</p>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="flex max-w-3xl flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput label="Groom's full name" value={form.groomName} onChange={(e) => setForm({ ...form, groomName: e.target.value })} required />
        <TextInput label="Bride's full name" value={form.brideName} onChange={(e) => setForm({ ...form, brideName: e.target.value })} required />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Groom's designation (optional)"
          value={form.groomDesignation}
          onChange={(e) => setForm({ ...form, groomDesignation: e.target.value })}
          maxLength={200}
          placeholder="e.g. Software engineer"
        />
        <TextInput
          label="Bride's designation (optional)"
          value={form.brideDesignation}
          onChange={(e) => setForm({ ...form, brideDesignation: e.target.value })}
          maxLength={200}
          placeholder="e.g. Product designer"
        />
      </div>
      <Textarea label="Couple's story" value={form.story} onChange={(e) => setForm({ ...form, story: e.target.value })} rows={3} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput label="Wedding date" type="date" value={form.weddingDate} min={minSelectable(today, form.weddingDate)} onChange={(e) => setForm({ ...form, weddingDate: e.target.value })} required />
        <TextInput label="Wedding time" type="time" value={form.weddingTime ?? ""} min={timeMin(form.weddingDate, form.weddingTime)} onChange={(e) => setForm({ ...form, weddingTime: e.target.value || null })} />
      </div>
      <TextInput label="Venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} required />
      <TextInput label="Full address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <TextInput label="Maps link" value={form.mapsUrl ?? ""} onChange={(e) => setForm({ ...form, mapsUrl: e.target.value || null })} />

      <div className="border-t border-outline-variant pt-6">
        <h2 className="font-heading-md font-semibold !text-on-surface">Photos &amp; soundtrack</h2>
        <p className="mt-1 font-body-sm text-on-surface-variant">
          These are the images and music shown on your live invitation.
        </p>
        <div className="mt-4">
          <MediaFields weddingId={weddingId} data={form} onChange={applyMedia} />
        </div>
      </div>

      <GuestSettingsFields
        dress={form.dress}
        rsvpEnabled={form.rsvpEnabled}
        rsvpWhatsapp={form.rsvpWhatsapp}
        onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
        idPrefix="account"
      />

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading-md font-semibold !text-on-surface">Additional ceremonies</h2>
          <Button type="button" variant="ghost" size="sm" icon="add" onClick={() => setForm({ ...form, events: [...form.events, { ...EMPTY_EVENT }] })}>
            Add event
          </Button>
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {form.events.map((ev, i) => (
            <div key={ev.id ?? i} className="rounded-xl border border-outline-variant p-4">
              <div className="flex items-center gap-3">
                <TextInput
                  label={`Event ${i + 1} name`}
                  value={ev.name}
                  onChange={(e) => setEvent(i, { name: e.target.value })}
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, events: form.events.filter((_, idx) => idx !== i) })}
                  className="mt-6 shrink-0 rounded-full p-2 text-on-surface-variant hover:bg-error/10 hover:text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  aria-label="Remove event"
                >
                  <Icon name="delete" size="sm" />
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextInput label="Date" type="date" value={ev.date ?? ""} min={minSelectable(today, ev.date)} onChange={(e) => setEvent(i, { date: e.target.value || null })} />
                <TextInput label="Time" type="time" value={ev.time ?? ""} min={timeMin(ev.date, ev.time)} onChange={(e) => setEvent(i, { time: e.target.value || null })} />
                <TextInput label="Venue" value={ev.venue ?? ""} onChange={(e) => setEvent(i, { venue: e.target.value || null })} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <FieldWrap>
        <Button type="submit" size="lg" icon="check" loading={saving}>Save changes</Button>
        <p className="font-body-xs text-on-surface-variant">
          Publishing continues from the <Link href="/app/invitations" className="underline">My invitations</Link> screen.
        </p>
      </FieldWrap>
    </form>
  );
}
