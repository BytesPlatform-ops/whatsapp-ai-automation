'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { loadScript } from '@/lib/loadScript';

const QR_SRC = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';

export function QrCodeWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('https://pixiebot.co');
  const [size, setSize] = useState(280);
  const [dark, setDark] = useState('#0b1020');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const value = text.trim();
    const container = containerRef.current;
    if (!container) return;
    if (!value) {
      container.innerHTML = '';
      return;
    }
    (async () => {
      try {
        await loadScript(QR_SRC);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const QR = (window as any).QRCode;
        if (cancelled || !containerRef.current || !QR) return;
        containerRef.current.innerHTML = '';
        // eslint-disable-next-line no-new
        new QR(containerRef.current, {
          text: value,
          width: size,
          height: size,
          colorDark: dark,
          colorLight: '#ffffff',
          correctLevel: QR.CorrectLevel.M,
        });
        if (!cancelled) setError(null);
      } catch {
        if (!cancelled) setError('QR engine failed to load. Check your connection and retry.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [text, size, dark]);

  const handleDownload = () => {
    const container = containerRef.current;
    if (!container || !text.trim()) return;
    const canvas = container.querySelector('canvas');
    const img = container.querySelector('img');
    const url = canvas ? canvas.toDataURL('image/png') : img?.src;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qr-code.png';
    a.click();
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="qr-text" className="mb-2 block text-sm font-semibold text-ink-700">
          Text or URL
        </label>
        <textarea
          id="qr-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a link, text, Wi-Fi, phone number, anything…"
          rows={3}
          className="w-full resize-none rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[180px] flex-1">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="qr-size" className="text-sm font-semibold text-ink-700">Size</label>
            <span className="text-xs font-semibold text-ink-500">{size}px</span>
          </div>
          <input id="qr-size" type="range" min={120} max={600} step={20} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full accent-wa-green" />
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Color</span>
          <input type="color" value={dark} onChange={(e) => setDark(e.target.value)} aria-label="QR color" className="h-10 w-16 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">{error}</div>
      )}

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
        <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-ink-200 bg-white p-4">
          <div ref={containerRef} aria-label="QR code preview" />
        </div>
      </div>

      {text && (() => {
        const cta = buildToolPrefill('qr-code-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: QR codes are generated in your browser — nothing is uploaded. For print, bump the size up
        and keep good contrast so scanners read it reliably.
      </p>
    </div>
  );
}
