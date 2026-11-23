"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { friendlyAuthParam } from "@/lib/auth-errors";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { Icon } from "@/components/shared/Icon";

/**
 * Customer sign-in is Google-only.
 *
 * Supabase keeps the existing account rows and links a Google identity by its
 * verified email, so returning customers keep their invitations, drafts and
 * purchase history without creating a second account.
 */
export function AuthForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app/explore";
  const [error, setError] = useState<string | null>(() => friendlyAuthParam(searchParams.get("error")));

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="flex items-center gap-2 rounded-lg bg-error/10 px-3 py-2 font-body-sm text-error" role="alert">
          <Icon name="error" size="sm" /> {error}
        </p>
      )}

      <GoogleSignInButton
        next={next}
        onError={(message) => setError(message || null)}
        // Keep the label on one line inside the narrow auth card; the default
        // 18px size wrapped to two lines at 300px.
        className="whitespace-nowrap border-navy-200 bg-white !px-4 !text-[15px] text-navy-900 hover:bg-ivory-100 sm:!px-6"
      />

      <p className="text-center font-body-xs leading-relaxed text-navy-600">
        We use your Google account for secure sign-in. Your receipt and live
        invitation link are sent to the same email address.
      </p>
    </div>
  );
}
