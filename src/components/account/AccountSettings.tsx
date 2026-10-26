"use client";

import { useState } from "react";

import { createBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/shared/Button";
import { TextInput, FieldWrap } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { toast } from "@/components/account/toast";

export function AccountSettings({ email, fullName }: { email: string; fullName: string }) {
  const [name, setName] = useState(fullName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSavingName(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({ data: { full_name: name } });
      if (error) throw error;
      const { error: profileError } = await supabase.from("profiles").update({ full_name: name }).eq("id", (await supabase.auth.getUser()).data.user!.id);
      if (profileError) throw profileError;
      toast("Profile updated");
    } catch (err) {
      toast("Could not update", (err as Error).message);
    } finally {
      setSavingName(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast("Password too short");
    if (password !== confirm) return toast("Passwords do not match");
    setSavingPw(true);
    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast("Password updated");
      setPassword("");
      setConfirm("");
    } catch (err) {
      toast("Could not update password", (err as Error).message);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <section className="rounded-2xl border border-outline-variant bg-surface p-5">
        <h2 className="font-heading-md font-semibold !text-on-surface">Profile</h2>
        <form onSubmit={saveName} className="mt-4 flex flex-col gap-4">
          <TextInput label="Full name" value={name} onChange={(e) => setName(e.target.value)} icon="person" />
          <TextInput label="Email address" value={email} disabled hint="Email can't be changed here." />
          <FieldWrap>
            <Button type="submit" size="md" loading={savingName}>Save profile</Button>
          </FieldWrap>
        </form>
      </section>

      <section className="rounded-2xl border border-outline-variant bg-surface p-5">
        <h2 className="font-heading-md font-semibold !text-on-surface">Change password</h2>
        <form onSubmit={savePassword} className="mt-4 flex flex-col gap-4">
          <TextInput label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} icon="lock" required minLength={8} />
          <TextInput label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} icon="lock" required minLength={8} />
          <FieldWrap>
            <Button type="submit" size="md" loading={savingPw}>Update password</Button>
          </FieldWrap>
        </form>
      </section>

      <section className="rounded-2xl border border-error/30 bg-error/5 p-5">
        <h2 className="flex items-center gap-2 font-heading-md font-semibold text-error">
          <Icon name="warning" size="md" /> Danger zone
        </h2>
        <p className="mt-1 font-body-sm text-on-surface-variant">
          Request export or deletion of your data. Deletion permanently removes your account and published invitations.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon="download" onClick={() => toast("Export queued", "We'll email a download link shortly.")}>
            Export my data
          </Button>
          <Button variant="danger" size="sm" icon="delete" onClick={() => toast("Deletion must be confirmed", "Contact support to complete this.")}>
            Delete account
          </Button>
        </div>
      </section>
    </div>
  );
}