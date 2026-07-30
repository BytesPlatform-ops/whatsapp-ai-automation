'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Clock, Mail } from 'lucide-react';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';
import type { RcpTask, RcpReminder } from '@/lib/pixie-lab/serviceTypes';
import { OfflineState, LoadingCards } from '@/components/pixie-lab/services/ServiceStates';
import { Card, Section, Pill, GhostButton, fmtDate, RCP_ACCENT } from './widgets';

type Status = 'loading' | 'offline' | 'ready';

/** Honest reminder status — never "sent" without provider confirmation. */
const REM_COLORS: Record<string, string> = {
  scheduled: '#3b82f6', queued: '#f59e0b', sent: '#16a34a', completed: '#16a34a',
  failed: '#dc2626', stopped: '#64748b', cancelled: '#64748b', reconciliation_required: '#f97316',
};

export default function FollowUpsPanel() {
  const [status, setStatus] = useState<Status>('loading');
  const [followUps, setFollowUps] = useState<RcpTask[]>([]);
  const [reminders, setReminders] = useState<RcpReminder[]>([]);

  const load = useCallback(async () => {
    const r = await receptionistApi.getFollowUps();
    if (!r.backendUp) { setStatus('offline'); return; }
    setFollowUps((r as { follow_ups?: RcpTask[] }).follow_ups || []);
    setReminders((r as { reminders?: RcpReminder[] }).reminders || []);
    setStatus('ready');
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (status === 'loading') return <LoadingCards />;
  if (status === 'offline') return <OfflineState service="AI Receptionist" />;

  return (
    <div className="space-y-6" data-testid="followups-panel">
      <div className="flex justify-end"><GhostButton onClick={load} aria-label="Refresh"><RefreshCw size={14} /></GhostButton></div>

      <Section title="Reminders" sub="Booking reminders never show 'sent' before the provider confirms delivery.">
        {reminders.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No reminders scheduled.</p></Card>
        ) : (
          <div className="space-y-2">
            {reminders.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Clock size={14} color={RCP_ACCENT} /> {r.title || 'Reminder'}
                    <span className="text-xs text-slate-500">{fmtDate(r.remind_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {r.channel === 'email' ? <Mail size={13} color="#ea4335" /> : null}
                    <Pill color={REM_COLORS[r.status || 'scheduled'] || '#64748b'}>{r.status || 'scheduled'}</Pill>
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Follow-ups" sub={`${followUps.length} task${followUps.length === 1 ? '' : 's'}`}>
        {followUps.length === 0 ? (
          <Card><p className="text-sm text-slate-500">No follow-ups.</p></Card>
        ) : (
          <div className="space-y-2">
            {followUps.map((t) => (
              <Card key={t.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span>{t.title || 'Follow-up'}</span>
                  <Pill color={REM_COLORS[t.status || 'scheduled'] || '#64748b'}>{t.status || 'open'}</Pill>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
