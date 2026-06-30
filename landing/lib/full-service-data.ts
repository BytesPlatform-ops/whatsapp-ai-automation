/**
 * Full-service seed data — large, AI-boss-toned content per Pixie unit so every
 * full-service page renders as a complete command center (not an empty pipeline).
 * Static for now; the backend can replace it later. Keyed by canonical slug.
 */

export type Priority = 'urgent' | 'high' | 'medium' | 'low';
export type RecStatus = 'prepared' | 'needs_approval' | 'active' | 'done';

export interface RecommendationCard {
  id: string;
  title: string;
  shortSummary: string;
  fullIdea: string;
  whyPixieSuggested: string;
  category: string;
  agent: string;
  priority: Priority;
  status: RecStatus;
  approvalRequired: boolean;
  preparedOutputs: string[];
  routedTo?: string; // omni only
  primaryCta: string;
  secondaryCta: string;
}
export interface ApprovalCard { title: string; risk: Priority; willDo: string; channels: string; }
export interface WorkflowCard { name: string; detects: string; prepares: string; status: string; }
export interface IntelCard { title: string; value: string; }
export interface NextAction { title: string; impact: string; effort: string; permission: string; }
export interface FullServiceData {
  recommendations: RecommendationCard[];
  approvals: ApprovalCard[];
  workflows: WorkflowCard[];
  intelligenceTitle: string;
  intelligence: IntelCard[];
  activity: string[];
  nextActions: NextAction[];
}

const rec = (
  id: string, title: string, shortSummary: string, fullIdea: string, why: string,
  category: string, agent: string, priority: Priority, status: RecStatus, approvalRequired: boolean,
  preparedOutputs: string[], primaryCta = 'Review', routedTo?: string,
): RecommendationCard => ({ id, title, shortSummary, fullIdea, whyPixieSuggested: why, category, agent, priority, status, approvalRequired, preparedOutputs, routedTo, primaryCta, secondaryCta: 'Skip' });

// quick recs from short tuples for the lighter agents
const quick = (agent: string, items: [string, string, Priority, boolean][]): RecommendationCard[] =>
  items.map(([title, summary, priority, appr], i) =>
    rec(`${agent}-${i}`, title, summary, summary + ' Pixie has prepared the work and is ready when you are.',
      'Pixie prepared this from your recent business activity.', 'Action', agent, priority,
      appr ? 'needs_approval' : 'prepared', appr, ['Drafted output', 'Suggested timing'], 'Review'));

const APPROVALS_DEFAULT: ApprovalCard[] = [
  { title: 'Publish prepared output', risk: 'high', willDo: 'Pixie will publish the approved draft to your connected channel.', channels: 'Website / Social' },
  { title: 'Send prepared messages', risk: 'medium', willDo: 'Pixie will send the drafted messages to the selected contacts.', channels: 'WhatsApp / SMS / Email' },
  { title: 'Apply prepared changes', risk: 'medium', willDo: 'Pixie will apply the prepared updates after your confirmation.', channels: 'Your site / profile' },
];
const NEXT_DEFAULT: NextAction[] = [
  { title: 'Approve the top prepared action', impact: 'High', effort: 'Low', permission: 'Required before publishing' },
  { title: 'Connect a channel so Pixie can execute', impact: 'High', effort: 'Low', permission: 'One-time connection' },
  { title: 'Review this week’s prepared work', impact: 'Medium', effort: 'Low', permission: 'None' },
  { title: 'Enable a ready-to-run workflow', impact: 'Medium', effort: 'Low', permission: 'Confirm once' },
];

