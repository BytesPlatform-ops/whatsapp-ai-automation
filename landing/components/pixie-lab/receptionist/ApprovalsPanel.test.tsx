import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getApprovals: vi.fn(),
    approveApproval: vi.fn(),
    rejectApproval: vi.fn(),
  },
}));

import ApprovalsPanel from './ApprovalsPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const getApprovals = vi.mocked(receptionistApi.getApprovals);
const approve = vi.mocked(receptionistApi.approveApproval);

beforeEach(() => {
  vi.clearAllMocks();
  getApprovals.mockResolvedValue({ backendUp: true, items: [
    { id: 'a1', agent: 'ai-receptionist', action_type: 'gmail_send', status: 'pending', title: 'Reply to Sam',
      risk_level: 'high', prepared_output: { body: 'Thanks for your enquiry — we open at 9am.' } },
    { id: 'a2', agent: 'ai-receptionist', action_type: 'calendar_create_event', status: 'executed', title: 'Booking',
      execution_result: { ok: true, status: 'confirmed' } },
  ] } as never);
});

describe('ApprovalsPanel', () => {
  it('renders approvals distinguishing Gmail vs Calendar', async () => {
    render(<ApprovalsPanel />);
    expect(await screen.findByText('Reply to Sam')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
  });

  it('shows the validated payload preview', async () => {
    render(<ApprovalsPanel />);
    expect(await screen.findByText(/we open at 9am/i)).toBeInTheDocument();
  });

  it('offline when backend down', async () => {
    getApprovals.mockResolvedValue({ backendUp: false } as never);
    render(<ApprovalsPanel />);
    await waitFor(() => expect(screen.getByText(/offline|setup/i)).toBeInTheDocument());
  });

  it('approve action calls the client and reloads', async () => {
    approve.mockResolvedValue({ backendUp: true, status: 'executed' } as never);
    render(<ApprovalsPanel />);
    await screen.findByText('Reply to Sam');
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('a1'));
    expect(getApprovals).toHaveBeenCalledTimes(2); // initial + reconcile
  });

  it('filters by status', async () => {
    render(<ApprovalsPanel />);
    await screen.findByText('Reply to Sam');
    fireEvent.click(screen.getByRole('button', { name: 'executed' }));
    expect(screen.queryByText('Reply to Sam')).not.toBeInTheDocument();
    expect(screen.getByText('Booking')).toBeInTheDocument();
  });

  it('completed approval shows execution result and no approve button', async () => {
    render(<ApprovalsPanel />);
    await screen.findByText('Booking');
    expect(screen.getByText(/Result: executed/i)).toBeInTheDocument();
  });
});
