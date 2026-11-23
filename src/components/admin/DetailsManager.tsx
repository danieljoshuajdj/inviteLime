"use client";

import { useState } from "react";

import { Badge, EmptyState } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { TextInput, Textarea } from "@/components/shared/Field";
import { Icon, type IconName } from "@/components/shared/Icon";
import { Modal } from "@/components/shared/Modal";
import { toast } from "@/components/account/toast";
import { cn } from "@/lib/utils";
// Client-safe module: the service pulls in the Supabase admin client, which
// cannot be bundled for the browser.
import {
  demoDetailPackCouple,
  type DemoDetailPack,
  type DemoDetailPackEvent,
} from "@/lib/library-media";
import {
  EVENT_CATEGORIES,
  FORM_TYPES,
  formDefinition,
  formTypeFromCategorySlug,
  isBirthdayForm,
  ordinal,
  type FormType,
} from "@/lib/builder/forms";
import { BIRTHDAY_NUMBER_MAX, BIRTHDAY_NUMBER_MIN } from "@/lib/builder/validation";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface Props {
  initialPacks: DemoDetailPack[];
  /** Event categories, used to build the new-pack category picker. */
  categories: CategoryOption[];
}

interface EventDraft {
  key: string;
  name: string;
  date: string;
  time: string;
  venue: string;
  address: string;
  mapsUrl: string;
  description: string;
}

interface PackDraft {
  formType: FormType;
  name: string;
  description: string;
  brideName: string;
  groomName: string;
  celebrantName: string;
  birthdayNumber: string;
  specialMessage: string;
  brideDesignation: string;
  groomDesignation: string;
  brideBio: string;
  groomBio: string;
  coupleBio: string;
  story: string;
  weddingDate: string;
  weddingTime: string;
  venue: string;
  address: string;
  mapsUrl: string;
  latitude: string;
  longitude: string;
  dressBrideColor: string;
  dressBrideColorName: string;
  dressGroomColor: string;
  dressGroomColorName: string;
  rsvpDeadline: string;
  rsvpContactName: string;
  rsvpContactPhone: string;
  rsvpWhatsapp: string;
  events: EventDraft[];
}

