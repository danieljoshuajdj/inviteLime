"use client";

import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { TextInput, Textarea, FieldWrap } from "@/components/shared/Field";
import { ToastMessage } from "@/components/shared/Toast";

export function ContactForm() {
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    setPending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setToast({
        id: Date.now(),
        kind: "success",
        title: "Message sent",
        description: "Our concierge team will reply within 2 business days.",
      });
      form.reset();
    } catch (err) {
      setToast({ id: Date.now(), kind: "error", title: "Could not send", description: (err as Error).message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput name="name" label="Your name" placeholder="Rahul Kapoor" required />
        <TextInput name="email" label="Email address" type="email" placeholder="you@example.com" required />
      </div>
      <TextInput name="subject" label="Subject" placeholder="How can we help?" required />
      <Textarea name="message" label="Message" rows={5} placeholder="Tell us about your wedding plans…" required />
      <FieldWrap>
        <Button type="submit" size="lg" loading={pending} icon="send">
          Send message
        </Button>
      </FieldWrap>
      {toast && !pending && (
        <p className={"text-start font-body-sm " + (toast.kind === "success" ? "text-success" : "text-error")}>
          {toast.title}: {toast.description}
        </p>
      )}
    </form>
  );
}