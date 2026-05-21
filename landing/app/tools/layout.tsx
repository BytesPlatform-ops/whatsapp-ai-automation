import { Navigation } from '@/components/sections/Navigation';
import { Footer } from '@/components/sections/Footer';
import { FloatingWhatsApp } from '@/components/sections/FloatingWhatsApp';
import type { ReactNode } from 'react';

export default function ToolsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Navigation />
      <main>{children}</main>
      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
