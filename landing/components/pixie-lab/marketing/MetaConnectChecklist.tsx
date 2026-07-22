'use client';

import { useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';

const ACCENT = '#EC4899';

/**
 * The 7 things a client's Facebook profile needs before connecting Meta. Ticking
 * them is self-attestation (we can't verify from outside) — it's a guided
 * pre-flight so the OAuth popup doesn't fail for an avoidable reason. After
 * connecting, MetaDiagnosticsPanel verifies the real state against the Graph API.
 */
const ITEMS: { id: string; label: string }[] = [
  { id: 'profile', label: 'I’m logged into the correct Facebook profile (the one with business access)' },
  { id: 'portfolio', label: 'My profile has access to the Meta Business Portfolio' },
  { id: 'ad_account', label: 'My profile has access to the Ad Account' },
  { id: 'page', label: 'My profile has access to the Facebook Page' },
  { id: 'ig_pro', label: 'My Instagram is a Professional / Business account' },
  { id: 'ig_link', label: 'My Instagram is linked to the Facebook Page' },
  { id: 'popups', label: 'Browser pop-ups are allowed for this site' },
];

export function MetaConnectChecklist() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const done = ITEMS.filter((i) => checked[i.id]).length;

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[13.5px] font-bold text-[var(--pl-text)]">Before you connect</p>
        <span className="text-[11.5px] font-semibold text-[var(--pl-text-muted)]">{done}/{ITEMS.length}</span>
      </div>
      <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">
        Log into the Facebook profile that has access to your business assets, then confirm each item.
      </p>
      <ul className="mt-3 space-y-1.5">
        {ITEMS.map((item) => {
          const on = !!checked[item.id];
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setChecked((p) => ({ ...p, [item.id]: !p[item.id] }))}
                className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--pl-surface-hover)]"
              >
                {on ? (
                  <CheckCircle2 size={16} className="mt-0.5 flex-none" style={{ color: ACCENT }} />
                ) : (
                  <Circle size={16} className="mt-0.5 flex-none text-[var(--pl-text-muted)]" />
                )}
                <span className={`text-[12.5px] ${on ? 'text-[var(--pl-text)]' : 'text-[var(--pl-text-soft)]'}`}>
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
