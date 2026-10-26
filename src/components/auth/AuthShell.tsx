import { LogoLink } from "@/components/shared/Logo";

/**
 * Focused, full-screen frame shared by every auth screen (`/login`,
 * `/register`, `/forgot-password`, `/auth/update-password`).
 *
 * Auth pages live in the `(auth)` route group and deliberately opt out of the
 * marketing chrome (nav + footer). Wrapping them in the public layout used to
 * stack a full extra viewport of empty space under the sticky nav, and the
 * card was vertically centred inside it, leaving large dead gaps on phones.
 *
 * The shell only owns the frame and the wordmark; each page renders its own
 * heading and copy.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-ivory-50 px-4 py-10 sm:py-14">
      <div className="w-full max-w-md">
        <LogoLink href="/" height={40} priority className="mb-8 justify-center sm:mb-10" />

        <div className="rounded-3xl border border-navy-200 bg-ivory-50 p-6 shadow-sm sm:p-9">
          {children}
        </div>
      </div>
    </main>
  );
}
