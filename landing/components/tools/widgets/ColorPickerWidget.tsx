'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount)));
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export function ColorPickerWidget() {
  const [hex, setHex] = useState('#22c55e');

  const { rgb, hslStr, rgbStr, shades } = useMemo(() => {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    return {
      rgb: { r, g, b },
      rgbStr: `rgb(${r}, ${g}, ${b})`,
      hslStr: `hsl(${h}, ${s}%, ${l}%)`,
      shades: [-60, -30, 0, 30, 60].map((a) => shade(hex, a)),
    };
  }, [hex]);

  const rows: { label: string; value: string }[] = [
    { label: 'HEX', value: hex.toUpperCase() },
    { label: 'RGB', value: rgbStr },
    { label: 'HSL', value: hslStr },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <input
          type="color"
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          aria-label="Pick a color"
          className="h-20 w-24 cursor-pointer rounded-xl border border-ink-200 bg-white p-1"
        />
        <div className="flex-1">
          <label htmlFor="cp-hex" className="mb-2 block text-sm font-semibold text-ink-700">HEX value</label>
          <input
            id="cp-hex"
            value={hex}
            onChange={(e) => {
              const v = e.target.value;
              if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setHex(v);
            }}
            className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 font-mono text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
            <span className="w-12 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{r.label}</span>
            <span className="min-w-0 flex-1 break-all font-mono text-sm text-ink-900">{r.value}</span>
            <CopyButton value={r.value} size="xs" className="shrink-0" />
          </div>
        ))}
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold text-ink-700">Shades &amp; tints</span>
        <div className="flex overflow-hidden rounded-xl ring-1 ring-ink-200">
          {shades.map((s, i) => (
            <button
              key={`${s}-${i}`}
              type="button"
              onClick={() => setHex(s)}
              title={s.toUpperCase()}
              className="h-14 flex-1 transition hover:opacity-90"
              style={{ backgroundColor: s }}
            >
              <span className="sr-only">{s}</span>
            </button>
          ))}
        </div>
      </div>

      {(() => {
        const cta = buildToolPrefill('color-picker', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: tap a shade to make it the active color, then copy the HEX, RGB, or HSL value for your
        CSS, design tool, or brand palette.
      </p>
    </div>
  );
}
