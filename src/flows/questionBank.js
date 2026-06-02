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
const { COUNTRY_CODES } = require('./countryCodes');

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
const CURRENCY_LIST = [
  { id: 'USD', title: 'USD ($) — US Dollar' },
  { id: 'EUR', title: 'EUR (€) — Euro' },
  { id: 'GBP', title: 'GBP (£) — British Pound' },
  { id: 'BRL', title: 'BRL (R$) — Brazilian Real' },
  { id: 'AED', title: 'AED (dh) — UAE Dirham' },
  { id: 'INR', title: 'INR (₹) — Indian Rupee' },
  { id: 'PKR', title: 'PKR (Rs) — Pakistani Rupee' },
  { id: 'CAD', title: 'CAD (C$) — Canadian Dollar' },
  { id: 'AUD', title: 'AUD (A$) — Australian Dollar' },
  { id: 'SAR', title: 'SAR (﷼) — Saudi Riyal' },
  { id: 'QAR', title: 'QAR (﷼) — Qatari Riyal' },
  { id: 'ZAR', title: 'ZAR (R) — South African Rand' },
  { id: 'NGN', title: 'NGN (₦) — Nigerian Naira' },
  { id: 'MXN', title: 'MXN ($) — Mexican Peso' },
  { id: 'JPY', title: 'JPY (¥) — Japanese Yen' },
  { id: 'CNY', title: 'CNY (¥) — Chinese Yuan' },
  { id: 'CHF', title: 'CHF (Fr) — Swiss Franc' },
  { id: 'SEK', title: 'SEK (kr) — Swedish Krona' },
  { id: 'NOK', title: 'NOK (kr) — Norwegian Krone' },
  { id: 'DKK', title: 'DKK (kr) — Danish Krone' },
  { id: 'PLN', title: 'PLN (zł) — Polish Zloty' },
  { id: 'TRY', title: 'TRY (₺) — Turkish Lira' },
  { id: 'EGP', title: 'EGP (£) — Egyptian Pound' },
  { id: 'KES', title: 'KES (KSh) — Kenyan Shilling' },
  { id: 'BDT', title: 'BDT (৳) — Bangladeshi Taka' },
  { id: 'LKR', title: 'LKR (Rs) — Sri Lankan Rupee' },
  { id: 'IDR', title: 'IDR (Rp) — Indonesian Rupiah' },
  { id: 'MYR', title: 'MYR (RM) — Malaysian Ringgit' },
  { id: 'PHP', title: 'PHP (₱) — Philippine Peso' },
  { id: 'SGD', title: 'SGD (S$) — Singapore Dollar' },
  { id: 'THB', title: 'THB (฿) — Thai Baht' },
  { id: 'VND', title: 'VND (₫) — Vietnamese Dong' },
  { id: 'NZD', title: 'NZD (NZ$) — New Zealand Dollar' },
  { id: 'KWD', title: 'KWD (د.ك) — Kuwaiti Dinar' },
  { id: 'BHD', title: 'BHD (.د.ب) — Bahraini Dinar' },
  { id: 'OMR', title: 'OMR (﷼) — Omani Rial' },
  { id: 'MAD', title: 'MAD (dh) — Moroccan Dirham' },
  { id: 'ARS', title: 'ARS ($) — Argentine Peso' },
  { id: 'CLP', title: 'CLP ($) — Chilean Peso' },
  { id: 'COP', title: 'COP ($) — Colombian Peso' },
];
// PT market sees BRL first.
const CURRENCY_OPTIONS = {
  en: CURRENCY_LIST,
  pt: [CURRENCY_LIST.find((c) => c.id === 'BRL'), ...CURRENCY_LIST.filter((c) => c.id !== 'BRL')],
};

// ── Booking radio (salon Screen 2). ─────────────────────────────────────
const BOOKING_OPTIONS = {
  en: [
    { id: 'build', title: 'Build online booking into my site' },
    { id: 'own', title: 'I use my own tool (Fresha, Booksy…)' },
  ],
  pt: [
    { id: 'build', title: 'Criar agendamento no meu site' },
    { id: 'own', title: 'Uso minha ferramenta (Fresha, Booksy…)' },
  ],
};

