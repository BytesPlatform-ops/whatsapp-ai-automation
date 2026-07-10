import type { Metadata } from 'next';
import { Navigation } from '@/components/sections/Navigation';
import { Footer } from '@/components/sections/Footer';
import { siteConfig } from '@/lib/config';

// Public Data Deletion instructions at /data-deletion — the URL Meta App
// Review requires for the "Data Deletion Instructions" field. Tells users
// exactly how to have their data erased. Body copy is a template, not legal
// advice — have counsel review before relying on it.

export const metadata: Metadata = {
  title: 'Data Deletion | Pixie',
  description:
    'Instructions for requesting deletion of Pixie Meta-connected data.',
  alternates: { canonical: `https://${siteConfig.domain}/data-deletion` },
  robots: { index: true, follow: true },
};

const LAST_UPDATED = '2026-07-11';
const COMPANY_LEGAL_NAME = 'BytesPlatform';
const CONTACT_EMAIL = siteConfig.supportEmail;

export default function DataDeletionPage() {
  return (
    <>
      <Navigation />
      <section className="relative bg-navy-900 pb-12 pt-32 text-white sm:pb-14 sm:pt-36">
        <div className="container-page max-w-3xl">
          <h1 className="text-display-lg font-display">Data Deletion Instructions</h1>
          <p className="mt-3 text-sm text-white/60">
            Last updated: {LAST_UPDATED} &middot; Operated by {COMPANY_LEGAL_NAME}
          </p>
        </div>
      </section>
      <main className="bg-white pb-24 pt-12 sm:pt-16">
        <article className="container-page max-w-3xl">

          <div className="mb-10 rounded-xl border-l-4 border-wa-green bg-ink-50 p-5 text-sm text-ink-700">
            <strong className="text-ink-900">Short version:</strong> message us the word{' '}
            <strong className="text-ink-900">DELETE</strong> on the same channel you used, or email{' '}
            <a className="font-medium text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . We erase your data within 30 days and confirm when it's done.
          </div>

          <Section title="1. What this covers">
            <p>
              This page explains how to have {COMPANY_LEGAL_NAME} ("we", "us") delete the personal
              data we hold about you from using Pixie via WhatsApp, Messenger, or Instagram — your
              messages, the business details you shared, and any generated assets, subject to the
              legal-retention exception below.
            </p>
          </Section>

          <Section title="2. How to request deletion">
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>By message (fastest):</strong> send the word{' '}
                <strong className="text-ink-900">DELETE</strong> to us on the same WhatsApp,
                Messenger, or Instagram account you originally messaged, so we can verify it's you.
              </li>
              <li>
                <strong>By email:</strong> write to{' '}
                <a className="text-wa-teal hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
                  {CONTACT_EMAIL}
                </a>{' '}
                from the address on file, or include the phone number / handle you used, so we can
                locate your records.
              </li>
            </ul>
          </Section>

          <Section title="3. What we delete">
            <ul className="list-disc space-y-2 pl-6">
              <li>Your conversation history and message content.</li>
              <li>The business details you shared with the bot.</li>
              <li>
                Generated assets tied to your account (website previews, chatbot configs, drafts),
                unless you ask us to keep a paid, live deliverable.
              </li>
            </ul>
          </Section>

          <Section title="4. What we may keep">
            <p>
              We retain the minimum records we are legally required to keep — chiefly{' '}
              <strong>payment and invoice records</strong>, which accounting and tax law require us
              to hold for up to 7 years. These are kept only for that purpose and are not used for
              anything else. See our{' '}
              <a className="text-wa-teal hover:underline" href="/privacy-policy">
                Privacy Policy
              </a>{' '}
              for full detail.
            </p>
          </Section>

          <Section title="5. How long it takes">
            <p>
              We action deletion requests within <strong>30 days</strong> of verifying your
              identity, and we'll confirm on the channel you contacted us from once it's complete.
            </p>
          </Section>

          <Section title="6. Deleting via Facebook / Instagram Login">
            <p>
              If you connected to Pixie using Facebook or Instagram Login, you can also remove Pixie
              from your Meta account settings ("Apps and Websites"), and separately send us a
              deletion request as above so we erase data held on our side.
            </p>
          </Section>

          <hr className="my-10 border-ink-100" />

          <footer className="text-sm text-ink-400">
            Need help? Email{' '}
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
