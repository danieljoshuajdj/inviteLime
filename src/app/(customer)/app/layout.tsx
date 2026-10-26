import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";
import { AccountShell } from "@/components/account/AccountShell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/app/explore");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AccountShell
      user={{ email: user.email ?? "", name: profile?.full_name ?? "" }}
      isAdmin={profile?.role === "admin"}
    >
      {children}
    </AccountShell>
  );
}