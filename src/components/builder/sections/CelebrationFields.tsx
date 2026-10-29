"use client";

import { TextInput, Textarea } from "@/components/shared/Field";
import type { WeddingData } from "@/lib/builder/defaults";
import { formDefinition, formTypeOf } from "@/lib/builder/forms";
import { useClientNow } from "@/lib/use-client-now";
import { toDateInputValue } from "@/lib/utils";

interface Props {
  data: WeddingData;
  onChange: (patch: Partial<WeddingData>) => void;
}

/**
 * Date and place for a birthday celebration. Deliberately smaller than the
 * wedding schedule: a birthday has one moment and one venue, not a multi-day
 * ceremony list.
 */
export function CelebrationFields({ data, onChange }: Props) {
  const now = useClientNow();
  const today = now ? toDateInputValue(now) : undefined;
  const label = formDefinition(formTypeOf(data)).dateLabel;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label={label}
          type="date"
          value={data.weddingDate}
          min={today}
          onChange={(e) => onChange({ weddingDate: e.target.value })}
          required
        />
        <TextInput
          label="Time (optional)"
          type="time"
          value={data.weddingTime ?? ""}
          onChange={(e) => onChange({ weddingTime: e.target.value || null })}
        />
      </div>

      <TextInput
        label="Venue"
        value={data.venue}
        onChange={(e) => onChange({ venue: e.target.value })}
        placeholder="e.g. The Terrace, Taj Palace"
        icon="location_on"
        required
      />
      <Textarea
        label="Address & directions (optional)"
        value={data.address}
        onChange={(e) => onChange({ address: e.target.value })}
        rows={2}
        placeholder="Street, city, landmark, parking or gate instructions…"
      />
      <TextInput
        label="Google Maps link (optional)"
        value={data.mapsUrl ?? ""}
        onChange={(e) => onChange({ mapsUrl: e.target.value || null })}
        placeholder="https://maps.app.goo.gl/…"
        icon="map"
      />
    </div>
  );
}
