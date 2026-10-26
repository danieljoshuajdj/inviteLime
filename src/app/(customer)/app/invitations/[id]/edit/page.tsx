import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";
import { WeddingEditor } from "@/components/account/WeddingEditor";

export const metadata: Metadata = { title: "Edit invitation" };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditInvitationPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: wedding } = await supabase
    .from("weddings")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!wedding) redirect("/app/invitations");

  return (
    <div>
      <Link href={`/app/invitations/${id}`} className="inline-flex items-center gap-1 font-body-xs font-semibold text-primary hover:underline md:font-body-md">
        <span aria-hidden>←</span> Back to invitation
      </Link>
      <h1 className="mt-3 font-heading-2xl !text-on-surface">Edit invitation content</h1>
      <p className="mt-1 font-body text-on-surface-variant">
        Your reserved link stays the same — edits go live for every guest instantly.
      </p>
      <div className="mt-6">
        <WeddingEditor weddingId={id} />
      </div>
    </div>
  );
}