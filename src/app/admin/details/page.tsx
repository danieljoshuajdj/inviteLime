import { DetailsManager } from "@/components/admin/DetailsManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { listDemoDetailPacks } from "@/lib/services/demo-details";
import type { DemoDetailPack } from "@/lib/library-media";

export const dynamic = "force-dynamic";

// Sample rows are for local UI review only. Outside preview mode an empty
// result must render as empty, never as invented data.
const previewPacks: DemoDetailPack[] = [
  {
    id: "preview-details-1",
    name: "Royal Tamil wedding",
    description: "Traditional palace celebration with warm gold and rose tones.",
    brideName: "Karthika M.",
    groomName: "Jeya Chandran S.",
    brideDesignation: "M.Sc. — Product designer",
    groomDesignation: "M.Tech — Software engineer",
    brideBio: "Sample bride profile written for template previews.",
    groomBio: "Sample groom profile written for template previews.",
    coupleBio: "A sample couple story shown only inside the demo.",
    story:
      "They met over filter coffee in Chennai, bonded over long drives to the coast, and chose a palace courtyard for the celebration.",
    weddingDate: "2027-02-14",
    weddingTime: "19:00",
    venue: "The Leela Palace",
    address: "Adyar, Chennai, Tamil Nadu",
    mapsUrl: "https://maps.google.com/",
    latitude: 13.0827,
    longitude: 80.2707,
    dressBrideColor: "#c2647a",
    dressBrideColorName: "Rosewood",
    dressGroomColor: "#1f3d3a",
    dressGroomColorName: "Deep teal",
    rsvpDeadline: "2027-02-01",
    rsvpContactName: "Anand",
    rsvpContactPhone: "+91 98765 43210",
    rsvpWhatsapp: "https://wa.me/919876543210",
    events: [
      {
        id: "preview-event-1",
        name: "Mehendi",
        date: "2027-02-12",
        time: "16:00",
        venue: "Palace Courtyard",
        address: null,
        mapsUrl: null,
        description: "Henna evening with family.",
        sortOrder: 0,
      },
      {
        id: "preview-event-2",
        name: "Reception",
        date: "2027-02-15",
        time: "19:00",
        venue: "The Leela Palace Lawns",
        address: null,
        mapsUrl: null,
        description: null,
        sortOrder: 1,
      },
    ],
    templateCount: 2,
    createdAt: new Date("2026-01-12").toISOString(),
    updatedAt: new Date("2026-01-12").toISOString(),
  },
];

export default async function AdminDetailsPage() {
  let packs: DemoDetailPack[] = [];
  try {
    packs = await listDemoDetailPacks();
  } catch (err) {
    // The demo tables arrive with migration 00013; an older database should
    // show an empty, working page rather than a 500 for the whole tab.
    console.warn("[admin/details] could not load details packs:", err);
  }

  const preview = isAdminPreviewMode();
  return <DetailsManager initialPacks={packs.length > 0 ? packs : preview ? previewPacks : []} />;
}
