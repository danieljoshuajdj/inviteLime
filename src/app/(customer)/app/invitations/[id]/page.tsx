import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import { createServerClient } from "@/lib/supabase/server";
import { invitationUrl } from "@/lib/services/weddings";
import { ManageInvitation, type RsvpRow } from "@/components/account/ManageInvitation";
import { formatDate } from "@/lib/utils";
import {
  formDefinition,
  formTypeOrDefault,
  isBirthdayForm,
  ordinal,
} from "@/lib/builder/forms";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ManageWeddingRow {
  id: string;
  slug: string | null;
  form_type: string | null;
  bride_name: string | null;
  groom_name: string | null;
  celebrant_name: string | null;
  wedding_date: string | null;
  venue: string | null;
  status: string;
  expiration_date: string | null;
  rsvp_toggle: boolean;
  wedding_data: Record<string, unknown> | null;
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
      .select(`id, slug, form_type, bride_name, groom_name, celebrant_name, wedding_date, venue, status, expiration_date, rsvp_toggle, wedding_data,
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

  const formType = formTypeOrDefault(wedding.form_type);
  const definition = formDefinition(formType);
  const birthday = isBirthdayForm(formType);
  const birthdayNumber =
    typeof wedding.wedding_data?.birthdayNumber === "number"
      ? wedding.wedding_data.birthdayNumber
      : null;
  const displayName = birthday
    ? wedding.celebrant_name?.trim() || "Birthday Star"
    : [wedding.groom_name, wedding.bride_name].filter(Boolean).join(" & ") || "Your invitation";
  const dateLine = birthday
    ? birthdayNumber !== null
      ? `${ordinal(birthdayNumber)} Birthday`
      : definition.label
    : wedding.wedding_date
      ? formatDate(wedding.wedding_date)
      : "Date TBD";

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
            couple: displayName,
            date: dateLine,
            venue: birthday ? "" : wedding.venue ?? "",
            status: wedding.status ?? "draft",
            templateName,
            formType,
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