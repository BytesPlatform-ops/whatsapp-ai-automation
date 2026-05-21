'use client';

import { useRef, useState } from 'react';
import { Sparkles, Loader2, RotateCw, Download } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

type Style = 'gothic' | 'script' | 'modern' | 'tribal';
type Mode = 'rotational' | 'chain';

interface AmbigramAnalysis {
  score: number;
  scoreLabel: 'Excellent' | 'Good' | 'Fair' | 'Difficult';
  reason: string;
  recommendedStyle: Style;
  styleReason: string;
  tips: string[];
  similarWords: string[];
}

const STYLE_CLASSES: Record<Style, string> = {
  gothic: 'font-serif font-black tracking-tighter',
  script: 'italic font-extrabold',
  modern: 'font-display font-extrabold tracking-tight',
  tribal: 'font-black uppercase tracking-widest',
};

const STYLE_LABELS: Record<Style, string> = {
  gothic: 'Gothic',
  script: 'Script',
  modern: 'Modern',
  tribal: 'Tribal',
};

function scoreColor(label: AmbigramAnalysis['scoreLabel']): string {
  if (label === 'Excellent') return 'text-wa-teal';
  if (label === 'Good') return 'text-wa-greenDark';
  if (label === 'Fair') return 'text-amber-600';
  return 'text-red-600';
}

