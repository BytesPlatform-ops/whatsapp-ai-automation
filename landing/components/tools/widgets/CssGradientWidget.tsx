'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

type GType = 'linear' | 'radial';

export function CssGradientWidget() {
  const [c1, setC1] = useState('#7c3aed');
  const [c2, setC2] = useState('#22c55e');
  const [angle, setAngle] = useState(135);
  const [type, setType] = useState<GType>('linear');

  const css = useMemo(
    () => (type === 'linear' ? `linear-gradient(${angle}deg, ${c1}, ${c2})` : `radial-gradient(circle, ${c1}, ${c2})`),
    [type, angle, c1, c2],
  );
  const fullCss = `background: ${css};`;

  return (
    <div className="space-y-5">
      <div
        className="flex h-44 items-center justify-center rounded-2xl ring-1 ring-ink-200"
        style={{ backgroundImage: css }}
      >
        <span className="rounded-lg bg-black/25 px-3 py-1 font-mono text-xs font-semibold text-white backdrop-blur">
          {type === 'linear' ? `${angle}°` : 'radial'}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Color 1</span>
          <input type="color" value={c1} onChange={(e) => setC1(e.target.value)} aria-label="Color 1" className="h-10 w-16 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Color 2</span>
          <input type="color" value={c2} onChange={(e) => setC2(e.target.value)} aria-label="Color 2" className="h-10 w-16 cursor-pointer rounded-lg border border-ink-200 bg-white p-1" />
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Type</span>
          <div className="inline-flex rounded-full bg-ink-100 p-1">
            {(['linear', 'radial'] as GType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
                  type === t ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {type === 'linear' && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="grad-angle" className="text-sm font-semibold text-ink-700">Angle</label>
            <span className="text-xs font-semibold text-ink-500">{angle}°</span>
          </div>
          <input id="grad-angle" type="range" min={0} max={360} value={angle} onChange={(e) => setAngle(Number(e.target.value))} className="w-full accent-wa-green" />
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">CSS</span>
          <CopyButton value={fullCss} />
        </div>
        <pre className="overflow-auto rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 font-mono text-sm text-ink-900">{fullCss}</pre>
      </div>

      {(() => {
        const cta = buildToolPrefill('css-gradient-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: paste the line straight into your CSS. Linear gradients use the angle; radial gradients
        spread from the center outward. Subtle two-color blends look the most professional.
      </p>
    </div>
  );
}
