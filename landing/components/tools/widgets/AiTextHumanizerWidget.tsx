'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

const TONES = ['casual', 'professional', 'friendly', 'confident'];

export function AiTextHumanizerWidget() {
  const [text, setText] = useState('');
  const [tone, setTone] = useState('casual');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleHumanize = async () => {
    if (text.trim().length < 40) {
      setError('Please paste at least a few sentences to humanize.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/tools/ai-text-humanizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tone }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { humanized: string };
      setResult(data.humanized);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="humanize-input" className="mb-2 block text-sm font-semibold text-ink-700">
          Paste AI or robotic text
        </label>
        <textarea
          id="humanize-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text that sounds stiff or AI-generated…"
          rows={8}
          maxLength={4000}
          className="w-full resize-y rounded-xl border border-ink-200 bg-white px-4 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
        />
        <div className="mt-1 text-xs text-ink-400">{text.length}/4000 characters</div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-full bg-ink-100 p-1">
          {TONES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                tone === t ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleHumanize}
          disabled={loading || text.trim().length < 40}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-wa-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Humanizing
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Humanize
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
            <h3 className="text-sm font-bold text-ink-900">Humanized text</h3>
            <CopyButton value={result} size="xs" />
          </div>
          <p className="whitespace-pre-wrap text-base leading-relaxed text-ink-800">{result}</p>

          {(() => {
            const cta = buildToolPrefill('ai-text-humanizer', {});
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      )}

      <p className="text-xs text-ink-400">
        Tip: humanized rewrites keep your meaning and language while sounding more natural. Always
        review the result before you publish it.
      </p>
    </div>
  );
}
