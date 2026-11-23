import { Suspense } from "react";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export default function LoginPage() {
  return (
    <AuthShell>
      <h1 className="font-heading-xl text-ivory-950 sm:font-heading-2xl">Welcome</h1>
      <p className="mb-6 mt-2 font-body-sm text-navy-700">
        Sign in with Google to create and customize your invitations.
      </p>
      <Suspense fallback={<p className="font-body-sm text-navy-700">Loading…</p>}>
        <AuthForm />
      </Suspense>
    </AuthShell>
  );
}
