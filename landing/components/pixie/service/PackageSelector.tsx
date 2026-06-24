'use client';

import { Check } from 'lucide-react';

/**
 * PackageSelector — the single main setup package, shown pre-selected (this is
 * a low-friction "start with this" flow, not a multi-tier pricing table). The
 * accent border + check signals it's already part of the request.
 */
export function PackageSelector({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border p-6 sm:p-7"
      style={{
        borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, transparent), rgba(255,255,255,0.02))',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: 'var(--accent)', color: '#06110c' }}
          >
            Your setup
          </span>
          <h3 className="mt-3 font-display text-2xl font-extrabold tracking-tight text-white">{name}</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/65">{description}</p>
        </div>
        <span
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full"
          style={{ background: 'var(--accent)' }}
        >
          <Check className="h-5 w-5" style={{ color: '#06110c' }} strokeWidth={3} />
        </span>
      </div>
    </div>
  );
}
