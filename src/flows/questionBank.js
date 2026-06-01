'use strict';

// Question bank + option lists for the dynamic WhatsApp Flow.
//
// Foolproof design: the industry is picked from a DROPDOWN whose option id
// IS the theme (salon/hvac/realestate/portfolio/general) — so the niche is
// always classified correctly, no free-text guessing. Salon gets a tailored
// screen (currency dropdown + booking radio); the other niches share a
// simple 2-field DETAILS screen. Contact is 3 separate optional fields.
//
// Everything is bilingual (en/pt); the endpoint serves the resolved
// language. classifyTheme() remains only as a fallback for any legacy
// free-text industry value.

const { isHvac, isRealEstate, isPortfolio } = require('../website-gen/templates');

const SALON_RX = /\b(salon|beauty|barber|spa|nail|hair|lash|brow|makeup)/i;

// Fallback classifier for free-text industry (the dropdown normally gives
// the theme id directly, so this is rarely used).
function classifyTheme(industry) {
  const s = String(industry || '').trim();
  if (!s) return 'general';
  // Direct theme ids from the dropdown.
  if (['salon', 'hvac', 'realestate', 'portfolio', 'general'].includes(s.toLowerCase())) {
    return s.toLowerCase();
  }
  if (SALON_RX.test(s)) return 'salon';
  if (isHvac(s)) return 'hvac';
  if (isRealEstate(s)) return 'realestate';
  if (isPortfolio(s)) return 'portfolio';
  return 'general';
}

const SUPPORTED_LANGS = ['en', 'pt'];
const VALID_THEMES = ['salon', 'hvac', 'realestate', 'portfolio', 'general'];

// Map a theme id → a clean industry label the site generator's template
// detectors (isHvac / isSalonIndustry / isRealEstate / isPortfolio)
// recognize. Used by the intake mapper so the right template is chosen.
const THEME_TO_INDUSTRY = {
  salon: 'Salon',
  hvac: 'HVAC',
  realestate: 'Real Estate',
  portfolio: 'Portfolio',
  general: 'General',
};

// ── Industry dropdown (Screen 1). Option id === theme. ──────────────────
const INDUSTRY_OPTIONS = {
  en: [
    { id: 'salon', title: 'Salon & Beauty' },
    { id: 'hvac', title: 'Home Services (HVAC, plumbing…)' },
    { id: 'realestate', title: 'Real Estate' },
    { id: 'portfolio', title: 'Creative / Portfolio' },
    { id: 'general', title: 'Other / General business' },
  ],
  pt: [
    { id: 'salon', title: 'Salão & Beleza' },
    { id: 'hvac', title: 'Serviços (climatização, encanamento…)' },
    { id: 'realestate', title: 'Imóveis' },
    { id: 'portfolio', title: 'Criativo / Portfólio' },
    { id: 'general', title: 'Outro / Negócio geral' },
  ],
};

// ── Currency dropdown (salon Screen 2). ─────────────────────────────────
const CURRENCY_OPTIONS = {
  en: [
    { id: 'USD', title: 'USD ($)' },
    { id: 'EUR', title: 'EUR (€)' },
    { id: 'GBP', title: 'GBP (£)' },
    { id: 'BRL', title: 'BRL (R$)' },
    { id: 'AED', title: 'AED (dh)' },
    { id: 'INR', title: 'INR (₹)' },
    { id: 'PKR', title: 'PKR (Rs)' },
  ],
  pt: [
    { id: 'BRL', title: 'BRL (R$)' },
    { id: 'USD', title: 'USD ($)' },
    { id: 'EUR', title: 'EUR (€)' },
    { id: 'GBP', title: 'GBP (£)' },
    { id: 'AED', title: 'AED (dh)' },
    { id: 'INR', title: 'INR (₹)' },
  ],
};

// ── Booking radio (salon Screen 2). ─────────────────────────────────────
const BOOKING_OPTIONS = {
  en: [
    { id: 'build', title: 'Build booking into my site' },
    { id: 'own', title: 'I use my own tool (I\'ll add it later)' },
  ],
  pt: [
    { id: 'build', title: 'Criar agendamento no meu site' },
    { id: 'own', title: 'Uso minha própria ferramenta (adiciono depois)' },
  ],
};

