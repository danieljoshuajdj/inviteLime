import { createAdminClient } from "@/lib/supabase/admin";
import { AdminBreadcrumbs } from "@/components/admin/AdminBreadcrumbs";
import { CategoriesManager } from "@/components/admin/CategoriesManager";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";

export const dynamic = "force-dynamic";

const mockCategories = [
  { id: "d1", name: "Wedding", slug: "wedding", description: "Classic ceremony templates", templateCount: 6 },
  { id: "d2", name: "Villa destination", slug: "villa-destination", description: "Destination and resort themes", templateCount: 3 },
  { id: "d3", name: "Grand", slug: "grand", description: "Large multi-day celebrations", templateCount: 2 },
];

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  template_categories: Array<{ template: { id: string } | null }> | null;
}

export default async function AdminCategoriesPage() {
  const admin = createAdminClient();
  const { data } = await admin.from("categories").select("id, name, slug, description, template_categories(template:template_id(id))").order("name");

  const mapped = ((data as CategoryRow[] | null) ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description ?? null,
    templateCount: Array.isArray(c.template_categories) ? c.template_categories.length : 0,
  }));

  // Sample rows are for local UI review only. Outside preview mode an empty
  // result must render as empty, never as invented data.
  return (
    <div>
      <AdminBreadcrumbs
        items={[
          { label: "Configuration", href: "/admin/configuration" },
          { label: "Categories" },
        ]}
      />
      <CategoriesManager
        categories={mapped.length > 0 ? mapped : isAdminPreviewMode() ? mockCategories : []}
      />
    </div>
  );
}