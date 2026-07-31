/**
 * Deep-link helpers shared by the Marketing Command Center and full-service
 * workspace. A recommendation's `target_tab` maps into the unified workspace
 * (`/pixie-lab/marketing/full-service?tab=…`); a `draft` id is carried through so
 * the destination tab can pre-select it (e.g. pre-fill the PAUSED campaign form).
 * `overview` stays on the main Command Center page.
 */
const FULL_SERVICE = '/pixie-lab/marketing/full-service';

export function recTargetHref(targetTab: string, draftId?: string): string {
  if (!targetTab || targetTab === 'overview') return '/pixie-lab/marketing';
  const base = `${FULL_SERVICE}?tab=${encodeURIComponent(targetTab)}`;
  return draftId ? `${base}&draft=${encodeURIComponent(draftId)}` : base;
}

const ACTION_LABEL: Record<string, string> = {
  connect: 'Connect Meta',
  review_campaign: 'Review campaign',
  view_plan: 'View plan',
  generate_calendar: 'View plan',
  view_ideas: 'View ideas',
  review_post: 'Review post',
  approve: 'Review approvals',
  view_inbox: 'Open inbox',
  analyze: 'Open ads',
  link_instagram: 'Fix setup',
  open_diagnostics: 'Open diagnostics',
  open_onboarding: 'Answer questions',
};

export function actionLabel(action: string): string {
  return ACTION_LABEL[action] || 'Review';
}
