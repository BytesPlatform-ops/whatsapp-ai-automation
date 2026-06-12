'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

const WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et ' +
  'dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea ' +
  'commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur ' +
  'excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'
).split(' ');

type Unit = 'paragraphs' | 'sentences' | 'words';

function rand(max: number) {
  return Math.floor(Math.random() * max);
}
function sentence() {
  const len = 6 + rand(10);
  const words = Array.from({ length: len }, () => WORDS[rand(WORDS.length)]);
  const s = words.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
function paragraph() {
  const n = 3 + rand(4);
  return Array.from({ length: n }, sentence).join(' ');
}

function generate(unit: Unit, count: number, startLorem: boolean): string {
  if (unit === 'words') {
    const words = Array.from({ length: count }, () => WORDS[rand(WORDS.length)]);
    if (startLorem) words.splice(0, Math.min(2, words.length), 'Lorem', 'ipsum');
    const s = words.join(' ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }
  if (unit === 'sentences') {
    const arr = Array.from({ length: count }, sentence);
    if (startLorem && arr.length) arr[0] = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
    return arr.join(' ');
  }
  const arr = Array.from({ length: count }, paragraph);
  if (startLorem && arr.length) arr[0] = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ' + arr[0];
  return arr.join('\n\n');
}

export function LoremIpsumWidget() {
  const [unit, setUnit] = useState<Unit>('paragraphs');
  const [count, setCount] = useState(3);
  const [startLorem, setStartLorem] = useState(true);
  const [text, setText] = useState('');

  const roll = useCallback(() => setText(generate(unit, count, startLorem)), [unit, count, startLorem]);
  useEffect(() => {
    roll();
  }, [roll]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="mb-2 block text-sm font-semibold text-ink-700">Generate</span>
          <div className="inline-flex rounded-full bg-ink-100 p-1">
            {(['paragraphs', 'sentences', 'words'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition ${
                  unit === u ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="lorem-count" className="mb-2 block text-sm font-semibold text-ink-700">How many</label>
          <input id="lorem-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value))))} className="w-24 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20" />
        </div>
        <label className="inline-flex items-center gap-2 pb-2.5 text-sm text-ink-700">
          <input type="checkbox" checked={startLorem} onChange={(e) => setStartLorem(e.target.checked)} className="accent-wa-green" />
          Start with &ldquo;Lorem ipsum&rdquo;
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-700">Output</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={roll} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-wa-green/40">
              <RefreshCw className="h-3.5 w-3.5" /> Regenerate
            </button>
            <CopyButton value={text} />
          </div>
        </div>
        <div className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-800">
          {text}
        </div>
      </div>

      {(() => {
        const cta = buildToolPrefill('lorem-ipsum-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: lorem ipsum is scrambled Latin used as placeholder text so you can design a layout before
        the real copy is ready. Paste it into mockups, templates, and wireframes.
      </p>
    </div>
  );
}
