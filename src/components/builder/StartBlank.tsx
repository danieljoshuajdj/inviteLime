"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";

export function StartBlank() {
  const router = useRouter();

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/guest/start", { method: "POST", body: "{}", signal: controller.signal });
        const json = (await res.json()) as { token?: string; error?: string };
        if (res.ok && json.token) {
          router.replace(`/create/${json.token}`);
          return;
        }
        router.replace("/create/browse?error=start");
      } catch {
        // keep the manual button usable
      }
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [router]);

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
        <Icon name="auto_awesome" size="xl" weight="w400" />
      </span>
      <h1 className="mt-5 font-heading-2xl !text-on-surface">Making your invitation…</h1>
      <p className="mt-2 max-w-sm font-body text-on-surface-variant">
        We&apos;ve picked our signature minimal template so you can start writing right away.
      </p>
      <Button variant="outline" size="sm" className="mt-6" onClick={() => router.replace("/create/browse")}>
        Choose a different template instead
      </Button>
    </div>
  );
}