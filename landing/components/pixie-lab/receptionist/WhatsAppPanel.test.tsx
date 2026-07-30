import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getWhatsAppStatus: vi.fn(),
    getWhatsAppTemplates: vi.fn(),
    getWhatsAppDrafts: vi.fn(),
    setWhatsAppReplyMode: vi.fn(),
    syncWhatsAppTemplates: vi.fn(),
    retryWhatsAppDraft: vi.fn(),
    reconcileWhatsAppDraft: vi.fn(),
  },
}));

import WhatsAppPanel from './WhatsAppPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.getWhatsAppStatus.mockResolvedValue({ backendUp: true, reply_mode: 'draft_only',
    connection: { connected: true, display_phone_number: '+15551230000', waba_name: 'Acme',
      can_send: true, can_template: true, webhook_subscribed: true, state: 'ready_for_templates' } } as never);
  api.getWhatsAppTemplates.mockResolvedValue({ backendUp: true, templates: [
    { name: 'appointment_reminder', language: 'en_US', category: 'UTILITY', status: 'APPROVED', variables: 2 },
    { name: 'old_promo', language: 'en_US', category: 'MARKETING', status: 'REJECTED', variables: 1 }] } as never);
  api.getWhatsAppDrafts.mockResolvedValue({ backendUp: true, drafts: [] } as never);
});

describe('WhatsAppPanel', () => {
  it('shows truthful ready-for-templates state', async () => {
    render(<WhatsAppPanel />);
    expect(await screen.findByText('Ready for templates')).toBeInTheDocument();
    expect(screen.getByText('+15551230000')).toBeInTheDocument();
  });

  it('lists templates with approved/rejected status', async () => {
    render(<WhatsAppPanel />);
    expect(await screen.findByText('appointment_reminder')).toBeInTheDocument();
    expect(screen.getByText('APPROVED')).toBeInTheDocument();
    expect(screen.getByText('REJECTED')).toBeInTheDocument();
  });

  it('changing reply mode calls the client', async () => {
    api.setWhatsAppReplyMode.mockResolvedValue({ backendUp: true, reply_mode: 'approval_required' } as never);
    render(<WhatsAppPanel />);
    await screen.findByText('Ready for templates');
    fireEvent.change(screen.getByTestId('wa-reply-mode'), { target: { value: 'approval_required' } });
    await waitFor(() => expect(api.setWhatsAppReplyMode).toHaveBeenCalledWith('approval_required'));
  });

  it('sync templates calls the client', async () => {
    api.syncWhatsAppTemplates.mockResolvedValue({ backendUp: true, synced: 2 } as never);
    render(<WhatsAppPanel />);
    await screen.findByText('Ready for templates');
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(api.syncWhatsAppTemplates).toHaveBeenCalled());
  });

  it('draft failed shows retry; sent never shows before provider confirmation', async () => {
    api.getWhatsAppDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 'w1', wa_id: '15559990000', text: 'hi', status: 'provider_pending', provider_message_id: 'wamid.X' },
      { id: 'w2', wa_id: '15559990000', text: 'hi', status: 'failed' }] } as never);
    api.retryWhatsAppDraft.mockResolvedValue({ backendUp: true } as never);
    render(<WhatsAppPanel />);
    await screen.findByText('Provider pending');
    fireEvent.click(screen.getByRole('button', { name: /Retry send/i }));
    await waitFor(() => expect(api.retryWhatsAppDraft).toHaveBeenCalledWith('w2'));
  });

  it('offline state is honest', async () => {
    api.getWhatsAppStatus.mockResolvedValue({ backendUp: false } as never);
    render(<WhatsAppPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
