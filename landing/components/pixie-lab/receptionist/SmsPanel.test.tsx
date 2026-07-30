import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getSmsStatus: vi.fn(),
    getSmsNumbers: vi.fn(),
    getSmsDrafts: vi.fn(),
    selectSmsNumber: vi.fn(),
    setSmsReplyMode: vi.fn(),
    setSmsQuietHours: vi.fn(),
    runSmsHealth: vi.fn(),
    disconnectSms: vi.fn(),
    retrySmsDraft: vi.fn(),
    reconcileSmsDraft: vi.fn(),
  },
}));

import SmsPanel from './SmsPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.getSmsStatus.mockResolvedValue({ backendUp: true, reply_mode: 'draft_only',
    quiet_hours: { enabled: true, start_hour: 21, end_hour: 8, timezone: 'UTC' },
    connection: { connected: true, state: 'ready_to_send', sender_number: '+15550001111',
      country: 'US', sms_capable: true, mms_capable: true, can_send: true,
      inbound_webhook_subscribed: true, delivery_webhook_subscribed: true } } as never);
  api.getSmsNumbers.mockResolvedValue({ backendUp: true, numbers: [
    { sender_number: '+15550001111', country: 'US', sms_capable: true, mms_capable: true }] } as never);
  api.getSmsDrafts.mockResolvedValue({ backendUp: true, drafts: [] } as never);
});

describe('SmsPanel', () => {
  it('shows truthful ready-to-send state and number', async () => {
    render(<SmsPanel />);
    expect(await screen.findByText('Ready to send')).toBeInTheDocument();
    expect(screen.getByText('+15550001111')).toBeInTheDocument();
  });

  it('changing reply mode calls the client', async () => {
    api.setSmsReplyMode.mockResolvedValue({ backendUp: true, reply_mode: 'approval_required' } as never);
    render(<SmsPanel />);
    await screen.findByText('Ready to send');
    fireEvent.change(screen.getByTestId('sms-reply-mode'), { target: { value: 'approval_required' } });
    await waitFor(() => expect(api.setSmsReplyMode).toHaveBeenCalledWith('approval_required'));
  });

  it('saving quiet hours sends the config', async () => {
    api.setSmsQuietHours.mockResolvedValue({ backendUp: true, quiet_hours: {} } as never);
    render(<SmsPanel />);
    await screen.findByText('Ready to send');
    fireEvent.change(screen.getByLabelText('Quiet hours start'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quiet hours' }));
    await waitFor(() => expect(api.setSmsQuietHours).toHaveBeenCalled());
    expect(api.setSmsQuietHours.mock.calls[0][0]).toMatchObject({ start_hour: 22 });
  });

  it('draft shows segment estimate; failed exposes retry', async () => {
    api.getSmsDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 's1', customer_number: '+15559990000', status: 'failed', text: 'hi', segments: 2, encoding: 'GSM-7' }] } as never);
    api.retrySmsDraft.mockResolvedValue({ backendUp: true } as never);
    render(<SmsPanel />);
    await screen.findByText('Failed');
    expect(screen.getByText(/2 seg/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry send/i }));
    await waitFor(() => expect(api.retrySmsDraft).toHaveBeenCalledWith('s1'));
  });

  it('delayed quiet-hours draft is labelled, not a fake success', async () => {
    api.getSmsDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 's2', customer_number: '+15559990000', status: 'delayed_quiet_hours', text: 'hi',
        delayed_until: '2026-08-17T08:00:00' }] } as never);
    render(<SmsPanel />);
    expect(await screen.findByText(/Delayed \(quiet hours\)/)).toBeInTheDocument();
  });

  it('offline state is honest', async () => {
    api.getSmsStatus.mockResolvedValue({ backendUp: false } as never);
    render(<SmsPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
