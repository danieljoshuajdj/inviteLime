import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Sign in" };

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

/**
 * Customer accounts are Google-only, so there is no password reset flow to
 * offer here. Old links land on the sign-in screen instead of a dead form.
 */
export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const { next } = await searchParams;
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
