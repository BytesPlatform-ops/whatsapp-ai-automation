'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

const COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];
const SIZE = 300;
const TWO_PI = Math.PI * 2;

export function SpinTheWheelWidget() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [raw, setRaw] = useState('Pizza\nSushi\nBurgers\nTacos\nSalad\nRamen');
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);

  const options = raw.split('\n').map((s) => s.trim()).filter(Boolean);

  const draw = useCallback(
    (rot: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      canvas.width = SIZE * dpr;
      canvas.height = SIZE * dpr;
      canvas.style.width = `${SIZE}px`;
      canvas.style.height = `${SIZE}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);

      const cx = SIZE / 2;
      const cy = SIZE / 2;
      const r = SIZE / 2 - 6;
      const n = options.length;

      if (n === 0) {
        ctx.fillStyle = '#e5e7eb';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TWO_PI);
        ctx.fill();
        return;
      }

      const seg = TWO_PI / n;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      for (let i = 0; i < n; i++) {
        const a0 = i * seg;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, a0, a0 + seg);
        ctx.closePath();
        ctx.fillStyle = COLORS[i % COLORS.length];
        ctx.fill();
        // label
        ctx.save();
        ctx.rotate(a0 + seg / 2);
        ctx.fillStyle = '#fff';
        ctx.font = '600 13px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const label = options[i].length > 14 ? `${options[i].slice(0, 13)}…` : options[i];
        ctx.fillText(label, r - 12, 0);
        ctx.restore();
      }
      ctx.restore();

      // hub
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, TWO_PI);
      ctx.fill();
    },
    [options],
  );

  useEffect(() => {
    draw(rotationRef.current);
  }, [draw]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const winnerIndexAt = (rot: number, n: number) => {
    const seg = TWO_PI / n;
    // pointer is at the top (screen angle 3π/2); convert to wheel-space.
    const a = ((1.5 * Math.PI - rot) % TWO_PI + TWO_PI) % TWO_PI;
    return Math.floor(a / seg) % n;
  };

  const spin = () => {
    const n = options.length;
    if (spinning || n < 2) return;
    setWinner(null);
    setSpinning(true);
    const start = rotationRef.current;
    const target = start + (5 + Math.random() * 3) * TWO_PI + Math.random() * TWO_PI;
    const dur = 4500;
    let startTs: number | null = null;
    const stepFn = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = start + (target - start) * eased;
      rotationRef.current = cur;
      draw(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(stepFn);
      } else {
        rotationRef.current = target % TWO_PI;
        setSpinning(false);
        setWinner(options[winnerIndexAt(target, n)]);
      }
    };
    rafRef.current = requestAnimationFrame(stepFn);
  };

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="wheel-opts" className="mb-2 block text-sm font-semibold text-ink-700">
            Options <span className="font-normal text-ink-400">(one per line)</span>
          </label>
          <textarea
            id="wheel-opts"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setWinner(null);
            }}
            rows={8}
            className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
          <p className="mt-1 text-xs text-ink-400">{options.length} option{options.length === 1 ? '' : 's'}</p>
        </div>

        <div className="flex flex-col items-center">
          <div className="relative">
            <canvas ref={canvasRef} aria-label="Spinner wheel" />
            {/* pointer at top */}
            <div
              aria-hidden
              className="absolute left-1/2 top-[-2px] h-0 w-0 -translate-x-1/2"
              style={{ borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '18px solid #0b1020' }}
            />
          </div>
          <button
            type="button"
            onClick={spin}
            disabled={spinning || options.length < 2}
            className="mt-4 rounded-xl bg-wa-green px-6 py-3 text-sm font-semibold text-white transition hover:bg-wa-greenDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {spinning ? 'Spinning…' : 'Spin'}
          </button>
        </div>
      </div>

      {winner && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 text-center ring-1 ring-wa-green/15">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Winner</div>
          <div className="mt-1 font-display text-3xl font-bold text-ink-900">{winner}</div>
          {(() => {
            const cta = buildToolPrefill('spin-the-wheel', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: add your choices, one per line, then spin. Great for picking who goes first, what to eat,
        raffles, and classroom games. Everything runs in your browser.
      </p>
    </div>
  );
}
