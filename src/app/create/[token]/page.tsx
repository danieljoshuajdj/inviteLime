import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { getGuestDraft } from "@/lib/services/guest";
import { isPaymentBypassEnabled } from "@/lib/services/dev-bypass";
import { BuilderHost } from "@/components/builder/BuilderHost";
import { normalizeWeddingData } from "@/lib/builder/defaults";
import { getRequestCurrency } from "@/lib/services/geo";
import { quoteForTemplate } from "@/lib/services/pricing";
import { getPlannerEntitlement } from "@/lib/services/planner-plans";
import { getPlannerBrand, isPlannerBrandComplete } from "@/lib/services/planner-branding";

interface PageProps {
  params: Promise<{ token: string }>;
}

interface BuilderTemplateRow {
  id: string;
  name: string;
  slug: string;
  product_id: string | null;
  product:
    | {
        id: string;
        name: string;
        price_paise: number;
        currency: string;
        prices?: Array<{ currency: string; amount_minor: number; active: boolean }>;
      }
    | Array<{
        id: string;
        name: string;
        price_paise: number;
        currency: string;
        prices?: Array<{ currency: string; amount_minor: number; active: boolean }>;
      }>
    | null;
}

export default async function BuilderPage({ params }: PageProps) {
  const { token } = await params;
  if (!token || token.length < 10) notFound();

  const supabase = createAdminClient();
  const draft = await getGuestDraft(supabase, token);
  if (!draft) notFound();

  // Once a session has published, the wedding row is the canonical copy: its
  // media has been moved into the wedding folder and an already-open builder
  // tab may still be holding pre-migration URLs. Loading the live data here
  // prevents the next autosave from writing those stale paths back.
  const { data: liveWedding } = await supabase
    .from("weddings")
    .select("id, template_id, template_version_id, rsvp_toggle, wedding_data")
    .eq("guest_session_id", draft.session_id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const templateId = liveWedding?.template_id ?? draft.template_id;
  const templateVersionId = liveWedding?.template_version_id ?? draft.template_version_id;

  const { data: templateRaw } = await supabase
    .from("templates")
    .select(
      "id, name, slug, product_id, product:products(id, name, price_paise, currency, prices:product_prices(currency, amount_minor, active))"
    )
    .eq("id", templateId)
    .single();

  if (!templateRaw) notFound();
  const template = templateRaw as unknown as BuilderTemplateRow;

  // Planner context is for the builder's publish panel only. It is not placed
  // into wedding_data, so a customer or demo invitation can never inherit it.
  let plannerContext = null;
  if (draft.planner_id) {
    const entitlement = await getPlannerEntitlement(draft.planner_id, { client: supabase });
    const brand = await getPlannerBrand(draft.planner_id, supabase);
    plannerContext = {
      active: entitlement.active,
      canCreate: entitlement.canCreate,
      planName: entitlement.plan?.name ?? null,
      remaining: entitlement.remaining,
      limit: entitlement.limit,
      brandName: brand?.brandName ?? null,
      brandComplete: isPlannerBrandComplete(brand),
      reason: entitlement.reason,
    };
  }

  const storedWeddingData = liveWedding?.wedding_data ?? draft.wedding_data;
  const weddingData = normalizeWeddingData(
    liveWedding
      ? { ...(storedWeddingData as Record<string, unknown>), rsvpEnabled: liveWedding.rsvp_toggle }
      : storedWeddingData
  );
  const product = Array.isArray(template.product) ? template.product[0] ?? null : template.product;

  // The price shown here is the same server-resolved quote the checkout will
  // charge: the visitor's detected currency, looked up in product_prices.
  const quote = quoteForTemplate(
    {
      price_paise: product?.price_paise ?? 0,
      currency: product?.currency ?? "INR",
      prices: product?.prices ?? [],
    },
    await getRequestCurrency()
  );

  return (
    <BuilderHost
      token={token}
      initialData={weddingData}
      template={{
        id: template.id,
        name: template.name,
        slug: template.slug,
        pricePaise: quote.quote.amountMinor,
        currency: quote.quote.currency,
        versionId: templateVersionId,
      }}
      draftEmail={draft.email ?? null}
      planner={plannerContext}
      devBypassEnabled={isPaymentBypassEnabled()}
    />
  );
}