function downloadFile(filename: string, dataUrl: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function AmbigramWidget() {
  const [mode, setMode] = useState<Mode>('rotational');
  const [word, setWord] = useState('Anna');
  const [secondWord, setSecondWord] = useState('');
  const [style, setStyle] = useState<Style>('modern');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AmbigramAnalysis | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleAnalyze = async () => {
    if (!word.trim()) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/tools/ambigram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          word: word.trim(),
          secondWord: mode === 'chain' ? secondWord.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { analysis: AmbigramAnalysis };
      setAnalysis(data.analysis);
      setStyle(data.analysis.recommendedStyle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPng = async () => {
    const node = previewRef.current;
    if (!node) return;
    // Render the preview text into an SVG, then to PNG.
    const w = 800;
    const h = 360;
    const flipped = mode === 'chain' && secondWord ? secondWord : word;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" fill="white"/>
      <text x="${w / 2}" y="${h / 2 - 30}" text-anchor="middle"
        font-family="system-ui, sans-serif" font-size="84" font-weight="900" fill="#0F172A">${escapeXml(word.toUpperCase())}</text>
      <g transform="translate(${w / 2},${h / 2 + 60}) rotate(180)">
        <text x="0" y="0" text-anchor="middle"
          font-family="system-ui, sans-serif" font-size="84" font-weight="900" fill="#0F172A" opacity="0.85">${escapeXml(flipped.toUpperCase())}</text>
      </g>
    </svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      downloadFile(`ambigram-${word.toLowerCase()}.png`, canvas.toDataURL('image/png'));
    };
    img.src = url;
  };

  const previewText = word.trim() || 'ambigram';
  const flippedText = (mode === 'chain' && secondWord.trim()) ? secondWord.trim() : previewText;

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="inline-flex rounded-full bg-ink-100 p-1">
        {(['rotational', 'chain'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              mode === m ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            {m === 'rotational' ? 'Rotational (same word)' : 'Chain (word A → word B)'}
          </button>
        ))}
      </div>

      {/* Word inputs */}
      <div className={`grid gap-4 ${mode === 'chain' ? 'sm:grid-cols-2' : ''}`}>
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink-700">
            {mode === 'chain' ? 'Word A (reads upright)' : 'Your word'}
          </label>
          <input
            value={word}
            onChange={(e) => setWord(e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
            maxLength={20}
            placeholder="e.g. Anna, peace, infinity"
            className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
          />
        </div>
        {mode === 'chain' && (
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-700">
              Word B (reads when rotated 180°)
            </label>
            <input
              value={secondWord}
              onChange={(e) => setSecondWord(e.target.value.replace(/[^a-zA-Z\s]/g, ''))}
              maxLength={20}
              placeholder="e.g. love"
              className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
            />
          </div>
        )}
      </div>

      {/* Style picker */}
      <div>
        <div className="mb-2 text-sm font-semibold text-ink-700">Style</div>
        <div className="inline-flex rounded-full bg-ink-100 p-1">
          {(Object.keys(STYLE_LABELS) as Style[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                style === s ? 'bg-white text-ink-900 shadow-soft' : 'text-ink-500 hover:text-ink-700'
              }`}
            >
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div
        ref={previewRef}
        className="rounded-2xl bg-gradient-to-br from-ink-50 via-white to-ink-50 p-8 ring-1 ring-ink-100"
      >
        <div className="flex flex-col items-center gap-2 py-4">
          <div className={`text-5xl text-ink-900 sm:text-6xl ${STYLE_CLASSES[style]}`}>
            {previewText.toUpperCase()}
          </div>
          <div
            className={`text-5xl text-ink-900/85 sm:text-6xl ${STYLE_CLASSES[style]}`}
            style={{ transform: 'rotate(180deg)' }}
          >
            {flippedText.toUpperCase()}
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-ink-400">
          Rotate the page 180° (or your phone) — the lower text reads as the {mode === 'chain' ? 'second' : 'same'} word.
          <br />
          This is a visual approximation. True ambigrams need custom letterforms — use this as a design reference for your artist.
        </p>
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={handleDownloadPng}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-wa-green/40 hover:text-ink-900"
          >
            <Download className="h-4 w-4" />
            Download PNG
          </button>
        </div>
      </div>

      {/* AI analysis */}
      <div className="rounded-2xl border border-wa-green/20 bg-wa-bubble/30 p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-wa-teal" />
          <h3 className="text-sm font-bold text-ink-900">AI ambigram analysis</h3>
        </div>
        <p className="mb-3 text-sm text-ink-500">
          Get a score on how well your word works as an ambigram, plus a recommended style and tips.
        </p>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={loading || !word.trim() || (mode === 'chain' && !secondWord.trim())}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-wa-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Analyze ambigram
            </>
          )}
        </button>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        {analysis && (
          <div className="mt-5 space-y-4">
            <div className="flex items-baseline gap-4 rounded-xl bg-white p-4 shadow-soft">
              <div className={`font-display text-4xl font-bold ${scoreColor(analysis.scoreLabel)}`}>
                {analysis.score}
              </div>
              <div>
                <div className={`text-sm font-bold ${scoreColor(analysis.scoreLabel)}`}>{analysis.scoreLabel}</div>
                <div className="text-sm text-ink-500">{analysis.reason}</div>
              </div>
            </div>

            <div className="rounded-xl bg-white p-4 shadow-soft">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Recommended style: {STYLE_LABELS[analysis.recommendedStyle]}
              </div>
              <div className="mt-1 text-sm text-ink-500">{analysis.styleReason}</div>
              {style !== analysis.recommendedStyle && (
                <button
                  type="button"
                  onClick={() => setStyle(analysis.recommendedStyle)}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-wa-teal hover:text-navy-700"
                >
                  <RotateCw className="h-3 w-3" />
                  Apply this style
                </button>
              )}
            </div>

            {analysis.tips.length > 0 && (
              <div className="rounded-xl bg-white p-4 shadow-soft">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Tips</div>
                <ul className="mt-2 space-y-1.5 text-sm text-ink-500">
                  {analysis.tips.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-wa-green">•</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysis.similarWords.length > 0 && (
              <div className="rounded-xl bg-white p-4 shadow-soft">
                <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                  Try these instead (better ambigram potential)
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {analysis.similarWords.map((w, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setWord(w)}
                      className="rounded-full bg-wa-bubble px-3 py-1 text-sm font-semibold text-wa-teal transition hover:bg-wa-green/20"
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(() => {
              const cta = buildToolPrefill('ambigram-generator', {
                word,
                score: analysis.score,
                style: analysis.recommendedStyle,
              });
              return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
