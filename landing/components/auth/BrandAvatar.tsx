'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';

/**
 * Premium brand tile for the auth shell — the normal Pixie mascot centered in a
 * dark glass tile with a thin border, inner highlight, and a soft emerald/cyan
 * glow. Reads as a designed SaaS brand mark rather than a pasted image. Falls
 * back to a Sparkles glyph if the mascot image fails to load.
 */
export function BrandAvatar({ size = 64 }: { size?: number }) {
  const [ok, setOk] = useState(true);
  return (
    <span className="relative flex-none" style={{ height: size, width: size }}>
      {/* soft glow behind the tile */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-2 rounded-[1.4rem] bg-gradient-to-br from-[#25D366]/35 to-[#22d3ee]/25 blur-xl"
      />
      {/* glass tile */}
      <span
        className="relative grid h-full w-full place-items-center overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-br from-white/[0.09] to-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_30px_-10px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-[#25D366]/15"
      >
        {ok ? (
          <Image
            src="/images/pixie/forms/normal.png"
            alt="Pixie"
            width={size}
            height={size}
            className="h-full w-full scale-110 object-contain p-1 drop-shadow-[0_2px_10px_rgba(34,197,94,0.35)]"
            onError={() => setOk(false)}
            priority
          />
        ) : (
          <Sparkles size={Math.round(size * 0.42)} strokeWidth={2.5} className="text-[#25D366]" />
        )}
      </span>
    </span>
  );
}
