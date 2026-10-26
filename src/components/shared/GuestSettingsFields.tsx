"use client";

import { TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { hasPhoneDigits } from "@/lib/phone";
import {
  DEFAULT_DRESS_COLORS,
  validDressColor,
  type BuilderDressCode,
  type BuilderDressSide,
} from "@/lib/builder/defaults";
import { cn } from "@/lib/utils";

interface Props {
  dress: BuilderDressCode | null;
  rsvpEnabled: boolean;
  rsvpWhatsapp: string;
  onChange: (patch: {
    dress?: BuilderDressCode | null;
    rsvpEnabled?: boolean;
    rsvpWhatsapp?: string;
  }) => void;
  idPrefix?: string;
}

function sideWithDefaults(
  side: BuilderDressSide | undefined,
  fallback: string
): BuilderDressSide {
  return {
    color: validDressColor(side?.color) ?? fallback,
    colorName: side?.colorName ?? "",
  };
}

function YesNoChoice({
  name,
  legend,
  description,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset>
      <legend className="font-body-sm font-semibold text-on-surface">{legend}</legend>
      <p className="mt-1 font-body-xs text-on-surface-variant">{description}</p>
      {/* Two equal columns that shrink with the card — fixed min widths used
          to push the pair past the card edge on narrow phones. */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { label: "Yes", checked: value },
          { label: "No", checked: !value },
        ].map((option) => (
          <label
            key={option.label}
            className={cn(
              "flex w-full min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 font-body-sm font-semibold transition-colors sm:gap-2 sm:px-4",
              option.checked
                ? "border-primary bg-primary/5 text-primary"
                : "border-outline-variant bg-surface text-on-surface-variant hover:border-outline"
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.label.toLowerCase()}
              checked={option.checked}
              onChange={() => onChange(option.label === "Yes")}
              className="h-4 w-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ColourField({
  label,
  side,
  fallback,
  onChange,
}: {
  label: string;
  side: BuilderDressSide;
  fallback: string;
  onChange: (patch: Partial<BuilderDressSide>) => void;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <p className="font-body-sm font-semibold text-on-surface">{label}</p>
      <div className="mt-3 flex items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-body-xs font-medium text-on-surface-variant">Colour</span>
          <input
            type="color"
            aria-label={`${label} colour`}
            value={side.color ?? fallback}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-11 w-14 cursor-pointer rounded-lg border border-outline-variant bg-surface p-1"
          />
        </label>
        <TextInput
          label="Colour name (optional)"
          value={side.colorName ?? ""}
          onChange={(e) => onChange({ colorName: e.target.value })}
          placeholder="e.g. Rosewood"
          className="min-w-0 flex-1"
          maxLength={80}
        />
      </div>
    </div>
  );
}

/**
 * Shared by the guest builder and the account editor so both expose the same
 * optional dress-code and RSVP choices. Neither field is required.
 */
export function GuestSettingsFields({ dress, rsvpEnabled, rsvpWhatsapp, onChange, idPrefix = "guest" }: Props) {
  const enabled = Boolean(dress?.enabled);
  const bride = sideWithDefaults(dress?.bride, DEFAULT_DRESS_COLORS.bride);
  const groom = sideWithDefaults(dress?.groom, DEFAULT_DRESS_COLORS.groom);

  function setDressEnabled(next: boolean) {
    if (!next) {
      onChange({ dress: dress ? { ...dress, enabled: false } : null });
      return;
    }
    onChange({
      dress: {
        enabled: true,
        bride,
        groom,
      },
    });
  }

  function setSide(side: "bride" | "groom", patch: Partial<BuilderDressSide>) {
    onChange({
      dress: {
        enabled: true,
        bride: side === "bride" ? { ...bride, ...patch } : bride,
        groom: side === "groom" ? { ...groom, ...patch } : groom,
      },
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="palette" size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <YesNoChoice
              name={`${idPrefix}-dress`}
              legend="Add a dress code?"
              description="Show groom and bride colour swatches on the invitation. This is optional."
              value={enabled}
              onChange={setDressEnabled}
            />
          </div>
        </div>

        {enabled && (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ColourField
              label="Groom's colour"
              side={groom}
              fallback={DEFAULT_DRESS_COLORS.groom}
              onChange={(patch) => setSide("groom", patch)}
            />
            <ColourField
              label="Bride's colour"
              side={bride}
              fallback={DEFAULT_DRESS_COLORS.bride}
              onChange={(patch) => setSide("bride", patch)}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon name="celebration" size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <YesNoChoice
              name={`${idPrefix}-rsvp`}
              legend="Collect RSVPs on the invitation?"
              description="Off by default. Turn this on if you want guests to choose Yes and share their details."
              value={rsvpEnabled}
              onChange={(value) => onChange({ rsvpEnabled: value })}
            />
          </div>
        </div>

        {rsvpEnabled && (
          <div className="mt-5 rounded-xl border border-outline-variant bg-surface p-4">
            <TextInput
              label="WhatsApp number for RSVPs"
              value={rsvpWhatsapp}
              onChange={(e) => onChange({ rsvpWhatsapp: e.target.value })}
              placeholder="+91 98765 43210"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              error={
                rsvpWhatsapp.trim() && !hasPhoneDigits(rsvpWhatsapp)
                  ? "Enter a valid phone number, including the country code."
                  : undefined
              }
              hint={
                rsvpWhatsapp.trim()
                  ? "Include the country code. After a guest chooses Yes, WhatsApp opens with their name, phone and guest count ready to send to this number."
                  : "Add your WhatsApp number, including the country code, to open a prefilled RSVP chat after a guest chooses Yes."
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
