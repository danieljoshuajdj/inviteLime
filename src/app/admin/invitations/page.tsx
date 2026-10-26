import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import {
  listInvitations,
  parseInvitationFilters,
  toQueryString,
  type InvitationListResult,
  type InvitationRow,
} from "@/lib/services/admin-invitations";
import { InvitationsManager } from "@/components/admin/InvitationsManager";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const previewRows: InvitationRow[] = [
  {
    id: "5f0d2a11-0000-4000-8000-000000000001",
    slug: "meera-aarav-2027",
    couple: "Aarav & Meera",
    brideName: "Meera",
    groomName: "Aarav",
    email: "meera@example.com",
    status: "active",
    templateName: "Testing",
    templateSlug: "testing",
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    expirationDate: "2028-02-14",
    mediaCount: 6,
    rsvpCount: 2,
    emails: [
      {
        templateKey: "invitation_published",
        toEmail: "meera@example.com",
        status: "sent",
        sentAt: new Date(Date.now() - 86400000).toISOString(),
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ],
  },
  {
    id: "5f0d2a11-0000-4000-8000-000000000002",
    slug: "anita-vikram-2026",
    couple: "Vikram & Anita",
    brideName: "Anita",
    groomName: "Vikram",
    email: "anita@example.com",
    status: "expired",
    templateName: "Testing 2",
    templateSlug: "testing-2",
    createdAt: new Date(Date.now() - 86400000 * 40).toISOString(),
    publishedAt: new Date(Date.now() - 86400000 * 38).toISOString(),
    expirationDate: "2026-06-01",
    mediaCount: 3,
    rsvpCount: 0,
    emails: [],
  },
  {
    id: "5f0d2a11-0000-4000-8000-000000000003",
    slug: null,
    couple: "Deepa & Rohan",
    brideName: "Rohan",
    groomName: "Deepa",
    email: null,
    status: "draft",
    templateName: "Testing",
    templateSlug: "testing",
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    publishedAt: null,
    expirationDate: null,
    mediaCount: 1,
    rsvpCount: 0,
    emails: [],
  },
];

export default async function AdminInvitationsPage({ searchParams }: PageProps) {
  const filters = parseInvitationFilters(await searchParams);

  let result: InvitationListResult;
  try {
    result = await listInvitations(createAdminClient(), filters);
  } catch {
    // Sample rows exist only so the table can be reviewed locally. Outside
    // preview mode a failed query must render as empty, never as fake data.
    if (!isAdminPreviewMode()) {
      result = { rows: [], total: 0, page: 1, perPage: 25, pageCount: 1 };
    } else {
      const q = filters.q.toLowerCase();
      const rows = previewRows.filter(
        (r) =>
          (!filters.status || filters.status === "all" || r.status === filters.status) &&
          (!q ||
            r.email?.toLowerCase().includes(q) ||
            r.couple.toLowerCase().includes(q) ||
            r.slug?.toLowerCase().includes(q))
      );
      result = { rows, total: rows.length, page: 1, perPage: 25, pageCount: 1 };
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Live links</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Invitations</h1>
        </div>
        <p className="font-body-xs text-on-surface-variant">
          {result.total} invitation{result.total === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-6">
        <InvitationsManager
          // Remounts when the filter query string changes, so the client's
          // local filter inputs and row state always match the server result.
          key={toQueryString(filters)}
          initialRows={result.rows}
          total={result.total}
          page={result.page}
          pageCount={result.pageCount}
          filters={filters}
        />
      </div>
    </div>
  );
}