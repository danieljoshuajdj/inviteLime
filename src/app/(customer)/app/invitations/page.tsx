import type { Metadata } from "next";

import { createServerClient } from "@/lib/supabase/server";
import { invitationUrl } from "@/lib/services/weddings";
import {
  InvitationsList,
  type InvitationItem,
} from "@/components/account/InvitationsList";

export const metadata: Metadata = {
  title: "My invitations",
};

interface InvitationRow {
  id: string;
  slug: string | null;
  form_type: string | null;
  bride_name: string | null;
  groom_name: string | null;
  celebrant_name: string | null;
  wedding_date: string | null;
  venue: string | null;
  status: string | null;
  expiration_date: string | null;
  wedding_data: Record<string, unknown> | null;
  template: { name: string } | Array<{ name: string }> | null;
  views?: number;
  attending?: number;
}

export default async function InvitationsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let invitations: InvitationRow[] = [];
  let canDelete = false;
  if (user) {
    try {
      const [{ data }, { data: profile }] = await Promise.all([
        supabase
          .from("weddings")
          .select(
            `id, slug, form_type, bride_name, groom_name, celebrant_name, wedding_date, venue, status, expiration_date, created_at, wedding_data,
             template:template_id(id, name, slug)`
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle(),
      ]);

      canDelete = profile?.role === "planner";
      invitations = (data ?? []) as unknown as InvitationRow[];

      // Enrich with live view & RSVP counts.
      for (const w of invitations) {
        const weddingId = w.id;
        const [views, attending] = await Promise.all([
          supabase.from("invitation_views").select("id", { count: "exact", head: true }).eq("wedding_id", weddingId),
          supabase
            .from("rsvp_responses")
            .select("attendance", { count: "exact", head: true })
            .eq("wedding_id", weddingId)
            .eq("attendance", "attending"),
        ]);
        w.views = views.count ?? 0;
        w.attending = attending.count ?? 0;
      }
    } catch {
      invitations = [];
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">My invitations</p>
          <h1 className="mt-1 font-heading-2xl !text-on-surface">Your published & draft invitation websites</h1>
        </div>
      </div>

      <div className="mt-6">
        <InvitationsList
          canDelete={canDelete}
          items={invitations.map((w) => ({
            id: w.id,
            slug: w.slug ?? "",
            bride: w.bride_name ?? "",
            groom: w.groom_name ?? "",
            celebrant: w.celebrant_name ?? "",
            birthdayNumber:
              typeof w.wedding_data?.birthdayNumber === "number"
                ? w.wedding_data.birthdayNumber
                : null,
            formType: w.form_type,
            date: w.wedding_date ?? "",
            venue: w.venue ?? "",
            status: (w.status ?? "draft") as InvitationItem["status"],
            expiration: w.expiration_date ?? null,
            views: w.views ?? 0,
            attending: w.attending ?? 0,
            templateName:
              (!Array.isArray(w.template) && w.template
                ? w.template.name
                : w.template?.[0]?.name) ?? "Custom invitation",
            url: w.slug ? invitationUrl(w.slug) : null,
          }))}
        />
      </div>
    </div>
  );
}
