'use client';

import { FLYING_ROLES, NORMAL_FORM } from './roleData';

// The six role forms + the "normal" footer-landing form, all stacked so the
// robot can morph to any of them (including the final normal Pixie).
const FORMS = [...FLYING_ROLES.map((r) => ({ id: r.id, image: r.image, label: r.label })), NORMAL_FORM];

/**
 * RobotFormMorph — the Pixie forms stacked in one frame; only the active one is
 * visible. Cross-fades (opacity + slight scale) on change — never a hard src
 * swap. All forms preload via roleData. A small accent scan-flash plays on each
 * change (keyed by activeId). Includes the `normal` form for the footer landing.
 */
export function RobotFormMorph({ activeId, scanKey }: { activeId: string; scanKey: number }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {FORMS.map((role) => {
        const on = role.id === activeId;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- transparent cutout cross-fade
          <img
            key={role.id}
            src={role.image}
            alt={on ? `Pixie AI assistant in ${role.label} form` : ''}
            aria-hidden={!on}
            draggable={false}
            className="absolute inset-0 m-auto h-full w-full select-none object-contain drop-shadow-[0_28px_55px_rgba(0,0,0,0.5)]"
            style={{
              opacity: on ? 1 : 0,
              transform: on ? 'scale(1)' : 'scale(0.985)',
              transition: 'opacity 0.7s ease, transform 0.8s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        );
      })}

      {/* Accent scan-flash on role change — one-shot only. Base opacity 0 so it
          NEVER persists as a ring around the robot (the flash plays via the
          keyed re-mount + `forwards` fill, then stays invisible). */}
      <span
        key={scanKey}
        aria-hidden
        className="mh-scan-flash pointer-events-none absolute left-1/2 top-1/2 h-[56%] w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-0"
        style={{ border: '2px solid rgb(var(--accent-rgb) / 0.8)', boxShadow: '0 0 40px rgb(var(--accent-rgb) / 0.45)' }}
      />
    </div>
  );
}
