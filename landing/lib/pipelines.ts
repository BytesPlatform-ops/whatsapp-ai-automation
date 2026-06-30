/**
 * Pipeline registry — the full-service "runway" stages per Pixie unit. Pure data;
 * the FullServicePipeline component renders these as an airplane flight path.
 * Keyed by canonical slug (same ids as the agent registry, plus "omni").
 */

export interface PipelineStage {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'upcoming';
  cta: string;
}
export interface Pipeline {
  title: string;
  subtitle: string;
  stages: PipelineStage[];
}

const s = (id: string, title: string, description: string, cta: string, status: 'active' | 'upcoming' = 'upcoming'): PipelineStage =>
  ({ id, title, description, status, cta });

export const PIPELINES: Record<string, Pipeline> = {
  omni: {
    title: 'Pixie Omni Full-Service Pipeline',
    subtitle: 'From business signal to the right agent, approval, execution, and learning.',
    stages: [
      s('listen', 'Business Signals', 'Pixie listens across calls, messages, website activity, leads, content gaps, SEO issues, reviews, and old customers.', 'View signals', 'active'),
      s('understand', 'Intent & Priority', 'Omni understands what matters, ranks urgency, and decides which agent owns the task.', 'View priority'),
      s('route', 'Agent Routing', 'Pixie routes the work to the right specialist agent and prepares a clear action card.', 'View routed work'),
      s('prepare', 'Work Prepared', 'The selected agent prepares messages, content, website fixes, SEO updates, or campaign assets.', 'Preview work'),
      s('approval', 'Approval Gate', 'Before risky or public actions, Pixie asks the user to approve, edit, or skip.', 'Review approvals'),
      s('execute', 'Execution', 'Pixie executes approved work through connected channels and logs the activity.', 'View execution'),
      s('learn', 'Learning Loop', 'Pixie learns from results and creates the next recommendation.', 'View learning'),
    ],
  },
  'ai-receptionist': {
    title: 'AI Receptionist Full-Service Pipeline',
    subtitle: 'From customer contact to booking, reply, follow-up, and business memory.',
    stages: [
      s('incoming', 'Customer Contact', 'Pixie receives a call, message, website chat, form, or social DM.', 'View contacts', 'active'),
      s('intent', 'Intent Detection', 'Pixie understands whether the customer wants booking, pricing, support, a quote, callback, or FAQ help.', 'View intent'),
      s('response', 'Response Prepared', 'Pixie prepares the reply, booking link, quote, FAQ response, or callback message.', 'Preview response'),
      s('approval', 'Approval / Auto-Reply', 'Safe replies can be automated; risky replies require approval before sending.', 'Review settings'),
      s('followup', 'Follow-Up', 'Pixie follows up with leads who do not reply, do not book, or need a reminder.', 'Start follow-up'),
      s('memory', 'Business Memory', 'Pixie saves lead status, customer questions, and insights for future marketing, SEO, and website work.', 'View memory'),
    ],
  },
  'website-builder': {
    title: 'Website Builder Full-Service Pipeline',
    subtitle: 'From business brief to live website and continuous improvement.',
    stages: [
      s('brief', 'Business Brief', 'Pixie understands the business, services, tone, location, audience, and goals.', 'Review brief', 'active'),
      s('structure', 'Site Structure', 'Pixie plans pages, sections, navigation, conversion flow, and CTA strategy.', 'View structure'),
      s('copy-design', 'Copy & Design', 'Pixie creates page copy, visual direction, section layout, and conversion-focused content.', 'Preview website'),
      s('seo', 'SEO Foundation', 'Pixie adds titles, descriptions, headings, local signals, keywords, and structured content.', 'Review SEO'),
      s('approval', 'Approval Gate', 'The user reviews the site before Pixie publishes or exports it.', 'Approve site'),
      s('publish', 'Publish & Improve', 'Pixie publishes the site and keeps recommending improvements from business signals.', 'Publish'),
    ],
  },
  'seo-agent': {
    title: 'SEO Full-Service Pipeline',
    subtitle: 'From website scan to ranking improvements and ongoing recommendations.',
    stages: [
      s('scan', 'Website Scan', 'Pixie scans pages, headings, meta tags, content, images, links, speed signals, and structure.', 'Run scan', 'active'),
      s('issues', 'Issue Detection', 'Pixie detects missing keywords, weak titles, thin content, poor headings, and technical gaps.', 'View issues'),
      s('plan', 'SEO Plan', 'Pixie prioritizes fixes by business value, difficulty, and search opportunity.', 'View plan'),
      s('fixes', 'Fixes Prepared', 'Pixie prepares new titles, meta descriptions, headings, copy, FAQs, and recommendations.', 'Preview fixes'),
      s('approval', 'Approval Gate', 'The user approves SEO changes before Pixie applies or exports them.', 'Approve fixes'),
      s('tracking', 'Track & Recommend', 'Pixie tracks changes and keeps creating SEO action cards.', 'View tracking'),
    ],
  },
  'marketing-agent': {
    title: 'Marketing Full-Service Pipeline',
    subtitle: 'From opportunity detection to campaign launch and learning.',
    stages: [
      s('signal', 'Opportunity Detected', 'Pixie finds campaign opportunities from slow days, behavior, seasonality, offers, or content gaps.', 'Review signals', 'active'),
      s('strategy', 'Campaign Strategy', 'Pixie chooses the angle, offer, audience, timing, and channel mix.', 'View strategy'),
      s('content', 'Campaign Assets', 'Pixie prepares SMS, email, captions, posts, hooks, and campaign copy.', 'Preview assets'),
      s('approval', 'Approval Gate', 'The user approves, edits, or skips before anything goes live.', 'Approve campaign'),
      s('launch', 'Launch', 'Pixie schedules, publishes, or prepares the campaign for connected channels.', 'Launch'),
      s('results', 'Results & Learning', 'Pixie tracks results and recommends the next campaign.', 'View results'),
    ],
  },
  'content-creator': {
    title: 'Content Creator Full-Service Pipeline',
    subtitle: 'From content opportunity to script, creative, approval, and publishing.',
    stages: [
      s('idea', 'Content Opportunity', 'Pixie finds what to post from offers, FAQs, customer questions, trends, and seasonality.', 'Review ideas', 'active'),
      s('angle', 'Hook & Angle', 'Pixie chooses the hook, emotion, story angle, audience intent, and platform fit.', 'View hooks'),
      s('script', 'Script & Caption', 'Pixie prepares reel scripts, captions, carousel copy, hashtags, and CTA.', 'Preview script'),
      s('creative', 'Creative Production', 'Pixie prepares video/image prompts, storyboard, scene direction, or content assets.', 'Prepare creative'),
      s('approval', 'Approval Gate', 'The user approves before publishing or generating expensive creative.', 'Approve content'),
      s('publish', 'Schedule & Learn', 'Pixie schedules content and learns what performs best.', 'Schedule'),
    ],
  },
};

export function getPipelineBySlug(slug: string | null | undefined): Pipeline | null {
  if (!slug) return null;
  return PIPELINES[slug] ?? null;
}
