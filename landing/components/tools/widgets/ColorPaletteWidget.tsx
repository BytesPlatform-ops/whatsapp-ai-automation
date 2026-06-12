'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';
import { hexToHsl, hslToHex } from '@/lib/color';

type Scheme = 'complementary' | 'analogous' | 'triadic' | 'monochromatic' | 'tints';

const SCHEMES: { id: Scheme; label: string }[] = [
  { id: 'complementary', label: 'Complementary' },
  { id: 'analogous', label: 'Analogous' },
  { id: 'triadic', label: 'Triadic' },
  { id: 'monochromatic', label: 'Monochromatic' },
  { id: 'tints', label: 'Tints & shades' },
];

function buildPalette(base: string, scheme: Scheme): string[] {
  const { h, s, l } = hexToHsl(base);
  switch (scheme) {
    case 'complementary':
      return [base, hslToHex(h + 180, s, l)];
    case 'analogous':
      return [hslToHex(h - 30, s, l), base, hslToHex(h + 30, s, l)];
    case 'triadic':
      return [base, hslToHex(h + 120, s, l), hslToHex(h + 240, s, l)];
    case 'monochromatic':
      return [20, 35, 50, 65, 80].map((ll) => hslToHex(h, s, ll));
    case 'tints':
      return [85, 70, l, 35, 20].map((ll) => hslToHex(h, s, ll));
    default:
      return [base];
  }
}

export function ColorPaletteWidget() {
  const [base, setBase] = useState('#3b82f6');
  const [scheme, setScheme] = useState<Scheme>('analogous');
  const palette = useMemo(() => buildPalette(base, scheme), [base, scheme]);
  const allCss = palette.join(', ');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="cp-base" className="mb-2 block text-sm font-semibold text-ink-700">Base color</label>
          <div className="flex items-center gap-2">
            <input type="color" value={base} onChange={(e) => setBase(e.target.value)} aria-label="Base color" className="h-10 w-14 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
            <input
              id="cp-base"
              value={base}
              onChange={(e) => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setBase(v);
              }}
              className="w-28 rounded-xl border border-ink-200 bg-white px-3 py-2.5 font-mono text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SCHEMES.map((sc) => (
          <button
            key={sc.id}
            type="button"
            onClick={() => setScheme(sc.id)}
            aria-pressed={scheme === sc.id}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              scheme === sc.id ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
            }`}
          >
            {sc.label}
          </button>
        ))}
      </div>

      <div>
        <div className="flex overflow-hidden rounded-2xl ring-1 ring-ink-200">
          {palette.map((c, i) => (
            <button
              key={`${c}-${i}`}
              type="button"
              onClick={() => setBase(c)}
              title={`Set ${c.toUpperCase()} as base`}
              className="group relative h-32 flex-1"
              style={{ backgroundColor: c }}
            >
              <span className="absolute inset-x-0 bottom-0 bg-black/0 py-1.5 text-center font-mono text-[11px] font-semibold text-white/0 transition group-hover:bg-black/30 group-hover:text-white">
                {c.toUpperCase()}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {palette.map((c, i) => (
            <CopyButton key={`${c}-copy-${i}`} value={c.toUpperCase()} label={c.toUpperCase()} size="xs" />
          ))}
          <CopyButton value={allCss} label="Copy all" />
        </div>
      </div>

      {(() => {
        const cta = buildToolPrefill('color-palette-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: pick a base color and a harmony rule. Tap any swatch to make it the new base and explore
        from there. Analogous and monochromatic schemes are the safest for brand palettes.
      </p>
    </div>
  );
}
