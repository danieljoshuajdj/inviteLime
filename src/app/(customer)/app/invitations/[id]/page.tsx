import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createServerClient } from "@/lib/supabase/server";
import { invitationUrl } from "@/lib/services/weddings";
import { ManageInvitation, type RsvpRow } from "@/components/account/ManageInvitation";
import { formatDate } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ManageWeddingRow {
  id: string;
  slug: string | null;
  bride_name: string | null;
  groom_name: string | null;
  wedding_date: string | null;
  venue: string | null;
  status: string;
  expiration_date: string | null;
  rsvp_toggle: boolean;
  template:
    | { id: string; name: string }
    | Array<{ id: string; name: string }>
    | null;
}

export function generateMetadata(): Metadata {
  return { title: `Manage invitation` };
}

export default async function ManageInvitationPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: weddingRaw }, { data: profile }] = await Promise.all([
    supabase
      .from("weddings")
      .select(`id, slug, bride_name, groom_name, wedding_date, venue, status, expiration_date, rsvp_toggle,
               template:template_id(id, name)`)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!weddingRaw) notFound();
  const wedding = weddingRaw as unknown as ManageWeddingRow;
  const templateName =
    !Array.isArray(wedding.template) && wedding.template ? wedding.template.name : wedding.template?.[0]?.name ?? "Custom invitation";

  const [viewsRes, rsvpsRes] = await Promise.all([
    supabase.from("invitation_views").select("id", { count: "exact", head: true }).eq("wedding_id", id),
    supabase.from("rsvp_responses").select("*").eq("wedding_id", id).order("created_at", { ascending: false }),
  ]);

  const rsvps = (rsvpsRes.data ?? []) as Array<Record<string, unknown>>;
  const attending = rsvps.filter((r) => r.attendance === "attending").reduce((n, r) => n + Number(r.guests ?? 1), 0);
  const rsvpRows: RsvpRow[] = rsvps.map((r) => ({
    name: String(r.name ?? ""),
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    attendance: String(r.attendance ?? ""),
    guests: Number(r.guests ?? 1),
    dietary: (r.dietary as string | null) ?? null,
    message: (r.message as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
  }));

  return (
    <div>
      <Link href="/app/invitations" className="inline-flex items-center gap-1 font-body-xs font-semibold text-primary hover:underline md:font-body-md">
        <span aria-hidden>←</span> Back to my invitations
      </Link>

      <div className="mt-3">
        <ManageInvitation
          invitation={{
            id: wedding.id,
            slug: wedding.slug ?? "",
            couple: `${wedding.groom_name ?? "—"} & ${wedding.bride_name ?? "—"}`,
            date: wedding.wedding_date ? formatDate(wedding.wedding_date) : "Date TBD",
            venue: wedding.venue ?? "",
            status: wedding.status ?? "draft",
            templateName,
            views: viewsRes.count ?? 0,
            attendingCount: attending,
            rsvpCount: rsvps.length,
            url: wedding.slug ? invitationUrl(wedding.slug) : null,
            rsvpToggle: wedding.rsvp_toggle,
          }}
          rsvps={rsvpRows}
          canDelete={profile?.role === "planner"}
        />
      </div>
    </div>
  );
}