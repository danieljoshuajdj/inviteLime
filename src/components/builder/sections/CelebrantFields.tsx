"use client";

import { TextInput, Textarea } from "@/components/shared/Field";
import type { WeddingData } from "@/lib/builder/defaults";
import { ordinal, type FormType } from "@/lib/builder/forms";
import { BIRTHDAY_NUMBER_MAX, BIRTHDAY_NUMBER_MIN } from "@/lib/builder/validation";

interface Props {
  data: WeddingData;
  onChange: (patch: Partial<WeddingData>) => void;
  formType: FormType;
}

/**
 * The person a birthday invitation celebrates. Birthday Wishes also collects
 * the age and the greeting itself; those fields are intentionally absent from
 * the celebration form, which is a party invitation rather than a card.
 */
export function CelebrantFields({ data, onChange, formType }: Props) {
  const wishes = formType === "birthday_wishes";
  const age =
    typeof data.birthdayNumber === "number" && data.birthdayNumber >= BIRTHDAY_NUMBER_MIN
      ? `${ordinal(data.birthdayNumber)} Birthday`
      : null;

  return (
    <div className="flex flex-col gap-5">
      <TextInput
        label="Birthday person's name"
        value={data.celebrantName}
        onChange={(e) => onChange({ celebrantName: e.target.value })}
        placeholder="e.g. Ananya Sharma"
        icon="person"
        required
      />

      {wishes && (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextInput
              label="Birthday number"
              type="number"
              inputMode="numeric"
              min={BIRTHDAY_NUMBER_MIN}
              max={BIRTHDAY_NUMBER_MAX}
              step={1}
              value={data.birthdayNumber ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                onChange({ birthdayNumber: value === "" ? null : Number(value) });
              }}
              placeholder="e.g. 21"
              icon="celebration"
              hint={age ? `Shown on the invitation as “${age}”.` : "The age being celebrated, from 1 to 150."}
              required
            />
          </div>
          <Textarea
            label="Special message"
            value={data.specialMessage}
            onChange={(e) => onChange({ specialMessage: e.target.value })}
            rows={4}
            placeholder="Write the birthday wish that will appear on the invitation…"
            hint="Your own words, shown as the heart of the invitation."
            required
          />
        </>
      )}
    </div>
  );
}
