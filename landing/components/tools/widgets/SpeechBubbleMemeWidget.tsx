'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Tail = 'left' | 'center' | 'right';
const MAX_W = 900;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function SpeechBubbleMemeWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hasImage, setHasImage] = useState(false);
  const [text, setText] = useState('');
  const [tail, setTail] = useState<Tail>('center');
  const [sizePct, setSizePct] = useState(22);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = Math.min(1, MAX_W / img.naturalWidth);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = '100%';
    canvas.style.maxWidth = `${w}px`;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    // Bubble geometry
    const margin = Math.round(w * 0.04);
    const bx = margin;
    const by = margin;
    const bw = w - margin * 2;
    const bh = Math.max(40, Math.round(h * (sizePct / 100)));
    const tailW = Math.round(bw * 0.09);
    const tailH = Math.round(bh * 0.55);
    const tailCx =
      tail === 'left' ? bx + bw * 0.22 : tail === 'right' ? bx + bw * 0.78 : bx + bw * 0.5;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, Math.round(bh * 0.18));
    ctx.fill();

    // Tail (triangle pointing down)
    ctx.beginPath();
    ctx.moveTo(tailCx - tailW / 2, by + bh - 1);
    ctx.lineTo(tailCx + tailW / 2, by + bh - 1);
    ctx.lineTo(tailCx - tailW * 0.1, by + bh + tailH);
    ctx.closePath();
    ctx.fill();

    // Text
    if (text.trim()) {
      const fontSize = Math.max(16, Math.round(bh * 0.26));
      ctx.fillStyle = '#111111';
      ctx.font = `600 ${fontSize}px Arial, "Helvetica Neue", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapLines(ctx, text.trim(), bw * 0.86);
      const lineH = fontSize * 1.2;
      const totalH = lines.length * lineH;
      let ty = by + bh / 2 - totalH / 2 + lineH / 2;
      for (const ln of lines) {
        ctx.fillText(ln, bx + bw / 2, ty);
        ty += lineH;
      }
    }
  }, [text, tail, sizePct]);

  useEffect(() => {
    if (hasImage) render();
  }, [hasImage, render]);

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setHasImage(true);
      URL.revokeObjectURL(url);
      render();
    };
    img.src = url;
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasImage) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'speech-bubble-meme.png';
    a.click();
  };

  return (
    <div className="space-y-5">
      {!hasImage ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50 px-6 py-10 text-center"
        >
          <Upload className="mb-3 h-8 w-8 text-ink-400" />
          <p className="text-sm font-semibold text-ink-700">Drop an image here, or</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
          >
            <Upload className="h-4 w-4" />
            Choose image
          </button>
          <p className="mt-2 text-[11px] text-ink-400">A still frame works best — add the bubble, then drop it onto a GIF in your editor.</p>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="bubble-text" className="mb-2 block text-sm font-semibold text-ink-700">
              Bubble text (optional)
            </label>
            <input
              id="bubble-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Leave blank for a classic empty reaction bubble…"
              className="w-full rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="mb-2 block text-sm font-semibold text-ink-700">Tail</span>
              <div className="inline-flex rounded-full bg-ink-100 p-1">
                {(['left', 'center', 'right'] as Tail[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTail(t)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
                      tail === t ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-[160px] flex-1">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-700">Bubble size</span>
                <span className="text-xs font-semibold text-ink-500">{sizePct}%</span>
              </div>
              <input
                type="range"
                min={12}
                max={40}
                value={sizePct}
                onChange={(e) => setSizePct(Number(e.target.value))}
                className="w-full accent-wa-green"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-700">Preview</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-wa-green/40"
                >
                  Change image
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-wa-green px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-wa-greenDark"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download PNG
                </button>
              </div>
            </div>
            <div className="flex justify-center overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 p-3">
              <canvas ref={canvasRef} aria-label="Speech bubble meme preview" />
            </div>
          </div>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {hasImage && (() => {
        const cta = buildToolPrefill('speech-bubble-meme-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: the white bubble with a downward tail is the classic &ldquo;reaction&rdquo; meme overlay.
        Everything renders in your browser — your image is never uploaded.
      </p>
    </div>
  );
}
