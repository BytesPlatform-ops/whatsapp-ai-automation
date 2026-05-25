'use client';

import { useMemo, useState } from 'react';
import { ToolResultCta } from '@/components/tools/ToolResultCta';
import { buildToolPrefill } from '@/lib/toolPrefill';

// Bacalaureat Romania grading formula (2025-2026):
// Media finală = (Română scris × 0.2) + (Profil obligatoriu × 0.2) + (La alegere × 0.2)
//              + (Oral Română × 0.1) + (Oral limbă modernă × 0.1) + (Competențe digitale × 0.1)
//              + (Media generală liceu × 0.1)
// Promovat: medie ≥ 6.00 AND toate probele scrise ≥ 5.00 AND toate probele orale ≥ 5.00

interface Field {
  id: keyof State;
  label: string;
  hint: string;
  weight: number;
  isWritten?: boolean;
  isOral?: boolean;
}

const FIELDS: Field[] = [
  { id: 'romanaScris', label: 'Română — proba scrisă', hint: '20% din medie', weight: 0.2, isWritten: true },
  { id: 'profilObligatoriu', label: 'Probă obligatorie de profil', hint: '20% din medie', weight: 0.2, isWritten: true },
  { id: 'laAlegere', label: 'Probă la alegere', hint: '20% din medie', weight: 0.2, isWritten: true },
  { id: 'romanaOral', label: 'Română — proba orală', hint: '10% din medie', weight: 0.1, isOral: true },
  { id: 'limbaModerna', label: 'Limbă modernă — oral', hint: '10% din medie', weight: 0.1, isOral: true },
  { id: 'competenteDigitale', label: 'Competențe digitale', hint: '10% din medie', weight: 0.1, isOral: true },
  { id: 'mediaLiceu', label: 'Media generală liceu (cl. 9–12)', hint: '10% din medie', weight: 0.1 },
];

type State = Record<
  'romanaScris' | 'profilObligatoriu' | 'laAlegere' | 'romanaOral' | 'limbaModerna' | 'competenteDigitale' | 'mediaLiceu',
  string
>;

const DEFAULT_STATE: State = {
  romanaScris: '',
  profilObligatoriu: '',
  laAlegere: '',
  romanaOral: '',
  limbaModerna: '',
  competenteDigitale: '',
  mediaLiceu: '',
};

export function BacalaureatWidget() {
  const [values, setValues] = useState<State>(DEFAULT_STATE);

  const set = (id: keyof State) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [id]: e.target.value }));

  const result = useMemo(() => {
    const parsed: Partial<Record<keyof State, number>> = {};
    for (const f of FIELDS) {
      const v = Number(values[f.id]);
      if (values[f.id] === '' || !Number.isFinite(v) || v < 0 || v > 10) return null;
      parsed[f.id] = v;
    }

    let medie = 0;
    for (const f of FIELDS) {
      medie += (parsed[f.id] ?? 0) * f.weight;
    }
    medie = Math.round(medie * 100) / 100;

    const writtenFails = FIELDS.filter((f) => f.isWritten && (parsed[f.id] ?? 0) < 5).map((f) => f.label);
    const oralFails = FIELDS.filter((f) => f.isOral && (parsed[f.id] ?? 0) < 5).map((f) => f.label);
    const promovat = medie >= 6 && writtenFails.length === 0 && oralFails.length === 0;
    const failReasons: string[] = [];
    if (medie < 6) failReasons.push(`Medie finală ${medie.toFixed(2)} < 6.00`);
    writtenFails.forEach((l) => failReasons.push(`${l}: notă < 5`));
    oralFails.forEach((l) => failReasons.push(`${l}: notă < 5`));

    return { medie, promovat, failReasons };
  }, [values]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.id}>
            <label className="mb-1 block text-sm font-semibold text-ink-700">{f.label}</label>
            <input
              type="number"
              min="1"
              max="10"
              step="0.01"
              placeholder="ex: 7.50"
              value={values[f.id]}
              onChange={set(f.id)}
              className="w-full rounded-xl border border-ink-200 bg-white px-3 py-3 text-base text-ink-900 outline-none transition focus:border-wa-green focus:ring-2 focus:ring-wa-green/20"
            />
            <div className="mt-1 text-xs text-ink-400">{f.hint}</div>
          </div>
        ))}
      </div>

      {result ? (
        <div
          className={`rounded-2xl p-6 ring-1 ${
            result.promovat
              ? 'bg-gradient-to-br from-wa-bubble via-white to-wa-green/10 ring-wa-green/20'
              : 'bg-gradient-to-br from-orange-50 via-white to-red-50 ring-orange-200'
          }`}
        >
          <div className={`mb-2 text-sm font-semibold uppercase tracking-wider ${result.promovat ? 'text-wa-teal' : 'text-orange-600'}`}>
            {result.promovat ? 'Promovat ✓' : 'Nepromovat ✗'}
          </div>
          <div className="flex items-baseline gap-4">
            <div className={`font-display text-7xl font-bold sm:text-8xl ${result.promovat ? 'text-wa-teal' : 'text-orange-600'}`}>
              {result.medie.toFixed(2)}
            </div>
            <div className="text-base text-ink-500">
              <div className="font-semibold text-ink-900">Media finală de bacalaureat</div>
              <div>{result.promovat ? 'Condiții de promovare îndeplinite' : 'Condiții neîndeplinite'}</div>
            </div>
          </div>

          {!result.promovat && result.failReasons.length > 0 && (
            <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-orange-700 shadow-soft">
              <div className="font-semibold mb-1">Motive de nepromovare:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {result.failReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <p className="mt-4 text-xs text-ink-400">
            Calculator orientativ. Verifică metodologia oficială publicată de Ministerul Educației pentru sesiunea ta.
          </p>

          {(() => {
            const cta = buildToolPrefill('calculator-bacalaureat', { medie: result.medie });
            return <ToolResultCta {...cta} prefill={cta.whatsappPrefill} />;
          })()}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 p-8 text-center text-sm text-ink-500">
          Completează toate notele de mai sus (1.00–10.00) pentru a calcula media finală.
        </div>
      )}
    </div>
  );
}