// ── Common labels (Screen 1 + Screen 3 + buttons). ──────────────────────
const L = {
  en: {
    common_title: 'About your business',
    l_name: "Business name",
    l_email: "Your email",
    l_industry: 'What kind of business?',
    next: 'Next',
    // salon
    salon_title: 'Salon details',
    l_currency: 'Currency for prices',
    l_booking: 'Booking',
    l_hours: 'Opening hours (optional)',
    hours_helper: 'e.g. Tue–Sat 9–7. Leave blank for standard hours.',
    l_services: 'Services & prices (optional)',
    services_helper: 'e.g. Haircut 30min 25, Colour 90min 85. Leave blank to add later.',
    // details (non-salon)
    details_title: 'A few details',
    // finish
    finish_title: 'Contact details',
    l_cemail: 'Email to show on site (optional)',
    l_cphone: 'Phone (optional)',
    l_caddress: 'Address (optional)',
    build: 'Build my site',
  },
  pt: {
    common_title: 'Sobre seu negócio',
    l_name: 'Nome do negócio',
    l_email: 'Seu email',
    l_industry: 'Que tipo de negócio?',
    next: 'Próximo',
    salon_title: 'Detalhes do salão',
    l_currency: 'Moeda dos preços',
    l_booking: 'Agendamento',
    l_hours: 'Horário (opcional)',
    hours_helper: 'Ex: Ter–Sáb 9–19. Deixe vazio para horário padrão.',
    l_services: 'Serviços & preços (opcional)',
    services_helper: 'Ex: Corte 30min 50, Cor 90min 120. Deixe vazio para adicionar depois.',
    details_title: 'Alguns detalhes',
    finish_title: 'Contato',
    l_cemail: 'Email para mostrar no site (opcional)',
    l_cphone: 'Telefone (opcional)',
    l_caddress: 'Endereço (opcional)',
    build: 'Criar meu site',
  },
};

// ── DETAILS screen fields per non-salon niche (2 TextAreas). ────────────
// f2 omitted (empty) → hidden. Labels kept ≤ component limits.
const DETAILS = {
  hvac: {
    title: { en: 'Service details', pt: 'Detalhes do serviço' },
    f1: {
      en: 'City + areas you serve',
      pt: 'Cidade + regiões atendidas',
    },
    f1_helper: { en: 'e.g. Austin: Round Rock, Cedar Park', pt: 'Ex: São Paulo: Centro, Zona Sul' },
    f2: { en: 'Services you offer', pt: 'Serviços que você oferece' },
    f2_helper: { en: 'e.g. AC repair, heating, duct cleaning', pt: 'Ex: ar-condicionado, aquecimento' },
  },
  realestate: {
    title: { en: 'Agent details', pt: 'Detalhes do corretor' },
    f1: { en: 'Your agent profile', pt: 'Seu perfil de corretor' },
    f1_helper: { en: 'Brokerage (or solo), years, designations. Or leave blank.', pt: 'Imobiliária (ou autônomo), anos, certificações. Ou deixe vazio.' },
    f2: { en: 'Listings to showcase (optional)', pt: 'Imóveis para destacar (opcional)' },
    f2_helper: { en: 'One per line. Or leave blank for placeholders.', pt: 'Um por linha. Ou deixe vazio.' },
  },
  portfolio: {
    title: { en: 'Your work', pt: 'Seu trabalho' },
    f1: { en: 'Short bio', pt: 'Bio curta' },
    f1_helper: { en: '1–2 sentences about you. Or leave blank.', pt: '1–2 frases sobre você. Ou deixe vazio.' },
    f2: { en: 'Projects to feature (optional)', pt: 'Projetos para destacar (opcional)' },
    f2_helper: { en: 'One per line. Or leave blank for placeholders.', pt: 'Um por linha. Ou deixe vazio.' },
  },
  general: {
    title: { en: 'Your services', pt: 'Seus serviços' },
    f1: { en: 'Services or products you offer', pt: 'Serviços ou produtos que você oferece' },
    f1_helper: { en: 'Separate with commas. Or leave blank.', pt: 'Separe por vírgulas. Ou deixe vazio.' },
    f2: { en: '', pt: '' }, // hidden
    f2_helper: { en: '', pt: '' },
  },
};

function pick(obj, lang) {
  if (!obj) return '';
  return obj[lang] || obj.en || '';
}

module.exports = {
  classifyTheme,
  SUPPORTED_LANGS,
  VALID_THEMES,
  THEME_TO_INDUSTRY,
  INDUSTRY_OPTIONS,
  CURRENCY_OPTIONS,
  BOOKING_OPTIONS,
  DETAILS,
  L,
  pick,
};
