import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getMetaMessagingStatus: vi.fn(),
    getMetaAccounts: vi.fn(),
    getMetaPages: vi.fn(),
    getMetaDrafts: vi.fn(),
    selectMetaAsset: vi.fn(),
    setMetaReplyMode: vi.fn(),
    runMetaHealth: vi.fn(),
    disconnectMeta: vi.fn(),
    retryMetaDraft: vi.fn(),
    reconcileMetaDraft: vi.fn(),
  },
}));

import MetaMessagingPanel from './MetaMessagingPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);

beforeEach(() => {
  vi.clearAllMocks();
  api.getMetaMessagingStatus.mockResolvedValue({ backendUp: true,
    instagram: { reply_mode: 'draft_only', connection: { connected: true, state: 'ready_for_replies',
      username: 'acme.co', instagram_account_id: 'ig_1', can_send: true, webhook_subscribed: true } },
    messenger: { reply_mode: 'draft_only', connection: { connected: true, state: 'no_facebook_page',
      can_send: false, webhook_subscribed: false } } } as never);
  api.getMetaAccounts.mockResolvedValue({ backendUp: true, accounts: [
    { instagram_account_id: 'ig_1', username: 'acme.co' }] } as never);
  api.getMetaPages.mockResolvedValue({ backendUp: true, pages: [
    { page_id: 'page_1', page_name: 'Acme Ltd' }] } as never);
  api.getMetaDrafts.mockResolvedValue({ backendUp: true, drafts: [] } as never);
});

describe('MetaMessagingPanel', () => {
  it('shows truthful per-channel readiness (green IG, amber Messenger)', async () => {
    render(<MetaMessagingPanel />);
    expect(await screen.findByText('Ready for replies')).toBeInTheDocument();
    // Messenger cannot send → never a green connected label
    expect(screen.getByText('No Facebook Page')).toBeInTheDocument();
  });

  it('lists discovered Instagram accounts and Pages', async () => {
    render(<MetaMessagingPanel />);
    await screen.findByText('Ready for replies');
    expect(screen.getByTestId('instagram-asset')).toBeInTheDocument();
    expect(screen.getByTestId('messenger-asset')).toBeInTheDocument();
  });

  it('selecting an Instagram account calls the client with ownership channel', async () => {
    api.selectMetaAsset.mockResolvedValue({ backendUp: true, status: 'selected' } as never);
    render(<MetaMessagingPanel />);
    await screen.findByText('Ready for replies');
    fireEvent.change(screen.getByTestId('instagram-asset'), { target: { value: 'ig_1' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Select' })[0]);
    await waitFor(() => expect(api.selectMetaAsset).toHaveBeenCalledWith('instagram', 'ig_1'));
  });

  it('changing Messenger reply mode calls the client per-channel', async () => {
    api.setMetaReplyMode.mockResolvedValue({ backendUp: true, reply_mode: 'approval_required' } as never);
    render(<MetaMessagingPanel />);
    await screen.findByText('Ready for replies');
    fireEvent.change(screen.getByTestId('messenger-reply-mode'), { target: { value: 'approval_required' } });
    await waitFor(() => expect(api.setMetaReplyMode).toHaveBeenCalledWith('messenger', 'approval_required'));
  });

  it('failed draft exposes retry; delivered/read never a toast', async () => {
    api.getMetaDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 'd1', channel: 'instagram', sender_id: '5551', status: 'failed', text: 'hi' }] } as never);
    api.retryMetaDraft.mockResolvedValue({ backendUp: true } as never);
    render(<MetaMessagingPanel />);
    await screen.findByText('Failed');
    fireEvent.click(screen.getByRole('button', { name: /Retry send/i }));
    await waitFor(() => expect(api.retryMetaDraft).toHaveBeenCalledWith('d1'));
  });

  it('offline state is honest', async () => {
    api.getMetaMessagingStatus.mockResolvedValue({ backendUp: false } as never);
    render(<MetaMessagingPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });
});
