import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <h1 className="font-heading-xl text-ivory-950 sm:font-heading-2xl">Reset your password</h1>
      <p className="mb-6 mt-2 font-body-sm text-navy-700">
        Enter the email you registered with and we will send you a secure reset link.
      </p>
      <Suspense fallback={<p className="font-body-sm text-navy-700">Loading…</p>}>
        <AuthForm mode="reset" />
      </Suspense>
    </AuthShell>
  );
}
