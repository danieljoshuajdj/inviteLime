"use client";

import { useState } from "react";

import { toast } from "@/components/account/toast";
import { Button } from "@/components/shared/Button";
import { TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import {
  normalizeWebsiteDestination,
  WEBSITE_REDIRECT_PATH,
} from "@/lib/website-redirect";

interface Props {
  /** Destination loaded server-side so the form is usable on first paint. */
  initialUrl: string | null;
}

/**
 * Admin control for the one global "Visit Our Website" destination.
 *
 * Saving writes `site_settings.website_redirect_url`; every template that uses
 * the website link already points at the permanent `/visit-website` route, so
 * no template or invitation record needs updating when the destination changes.
 */
export function WebsiteRedirectCard({ initialUrl }: Props) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [savedUrl, setSavedUrl] = useState<string | null>(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = url.trim();
    const normalized = normalizeWebsiteDestination(trimmed);
    if (trimmed && !normalized) {
      setError("Enter a valid website address, for example https://example.com.");
      setSuccess(null);
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings/website", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalized ?? "" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        websiteUrl?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error ?? "Could not save the website redirect.");
      }

      const saved = json.websiteUrl ?? null;
      setSavedUrl(saved);
      setUrl(saved ?? "");
      setSuccess(
        saved
          ? "Saved. Every invitation using the website link now sends guests to this website."
          : "Saved. The website redirect is now disabled."
      );
      toast("Website redirect saved");
    } catch (err) {
      const message =
        (err as Error).message || "Could not save the website redirect.";
      setError(message);
      toast("Could not save website redirect", message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-outline-variant bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
          <Icon name="public" size="md" />
        </span>
        <div className="min-w-0">
          <h3 className="font-heading-md font-semibold !text-on-surface">
            Visit Website Redirect
          </h3>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            One destination for every invitation that uses the website link.
            Templates bind to a permanent platform link, so changing this URL
            updates existing and future invitations without editing or
            republishing a template.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-5 flex max-w-2xl flex-col gap-4">
        <TextInput
          label="Website URL"
          name="websiteUrl"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error) setError(null);
            if (success) setSuccess(null);
          }}
          placeholder="https://your-website.com"
          hint="Leave blank to disable the redirect. Guests only see the permanent platform link inside the template."
          error={error ?? undefined}
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" icon="save" loading={busy}>
            Save Changes
          </Button>
          {savedUrl ? (
            <a
              href={savedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 font-body-sm font-semibold text-secondary hover:underline"
            >
              Open current destination
              <Icon name="open_in_new" size="sm" />
            </a>
          ) : null}
        </div>

        {success ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 font-body-sm text-on-surface"
          >
            <Icon
              name="check_circle"
              size="sm"
              className="mt-0.5 shrink-0 text-success"
            />
            {success}
          </p>
        ) : null}
      </form>

      <div className="mt-5 border-t border-outline-variant pt-4">
        <p className="font-body-xs font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
          Current destination
        </p>
        {savedUrl ? (
          <p className="mt-1 break-all font-body-sm font-medium text-on-surface">
            {savedUrl}
          </p>
        ) : (
          <p className="mt-1 font-body-sm text-on-surface-variant">
            No destination configured yet. The button shows a safe
            &ldquo;website unavailable&rdquo; page until you save one.
          </p>
        )}
        <p className="mt-2 font-body-xs text-on-surface-variant">
          Templates point at{" "}
          <code className="rounded bg-surface-container px-1.5 py-0.5 font-mono text-[11px] text-on-surface">
            {WEBSITE_REDIRECT_PATH}
          </code>
          , which forwards to the saved destination. Changes take effect on the
          next click.
        </p>
      </div>
    </div>
  );
}
