import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const postCheckout = vi.fn();
const postPortal = vi.fn();

vi.mock('@/lib/pixie-lab/billingClient', () => ({
  postCheckout: (...a: unknown[]) => postCheckout(...a),
  postPortal: (...a: unknown[]) => postPortal(...a),
}));

import { InsufficientCreditsNotice } from './InsufficientCreditsNotice';
import type { BillingErrorCode } from '@/lib/pixie-lab/billingClient';

beforeEach(() => {
  postCheckout.mockResolvedValue({ ok: true, data: { url: 'https://checkout.stripe.com/test' } });
  postPortal.mockResolvedValue({ ok: true, data: { url: 'https://billing.stripe.com/test' } });
});

describe('InsufficientCreditsNotice', () => {
  it('shows a specific message for insufficient_credits', () => {
    render(<InsufficientCreditsNotice code="insufficient_credits" />);
    expect(screen.getByText('Not enough credits')).toBeInTheDocument();
    expect(screen.getByText(/does not have enough credits/i)).toBeInTheDocument();
  });

  it('shows a specific message for feature_not_entitled', () => {
    render(<InsufficientCreditsNotice code="feature_not_entitled" />);
    expect(screen.getByText('Feature not included in your plan')).toBeInTheDocument();
    expect(screen.getByText(/not available on your current plan/i)).toBeInTheDocument();
  });

  it('shows a specific message for usage_limit_reached', () => {
    render(<InsufficientCreditsNotice code="usage_limit_reached" />);
    expect(screen.getByText('Usage limit reached')).toBeInTheDocument();
    expect(screen.getByText(/reached the usage limit/i)).toBeInTheDocument();
  });

  it('shows a specific message for plan_inactive', () => {
    render(<InsufficientCreditsNotice code="plan_inactive" />);
    expect(screen.getByText('Plan inactive')).toBeInTheDocument();
    expect(screen.getByText(/subscription is no longer active/i)).toBeInTheDocument();
  });

  it('shows a specific message for billing_past_due', () => {
    render(<InsufficientCreditsNotice code="billing_past_due" />);
    expect(screen.getByText('Payment past due')).toBeInTheDocument();
    expect(screen.getByText(/past-due payment/i)).toBeInTheDocument();
  });

  it('shows a specific message for payment_required', () => {
    render(<InsufficientCreditsNotice code="payment_required" />);
    expect(screen.getByText('Payment required')).toBeInTheDocument();
    expect(screen.getByText(/valid payment method/i)).toBeInTheDocument();
  });

  it('shows the Upgrade action for insufficient_credits', () => {
    render(<InsufficientCreditsNotice code="insufficient_credits" />);
    expect(screen.getByRole('button', { name: /Upgrade plan/i })).toBeInTheDocument();
  });

  it('shows the Manage billing action for insufficient_credits', () => {
    render(<InsufficientCreditsNotice code="insufficient_credits" />);
    expect(screen.getByRole('button', { name: /Manage billing/i })).toBeInTheDocument();
  });

  it('does NOT show Upgrade for plan_inactive (only portal)', () => {
    render(<InsufficientCreditsNotice code="plan_inactive" />);
    expect(screen.queryByRole('button', { name: /Upgrade plan/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Manage billing/i })).toBeInTheDocument();
  });

  it('calls postCheckout when Upgrade is clicked', async () => {
    // jsdom navigation shim
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
    render(<InsufficientCreditsNotice code="insufficient_credits" planId="pro" />);
    fireEvent.click(screen.getByRole('button', { name: /Upgrade plan/i }));
    await waitFor(() => expect(postCheckout).toHaveBeenCalledWith('pro'));
  });

  it('calls postPortal when Manage billing is clicked', async () => {
    Object.defineProperty(window, 'location', { writable: true, value: { href: '' } });
    render(<InsufficientCreditsNotice code="billing_past_due" />);
    fireEvent.click(screen.getByRole('button', { name: /Manage billing/i }));
    await waitFor(() => expect(postPortal).toHaveBeenCalled());
  });

  it('shows available and required credit context when provided', () => {
    render(
      <InsufficientCreditsNotice
        code="insufficient_credits"
        detail={{ available_mc: 500, required_mc: 2000 }}
      />,
    );
    expect(screen.getByText(/Available:/i)).toBeInTheDocument();
    expect(screen.getByText(/Required:/i)).toBeInTheDocument();
  });

  it('shows usage context (used/limit) when detail provides them', () => {
    render(
      <InsufficientCreditsNotice
        code="usage_limit_reached"
        detail={{ used: 50, limit: 50, limit_key: 'content_generations' }}
      />,
    );
    expect(screen.getByText(/Used/i)).toBeInTheDocument();
    // The text "of" should be in a sentence about "Used X of Y"
    expect(screen.getByText(/content_generations/)).toBeInTheDocument();
  });

  it('does not say "Something went wrong" for any error code', () => {
    const codes: BillingErrorCode[] = [
      'insufficient_credits',
      'feature_not_entitled',
      'usage_limit_reached',
      'plan_inactive',
      'billing_past_due',
      'payment_required',
    ];
    for (const code of codes) {
      const { unmount } = render(<InsufficientCreditsNotice code={code} />);
      expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it('has role="alert" for screen-reader announcement', () => {
    render(<InsufficientCreditsNotice code="billing_past_due" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
