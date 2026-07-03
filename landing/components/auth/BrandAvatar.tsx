'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Sparkles } from 'lucide-react';

/**
 * Brand avatar for the auth shell — the normal Pixie mascot on a soft green
 * gradient chip with glow, matching the Pixie Lab sidebar (PixieLabShell). Falls
 * back to a Sparkles glyph if the image fails to load.
 */
export function BrandAvatar({ size = 44 }: { size?: number }) {
  const [ok, setOk] = useState(true);
  return (
    <span
      className="relative grid flex-none place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#22C55E] to-[#0EA5A3] shadow-[0_10px_30px_-8px_rgba(34,197,94,0.65)] ring-1 ring-white/25"
      style={{ height: size, width: size }}
    >
      {ok ? (
        <Image
          src="/images/pixie/forms/normal.png"
          alt="Pixie"
          width={size}
          height={size}
          className="h-full w-full object-contain p-[3px] drop-shadow"
          onError={() => setOk(false)}
          priority
        />
      ) : (
        <Sparkles size={Math.round(size * 0.42)} strokeWidth={2.5} className="text-white" />
      )}
    </span>
  );
}
