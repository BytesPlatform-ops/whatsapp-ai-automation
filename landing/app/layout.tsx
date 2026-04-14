import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://bytesplatform.com'),
  title: 'BytesPlatform — Your website, built by a WhatsApp chat',
  description:
    'Text our WhatsApp bot. Get a live website, AI-generated ads, or a free SEO audit in under 3 minutes. No coding, no designer, no meetings.',
  keywords: [
    'WhatsApp bot',
    'AI website builder',
    'marketing ads',
    'SEO audit',
    'WhatsApp automation',
    'BytesPlatform',
  ],
  openGraph: {
    title: 'Your website, built by a WhatsApp chat',
    description:
      'Text our AI bot on WhatsApp and get a live website in 3 minutes. No signup, no code.',
    type: 'website',
    siteName: 'BytesPlatform',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Your website, built by a WhatsApp chat',
    description: 'Text our AI bot on WhatsApp and get a live website in 3 minutes.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-white text-ink-900 antialiased">{children}</body>
    </html>
  );
}
