import { WhatsAppButton } from '@/components/WhatsAppButton';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-16 text-ink-900">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-wa-teal">404</p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight">
          That page slipped away.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-500">
          The link you followed no longer exists. Head back home, or skip the hunt and ask
          our WhatsApp bot directly.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-full border border-ink-100 px-6 text-base font-semibold text-ink-900 transition hover:border-wa-green/40"
          >
            Back to home
          </a>
          <WhatsAppButton size="md" label="Chat on WhatsApp" prefill="Hi! I landed on a 404 page." />
        </div>
      </div>
    </main>
  );
}
