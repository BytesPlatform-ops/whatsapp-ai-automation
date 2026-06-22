'use client';

import { type PropType } from './roleData';

/**
 * HolographicProp — a single glassy, accent-tinted prop rendered entirely
 * in CSS/SVG (no images). Each role activates 3 of these around the mascot to
 * signal a different AI capability. All visuals share one glass shell; the
 * inner `Visual` switches on `type`. Animate only transform/opacity upstream.
 */
const E = 'var(--accent)'; // adaptive role accent

export function HolographicProp({ type, label }: { type: PropType; label: string }) {
  return (
    <div className="w-[150px] select-none rounded-2xl border border-white/[0.12] bg-white/[0.055] p-3 backdrop-blur-xl shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex h-16 items-center justify-center overflow-hidden rounded-lg bg-black/20">
        <Visual type={type} />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
        <span className="truncate text-[11px] font-medium text-white/80">{label}</span>
      </div>
    </div>
  );
}

function Visual({ type }: { type: PropType }) {
  switch (type) {
    case 'waveform':
      return (
        <div className="flex h-8 items-center gap-[3px]">
          {[6, 14, 9, 20, 12, 26, 10, 18, 7, 15].map((h, i) => (
            <span
              key={i}
              className="w-[3px] rounded-full bg-[color:var(--accent)]"
              style={{ height: h, opacity: 0.55 + (i % 3) * 0.15 }}
            />
          ))}
        </div>
      );

    case 'calendar':
      return (
        <svg viewBox="0 0 64 48" className="h-11 w-14">
          <rect x="6" y="8" width="52" height="36" rx="4" fill="none" stroke={E} strokeOpacity="0.4" />
          <line x1="6" y1="18" x2="58" y2="18" stroke={E} strokeOpacity="0.4" />
          <rect x="18" y="3" width="3" height="8" rx="1.5" fill={E} />
          <rect x="43" y="3" width="3" height="8" rx="1.5" fill={E} />
          {[24, 36, 48].map((x) =>
            [24, 32, 40].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill={E} fillOpacity="0.35" />),
          )}
          <rect x="34" y="29" width="6" height="6" rx="1.5" fill={E} />
        </svg>
      );

    case 'lead':
      return (
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_15%,transparent)] text-[color:var(--accent-soft)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
            </svg>
          </span>
          <span className="space-y-1">
            <span className="block h-1.5 w-14 rounded-full bg-white/40" />
            <span className="block h-1.5 w-9 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_60%,transparent)]" />
          </span>
        </div>
      );

    case 'wireframe':
      return (
        <svg viewBox="0 0 64 44" className="h-10 w-14">
          <rect x="6" y="6" width="52" height="32" rx="3" fill="none" stroke={E} strokeOpacity="0.4" />
          <rect x="10" y="10" width="44" height="6" rx="1.5" fill={E} fillOpacity="0.3" />
          <rect x="10" y="20" width="20" height="14" rx="1.5" fill={E} fillOpacity="0.18" />
          <rect x="34" y="20" width="20" height="5" rx="1.5" fill="#fff" fillOpacity="0.18" />
          <rect x="34" y="28" width="14" height="5" rx="1.5" fill="#fff" fillOpacity="0.12" />
        </svg>
      );

    case 'mobile-preview':
      return (
        <svg viewBox="0 0 32 48" className="h-11 w-8">
          <rect x="4" y="3" width="24" height="42" rx="5" fill="none" stroke={E} strokeOpacity="0.45" />
          <rect x="8" y="9" width="16" height="3" rx="1.5" fill={E} fillOpacity="0.4" />
          <rect x="8" y="15" width="16" height="10" rx="2" fill={E} fillOpacity="0.18" />
          <rect x="8" y="28" width="11" height="3" rx="1.5" fill="#fff" fillOpacity="0.2" />
          <rect x="8" y="34" width="14" height="3" rx="1.5" fill="#fff" fillOpacity="0.14" />
        </svg>
      );

    case 'domain':
      return (
        <div className="flex items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] px-2 py-1">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[color:var(--accent-soft)]" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
          </svg>
          <span className="text-[10px] font-semibold text-[color:var(--accent-soft)]">yoursite.com</span>
        </div>
      );

    case 'post-grid':
      return (
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={i} className="h-3.5 w-3.5 rounded-[3px]" style={{ background: E, opacity: 0.2 + (i % 3) * 0.22 }} />
          ))}
        </div>
      );

    case 'caption':
      return (
        <div className="space-y-1.5">
          <span className="block h-1.5 w-20 rounded-full bg-white/40" />
          <span className="block h-1.5 w-16 rounded-full bg-white/25" />
          <span className="block h-1.5 w-12 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_60%,transparent)]" />
        </div>
      );

    case 'avatar-frame':
      return (
        <div className="relative flex h-12 w-12 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--accent)_60%,transparent)]" />
          <span className="absolute inset-0 rounded-full border-2 border-[color:color-mix(in_srgb,var(--accent)_20%,transparent)] blur-[3px]" />
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-[color:var(--accent-soft)]" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="9" r="3.5" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
          </svg>
        </div>
      );

    case 'script':
      return (
        <div className="space-y-1.5">
          {[20, 16, 18, 12].map((w, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-[color:var(--accent)]" />
              <span className="block h-1.5 rounded-full bg-white/30" style={{ width: w * 4 }} />
            </span>
          ))}
        </div>
      );

    case 'play-card':
      return (
        <div className="relative flex h-12 w-[68px] items-center justify-center rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--accent)] text-[var(--button-text)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 translate-x-[1px]" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </div>
      );

    case 'score-ring':
      return (
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: `conic-gradient(${E} 0% 86%, rgba(255,255,255,0.12) 86% 100%)` }}
          />
          <div className="absolute inset-[3px] rounded-full bg-[#08151a]" />
          <span className="relative text-[12px] font-bold text-[color:var(--accent-soft)]">86</span>
        </div>
      );

    case 'bar-chart':
      return (
        <div className="flex h-9 items-end gap-1.5">
          {[10, 22, 16, 28, 20].map((h, i) => (
            <span key={i} className="w-2 rounded-t-sm bg-[color:var(--accent)]" style={{ height: h, opacity: 0.5 + (i % 2) * 0.3 }} />
          ))}
        </div>
      );

    case 'checklist':
      return (
        <div className="space-y-1.5">
          {[14, 18, 12].map((w, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="flex h-3 w-3 items-center justify-center rounded-[3px] bg-[color:var(--accent)]">
                <svg viewBox="0 0 24 24" className="h-2 w-2 text-[var(--button-text)]" fill="none" stroke="currentColor" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="block h-1.5 rounded-full bg-white/30" style={{ width: w * 4 }} />
            </span>
          ))}
        </div>
      );

    case 'channel-nodes':
      return (
        <svg viewBox="0 0 64 44" className="h-10 w-14">
          <circle cx="32" cy="22" r="6" fill={E} fillOpacity="0.9" />
          {[[10, 10], [54, 10], [10, 34], [54, 34]].map(([x, y], i) => (
            <g key={i}>
              <line x1="32" y1="22" x2={x} y2={y} stroke={E} strokeOpacity="0.35" />
              <circle cx={x} cy={y} r="4" fill="none" stroke={E} strokeOpacity="0.7" />
            </g>
          ))}
        </svg>
      );

    case 'inbox':
      return (
        <div className="w-[88px] space-y-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: E, opacity: 0.3 + i * 0.2 }} />
              <span className="block h-1.5 flex-1 rounded-full bg-white/25" />
            </span>
          ))}
        </div>
      );

    case 'message-flow':
      return (
        <div className="space-y-1.5">
          <span className="block h-3 w-12 rounded-full rounded-bl-none bg-white/20" />
          <span className="ml-auto block h-3 w-14 rounded-full rounded-br-none bg-[color:color-mix(in_srgb,var(--accent)_50%,transparent)]" />
          <span className="block h-3 w-9 rounded-full rounded-bl-none bg-white/20" />
        </div>
      );

    default:
      return <span className="h-8 w-8 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]" />;
  }
}
