import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/pixie-lab/servicesClient', () => ({
  receptionistApi: {
    getCalendarBookings: vi.fn(),
    cancelCalendarBooking: vi.fn(),
    reconcileCalendarBooking: vi.fn(),
    getFollowUps: vi.fn(),
    getCalendarStatus: vi.fn(),
    saveCalendarConfig: vi.fn(),
    getCalendarAvailability: vi.fn(),
    getGmailDrafts: vi.fn(),
    retryGmailDraft: vi.fn(),
    reconcileGmailDraft: vi.fn(),
  },
}));

import BookingsPanel from './BookingsPanel';
import FollowUpsPanel from './FollowUpsPanel';
import CalendarConfigPanel from './CalendarConfigPanel';
import GmailDraftsPanel from './GmailDraftsPanel';
import { receptionistApi } from '@/lib/pixie-lab/servicesClient';

const api = vi.mocked(receptionistApi);
beforeEach(() => vi.clearAllMocks());

describe('BookingsPanel', () => {
  it('confirmed without provider event id shows "Provider pending" (never confirmed)', async () => {
    api.getCalendarBookings.mockResolvedValue({ backendUp: true, bookings: [
      { id: 'b1', name: 'Sam', service_type: 'consultation', status: 'confirmed', start: '2026-08-03T10:00:00Z', provider_event_id: '' },
      { id: 'b2', name: 'Al', service_type: 'consultation', status: 'confirmed', start: '2026-08-03T11:00:00Z', provider_event_id: 'evt1' },
    ] } as never);
    render(<BookingsPanel />);
    expect(await screen.findByText('Provider pending')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('cancel calls the client', async () => {
    api.getCalendarBookings.mockResolvedValue({ backendUp: true, bookings: [
      { id: 'b2', name: 'Al', status: 'confirmed', provider_event_id: 'evt1' }] } as never);
    api.cancelCalendarBooking.mockResolvedValue({ backendUp: true, status: 'cancelled' } as never);
    render(<BookingsPanel />);
    await screen.findByText('Al');
    fireEvent.click(screen.getByRole('button', { name: /Cancel booking/i }));
    await waitFor(() => expect(api.cancelCalendarBooking).toHaveBeenCalledWith('b2'));
  });
});

describe('FollowUpsPanel', () => {
  it('reminder never shows sent without provider confirmation', async () => {
    api.getFollowUps.mockResolvedValue({ backendUp: true, follow_ups: [],
      reminders: [{ id: 'r1', title: 'Appt', remind_at: '2026-08-02T10:00:00Z', channel: 'email', status: 'scheduled' }] } as never);
    render(<FollowUpsPanel />);
    expect(await screen.findByText('Appt')).toBeInTheDocument();
    expect(screen.getByText('scheduled')).toBeInTheDocument();
    expect(screen.queryByText('sent')).not.toBeInTheDocument();
  });
});

describe('CalendarConfigPanel', () => {
  beforeEach(() => {
    api.getCalendarStatus.mockResolvedValue({ backendUp: true, connection: { connected: true, can_write_events: true },
      configured: true, calendar_id: 'primary', timezone: 'UTC', services: { consultation: 30 } } as never);
  });
  it('shows ready-for-bookings and lists services', async () => {
    render(<CalendarConfigPanel />);
    expect(await screen.findByText('Ready for bookings')).toBeInTheDocument();
    expect(screen.getByText(/consultation · 30 min/i)).toBeInTheDocument();
  });
  it('adding a service saves via the client', async () => {
    api.saveCalendarConfig.mockResolvedValue({ backendUp: true, config: {} } as never);
    render(<CalendarConfigPanel />);
    await screen.findByText('Ready for bookings');
    fireEvent.change(screen.getByTestId('service-name'), { target: { value: 'Haircut' } });
    fireEvent.change(screen.getByTestId('service-duration'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/i }));
    await waitFor(() => expect(api.saveCalendarConfig).toHaveBeenCalledWith({ services: { consultation: 30, haircut: 45 } }));
  });
  it('availability preview shows provider-unavailable honestly', async () => {
    api.getCalendarAvailability.mockResolvedValue({ backendUp: true, status: 'provider_unavailable', slots: [] } as never);
    render(<CalendarConfigPanel />);
    await screen.findByText('Ready for bookings');
    fireEvent.click(screen.getByRole('button', { name: /Preview slots/i }));
    expect(await screen.findByText(/provider unavailable/i)).toBeInTheDocument();
  });
});

describe('GmailDraftsPanel', () => {
  it('sent without provider id shows "Provider pending", not "Sent"', async () => {
    api.getGmailDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 'd1', subject: 'Re: hours', to: 'a@x.com', status: 'sent', provider_message_id: '' }] } as never);
    render(<GmailDraftsPanel />);
    expect(await screen.findByText('Provider pending')).toBeInTheDocument();
    expect(screen.queryByText('Sent')).not.toBeInTheDocument();
  });
  it('retry failed send calls the client', async () => {
    api.getGmailDrafts.mockResolvedValue({ backendUp: true, drafts: [
      { id: 'd2', subject: 'Re', to: 'a@x.com', status: 'failed' }] } as never);
    api.retryGmailDraft.mockResolvedValue({ backendUp: true } as never);
    render(<GmailDraftsPanel />);
    await screen.findByText('Failed');
    fireEvent.click(screen.getByRole('button', { name: /Retry send/i }));
    await waitFor(() => expect(api.retryGmailDraft).toHaveBeenCalledWith('d2'));
  });
});
