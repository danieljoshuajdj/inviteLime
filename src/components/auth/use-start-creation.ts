"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserClient } from "@/lib/supabase/client";

/**
 * Starts template creation for the current visitor.
 *
 * A signed-in customer goes straight to the builder start route. A guest gets
 * the Google sign-in modal instead, with `next` preserving the exact template
 * so the OAuth callback returns them to that editor.
 */
export function useStartCreation() {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [next, setNext] = useState("/create/browse");
  const [pending, setPending] = useState(false);

  const start = useCallback(
    async (target: string) => {
      if (pending) return;
      setPending(true);
      try {
        const supabase = createBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          router.push(target);
          return;
        }

        setNext(target);
        setAuthOpen(true);
      } catch {
        // If the session lookup itself fails, still offer the Google flow
        // rather than blocking creation with a dead button.
        setNext(target);
        setAuthOpen(true);
      } finally {
        setPending(false);
      }
    },
    [pending, router]
  );

  const closeAuth = useCallback(() => setAuthOpen(false), []);

  return { start, pending, authOpen, next, closeAuth };
}
