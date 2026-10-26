import type { ReactNode } from "react";

/**
 * Route group for the authentication screens. Intentionally has no shared
 * chrome: unlike the `(public)` marketing layout it renders no nav or footer,
 * so `AuthShell` can own the whole viewport. A layout file still exists so the
 * group is explicit and future auth pages inherit the same treatment.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="bg-ivory-50">{children}</div>;
}
