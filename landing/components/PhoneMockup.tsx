import { ReactNode } from 'react';

type PhoneSize = 'sm' | 'md' | 'lg';

interface PhoneMockupProps {
  children: ReactNode;
  contactName?: string;
  contactSub?: string;
  className?: string;
  size?: PhoneSize;
}

const sizeMap: Record<PhoneSize, string> = {
  sm: 'w-[230px] sm:w-[250px]',
  md: 'w-[280px] sm:w-[300px]',
  lg: 'w-[320px] sm:w-[360px]',
};

export function PhoneMockup({
  children,
  contactName = 'BytesPlatform AI',
  contactSub = 'online',
  className = '',
  size = 'lg',
}: PhoneMockupProps) {
  return (
    <div className={`relative mx-auto ${sizeMap[size]} ${className}`}>
      {/* Phone frame */}
      <div className="relative aspect-[10/19] rounded-[44px] bg-[#0A1628] p-[10px] shadow-phone">
        {/* Side buttons */}
        <span className="absolute -left-[3px] top-28 h-14 w-[3px] rounded-l bg-ink-700" />
        <span className="absolute -left-[3px] top-48 h-20 w-[3px] rounded-l bg-ink-700" />
        <span className="absolute -right-[3px] top-36 h-24 w-[3px] rounded-r bg-ink-700" />

        {/* Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[36px] bg-[#ECE5DD]">
          {/* Notch */}
          <div className="absolute left-1/2 top-1.5 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-[#0A1628]" />

          {/* WhatsApp header */}
          <div className="relative z-10 flex items-center gap-3 bg-[#075E54] px-3 pb-2.5 pt-9 text-white">
            <svg className="h-5 w-5 opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-wa-green to-wa-teal text-xs font-bold">
                AI
              </div>
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-wa-green ring-2 ring-[#075E54]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[14px] font-semibold leading-tight">{contactName}</p>
              <p className="truncate text-[11px] text-white/70">{contactSub}</p>
            </div>
            <div className="flex items-center gap-4 text-white/80">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M15 10.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3.5l4 4v-11l-4 4z" />
              </svg>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.36 11.36 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.36 11.36 0 0 0 .57 3.57 1 1 0 0 1-.25 1.02l-2.2 2.2z" />
              </svg>
            </div>
          </div>

          {/* Chat background (WhatsApp doodle pattern approximation) */}
          <div
            className="absolute inset-x-0 bottom-0 top-[60px] opacity-[0.08]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, #075E54 1px, transparent 1px), radial-gradient(circle at 70% 40%, #128C7E 1px, transparent 1px), radial-gradient(circle at 40% 80%, #25D366 1px, transparent 1px)',
              backgroundSize: '60px 60px, 80px 80px, 70px 70px',
            }}
          />

          {/* Chat body */}
          <div className="relative z-10 h-[calc(100%-60px-48px)] overflow-hidden px-3 py-3">
            {children}
          </div>

          {/* Input bar */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-[#F0F0F0] px-2 py-2">
            <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2">
              <svg className="h-4 w-4 text-ink-300" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 7.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 17.5c-2.3 0-4.3-1.3-5.2-3.2l1.3-.8A4.4 4.4 0 0 0 12 16c1.8 0 3.4-1 4-2.5l1.3.8c-.9 1.9-2.9 3.2-5.3 3.2z" /></svg>
              <span className="flex-1 text-[13px] text-ink-300">Message</span>
              <svg className="h-4 w-4 text-ink-300" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v2H4zM4 8h16v2H4zM4 12h10v2H4z" /></svg>
            </div>
            <button className="flex h-9 w-9 items-center justify-center rounded-full bg-wa-teal text-white" aria-label="send">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5a3 3 0 0 0-6 0v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.4 2.72 6.2 6 6.72V21h2v-3.28c3.28-.51 6-3.31 6-6.72h-1.7z" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
