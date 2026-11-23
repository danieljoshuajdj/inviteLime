"use client";

import { AuthRequiredModal } from "@/components/auth/AuthRequiredModal";
import { useStartCreation } from "@/components/auth/use-start-creation";

interface Props {
  templateSlug: string;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * A create/customise link that checks for a signed-in customer first.
 *
 * Guests see the Google-only sign-in modal and, after OAuth, land on the
 * builder for the same template. The real `href` is still present, so the link
 * works with keyboard/middle-click and without JavaScript.
 */
export function StartCreationLink({ templateSlug, children, className, ariaLabel }: Props) {
  const { start, pending, authOpen, next, closeAuth } = useStartCreation();
  const href = `/create/new?template=${encodeURIComponent(templateSlug)}`;

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Let the browser handle new-tab/new-window intents; the destination is
    // guarded server-side anyway.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    void start(href);
  }

  return (
    <>
      <a
        href={href}
        onClick={handleClick}
        className={className}
        aria-label={ariaLabel}
        aria-busy={pending || undefined}
      >
        {children}
      </a>
      <AuthRequiredModal open={authOpen} onClose={closeAuth} next={next} />
    </>
  );
}
