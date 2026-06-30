import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Keep the admin panel out of search engines.
export const metadata: Metadata = {
  title: 'Pixie Admin',
  robots: { index: false, follow: false },
};

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased">{children}</div>
  );
}