interface CategoryForm {
  category: CategoryOption;
  formType: FormType;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const FORM_DESCRIPTIONS: Record<FormType, string> = {
  wedding: "Couple, venue, ceremonies, dress code and RSVP contact.",
  engagement: "Couple, engagement date, venue, ceremonies and RSVP contact.",
  birthday_celebration: "Birthday person, celebration date, time and venue.",
  birthday_wishes: "Birthday person, age and the special message.",
};

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function emptyEvent(): EventDraft {
  return {
    key: newKey(),
    name: "",
    date: "",
    time: "",
    venue: "",
    address: "",
    mapsUrl: "",
    description: "",
  };
}

function emptyDraft(formType: FormType): PackDraft {
  return {
    formType,
    name: "",
    description: "",
    brideName: "",
    groomName: "",
    celebrantName: "",
    birthdayNumber: "",
    specialMessage: "",
    brideDesignation: "",
    groomDesignation: "",
    brideBio: "",
    groomBio: "",
    coupleBio: "",
    story: "",
    weddingDate: "",
    weddingTime: "",
    venue: "",
    address: "",
    mapsUrl: "",
    latitude: "",
    longitude: "",
    dressBrideColor: "",
    dressBrideColorName: "",
    dressGroomColor: "",
    dressGroomColorName: "",
    rsvpDeadline: "",
    rsvpContactName: "",
    rsvpContactPhone: "",
    rsvpWhatsapp: "",
    events: [],
  };
}

function draftFromPack(pack: DemoDetailPack): PackDraft {
  const eventDraft = (event: DemoDetailPackEvent): EventDraft => ({
    key: newKey(),
    name: event.name,
    date: event.date ?? "",
    time: event.time ?? "",
    venue: event.venue ?? "",
    address: event.address ?? "",
    mapsUrl: event.mapsUrl ?? "",
    description: event.description ?? "",
  });

  return {
    formType: pack.formType,
    name: pack.name,
    description: pack.description ?? "",
    brideName: pack.brideName ?? "",
    groomName: pack.groomName ?? "",
    celebrantName: pack.celebrantName ?? "",
    birthdayNumber: pack.birthdayNumber === null ? "" : String(pack.birthdayNumber),
    specialMessage: pack.specialMessage ?? "",
    brideDesignation: pack.brideDesignation ?? "",
    groomDesignation: pack.groomDesignation ?? "",
    brideBio: pack.brideBio ?? "",
    groomBio: pack.groomBio ?? "",
    coupleBio: pack.coupleBio ?? "",
    story: pack.story ?? "",
    weddingDate: pack.weddingDate ?? "",
    weddingTime: pack.weddingTime ?? "",
    venue: pack.venue ?? "",
    address: pack.address ?? "",
    mapsUrl: pack.mapsUrl ?? "",
    latitude: pack.latitude === null ? "" : String(pack.latitude),
    longitude: pack.longitude === null ? "" : String(pack.longitude),
    dressBrideColor: pack.dressBrideColor ?? "",
    dressBrideColorName: pack.dressBrideColorName ?? "",
    dressGroomColor: pack.dressGroomColor ?? "",
    dressGroomColorName: pack.dressGroomColorName ?? "",
    rsvpDeadline: pack.rsvpDeadline ?? "",
    rsvpContactName: pack.rsvpContactName ?? "",
    rsvpContactPhone: pack.rsvpContactPhone ?? "",
    rsvpWhatsapp: pack.rsvpWhatsapp ?? "",
    events: pack.events.map(eventDraft),
  };
}

/**
 * The four categories that own a builder form, in form order. Falls back to
 * the built-in taxonomy when the database has no categories (preview/older DB).
 */
function categoryForms(categories: CategoryOption[]): CategoryForm[] {
  const fromDb = categories
    .map((category) => ({ category, formType: formTypeFromCategorySlug(category.slug) }))
    .filter((entry): entry is CategoryForm => entry.formType !== null);

  if (fromDb.length > 0) {
    return fromDb.sort(
      (a, b) => FORM_TYPES.indexOf(a.formType) - FORM_TYPES.indexOf(b.formType)
    );
  }

  return EVENT_CATEGORIES.map((category) => ({
    category: { id: category.slug, name: category.name, slug: category.slug },
    formType: category.type,
  }));
}

const clean = (value: string) => value.trim() || null;
const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2027-02-14" → "14 Feb 2027"; anything else is shown unchanged. */
function formatDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** "19:00" → "7:00 PM"; anything else is shown unchanged. */
function formatTime(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

/**
 * Demo details packs: the sample couple or birthday person, venue, events,
 * dress code and RSVP contact a template shows while people preview its demo.
 *
 * A pack belongs to one event form, chosen when it is created. Wedding and
 * engagement packs use the couple fields; birthday celebration and birthday
 * wishes packs use the celebrant fields instead. A pack is authored once here
 * and assigned to templates of the same category in the upload wizard. Live
 * invitations never read it — customers always supply their own details.
 */
export function DetailsManager({ initialPacks, categories }: Props) {
  const [packs, setPacks] = useState<DemoDetailPack[]>(initialPacks);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<DemoDetailPack | null>(null);
  const [draft, setDraft] = useState<PackDraft>(() => emptyDraft("wedding"));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [deletingPack, setDeletingPack] = useState<DemoDetailPack | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const forms = categoryForms(categories);
  const definition = formDefinition(draft.formType);
  const coupleForm = !isBirthdayForm(draft.formType);
  const celebrationForm = draft.formType === "birthday_celebration";
  const wishesForm = draft.formType === "birthday_wishes";

  function setField<K extends keyof PackDraft>(key: K, value: PackDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function openPicker() {
    setEditing(null);
    setPickerOpen(true);
  }

  function chooseCategory(formType: FormType) {
    setEditing(null);
    setDraft(emptyDraft(formType));
    setDirty(false);
    setPickerOpen(false);
    setEditorOpen(true);
  }

  function openEdit(pack: DemoDetailPack) {
    setEditing(pack);
    setDraft(draftFromPack(pack));
    setDirty(false);
    setEditorOpen(true);
  }

  function setEvent(key: string, field: keyof EventDraft, value: string) {
    setDraft((prev) => ({
      ...prev,
      events: prev.events.map((event) =>
        event.key === key ? { ...event, [field]: value } : event
      ),
    }));
    setDirty(true);
  }

  function addEvent() {
    setDraft((prev) => ({ ...prev, events: [...prev.events, emptyEvent()] }));
    setDirty(true);
  }

  function removeEvent(key: string) {
    setDraft((prev) => ({ ...prev, events: prev.events.filter((event) => event.key !== key) }));
    setDirty(true);
  }

  async function savePack(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!draft.name.trim()) {
      toast("Missing details", "Give the pack a name.");
      return;
    }

    if (coupleForm) {
      if (!draft.brideName.trim() || !draft.groomName.trim()) {
        toast("Missing details", "Pack name, bride name and groom name are required.");
        return;
      }
      if (draft.events.some((event) => !event.name.trim())) {
        toast("Missing event name", "Every event needs a name.");
        return;
      }
      for (const [label, value] of [
        ["Bride dress colour", draft.dressBrideColor],
        ["Groom dress colour", draft.dressGroomColor],
      ] as const) {
        if (value.trim() && !HEX_COLOR.test(value.trim())) {
          toast("Invalid colour", `${label} must be a hex code such as #c2647a.`);
          return;
        }
      }
      for (const [label, value] of [
        ["Latitude", draft.latitude],
        ["Longitude", draft.longitude],
      ] as const) {
        if (value.trim() && !Number.isFinite(Number(value))) {
          toast("Invalid coordinate", `${label} must be a number.`);
          return;
        }
      }
    } else {
      if (!draft.celebrantName.trim()) {
        toast("Missing details", "Enter the name of the birthday person.");
        return;
      }
      if (celebrationForm) {
        if (!draft.weddingDate.trim()) {
          toast("Missing details", `${definition.dateLabel} is required.`);
          return;
        }
        if (!draft.venue.trim()) {
          toast("Missing details", "A venue is required for a birthday celebration.");
          return;
        }
      }
      if (wishesForm) {
        const age = Number(draft.birthdayNumber);
        if (
          !Number.isInteger(age) ||
          age < BIRTHDAY_NUMBER_MIN ||
          age > BIRTHDAY_NUMBER_MAX
        ) {
          toast(
            "Invalid age",
            `Birthday age must be a whole number between ${BIRTHDAY_NUMBER_MIN} and ${BIRTHDAY_NUMBER_MAX}.`
          );
          return;
        }
        if (!draft.specialMessage.trim()) {
          toast("Missing message", "Write the birthday message shown by the demo.");
          return;
        }
      }
    }

    const payload = {
      name: draft.name.trim(),
      description: clean(draft.description),
      formType: draft.formType,
      brideName: coupleForm ? draft.brideName.trim() : null,
      groomName: coupleForm ? draft.groomName.trim() : null,
      celebrantName: coupleForm ? null : draft.celebrantName.trim(),
      birthdayNumber: wishesForm ? Number(draft.birthdayNumber) : null,
      specialMessage: wishesForm ? draft.specialMessage.trim() : null,
      brideDesignation: coupleForm ? clean(draft.brideDesignation) : null,
      groomDesignation: coupleForm ? clean(draft.groomDesignation) : null,
      brideBio: coupleForm ? clean(draft.brideBio) : null,
      groomBio: coupleForm ? clean(draft.groomBio) : null,
      coupleBio: coupleForm ? clean(draft.coupleBio) : null,
      story: coupleForm ? clean(draft.story) : null,
      weddingDate: wishesForm ? null : clean(draft.weddingDate),
      weddingTime: wishesForm ? null : clean(draft.weddingTime),
      venue: wishesForm ? null : clean(draft.venue),
      address: wishesForm ? null : clean(draft.address),
      mapsUrl: wishesForm ? null : clean(draft.mapsUrl),
      latitude: coupleForm ? optionalNumber(draft.latitude) : null,
      longitude: coupleForm ? optionalNumber(draft.longitude) : null,
      dressBrideColor: coupleForm ? clean(draft.dressBrideColor) : null,
      dressBrideColorName: coupleForm ? clean(draft.dressBrideColorName) : null,
      dressGroomColor: coupleForm ? clean(draft.dressGroomColor) : null,
      dressGroomColorName: coupleForm ? clean(draft.dressGroomColorName) : null,
      rsvpDeadline: coupleForm ? clean(draft.rsvpDeadline) : null,
      rsvpContactName: coupleForm ? clean(draft.rsvpContactName) : null,
      rsvpContactPhone: coupleForm ? clean(draft.rsvpContactPhone) : null,
      rsvpWhatsapp: coupleForm ? clean(draft.rsvpWhatsapp) : null,
      events: coupleForm
        ? draft.events.map((event) => ({
            name: event.name.trim(),
            date: clean(event.date),
            time: clean(event.time),
            venue: clean(event.venue),
            address: clean(event.address),
            mapsUrl: clean(event.mapsUrl),
            description: clean(event.description),
          }))
        : [],
    };

    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/demo-details/${editing.id}` : "/api/admin/demo-details",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = (await res.json()) as { pack?: DemoDetailPack; error?: string };
      if (!res.ok || !json.pack) throw new Error(json.error ?? "Save failed");

      const saved = json.pack;
      setPacks((prev) =>
        editing ? prev.map((pack) => (pack.id === saved.id ? saved : pack)) : [saved, ...prev]
      );
      toast(editing ? "Details pack updated" : "Details pack created");
      setEditorOpen(false);
      setDirty(false);
    } catch (err) {
      toast("Could not save details pack", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deletingPack) return;
    const pack = deletingPack;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/admin/demo-details/${pack.id}`, { method: "DELETE" });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");

      setPacks((prev) => prev.filter((item) => item.id !== pack.id));
      toast("Details pack deleted");
      setDeletingPack(null);
    } catch (err) {
      toast("Could not delete details pack", (err as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Library</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Details</h1>
        </div>
        <Button icon="add" onClick={openPicker}>New details pack</Button>
      </div>

      <p className="mt-4 max-w-2xl font-body-sm text-on-surface-variant">
        Complete sample content — a couple and their ceremonies, or a birthday person and their
        celebration — that template demos display while people preview them. Each pack uses the
        form of the category it was created for, and templates only offer packs from their own
        category. Live invitations always use the customer&apos;s own details, so this content
        never reaches guests.
      </p>

      {packs.length === 0 ? (
        <EmptyState
          icon="text_fields"
          title="No details packs yet"
          description="Choose a category, fill in its form, then assign the pack to templates of that category while uploading their package."
          className="mt-6 rounded-2xl border border-dashed border-outline-variant"
        />
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {packs.map((pack) => {
            const packDefinition = formDefinition(pack.formType);
            const packCouple = !isBirthdayForm(pack.formType);
            const packWishes = pack.formType === "birthday_wishes";
            return (
              <article key={pack.id} className="rounded-2xl border border-outline-variant bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-heading-md font-semibold !text-on-surface">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                        <Icon name="text_fields" size="md" weight="w400" />
                      </span>
                      {pack.name}
                      <Badge tone="primary">{packDefinition.label}</Badge>
                    </p>
                    <p className="mt-1 font-body-xs text-on-surface-variant">
                      {pack.templateCount === 0
                        ? "not used by any template yet"
                        : `used by ${pack.templateCount} template${pack.templateCount === 1 ? "" : "s"}`}
                    </p>
                    {pack.description && (
                      <p className="mt-1 font-body-sm text-on-surface-variant">{pack.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" icon="edit" onClick={() => openEdit(pack)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" icon="delete" onClick={() => setDeletingPack(pack)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <p className="mt-4 font-heading-sm font-semibold text-on-surface">
                  {demoDetailPackCouple(pack)}
                </p>
                {packCouple && (pack.brideDesignation || pack.groomDesignation) && (
                  <p className="mt-0.5 font-body-xs text-on-surface-variant">
                    {[pack.groomDesignation, pack.brideDesignation].filter(Boolean).join(" · ")}
                  </p>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {packWishes ? (
                    <>
                      <Summary
                        icon="celebration"
                        label="Age"
                        value={
                          pack.birthdayNumber === null
                            ? "No age set"
                            : `${ordinal(pack.birthdayNumber)} Birthday`
                        }
                      />
                      <Summary
                        icon="chat"
                        label="Message"
                        value={pack.specialMessage || "No message set"}
                      />
                    </>
                  ) : (
                    <>
                      <Summary
                        icon="calendar_month"
                        label={packDefinition.dateLabel}
                        value={
                          [
                            pack.weddingDate ? formatDate(pack.weddingDate) : "",
                            pack.weddingTime ? formatTime(pack.weddingTime) : "",
                          ]
                            .filter(Boolean)
                            .join(" · ") || "No date set"
                        }
                      />
                      <Summary
                        icon="location_on"
                        label="Venue"
                        value={[pack.venue, pack.address].filter(Boolean).join(", ") || "No venue set"}
                      />
                      {packCouple ? (
                        <>
                          <Summary
                            icon="celebration"
                            label="Additional events"
                            value={
                              [packDefinition.label, ...pack.events.map((event) => event.name)].join(
                                " · "
                              )
                            }
                          />
                          <Summary
                            icon="phone"
                            label="RSVP"
                            value={
                              [
                                pack.rsvpDeadline ? formatDate(pack.rsvpDeadline) : "",
                                pack.rsvpContactPhone,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "No RSVP contact set"
                            }
                          />
                        </>
                      ) : (
                        <Summary
                          icon="text_fields"
                          label="Form"
                          value={`${packDefinition.label} invitation`}
                        />
                      )}
                    </>
                  )}
                </div>

                {packCouple && (pack.dressBrideColor || pack.dressGroomColor) && (
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {pack.dressGroomColor && (
                      <ColorSwatch
                        color={pack.dressGroomColor}
                        label={pack.dressGroomColorName || "Groom"}
                        role="Groom"
                      />
                    )}
                    {pack.dressBrideColor && (
                      <ColorSwatch
                        color={pack.dressBrideColor}
                        label={pack.dressBrideColorName || "Bride"}
                        role="Bride"
                      />
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* New pack: the category decides which form is generated. */}
      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Choose a category"
        icon="category"
        size="md"
      >
        <p className="font-body-sm text-on-surface-variant">
          The category decides which form this pack uses. Templates only offer packs from their own
          category.
        </p>
        <div className="mt-4 grid gap-2">
          {forms.map(({ category, formType }) => (
            <button
              key={formType}
              type="button"
              onClick={() => chooseCategory(formType)}
              className="flex items-center gap-3 rounded-xl border border-outline-variant p-4 text-left transition-colors hover:bg-surface-container"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <Icon name="text_fields" size="md" weight="w400" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-body-sm font-semibold !text-on-surface">
                  {category.name}
                </span>
                <span className="mt-0.5 block font-body-xs text-on-surface-variant">
                  {FORM_DESCRIPTIONS[formType]}
                </span>
              </span>
              <Icon name="chevron_right" size="sm" className="flex-shrink-0 text-on-surface-variant" />
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={editorOpen}
        onClose={() => {
          if (!saving) {
            setEditorOpen(false);
            setDirty(false);
          }
        }}
        title={
          editing
            ? `Edit ${definition.label.toLowerCase()} details pack`
            : `New ${definition.label.toLowerCase()} details pack`
        }
        icon="text_fields"
        size="xl"
        blockBackdropClose={saving || dirty}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setEditorOpen(false);
                setDirty(false);
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" form="details-pack-form" icon="save" loading={saving}>
              {editing ? "Save changes" : "Create pack"}
            </Button>
          </>
        }
      >
        <form id="details-pack-form" onSubmit={savePack} className="flex flex-col gap-7">
          <Section title="Pack" description="A label admins see while assigning demo content.">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{definition.label}</Badge>
              <span className="font-body-xs text-on-surface-variant">
                {editing
                  ? "The category of an existing pack cannot change."
                  : `This pack will only be offered to ${definition.label.toLowerCase()} templates.`}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="Pack name"
                required
                value={draft.name}
                placeholder={
                  coupleForm ? "e.g. Royal Tamil wedding" : "e.g. Ananya turns 21"
                }
                onChange={(e) => setField("name", e.target.value)}
              />
              <TextInput
                label="Description (optional)"
                value={draft.description}
                placeholder="Which templates this pack suits..."
                onChange={(e) => setField("description", e.target.value)}
              />
            </div>
          </Section>

          {coupleForm ? (
            <>
              <Section title="Couple" description="The names and words shown across the invitation.">
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Groom name"
                    required
                    value={draft.groomName}
                    placeholder="e.g. Jeya Chandran S."
                    onChange={(e) => setField("groomName", e.target.value)}
                  />
                  <TextInput
                    label="Bride name"
                    required
                    value={draft.brideName}
                    placeholder="e.g. Karthika M."
                    onChange={(e) => setField("brideName", e.target.value)}
                  />
                  <TextInput
                    label="Groom designation (optional)"
                    value={draft.groomDesignation}
                    placeholder="e.g. Software engineer"
                    onChange={(e) => setField("groomDesignation", e.target.value)}
                  />
                  <TextInput
                    label="Bride designation (optional)"
                    value={draft.brideDesignation}
                    placeholder="e.g. Product designer"
                    onChange={(e) => setField("brideDesignation", e.target.value)}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Textarea
                    label="Groom bio (optional)"
                    rows={3}
                    value={draft.groomBio}
                    onChange={(e) => setField("groomBio", e.target.value)}
                  />
                  <Textarea
                    label="Bride bio (optional)"
                    rows={3}
                    value={draft.brideBio}
                    onChange={(e) => setField("brideBio", e.target.value)}
                  />
                </div>
                <Textarea
                  label="Couple bio (optional)"
                  rows={2}
                  value={draft.coupleBio}
                  onChange={(e) => setField("coupleBio", e.target.value)}
                />
                <Textarea
                  label="Story (optional)"
                  rows={4}
                  value={draft.story}
                  placeholder="How the couple met, the proposal, the journey..."
                  onChange={(e) => setField("story", e.target.value)}
                />
              </Section>

              <Section
                title={definition.label}
                description={`The main celebration — it always appears first in the demo timeline.`}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label={definition.dateLabel}
                    type="date"
                    value={draft.weddingDate}
                    onChange={(e) => setField("weddingDate", e.target.value)}
                  />
                  <TextInput
                    label={`${definition.label} time`}
                    type="time"
                    value={draft.weddingTime}
                    onChange={(e) => setField("weddingTime", e.target.value)}
                  />
                  <TextInput
                    label="Venue"
                    value={draft.venue}
                    placeholder="e.g. The Leela Palace"
                    onChange={(e) => setField("venue", e.target.value)}
                  />
                  <TextInput
                    label="Address"
                    value={draft.address}
                    placeholder="Street, city, state"
                    onChange={(e) => setField("address", e.target.value)}
                  />
                  <TextInput
                    label="Google Maps URL (optional)"
                    value={draft.mapsUrl}
                    placeholder="https://maps.google.com/..."
                    onChange={(e) => setField("mapsUrl", e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <TextInput
                      label="Latitude (optional)"
                      value={draft.latitude}
                      placeholder="13.0827"
                      onChange={(e) => setField("latitude", e.target.value)}
                    />
                    <TextInput
                      label="Longitude (optional)"
                      value={draft.longitude}
                      placeholder="80.2707"
                      onChange={(e) => setField("longitude", e.target.value)}
                    />
                  </div>
                </div>
              </Section>

              <Section
                title="Additional events"
                description={`The ${definition.label.toLowerCase()} is always first. Add extra ceremonies such as mehendi, haldi or the reception below.`}
              >
                {draft.events.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-outline-variant px-4 py-3 font-body-sm text-on-surface-variant">
                    No extra ceremonies. The demo still shows the {definition.label.toLowerCase()} as
                    the first event.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {draft.events.map((event, index) => (
                      <div
                        key={event.key}
                        className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-body-sm font-semibold text-on-surface">Event {index + 1}</p>
                          <button
                            type="button"
                            onClick={() => removeEvent(event.key)}
                            className="rounded-full p-1.5 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                            aria-label={`Remove event ${index + 1}`}
                          >
                            <Icon name="delete" size="sm" />
                          </button>
                        </div>
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <TextInput
                            label="Name"
                            required
                            value={event.name}
                            placeholder="e.g. Mehendi"
                            onChange={(e) => setEvent(event.key, "name", e.target.value)}
                          />
                          <div className="grid grid-cols-2 gap-4">
                            <TextInput
                              label="Date"
                              type="date"
                              value={event.date}
                              onChange={(e) => setEvent(event.key, "date", e.target.value)}
                            />
                            <TextInput
                              label="Time"
                              type="time"
                              value={event.time}
                              onChange={(e) => setEvent(event.key, "time", e.target.value)}
                            />
                          </div>
                          <TextInput
                            label="Venue"
                            value={event.venue}
                            onChange={(e) => setEvent(event.key, "venue", e.target.value)}
                          />
                          <TextInput
                            label="Address"
                            value={event.address}
                            onChange={(e) => setEvent(event.key, "address", e.target.value)}
                          />
                          <TextInput
                            label="Maps URL"
                            value={event.mapsUrl}
                            onChange={(e) => setEvent(event.key, "mapsUrl", e.target.value)}
                          />
                          <TextInput
                            label="Description"
                            value={event.description}
                            onChange={(e) => setEvent(event.key, "description", e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <Button type="button" variant="outline" size="sm" icon="add" onClick={addEvent}>
                    Add event
                  </Button>
                </div>
              </Section>

              <Section
                title="Dress code"
                description="Optional colours shown as swatches. Sides left empty fall back to the template's own demo dress code."
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <ColorField
                    label="Groom"
                    color={draft.dressGroomColor}
                    name={draft.dressGroomColorName}
                    onColor={(value) => setField("dressGroomColor", value)}
                    onName={(value) => setField("dressGroomColorName", value)}
                  />
                  <ColorField
                    label="Bride"
                    color={draft.dressBrideColor}
                    name={draft.dressBrideColorName}
                    onColor={(value) => setField("dressBrideColor", value)}
                    onName={(value) => setField("dressBrideColorName", value)}
                  />
                </div>
              </Section>

              <Section
                title="RSVP"
                description="Demo-only contact details shown under the RSVP section."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Reply-by date"
                    type="date"
                    value={draft.rsvpDeadline}
                    onChange={(e) => setField("rsvpDeadline", e.target.value)}
                  />
                  <TextInput
                    label="Contact name"
                    value={draft.rsvpContactName}
                    placeholder="e.g. Anand"
                    onChange={(e) => setField("rsvpContactName", e.target.value)}
                  />
                  <TextInput
                    label="Contact phone"
                    value={draft.rsvpContactPhone}
                    placeholder="+91 98765 43210"
                    onChange={(e) => setField("rsvpContactPhone", e.target.value)}
                  />
                  <TextInput
                    label="WhatsApp link"
                    value={draft.rsvpWhatsapp}
                    placeholder="https://wa.me/919876543210"
                    onChange={(e) => setField("rsvpWhatsapp", e.target.value)}
                  />
                </div>
              </Section>
            </>
          ) : (
            <>
              <Section
                title="Birthday person"
                description="The person this demo celebrates."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Name"
                    required
                    value={draft.celebrantName}
                    placeholder="e.g. Ananya"
                    onChange={(e) => setField("celebrantName", e.target.value)}
                  />
                  {wishesForm && (
                    <TextInput
                      label="Age"
                      type="number"
                      required
                      min={BIRTHDAY_NUMBER_MIN}
                      max={BIRTHDAY_NUMBER_MAX}
                      value={draft.birthdayNumber}
                      placeholder="e.g. 21"
                      onChange={(e) => setField("birthdayNumber", e.target.value)}
                    />
                  )}
                </div>
              </Section>

              {wishesForm ? (
                <Section
                  title="Birthday message"
                  description="The greeting shown on the birthday-wishes invitation."
                >
                  <Textarea
                    label="Special message"
                    required
                    rows={5}
                    value={draft.specialMessage}
                    placeholder="Wishing you a day filled with laughter, cake and everyone who loves you."
                    onChange={(e) => setField("specialMessage", e.target.value)}
                  />
                </Section>
              ) : (
                <Section
                  title="Celebration"
                  description="Where and when the birthday celebration happens."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextInput
                      label={definition.dateLabel}
                      type="date"
                      required
                      value={draft.weddingDate}
                      onChange={(e) => setField("weddingDate", e.target.value)}
                    />
                    <TextInput
                      label="Celebration time"
                      type="time"
                      value={draft.weddingTime}
                      onChange={(e) => setField("weddingTime", e.target.value)}
                    />
                    <TextInput
                      label="Venue"
                      required
                      value={draft.venue}
                      placeholder="e.g. Bayview Terrace"
                      onChange={(e) => setField("venue", e.target.value)}
                    />
                    <TextInput
                      label="Address"
                      value={draft.address}
                      placeholder="Street, city, state"
                      onChange={(e) => setField("address", e.target.value)}
                    />
                    <TextInput
                      label="Google Maps URL (optional)"
                      value={draft.mapsUrl}
                      placeholder="https://maps.google.com/..."
                      onChange={(e) => setField("mapsUrl", e.target.value)}
                    />
                  </div>
                </Section>
              )}
            </>
          )}
        </form>
      </Modal>

      <Modal
        open={!!deletingPack}
        onClose={() => {
          if (!deleteBusy) setDeletingPack(null);
        }}
        title="Delete details pack"
        icon="delete"
        size="sm"
        blockBackdropClose={deleteBusy}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingPack(null)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon="delete" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Delete pack
            </Button>
          </>
        }
      >
        {deletingPack && (
          <div className="flex flex-col gap-3">
            <p className="font-body-md text-on-surface">
              Are you sure you want to delete{" "}
              <span className="font-semibold">“{deletingPack.name}”</span>?
            </p>
            {!isBirthdayForm(deletingPack.formType) && deletingPack.events.length > 0 && (
              <p className="font-body-sm text-on-surface-variant">
                Its {deletingPack.events.length} additional event
                {deletingPack.events.length === 1 ? "" : "s"} are deleted too.
              </p>
            )}
            {deletingPack.templateCount > 0 && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 font-body-sm text-warning">
                {deletingPack.templateCount} template
                {deletingPack.templateCount === 1 ? "" : "s"} currently use this pack. They will
                fall back to the stock demo details.
              </p>
            )}
            <p className="font-body-sm font-semibold text-error">This action cannot be undone.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-body-sm font-semibold uppercase tracking-[0.15em] text-secondary">
          {title}
        </h3>
        {description && (
          <p className="mt-1 font-body-xs text-on-surface-variant">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-surface-container-lowest px-3 py-2">
      <Icon name={icon} size="sm" className="mt-0.5 shrink-0 text-secondary" />
      <div className="min-w-0">
        <p className="font-body-xs font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
          {label}
        </p>
        <p className="truncate font-body-sm text-on-surface" title={value}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ColorSwatch({ color, label, role }: { color: string; label: string; role: string }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-6 w-6 rounded-full border border-outline-variant"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="font-body-sm text-on-surface">{label}</span>
      <span className="font-body-xs text-on-surface-variant">{role}</span>
    </span>
  );
}

function ColorField({
  label,
  color,
  name,
  onColor,
  onName,
}: {
  label: string;
  color: string;
  name: string;
  onColor: (value: string) => void;
  onName: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-body-sm font-semibold text-on-surface">{label}</p>
      <div className="flex items-end gap-2">
        <input
          type="color"
          aria-label={`${label} colour picker`}
          value={color || "#c2647a"}
          onChange={(e) => onColor(e.target.value)}
          className={cn(
            "h-10 w-12 cursor-pointer rounded-lg border border-outline-variant bg-surface p-1",
            "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          )}
        />
        <TextInput
          label="Colour code"
          value={color}
          placeholder="#c2647a"
          className="w-32"
          onChange={(e) => onColor(e.target.value)}
        />
        <TextInput
          label="Colour name"
          value={name}
          placeholder="e.g. Blush pink"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
    </div>
  );
}
