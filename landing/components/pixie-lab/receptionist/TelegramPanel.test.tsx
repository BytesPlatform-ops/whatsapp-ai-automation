import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getTelegramStatus: vi.fn(),
    getTelegramDrafts: vi.fn(),
    connectTelegram: vi.fn(),
    configureTelegramWebhook: vi.fn(),
    setTelegramReplyMode: vi.fn(),
    setTelegramMode: vi.fn(),
    runTelegramHealth: vi.fn(),
    disconnectTelegram: vi.fn(),
    retryTelegramDraft: vi.fn(),
    reconcileTelegramDraft: vi.fn(),
  },
}));

import TelegramPanel from './TelegramPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

function connected(extra: Record<string, unknown> = {}) {
  return { backendUp: true, reply_mode: 'draft_only', business_reply_mode: 'draft_only',
    connection: { connected: true, state: 'standard_bot_ready', bot_username: 'acme_bot', bot_id: '111',
      webhook_subscribed: true, allowed_updates: ['message'], business_enabled: false,
      business: { state: 'business_mode_unavailable' }, ...extra } };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getTelegramStatus.mockResolvedValue(connected() as never);
  api.getTelegramDrafts.mockResolvedValue({ backendUp: true, drafts: [] } as never);
});

describe('TelegramPanel', () => {
  it('shows truthful standard-bot-ready state', async () => {
    render(<TelegramPanel />);
    expect(await screen.findByText('Standard bot ready')).toBeInTheDocument();
    expect(screen.getByText('@acme_bot')).toBeInTheDocument();
  });

  it('offers a token connect flow when not connected', async () => {
    api.getTelegramStatus.mockResolvedValue({ backendUp: true,
      connection: { connected: false, state: 'not_connected', business: { state: 'not_connected' } } } as never);
    api.connectTelegram.mockResolvedValue({ backendUp: true, status: 'connected', bot: { bot_username: 'acme_bot' } } as never);
    render(<TelegramPanel />);
    const input = await screen.findByLabelText('Telegram bot token');
    fireEvent.change(input, { target: { value: '123:ABC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(api.connectTelegram).toHaveBeenCalledWith('123:ABC'));
  });

  it('changing bot reply mode calls the client with mode=bot', async () => {
    api.setTelegramReplyMode.mockResolvedValue({ backendUp: true, reply_mode: 'approval_required' } as never);
    render(<TelegramPanel />);
    await screen.findByText('Standard bot ready');
    fireEvent.change(screen.getByTestId('tg-bot-reply-mode'), { target: { value: 'approval_required' } });
    await waitFor(() => expect(api.setTelegramReplyMode).toHaveBeenCalledWith('bot', 'approval_required'));
  });

  it('enabling business mode calls setTelegramMode', async () => {
    api.setTelegramMode.mockResolvedValue({ backendUp: true, connection: {} } as never);
    render(<TelegramPanel />);
    await screen.findByText('Standard bot ready');
    fireEvent.click(screen.getByTestId('tg-business-enabled'));
    await waitFor(() => expect(api.setTelegramMode).toHaveBeenCalledWith({ business: true }));
  });

  it('failed draft exposes retry; provider-confirmed never claims delivered', async () => {
    api.getTelegramDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 't1', mode: 'bot', chat_id: '900', status: 'provider_pending', text: 'hi' },
      { id: 't2', mode: 'business', chat_id: '901', status: 'failed', text: 'hi' }] } as never);
    api.retryTelegramDraft.mockResolvedValue({ backendUp: true } as never);
    render(<TelegramPanel />);
    expect(await screen.findByText('Provider confirmed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Retry send/i }));
    await waitFor(() => expect(api.retryTelegramDraft).toHaveBeenCalledWith('t2'));
  });

  it('offline state is honest', async () => {
    api.getTelegramStatus.mockResolvedValue({ backendUp: false } as never);
    render(<TelegramPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
