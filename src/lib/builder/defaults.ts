export interface BuilderEvent {
  id?: string;
  name: string;
  date?: string | null;
  time?: string | null;
  venue?: string | null;
  address?: string | null;
  mapsUrl?: string | null;
  description?: string | null;
}

export interface BuilderMediaUrl {
  role: "bride" | "groom" | "couple" | "gallery" | "music" | "video";
  url: string;
  name?: string;
}

export interface BuilderDressSide {
  color: string | null;
  colorName: string | null;
}

export interface BuilderDressCode {
  enabled: boolean;
  bride: BuilderDressSide;
  groom: BuilderDressSide;
}

export const DEFAULT_DRESS_COLORS = {
  bride: "#c2647a",
  groom: "#1f3d3a",
} as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Only a full six-digit hex colour is safe to pass into a template. */
export function validDressColor(value: unknown): string | null {
  const color = typeof value === "string" ? value.trim() : "";
  return HEX_COLOR.test(color) ? color : null;
}

export interface WeddingData {
  brideName: string;
  groomName: string;
  brideBio: string;
  groomBio: string;
  coupleBio: string;
  story: string;
  brideDesignation: string;
  groomDesignation: string;
  weddingDate: string;
  weddingTime: string | null;
  venue: string;
  address: string;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  events: BuilderEvent[];
  gallery: BuilderMediaUrl[];
  dress: BuilderDressCode | null;
  rsvpEnabled: boolean;
  /** Customer WhatsApp number that receives the prefilled RSVP chat. */
  rsvpWhatsapp: string;
  bridePhoto?: string | null;
  groomPhoto?: string | null;
  couplePhoto?: string | null;
  music?: BuilderMediaUrl | null;
}

export function defaultWeddingData(partial: Partial<WeddingData> = {}): WeddingData {
  return {
    brideName: "",
    groomName: "",
    brideBio: "",
    groomBio: "",
    coupleBio: "",
    story: "",
    brideDesignation: "",
    groomDesignation: "",
    weddingDate: "",
    weddingTime: null,
    venue: "",
    address: "",
    mapsUrl: null,
    latitude: null,
    longitude: null,
    events: [],
    gallery: [],
    dress: null,
    rsvpEnabled: false,
    rsvpWhatsapp: "",
    bridePhoto: null,
    groomPhoto: null,
    couplePhoto: null,
    music: null,
    ...partial,
  };
}

function normalizeDressSide(value: unknown): BuilderDressSide {
  const side = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    color: validDressColor(side.color),
    colorName: typeof side.colorName === "string" ? side.colorName.trim() : "",
  };
}

function normalizeDress(value: unknown): BuilderDressCode | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const dress = value as Record<string, unknown>;
  return {
    enabled: dress.enabled !== false,
    bride: normalizeDressSide(dress.bride),
    groom: normalizeDressSide(dress.groom),
  };
}

export function normalizeWeddingData(raw: unknown): WeddingData {
  const r = (raw ?? {}) as Record<string, unknown>;
  return defaultWeddingData({
    brideName: String(r.brideName ?? ""),
    groomName: String(r.groomName ?? ""),
    brideBio: String(r.brideBio ?? ""),
    groomBio: String(r.groomBio ?? ""),
    coupleBio: String(r.coupleBio ?? ""),
    story: String(r.story ?? ""),
    brideDesignation: String(r.brideDesignation ?? ""),
    groomDesignation: String(r.groomDesignation ?? ""),
    weddingDate: String(r.weddingDate ?? ""),
    weddingTime: r.weddingTime ? String(r.weddingTime) : null,
    venue: String(r.venue ?? ""),
    address: String(r.address ?? ""),
    mapsUrl: r.mapsUrl ? String(r.mapsUrl) : null,
    latitude: typeof r.latitude === "number" ? r.latitude : null,
    longitude: typeof r.longitude === "number" ? r.longitude : null,
    events: Array.isArray(r.events) ? (r.events as BuilderEvent[]) : [],
    gallery: Array.isArray(r.gallery) ? (r.gallery as BuilderMediaUrl[]) : [],
    dress: normalizeDress(r.dress),
    rsvpEnabled: typeof r.rsvpEnabled === "boolean" ? r.rsvpEnabled : false,
    rsvpWhatsapp: String(r.rsvpWhatsapp ?? "").trim(),
    bridePhoto: r.bridePhoto ? String(r.bridePhoto) : null,
    groomPhoto: r.groomPhoto ? String(r.groomPhoto) : null,
    couplePhoto: r.couplePhoto ? String(r.couplePhoto) : null,
    music: r.music ? (r.music as BuilderMediaUrl) : null,
  });
}

export function weddingDataForDb(data: WeddingData): Record<string, unknown> {
  // Strip empty fields to keep drafts tidy.
  const out: Record<string, unknown> = { ...data };
  for (const key of ["brideDesignation", "groomDesignation", "rsvpWhatsapp"] as const) {
    if (typeof out[key] === "string") out[key] = (out[key] as string).trim();
  }
  for (const key of Object.keys(out)) {
    const v = (out as Record<string, unknown>)[key];
    // These fields must survive an explicit clear. The autosave route mirrors
    // only the keys the browser sent onto a published invitation, so dropping
    // "" here would leave the old value live.
    if (
      key === "brideDesignation" ||
      key === "groomDesignation" ||
      key === "rsvpWhatsapp"
    ) {
      if (typeof v !== "string") delete out[key];
      continue;
    }
    if (v === null || v === undefined || v === "") delete out[key];
  }
  if (Array.isArray(out.events) && out.events.length === 0) delete out.events;
  if (Array.isArray(out.gallery) && out.gallery.length === 0) delete out.gallery;
  if (out.dress) {
    const dress = out.dress as BuilderDressCode;
    out.dress = {
      enabled: dress.enabled !== false,
      bride: {
        color: validDressColor(dress.bride?.color),
        colorName: dress.bride?.colorName?.trim() ?? "",
      },
      groom: {
        color: validDressColor(dress.groom?.color),
        colorName: dress.groom?.colorName?.trim() ?? "",
      },
    };
  }
  return out;
}

export const EMPTY_EVENT: BuilderEvent = { name: "", date: null, time: null, venue: null, address: null, mapsUrl: null, description: null };