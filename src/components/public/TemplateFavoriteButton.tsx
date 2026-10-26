"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/shared/Icon";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  templateId: string;
  templateName: string;
  initialFavorite?: boolean;
  className?: string;
  withLabel?: boolean;
}

/**
 * Favorites are stored in `favorite_templates` and protected by RLS, so the
 * browser client can only ever touch the signed-in customer's own rows.
 * Duplicate favorites are prevented by the table's composite primary key.
 */
export function TemplateFavoriteButton({
  templateId,
  templateName,
  initialFavorite = false,
  className,
  withLabel = false,
}: Props) {
  const [favorite, setFavorite] = useState(initialFavorite);
  const [userId, setUserId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      setUserId(user?.id ?? null);
      if (!user) {
        setResolved(true);
        return;
      }
      const { data } = await supabase
        .from("favorite_templates")
        .select("template_id")
        .eq("user_id", user.id)
        .eq("template_id", templateId)
        .maybeSingle();
      if (!active) return;
      setFavorite(Boolean(data));
      setResolved(true);
    })();
    return () => {
      active = false;
    };
  }, [templateId]);

  const toggle = useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!userId || pending) return;
      setPending(true);
      const next = !favorite;
      setFavorite(next);
      const supabase = createBrowserClient();
      const { error } = next
        ? await supabase.from("favorite_templates").upsert(
            { user_id: userId, template_id: templateId },
            { onConflict: "user_id,template_id", ignoreDuplicates: true }
          )
        : await supabase.from("favorite_templates").delete().eq("user_id", userId).eq("template_id", templateId);
      if (error) setFavorite(!next);
      setPending(false);
    },
    [favorite, pending, templateId, userId]
  );

  if (!resolved) {
    return <span className={cn("h-9 w-9 animate-pulse rounded-full bg-surface-container-high", className)} aria-hidden />;
  }

  // Anonymous visitors are sent through sign-in; the favorite is retried after.
  if (!userId) {
    return (
      <Link
        href={`/login?next=/templates`}
        aria-label={`Sign in to save ${templateName} to favorites`}
        className={cn(
          "inline-flex items-center gap-2 rounded-full bg-surface-container-lowest/95 px-3 py-2 font-body-xs font-medium text-on-surface shadow-sm hover:bg-surface-container-lowest",
          className
        )}
      >
        <Icon name="favorite_border" size="sm" />
        {withLabel && <span>Save</span>}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={favorite}
      aria-label={favorite ? `Remove ${templateName} from favorites` : `Add ${templateName} to favorites`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-surface-container-lowest/95 px-3 py-2 font-body-xs font-medium shadow-sm transition-transform hover:scale-105 disabled:opacity-60",
        favorite ? "text-error" : "text-on-surface",
        className
      )}
    >
      <Icon name="favorite" size="sm" filled={favorite} weight={favorite ? "w600" : "w400"} />
      {withLabel && <span>{favorite ? "Saved" : "Save"}</span>}
    </button>
  );
}