export const FULL_SERVICE_DATA: Record<string, FullServiceData> = {
  'marketing-agent': {
    recommendations: [
      rec('mk1', 'Weekend campaign ready', 'Pixie found a quiet weekend and prepared a limited-time offer.', 'Pixie noticed the upcoming weekend has no planned campaign and prepared a limited-time offer with SMS, an Instagram caption, email copy, and a follow-up reminder.', 'Quiet weekends are a good time to bring warm customers back with a simple offer.', 'Campaign', 'Marketing', 'high', 'needs_approval', true, ['SMS copy', 'Instagram caption', 'Email copy', 'Follow-up reminder'], 'Review campaign'),
      rec('mk2', 'Plan this week’s content', 'Pixie drafted a 7-day posting plan tuned to your audience.', 'Pixie prepared a full weekly content plan with hooks, captions, posting times, and CTA suggestions based on your business tone.', 'Consistent weekly content keeps your business visible without manual planning.', 'Content', 'Marketing', 'medium', 'prepared', false, ['7 post ideas', 'Captions', 'Hooks', 'CTAs'], 'View plan'),
      ...quick('Marketing', [
        ['Old customers to reactivate', 'Pixie found customers who haven’t booked again and prepared a comeback message.', 'high', true],
        ['Review can become a campaign', 'Pixie found a strong review and turned it into a social post.', 'medium', true],
        ['Slow weekday offer', 'Pixie detected weak weekday activity and prepared a weekday promotion.', 'medium', true],
        ['Local awareness post', 'Pixie prepared a local trust-building post for nearby customers.', 'low', false],
        ['Follow-up campaign', 'Pixie found leads who engaged but didn’t convert and drafted a nudge.', 'high', true],
        ['Seasonal offer suggestion', 'Pixie prepared a campaign for upcoming seasonal demand.', 'medium', false],
      ]),
    ],
    approvals: [
      { title: 'Launch weekend campaign', risk: 'high', willDo: 'Pixie prepared SMS, Instagram caption, and email copy and will schedule the campaign.', channels: 'SMS / Instagram / Email' },
      { title: 'Send 23 reactivation messages', risk: 'high', willDo: 'Pixie will message 23 lapsed customers with the prepared comeback offer.', channels: 'WhatsApp / SMS' },
      { title: 'Publish 7-day content plan', risk: 'medium', willDo: 'Pixie will schedule the approved posts across the week.', channels: 'Social' },
    ],
    workflows: [
      { name: 'Weekend Offer Automation', detects: 'Quiet upcoming weekends', prepares: 'A limited-time offer + posts', status: 'Ready' },
      { name: 'Old Lead Reactivation', detects: 'Customers who haven’t returned', prepares: 'A polite comeback offer', status: 'Ready' },
      { name: 'Review-to-Post Workflow', detects: 'New strong reviews', prepares: 'A social post from the review', status: 'Ready' },
      { name: 'Weekly Content Planner', detects: 'Content gaps', prepares: 'A 7-day plan with captions', status: 'Ready' },
    ],
    intelligenceTitle: 'Marketing intelligence',
    intelligence: [
      { title: 'Best campaign opportunity', value: 'Weekend reactivation offer' },
      { title: 'Audience Pixie is watching', value: 'Warm leads + lapsed customers' },
      { title: 'Best campaign timing', value: 'Thu evening → Sun' },
      { title: 'Content gaps', value: '3 days with no planned posts' },
    ],
    activity: ['Pixie prepared campaign assets', 'Pixie found 23 old customers', 'Pixie drafted 7 posts', 'Pixie is waiting for approval on 2 actions', 'Pixie skipped 1 low-priority idea'],
    nextActions: NEXT_DEFAULT,
  },

  omni: {
    recommendations: [
      rec('om1', '3 leads need follow-up', 'Pixie prepared replies and follow-up timing.', 'Three leads messaged in the last day and haven’t heard back. Pixie drafted a reply for each and a follow-up schedule.', 'Fast follow-up converts far more leads.', 'Customers', 'Omni', 'urgent', 'needs_approval', true, ['3 replies', 'Follow-up timing'], 'Review replies', 'AI Receptionist'),
      rec('om2', 'Website hero needs improvement', 'Pixie prepared stronger homepage copy.', 'Your homepage hero is vague. Pixie drafted clearer headline + CTA copy and flagged it for SEO.', 'A clear hero lifts conversions and search clarity.', 'Website & SEO', 'Omni', 'high', 'prepared', false, ['New hero copy', 'CTA', 'SEO note'], 'Review fix', 'Website Builder + SEO'),
      ...quick('Omni', [
        ['Review request opportunity', 'Pixie found happy customers to ask for reviews.', 'medium', false],
        ['Weekend campaign ready', 'Pixie prepared a weekend offer to fill a quiet slot.', 'high', true],
        ['SEO title missing', 'Pixie wrote meta titles for 4 pages missing them.', 'medium', true],
        ['Content from a customer question', 'Pixie turned a common question into a post.', 'low', false],
        ['Missed calls need recovery', 'Pixie prepared callback messages for missed calls.', 'high', true],
        ['Old customers to reactivate', 'Pixie drafted a comeback offer for lapsed customers.', 'medium', true],
        ['Booking reminder workflow', 'Pixie can send reminders before each booking.', 'low', false],
        ['Website + content cross-suggestion', 'Pixie aligned a new service page with a content push.', 'medium', false],
      ]).map((c, i) => ({ ...c, routedTo: ['Marketing', 'Marketing', 'SEO Agent', 'Content Creator', 'AI Receptionist', 'Marketing', 'AI Receptionist', 'Website + Content'][i] })),
    ],
    approvals: [
      { title: 'Launch weekend campaign', risk: 'high', willDo: 'Pixie will schedule the prepared weekend offer.', channels: 'SMS / Social / Email' },
      { title: 'Send 23 reactivation messages', risk: 'high', willDo: 'Pixie will message lapsed customers.', channels: 'WhatsApp / SMS' },
      { title: 'Publish 7-day content plan', risk: 'medium', willDo: 'Pixie will schedule the week’s posts.', channels: 'Social' },
      { title: 'Apply website copy updates', risk: 'medium', willDo: 'Pixie will update the homepage hero + CTA.', channels: 'Your website' },
      { title: 'Send 3 lead replies', risk: 'low', willDo: 'Pixie will send the drafted replies to new leads.', channels: 'Chat / WhatsApp' },
    ],
    workflows: [
      { name: 'Missed-Call Recovery', detects: 'Missed calls', prepares: 'A callback message', status: 'Ready' },
      { name: 'Old Lead Reactivation', detects: 'Lapsed customers', prepares: 'A comeback offer', status: 'Ready' },
      { name: 'Review-to-Post', detects: 'New reviews', prepares: 'A social post', status: 'Ready' },
      { name: 'Weekly Content Planner', detects: 'Content gaps', prepares: 'A 7-day plan', status: 'Ready' },
      { name: 'Booking Reminders', detects: 'Upcoming bookings', prepares: 'Reminder messages', status: 'Ready' },
    ],
    intelligenceTitle: 'Omni intelligence',
    intelligence: [
      { title: 'Most urgent signal', value: '3 leads waiting on a reply' },
      { title: 'Which agent should act', value: 'Receptionist → Marketing' },
      { title: 'Cross-agent recommendation', value: 'Website hero + SEO + content' },
      { title: 'Work waiting for approval', value: '5 prepared actions' },
      { title: 'Growth opportunity', value: 'Reactivate 23 old customers' },
      { title: 'Best timing', value: 'This weekend' },
    ],
    activity: ['Pixie routed 3 leads to Receptionist', 'Pixie prepared a weekend campaign', 'Pixie wrote 4 SEO titles', 'Pixie drafted homepage copy', 'Pixie is waiting on 5 approvals', 'Pixie skipped 2 low-priority items'],
    nextActions: [
      { title: 'Approve the 3 lead replies', impact: 'High', effort: 'Low', permission: 'Required before sending' },
      { title: 'Approve weekend campaign', impact: 'High', effort: 'Low', permission: 'Required before publishing' },
      { title: 'Apply homepage copy fix', impact: 'Medium', effort: 'Low', permission: 'Confirm once' },
      { title: 'Enable missed-call recovery', impact: 'High', effort: 'Low', permission: 'Confirm once' },
      { title: 'Ask 12 customers for reviews', impact: 'Medium', effort: 'Low', permission: 'Approve list' },
    ],
  },

  'ai-receptionist': {
    recommendations: quick('AI Receptionist', [
      ['3 leads need follow-up', 'Pixie drafted a reply for each new lead.', 'urgent', true],
      ['Missed calls need callbacks', 'Pixie prepared callback messages for missed calls.', 'high', true],
      ['Add your business hours', 'Pixie needs hours to answer “are you open?”.', 'medium', false],
      ['Create pricing FAQ replies', 'Pixie drafted clear answers to your top question.', 'medium', false],
      ['Connect calendar for bookings', 'Pixie can book real appointments once connected.', 'high', false],
      ['Reply to 2 new reviews', 'Pixie drafted warm replies to recent reviews.', 'low', true],
    ]),
    approvals: APPROVALS_DEFAULT, workflows: [
      { name: 'Missed-Call Recovery', detects: 'Missed calls', prepares: 'A callback message', status: 'Ready' },
      { name: 'Lead Follow-Up', detects: 'Quiet leads', prepares: 'A nudge message', status: 'Ready' },
      { name: 'After-Hours Auto-Reply', detects: 'Out-of-hours messages', prepares: 'A friendly auto-reply', status: 'Ready' },
      { name: 'Booking Reminders', detects: 'Upcoming bookings', prepares: 'Reminder messages', status: 'Ready' },
    ],
    intelligenceTitle: 'Customer intelligence',
    intelligence: [{ title: 'Most asked question', value: 'Pricing' }, { title: 'Missed-call pattern', value: 'Weekday lunch hours' }, { title: 'Booking intent', value: '4 strong this week' }, { title: 'Leads needing follow-up', value: '3' }],
    activity: ['Pixie answered 4 chats today', 'Pixie captured 2 new leads', 'Pixie drafted 3 follow-ups', 'Pixie flagged 1 callback', 'Pixie saved a customer question to memory'],
    nextActions: NEXT_DEFAULT,
  },

  'website-builder': {
    recommendations: quick('Website Builder', [
      ['Publish your first website', 'Pixie prepared a homepage ready to publish.', 'high', true],
      ['Strengthen homepage CTA', 'Pixie moved the booking CTA above the fold.', 'medium', true],
      ['Add testimonials to homepage', 'Pixie prepared a trust strip from reviews.', 'low', false],
      ['Clean up mobile spacing', 'Pixie tuned two cramped sections for mobile.', 'low', false],
      ['Connect your custom domain', 'Pixie can point your domain at the site.', 'medium', false],
      ['Add a missing service page', 'Pixie drafted a service page you’re missing.', 'medium', false],
    ]),
    approvals: APPROVALS_DEFAULT, workflows: [
      { name: 'Publish Workflow', detects: 'Draft sites', prepares: 'A publish-ready build', status: 'Ready' },
      { name: 'Conversion Tune-Up', detects: 'Weak CTAs', prepares: 'Stronger CTA copy/placement', status: 'Ready' },
      { name: 'Trust Builder', detects: 'No social proof', prepares: 'A testimonials section', status: 'Ready' },
      { name: 'Mobile Polish', detects: 'Mobile spacing issues', prepares: 'Layout fixes', status: 'Ready' },
    ],
    intelligenceTitle: 'Website intelligence',
    intelligence: [{ title: 'Hero clarity', value: 'Needs a clearer headline' }, { title: 'Missing service pages', value: '1' }, { title: 'CTA strength', value: 'Below the fold' }, { title: 'Trust elements', value: 'No testimonials yet' }],
    activity: ['Pixie generated a homepage draft', 'Pixie wrote hero + services copy', 'Pixie prepared the mobile layout', 'Pixie flagged a weak CTA', 'Pixie prepared a publish checklist'],
    nextActions: NEXT_DEFAULT,
  },

  'seo-agent': {
    recommendations: quick('SEO Agent', [
      ['Add missing meta titles', 'Pixie wrote titles for 4 pages missing them.', 'high', true],
      ['Fix 7 SEO issues', 'Pixie prepared fixes for the top technical issues.', 'high', true],
      ['Claim your Google listing', 'Pixie prepared the steps to claim Maps.', 'medium', false],
      ['Generate image alt text', 'Pixie drafted alt text for your images.', 'low', false],
      ['Add local business schema', 'Pixie prepared structured data for local search.', 'medium', false],
      ['Improve homepage headings', 'Pixie restructured headings for clarity.', 'low', false],
    ]),
    approvals: APPROVALS_DEFAULT, workflows: [
      { name: 'Meta Fix Workflow', detects: 'Missing titles/descriptions', prepares: 'Optimized tags', status: 'Ready' },
      { name: 'Technical Audit', detects: 'Crawl issues', prepares: 'A prioritized fix list', status: 'Ready' },
      { name: 'Local SEO Setup', detects: 'Missing local signals', prepares: 'Schema + GBP steps', status: 'Ready' },
      { name: 'Content Gap Finder', detects: 'Missing FAQs/topics', prepares: 'Content recommendations', status: 'Ready' },
    ],
    intelligenceTitle: 'SEO intelligence',
    intelligence: [{ title: 'Top SEO issue', value: '4 pages missing titles' }, { title: 'Keyword opportunity', value: 'coffee shop lahore' }, { title: 'Pages to improve', value: '5' }, { title: 'Local SEO gap', value: 'Unclaimed Google listing' }],
    activity: ['Pixie scanned your site', 'Pixie found 7 issues', 'Pixie wrote 4 meta titles', 'Pixie prepared a fix plan', 'Pixie flagged a local SEO gap'],
    nextActions: NEXT_DEFAULT,
  },

  'content-creator': {
    recommendations: quick('Content Creator', [
      ['Approve today’s reel script', 'Pixie wrote a 22s reel script with a hook.', 'high', true],
      ['Turn a trend into a reel', 'Pixie matched a trending audio to your niche.', 'high', false],
      ['Generate 5 content hooks', 'Pixie drafted 5 hooks for this week.', 'medium', false],
      ['Create a carousel', 'Pixie prepared a 5-slide carousel idea.', 'low', false],
      ['Rewrite a caption for Instagram', 'Pixie polished a caption for reach.', 'low', false],
      ['Content from a customer question', 'Pixie turned a common question into a post.', 'medium', false],
    ]),
    approvals: APPROVALS_DEFAULT, workflows: [
      { name: 'Trend-to-Reel', detects: 'Trending audio', prepares: 'A reel concept + script', status: 'Ready' },
      { name: 'Weekly Hooks', detects: 'Content gaps', prepares: '5 hooks + captions', status: 'Ready' },
      { name: 'Q&A Content', detects: 'Common questions', prepares: 'A post answering them', status: 'Ready' },
      { name: 'Carousel Builder', detects: 'Explainer topics', prepares: 'A carousel outline', status: 'Ready' },
    ],
    intelligenceTitle: 'Content intelligence',
    intelligence: [{ title: 'Best hook', value: '“Did anyone answer?”' }, { title: 'Post idea', value: 'Behind-the-scenes' }, { title: 'Trending angle', value: 'This week’s audio' }, { title: 'Customer-question content', value: '2 ready' }],
    activity: ['Pixie wrote a reel script', 'Pixie found a trend match', 'Pixie drafted 5 hooks', 'Pixie prepared a carousel', 'Pixie polished a caption'],
    nextActions: NEXT_DEFAULT,
  },
};

export function getFullServiceData(slug: string | null | undefined): FullServiceData | null {
  if (!slug) return null;
  return FULL_SERVICE_DATA[slug] ?? null;
}
