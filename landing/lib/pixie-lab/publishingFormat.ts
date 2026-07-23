/**
 * Shared presentation helpers for publish jobs — one source of truth for status
 * labels, colours and time formatting across Step Posting, the queue, the calendar
 * and the job-detail panel. Status is never conveyed by colour alone: every entry
 * carries a text label and a shape/dot so it stays accessible.
 */

import type { PublishStatus } from './publishingClient';

export interface StatusMeta {
  label: string;
  dot: string;
  /** tone bucket for badges (maps to the ui Badge tones where used) */
  tone: 'ok' | 'warn' | 'info' | 'muted' | 'danger';
  /** true for scheduled/queued/retry — a job that can still be cancelled */
  active: boolean;
  /** true for failed/reconnection/retry — a job that can be retried */
  retryable: boolean;
  terminal: boolean;
}

export const STATUS_META: Record<PublishStatus, StatusMeta> = {
  draft: { label: 'Draft', dot: '#9aa0a6', tone: 'muted', active: false, retryable: false, terminal: false },
  scheduled: { label: 'Scheduled', dot: '#3b82f6', tone: 'info', active: true, retryable: false, terminal: false },
  queued: { label: 'Queued', dot: '#3b82f6', tone: 'info', active: true, retryable: false, terminal: false },
  publishing: { label: 'Publishing', dot: '#d29922', tone: 'warn', active: false, retryable: false, terminal: false },
  published: { label: 'Published', dot: '#3fb950', tone: 'ok', active: false, retryable: false, terminal: true },
  failed: { label: 'Failed', dot: '#e5484d', tone: 'danger', active: false, retryable: true, terminal: true },
  cancelled: { label: 'Cancelled', dot: '#9aa0a6', tone: 'muted', active: false, retryable: false, terminal: true },
  retry_wait: { label: 'Retry wait', dot: '#d29922', tone: 'warn', active: true, retryable: true, terminal: false },
  reconnection_required: { label: 'Reconnect', dot: '#e5484d', tone: 'danger', active: false, retryable: true, terminal: false },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as PublishStatus] ?? STATUS_META.draft;
}

/** Localised absolute time (respects the viewer's locale/timezone). */
export function formatDateTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A simulated (dry-run) platform id is clearly labelled so it's never mistaken for a live post. */
export function isSimulatedPostId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('dryrun_');
}

export function platformLabel(platform: string): string {
  return platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : '';
}
