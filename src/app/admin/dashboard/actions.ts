"use server";

/**
 * Server actions for the admin dashboard.
 * Export actions redirect the browser to the CSV download endpoint.
 * All authorization is enforced on the API route itself (requireAdmin).
 */

export async function handleAdminExport(type: string, from?: string, to?: string) {
  const params = new URLSearchParams({ type });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const url = `/api/admin/exports?${params.toString()}`;

  // Return the download URL so the client-side component can trigger a window.open or anchor click.
  // We cannot trigger a file download from a server action directly.
  return { url, filename: `invite-lime-${type}-${new Date().toISOString().slice(0, 10)}.csv` };
}