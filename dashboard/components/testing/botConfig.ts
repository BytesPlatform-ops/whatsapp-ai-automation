/**
 * BOT_CONFIG — single source for the testing console. Add a bot = one entry.
 * Endpoints + body shapes are the REAL backend routes (confirmed from the live
 * OpenAPI of the FastAPI app), not placeholders.
 *
 * Each bot has:
 *  - fields:  the input panel (text / textarea / select)
 *  - actions: one or more "Run" buttons → {method, path, body(inputs)}
 *  - chat:    optional chat endpoint → builds a body from inputs+message and
 *             knows how to pull a human-readable reply out of the response.
 */

export type FieldType = 'text' | 'textarea' | 'select';

export interface BotField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[]; // for select
  placeholder?: string;
  default?: string;
  /** comma-separated string in the UI → string[] in the request body. */
  asList?: boolean;
}

export interface BotAction {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  /** path may interpolate {key} from inputs. */
  path: string;
  /** build the JSON body from the current input values. */
  body?: (v: Record<string, string>) => unknown;
}

export interface BotChat {
  method: 'POST';
  path: string;
  body: (v: Record<string, string>, message: string, history: ChatTurn[]) => unknown;
  /** extract a readable assistant reply from the raw response. */
  reply: (data: unknown) => string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface BotConfig {
  id: string;
  name: string;
  accent: string;
  soft: string;
  blurb: string;
  fields: BotField[];
  actions: BotAction[];
  chat?: BotChat;
  /** Content Creator: a reference upload field (backend takes a ref string). */
  upload?: { label: string; note: string };
}

function list(v: string | undefined): string[] {
  return (v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function str(data: unknown, ...keys: string[]): string {
  if (data && typeof data === 'object') {
    for (const k of keys) {
      const val = (data as Record<string, unknown>)[k];
      if (typeof val === 'string' && val) return val;
    }
  }
  return JSON.stringify(data);
}

export const BOTS: BotConfig[] = [
  {
    id: 'website',
    name: 'Website Builder',
    accent: '#3B82F6',
    soft: '#60A5FA',
    blurb: 'Turns a plain-language request into a structured Site. POST /v1/generate.',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', type: 'text', default: 'demo' },
      { key: 'mode', label: 'Mode', type: 'select', options: ['auto', 'create', 'edit'], default: 'auto' },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        default: 'Build a website for a cozy coffee shop in Lahore called Bean There.',
      },
    ],
    actions: [
      {
        id: 'generate',
        label: 'Generate site',
        method: 'POST',
        path: '/v1/generate',
        body: (v) => ({ tenant_id: v.tenant_id, message: v.message, mode: v.mode }),
      },
    ],
    chat: {
      method: 'POST',
      path: '/v1/generate',
      body: (v, message) => ({ tenant_id: v.tenant_id, message, mode: v.mode || 'auto' }),
      reply: (data) => {
        const d = data as Record<string, unknown>;
        const site = (d?.site ?? d) as Record<string, unknown>;
        const title = (site?.title as string) || (site?.business_name as string) || '';
        return title ? `Site generated: ${title}` : 'Site generated. See raw output →';
      },
    },
  },
  {
    id: 'receptionist',
    name: 'AI Receptionist',
    accent: '#E6B45A',
    soft: '#F2CE86',
    blurb: 'Answers + captures leads/bookings. POST /receptionist/chat.',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', type: 'text', default: 'demo' },
      {
        key: 'channel',
        label: 'Channel',
        type: 'select',
        options: ['web_chat', 'whatsapp', 'sms', 'voice', 'telegram'],
        default: 'web_chat',
      },
      { key: 'business_name', label: 'Business name', type: 'text', default: 'Bean There Coffee' },
      { key: 'message', label: 'Message', type: 'textarea', default: 'Hi, are you open on Sundays?' },
    ],
    actions: [
      {
        id: 'message',
        label: 'Send message',
        method: 'POST',
        path: '/receptionist/chat',
        body: (v) => ({ tenant_id: v.tenant_id, message: v.message, channel: v.channel }),
      },
    ],
    chat: {
      method: 'POST',
      path: '/receptionist/chat',
      body: (v, message, history) => ({
        tenant_id: v.tenant_id,
        message,
        channel: v.channel,
        history: history.map((t) => ({ role: t.role, content: t.text })),
      }),
      reply: (data) => str(data, 'reply_text', 'reply', 'message'),
    },
  },
  {
    id: 'seo',
    name: 'SEO',
    accent: '#14B8A6',
    soft: '#2DD4BF',
    blurb: 'Audits a URL, suggests keywords, generates content. POST /api/seo/*.',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', type: 'text', default: 'demo' },
      { key: 'url', label: 'URL', type: 'text', default: 'https://example.com' },
      { key: 'topic', label: 'Keyword topic (for keywords)', type: 'text', default: 'coffee shop lahore' },
    ],
    actions: [
      {
        id: 'audit',
        label: 'Audit URL',
        method: 'POST',
        path: '/api/seo/audit-url',
        body: (v) => ({ tenant_id: v.tenant_id, url: v.url }),
      },
      {
        id: 'keywords',
        label: 'Keywords',
        method: 'POST',
        path: '/api/seo/keywords',
        body: (v) => ({ tenant_id: v.tenant_id, topic: v.topic, seed: v.topic }),
      },
      {
        id: 'generate',
        label: 'Generate content',
        method: 'POST',
        path: '/api/seo/generate',
        body: (v) => ({ tenant_id: v.tenant_id, url: v.url, topic: v.topic }),
      },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    accent: '#EC4899',
    soft: '#F472B6',
    blurb: 'Creates a multi-channel campaign. POST /campaigns.',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', type: 'text', default: 'demo' },
      { key: 'name', label: 'Campaign name', type: 'text', default: 'Weekend brunch promo' },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          'offer_promo',
          'appointment_reminder',
          'missed_call_callback',
          'win_back',
          'review_request',
          'payment_renewal_reminder',
          'quote_follow_up',
        ],
        default: 'offer_promo',
      },
      {
        key: 'channels',
        label: 'Channels (comma-separated: whatsapp,sms,email,voice)',
        type: 'text',
        default: 'whatsapp,sms',
        asList: true,
      },
      {
        key: 'message_template',
        label: 'Message template',
        type: 'textarea',
        default: 'Hi {name}! 30% off brunch this weekend at Bean There ☕ Reply YES to book.',
      },
    ],
    actions: [
      {
        id: 'create',
        label: 'Create campaign',
        method: 'POST',
        path: '/campaigns',
        body: (v) => ({
          tenant_id: v.tenant_id,
          name: v.name,
          type: v.type,
          channels: list(v.channels),
          message_template: v.message_template,
        }),
      },
      { id: 'list', label: 'List campaigns', method: 'GET', path: '/campaigns?tenant_id={tenant_id}' },
    ],
  },
  {
    id: 'content',
    name: 'Content Creator',
    accent: '#D4AF37',
    soft: '#E9C46A',
    blurb: 'AI influencer pipeline: profile → ideas → script → video. /api/content-creator/*.',
    fields: [
      { key: 'tenant_id', label: 'Tenant ID', type: 'text', default: 'demo' },
      { key: 'business_name', label: 'Business', type: 'text', default: 'Bean There Coffee' },
      {
        key: 'influencer_mode',
        label: 'Influencer mode',
        type: 'select',
        options: ['face', 'characteristics'],
        default: 'characteristics',
      },
      {
        key: 'characteristics',
        label: 'Characteristics',
        type: 'textarea',
        default: 'warm, energetic barista, mid-20s, casual style',
      },
      {
        key: 'higgsfield_mode',
        label: 'Higgsfield mode',
        type: 'select',
        options: ['pixie_account', 'user_account'],
        default: 'pixie_account',
      },
      {
        key: 'stage',
        label: 'Stage (for reference)',
        type: 'select',
        options: ['profile', 'ideas', 'script', 'video'],
        default: 'ideas',
      },
    ],
    upload: {
      label: 'Reference image',
      note: 'This backend endpoint accepts a reference STRING (reference_ref), not raw bytes — the filename is sent as the ref. Used by influencer/upload-reference.',
    },
    actions: [
      {
        id: 'profile',
        label: '1. Set profile',
        method: 'POST',
        path: '/api/content-creator/profile',
        body: (v) => ({
          tenant_id: v.tenant_id,
          business_name: v.business_name,
          brand_tone: v.characteristics,
        }),
      },
      {
        id: 'influencer',
        label: '2. Influencer (characteristics)',
        method: 'POST',
        path: '/api/content-creator/influencer/from-characteristics',
        body: (v) => ({ tenant_id: v.tenant_id, characteristics: v.characteristics }),
      },
      {
        id: 'ideas',
        label: '3. Generate ideas',
        method: 'POST',
        path: '/api/content-creator/ideas/generate',
        body: (v) => ({ tenant_id: v.tenant_id, seeds: [v.business_name] }),
      },
      {
        id: 'status',
        label: 'Pipeline status',
        method: 'GET',
        path: '/api/content-creator/status?tenant_id={tenant_id}',
      },
    ],
  },
];

/** Interpolate {key} tokens in a path from input values. */
export function resolvePath(path: string, v: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(v[k] ?? ''));
}

export function defaultsFor(bot: BotConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of bot.fields) out[f.key] = f.default ?? '';
  return out;
}
