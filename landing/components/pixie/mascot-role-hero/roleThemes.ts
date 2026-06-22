/**
 * Per-role accent themes. The hero base stays dark/cinematic at all times —
 * only the accent layer (glow, halo, ring, badge, CTA, progress, small touches)
 * shifts into the active role's colour mode.
 */

export interface RoleTheme {
  accent: string;
  soft: string;
  label: string;
  modeName: string;
  /** Only set for the iridescent Core mode. */
  gradient?: string[];
  /** True → render the subtle iridescent Core glow layer. */
  iridescent?: boolean;
}

export const ROLE_THEMES = {
  greeter: { accent: '#E6B45A', soft: '#F2CE86', label: 'AI Receptionist', modeName: 'Concierge Gold' },
  architect: { accent: '#3B82F6', soft: '#60A5FA', label: 'Website Builder', modeName: 'Builder Blue' },
  creator: { accent: '#EC4899', soft: '#F472B6', label: 'Social Marketer', modeName: 'Creator Pink' },
  star: { accent: '#D4AF37', soft: '#E9C46A', label: 'AI Influencer', modeName: 'Luxe Gold' },
  analyst: { accent: '#14B8A6', soft: '#2DD4BF', label: 'SEO Analyst', modeName: 'Analyst Teal' },
  core: {
    accent: '#8B7CF6',
    soft: '#C4B5FD',
    label: 'Omnichannel AI',
    modeName: 'Iridescent Core',
    gradient: ['#8B7CF6', '#22D3EE', '#F472B6'],
    iridescent: true,
  },
} as const satisfies Record<string, RoleTheme>;

/** Map the hero's actual role IDs → themes (see roleData.ts ids). */
export const ROLE_THEME_BY_ID: Record<string, RoleTheme> = {
  receptionist: ROLE_THEMES.greeter,
  website: ROLE_THEMES.architect,
  social: ROLE_THEMES.creator,
  influencer: ROLE_THEMES.star,
  seo: ROLE_THEMES.analyst,
  omni: ROLE_THEMES.core,
};

export function themeForId(id: string): RoleTheme {
  return ROLE_THEME_BY_ID[id] ?? ROLE_THEMES.greeter;
}
