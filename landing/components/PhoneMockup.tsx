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

// iPhone 15 Pro-style mockup. Modeled in pure CSS/SVG so it renders crisply at
// every size with no image assets to host. The frame uses a layered gradient
// (titanium-ish metallic edge → dark inner) and the screen has a Dynamic
// Island instead of the dated wide notch. Adjustments here propagate to every
// usage (Hero, HowItWorks, etc.).
export function PhoneMockup({
  children,
  contactName = 'Pixie AI',
  contactSub = 'online',
  className = '',
  size = 'lg',
}: PhoneMockupProps) {
  return (
    <div className={`relative mx-auto ${sizeMap[size]} ${className}`}>
      {/* Outer titanium frame — layered gradient gives a metallic edge */}
      <div
        className="relative aspect-[10/20.5] rounded-[48px] p-[4px]"
        style={{
          background:
            'linear-gradient(155deg, #4a4a52 0%, #1f1f24 12%, #2c2c33 38%, #15151a 62%, #3a3a42 88%, #1a1a1f 100%)',
          boxShadow:
            '0 30px 60px -20px rgba(0,0,0,0.55), 0 12px 24px -8px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.06)',
        }}
      >
        {/* Inner bezel (thin black gap between frame and screen, like a real iPhone) */}
        <div
          className="relative h-full w-full rounded-[44px] p-[3px]"
          style={{
            background: 'linear-gradient(135deg, #0a0a0d 0%, #050507 50%, #0a0a0d 100%)',
          }}
        >
          {/* Side buttons — sculpted with gradients for depth */}
          {/* Action button (top-left) */}
          <span
            className="absolute -left-[5px] top-[14%] h-[4.2%] w-[5px] rounded-l-[2px]"
            style={{
              background: 'linear-gradient(90deg, #2a2a30, #15151a 55%, #0a0a0d)',
              boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.04)',
            }}
          />
          {/* Volume up */}
          <span
            className="absolute -left-[5px] top-[22%] h-[6.5%] w-[5px] rounded-l-[2px]"
            style={{
              background: 'linear-gradient(90deg, #2a2a30, #15151a 55%, #0a0a0d)',
              boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.04)',
            }}
          />
          {/* Volume down */}
          <span
            className="absolute -left-[5px] top-[30.5%] h-[6.5%] w-[5px] rounded-l-[2px]"
            style={{
              background: 'linear-gradient(90deg, #2a2a30, #15151a 55%, #0a0a0d)',
              boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.04)',
            }}
          />
          {/* Power / side button (right side) */}
          <span
            className="absolute -right-[5px] top-[24%] h-[10%] w-[5px] rounded-r-[2px]"
            style={{
              background: 'linear-gradient(270deg, #2a2a30, #15151a 55%, #0a0a0d)',
              boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.04)',
            }}
          />

          {/* Screen */}
          <div className="relative h-full w-full overflow-hidden rounded-[40px] bg-[#ECE5DD]">
            {/* Dynamic Island — modern pill shape */}
            <div
              className="absolute left-1/2 top-[10px] z-30 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-black"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.04), inset 0 0 8px rgba(255,255,255,0.02)' }}
            >
              {/* Tiny camera + sensor specks inside the island for realism */}
              <span className="absolute right-3 top-1/2 h-[7px] w-[7px] -translate-y-1/2 rounded-full bg-[#0c0c10]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 3px rgba(70,90,130,0.5)' }} />
              <span className="absolute left-4 top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-[#0b0b0e]" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)' }} />
            </div>

            {/* iOS-style status bar — time + signal/wifi/battery */}
            <div className="relative z-20 flex items-center justify-between px-7 pt-[12px] text-[11px] font-semibold text-[#075E54]">
              <span>9:41</span>
              <div className="flex items-center gap-1 opacity-80">
                {/* Signal bars */}
                <svg className="h-[10px] w-[14px]" viewBox="0 0 14 10" fill="currentColor">
                  <rect x="0" y="7" width="2" height="3" rx="0.5" />
                  <rect x="3.5" y="5" width="2" height="5" rx="0.5" />
                  <rect x="7" y="2.5" width="2" height="7.5" rx="0.5" />
                  <rect x="10.5" y="0" width="2" height="10" rx="0.5" />
                </svg>
                {/* Wifi */}
                <svg className="h-[10px] w-[12px]" viewBox="0 0 12 10" fill="currentColor">
                  <path d="M6 8.6a1.2 1.2 0 1 1 0 .01zM3 6.2 a4.4 4.4 0 0 1 6 0l-.8 1A3.2 3.2 0 0 0 3.8 7.2zm-2.4-2.4a8 8 0 0 1 10.8 0l-.9 1A6.7 6.7 0 0 0 1.5 4.8z" />
                </svg>
                {/* Battery */}
                <svg className="h-[9px] w-[18px]" viewBox="0 0 24 12" fill="none">
                  <rect x="0.5" y="0.5" width="20" height="11" rx="2.5" stroke="currentColor" strokeOpacity="0.6" />
                  <rect x="2" y="2" width="16.5" height="8" rx="1.5" fill="currentColor" />
                  <rect x="21.5" y="3.5" width="1.8" height="5" rx="0.6" fill="currentColor" opacity="0.6" />
                </svg>
              </div>
            </div>

            {/* WhatsApp header */}
            <div className="relative z-10 flex items-center gap-3 bg-[#075E54] px-3 pb-2.5 pt-3 text-white">
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
              className="absolute inset-x-0 bottom-0 top-[88px] opacity-[0.08]"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 20% 20%, #075E54 1px, transparent 1px), radial-gradient(circle at 70% 40%, #128C7E 1px, transparent 1px), radial-gradient(circle at 40% 80%, #25D366 1px, transparent 1px)',
                backgroundSize: '60px 60px, 80px 80px, 70px 70px',
              }}
            />

            {/* Chat body */}
            <div className="relative z-10 h-[calc(100%-88px-58px)] overflow-hidden px-3 py-3">
              {children}
            </div>

            {/* Input bar */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-[#F0F0F0] px-2 pb-[14px] pt-2">
              <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-2">
                <svg className="h-4 w-4 text-ink-300" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 7.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 17.5c-2.3 0-4.3-1.3-5.2-3.2l1.3-.8A4.4 4.4 0 0 0 12 16c1.8 0 3.4-1 4-2.5l1.3.8c-.9 1.9-2.9 3.2-5.3 3.2z" /></svg>
                <span className="flex-1 text-[13px] text-ink-300">Message</span>
                <svg className="h-4 w-4 text-ink-300" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v2H4zM4 8h16v2H4zM4 12h10v2H4z" /></svg>
              </div>
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-wa-teal text-white" aria-label="send">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5a3 3 0 0 0-6 0v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.4 2.72 6.2 6 6.72V21h2v-3.28c3.28-.51 6-3.31 6-6.72h-1.7z" /></svg>
              </button>
              {/* iOS home indicator at the bottom */}
              <span className="pointer-events-none absolute bottom-[5px] left-1/2 h-[4px] w-[110px] -translate-x-1/2 rounded-full bg-black/40" />
            </div>

            {/* Soft top-left highlight on the screen glass for realism */}
            <div
              className="pointer-events-none absolute inset-0 rounded-[40px]"
              style={{
                background:
                  'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 35%), linear-gradient(225deg, rgba(255,255,255,0.04) 0%, transparent 30%)',
              }}
            />
          </div>
        </div>

        {/* Subtle outer rim highlight (titanium edge) */}
        <span
          className="pointer-events-none absolute inset-0 rounded-[48px]"
          style={{
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.16) 0%, transparent 12%, transparent 88%, rgba(255,255,255,0.10) 100%)',
            mixBlendMode: 'overlay',
          }}
        />
      </div>
    </div>
  );
}
