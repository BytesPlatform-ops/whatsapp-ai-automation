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
      className="relative grid flex-none place-items-center"
      style={{ height: size, width: size }}
    >
      {ok ? (
        <Image
          src="/images/pixie/forms/normal.png"
          alt="Pixie"
          width={size}
          height={size}
          className="h-full w-full object-contain drop-shadow-[0_4px_16px_rgba(34,197,94,0.35)]"
          onError={() => setOk(false)}
          priority
        />
      ) : (
        <Sparkles size={Math.round(size * 0.6)} strokeWidth={2.5} className="text-[#25D366]" />
      )}
    </span>
  );
}
