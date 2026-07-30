import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getVoiceStatus: vi.fn(),
    getVoiceNumbers: vi.fn(),
    getVoiceCalls: vi.fn(),
    connectVoice: vi.fn(),
    setVoiceSettings: vi.fn(),
    startVoiceOutbound: vi.fn(),
    reconcileVoiceCall: vi.fn(),
    runVoiceHealth: vi.fn(),
    disconnectVoice: vi.fn(),
  },
}));

import VoicePanel from './VoicePanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

function status(extra: Record<string, unknown> = {}) {
  return { backendUp: true, inbound_enabled: true, outbound_enabled: false,
    recording_policy: { mode: 'no_recording', enabled: false }, transfer_destinations: [],
    connection: { connected: true, state: 'ready_for_inbound', account_id: 'org_1',
      inbound_enabled: true, outbound_enabled: false, recording_enabled: false, server_auth: true, ...extra } };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getVoiceStatus.mockResolvedValue(status() as never);
  api.getVoiceNumbers.mockResolvedValue({ backendUp: true, numbers: [
    { phone_number_id: 'pn_v1', number: '+15550009999', source: 'vapi', inbound_capable: true, outbound_capable: true }] } as never);
  api.getVoiceCalls.mockResolvedValue({ backendUp: true, calls: [] } as never);
});

describe('VoicePanel', () => {
  it('shows truthful ready-for-inbound state and recording off', async () => {
    render(<VoicePanel />);
    expect(await screen.findByText('Ready for inbound')).toBeInTheDocument();
    expect(screen.getAllByText(/recording: off/).length).toBeGreaterThan(0);
  });

  it('lists phone numbers', async () => {
    render(<VoicePanel />);
    await screen.findByText('Ready for inbound');
    expect(screen.getByText('+15550009999')).toBeInTheDocument();
  });

  it('outbound call UI is hidden until outbound enabled', async () => {
    render(<VoicePanel />);
    await screen.findByText('Ready for inbound');
    expect(screen.queryByLabelText('Outbound number')).toBeNull();
  });

  it('enabling outbound calls the settings client', async () => {
    api.setVoiceSettings.mockResolvedValue({ backendUp: true, connection: {} } as never);
    render(<VoicePanel />);
    await screen.findByText('Ready for inbound');
    fireEvent.click(screen.getByTestId('voice-outbound-toggle'));
    await waitFor(() => expect(api.setVoiceSettings).toHaveBeenCalledWith({ outbound: true }));
  });

  it('honest call statuses; queued never shown as completed', async () => {
    api.getVoiceCalls.mockResolvedValue({ backendUp: true, calls: [
      { call_id: 'c1', direction: 'outbound', recipient_number: '+15559990000', status: 'queued', created_at: '2026-08-31T10:00:00' },
      { call_id: 'c2', direction: 'inbound', caller_number: '+15551112222', status: 'no_answer', ended_reason: 'customer-did-not-answer', created_at: '2026-08-31T09:00:00' }] } as never);
    render(<VoicePanel />);
    expect(await screen.findByText('queued')).toBeInTheDocument();
    expect(screen.getByText('no answer')).toBeInTheDocument();
    expect(screen.queryByText('completed')).toBeNull();
  });

  it('connect flow requires an api key', async () => {
    api.getVoiceStatus.mockResolvedValue({ backendUp: true, connection: { connected: false, state: 'not_connected' } } as never);
    api.connectVoice.mockResolvedValue({ backendUp: true, status: 'connected', account_id: 'org_1' } as never);
    render(<VoicePanel />);
    const key = await screen.findByLabelText('Vapi API key');
    fireEvent.change(key, { target: { value: 'vapi-abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(api.connectVoice).toHaveBeenCalledWith('vapi-abc', ''));
  });

  it('offline state is honest', async () => {
    api.getVoiceStatus.mockResolvedValue({ backendUp: false } as never);
    render(<VoicePanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
