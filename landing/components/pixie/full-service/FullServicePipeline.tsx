'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Plane, Check, ArrowLeft, ChevronRight, Sparkles, ShieldCheck, Activity, Workflow, Brain, Zap, type LucideIcon } from 'lucide-react';
import { getPipelineBySlug, type PipelineStage } from '@/lib/pipelines';
import { getFullServiceData } from '@/lib/full-service-data';
import { RecommendationCard } from '@/components/pixie/full-service/RecommendationCard';
import { AnimatedWorkflowSection } from '@/components/pixie/full-service/AnimatedWorkflowSection';
import { ScrollSectionNavigator } from '@/components/pixie/full-service/ScrollSectionNavigator';

/**
 * FullServicePipeline — the agent/Omni full-service COMMAND CENTER. The airplane
 * pipeline is just one section; the page leads with an AI-boss status bar, a large
 * 2-column masonry recommendation feed, the approval center, ready-to-run
 * workflows, agent intelligence, activity, and next best actions. Pixie does the
 * work; the user reviews, approves, edits, or skips.
 */

export interface PipelineUnit {
  slug: string;
  name: string;
  dashboardPath: string;
  fullServicePath: string;
  type: 'agent' | 'omni';
  accent?: string;
}

const PRIORITY_DOT: Record<string, string> = { urgent: '#ef4444', high: '#f59e0b', medium: '#22d3ee', low: '#64748b' };

