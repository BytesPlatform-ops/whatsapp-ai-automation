'use client';

import { useCallback, useEffect, useState } from 'react';
import { Star, MessageSquare, CheckCircle2, Loader2, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { seoApi } from '@/lib/pixie-lab/servicesClient';
import type { SeoReview, SeoReviewSummary } from '@/lib/pixie-lab/serviceTypes';
import { EmptyState, OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';

const ACCENT = '#14B8A6';

function SentimentIcon({ sentiment }: { sentiment?: string | null }) {
  if (sentiment === 'positive') return <ThumbsUp size={11} style={{ color: '#22c55e' }} />;
  if (sentiment === 'negative') return <ThumbsDown size={11} style={{ color: '#ef4444' }} />;
  return <Minus size={11} style={{ color: '#64748b' }} />;
}

function StarRating({ rating }: { rating?: number | null }) {
  const n = rating ?? 0;
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={11} style={{ color: i <= n ? '#f59e0b' : 'var(--pl-text-muted)', fill: i <= n ? '#f59e0b' : 'none' }} />
      ))}
    </span>
  );
}

function SummaryBar({ summary }: { summary: SeoReviewSummary }) {
  const dist = summary.distribution ?? {};
  const total = summary.total ?? 0;
  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-5">
      <div className="flex flex-wrap items-start gap-6">
        <div className="text-center">
          <p className="font-display text-[36px] font-extrabold text-[var(--pl-text)]">
            {summary.avg_rating != null ? summary.avg_rating.toFixed(1) : '—'}
          </p>
          <StarRating rating={summary.avg_rating} />
          <p className="mt-1 text-[11.5px] text-[var(--pl-text-muted)]">{total} review{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = dist[String(star)] ?? 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-4 text-right text-[var(--pl-text-muted)]">{star}</span>
                <Star size={9} style={{ color: '#f59e0b', fill: '#f59e0b' }} />
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--pl-surface-soft)]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#f59e0b' }} />
                  </div>
                </div>
                <span className="w-6 text-right text-[var(--pl-text-muted)]">{count}</span>
              </div>
            );
          })}
        </div>
        {(summary.unanswered ?? 0) > 0 && (
          <div className="rounded-xl border border-[var(--pl-border)] px-4 py-3 text-center">
            <p className="font-display text-[22px] font-extrabold" style={{ color: '#ef4444' }}>{summary.unanswered}</p>
            <p className="text-[11.5px] text-[var(--pl-text-muted)]">unanswered</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review, onDraftResponse }: { review: SeoReview; onDraftResponse: (id: string) => void }) {
  const [draftBusy, setDraftBusy] = useState(false);
  const [draft, setDraft] = useState(review.response_draft ?? '');
  const [approveBusy, setApproveBusy] = useState(false);
  const [approved, setApproved] = useState(false);

  async function handleDraft() {
    setDraftBusy(true);
    const env = await seoApi.draftReviewResponse(review.id);
    setDraftBusy(false);
    if (env.draft) { setDraft(env.draft); onDraftResponse(review.id); }
  }

  async function handleApprove() {
    if (!review.response_approval_id) return;
    setApproveBusy(true);
    await seoApi.approveReviewResponse(review.id, review.response_approval_id);
    setApproveBusy(false);
    setApproved(true);
  }

  return (
    <div className="rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} />
            <SentimentIcon sentiment={review.sentiment} />
            {review.platform && <span className="text-[11px] text-[var(--pl-text-muted)] capitalize">{review.platform}</span>}
          </div>
          {review.author && <p className="mt-0.5 text-[12.5px] font-semibold text-[var(--pl-text)]">{review.author}</p>}
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
          style={review.status === 'answered'
            ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
            : review.status === 'ignored'
            ? { background: 'rgba(100,116,139,0.12)', color: '#64748b' }
            : { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}
        >
          {review.status ?? 'unanswered'}
        </span>
      </div>

      {review.body && <p className="text-[13px] leading-relaxed text-[var(--pl-text-soft)]">{review.body}</p>}

      {review.published_at && (
        <p className="text-[11.5px] text-[var(--pl-text-muted)]">{new Date(review.published_at).toLocaleDateString()}</p>
      )}

      {/* Draft response */}
      {draft ? (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--pl-text-muted)]">Draft Response</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-soft)] p-3 text-[12.5px] text-[var(--pl-text)] outline-none resize-none"
          />
          {!approved ? (
            <button
              onClick={handleApprove}
              disabled={approveBusy || !review.response_approval_id}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold text-[#02120f] disabled:opacity-60"
              style={{ background: ACCENT }}
            >
              {approveBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {approveBusy ? 'Approving…' : 'Approve & Send'}
            </button>
          ) : (
            <p className="text-[12px] font-semibold" style={{ color: '#22c55e' }}>Response approved.</p>
          )}
        </div>
      ) : review.status !== 'answered' ? (
        <button
          onClick={handleDraft}
          disabled={draftBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pl-border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--pl-text-soft)] transition hover:text-[var(--pl-text)] disabled:opacity-60"
        >
          {draftBusy ? <Loader2 size={12} className="animate-spin" style={{ color: ACCENT }} /> : <MessageSquare size={12} style={{ color: ACCENT }} />}
          {draftBusy ? 'Drafting…' : 'Draft Response'}
        </button>
      ) : null}
    </div>
  );
}

export function SeoReviewsPanel({ initialLocationId }: { initialLocationId?: string }) {
  const [status, setStatus] = useState<'loading' | 'done' | 'offline'>('loading');
  const [reviews, setReviews] = useState<SeoReview[]>([]);
  const [summary, setSummary] = useState<SeoReviewSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setStatus('loading');
    const env = await seoApi.reviews({ location_id: initialLocationId });
    if (!env.backendUp) { setStatus('offline'); return; }
    setReviews(env.reviews ?? []);
    setSummary(env.summary ?? null);
    setStatus('done');
  }, [initialLocationId]);

  useEffect(() => { load(); }, [load]);

  const visible = statusFilter === 'all' ? reviews : reviews.filter((r) => r.status === statusFilter);

  if (status === 'loading') return <div className="mt-6"><LoadingCards count={3} height="h-32" /></div>;
  if (status === 'offline') {
    return (
      <div className="mt-6">
        <OfflineState service="SEO" action={<button onClick={load} className="rounded-lg border border-[var(--pl-border)] px-4 py-2 text-[13px] font-semibold text-[var(--pl-text-soft)]">Retry</button>} />
      </div>
    );
  }
  if (!reviews.length) {
    return (
      <div className="mt-6">
        <EmptyState
          title="No reviews yet"
          body="Reviews will appear here once your Google Business Profile is connected and locations are configured."
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {summary && <SummaryBar summary={summary} />}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        {['all', 'unanswered', 'answered', 'ignored'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="rounded-lg px-3 py-1.5 text-[12.5px] font-semibold capitalize transition-colors"
            style={statusFilter === s
              ? { background: `color-mix(in srgb, ${ACCENT} 16%, transparent)`, color: ACCENT }
              : { color: 'var(--pl-text-muted)' }}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
        <span className="ml-auto text-[12px] text-[var(--pl-text-muted)]">{visible.length} review{visible.length !== 1 ? 's' : ''}</span>
      </div>

      {visible.length === 0 ? (
        <p className="text-[13px] italic text-[var(--pl-text-muted)]">No reviews match this filter.</p>
      ) : (
        <div className="space-y-4">
          {visible.map((r) => (
            <ReviewCard key={r.id} review={r} onDraftResponse={() => load()} />
          ))}
        </div>
      )}
    </div>
  );
}
