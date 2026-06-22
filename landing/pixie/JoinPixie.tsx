import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import './joinPixie.css';

interface JoinPixieProps {
  /** Override the trigger button label. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Shared "Join Pixie" CTA — a campaign-style shimmering gradient link that
 * navigates to the dedicated /join-pixie onboarding page. Styled via
 * joinPixie.css (jp-trigger).
 */
export function JoinPixie({ label = 'Join Pixie', size = 'lg', className = '' }: JoinPixieProps) {
  return (
    <Link href="/join-pixie" className={`jp-trigger jp-trigger--${size} ${className}`}>
      <span aria-hidden className="jp-trigger__shimmer" />
      <span className="jp-trigger__label">
        <Sparkles className={`jp-trigger__icon--${size}`} strokeWidth={2.5} />
        {label}
      </span>
    </Link>
  );
}
