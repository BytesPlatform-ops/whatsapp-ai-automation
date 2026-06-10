'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type StyleId = 'blaze' | 'ember' | 'inferno';

const STYLES: { id: StyleId; label: string; stops: [number, string][]; glow: string }[] = [
  { id: 'blaze', label: 'Blaze', stops: [[0, '#ffe259'], [0.5, '#ff8008'], [1, '#d32f2f']], glow: 'rgba(255,120,0,0.55)' },
  { id: 'ember', label: 'Ember', stops: [[0, '#ffb347'], [0.6, '#e0500b'], [1, '#7a1500']], glow: 'rgba(224,80,11,0.5)' },
  { id: 'inferno', label: 'Inferno', stops: [[0, '#ffffff'], [0.35, '#ffd000'], [0.7, '#ff5a00'], [1, '#b71c1c']], glow: 'rgba(255,90,0,0.7)' },
];

const FONT = '900 130px Arial, "Helvetica Neue", Helvetica, sans-serif';
const PAD = 64;

function draw(canvas: HTMLCanvasElement, text: string, styleId: StyleId) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];

  ctx.font = FONT;
  const safe = text || ' ';
  const w = Math.max(1, Math.ceil(ctx.measureText(safe).width)) + PAD * 2;
  const h = 130 + PAD * 2;

  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = `${w}px`;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = w / 2;
  const cy = h / 2;

  const grad = ctx.createLinearGradient(0, cy - 75, 0, cy + 75);
  style.stops.forEach(([at, color]) => grad.addColorStop(at, color));

  // Glow pass, then crisp fill.
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = 30;
  ctx.fillStyle = grad;
  ctx.fillText(safe, cx, cy);
  ctx.shadowBlur = 12;
  ctx.fillText(safe, cx, cy);
  ctx.shadowBlur = 0;
}

export function FireTextWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState('FIRE');
  const [style, setStyle] = useState<StyleId>('blaze');

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, text, style);
  }, [text, style]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${(text || 'fire-text').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="fire-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <input
          id="fire-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a word or short phrase…"
          maxLength={24}
          className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-semibold text-ink-700">Flame style</span>
        <div className="flex flex-wrap gap-2">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              aria-pressed={style === s.id}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                style === s.id ? 'border-wa-green bg-wa-green/10 text-ink-900' : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Preview</span>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg bg-wa-green px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-wa-greenDark"
          >
            <Download className="h-3.5 w-3.5" />
            Download PNG
          </button>
        </div>
        <div className="flex min-h-[8rem] items-center justify-center overflow-x-auto rounded-xl border border-ink-200 bg-ink-900 p-4">
          <canvas ref={canvasRef} aria-label={`Fire text: ${text}`} />
        </div>
      </div>

      {text && (() => {
        const cta = buildToolPrefill('fire-text-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: exports as a transparent PNG, so it drops cleanly onto a dark thumbnail, banner, or
        logo. Everything renders in your browser — your text never leaves your device.
      </p>
    </div>
  );
}
