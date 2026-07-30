import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    listOutboundCampaigns: vi.fn(),
    getOutboundCampaign: vi.fn(),
    getOutboundAnalytics: vi.fn(),
    createOutboundCampaign: vi.fn(),
    outboundCampaignAction: vi.fn(),
  },
}));

import CampaignsPanel from './CampaignsPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.listOutboundCampaigns.mockResolvedValue({ backendUp: true, feature_enabled: true, send_enabled: false,
    campaigns: [{ id: 'cmp1', name: 'Reminders', purpose: 'support', status: 'draft', channels: ['sms'] }] } as never);
  api.getOutboundCampaign.mockResolvedValue({ backendUp: true, approval_valid: false,
    campaign: { id: 'cmp1', name: 'Reminders', status: 'draft' },
    steps: [{ id: 's1', order: 0, channel: 'sms' }], content: [{ id: 'c1', channel: 'sms' }] } as never);
  api.getOutboundAnalytics.mockResolvedValue({ backendUp: true,
    analytics: { audience: 0, eligible: 0, sent: 0, replied: 0, conversions: 0, opted_out: 0 } } as never);
});

describe('CampaignsPanel', () => {
  it('lists campaigns and shows send-off default', async () => {
    render(<CampaignsPanel />);
    expect(await screen.findByText('Reminders')).toBeInTheDocument();
    expect(screen.getByText(/send off/)).toBeInTheDocument();
  });

  it('shows a disabled banner when the feature is off', async () => {
    api.listOutboundCampaigns.mockResolvedValue({ backendUp: true, feature_enabled: false, send_enabled: false, campaigns: [] } as never);
    render(<CampaignsPanel />);
    await waitFor(() => expect(screen.getByText(/Campaigns are disabled/)).toBeInTheDocument());
  });

  it('creating a campaign calls the client with purpose + channel', async () => {
    api.createOutboundCampaign.mockResolvedValue({ backendUp: true, campaign: { id: 'cmp2', name: 'X' } } as never);
    render(<CampaignsPanel />);
    await screen.findByText('Reminders');
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'New' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));
    await waitFor(() => expect(api.createOutboundCampaign).toHaveBeenCalledWith({ name: 'New', purpose: 'support', channels: ['sms'] }));
  });

  it('opening a campaign shows lifecycle actions; Start disabled without valid approval', async () => {
    render(<CampaignsPanel />);
    fireEvent.click(await screen.findByText('Reminders'));
    await screen.findByText(/Campaign — Reminders/);
    expect((screen.getByRole('button', { name: /Start/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('approve action calls the client', async () => {
    api.outboundCampaignAction.mockResolvedValue({ backendUp: true, status: 'approved' } as never);
    render(<CampaignsPanel />);
    fireEvent.click(await screen.findByText('Reminders'));
    await screen.findByText(/Campaign — Reminders/);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    await waitFor(() => expect(api.outboundCampaignAction).toHaveBeenCalledWith('cmp1', 'approve'));
  });

  it('offline state is honest', async () => {
    api.listOutboundCampaigns.mockResolvedValue({ backendUp: false } as never);
    render(<CampaignsPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
