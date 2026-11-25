import { ConfigurationCards } from "@/components/admin/ConfigurationCards";
import { HeroContentCard } from "@/components/admin/HeroContentCard";
import { WebsiteRedirectCard } from "@/components/admin/WebsiteRedirectCard";
import { getHeroContentWithUrls } from "@/lib/services/hero-content";
import { getWebsiteRedirectDestination } from "@/lib/services/website-redirect";

export const dynamic = "force-dynamic";

export default async function AdminConfigurationPage() {
  const [websiteUrl, hero] = await Promise.all([
    getWebsiteRedirectDestination(),
    getHeroContentWithUrls(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-secondary">
        Admin studio
      </p>
      <h1 className="mt-1 font-heading-2xl !text-on-surface">Configuration</h1>
      <p className="mt-2 max-w-2xl font-body-sm text-on-surface-variant">
        Manage shared template data and the content library that templates draw
        from. Changes here apply everywhere the content is used, without
        republishing a template package.
      </p>

      <section className="mt-8">
        <h2 className="font-heading-lg !text-on-surface">Home Page</h2>
        <p className="mt-1 max-w-2xl font-body-sm text-on-surface-variant">
          The headline, supporting copy and invitation carousel on the public
          home page. Update the advertising copy here without a code change.
        </p>
        <HeroContentCard initial={hero} />
      </section>

      <section className="mt-10">
        <h2 className="font-heading-lg !text-on-surface">Template Data</h2>
        <p className="mt-1 max-w-2xl font-body-sm text-on-surface-variant">
          Platform values injected into every invitation template. They stay
          under platform control, so existing invitations follow a change here
          immediately.
        </p>
        <WebsiteRedirectCard initialUrl={websiteUrl} />
      </section>

      <section className="mt-10">
        <h2 className="font-heading-lg !text-on-surface">Shared Libraries</h2>
        <p className="mt-1 max-w-2xl font-body-sm text-on-surface-variant">
          Media, music, sample details, categories and tags reused across
          template previews and the builder.
        </p>
        <ConfigurationCards />
      </section>
    </div>
  );
}
