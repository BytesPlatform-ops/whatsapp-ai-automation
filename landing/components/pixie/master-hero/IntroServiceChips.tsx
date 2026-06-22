'use client';

import { INTRO_CHIPS } from './roleData';

/**
 * IntroServiceChips — six glass chips ORBITING the hub at a respectful
 * distance. Direction comes from each chip's angle (unit vector --ux/--uy);
 * distance is the responsive `--chip-r` var (set per breakpoint in globals),
 * so chips never cover the robot, halo, or headline. The vertical axis is
 * flattened (0.82) so top/bottom chips don't crowd the robot/copy.
 *
 * Scatter/fade is driven by `--intro` (1 = hub, 0 = scrolled away): chips drift
 * further out, scale up and fade. Each floats gently (inner element).
 * Decorative → aria-hidden.
 */
export function IntroServiceChips() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {INTRO_CHIPS.map((chip, i) => {
        const rad = (chip.angle * Math.PI) / 180;
        const ux = Math.cos(rad);
        const uy = Math.sin(rad) * 0.7; // flatten orbit vertically (clears navbar)
        return (
          <div
            key={chip.roleId}
            className="mh-intro-chip absolute left-1/2 top-[44%]"
            style={{
              ['--ux' as string]: ux.toFixed(4),
              ['--uy' as string]: uy.toFixed(4),
              transform:
                'translate(-50%,-50%) translate(calc(var(--ux) * var(--chip-r, 360px) * (1 + (1 - var(--intro,1)) * 0.45)), calc(var(--uy) * var(--chip-r, 360px) * (1 + (1 - var(--intro,1)) * 0.45))) scale(calc(1 + (1 - var(--intro,1)) * 0.06))',
              opacity: 'var(--intro, 1)',
            }}
          >
            <div className="mh-chip-float" style={{ animationDelay: `${i * 0.5}s` }}>
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3.5 py-2 backdrop-blur-xl">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--accent)' }} />
                <span className="whitespace-nowrap text-xs font-semibold text-white/85">{chip.label}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
