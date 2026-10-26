import type { Metadata } from "next";

import { createServerClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/components/account/AccountSettings";
import { AccountTabs } from "@/components/account/AccountTabs";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user!.id)
    .maybeSingle();

  return (
    <div>
      <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">Account</p>
      <h1 className="mt-1 font-heading-2xl !text-on-surface">Settings</h1>
      <div className="mt-5">
        <AccountTabs active="profile" isPlanner={profile?.role === "planner"} />
      </div>
      <div className="mt-6">
        <AccountSettings email={user?.email ?? ""} fullName={profile?.full_name ?? ""} />
      </div>
    </div>
  );
}