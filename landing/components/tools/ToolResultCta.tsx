import { WhatsAppButton } from '@/components/WhatsAppButton';
import { Sparkles } from 'lucide-react';

interface ToolResultCtaProps {
  headline: string;
  subhead: string;
  prefill: string;
}

// Renders inside an existing tool's gradient result card, after the result data.
// Visually a continuation of the result block: subtle top divider, then headline
// + subhead + WhatsApp CTA button. Mobile-stacks; desktop puts button right.
export function ToolResultCta({ headline, subhead, prefill }: ToolResultCtaProps) {
  return (
    <div className="mt-6 border-t border-wa-green/25 pt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-wa-teal" aria-hidden />
          <div>
            <div className="font-display text-base font-bold text-ink-900">{headline}</div>
            <div className="mt-0.5 text-sm text-ink-500">{subhead}</div>
          </div>
        </div>
        <WhatsAppButton
          size="md"
          variant="solid"
          label="Continue on WhatsApp"
          prefill={prefill}
          className="shrink-0"
        />
      </div>
    </div>
  );
}
