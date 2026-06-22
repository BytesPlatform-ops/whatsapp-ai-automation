import { ROLE_THEMES, type RoleTheme } from '../mascot-role-hero/roleThemes';

export type { RoleTheme };
export { ROLE_THEMES };

/** Calm neutral theme for the intro hub (warms into Concierge Gold at role 1). */
export const INTRO_THEME: RoleTheme = {
  accent: '#8FB3C8',
  soft: '#BBD2E0',
  label: 'Pixie',
  modeName: 'Intro',
};

/** Friendly Pixie mint — the footer landing (Core settles back to normal). */
export const NORMAL_THEME: RoleTheme = {
  accent: '#66D6BE',
  soft: '#A7F3D0',
  label: 'Pixie',
  modeName: 'Normal Pixie Mode',
};

/** Theme for a flight/role id (greeter…core), the intro hub, or footer normal. */
export function themeFor(id: string): RoleTheme {
  if (id === 'intro') return INTRO_THEME;
  if (id === 'normal') return NORMAL_THEME;
  return (ROLE_THEMES as Record<string, RoleTheme>)[id] ?? INTRO_THEME;
}
