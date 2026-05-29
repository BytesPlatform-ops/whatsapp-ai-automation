'use strict';

// Question bank + theme classifier for the dynamic WhatsApp Flow.
//
// ONE flow serves every niche and both languages. Screen 1 (COMMON)
// collects business_name / email / industry. The endpoint then calls
// classifyTheme(industry) and serves the matching Screen-2 questions in
// the resolved language. Screen 3 (FINISH) collects contact info.
//
// Theme classification reuses the SAME niche detectors the website
// generator uses (isHvac / isRealEstate / isPortfolio from templates),
// so a niche that builds an HVAC site here also classifies as 'hvac'.
// The salon detector lives inside the big webDev.js handler and isn't
// exported, so we inline its one-line regex here (kept in sync with
// isSalonIndustry in webDev.js).

const { isHvac, isRealEstate, isPortfolio } = require('../website-gen/templates');

// Mirror of isSalonIndustry() in src/conversation/handlers/webDev.js.
const SALON_RX = /\b(salon|beauty|barber|spa|nail|hair|lash|brow|makeup)/i;

/**
 * Classify the industry free-text into one of the 5 flow themes.
 * Order matters: salon is checked first (its keywords like "hair" can
 * overlap other trades), then the trade/real-estate/portfolio detectors,
 * else 'general'. Returns 'salon' | 'hvac' | 'realestate' | 'portfolio'
 * | 'general'.
 */
function classifyTheme(industry) {
  const s = String(industry || '').trim();
  if (!s) return 'general';
  if (SALON_RX.test(s)) return 'salon';
  if (isHvac(s)) return 'hvac';
  if (isRealEstate(s)) return 'realestate';
  if (isPortfolio(s)) return 'portfolio';
  return 'general';
}

// Per-theme Screen-2 questions. Up to 4 fields (a1..a4). Empty string =
// field not shown (endpoint passes "" → that TextArea is hidden/skipped).
// Text mirrors Pixie's real chat questions, condensed for a form.
const Q = {
  salon: {
    title: { en: 'Salon details', pt: 'Detalhes do salão' },
    q1: {
      en: 'Which currency? e.g. GBP, EUR, USD.',
      pt: 'Qual moeda? Ex: BRL, R$, USD.',
    },
    q2: {
      en: 'Booking tool link (Fresha/Booksy/Vagaro/Calendly)? Or "no" and I build one.',
      pt: 'Link de agendamento (Fresha/Booksy/Vagaro/Calendly)? Ou "não" e eu crio um.',
    },
    q3: {
      en: 'Opening hours? e.g. Tue-Sat 9-7. Or "default".',
      pt: 'Horário de funcionamento? Ex: Ter-Sáb 9-19. Ou "padrão".',
    },
    q4: {
      en: 'Service durations + prices? e.g. Haircut 30min 25. Or "default".',
      pt: 'Serviços, duração e preços? Ex: Corte 30min 50. Ou "padrão".',
    },
  },
  hvac: {
    title: { en: 'Service details', pt: 'Detalhes do serviço' },
    q1: {
      en: 'Which city are you based in, and which areas do you serve? e.g. Austin: Round Rock, Cedar Park.',
      pt: 'Em qual cidade você atua e quais regiões atende? Ex: São Paulo: Centro, Zona Sul.',
    },
    q2: {
      en: 'Which services do you offer? (AC repair, heating, plumbing, electrical, roofing, etc.)',
      pt: 'Quais serviços você oferece? (ar-condicionado, aquecimento, encanamento, elétrica, etc.)',
    },
    q3: { en: '', pt: '' },
    q4: { en: '', pt: '' },
  },
  realestate: {
    title: { en: 'Agent details', pt: 'Detalhes do corretor' },
    q1: {
      en: 'Quick agent profile: brokerage (or "solo"), years in real estate, designations (CRS, ABR, SRS, GRI — or none). All in one message, or "skip".',
      pt: 'Perfil do corretor: imobiliária (ou "autônomo"), anos de experiência, certificações (CRECI, etc. — ou nenhuma). Tudo numa mensagem, ou "pular".',
    },
    q2: {
      en: 'Any current listings to showcase (up to 3)? Describe one per line: "45 Elm St, $525k, 4 bed 3 bath, 2200 sqft". Or "skip" for placeholders.',
      pt: 'Imóveis para destacar (até 3)? Um por linha: "Rua Elm 45, R$525mil, 4 quartos, 200m²". Ou "pular" para exemplos.',
    },
    q3: { en: '', pt: '' },
    q4: { en: '', pt: '' },
  },
  portfolio: {
    title: { en: 'Your work', pt: 'Seu trabalho' },
    q1: {
      en: 'Short bio for your hero — 1-2 sentences about you and what you do. Or "skip" and I\'ll generate one.',
      pt: 'Bio curta para o destaque — 1-2 frases sobre você e o que faz. Ou "pular" e eu gero uma.',
    },
    q2: {
      en: 'Projects to feature (up to 6)? One per line: "BrandX rebrand — 2024 — Lead Designer — behance.net/brandx". Or "skip".',
      pt: 'Projetos para destacar (até 6)? Um por linha: "Rebrand BrandX — 2024 — Designer — behance.net/brandx". Ou "pular".',
    },
    q3: { en: '', pt: '' },
    q4: { en: '', pt: '' },
  },
  general: {
    title: { en: 'Your services', pt: 'Seus serviços' },
    q1: {
      en: 'What services or products do you offer? List separated by commas, or "skip".',
      pt: 'Quais serviços ou produtos você oferece? Separe por vírgulas, ou "pular".',
    },
    q2: { en: '', pt: '' },
    q3: { en: '', pt: '' },
    q4: { en: '', pt: '' },
  },
};

// Common screen labels per language (Screen 1 + Screen 3 + buttons).
const L = {
  en: {
    name: "What's your business name?",
    email: "What's your email? We'll use it to send updates about your website.",
    industry: 'What industry are you in? e.g. tech, restaurant, real estate, salon, HVAC.',
    next: 'Next',
    contact: 'What contact info do you want on the site? Email, phone, and/or address.',
    build: 'Build my site',
    common_title: 'About your business',
    finish_title: 'Almost done',
  },
  pt: {
    name: 'Qual o nome do seu negócio?',
    email: 'Qual seu email? Usaremos para enviar novidades sobre seu site.',
    industry: 'Qual seu setor? Ex: tecnologia, restaurante, imóveis, salão, climatização.',
    next: 'Próximo',
    contact: 'Quais informações de contato quer no site? Email, telefone e/ou endereço.',
    build: 'Criar meu site',
    common_title: 'Sobre seu negócio',
    finish_title: 'Quase lá',
  },
};

const SUPPORTED_LANGS = ['en', 'pt'];

/**
 * Pick the question text for a theme + field + language, with an English
 * fallback if the language key is missing.
 */
function q(theme, field, lang) {
  const t = Q[theme] || Q.general;
  const entry = t[field] || { en: '', pt: '' };
  return entry[lang] || entry.en || '';
}

module.exports = { Q, L, classifyTheme, q, SUPPORTED_LANGS };
