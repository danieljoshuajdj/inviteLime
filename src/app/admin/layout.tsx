import { redirect } from "next/navigation";

import { createServerClient } from "@/lib/supabase/server";
import { isAdminPreviewMode } from "@/lib/services/admin-preview";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const preview = isAdminPreviewMode();

  if (!preview) {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login?next=/admin/dashboard");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "admin") redirect("/app/explore?error=forbidden");
  }

  return (
    <AdminShell preview={preview}>
      {children}
    </AdminShell>
  );
}
