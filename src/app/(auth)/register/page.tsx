import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell>
      <h1 className="font-heading-xl text-ivory-950 sm:font-heading-2xl">Create your account</h1>
      <p className="mb-6 mt-2 font-body-sm text-navy-700">
        Save your designs, track RSVPs and manage requests in one place.
      </p>
      <Suspense fallback={<p className="font-body-sm text-navy-700">Loading…</p>}>
        <AuthForm mode="register" />
      </Suspense>
    </AuthShell>
  );
}
