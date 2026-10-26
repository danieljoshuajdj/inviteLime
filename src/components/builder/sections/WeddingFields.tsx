"use client";

import { Button } from "@/components/shared/Button";
import { TextInput, Textarea } from "@/components/shared/Field";
import { Icon, type IconName } from "@/components/shared/Icon";
import { EMPTY_EVENT, type BuilderEvent, type WeddingData } from "@/lib/builder/defaults";
import { useClientNow } from "@/lib/use-client-now";
import { toDateInputValue, toTimeInputValue } from "@/lib/utils";

interface Props {
  data: WeddingData;
  onChange: (patch: Partial<WeddingData>) => void;
}

const eventIcons: IconName[] = ["spa", "celebration", "church", "local_florist", "flight", "handshake"];

export function WeddingFields({ data, onChange }: Props) {
  // New invitations always look forward, so the pickers are held to the
  // visitor's today/now. A draft saved before midnight can still carry a stale
  // date — that one is caught by the combined step's validation.
  const now = useClientNow();
  const today = now ? toDateInputValue(now) : undefined;
  const nowTime = now ? toTimeInputValue(now) : undefined;

  function setEvent(i: number, patch: Partial<BuilderEvent>) {
    const events = data.events.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    onChange({ events });
  }

  function addEvent() {
    onChange({ events: [...data.events, { ...EMPTY_EVENT }] });
  }

  function removeEvent(i: number) {
    onChange({ events: data.events.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Wedding date"
          type="date"
          value={data.weddingDate}
          min={today}
          onChange={(e) => onChange({ weddingDate: e.target.value })}
          required
        />
        <TextInput
          label="Wedding time (optional)"
          type="time"
          value={data.weddingTime ?? ""}
          min={data.weddingDate === today ? nowTime : undefined}
          onChange={(e) => onChange({ weddingTime: e.target.value || null })}
        />
      </div>

      <TextInput
        label="Venue"
        value={data.venue}
        onChange={(e) => onChange({ venue: e.target.value })}
        placeholder="e.g. The Oberoi, Udaipur"
        icon="location_on"
        required
      />
      <Textarea
        label="Full address & directions"
        value={data.address}
        onChange={(e) => onChange({ address: e.target.value })}
        rows={2}
        placeholder="Street, city, landmark, gate instructions…"
      />
      <TextInput
        label="Google Maps link (optional)"
        value={data.mapsUrl ?? ""}
        onChange={(e) => onChange({ mapsUrl: e.target.value || null })}
        placeholder="https://maps.app.goo.gl/…"
        icon="map"
      />

      {/* Multi-event schedule */}
      <div className="mt-4 border-t border-outline-variant pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-heading-md font-semibold !text-on-surface">Additional ceremonies</h3>
          <Button variant="ghost" size="sm" icon="add" onClick={addEvent}>
            Add event
          </Button>
        </div>
        <p className="mt-1 font-body-xs text-on-surface-variant">
          Mehendi, Sangeet, Pheras, Reception… add them all. Each gets its own card.
        </p>

        {data.events.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-outline-variant p-6 text-center font-body-sm text-on-surface-variant">
            No extra ceremonies yet — you can always add them later from your account.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {data.events.map((ev, i) => (
              <div key={ev.id ?? i} className="rounded-2xl border border-outline-variant bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                      <Icon name={eventIcons[i % eventIcons.length]} size="md" />
                    </span>
                    <TextInput
                      label="Event name *"
                      value={ev.name}
                      onChange={(e) => setEvent(i, { name: e.target.value })}
                      placeholder={i === 0 ? "e.g. Mehendi & Haldi" : "e.g. Reception Dinner"}
                      className="min-w-0 flex-1 sm:flex-none sm:!w-56"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeEvent(i)}
                    className="shrink-0 rounded-full p-2 text-on-surface-variant hover:bg-error/10 hover:text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    aria-label={`Remove ${ev.name || `event ${i + 1}`}`}
                  >
                    <Icon name="delete" size="sm" />
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Date"
                    type="date"
                    value={ev.date ?? ""}
                    min={today}
                    onChange={(e) => setEvent(i, { date: e.target.value || null })}
                  />
                  <TextInput
                    label="Time"
                    type="time"
                    value={ev.time ?? ""}
                    min={ev.date === today ? nowTime : undefined}
                    onChange={(e) => setEvent(i, { time: e.target.value || null })}
                  />
                  <TextInput
                    label="Venue / location"
                    value={ev.venue ?? ""}
                    onChange={(e) => setEvent(i, { venue: e.target.value || null })}
                    placeholder="e.g. Rooftop, Leela Palace"
                  />
                  <TextInput
                    label="Maps link"
                    value={ev.mapsUrl ?? ""}
                    onChange={(e) => setEvent(i, { mapsUrl: e.target.value || null })}
                    placeholder="https://maps.app.goo.gl/…"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
