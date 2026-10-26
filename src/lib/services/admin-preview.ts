/**
 * Local UI preview escape hatch.
 *
 * When ADMIN_UI_PREVIEW=1 the admin layout renders without requiring a
 * signed-in admin session, so the panel can be reviewed before real auth/data
 * is wired up. It is ignored in production builds and does NOT weaken the
 * /api/admin/* routes, which still call requireAdmin().
 */
export function isAdminPreviewMode() {
  return process.env.ADMIN_UI_PREVIEW === "1" && process.env.NODE_ENV !== "production";
}
