// Single source of truth for which services this chat currently handles
// end-to-end vs. which ones get handed off to a human.
//
// To enable a service later:
//   1. Add its key to ENABLED_SERVICES below.
//   2. Make sure its catalogue entry has the right triggerTag /
//      statePrefixes / menu metadata.
//   3. (If the service was retired and you're bringing it back) sanity
//      check that its handler file in src/conversation/handlers/ still
//      exists and its states are still registered in STATE_HANDLERS in
//      src/conversation/router.js.
//
// To disable a service:
//   1. Remove its key from ENABLED_SERVICES.
//   2. Existing in-flight users in that service's states get redirected
//      to a human handoff via the router pipeline.
//
// Nothing else needs to change — salesBot.js, serviceSelection.js,
// router.js, prompts.js, and informativeBot.js all read from the helpers
// below.

// Currently the only chat-handled service. Edit this set to flip a
// service on or off.
const ENABLED_SERVICES = new Set(['website']);

// Every service the company offers, whether or not the chat currently
// handles it. Used to:
//   - dynamically render the service-selection menu (filtered to enabled)
//   - drive the sales/info prompt copy ("we offer X, Y, Z; this chat
//     handles X end-to-end, the rest go through a human")
//   - decide whether an LLM-emitted trigger runs the flow or hands off
//   - decide whether an in-flight user in a disabled state gets gracefully
//     redirected to handoff
const SERVICE_CATALOGUE = [
  {
    key: 'website',
    label: 'Build a website',
    shortLabel: 'website',
    emoji: '🌐',
    menuButtonId: 'svc_webdev',
    triggerTag: 'TRIGGER_WEBSITE_DEMO',
    statePrefixes: ['WEB_', 'SALON_', 'DOMAIN_'],
  },
  {
    key: 'seo',
    label: 'SEO audit / campaign',
    shortLabel: 'SEO',
    emoji: '🔍',
    menuButtonId: 'svc_seo',
    triggerTag: 'TRIGGER_SEO_AUDIT',
    statePrefixes: ['SEO_'],
  },
  {
    key: 'chatbot',
    label: 'AI Chatbot',
    shortLabel: 'chatbot',
    emoji: '🤖',
    menuButtonId: 'svc_chatbot',
    triggerTag: 'TRIGGER_CHATBOT_DEMO',
    statePrefixes: ['CB_'],
  },
  {
    key: 'ads',
    label: 'Marketing ad design',
    shortLabel: 'ad design',
    emoji: '🎨',
    menuButtonId: 'svc_adgen',
    triggerTag: 'TRIGGER_AD_GENERATOR',
    statePrefixes: ['AD_'],
  },
  {
    key: 'logo',
    label: 'Logo design',
    shortLabel: 'logo',
    emoji: '✨',
    menuButtonId: 'svc_logo',
    triggerTag: 'TRIGGER_LOGO_MAKER',
    statePrefixes: ['LOGO_'],
  },
  {
    key: 'app',
    label: 'App development',
    shortLabel: 'app',
    emoji: '📱',
    menuButtonId: 'svc_appdev',
    triggerTag: null,
    statePrefixes: ['APP_'],
  },
  {
    key: 'marketing',
    label: 'Digital marketing',
    shortLabel: 'marketing',
    emoji: '📈',
    menuButtonId: 'svc_marketing',
    triggerTag: null,
    statePrefixes: ['MARKETING_'],
  },
];

function isServiceEnabled(key) {
  return ENABLED_SERVICES.has(key);
}

function enabledServices() {
  return SERVICE_CATALOGUE.filter((s) => ENABLED_SERVICES.has(s.key));
}

function disabledServices() {
  return SERVICE_CATALOGUE.filter((s) => !ENABLED_SERVICES.has(s.key));
}

function findServiceByKey(key) {
  return SERVICE_CATALOGUE.find((s) => s.key === key) || null;
}

function findServiceByTriggerTag(tag) {
  return SERVICE_CATALOGUE.find((s) => s.triggerTag === tag) || null;
}

function findServiceByMenuButton(buttonId) {
  return SERVICE_CATALOGUE.find((s) => s.menuButtonId === buttonId) || null;
}

// Given a state string like "CB_COLLECT_NAME", return the catalogue
// entry it belongs to (or null). Used by the router to decide whether
// an in-flight user is on a disabled flow and should be redirected.
// NOTE: scheduling states (SCHEDULE_*) intentionally don't map here —
// "book a call with our team" stays available regardless of which
// services are enabled.
function findServiceByState(state) {
  if (!state || typeof state !== 'string') return null;
  for (const svc of SERVICE_CATALOGUE) {
    for (const prefix of svc.statePrefixes || []) {
      if (state.startsWith(prefix)) return svc;
    }
  }
  return null;
}

// True if the given state belongs to a service that's currently disabled
// (i.e. the user is mid-flow on something we no longer run through the
// chat — they should be redirected to a handoff).
function isStateOnDisabledService(state) {
  const svc = findServiceByState(state);
  if (!svc) return false;
  return !ENABLED_SERVICES.has(svc.key);
}

// Pretty list of disabled services for prompt copy and admin notifications,
// e.g. "SEO, AI Chatbot, ad design, logo, app development, marketing"
function disabledServicesPretty() {
  return disabledServices()
    .map((s) => s.shortLabel)
    .join(', ');
}

// Pretty list of enabled services. Almost always just "website" right now,
// but keeps the door open for combinations later.
function enabledServicesPretty() {
  return enabledServices()
    .map((s) => s.shortLabel)
    .join(', ');
}

module.exports = {
  ENABLED_SERVICES,
  SERVICE_CATALOGUE,
  isServiceEnabled,
  enabledServices,
  disabledServices,
  findServiceByKey,
  findServiceByTriggerTag,
  findServiceByMenuButton,
  findServiceByState,
  isStateOnDisabledService,
  disabledServicesPretty,
  enabledServicesPretty,
};
