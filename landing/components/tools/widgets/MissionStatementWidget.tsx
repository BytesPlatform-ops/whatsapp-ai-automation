'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';
import { CopyButton } from '@/components/tools/widgets/CopyButton';

interface Fields {
  company: string;
  offering: string;
  audience: string;
  value: string;
}

// Each template is a function of the four inputs. Kept template-based (no AI) so
// the tool is instant, free, and private.
const TEMPLATES: ((f: Fields) => string)[] = [
  (f) => `At ${f.company}, our mission is to ${f.offering} for ${f.audience} — guided by ${f.value} in everything we do.`,
  (f) => `${f.company} exists to ${f.offering}, helping ${f.audience} thrive through a relentless focus on ${f.value}.`,
  (f) => `We empower ${f.audience} by working to ${f.offering}, with ${f.value} at the heart of every decision.`,
  (f) => `Our purpose at ${f.company} is simple: ${f.offering} for ${f.audience}, never compromising on ${f.value}.`,
  (f) => `${f.company} is on a mission to ${f.offering} — making ${f.value} the standard that ${f.audience} can count on.`,
  (f) => `Driven by ${f.value}, ${f.company} sets out to ${f.offering} so that ${f.audience} can do their best work.`,
];

export function MissionStatementWidget() {
  const [fields, setFields] = useState<Fields>({ company: '', offering: '', audience: '', value: '' });
  const [results, setResults] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof Fields, val: string) => setFields((f) => ({ ...f, [key]: val }));

  const generate = () => {
    const f: Fields = {
      company: fields.company.trim() || 'our company',
      offering: fields.offering.trim(),
      audience: fields.audience.trim(),
      value: fields.value.trim(),
    };
    if (!f.offering || !f.audience || !f.value) {
      setError('Fill in what you do, who you serve, and your core value to generate statements.');
      setResults([]);
      return;
    }
    setError(null);
    setResults(TEMPLATES.map((t) => t(f)));
  };

  const INPUTS: { key: keyof Fields; label: string; placeholder: string }[] = [
    { key: 'company', label: 'Company name', placeholder: 'e.g. Brightline Studio' },
    { key: 'offering', label: 'What you do (verb phrase)', placeholder: 'e.g. build affordable websites' },
    { key: 'audience', label: 'Who you serve', placeholder: 'e.g. small local businesses' },
    { key: 'value', label: 'Core value', placeholder: 'e.g. honesty and craftsmanship' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {INPUTS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`ms-${f.key}`} className="mb-2 block text-sm font-semibold text-ink-700">
              {f.label}
            </label>
            <input
              id={`ms-${f.key}`}
              value={fields[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={generate}
        className="inline-flex items-center gap-1.5 rounded-xl bg-wa-green px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-wa-greenDark"
      >
        <Sparkles className="h-4 w-4" />
        Generate statements
      </button>

      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-ink-200 bg-ink-50 px-4 py-3">
              <p className="min-w-0 flex-1 text-base leading-relaxed text-ink-900">{r}</p>
              <CopyButton value={r} size="xs" className="mt-0.5 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (() => {
        const cta = buildToolPrefill('mission-statement-generator', {});
        return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
      })()}

      <p className="text-xs text-ink-400">
        Tip: a mission statement says what you do, who you do it for, and why it matters. Keep the
        winner to one clear sentence — then build your brand and website around it.
      </p>
    </div>
  );
}
