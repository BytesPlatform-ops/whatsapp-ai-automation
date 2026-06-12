'use client';

import { useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

export function JsonFormatterWidget() {
  const [input, setInput] = useState('{"name":"Pixie","tools":60,"live":true,"tags":["fast","free"]}');
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const run = (mode: 'beautify' | 'minify') => {
    setOk(false);
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, mode === 'beautify' ? 2 : 0));
      setError(null);
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      setOutput('');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="json-in" className="mb-2 block text-sm font-semibold text-ink-700">JSON input</label>
        <textarea
          id="json-in"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
            setOk(false);
          }}
          rows={7}
          spellCheck={false}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 font-mono text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => run('beautify')} className="rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark">Beautify</button>
        <button type="button" onClick={() => run('minify')} className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40">Minify</button>
        {ok && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-wa-green">
            <Check className="h-4 w-4" /> Valid JSON
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="break-words font-mono">{error}</span>
        </div>
      )}

      {output && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink-700">Result</span>
            <CopyButton value={output} />
          </div>
          <pre className="max-h-80 overflow-auto rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 font-mono text-sm text-ink-900">{output}</pre>
        </div>
      )}

      {(() => {
        const cta = buildToolPrefill('json-formatter', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: Beautify indents with 2 spaces for readability; Minify strips whitespace for the smallest
        payload. If it&apos;s invalid, the error points at the first problem. Runs entirely in your browser.
      </p>
    </div>
  );
}
