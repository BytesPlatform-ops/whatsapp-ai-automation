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

// ── Niche dropdown (portfolio DETAILS screen). Option id maps to a
//    sub-template via NICHE_TO_TEMPLATE in templates/portfolio/index.js. ──
const NICHE_OPTIONS = {
  en: [
    { id: 'photographer', title: 'Photographer / Videographer' },
    { id: 'designer', title: 'Designer / Creative' },
    { id: 'developer', title: 'Developer / Engineer' },
    { id: 'writer', title: 'Writer / Other' },
  ],
  pt: [
    { id: 'photographer', title: 'Fotógrafo / Videomaker' },
    { id: 'designer', title: 'Designer / Criativo' },
    { id: 'developer', title: 'Desenvolvedor / Engenheiro' },
    { id: 'writer', title: 'Escritor / Outro' },
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

// ── "Add another?" radio on the LISTING screen (real estate). ───────────
const ADDMORE_LISTING_OPTIONS = {
  en: [
    { id: 'add', title: '➕ Add another listing' },
    { id: 'done', title: '✓ That\'s all my listings' },
  ],
  pt: [
    { id: 'add', title: '➕ Adicionar outro imóvel' },
    { id: 'done', title: '✓ Esses são todos' },
  ],
};

// ── Listing status dropdown (LISTING screen). IDs stay English — the site
//    generator matches on these exact strings (['For Sale','Just Listed',
//    'Pending','Sold']); only the titles are localized. ──────────────────
const LISTING_STATUS_OPTIONS = {
  en: [
    { id: 'For Sale', title: 'For Sale' },
    { id: 'Just Listed', title: 'Just Listed' },
    { id: 'Pending', title: 'Pending' },
    { id: 'Sold', title: 'Sold' },
  ],
  pt: [
    { id: 'For Sale', title: 'À venda' },
    { id: 'Just Listed', title: 'Recém anunciado' },
    { id: 'Pending', title: 'Em negociação' },
    { id: 'Sold', title: 'Vendido' },
  ],
};

// ── Common labels (Screen 1 + Screen 3 + buttons). ──────────────────────
// NOTE: WhatsApp auto-appends " (Optional)" to any non-required field's
// label — so labels here must NEVER include "(optional)" themselves, and
// stay short (the review screen truncates long labels).
const L = {
  en: {
    flow_offer: "Or, if it's easier than typing — tap below and I'll build your site from a few quick questions. Free to preview, ready in about 60 seconds 👇",
    flow_cta: 'Build my website',
    common_title: 'About your business',
    l_name: 'Business name',
    l_business_desc: 'What does your business do?',
    business_desc_helper: 'A sentence or two — what you offer and who for.',
    l_email: 'Your email',
    l_industry: 'What kind of business?',
    l_logo: 'Your logo',
    l_logo_desc: "Upload it and I'll clean up the background. Skip if you don't have one.",
    next: 'Next',
    // portfolio
    pniche_title: 'What do you do?',
    l_niche: 'What kind of work do you do?',
    l_bio: 'Short bio',
    bio_helper: 'A line about you and the kind of work you do. Or leave blank.',
    l_photos: 'Your work',
    photos_desc: "Upload a few of your best pieces — up to 6. Or skip and I'll add visuals.",
    l_skills: 'Skills & tools',
    skills_helper: 'e.g. React, Node, Figma, AWS. Comma-separated. Or leave blank.',
    l_links: 'Your links',
    links_helper: 'GitHub, LinkedIn, Instagram, Behance… paste any. Or leave blank.',
    l_pyears: 'Years of experience',
    pyears_helper: 'e.g. 6. Or leave blank.',
    l_focus: 'Currently working on',
    focus_helper: "What you're building right now. Or leave blank.",
    portfolio2_title: 'Your work & links',
    l_about_photo: 'A photo of you',
    about_photo_desc: "A headshot for your About section — optional. Skip and I'll keep it text-only.",
    l_projects: 'Projects to feature',
    projects_helper: "One per line. Or leave blank — I'll add visuals for you.",
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
    sname_helper: 'e.g. Haircut',
    l_sprice: 'Price',
    sprice_helper: 'e.g. 25',
    l_sdur: 'Duration',
    sdur_helper: 'e.g. 30 min',
    l_addmore: 'Add more?',
    added_prefix: 'Added so far: ',
    continue: 'Continue',
    // listings (real estate — structured, looped)
    listing_title: 'Your listings',
    l_address: 'Address',
    address_helper: 'e.g. 45 Elm St',
    l_lprice: 'Price',
    lprice_helper: 'e.g. 525000',
    l_status: 'Status',
    l_beds: 'Beds',
    beds_helper: 'e.g. 3',
    l_baths: 'Baths',
    baths_helper: 'e.g. 2',
    l_sqft: 'Sqft',
    sqft_helper: 'e.g. 1800',
    l_neighborhood: 'Neighborhood',
    neighborhood_helper: 'e.g. Westlake. Or leave blank.',
    l_lphoto: 'Listing photo',
    l_lphoto_desc: 'Add a photo of this property, or skip for a stock image.',
    // agent profile (real estate — structured)
    agent_title: 'Agent details',
    l_brokerage: 'Brokerage',
    brokerage_helper: 'Your brokerage — or your own name if you work solo.',
    l_years: 'Years in real estate',
    years_helper: 'e.g. 8',
    l_designations: 'Designations',
    designations_helper: 'e.g. CRS, ABR, CCIM. Or leave blank.',
    // hvac services (structured, looped — name only)
    hsvc_title: 'Services you offer',
    l_hsvc: 'Service',
    hsvc_helper: 'e.g. AC repair',
    // details (non-salon)
    details_title: 'A few details',
    // finish
    finish_title: 'Contact details',
    l_cemail: 'Contact email',
    l_ccode: 'Country code',
    l_cphone: 'Phone number',
    l_caddress: 'Address',
    build: 'Build my site',
    phone_error: "That number doesn't look right for the country you picked — please check it, or clear the field to skip.",
  },
  pt: {
    flow_offer: 'Ou, se for mais fácil que digitar — toque abaixo e eu monto seu site com algumas perguntas rápidas. Grátis pra ver, fica pronto em uns 60 segundos 👇',
    flow_cta: 'Criar meu site',
    common_title: 'Sobre seu negócio',
    l_name: 'Nome do negócio',
    l_business_desc: 'O que seu negócio faz?',
    business_desc_helper: 'Uma ou duas frases — o que você oferece e para quem.',
    l_email: 'Seu email',
    l_industry: 'Que tipo de negócio?',
    l_logo: 'Sua logo',
    l_logo_desc: 'Envie e eu limpo o fundo. Pule se não tiver.',
    next: 'Próximo',
    pniche_title: 'O que você faz?',
    l_niche: 'Que tipo de trabalho você faz?',
    l_bio: 'Bio curta',
    bio_helper: 'Uma frase sobre você e o tipo de trabalho que faz. Ou deixe vazio.',
    l_photos: 'Seu trabalho',
    photos_desc: 'Envie alguns dos seus melhores trabalhos — até 6. Ou pule e eu adiciono os visuais.',
    l_skills: 'Habilidades & ferramentas',
    skills_helper: 'Ex: React, Node, Figma, AWS. Separe por vírgulas. Ou deixe vazio.',
    l_links: 'Seus links',
    links_helper: 'GitHub, LinkedIn, Instagram, Behance… cole os que tiver. Ou deixe vazio.',
    l_pyears: 'Anos de experiência',
    pyears_helper: 'Ex: 6. Ou deixe vazio.',
    l_focus: 'No que está trabalhando',
    focus_helper: 'O que você está construindo agora. Ou deixe vazio.',
    portfolio2_title: 'Trabalho & links',
    l_about_photo: 'Uma foto sua',
    about_photo_desc: 'Um retrato para a seção Sobre — opcional. Pule e deixo só texto.',
    l_projects: 'Projetos para destacar',
    projects_helper: 'Um por linha. Ou deixe vazio — eu adiciono os visuais.',
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
    sname_helper: 'Ex: Corte de cabelo',
    l_sprice: 'Preço',
    sprice_helper: 'Ex: 50',
    l_sdur: 'Duração',
    sdur_helper: 'Ex: 30 min',
    l_addmore: 'Adicionar mais?',
    added_prefix: 'Adicionados: ',
    continue: 'Continuar',
    listing_title: 'Seus imóveis',
    l_address: 'Endereço',
    address_helper: 'Ex: Rua das Flores, 45',
    l_lprice: 'Preço',
    lprice_helper: 'Ex: 525000',
    l_status: 'Situação',
    l_beds: 'Quartos',
    beds_helper: 'Ex: 3',
    l_baths: 'Banheiros',
    baths_helper: 'Ex: 2',
    l_sqft: 'Área (sq ft)',
    sqft_helper: 'Ex: 1800',
    l_neighborhood: 'Bairro',
    neighborhood_helper: 'Ex: Centro. Ou deixe vazio.',
    l_lphoto: 'Foto do imóvel',
    l_lphoto_desc: 'Adicione uma foto do imóvel, ou pule para uma imagem padrão.',
    agent_title: 'Detalhes do corretor',
    l_brokerage: 'Imobiliária',
    brokerage_helper: 'Sua imobiliária — ou seu nome se for autônomo.',
    l_years: 'Anos no mercado imobiliário',
    years_helper: 'Ex: 8',
    l_designations: 'Certificações',
    designations_helper: 'Ex: CRS, ABR, CCIM. Ou deixe vazio.',
    hsvc_title: 'Serviços que você oferece',
    l_hsvc: 'Serviço',
    hsvc_helper: 'Ex: conserto de ar-condicionado',
    details_title: 'Alguns detalhes',
    finish_title: 'Contato',
    l_cemail: 'Email de contato',
    l_ccode: 'Código do país',
    l_cphone: 'Número de telefone',
    l_caddress: 'Endereço',
    build: 'Criar meu site',
    phone_error: 'Esse número não parece certo para o país escolhido — confira, ou deixe o campo em branco para pular.',
  },
};

// ── DETAILS screen fields per non-salon niche (2 TextAreas). ────────────
// f2 omitted (empty) → hidden. Labels kept ≤ component limits.
const DETAILS = {
  hvac: {
    title: { en: 'Areas you serve', pt: 'Áreas atendidas' },
    f1: {
      en: 'City + areas you serve',
      pt: 'Cidade + regiões atendidas',
    },
    f1_helper: { en: 'e.g. Austin: Round Rock, Cedar Park', pt: 'Ex: São Paulo: Centro, Zona Sul' },
    // Services are collected on the structured HVAC_SERVICE loop now (f2 hidden).
    f2: { en: '', pt: '' },
    f2_helper: { en: '', pt: '' },
  },
  realestate: {
    title: { en: 'Agent details', pt: 'Detalhes do corretor' },
    f1: { en: 'Your agent profile', pt: 'Seu perfil de corretor' },
    f1_helper: { en: 'Brokerage (or solo), years, designations. Or leave blank.', pt: 'Imobiliária (ou autônomo), anos, certificações. Ou deixe vazio.' },
    // Listings are collected on the dedicated structured LISTING screen now,
    // so the free-text field is hidden (empty → f2_visible false).
    f2: { en: '', pt: '' },
    f2_helper: { en: '', pt: '' },
  },
  portfolio: {
    title: { en: 'Your work', pt: 'Seu trabalho' },
    f1: { en: 'Short bio', pt: 'Bio curta' },
    f1_helper: { en: 'A line about you and the kind of work you do. Or leave blank.', pt: 'Uma frase sobre você e o tipo de trabalho que faz. Ou deixe vazio.' },
    f2: { en: 'Projects to feature (optional)', pt: 'Projetos para destacar (opcional)' },
    f2_helper: { en: "One per line. Or leave blank — I'll add visuals for you.", pt: 'Um por linha. Ou deixe vazio — eu adiciono os visuais.' },
  },
  general: {
    title: { en: 'Your services', pt: 'Seus serviços' },
    f1: { en: 'Services or products you offer', pt: 'Serviços ou produtos que você oferece' },
    f1_helper: { en: 'Separate with commas. Or leave blank.', pt: 'Separe por vírgulas. Ou deixe vazio.' },
    f2: { en: '', pt: '' }, // hidden
    f2_helper: { en: '', pt: '' },
  },
};

// ── Discrete profile-link slots for the PORTFOLIO_WORK screen. ──────────
// Instead of one "paste any" field, each niche shows up to 3 labelled link
// inputs so the user knows exactly what to drop in. Only platforms the shared
// parser (portfolioLinksParse.js) actually captures are offered — so nothing a
// user types is silently dropped. The endpoint joins the filled slots back into
// the single `p_links` blob, so parsing/intake/templates stay unchanged.
// `key` is the parser keyword (portfolioLinksParse.js) the endpoint tags a bare
// username/@handle with, so it resolves to the right network even without a URL.
const LINK = {
  github: { key: 'github', label: { en: 'GitHub', pt: 'GitHub' }, helper: { en: 'github.com/you — or just your username', pt: 'github.com/voce — ou só seu usuário' } },
  linkedin: { key: 'linkedin', label: { en: 'LinkedIn', pt: 'LinkedIn' }, helper: { en: 'linkedin.com/in/you', pt: 'linkedin.com/in/voce' } },
  twitter: { key: 'twitter', label: { en: 'X / Twitter', pt: 'X / Twitter' }, helper: { en: '@handle', pt: '@usuario' } },
  instagram: { key: 'instagram', label: { en: 'Instagram', pt: 'Instagram' }, helper: { en: 'instagram.com/you — or @handle', pt: 'instagram.com/voce — ou @usuario' } },
  behance: { key: 'behance', label: { en: 'Behance', pt: 'Behance' }, helper: { en: 'behance.net/you', pt: 'behance.net/voce' } },
};

// ── PORTFOLIO screen field config per creative niche. ───────────────────
// The niche is picked FIRST (PNICHE screen) so the endpoint can tailor the
// PORTFOLIO screen to it: it toggles each optional field's `*_visible` and
// applies a couple of label overrides. bio + links show for every niche.
// Visual niches (photographer/designer) get a PhotoPicker for real work
// samples (→ project.photoUrl); the others give project text instead.
// `skills_label` / `skills_helper` / `photos_desc` override the shared L
// defaults when present (e.g. a designer's "Tools" vs a developer's "Skills").
const NICHE_FIELDS = {
  photographer: {
    title: { en: 'Your photography', pt: 'Sua fotografia' },
    photos: true, skills: false, years: true, focus: true, projects: false,
    aboutPhoto: true,
    photos_desc: {
      en: "Upload a few of your best shots — up to 6. Or skip and I'll add visuals.",
      pt: 'Envie algumas das suas melhores fotos — até 6. Ou pule e eu adiciono os visuais.',
    },
    links: [LINK.instagram, LINK.behance, LINK.linkedin],
  },
  designer: {
    title: { en: 'Your design work', pt: 'Seu trabalho de design' },
    photos: true, skills: true, years: true, focus: true, projects: false,
    skills_label: { en: 'Tools', pt: 'Ferramentas' },
    skills_helper: {
      en: 'e.g. Figma, Photoshop, Illustrator. Comma-separated. Or leave blank.',
      pt: 'Ex: Figma, Photoshop, Illustrator. Separe por vírgulas. Ou deixe vazio.',
    },
    photos_desc: {
      en: "Upload a few work samples — up to 6. Or skip and I'll add visuals.",
      pt: 'Envie algumas amostras do seu trabalho — até 6. Ou pule e eu adiciono os visuais.',
    },
    links: [LINK.behance, LINK.instagram, LINK.linkedin],
  },
  developer: {
    title: { en: 'Your dev work', pt: 'Seu trabalho dev' },
    photos: false, skills: true, years: true, focus: true, projects: true,
    links: [LINK.github, LINK.linkedin, LINK.twitter],
  },
  writer: {
    title: { en: 'Your work', pt: 'Seu trabalho' },
    photos: false, skills: false, years: false, focus: true, projects: true,
    aboutPhoto: true,
    links: [LINK.linkedin, LINK.twitter, LINK.instagram],
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
  NICHE_OPTIONS,
  CURRENCY_OPTIONS,
  BOOKING_OPTIONS,
  ADDMORE_OPTIONS,
  ADDMORE_LISTING_OPTIONS,
  LISTING_STATUS_OPTIONS,
  COUNTRY_CODES,
  DETAILS,
  NICHE_FIELDS,
  L,
  pick,
};
