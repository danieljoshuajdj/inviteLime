import { slugify } from "@/lib/utils";

/** Category names come from the database; the filter chips are keyed by slug. */
export function categorySlug(name: string): string {
  return slugify(name);
}

/**
 * A template matches when any of its category *names* slugs into one of the
 * selected chip slugs. Comparing the raw names to the slugs used to empty the
 * grid for every filter.
 */
export function matchesSelectedCategories(
  categories: string[],
  selectedSlugs: string[]
): boolean {
  if (selectedSlugs.length === 0) return true;
  return categories.some((name) => selectedSlugs.includes(categorySlug(name)));
}
