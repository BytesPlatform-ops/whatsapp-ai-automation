import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getGmailStatus: vi.fn(),
    getCalendarStatus: vi.fn(),
    setGmailReplyMode: vi.fn(),
    startGmailSync: vi.fn(),
    getAnalyticsRange: vi.fn(),
    getWidgetConfig: vi.fn(),
    saveWidgetConfig: vi.fn(),
    getWidgetVerification: vi.fn(),
    verifyWidget: vi.fn(),
  },
}));

import ProvidersPanel from './ProvidersPanel';
import AnalyticsRangePanel from './AnalyticsRangePanel';
import WidgetSetupPanel from './WidgetSetupPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const g = vi.mocked(receptionistApi.getGmailStatus);
const c = vi.mocked(receptionistApi.getCalendarStatus);
const setMode = vi.mocked(receptionistApi.setGmailReplyMode);
const analytics = vi.mocked(receptionistApi.getAnalyticsRange);
const getWidget = vi.mocked(receptionistApi.getWidgetConfig);
const saveWidget = vi.mocked(receptionistApi.saveWidgetConfig);

beforeEach(() => vi.clearAllMocks());

describe('ProvidersPanel', () => {
  beforeEach(() => {
    g.mockResolvedValue({ backendUp: true, connection: { connected: true, email: 'biz@x.com', can_read: true, can_draft: true, can_send: true }, reply_mode: 'draft_only' } as never);
    c.mockResolvedValue({ backendUp: true, connection: { connected: true, can_read_freebusy: true, can_write_events: true }, configured: true, calendar_id: 'primary', timezone: 'UTC', services: { consultation: 30 } } as never);
  });

  it('shows truthful Gmail send-ready + Calendar bookings-ready states', async () => {
    render(<ProvidersPanel />);
    expect(await screen.findByText('Ready for approval sends')).toBeInTheDocument();
    expect(screen.getByText('Ready for bookings')).toBeInTheDocument();
  });

  it('read-only Gmail does not show a green connected state', async () => {
    g.mockResolvedValue({ backendUp: true, connection: { connected: true, can_read: true, can_draft: false, can_send: false } } as never);
    render(<ProvidersPanel />);
    expect(await screen.findByText('Read only')).toBeInTheDocument();
    expect(screen.queryByText('Ready for approval sends')).not.toBeInTheDocument();
  });

  it('changing reply mode calls the client', async () => {
    setMode.mockResolvedValue({ backendUp: true, reply_mode: 'approval_required' } as never);
    render(<ProvidersPanel />);
    await screen.findByText('Ready for approval sends');
    fireEvent.change(screen.getByTestId('reply-mode'), { target: { value: 'approval_required' } });
    await waitFor(() => expect(setMode).toHaveBeenCalledWith('approval_required'));
  });
});

describe('AnalyticsRangePanel', () => {
  it('renders provider metric cards and switches preset', async () => {
    analytics.mockResolvedValue({ backendUp: true, range: { start: '2026-07-01', end: '2026-07-31', preset: '30d' },
      generated_at: '2026-07-31T00:00:00', metrics: { conversations: 5, ai_messages: 4, escalations: 1 } } as never);
    render(<AnalyticsRangePanel />);
    expect(await screen.findByText('Conversations')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(analytics).toHaveBeenCalledWith('7d'));
  });

  it('empty range shows an honest zero state', async () => {
    analytics.mockResolvedValue({ backendUp: true, range: { preset: 'today' }, metrics: { conversations: 0 } } as never);
    render(<AnalyticsRangePanel />);
    expect(await screen.findByText(/No activity in this range/i)).toBeInTheDocument();
  });
});

describe('WidgetSetupPanel', () => {
  beforeEach(() => {
    getWidget.mockResolvedValue({ backendUp: true, config: { public_id: 'wdg_abc', enabled: true, allowed_domains: ['shop.example'] } } as never);
    vi.mocked(receptionistApi.getWidgetVerification).mockResolvedValue({ backendUp: true, installed: false, domains: [] } as never);
  });

  it('embed uses only the public id (never the tenant)', async () => {
    render(<WidgetSetupPanel />);
    const embed = await screen.findByTestId('embed-code');
    expect(embed.textContent).toContain('wdg_abc');
    expect(embed.textContent).not.toMatch(/tenant|t_a/);
  });

  it('adding an invalid domain is rejected', async () => {
    render(<WidgetSetupPanel />);
    await screen.findByTestId('public-id');
    fireEvent.change(screen.getByTestId('domain-input'), { target: { value: 'not a domain' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(saveWidget).not.toHaveBeenCalled();
  });

  it('adding a valid domain saves', async () => {
    saveWidget.mockResolvedValue({ backendUp: true, config: { public_id: 'wdg_abc', allowed_domains: ['shop.example', 'app.example'] } } as never);
    render(<WidgetSetupPanel />);
    await screen.findByTestId('public-id');
    fireEvent.change(screen.getByTestId('domain-input'), { target: { value: 'app.example' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/i }));
    await waitFor(() => expect(saveWidget).toHaveBeenCalled());
  });
});
