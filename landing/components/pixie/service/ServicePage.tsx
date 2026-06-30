'use client';

import { useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ServiceConfig } from '@/lib/pixieServices';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { agentDashboardPath } from '@/lib/agents/agentRouting';
import { ServicePageLayout } from './ServicePageLayout';
import { ServiceHero } from './ServiceHero';
import { BigTextReveal } from './BigTextReveal';
import { ProblemTicker } from './ProblemTicker';
import { StoryCardGrid } from './StoryCardGrid';
import { RequirementsCards } from './RequirementsCards';
import { SetupRequestForm } from './SetupRequestForm';
import { ServiceFinalCTA } from './ServiceFinalCTA';

/**
 * ServicePage — composes one Pixie product page from a ServiceConfig in the
 * shared section order: hero → avatar morph → big text → ticker → story cards →
 * requirements → setup (package + add-ons + form) → final CTA. Content differs
 * per service; structure is reused. Each page renders this with its own config.
 */
export function ServicePage({ config }: { config: ServiceConfig }) {
  const setupRef = useRef<HTMLElement>(null);
  const router = useRouter();

  // Primary CTA → the Pixie account journey, preserving this agent.
  // Not signed in → /signup?agent=…  ·  unverified → /verify-email  ·  verified → dashboard.
  const startAgent = useCallback(async () => {
    const slug = config.slug;
    const redirect = agentDashboardPath(slug);
    const toSignup = () => router.push(`/signup?agent=${encodeURIComponent(slug)}&redirect=${encodeURIComponent(redirect)}`);
    if (!supabaseConfigured()) return toSignup();
    try {
      const { data } = await createClient().auth.getUser();
      const user = data.user;
      if (!user) toSignup();
      else if (!user.email_confirmed_at) router.push(`/verify-email?agent=${encodeURIComponent(slug)}`);
      else router.push(redirect);
    } catch {
      toSignup();
    }
  }, [config.slug, router]);

  const scrollToSetup = startAgent;

  const scrollToHow = useCallback(() => {
    document.getElementById('how')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <ServicePageLayout
      accent={config.accent}
      soft={config.soft}
      serviceLabel={config.serviceLabel}
      stickyCtaLabel="Start My Setup"
      onStickyCta={scrollToSetup}
    >
      <ServiceHero
        eyebrow={config.eyebrow}
        headline={config.headline}
        sub={config.sub}
        primaryCta={config.primaryCta}
        secondaryCta={config.secondaryCta}
        avatar={config.avatarForm}
        serviceLabel={config.serviceLabel}
        onPrimary={scrollToSetup}
        onSecondary={scrollToHow}
      />

      <BigTextReveal lines={config.bigTextLines} reveal={config.bigTextReveal} />

      <ProblemTicker items={config.ticker} />

      <StoryCardGrid eyebrow="WHAT PIXIE DOES" title={`What Pixie does for your ${config.serviceLabel.toLowerCase()}`} cards={config.storyCards} />

      <RequirementsCards items={config.requirements} />

      <ProblemTicker items={config.ticker} reverse durationSec={34} />

      <SetupRequestForm ref={setupRef} config={config} />

      <ServiceFinalCTA
        headline={config.bigTextReveal}
        ctaLabel={config.primaryCta}
        onPrimary={scrollToSetup}
        related={config.related}
        avatar={config.avatarForm}
        serviceLabel={config.serviceLabel}
      />
    </ServicePageLayout>
  );
}
