'use client';

import { useMemo, useState } from 'react';

type Op = 'equal' | 'add' | 'remove';
interface DiffRow {
  op: Op;
  left?: string;
  right?: string;
}

// Longest-common-subsequence over lines → add/remove/equal rows.
function diffLines(a: string[], b: string[]): DiffRow[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ op: 'equal', left: a[i], right: b[j] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ op: 'remove', left: a[i] });
      i++;
    } else {
      rows.push({ op: 'add', right: b[j] });
      j++;
    }
  }
  while (i < n) rows.push({ op: 'remove', left: a[i++] });
  while (j < m) rows.push({ op: 'add', right: b[j++] });
  return rows;
}

export function CompareTextWidget() {
  const [left, setLeft] = useState('The quick brown fox\njumps over the lazy dog');
  const [right, setRight] = useState('The quick red fox\njumps over the lazy dog\nThe end');
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [trim, setTrim] = useState(true);

  const { rows, added, removed } = useMemo(() => {
    const norm = (s: string) => {
      let v = s;
      if (trim) v = v.replace(/[ \t]+$/gm, '').replace(/^[ \t]+/gm, '');
      return v;
    };
    const key = (s: string) => (ignoreCase ? s.toLowerCase() : s);
    const a = norm(left).split('\n');
    const b = norm(right).split('\n');
    const result = diffLines(a.map(key), b.map(key));
    // Map normalized keys back to original lines for display.
    let ai = 0;
    let bi = 0;
    const display: DiffRow[] = result.map((r) => {
      if (r.op === 'equal') return { op: r.op, left: a[ai++], right: b[bi++] };
      if (r.op === 'remove') return { op: r.op, left: a[ai++] };
      return { op: r.op, right: b[bi++] };
    });
    return {
      rows: display,
      added: display.filter((r) => r.op === 'add').length,
      removed: display.filter((r) => r.op === 'remove').length,
    };
  }, [left, right, ignoreCase, trim]);

  const identical = added === 0 && removed === 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cmp-left" className="mb-2 block text-sm font-semibold text-ink-700">
            Original text
          </label>
          <textarea
            id="cmp-left"
            value={left}
            onChange={(e) => setLeft(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 font-mono text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        <div>
          <label htmlFor="cmp-right" className="mb-2 block text-sm font-semibold text-ink-700">
            Changed text
          </label>
          <textarea
            id="cmp-right"
            value={right}
            onChange={(e) => setRight(e.target.value)}
            rows={8}
            className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 font-mono text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={ignoreCase} onChange={(e) => setIgnoreCase(e.target.checked)} className="accent-wa-green" />
          Ignore case
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} className="accent-wa-green" />
          Ignore leading/trailing spaces
        </label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs font-semibold">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-200">
            +{added} added
          </span>
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-700 ring-1 ring-red-200">
            −{removed} removed
          </span>
          {identical && (
            <span className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-600">Texts are identical</span>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-ink-200">
          {rows.map((r, idx) => (
            <div
              key={idx}
              className={`flex gap-2 px-4 py-1 font-mono text-sm ${
                r.op === 'add'
                  ? 'bg-emerald-50 text-emerald-900'
                  : r.op === 'remove'
                    ? 'bg-red-50 text-red-900'
                    : 'bg-white text-ink-700'
              }`}
            >
              <span aria-hidden className="w-4 shrink-0 select-none text-ink-400">
                {r.op === 'add' ? '+' : r.op === 'remove' ? '−' : ''}
              </span>
              <span className="whitespace-pre-wrap break-words">
                {(r.op === 'add' ? r.right : r.left) || ' '}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-ink-400">
        Tip: comparison runs entirely in your browser — nothing is uploaded. Green lines exist only
        in the changed text; red lines only in the original.
      </p>
    </div>
  );
}
