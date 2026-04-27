import type { Metadata } from 'next';
import { Navigation } from '@/components/sections/Navigation';
import { Footer } from '@/components/sections/Footer';
import { siteConfig } from '@/lib/config';

// Privacy policy page rendered at /privacy on the marketing site.
// Linked from the WhatsApp bot's first-time greeting AND from the
// landing footer. Treat the body copy as a sensible starting template
// rather than legal advice — have counsel review before EU traffic.

export const metadata: Metadata = {
  title: `Privacy Policy — ${siteConfig.brand}`,
  description: `How ${siteConfig.brand} collects, uses, and protects your data when you message our WhatsApp bot.`,
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-04-27';
const COMPANY_LEGAL_NAME = 'BytesPlatform';
const CONTACT_EMAIL = siteConfig.supportEmail;

export default function PrivacyPage() {
  return (
    <>
      <Navigation />
      {/* Dark hero band so the (transparent-at-rest) Navigation has a
          legible backdrop. Without this the white nav text disappears
          against a flat white reading page until the user scrolls. */}
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
            <strong className="text-ink-900">Short version:</strong> we keep your WhatsApp messages,
            the business details you share, and any payment records, so we can build the website /
            chatbot / ad / report you asked us for. We don't sell your data. You can ask us to
            delete everything any time at{' '}
            <a className="font-medium text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
          </div>

          <Section title="1. Who we are">
            <p>
              This service is operated by {COMPANY_LEGAL_NAME} ("we", "us"). When you message
              our WhatsApp number or interact with one of our chat widgets, we act as the data
              controller for the personal data you share with us during that conversation.
              Contact us at{' '}
              <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              for any privacy-related question.
            </p>
          </Section>

          <Section title="2. What data we collect">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Your phone number</strong> — provided by WhatsApp / Messenger / Instagram
                when you message us.
              </li>
              <li>
                <strong>The content of your messages</strong> — text, images, voice notes
                (transcribed), location pins, and uploaded files (logos, documents).
              </li>
              <li>
                <strong>Business details you share</strong> with the bot to build a website /
                chatbot / ad / report — business name, industry, services, pricing, opening
                hours, contact details for your own customers, etc.
              </li>
              <li>
                <strong>Payment records</strong> if you activate a paid service — Stripe handles
                card data; we receive only the payment status, the email and name on the receipt,
                and the amount.
              </li>
              <li>
                <strong>Technical metadata</strong> — message timestamps, the WhatsApp business
                number you reached us on, the channel (WhatsApp / Messenger / Instagram).
              </li>
            </ul>
          </Section>

          <Section title="3. Why we use it (legal bases)">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>To deliver the service you asked for</strong> (Art. 6(1)(b) GDPR —
                performance of a contract). Generating a website needs your business name;
                sending you a payment link needs your phone number; etc.
              </li>
              <li>
                <strong>To improve the service and prevent abuse</strong> (Art. 6(1)(f) —
                legitimate interests). We log conversations so a human can step in when the bot
                gets stuck, and we use anonymised feedback signals to improve responses.
              </li>
              <li>
                <strong>To comply with legal obligations</strong> (Art. 6(1)(c)) — accounting /
                tax records for paid transactions.
              </li>
            </ul>
          </Section>

          <Section title="4. Who else sees it">
            <p>
              We use a small number of sub-processors to operate the service. None of them sell
              your data. Current list:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong>Meta Platforms</strong> — WhatsApp / Messenger / Instagram messaging
                infrastructure.
              </li>
              <li>
                <strong>Anthropic</strong> and <strong>OpenAI</strong> — to generate replies. We
                send only the conversation context needed for the current reply; no data is
                retained for training under the API terms.
              </li>
              <li>
                <strong>Supabase</strong> — primary database for conversations, payments,
                generated sites.
              </li>
              <li>
                <strong>Netlify</strong> — hosting for generated websites.
              </li>
              <li>
                <strong>Stripe</strong> — payment processing. They are an independent controller
                for card data; see{' '}
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
                <strong>Conversation history</strong> — kept while your account is active so the
                bot has context across sessions. Deleted on request, or after 24 months of
                inactivity.
              </li>
              <li>
                <strong>Generated assets</strong> (websites, chatbots, ads) — kept as long as you
                remain a paying customer. Removed within 30 days of cancellation unless you ask
                us to keep them longer.
              </li>
              <li>
                <strong>Payment records</strong> — retained for 7 years to meet accounting / tax
                obligations.
              </li>
            </ul>
          </Section>

          <Section title="6. Your rights">
            <p>
              Under GDPR (and equivalent laws in the UK, California, and other regions), you have
              the right to:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Access the personal data we hold about you.</li>
              <li>Correct anything that's wrong.</li>
              <li>
                Ask us to delete your data ("right to erasure"). We'll delete everything except
                records we're legally required to keep (e.g. payment records for accounting).
              </li>
              <li>Receive an export of your data in a portable format.</li>
              <li>Object to processing or restrict it.</li>
              <li>Withdraw any consent you previously gave.</li>
              <li>Lodge a complaint with your local data protection authority.</li>
            </ul>
            <p className="mt-4">
              To exercise any of these, email{' '}
              <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>{' '}
              from the address on file or message us from the same WhatsApp number you used to
              sign up. We respond within 30 days.
            </p>
          </Section>

          <Section title="7. International transfers">
            <p>
              Our sub-processors operate primarily from the United States. Where we transfer data
              outside the EEA / UK, we rely on the European Commission's Standard Contractual
              Clauses with each sub-processor.
            </p>
          </Section>

          <Section title="8. Cookies / tracking">
            <p>
              This privacy notice covers the WhatsApp / chat conversation. The generated websites
              we build for our customers may use minimal cookies (e.g. for the activation banner
              on a preview site); each generated site carries its own privacy disclosure where
              applicable.
            </p>
          </Section>

          <Section title="9. Children">
            <p>
              This service is not intended for users under 16. If you believe a minor has
              provided us with data, contact us and we'll delete it.
            </p>
          </Section>

          <Section title="10. Changes to this notice">
            <p>
              When we change anything material we'll update the "last updated" date at the top.
              We'll also message you on WhatsApp before the new version takes effect if the
              change affects how we use data we already hold.
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
