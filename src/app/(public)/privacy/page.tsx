import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="Updated March 2026">
      <p>
        This Privacy Policy explains how Invite Lime (&quot;we&quot;, &quot;us&quot;) collects, uses, discloses
        and safeguards your information when you use our website, mobile website and
        services (&quot;Services&quot;).
      </p>
      <h2>1. Information we collect</h2>
      <p>
        <strong>Account data.</strong> When you register we collect your name, email address,
        and (if chosen) profile photo. App metadata indicates the account role
        (customer / admin) that you hold.
      </p>
      <p>
        <strong>Wedding data.</strong> When you create an invitation we store the details you
        provide to build your website: names, story, event schedules, venues, media,
        guest lists, RSVPs and messages.
      </p>
      <p>
        <strong>Usage data.</strong> We record page views and interactions on published
        invitation pages to display attendance counts and help couples understand engagement.
      </p>
      <h2>2. How we use information</h2>
      <p>
        We use the data to provide and improve the Services, to process payments through
        our payment provider (Razorpay), to send transactional emails (order confirmations,
        published invitations), and to respond to support requests.
      </p>
      <h2>3. Sharing</h2>
      <p>
        We do not sell your personal data. Data is processed by trusted sub-processors
        (hosting, email, payments) only as required to run the Services. Published
        invitation pages are intentionally not indexed by public search engines and only
        the reserved link can reach them.
      </p>
      <h2>4. Retention</h2>
      <p>
        Invitations remain active until their expiration date (wedding date + 2 months,
        or longer where purchased). After expiration, access is disabled but data may remain available to the couple&apos;s account for export or renewal.
      </p>
      <h2>5. Security</h2>
      <p>
        We use encryption in transit, signed access to private storage, and role-based
        access controls. Guest-created invitations are stored under randomly generated
        access tokens that are never exposed in public URLs.
      </p>
      <h2>6. Your rights</h2>
      <p>
        You can request access to, correction of, or deletion of your personal data by
        contacting support. You may also download a copy of your wedding data from your
        account at any time.
      </p>
      <h2>7. Contact</h2>
      <p>
        Questions? Email {process.env.EMAIL_FROM ?? "support@invite-lime.example"} or use
        the contact page. We respond within 2 business days.
      </p>
    </LegalPage>
  );
}

function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="prose-invite-lime">
          <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">{updated}</p>
          <h1 className="mt-3 font-heading-3xl text-ivory-950">{title}</h1>
          <div className="mt-8 space-y-5 font-body-lg leading-relaxed text-navy-800 [&>h2]:mt-8 [&>h2]:font-heading-md [&>h2]:font-semibold [&>h2]:text-ivory-950 [&>p]:text-navy-800">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}