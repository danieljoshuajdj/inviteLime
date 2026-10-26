import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

export function createClient() {
  return createSsrBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Alias kept for ergonomic imports in client components.
export const createBrowserClient = createClient;