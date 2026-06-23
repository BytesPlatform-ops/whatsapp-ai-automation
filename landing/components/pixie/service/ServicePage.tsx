'use client';

import { useCallback, useRef } from 'react';
import type { ServiceConfig } from '@/lib/pixieServices';
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

  const scrollToSetup = useCallback(() => {
    const el = setupRef.current ?? document.getElementById('setup');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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
      />
    </ServicePageLayout>
  );
}
