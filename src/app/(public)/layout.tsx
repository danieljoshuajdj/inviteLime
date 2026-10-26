import type { ReactNode } from "react";

import { PublicFooter } from "@/components/public/PublicFooter";
import { PublicNav } from "@/components/public/PublicNav";
import { createServerClient } from "@/lib/supabase/server";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  // Resolve the visitor once here so the nav can drop the sign-in action for
  // people who already have a session, and send each role to its own console.
  let signedIn = false;
  let dashboardHref = "/app/invitations";
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      signedIn = true;
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.role === "admin") dashboardHref = "/admin/dashboard";
    }
  } catch {
    // The public site must still render if the auth lookup is unavailable.
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ivory-50 text-navy-950">
      <PublicNav signedIn={signedIn} dashboardHref={dashboardHref} />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
