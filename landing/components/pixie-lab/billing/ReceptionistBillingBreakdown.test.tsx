import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: { getUsage: vi.fn(), getLimits: vi.fn() },
}));

import { ReceptionistBillingBreakdown } from './ReceptionistBillingBreakdown';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const getUsage = vi.mocked(receptionistApi.getUsage);
const getLimits = vi.mocked(receptionistApi.getLimits);

beforeEach(() => {
  vi.clearAllMocks();
  getLimits.mockResolvedValue({ backendUp: true, limits: { knowledge_source: { limit: 3 } } } as never);
});

describe('ReceptionistBillingBreakdown', () => {
  it('renders provider counters from real usage', async () => {
    getUsage.mockResolvedValue({ backendUp: true,
      period: { start: '2026-07-01T00:00:00', end: '2026-07-31T00:00:00', fallback: false },
      counters: { monthly_conversations: 12, gmail_replies: 4, bookings: 2, calendar_operations: 5,
        whatsapp_inbound: 9, whatsapp_freeform: 3, instagram_inbound: 6, messenger_reply: 2 },
      gauges: { stored_contacts: 7, knowledge_sources: 1 } } as never);
    render(<ReceptionistBillingBreakdown />);
    expect(await screen.findByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('Messenger')).toBeInTheDocument();
    expect(screen.getByText('Bookings')).toBeInTheDocument();
    // real values shown
    expect(screen.getByText('Replies sent').closest('div')?.textContent).toContain('4');
    expect(screen.getByText('Inbound DMs').closest('div')?.textContent).toContain('6');
  });

  it('empty usage shows zero, not sample data', async () => {
    getUsage.mockResolvedValue({ backendUp: true, counters: {}, gauges: {} } as never);
    render(<ReceptionistBillingBreakdown />);
    await screen.findByText('Provider usage');
    // the AI turns row should read 0 (no sample data)
    const row = screen.getByText('AI turns').closest('div');
    expect(row?.textContent).toContain('0');
  });

  it('offline state is honest', async () => {
    getUsage.mockResolvedValue({ backendUp: false } as never);
    render(<ReceptionistBillingBreakdown />);
    await waitFor(() => expect(screen.getByText(/unavailable/i)).toBeInTheDocument());
  });

  it('never renders customer message content', async () => {
    getUsage.mockResolvedValue({ backendUp: true, counters: { gmail_replies: 1 }, gauges: {} } as never);
    const { container } = render(<ReceptionistBillingBreakdown />);
    await screen.findByText('Provider usage');
    // only labels + numbers — no free-form body text keys
    expect(container.textContent).not.toMatch(/body|message_text|subject:/i);
  });
});
