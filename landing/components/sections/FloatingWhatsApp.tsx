'use client';

import { useEffect, useState } from 'react';
import { waLink } from '@/lib/config';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

export function FloatingWhatsApp() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <a
      href={waLink('Hi! Opening the chat from the floating button.')}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
      className={`fixed bottom-5 right-5 z-40 transition-all duration-300 sm:bottom-6 sm:right-6 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-8 pointer-events-none opacity-0'
      }`}
    >
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-wa-green text-white shadow-[0_12px_32px_-8px_rgba(37,211,102,0.6)] transition hover:scale-105 hover:bg-wa-greenDark sm:h-16 sm:w-16">
        <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-wa-green/40" />
        <WhatsAppIcon className="relative h-7 w-7 sm:h-8 sm:w-8" />
      </span>
      <span className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full bg-ink-900 px-3 py-1.5 text-xs font-semibold text-white shadow-card md:inline-block">
        Chat with our bot →
      </span>
    </a>
  );
}
