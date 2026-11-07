import { createAdminClient } from "@/lib/supabase/admin";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";

export const dynamic = "force-dynamic";

const mockCategories = [
  { id: "d1", name: "Wedding", slug: "wedding", description: "Classic ceremony templates", templateCount: 6 },
  { id: "d2", name: "Villa destination", slug: "villa-destination", description: "Destination and resort themes", templateCount: 3 },
  { id: "d3", name: "Grand", slug: "grand", description: "Large multi-day celebrations", templateCount: 2 },
];

export default async function AdminCategoriesPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("categories").select("id, name, slug, description, template_categories(template:template_id(id))").order("name");

  const mapped = ((data as Array<Record<string, unknown>> | null) ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? null,
    templateCount: Array.isArray(c.template_categories) ? c.template_categories.length : 0,
  }));

  // Sample rows are for local UI review only. Outside preview mode an empty
  // result must render as empty, never as invented data.
  return <CategoriesManager categories={mapped.length > 0 ? mapped : isAdminPreviewMode() ? mockCategories : []} />;
}