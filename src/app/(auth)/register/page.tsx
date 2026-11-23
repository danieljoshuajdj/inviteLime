import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Create account" };

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Account creation now happens through the Google button on `/login`.
 * Keeping this route as a redirect avoids dead links in old emails and pages.
 */
export default async function RegisterPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
