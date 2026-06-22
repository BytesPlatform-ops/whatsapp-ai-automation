'use client';

import { forwardRef } from 'react';
import { hexToRgbString, getReadableButtonText } from '../../mascot-role-hero/colorUtils';
import { type MobileRole } from './mobileContent';
import { entranceVars } from './mobileMotion';
import { MobileRoleMicroEffects } from './MobileRoleMicroEffects';

/**
 * MobileRoleScene — one full-screen, role-coloured Pixie scene. Self-themed via
 * inline `--accent*` vars (so each scene shows its own colour as you scroll).
 * Entrance is driven by the `.in-view` class (added by the orchestrator's
 * IntersectionObserver, once): children with `.m-reveal` stagger up, the avatar
 * floats in, and a one-shot scan-ring flashes. Idle bob + aura breathe via CSS.
 * All motion is disabled under prefers-reduced-motion (globals.css).
 */
export const MobileRoleScene = forwardRef<HTMLElement, { role: MobileRole; index: number }>(
  function MobileRoleScene({ role, index }, ref) {
    const vars = {
      ['--accent']: role.accent,
      ['--accent-soft']: role.soft,
      ['--accent-rgb']: hexToRgbString(role.accent),
      ['--button-text']: getReadableButtonText(role.accent),
      ['--accent-glow']: `color-mix(in srgb, ${role.accent} 45%, transparent)`,
      ['--accent-glow-soft']: `color-mix(in srgb, ${role.soft} 30%, transparent)`,
    } as React.CSSProperties;

    let d = 220; // reveal delay cursor (ms)
    const next = (step: number) => {
      const cur = d;
      d += step;
      return `${cur}ms`;
    };

    return (
      <section ref={ref} data-idx={index} id={`m-${role.id}`} className="m-scene" style={vars} aria-label={`Pixie — ${role.label}`}>
        <div className="m-scene-grad" aria-hidden />

        <div className="m-scene-content">
          {/* Badge */}
          <div className="flex justify-center">
            <span className="m-badge m-reveal" style={{ animationDelay: '120ms' }}>{role.badge}</span>
          </div>

          {/* Avatar stage */}
          <div className="m-avatar-stage">
            <div className="m-aura" aria-hidden />
            <MobileRoleMicroEffects roleId={role.id} />
            <div className="m-scan" aria-hidden />
            <div className="m-avatar-entrance" style={entranceVars(role.id)}>
              <div className="m-bob">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={role.image} alt={`Pixie AI assistant in ${role.label} form`} className="m-avatar-img" draggable={false} />
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="m-copy">
            <h2 className="m-heading">
              {role.headingLines.map((line) => (
                <span key={line} className="m-reveal" style={{ animationDelay: next(80) }}>
                  {line}
                </span>
              ))}
            </h2>
            <p className="m-sub m-reveal" style={{ animationDelay: next(90) }}>{role.sub}</p>
          </div>

          {/* CTAs */}
          <div className="m-cta-stack">
            <a href={role.href} className="m-primary-cta m-reveal" style={{ animationDelay: next(70) }}>{role.primaryCta}</a>
            <a href={role.href} className="m-secondary-cta m-reveal" style={{ animationDelay: next(60) }}>{role.secondaryCta}</a>
          </div>

          {/* Proof chips */}
          <ul className="m-chips">
            {role.chips.map((c, i) => (
              <li key={c} className="m-chip m-reveal" style={{ animationDelay: `${d + i * 50}ms` }}>{c}</li>
            ))}
          </ul>
        </div>
      </section>
    );
  },
);
