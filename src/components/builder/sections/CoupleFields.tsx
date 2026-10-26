"use client";

import { TextInput, Textarea } from "@/components/shared/Field";
import type { WeddingData } from "@/lib/builder/defaults";

interface Props {
  data: WeddingData;
  onChange: (patch: Partial<WeddingData>) => void;
}

export function CoupleFields({ data, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Groom's full name"
          value={data.groomName}
          onChange={(e) => onChange({ groomName: e.target.value })}
          placeholder="e.g. Zayed Khan"
          icon="person"
          required
        />
        <TextInput
          label="Bride's full name"
          value={data.brideName}
          onChange={(e) => onChange({ brideName: e.target.value })}
          placeholder="e.g. Maya Sharma"
          icon="person"
          required
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextInput
          label="Groom's designation (optional)"
          value={data.groomDesignation}
          onChange={(e) => onChange({ groomDesignation: e.target.value })}
          placeholder="e.g. Software engineer"
          maxLength={200}
        />
        <TextInput
          label="Bride's designation (optional)"
          value={data.brideDesignation}
          onChange={(e) => onChange({ brideDesignation: e.target.value })}
          placeholder="e.g. Product designer"
          maxLength={200}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Textarea
          label="Groom's short bio"
          value={data.groomBio}
          onChange={(e) => onChange({ groomBio: e.target.value })}
          rows={3}
          placeholder="A warm note guests will love on your invitation…"
        />
        <Textarea
          label="Bride's short bio"
          value={data.brideBio}
          onChange={(e) => onChange({ brideBio: e.target.value })}
          rows={3}
          placeholder="A warm note guests will love on your invitation…"
        />
      </div>

      <Textarea
        label="Our story"
        hint="Optional — up to 4,000 characters. This becomes a full section on the published site."
        value={data.story}
        onChange={(e) => onChange({ story: e.target.value })}
        rows={4}
        placeholder="How you met, the proposal, the moment you knew…"
      />
    </div>
  );
}
