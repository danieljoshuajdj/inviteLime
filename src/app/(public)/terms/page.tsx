import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of service",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="Updated March 2026">
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your use of the Invite Lime website and
        services. By creating an account, starting a guest creation or purchasing a
        license, you agree to these Terms.
      </p>
      <h2>1. The Service</h2>
      <p>
        Invite Lime lets couples build personalized wedding invitation websites from licensed
        templates. &quot;Guest creation&quot; lets invitee-facing tools (section: Guest creation)
        work without an account; all such drafts are temporary and bound to a session
        token.
      </p>
      <h2>2. Licenses &amp; fees</h2>
      <p>
        Each template is licensed per wedding as a one-time fee (specified on the template
        page) covering the wedding host, all guest interactions (RSVPs, attendance
        counts) and hosting until the invitation expiration date. Fees include applicable
        taxes as shown at checkout. A refundable deposit may apply and is refundable
        within 14 days of purchase, minus applicable payment-processing costs, provided
        the invitation has not been published live.
      </p>
      <h2>3. Your content &amp; conduct</h2>
      <p>
        You are responsible for the content you publish. You may not upload unlawful,
        infringing, or deceptive content, impersonate others, harvest guest data, or
        misuse the reserved-link system (for example, by registering slugs that imitate
        other brands). We may remove content that violates these Terms.
      </p>
      <h2>4. Reserved links</h2>
      <p>
        Published invitations receive a unique reserved link. We guarantee the link
        remains stable for the license period and we do not list invitations in public
        indexes. We reserve the right to remove links that are inactive for more than
        12 months after expiry.
      </p>
      <h2>5. Payments &amp; refunds</h2>
      <p>
        Payments are processed by Razorpay on our behalf. Your payment information is
        handled by our provider and never stored by us. Refunds are processed to the
        original payment method and may take 5–10 business days.
      </p>
      <h2>6. Disclaimers &amp; limitation of liability</h2>
      <p>
        The Services are provided &quot;as is&quot; without warranties of any kind. To the maximum
        extent permitted by law, Invite Lime will not be liable for any indirect,
        incidental or consequential damages arising from your use of the Services.
      </p>
      <h2>7. Changes &amp; termination</h2>
      <p>
        We may update these Terms from time to time and will post the new version here.
        We may suspend accounts that violate these Terms. You may delete your account
        and data at any time through the account settings.
      </p>
      <h2>8. Governing law</h2>
      <p>These Terms are governed by the laws of India. Any disputes are subject to the courts of New Delhi.</p>
      <p>
        Questions? See <Link href="/contact" className="text-sapphire-700 underline">contact</Link>.
      </p>
    </LegalPage>
  );
}

function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="py-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <p className="font-body-xs font-semibold uppercase tracking-[0.2em] text-sapphire-600">{updated}</p>
        <h1 className="mt-3 font-heading-3xl text-ivory-950">{title}</h1>
        <div className="mt-8 space-y-5 font-body-lg leading-relaxed text-navy-800 [&>h2]:mt-8 [&>h2]:font-heading-md [&>h2]:font-semibold [&>h2]:text-ivory-950 [&>p]:text-navy-800">
          {children}
        </div>
      </div>
    </div>
  );
}