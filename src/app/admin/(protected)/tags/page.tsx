import { createAdminClient } from "@/lib/supabase/admin";
import { TagsManager } from "@/components/admin/TagsManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";

export const dynamic = "force-dynamic";

const mockTags = [
  { id: "t1", name: "Luxury", slug: "luxury", description: "Premium high-end designs" },
  { id: "t2", name: "Destination", slug: "destination", description: "Destination wedding themes" },
  { id: "t3", name: "Traditional", slug: "traditional", description: "Classic traditional ceremonies" },
  { id: "t4", name: "Modern", slug: "modern", description: "Contemporary minimal designs" },
];

export default async function AdminTagsPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("tags").select("*").order("name");

  const mapped = ((data as Array<{ id: string; name: string; slug: string; description: string | null }> | null) ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description ?? null,
  }));

  return <TagsManager tags={mapped.length > 0 ? mapped : isAdminPreviewMode() ? mockTags : []} />;
}