export function FullServicePipeline({ unit }: { unit: PipelineUnit }) {
  const pipeline = getPipelineBySlug(unit.slug);
  const data = getFullServiceData(unit.slug);
  const accent = unit.accent ?? '#25D366';
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1600); };

  const recs = data?.recommendations ?? [];
  const stats = [
    { label: 'Signals Found', value: recs.length + (data?.activity.length ?? 0) },
    { label: 'Work Prepared', value: recs.length },
    { label: 'Need Approval', value: data?.approvals.length ?? 0 },
    { label: 'Executed Today', value: data?.activity.length ?? 0 },
  ];

  return (
    <div className="relative min-h-screen bg-[var(--pl-bg)] text-[var(--pl-text)]" style={{ ['--accent' as string]: accent }}>
      <ScrollSectionNavigator accent={accent} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[460px]" style={{ background: `radial-gradient(80% 100% at 50% 0%, color-mix(in srgb, ${accent} 16%, transparent), transparent 62%)` }} />

      {/* header + hero */}
      <header className="relative z-10 mx-auto flex max-w-[min(1720px,94vw)] items-center justify-between px-5 py-5 sm:px-8">
        <Link href={unit.dashboardPath} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)]">
          <ArrowLeft size={14} /> Back to {unit.name}
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ background: `${accent}1f`, color: accent }}>
          <Sparkles size={12} /> Full service · Active
        </span>
      </header>

      <main className="relative z-10 mx-auto max-w-[min(1720px,94vw)] px-5 pb-24 sm:px-8">
        <h1 className="font-display text-[clamp(1.9rem,3.8vw,2.7rem)] font-extrabold leading-tight tracking-tight">{pipeline?.title ?? `${unit.name} Full-Service`}</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-[var(--pl-text-muted)]">{pipeline?.subtitle ?? 'Pixie is preparing the work and waiting for your approval before anything goes live.'}</p>

        {/* AI Boss status bar */}
        <div id="overview" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 scroll-mt-24">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
              <div className="font-display text-2xl font-extrabold" style={{ color: accent }}>{s.value}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-[var(--pl-text-muted)]">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Large masonry recommendation feed */}
        <SectionHead id="recommendations" title="What Pixie recommends" subtitle="Pixie prepared these actions based on your business activity. Review, approve, or skip." />
        <div className="columns-1 gap-6 lg:columns-2 2xl:columns-3 [&>*]:mb-6 [&>*]:break-inside-avoid">
          {recs.map((c) => <RecommendationCard key={c.id} card={c} accent={accent} onAction={flash} />)}
        </div>

        {/* How Pixie runs this service — animated operating loop */}
        <AnimatedWorkflowSection agentName={unit.name} accent={accent} />

        {/* Approval & Permission Center */}
        {data && data.approvals.length > 0 && (
          <>
            <SectionHead id="approvals" icon={ShieldCheck} title="Approval & Permission Center" subtitle="Pixie prepares the work. You stay in control before anything public, paid, or risky happens." />
            <div className="grid gap-3 sm:grid-cols-2">
              {data.approvals.map((a, i) => (
                <div key={i} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: `${PRIORITY_DOT[a.risk]}22`, color: PRIORITY_DOT[a.risk] }}>{a.risk} risk</span>
                    <span className="text-[11px] text-[var(--pl-text-muted)]">{a.channels}</span>
                  </div>
                  <p className="mt-2 font-display text-[15px] font-bold">{a.title}</p>
                  <p className="mt-1 text-[13px] text-[var(--pl-text-muted)]">{a.willDo}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => flash(`Approved · ${a.title}`)} className="rounded-full px-3.5 py-1.5 text-[12px] font-bold" style={{ background: accent, color: '#02070a' }}>Approve</button>
                    <button onClick={() => flash('Opened editor')} className="rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)]">Edit</button>
                    <button onClick={() => flash('Skipped')} className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-muted)]">Skip</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Ready workflows */}
        {data && (
          <>
            <SectionHead id="automations" icon={Zap} title="Ready-to-run AI workflows" subtitle="Pixie can handle these end-to-end. Enable one and Pixie runs it after your approval." />
            <div className="grid gap-3 sm:grid-cols-2">
              {data.workflows.map((w, i) => (
                <div key={i} className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-[15px] font-bold">{w.name}</p>
                    <span className="rounded-full border border-[#25D366]/30 bg-[var(--pl-green)]/10 px-2 py-0.5 text-[10px] font-bold text-[#7ef0a8]">{w.status}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-[var(--pl-text-muted)]"><b className="text-[var(--pl-text-soft)]">Detects:</b> {w.detects}</p>
                  <p className="text-[12.5px] text-[var(--pl-text-muted)]"><b className="text-[var(--pl-text-soft)]">Prepares:</b> {w.prepares}</p>
                  <button onClick={() => flash(`Enabled · ${w.name}`)} className="mt-3 rounded-full px-3.5 py-1.5 text-[12px] font-bold" style={{ background: accent, color: '#02070a' }}>Enable</button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Intelligence + Activity */}
        {data && (
          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div id="intelligence" className="scroll-mt-24">
              <h3 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight"><Brain size={18} style={{ color: accent }} /> {data.intelligenceTitle}</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.intelligence.map((it, i) => (
                  <div key={i} className="rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3.5">
                    <p className="text-[11px] uppercase tracking-wider text-[var(--pl-text-muted)]">{it.title}</p>
                    <p className="mt-1 text-[14px] font-semibold text-[var(--pl-text)]">{it.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div id="activity" className="scroll-mt-24">
              <h3 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight"><Activity size={18} style={{ color: accent }} /> What Pixie has done</h3>
              <ol className="mt-4 space-y-2.5 border-l border-[var(--pl-border)] pl-5">
                {data.activity.map((a, i) => (
                  <li key={i} className="relative text-[13.5px] text-[var(--pl-text-soft)]">
                    <span className="absolute -left-[23px] top-1.5 h-2 w-2 rounded-full" style={{ background: accent }} />
                    {a}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* Next best actions */}
        {data && (
          <>
            <SectionHead id="next-actions" title="Next best actions" subtitle="If you only do a few things, do these." />
            <div className="grid gap-3 sm:grid-cols-2">
              {data.nextActions.map((n, i) => (
                <div key={i} className="flex items-center justify-between rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
                  <div>
                    <p className="font-display text-[14.5px] font-bold">{n.title}</p>
                    <p className="mt-1 text-[12px] text-[var(--pl-text-muted)]">Impact {n.impact} · Effort {n.effort} · {n.permission}</p>
                  </div>
                  <button onClick={() => flash(`Reviewing · ${n.title}`)} className="rounded-full px-3.5 py-1.5 text-[12px] font-bold" style={{ background: accent, color: '#02070a' }}>Review</button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {toast && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[var(--pl-border)] bg-[#0a0e16] px-4 py-2.5 text-[13px] text-[var(--pl-text)] shadow-2xl">{toast}</motion.div>
      )}
    </div>
  );
}

function SectionHead({ icon: Icon, title, subtitle, id }: { icon?: LucideIcon; title: string; subtitle: string; id?: string }) {
  return (
    <div className="mt-12 scroll-mt-24" id={id}>
      <h2 className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight">{Icon ? <Icon size={19} /> : null}{title}</h2>
      <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--pl-text-muted)]">{subtitle}</p>
      <div className="mt-5" />
    </div>
  );
}

function PipelineRunway({ stages, accent }: { stages: PipelineStage[]; accent: string }) {
  const currentIdx = Math.max(0, stages.findIndex((s) => s.status === 'active'));
  const [selected, setSelected] = useState(currentIdx === -1 ? 0 : currentIdx);
  const stage = stages[selected];
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5 backdrop-blur-md">
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-center">
          {stages.map((st, i) => {
            const done = i < currentIdx, current = i === currentIdx, sel = i === selected;
            return (
              <div key={st.id} className="flex items-center">
                <button onClick={() => setSelected(i)} className="flex w-[132px] flex-col items-center text-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full border-2" style={{ borderColor: done || current || sel ? accent : 'var(--pl-border-strong)', background: current ? accent : done ? `${accent}26` : 'var(--pl-surface-soft)', boxShadow: current ? `0 0 22px ${accent}66` : 'none', color: current ? '#0A0A0A' : done ? accent : 'var(--pl-text-muted)' }}>
                    {done ? <Check size={17} /> : current ? <Plane size={17} className="-rotate-45" /> : <span className="text-[12px] font-bold">{i + 1}</span>}
                  </span>
                  <span className={`mt-2 text-[11.5px] font-semibold leading-tight ${sel || current ? 'text-[var(--pl-text)]' : 'text-[var(--pl-text-muted)]'}`}>{st.title}</span>
                </button>
                {i < stages.length - 1 && <div className="mx-1 h-0.5 w-10 sm:w-14" style={{ background: done ? accent : 'var(--pl-border)' }} />}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4">
        <p className="text-[11px] uppercase tracking-wider" style={{ color: accent }}>Stage {selected + 1} / {stages.length}</p>
        <h4 className="mt-1 font-display text-[16px] font-extrabold">{stage.title}</h4>
        <p className="mt-1 text-[13.5px] text-[var(--pl-text-soft)]">{stage.description}</p>
        <p className="mt-2 text-[12px] text-[var(--pl-text-muted)]">Your role: approve / edit / skip · Pixie’s role: detect / prepare / execute / learn</p>
      </div>
    </div>
  );
}
