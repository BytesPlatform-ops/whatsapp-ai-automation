'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

type Length = 'short' | 'medium' | 'long';

interface Result {
  summary: string;
  keyPoints: string[];
}

export function TextSummarizerWidget() {
  const [text, setText] = useState('');
  const [length, setLength] = useState<Length>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const handleSummarize = async () => {
    if (text.trim().length < 40) {
      setError('Please paste at least a few sentences to summarize.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/tools/text-summarizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, length }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as Result;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="summarize-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Paste your text
        </label>
        <textarea
          id="summarize-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste an article, essay, email, or any long text…"
          rows={8}
          maxLength={6000}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
        <div className="mt-1 text-xs text-ink-400">{text.length}/6000 characters</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-ink-100 p-1">
          {(['short', 'medium', 'long'] as Length[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLength(l)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                length === l ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSummarize}
          disabled={loading || text.trim().length < 40}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-wa-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Summarizing
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Summarize
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 p-6 ring-1 ring-wa-green/15">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Summary</h3>
            <CopyButton value={result.summary} size="xs" />
          </div>
          <p className="text-base leading-relaxed text-ink-800">{result.summary}</p>

          {result.keyPoints.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-2 text-sm font-bold text-ink-900">Key points</h4>
              <ul className="space-y-1.5">
                {result.keyPoints.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-ink-700">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-wa-green" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(() => {
            const cta = buildToolPrefill('text-summarizer', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: works on articles, research, meeting notes, and emails. Summaries stick to what your
        text actually says — no invented facts.
      </p>
    </div>
  );
}