// ── "Add another?" radio on the SERVICE screen. Not required — leaving it
//    blank (or picking "done") proceeds; picking "add" loops for one more.
const ADDMORE_OPTIONS = {
  en: [
    { id: 'add', title: '➕ Add another service' },
    { id: 'done', title: '✓ That\'s all my services' },
  ],
  pt: [
    { id: 'add', title: '➕ Adicionar outro serviço' },
    { id: 'done', title: '✓ Esses são todos' },
  ],
};

// ── Common labels (Screen 1 + Screen 3 + buttons). ──────────────────────
// NOTE: WhatsApp auto-appends " (Optional)" to any non-required field's
// label — so labels here must NEVER include "(optional)" themselves, and
// stay short (the review screen truncates long labels).
const L = {
  en: {
    flow_offer: "Or, if it's easier than typing — tap below and I'll build your site from a few quick questions. Free to preview, ready in about 60 seconds 👇",
    common_title: 'About your business',
    l_name: 'Business name',
    l_email: 'Your email',
    l_industry: 'What kind of business?',
    l_logo: 'Your logo',
    l_logo_desc: "Upload it and I'll clean up the background. Skip if you don't have one.",
    next: 'Next',
    // salon
    salon_title: 'Salon details',
    l_currency: 'Currency',
    l_booking_heading: 'Online booking',
    l_booking: 'How should clients book?',
    l_booking_link: 'Your booking link',
    booking_link_helper: 'Paste your Fresha, Booksy or Calendly link — or skip and add it later.',
    l_hours: 'Opening hours',
    hours_helper: 'e.g. Tue–Sat 9–7. Blank = standard hours.',
    // services (salon — structured, looped)
    service_title: 'Your services',
    l_sname: 'Service name',
    l_sprice: 'Price',
    sprice_helper: 'e.g. 25 or $25',
    l_sdur: 'Duration',
    sdur_helper: 'e.g. 30 min',
    l_addmore: 'Add more?',
    added_prefix: 'Added so far: ',
    continue: 'Continue',
    // details (non-salon)
    details_title: 'A few details',
    // finish
    finish_title: 'Contact details',
    l_cemail: 'Contact email',
    l_ccode: 'Country code',
    l_cphone: 'Phone number',
    l_caddress: 'Address',
    build: 'Build my site',
  },
  pt: {
    flow_offer: 'Ou, se for mais fácil que digitar — toque abaixo e eu monto seu site com algumas perguntas rápidas. Grátis pra ver, fica pronto em uns 60 segundos 👇',
    common_title: 'Sobre seu negócio',
    l_name: 'Nome do negócio',
    l_email: 'Seu email',
    l_industry: 'Que tipo de negócio?',
    l_logo: 'Sua logo',
    l_logo_desc: 'Envie e eu limpo o fundo. Pule se não tiver.',
    next: 'Próximo',
    salon_title: 'Detalhes do salão',
    l_currency: 'Moeda',
    l_booking_heading: 'Agendamento online',
    l_booking: 'Como os clientes agendam?',
    l_booking_link: 'Seu link de agendamento',
    booking_link_helper: 'Cole seu link do Fresha, Booksy ou Calendly — ou pule e adicione depois.',
    l_hours: 'Horário',
    hours_helper: 'Ex: Ter–Sáb 9–19. Vazio = horário padrão.',
    service_title: 'Seus serviços',
    l_sname: 'Nome do serviço',
    l_sprice: 'Preço',
    sprice_helper: 'Ex: 50 ou R$50',
    l_sdur: 'Duração',
    sdur_helper: 'Ex: 30 min',
    l_addmore: 'Adicionar mais?',
    added_prefix: 'Adicionados: ',
    continue: 'Continuar',
    details_title: 'Alguns detalhes',
    finish_title: 'Contato',
    l_cemail: 'Email de contato',
    l_ccode: 'Código do país',
    l_cphone: 'Número de telefone',
    l_caddress: 'Endereço',
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
  ADDMORE_OPTIONS,
  COUNTRY_CODES,
  DETAILS,
  L,
  pick,
};
