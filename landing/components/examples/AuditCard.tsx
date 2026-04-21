'use client';

import { motion } from 'framer-motion';
import { Download, ExternalLink, FileText } from 'lucide-react';
import type { AuditExample } from '@/lib/auditExamples';
import { scoreVerdict } from '@/lib/auditExamples';

interface AuditCardProps {
  audit: AuditExample;
  index: number;
}

// Visual gauge — SVG half-donut showing where the score sits on the
// 0-100 scale. Color follows the same verdict palette the PDF uses.
function ScoreRing({ score }: { score: number }) {
  const size = 96;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * circumference;

  const color =
    score >= 85 ? '#22C55E' :
    score >= 75 ? '#0D9488' :
    score >= 60 ? '#F59E0B' :
    score >= 45 ? '#F97316' :
                   '#DC2626';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold text-white leading-none">{score}</span>
        <span className="text-[9px] text-white/50 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

export function AuditCard({ audit, index }: AuditCardProps) {
  const verdict = scoreVerdict(audit.score);
  const hostname = audit.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/8 bg-white/[0.02] p-6 transition-all hover:border-wa-green/30 hover:shadow-[0_20px_60px_-20px_rgba(37,211,102,0.35)]"
    >
      {/* Header row: score ring + url/label + verdict chip */}
      <div className="flex items-start gap-5">
        <ScoreRing score={audit.score} />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/60 ring-1 ring-white/10">
            {audit.label}
          </span>
          <h3 className="mt-2 truncate font-display text-lg font-bold text-white sm:text-xl">
            {hostname}
          </h3>
          <span
            className={`mt-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ring-1 ${verdict.className}`}
          >
            {verdict.label}
          </span>
        </div>
      </div>

      {/* Verdict sentence — brief narrative */}
      <p className="mt-5 text-sm leading-relaxed text-white/70">{audit.verdict}</p>

      {/* Top recommendation pill */}
      <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wa-green">Top fix</p>
        <p className="mt-1 text-sm font-semibold text-white">{audit.topRec}</p>
      </div>

      {/* Lighthouse strip */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Perf', value: audit.lighthouse.performance },
          { label: 'SEO', value: audit.lighthouse.seo },
          { label: 'A11y', value: audit.lighthouse.accessibility },
          { label: 'Best', value: audit.lighthouse.bestPractices },
        ].map((m) => {
          const c =
            m.value >= 90 ? 'text-emerald-400' :
            m.value >= 50 ? 'text-amber-400' :
                             'text-red-400';
          return (
            <div key={m.label} className="rounded-lg bg-white/[0.02] px-2 py-2 text-center ring-1 ring-white/5">
              <p className={`font-display text-lg font-bold ${c}`}>{m.value}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-white/40">{m.label}</p>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
        <a
          href={audit.pdfPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-wa-green/40 bg-wa-green/5 px-4 py-1.5 text-sm font-semibold text-wa-green transition hover:border-wa-green hover:bg-wa-green/10"
        >
          <FileText className="h-3.5 w-3.5" />
          View PDF
        </a>
        <a
          href={audit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-white/50 transition hover:text-white"
        >
          Visit site
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Hidden download helper available to CMD/CTRL-click users */}
      <a href={audit.pdfPath} download className="sr-only">
        <Download className="h-4 w-4" />
        Download PDF
      </a>
    </motion.div>
  );
}
