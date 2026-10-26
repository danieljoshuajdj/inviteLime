/**
 * Logical storage areas. Providers map these logical names to physical
 * backends (Supabase buckets or Backblaze B2 buckets). Template packages are
 * public product assets; wedding media is private.
 */
export const WEDDING_BUCKET = "weddings";
export const TEMPLATE_BUCKET = "templates";