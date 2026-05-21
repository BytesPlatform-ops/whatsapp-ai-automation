'use client';

import { useRef, useState } from 'react';
import { Sparkles, Download, Copy, Check, Loader2, Palette } from 'lucide-react';

type Shape = 'circle' | 'shield' | 'ribbon';

const PRESETS: { hex: string; label: string }[] = [
  { hex: '#25D366', label: 'Green' },
  { hex: '#0A1628', label: 'Navy' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#DC2626', label: 'Red' },
  { hex: '#111827', label: 'Mono' },
  { hex: '#8B5CF6', label: 'Purple' },
  { hex: '#0EA5E9', label: 'Sky' },
  { hex: '#EC4899', label: 'Pink' },
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeHex(input: string): string {
  let h = input.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#25D366';
  return `#${h.toLowerCase()}`;
}

function darkenHex(hex: string, amount = 0.18): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = clamp(((num >> 16) & 0xff) - Math.round(255 * amount), 0, 255);
  const g = clamp(((num >> 8) & 0xff) - Math.round(255 * amount), 0, 255);
  const b = clamp((num & 0xff) - Math.round(255 * amount), 0, 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function readableTextColor(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  // Perceived luminance (Rec. 601).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1F2937' : '#FFFFFF';
}

function buildBadgeSvg(text: string, shape: Shape, primary: string): string {
  const secondary = darkenHex(primary, 0.18);
  const textColor = readableTextColor(primary);
  const safeText = text.slice(0, 30);
  const words = safeText.split(/\s+/);

  let lines: string[];
  if (words.length <= 2) {
    lines = [safeText];
  } else if (words.length === 3) {
    lines = [words[0], `${words[1]} ${words[2]}`];
  } else if (words.length === 4) {
    lines = [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`];
  } else {
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }

  const fontSize = lines.some((l) => l.length > 14) ? 13 : 16;
  const yOffset = lines.length === 1 ? 105 : 95;
  const lineSpacing = 20;

  let shapeMarkup: string;
  if (shape === 'circle') {
    shapeMarkup = `
      <circle cx="100" cy="100" r="92" fill="${primary}" />
      <circle cx="100" cy="100" r="92" fill="none" stroke="${secondary}" stroke-width="4" />
      <circle cx="100" cy="100" r="80" fill="none" stroke="${textColor}" stroke-width="1" opacity="0.4" />
    `;
  } else if (shape === 'shield') {
    shapeMarkup = `
      <path d="M100 10 L180 35 L180 110 Q180 165 100 190 Q20 165 20 110 L20 35 Z"
            fill="${primary}" stroke="${secondary}" stroke-width="4" />
    `;
  } else {
    // Ribbon banner: notched tails behind a main center banner with fold triangles for depth.
    shapeMarkup = `
      <!-- Left notched tail -->
      <polygon points="40,75 5,75 22,107 5,140 40,140" fill="${secondary}" />
      <!-- Right notched tail -->
      <polygon points="160,75 195,75 178,107 195,140 160,140" fill="${secondary}" />
      <!-- Main banner body -->
      <rect x="32" y="62" width="136" height="86" fill="${primary}" />
      <!-- Inner highlight line -->
      <rect x="32" y="62" width="136" height="86" fill="none" stroke="${textColor}" stroke-width="1" opacity="0.2" />
      <!-- Fold triangles (darker) to suggest the ribbon wrapping behind -->
      <polygon points="32,148 32,140 40,148" fill="${darkenHex(secondary, 0.1)}" />
      <polygon points="168,148 168,140 160,148" fill="${darkenHex(secondary, 0.1)}" />
    `;
  }

  const textBlock = lines
    .map(
      (line, i) =>
        `<text x="100" y="${yOffset + i * lineSpacing}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fontSize}" font-weight="800" fill="${textColor}" letter-spacing="0.5">${escapeXml(line.toUpperCase())}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">${shapeMarkup}${textBlock}</svg>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function downloadFile(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function svgToPng(svg: string, size = 600): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Canvas context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG'));
    };
    img.src = url;
  });
}

export function TrustBadgeWidget() {
  const [text, setText] = useState('30-DAY MONEY BACK');
  const [shape, setShape] = useState<Shape>('circle');
  const [color, setColor] = useState<string>('#25D366');
  const [hexInput, setHexInput] = useState<string>('#25D366');

  const [aiPrompt, setAiPrompt] = useState('30 day money back guarantee');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiVariants, setAiVariants] = useState<string[]>([]);

  const [copied, setCopied] = useState(false);
  const svgPreviewRef = useRef<HTMLDivElement>(null);

  const svg = buildBadgeSvg(text, shape, color);
  const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  const handleColorPick = (hex: string) => {
    const normalized = normalizeHex(hex);
    setColor(normalized);
    setHexInput(normalized);
  };

  const handleHexInputChange = (raw: string) => {
    setHexInput(raw);
    if (/^#?[0-9a-fA-F]{6}$/.test(raw.trim()) || /^#?[0-9a-fA-F]{3}$/.test(raw.trim())) {
      setColor(normalizeHex(raw));
    }
  };

  const handleAiSuggest = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiVariants([]);
    try {
      const res = await fetch('/api/tools/trust-badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promise: aiPrompt }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { variants: string[] };
      setAiVariants(data.variants);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadSvg = () => {
    downloadFile(`trust-badge-${shape}.svg`, svgDataUrl);
  };

  const handleDownloadPng = async () => {
    try {
      const pngUrl = await svgToPng(svg, 600);
      downloadFile(`trust-badge-${shape}.png`, pngUrl);
    } catch {
      // ignore
    }
  };

  const handleCopySvg = async () => {
    try {
      await navigator.clipboard.writeText(svg);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-8">
      {/* Step 1: Badge text */}
      <div>
        <label htmlFor="badge-text" className="mb-2 block text-sm font-semibold text-ink-700">
          Badge text
        </label>
        <input
          id="badge-text"
          value={text}
          onChange={(e) => setText(e.target.value.toUpperCase())}
          maxLength={30}
          className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
        <div className="mt-1 text-xs text-ink-400">{text.length}/30 characters</div>
      </div>

      {/* Shape */}
      <div>
        <div className="mb-2 text-sm font-semibold text-ink-700">Shape</div>
        <div className="inline-flex rounded-full bg-ink-100 p-1">
          {(['circle', 'shield', 'ribbon'] as Shape[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setShape(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                shape === s ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink-700">Color</div>
          <div className="text-xs text-ink-400">Pick a preset or any custom color</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset swatches */}
          {PRESETS.map((p) => (
            <button
              key={p.hex}
              type="button"
              onClick={() => handleColorPick(p.hex)}
              aria-label={p.label}
              className={`h-9 w-9 rounded-full border-2 transition ${
                color === p.hex ? 'border-ink-900 scale-110' : 'border-ink-200 hover:border-ink-400'
              }`}
              style={{ backgroundColor: p.hex }}
            />
          ))}

          {/* Visual divider */}
          <span aria-hidden className="mx-1 h-8 w-px bg-ink-200" />

          {/* Native color picker — opens OS color dialog */}
          <label
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border-2 border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 transition hover:border-ink-400"
            title="Open color picker"
          >
            <Palette className="h-3.5 w-3.5" />
            Custom
            <input
              type="color"
              value={color}
              onChange={(e) => handleColorPick(e.target.value)}
              className="h-0 w-0 opacity-0"
              aria-label="Custom color picker"
            />
          </label>

          {/* Hex input */}
          <div className="flex h-9 items-center overflow-hidden rounded-full border-2 border-ink-200 bg-white">
            <span className="px-2.5 text-xs font-semibold text-ink-400">HEX</span>
            <input
              type="text"
              value={hexInput}
              onChange={(e) => handleHexInputChange(e.target.value)}
              onBlur={() => setHexInput(color)}
              maxLength={7}
              spellCheck={false}
              className="h-full w-24 bg-transparent pr-3 font-mono text-xs uppercase text-ink-900 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Preview + downloads */}
      <div className="rounded-2xl bg-gradient-to-br from-ink-50 via-white to-ink-50 p-6 ring-1 ring-ink-100">
        <div className="flex flex-col items-center gap-5">
          <div
            ref={svgPreviewRef}
            className="rounded-xl bg-white p-4 shadow-soft"
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center gap-1.5 rounded-lg bg-wa-green px-4 py-2 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
            >
              <Download className="h-4 w-4" />
              PNG
            </button>
            <button
              type="button"
              onClick={handleDownloadSvg}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 hover:text-ink-900"
            >
              <Download className="h-4 w-4" />
              SVG
            </button>
            <button
              type="button"
              onClick={handleCopySvg}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 hover:text-ink-900"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy SVG'}
            </button>
          </div>
        </div>
      </div>

      {/* AI suggestion */}
      <div className="rounded-2xl border border-wa-green/20 bg-wa-bubble/30 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-wa-teal" />
          <h3 className="text-sm font-bold text-ink-900">AI copy suggestions</h3>
        </div>
        <p className="mb-3 text-sm text-ink-500">
          Describe your guarantee and AI will suggest 4 conversion-focused badge text variants.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="e.g. 30 day money back guarantee"
            maxLength={200}
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <button
            type="button"
            onClick={handleAiSuggest}
            disabled={aiLoading || !aiPrompt.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-wa-teal px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Suggest
              </>
            )}
          </button>
        </div>

        {aiError && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {aiError}
          </div>
        )}

        {aiVariants.length > 0 && (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {aiVariants.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setText(v.toUpperCase().slice(0, 30))}
                className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-left text-sm font-semibold text-ink-900 transition hover:border-wa-green/50 hover:bg-wa-bubble/50"
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
