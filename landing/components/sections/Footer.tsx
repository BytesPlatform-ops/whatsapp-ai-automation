import { siteConfig } from '@/lib/config';

export function Footer() {
  return (
    <footer className="border-t border-ink-100 bg-white py-10">
      <div className="container-page flex flex-col items-center justify-between gap-5 sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-wa-green text-navy-900 font-black">
            B
          </span>
          <span className="font-display font-bold text-ink-900">{siteConfig.brand}</span>
        </div>
        <p className="text-sm text-ink-400">
          © {new Date().getFullYear()} {siteConfig.brand}. Built with WhatsApp.
        </p>
        <div className="flex items-center gap-6 text-sm">
          <a href="mailto:{siteConfig.supportEmail}" className="text-ink-500 transition hover:text-ink-900">
            {siteConfig.supportEmail}
          </a>
          <a href="#" className="text-ink-500 transition hover:text-ink-900">
            Privacy
          </a>
          <a href="#" className="text-ink-500 transition hover:text-ink-900">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
