import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Thank You — Pixie',
  alternates: { canonical: 'https://pixiebot.co/thank-you' },
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
