import type { Metadata } from 'next';
import { Navigation } from '@/components/sections/Navigation';
import { Footer } from '@/components/sections/Footer';
import { siteConfig } from '@/lib/config';

// Public Terms of Service at /terms — linked from the footer and handed to
// Meta App Review. Body copy is a sensible starting template, not legal
// advice — have counsel review before relying on it.

export const metadata: Metadata = {
  title: 'Terms of Service | Pixie',
  description:
    'Terms for using Pixie AI business assistant and marketing automation tools.',
  alternates: { canonical: `https://${siteConfig.domain}/terms` },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-07-11';
const COMPANY_LEGAL_NAME = 'BytesPlatform';
const CONTACT_EMAIL = siteConfig.supportEmail;

export default function TermsPage() {
  return (
    <>
      <Navigation />
      <section className="relative bg-navy-900 pb-12 pt-32 text-white sm:pb-14 sm:pt-36">
        <div className="container-page max-w-3xl">
          <h1 className="text-display-lg font-display">Terms of Service</h1>
          <p className="mt-3 text-sm text-white/60">
            Last updated: {LAST_UPDATED} &middot; Operated by {COMPANY_LEGAL_NAME}
          </p>
        </div>
      </section>
      <main className="bg-white pb-24 pt-12 sm:pt-16">
        <article className="container-page max-w-3xl">

          <div className="mb-10 rounded-xl border-l-4 border-wa-green bg-ink-50 p-5 text-sm text-ink-700">
            <strong className="text-ink-900">Short version:</strong> by chatting with Pixie you
            agree to these terms. We build the digital assets you ask for; you keep ownership of your
            business content; paid work is delivered per the plan you buy; and either side can stop
            using the service at any time.
          </div>

          <Section title="1. Agreement to these terms">
            <p>
              These Terms of Service ("Terms") govern your use of Pixie, a service operated by{' '}
              {COMPANY_LEGAL_NAME} ("we", "us", "our"). By messaging our WhatsApp, Messenger, or
              Instagram accounts, using our chat widgets, or purchasing a paid service, you agree to
              these Terms. If you do not agree, please do not use the service.
            </p>
          </Section>

          <Section title="2. What Pixie provides">
            <p>
              Pixie is an AI-assisted chat service that helps you create digital-agency deliverables
              — websites, logos, ads, SEO audits, chatbots, and related custom software. Some
              outputs are generated automatically; some may involve human review. We may add,
              change, or remove features over time.
            </p>
          </Section>

          <Section title="3. Eligibility">
            <p>
              You must be at least 16 years old and able to enter into a binding contract. If you use
              Pixie on behalf of a business, you represent that you are authorised to bind that
              business to these Terms.
            </p>
          </Section>

          <Section title="4. Your responsibilities">
            <ul className="list-disc space-y-2 pl-6">
              <li>Provide accurate business details and only content you have the right to use.</li>
              <li>
                Do not use Pixie for anything illegal, deceptive, infringing, or abusive, and do not
                attempt to disrupt or reverse-engineer the service.
              </li>
              <li>
                You are responsible for the content you submit and for how you use the deliverables
                we create for you.
              </li>
            </ul>
          </Section>

          <Section title="5. Payments, revisions & refunds">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Prices are shown before you buy. Payments are processed by Stripe; buying a paid
                service authorises that charge.
              </li>
              <li>
                Preview deliverables (e.g. a website preview) may carry an activation banner until
                paid. Paid plans include a limited number of revisions as described at purchase.
              </li>
              <li>
                If a payment is refunded, the associated deliverable reverts to preview status and
                any revision limits re-apply.
              </li>
            </ul>
          </Section>

          <Section title="6. Ownership & licence">
            <p>
              You retain ownership of the business content you provide. Once a deliverable is fully
              paid, you own the resulting output for your business use, except for third-party
              assets (fonts, stock imagery, libraries) which remain under their own licences. You
              grant us a licence to process your content solely to provide and improve the service.
            </p>
          </Section>

          <Section title="7. Third-party services">
            <p>
              Pixie relies on third parties including Meta, Stripe, Anthropic, OpenAI, Supabase,
              Netlify, and domain registrars. Your use of those services through Pixie is also
              subject to their terms, and we are not responsible for their acts or outages.
            </p>
          </Section>

          <Section title="8. AI-generated content">
            <p>
              Some responses and deliverables are generated by AI and may contain errors. Review any
              output before relying on it. Pixie does not provide legal, financial, or professional
              advice.
            </p>
          </Section>

          <Section title="9. Disclaimers & limitation of liability">
            <p>
              The service is provided "as is" without warranties of any kind, to the maximum extent
              permitted by law. To the extent permitted by law, our total liability for any claim
              relating to the service is limited to the amount you paid us in the 12 months before
              the claim. Nothing here limits liability that cannot be limited by law.
            </p>
          </Section>

          <Section title="10. Termination">
            <p>
              You may stop using Pixie at any time. We may suspend or end your access if you breach
              these Terms or misuse the service. On termination, the data-retention and deletion
              rules in our{' '}
              <a className="text-wa-teal hover:underline" href="/privacy-policy">
                Privacy Policy
              </a>{' '}
              apply.
            </p>
          </Section>

          <Section title="11. Changes to these terms">
            <p>
              We may update these Terms from time to time. When we make material changes we'll update
              the "last updated" date above. Continued use after a change means you accept the
              updated Terms.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions about these Terms? Email{' '}
              <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <hr className="my-10 border-ink-100" />

          <footer className="text-sm text-ink-400">
            {COMPANY_LEGAL_NAME}
          </footer>
        </article>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-ink-900">{title}</h2>
      <div className="space-y-2 text-base leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}
