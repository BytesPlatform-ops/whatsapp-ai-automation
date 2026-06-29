import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Pixie Dashboard',
  description: 'Your Pixie services command center — set up each service and track its live status.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen bg-[#02070a] text-white antialiased">{children}</body>
    </html>
  );
}
