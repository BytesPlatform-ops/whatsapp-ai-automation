'use client';

/** SEO score ring — 0..max with a colour that shifts green→amber→red by band. */
export function Ring({ score = 0, max = 100, size = 92 }: { score?: number; max?: number; size?: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
  const pctScore = Math.round(pct * 100);
  const color = pctScore >= 80 ? '#22c55e' : pctScore >= 50 ? '#f59e0b' : '#ef4444';
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--pl-border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute text-center">
        <span className="font-display text-xl font-extrabold" style={{ color }}>{Math.round(score)}</span>
        <span className="block text-[10px] text-[var(--pl-text-muted)]">/ {max}</span>
      </div>
    </div>
  );
}
