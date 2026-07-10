import type { Metadata } from 'next';
import { Navigation } from '@/components/sections/Navigation';
import { Footer } from '@/components/sections/Footer';
import { siteConfig } from '@/lib/config';

// Public Privacy Policy at /privacy-policy — the canonical URL we hand to
// Meta App Review (Facebook/Instagram/WhatsApp) and link from the footer.
// The older /privacy page stays as-is; this is the review-facing version.
// Body copy is a sensible starting template, not legal advice — have counsel
// review before serving EU/UK traffic at scale.

export const metadata: Metadata = {
  title: 'Privacy Policy | Pixie',
  description:
    'Learn how Pixie collects, uses, and protects user and connected Meta data.',
  alternates: { canonical: `https://${siteConfig.domain}/privacy-policy` },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-07-11';
const COMPANY_LEGAL_NAME = 'BytesPlatform';
const CONTACT_EMAIL = siteConfig.supportEmail;

export default function PrivacyPolicyPage() {
  return (
    <>
      <Navigation />
      {/* Dark hero band so the transparent-at-rest Navigation stays legible. */}
      <section className="relative bg-navy-900 pb-12 pt-32 text-white sm:pb-14 sm:pt-36">
        <div className="container-page max-w-3xl">
          <h1 className="text-display-lg font-display">Privacy Policy</h1>
          <p className="mt-3 text-sm text-white/60">
            Last updated: {LAST_UPDATED} &middot; Operated by {COMPANY_LEGAL_NAME}
          </p>
        </div>
      </section>
      <main className="bg-white pb-24 pt-12 sm:pt-16">
        <article className="container-page max-w-3xl">

          <div className="mb-10 rounded-xl border-l-4 border-wa-green bg-ink-50 p-5 text-sm text-ink-700">
            <strong className="text-ink-900">Short version:</strong> we keep the messages you send
            us, the business details you share, and any payment records so we can build the website,
            chatbot, ad, or report you asked for. We don't sell your data. You can ask us to delete
            everything at any time — see our{' '}
            <a className="font-medium text-wa-teal hover:underline" href="/data-deletion">
              data deletion page
            </a>{' '}
            or email{' '}
            <a className="font-medium text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </div>

          <Section title="1. Who we are">
            <p>
              This service ("Pixie") is operated by {COMPANY_LEGAL_NAME} ("we", "us", "our"). When
              you message our WhatsApp, Messenger, or Instagram accounts, or use one of our chat
              widgets, we act as the data controller for the personal data you share during that
              conversation. Contact us at{' '}
              <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              for any privacy question.
            </p>
          </Section>

          <Section title="2. What data we collect">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Your phone number / social handle</strong> — provided by WhatsApp,
                Messenger, or Instagram when you message us.
              </li>
              <li>
                <strong>The content of your messages</strong> — text, images, voice notes
                (transcribed), location pins, and files you upload (logos, documents).
              </li>
              <li>
                <strong>Business details you share</strong> to build a website, chatbot, ad, or
                report — business name, industry, services, pricing, hours, and contact details.
              </li>
              <li>
                <strong>Payment records</strong> if you buy a paid service — Stripe handles card
                data; we receive only the payment status, the name and email on the receipt, and the
                amount.
              </li>
              <li>
                <strong>Technical metadata</strong> — message timestamps, the business number you
                reached us on, and the channel (WhatsApp / Messenger / Instagram).
              </li>
            </ul>
          </Section>

          <Section title="3. Why we use it (legal bases)">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>To deliver the service you asked for</strong> (Art. 6(1)(b) GDPR —
                performance of a contract).
              </li>
              <li>
                <strong>To improve the service and prevent abuse</strong> (Art. 6(1)(f) —
                legitimate interests). We log conversations so a human can step in when the bot gets
                stuck.
              </li>
              <li>
                <strong>To comply with legal obligations</strong> (Art. 6(1)(c)) — accounting and
                tax records for paid transactions.
              </li>
            </ul>
          </Section>

          <Section title="4. Who else sees it">
            <p>
              We use a small number of sub-processors to run the service. None of them sell your
              data:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong>Meta Platforms</strong> — WhatsApp / Messenger / Instagram messaging
                infrastructure.
              </li>
              <li>
                <strong>Anthropic</strong> and <strong>OpenAI</strong> — to generate replies. We
                send only the context needed for the current reply; no data is retained for training
                under the API terms.
              </li>
              <li>
                <strong>Supabase</strong> — primary database for conversations, payments, and
                generated sites.
              </li>
              <li>
                <strong>Netlify</strong> — hosting for generated websites.
              </li>
              <li>
                <strong>Stripe</strong> — payment processing (independent controller for card data);
                see{' '}
                <a
                  className="text-wa-teal hover:underline"
                  href="https://stripe.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  stripe.com/privacy
                </a>
                .
              </li>
              <li>
                <strong>SendGrid</strong> — transactional email (lead notifications, receipts).
              </li>
              <li>
                <strong>Namecheap / NameSilo</strong> — domain registration (only if you choose a
                custom domain).
              </li>
              <li>
                <strong>Render</strong> / <strong>Vercel</strong> — server hosting.
              </li>
            </ul>
          </Section>

          <Section title="5. How long we keep it">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Conversation history</strong> — kept while your account is active; deleted
                on request, or after 24 months of inactivity.
              </li>
              <li>
                <strong>Generated assets</strong> — kept while you remain a paying customer; removed
                within 30 days of cancellation unless you ask us to keep them.
              </li>
              <li>
                <strong>Payment records</strong> — retained for 7 years for accounting and tax.
              </li>
            </ul>
          </Section>

          <Section title="6. Your rights">
            <p>
              Under GDPR (and equivalent laws in the UK, California, and other regions) you can
              access, correct, export, restrict, or object to the processing of your data, withdraw
              consent, and ask us to delete your data. To exercise any of these, use our{' '}
              <a className="text-wa-teal hover:underline" href="/data-deletion">
                data deletion page
              </a>{' '}
              or email{' '}
              <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              . We respond within 30 days.
            </p>
          </Section>

          <Section title="7. International transfers">
            <p>
              Our sub-processors operate primarily from the United States. Where we transfer data
              outside the EEA / UK, we rely on the European Commission's Standard Contractual
              Clauses.
            </p>
          </Section>

          <Section title="8. Children">
            <p>
              This service is not intended for users under 16. If you believe a minor has provided
              us with data, contact us and we'll delete it.
            </p>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              When we change anything material we'll update the "last updated" date above and, where
              the change affects data we already hold, notify you before it takes effect.
            </p>
          </Section>

          <hr className="my-10 border-ink-100" />

          <footer className="text-sm text-ink-400">
            Questions:{' '}
            <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            <br />
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
