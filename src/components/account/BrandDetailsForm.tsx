"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/shared/Button";
import { Textarea, TextInput } from "@/components/shared/Field";
import { Icon } from "@/components/shared/Icon";
import { toast } from "@/components/account/toast";

interface Brand {
  brandName: string;
  contactPhone: string;
  address: string | null;
  mapsUrl: string | null;
}

export function BrandDetailsForm({ initial }: { initial: Brand | null }) {
  const router = useRouter();
  const [brandName, setBrandName] = useState(initial?.brandName ?? "");
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [mapsUrl, setMapsUrl] = useState(initial?.mapsUrl ?? "");
  const [saving, setSaving] = useState(false);

  const previewName = brandName.trim() || "Your studio name";
  const previewPhone = contactPhone.trim() || "+91 98765 43210";
  const previewAddress = address.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/planner/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandName,
          contactPhone,
          address: address.trim() || null,
          mapsUrl: mapsUrl.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save brand details");
      toast("Brand details saved", "New invitations will use these details when you publish.");
      router.refresh();
    } catch (err) {
      toast("Could not save brand", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <form onSubmit={save} className="space-y-5 rounded-2xl border border-outline-variant bg-surface-container-low p-5 sm:p-6">
        <div>
          <h2 className="font-heading-lg !text-on-surface">Your studio identity</h2>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            This is shown on every invitation you publish under a Planner Plan. Couples never see your
            contact details unless you add them here.
          </p>
        </div>

        <TextInput
          label="Brand name"
          value={brandName}
          onChange={(e) => setBrandName(e.target.value)}
          placeholder="Marigold Weddings"
          required
          maxLength={120}
        />
        <TextInput
          label="Contact number"
          hint="Guests tap to call this number from the invitation footer."
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="+91 98765 43210"
          required
          inputMode="tel"
        />
        <Textarea
          label="Studio address"
          hint="Optional. Shown under your brand in the footer."
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="12 Palm Grove, Bengaluru 560001"
          rows={3}
          maxLength={500}
        />
        <TextInput
          label="Location map link"
          hint="Optional. Paste a Google Maps or other http(s) link. A “View map” action appears in the footer."
          value={mapsUrl}
          onChange={(e) => setMapsUrl(e.target.value)}
          placeholder="https://maps.google.com/..."
          type="url"
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant pt-5">
          <Button type="submit" loading={saving} icon="save">
            Save brand details
          </Button>
          <p className="font-body-xs text-on-surface-variant">
            Brand edits apply to future publishes. Live invitations keep the details they were published with.
          </p>
        </div>
      </form>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 font-body-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
          How it appears
        </p>
        <div className="overflow-hidden rounded-2xl border border-outline-variant bg-ivory-950 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-ivory-100">
            <span className="font-body-xs uppercase tracking-[0.16em] text-ivory-200/80">Cover credit</span>
            <span className="font-heading-sm !text-ivory-50">{previewName}</span>
          </div>
          <div className="space-y-2 px-5 py-7 text-center text-ivory-100">
            <p className="font-heading-xl !text-ivory-50">A &amp; B</p>
            <p className="font-body-xs uppercase tracking-[0.2em] text-ivory-200/70">are getting married</p>
          </div>
          <div className="border-t border-white/10 bg-black/20 px-5 py-5 text-center text-ivory-100">
            <p className="font-body-xs uppercase tracking-[0.16em] text-ivory-200/70">Presented by</p>
            <p className="mt-1 font-heading-lg !text-ivory-50">{previewName}</p>
            <p className="mt-1 font-body-sm text-ivory-100/90">{previewPhone}</p>
            {previewAddress && <p className="mt-1 font-body-xs text-ivory-100/70">{previewAddress}</p>}
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <span className="rounded-full border border-white/30 px-3 py-1.5 font-body-xs">Call studio</span>
              {mapsUrl.trim() && (
                <span className="rounded-full border border-white/30 px-3 py-1.5 font-body-xs">View map</span>
              )}
            </div>
          </div>
        </div>
        <p className="mt-3 flex gap-2 font-body-xs text-on-surface-variant">
          <Icon name="info" size="sm" className="mt-0.5 shrink-0" />
          Templates that support planner branding place the credit on the cover and in the navbar. Older
          templates receive a platform fallback band automatically.
        </p>
      </aside>
    </div>
  );
}
