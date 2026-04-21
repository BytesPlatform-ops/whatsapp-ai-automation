'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, FileText } from 'lucide-react';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { AUDIT_EXAMPLES, scoreVerdict } from '@/lib/auditExamples';

// Featured audit on the landing page — picks the top-scoring audit from the
// Examples config so the card always reflects whatever we've curated, with
// zero maintenance. Mirrors the PDF's visual language (teal accent, score
// ring, severity chips) so prospects clicking through to /examples or the
// PDF feel the same design pulse throughout.

function pickFeatured() {
  // Sort by score desc and pick the top one. Could switch to a curated ID
  // if we ever want to feature something specific.
  return AUDIT_EXAMPLES.slice().sort((a, b) => b.score - a.score)[0];
}

export function SeoAuditFeature() {
  const featured = pickFeatured();
  const verdict = scoreVerdict(featured.score);
  const ringSize = 148;
  const stroke = 12;
  const r = (ringSize - stroke) / 2;
  const cx = ringSize / 2;
  const cy = ringSize / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (featured.score / 100) * circumference;
  const strokeColor =
    featured.score >= 85 ? '#22C55E' :
    featured.score >= 75 ? '#0D9488' :
    featured.score >= 60 ? '#F59E0B' :
    featured.score >= 45 ? '#F97316' :
                            '#DC2626';

  return (
    <section className="relative overflow-hidden bg-navy-900 py-20 text-white sm:py-28">
      <div aria-hidden className="absolute inset-0 bg-hero-radial opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.7) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <div className="container-page relative">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          {/* Left: copy + value props */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-wa-green">
              Free SEO Audit · 60 seconds
            </p>
            <h2 className="font-display text-display-lg text-balance text-white">
              A real SEO audit,{' '}
              <span className="relative inline-block">
                <span className="relative z-10 text-wa-green">in WhatsApp.</span>
                <span
                  aria-hidden
                  className="absolute bottom-1 left-0 right-0 -z-0 h-3 rounded-full bg-wa-green/25 blur-md"
                />
              </span>
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">
              Send a URL — get a branded PDF: Lighthouse scores, Core Web Vitals, technical health
              checklist, and a top 3 action list. Same depth as a paid agency audit. Free.
            </p>

            <ul className="mt-6 space-y-2.5">
              {[
                'Live Google PageSpeed Insights data',
                'Full Core Web Vitals — LCP, CLS, INP, FCP',
                'Technical health checklist (8 critical signals)',
                'Top 3 actions framed as business outcomes',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-white/75">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-wa-green" />
                  {t}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <WhatsAppButton
                size="xl"
                label="Audit my site free"
                prefill="Hi! I'd like a free SEO audit — here's the URL:"
              />
              <a
                href="/examples#seo-audits"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-wa-green transition hover:text-white"
              >
                See 4 real audits
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </motion.div>

          {/* Right: featured audit card (mirrors the PDF's visual language) */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
            className="relative"
          >
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[32px] bg-gradient-to-br from-wa-teal/20 via-transparent to-wa-green/10 blur-2xl"
            />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm shadow-2xl sm:p-7">
              {/* Mini browser chrome so the card reads as "a deliverable" */}
              <div className="mb-5 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
                <span className="ml-3 flex items-center gap-1.5 truncate rounded-md bg-white/[0.06] px-2 py-1 text-[10px] text-white/50 ring-1 ring-white/5">
                  <FileText className="h-3 w-3" />
                  SEO Audit · {featured.url.replace(/^https?:\/\//, '')}
                </span>
              </div>

              {/* Score hero block — mimics page 1 of the PDF */}
              <div className="flex items-start gap-6">
                <div className="relative shrink-0" style={{ width: ringSize, height: ringSize }}>
                  <svg width={ringSize} height={ringSize} className="-rotate-90">
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={stroke}
                      strokeLinecap="round"
                      strokeDasharray={`${dash} ${circumference - dash}`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-4xl font-bold text-white leading-none">{featured.score}</span>
                    <span className="mt-1 text-xs text-white/50">/ 100</span>
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/50">
                    Overall Score
                  </p>
                  <h3
                    className="mt-1 font-display text-2xl font-bold"
                    style={{ color: strokeColor }}
                  >
                    {verdict.label}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/65">
                    {featured.verdict}
                  </p>
                </div>
              </div>

              {/* Sub-score mini-grid — shows the detail the PDF contains */}
              <div className="mt-6 grid grid-cols-4 gap-2">
                {[
                  { label: 'PERF', value: featured.lighthouse.performance },
                  { label: 'SEO', value: featured.lighthouse.seo },
                  { label: 'A11Y', value: featured.lighthouse.accessibility },
                  { label: 'BEST', value: featured.lighthouse.bestPractices },
                ].map((m) => {
                  const c =
                    m.value >= 90 ? 'text-emerald-400' :
                    m.value >= 50 ? 'text-amber-400' :
                                     'text-red-400';
                  return (
                    <div key={m.label} className="rounded-lg bg-white/[0.03] px-2 py-2 text-center ring-1 ring-white/5">
                      <p className={`font-display text-lg font-bold ${c}`}>{m.value}</p>
                      <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">{m.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Top fix pill */}
              <div className="mt-5 rounded-xl border border-wa-green/20 bg-wa-green/[0.06] p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wa-green">
                  Top fix (outcome-framed)
                </p>
                <p className="mt-1 font-display text-sm font-bold text-white">
                  {featured.topRec}
                </p>
              </div>

              {/* View PDF link */}
              <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                <a
                  href={featured.pdfPath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group/link inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-white/85 transition hover:border-wa-green/50 hover:bg-wa-green/10 hover:text-white"
                >
                  <FileText className="h-3.5 w-3.5" />
                  View full PDF
                  <ArrowRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
                </a>
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
                  Sample · {featured.url.replace(/^https?:\/\//, '')}
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
