// Per-tool WhatsApp prefill builder.
// Each prefill is short (~15-20 words) and contains exactly two signals:
//   1. Tool name — for SQL attribution via conversations.message_text
//   2. Trade declaration — for the salesBot to detect the `trade_declared` intent
//      (see src/llm/prompts.js:441-652)
// Result values are intentionally NOT included — they made messages feel
// templated and pushy. Short messages read like real human follow-ups.

export interface ToolPrefillResult {
  headline: string;
  subhead: string;
  whatsappPrefill: string;
}

interface PrefillData {
  [key: string]: string | number | undefined;
}

export function buildToolPrefill(slug: string, data: PrefillData): ToolPrefillResult {
  switch (slug) {
    case 'mortgage-calculator':
      return {
        headline: 'Run a real-estate business?',
        subhead: 'Pixie builds your full site — with this calculator built in.',
        whatsappPrefill:
          "Hi! Just used your Mortgage Calculator. I'm a real-estate agent — interested in a website.",
      };

    case 'pool-salt-calculator': {
      const isHigh = data.status === 'too-high';
      return {
        headline: 'Run a pool service business?',
        subhead: isHigh
          ? 'Pixie can build a pool-service site that calculates this for visitors.'
          : 'Pixie builds full booking sites — salt calculator included.',
        whatsappPrefill:
          'Hi! Just used your Pool Salt Calculator. I run a pool service — interested in a website.',
      };
    }

    case 'share-incentive-plan-calculator':
      return {
        headline: 'Run a UK accounting or fintech firm?',
        subhead: 'Pixie builds compliance-ready lead-gen sites.',
        whatsappPrefill:
          'Hi! Just used your SIP Calculator. I run a UK accounting firm — interested in a website.',
      };

    case 'ap-chem-score-calculator':
      return {
        headline: 'Teach AP Chemistry?',
        subhead: 'Pixie builds full tutoring sites — course pages, Stripe checkout, lead forms.',
        whatsappPrefill:
          'Hi! Just used your AP Chem Score Calculator. I teach AP Chemistry — interested in a tutoring site.',
      };

    case 'midpoint-calculator':
      return {
        headline: 'Teach math?',
        subhead: 'Pixie builds educational sites — interactive calculators included.',
        whatsappPrefill:
          'Hi! Just used your Midpoint Calculator. I teach math — interested in a tutoring site.',
      };

    case 'half-birthday-calculator':
      return {
        headline: 'Plan parties or sell gifts?',
        subhead: 'Pixie builds shoppable event sites in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Half Birthday Calculator. I run a party / gifting business — interested in a website.',
      };

    case 'trust-badge-generator':
      return {
        headline: 'Run an online store?',
        subhead: 'Pixie builds full ecommerce sites — trust badges baked into checkout.',
        whatsappPrefill:
          'Hi! Just used your Trust Badge Generator. I run an online store — interested in a full ecommerce site.',
      };

    case 'ambigram-generator':
      return {
        headline: 'Need a full logo & brand?',
        subhead: 'Pixie designs logos, brand kits, and websites from a single chat.',
        whatsappPrefill:
          'Hi! Just used your Ambigram Generator. I want a custom logo and brand identity.',
      };

    case 'superscript-generator':
      return {
        headline: 'Run a creator business?',
        subhead: 'Pixie builds creator sites with shop, links, and content blocks.',
        whatsappPrefill:
          "Hi! Just used your Superscript Generator. I'm a creator — interested in a personal-brand site.",
      };

    case 'subscript-generator':
      return {
        headline: 'Teach science?',
        subhead: 'Pixie builds science tutoring sites with course pages and checkout.',
        whatsappPrefill:
          'Hi! Just used your Subscript Generator. I teach chemistry — interested in a tutoring site.',
      };

    case 'ap-bio-score-calculator':
      return {
        headline: 'Teach AP Biology?',
        subhead: 'Pixie generates your tutoring website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your AP Bio Score Calculator. I teach AP Biology — interested in a tutoring site.',
      };

    case 'ap-calc-ab-score-calculator':
      return {
        headline: 'Teach calculus?',
        subhead: 'Pixie generates your tutoring website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your AP Calc AB Score Calculator. I teach calculus — interested in a tutoring site.',
      };

    case 'ap-psych-score-calculator':
      return {
        headline: 'Teach AP Psychology?',
        subhead: 'Pixie generates your tutoring website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your AP Psych Score Calculator. I teach AP Psychology — interested in a tutoring site.',
      };

    case 'calculator-bacalaureat':
      return {
        headline: 'Ești profesor sau meditator?',
        subhead: 'Pixie îți generează site-ul în 60 de secunde.',
        whatsappPrefill:
          'Salut! Tocmai am folosit Calculatorul Bacalaureat. Sunt profesor/meditator — mă interesează un site.',
      };

    case 'crosswind-calculator':
      return {
        headline: 'Run a flight school or aviation blog?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Crosswind Calculator. I run a flight school — interested in a website.',
      };

    case 'dunk-calculator':
      return {
        headline: 'Run a basketball gym or coaching business?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Dunk Calculator. I run a basketball training program — interested in a website.',
      };

    case 'dots-calculator':
      return {
        headline: 'Run a powerlifting gym or coaching service?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your DOTS Calculator. I run a powerlifting gym / coaching service — interested in a website.',
      };

    case 'middle-name-generator':
      return {
        headline: 'Running a baby brand or parenting blog?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Middle Name Generator. I run a baby/parenting brand — interested in a website.',
      };

    case 'era-calculator':
      return {
        headline: 'Run a baseball academy or sports blog?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your ERA Calculator. I run a baseball academy / sports site — interested in a website.',
      };

    case 'uma-affinity-calculator':
      return {
        headline: 'Running a gaming blog or esports brand?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Uma Affinity Calculator. I run a gaming blog — interested in a website.',
      };

    case 'fancy-text-generator':
      return {
        headline: 'Run a creator business?',
        subhead: 'Pixie builds creator sites with shop, links, and content blocks.',
        whatsappPrefill:
          "Hi! Just used your Fancy Text Generator. I'm a creator — interested in a personal-brand site.",
      };

    case 'glitch-text-generator':
      return {
        headline: 'Run a gaming or streaming brand?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Glitch Text Generator. I run a gaming/streaming brand — interested in a website.',
      };

    case 'heart-symbol-generator':
      return {
        headline: 'Run a shop or creator brand?',
        subhead: 'Pixie builds full sites — shop, links, and content blocks.',
        whatsappPrefill:
          'Hi! Just used your Heart Symbol Generator. I run a creator/shop brand — interested in a website.',
      };

    case 'tiny-text-generator':
      return {
        headline: 'Building a personal brand?',
        subhead: 'Pixie builds creator sites with shop, links, and content blocks.',
        whatsappPrefill:
          "Hi! Just used your Tiny Text Generator. I'm a creator — interested in a personal-brand site.",
      };

    case 'upside-down-text-generator':
      return {
        headline: 'Run a creator or fun brand?',
        subhead: 'Pixie generates your website in 60 seconds.',
        whatsappPrefill:
          "Hi! Just used your Upside Down Text Generator. I'm a creator — interested in a website.",
      };

    case 'invisible-text-generator':
      return {
        headline: 'Need a real website, not a blank space?',
        subhead: 'Pixie builds full websites in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Invisible Text Generator — interested in a website for my business.',
      };

    case 'bold-text-generator':
      return {
        headline: 'Posting to grow a brand?',
        subhead: 'Pixie builds creator and business sites in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Bold Text Generator. I post to grow my brand — interested in a website.',
      };

    case 'strikethrough-text-generator':
      return {
        headline: 'Run an online store?',
        subhead: 'Pixie builds full ecommerce sites — price drops and all.',
        whatsappPrefill:
          'Hi! Just used your Strikethrough Text Generator. I run an online store — interested in a website.',
      };

    case 'text-summarizer':
      return {
        headline: 'Run a tutoring or content business?',
        subhead: 'Pixie builds full sites — course pages, lead forms, checkout.',
        whatsappPrefill:
          'Hi! Just used your Text Summarizer. I run a tutoring/content business — interested in a website.',
      };

    case 'ai-text-humanizer':
      return {
        headline: 'Run a content or marketing business?',
        subhead: 'Pixie builds full sites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your AI Text Humanizer. I run a content/marketing business — interested in a website.',
      };

    case 'da-pa-checker':
      return {
        headline: 'Want to actually raise your authority?',
        subhead: 'Pixie builds SEO-ready sites and runs full audits — text us on WhatsApp.',
        whatsappPrefill:
          "Hi! Just used your DA/PA Checker. I want to improve my website's SEO — interested in a website and SEO audit.",
      };

    case 'zalgo-text-generator':
      return {
        headline: 'Run a gaming or music brand?',
        subhead: 'Pixie builds full websites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Zalgo Text Generator. I run a gaming/music brand — interested in a website.',
      };

    case 'cursed-text-generator':
      return {
        headline: 'Run a gaming or streaming brand?',
        subhead: 'Pixie builds full websites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Cursed Text Generator. I run a gaming/streaming brand — interested in a website.',
      };

    case 'backwards-text-generator':
      return {
        headline: 'Run a puzzle or education brand?',
        subhead: 'Pixie builds full websites from one WhatsApp message.',
        whatsappPrefill:
          'Hi! Just used your Backwards Text Generator. I run a content/education brand — interested in a website.',
      };

    case 'cool-text-generator':
      return {
        headline: 'Need a real logo and brand identity?',
        subhead: 'Pixie delivers logos, websites, and ads from one WhatsApp message.',
        whatsappPrefill:
          'Hi! Just used your Cool Text Generator. I need a logo and website for my brand.',
      };

    case 'compare-text':
      return {
        headline: 'Run a legal, editorial, or dev team?',
        subhead: 'Pixie builds full websites and internal tools from one WhatsApp message.',
        whatsappPrefill:
          'Hi! Just used your Compare Text tool. I run a business that needs a website — interested.',
      };

    case 'pdf-to-text':
      return {
        headline: 'Drowning in documents?',
        subhead: 'Pixie builds websites and tools that handle them — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your PDF to Text tool. I run a business — interested in a website.',
      };

    case 'image-to-text':
      return {
        headline: 'Digitizing receipts, forms, or docs?',
        subhead: 'Pixie builds the website and tools around it — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Image to Text (OCR) tool. I run a business — interested in a website.',
      };

    case 'text-to-speech':
      return {
        headline: 'Need real AI voiceovers or an accessible site?',
        subhead: 'Pixie builds it from one WhatsApp message.',
        whatsappPrefill:
          'Hi! Just used your Text to Speech tool. I need an accessible website — interested.',
      };

    case 'audio-to-text':
      return {
        headline: 'Run a podcast, agency, or research team?',
        subhead: 'Pixie builds the website and workflow around your content — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Audio to Text tool. I run a podcast/agency — interested in a website.',
      };

    case 'random-food-generator':
      return {
        headline: 'Run a restaurant, café, or food truck?',
        subhead: 'Pixie builds full ordering sites with menus and checkout in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Random Food Generator. I run a food business — interested in a website.',
      };

    case 'random-emoji-generator':
      return {
        headline: 'Run a social or content brand?',
        subhead: 'Pixie builds full websites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Random Emoji Generator. I run a content brand — interested in a website.',
      };

    case 'xbox-gamertag-generator':
      return {
        headline: 'Building a gaming or streaming brand?',
        subhead: 'Pixie builds your full website in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Xbox Gamertag Generator. I run a gaming brand — interested in a website.',
      };

    case 'viking-name-generator':
    case 'pirate-name-generator':
    case 'anime-name-generator':
    case 'superhero-name-generator':
      return {
        headline: 'Building a game, story, or creative brand?',
        subhead: 'Pixie builds full websites from one WhatsApp message.',
        whatsappPrefill:
          'Hi! Just used your name generator. I run a creative/gaming brand — interested in a website.',
      };

    case 'speech-bubble-meme-generator':
      return {
        headline: 'Run a meme page or social brand?',
        subhead: 'Pixie builds full websites and link-in-bio pages in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your Speech Bubble Meme Generator. I run a social brand — interested in a website.',
      };

    case 'fire-text-generator':
      return {
        headline: 'Need a real logo and brand identity?',
        subhead: 'Pixie delivers logos, websites, and ads from one WhatsApp message.',
        whatsappPrefill:
          'Hi! Just used your Fire Text Generator. I need a logo and website for my brand.',
      };

    case 'mission-statement-generator':
      return {
        headline: 'Got your mission — now build the brand?',
        subhead: 'Pixie turns it into a full website: logo, copy, and pages.',
        whatsappPrefill:
          'Hi! Just used your Mission Statement Generator. I want a website and brand built around it.',
      };

    case 'qr-code-generator':
      return {
        headline: 'Want the website that QR points to?',
        subhead: 'Pixie builds your full site in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your QR Code Generator. I need a website for my business — interested.',
      };

    case 'word-counter':
    case 'case-converter':
      return {
        headline: 'Run a writing or content business?',
        subhead: 'Pixie builds full websites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your text tool. I run a content/writing business — interested in a website.',
      };

    case 'password-generator':
      return {
        headline: 'Building a product that needs real security?',
        subhead: 'Pixie builds full websites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your Password Generator. I need a website built — interested.',
      };

    case 'age-calculator':
    case 'bmi-calculator':
      return {
        headline: 'Run a health, fitness, or events brand?',
        subhead: 'Pixie builds full booking websites in 60 seconds.',
        whatsappPrefill:
          'Hi! Just used your calculator. I run a health/fitness business — interested in a website.',
      };

    case 'business-name-generator':
      return {
        headline: 'Got the name — now build it?',
        subhead: 'Pixie turns it into a full brand and website: logo, domain, pages.',
        whatsappPrefill:
          'Hi! Just used your Business Name Generator. I\'m starting a business and need a website.',
      };

    case 'slogan-generator':
      return {
        headline: 'Got your tagline — now the brand?',
        subhead: 'Pixie builds the full brand and website around it.',
        whatsappPrefill:
          'Hi! Just used your Slogan Generator. I want a website and brand built around it.',
      };

    case 'image-resizer':
    case 'color-picker':
      return {
        headline: 'Need a fast, well-designed website?',
        subhead: 'Pixie builds full sites in 60 seconds — text us on WhatsApp.',
        whatsappPrefill:
          'Hi! Just used your design tool. I need a website built — interested.',
      };

    default:
      return {
        headline: 'Want a site like this?',
        subhead: 'Pixie builds full websites in 60 seconds — just text us.',
        whatsappPrefill: 'Hi! Just used a Pixie tool — interested in a website.',
      };
  }
}
