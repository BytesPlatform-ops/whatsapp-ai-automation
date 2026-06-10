'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type StyleId = 'neon' | 'gradient' | 'outline' | 'shadow3d' | 'fire' | 'chrome';

const STYLES: { id: StyleId; label: string }[] = [
  { id: 'neon', label: 'Neon glow' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'fire', label: 'Fire' },
  { id: 'chrome', label: 'Chrome' },
  { id: 'shadow3d', label: '3D' },
  { id: 'outline', label: 'Outline' },
];

const FONT_STACK = '900 130px Arial, "Helvetica Neue", Helvetica, sans-serif';
const PAD = 60;

function draw(canvas: HTMLCanvasElement, text: string, style: StyleId, color: string) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Measure with the target font, then size the canvas to fit.
  ctx.font = FONT_STACK;
  const safe = text || ' ';
  const metrics = ctx.measureText(safe);
  const textW = Math.max(1, Math.ceil(metrics.width));
  const w = textW + PAD * 2;
  const h = 130 + PAD * 2;

  // Retina-crisp output.
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = '100%';
  canvas.style.maxWidth = `${w}px`;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);
  ctx.font = FONT_STACK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = w / 2;
  const cy = h / 2;

  const grad = (from: string, to: string) => {
    const g = ctx.createLinearGradient(0, cy - 70, 0, cy + 70);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };

  switch (style) {
    case 'neon': {
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = '#0b1020';
      ctx.fillText(safe, cx, cy);
      // double stroke for the glow.
      ctx.strokeText(safe, cx, cy);
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(safe, cx, cy);
      break;
    }
    case 'gradient': {
      ctx.fillStyle = grad(color, '#ffffff');
      ctx.fillText(safe, cx, cy);
      break;
    }
    case 'fire': {
      ctx.shadowColor = 'rgba(255,90,0,0.6)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = grad('#ffd000', '#e0270b');
      ctx.fillText(safe, cx, cy);
      break;
    }
    case 'chrome': {
      const g = ctx.createLinearGradient(0, cy - 70, 0, cy + 70);
      g.addColorStop(0, '#e8eef5');
      g.addColorStop(0.45, '#8a99ad');
      g.addColorStop(0.5, '#3b4655');
      g.addColorStop(0.55, '#8a99ad');
      g.addColorStop(1, '#e8eef5');
      ctx.fillStyle = g;
      ctx.fillText(safe, cx, cy);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#2b3340';
      ctx.strokeText(safe, cx, cy);
      break;
    }
    case 'shadow3d': {
      const depth = 7;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = depth; i > 0; i--) {
        ctx.fillText(safe, cx + i, cy + i);
      }
      ctx.fillStyle = color;
      ctx.fillText(safe, cx, cy);
      break;
    }
    case 'outline': {
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.strokeText(safe, cx, cy);
      break;
    }
  }
  ctx.shadowBlur = 0;
}

export function CoolTextWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState('COOL');
  const [style, setStyle] = useState<StyleId>('neon');
  const [color, setColor] = useState('#22c55e');

  useEffect(() => {
    if (canvasRef.current) draw(canvasRef.current, text, style, color);
  }, [text, style, color]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(text || 'cool-text').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="cool-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Your text
        </label>
        <input
          id="cool-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a word or short phrase…"
          maxLength={28}
          className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[200px] flex-1">
          <span className="mb-2 block text-sm font-semibold text-ink-700">Style</span>
          <div className="flex flex-wrap gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                aria-pressed={style === s.id}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  style === s.id
                    ? 'border-wa-green bg-wa-green/10 text-ink-900'
                    : 'border-ink-200 bg-white text-ink-500 hover:border-wa-green/40'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Text color"
            className="h-10 w-16 cursor-pointer rounded-lg border border-ink-200 bg-white p-1"
          />
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
        <div className="flex min-h-[8rem] items-center justify-center overflow-x-auto rounded-xl border border-ink-200 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:24px_24px] p-4">
          <canvas ref={canvasRef} aria-label={`Cool text: ${text}`} />
        </div>

        {text && (() => {
          const cta = buildToolPrefill('cool-text-generator', {});
          return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
        })()}
      </div>

      <p className="text-xs text-ink-400">
        Tip: the PNG exports with a transparent background, so you can drop it straight onto a
        thumbnail, banner, or logo mockup. Everything renders in your browser — your text never
        leaves your device.
      </p>
    </div>
  );
}
