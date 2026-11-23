import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { createServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  // An already-signed-in administrator should not see the form again.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "admin") redirect("/admin/dashboard");
  }

  return (
    <AuthShell>
      <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">
        Admin studio
      </p>
      <h1 className="mt-2 font-heading-xl text-ivory-950 sm:font-heading-2xl">
        Admin sign in
      </h1>
      <p className="mb-6 mt-2 font-body-sm text-navy-700">
        Use your administrator email and password to open the studio.
      </p>
      <Suspense fallback={<p className="font-body-sm text-navy-700">Loading…</p>}>
        <AdminLoginForm />
      </Suspense>
    </AuthShell>
  );
}
