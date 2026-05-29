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

    default:
      return {
        headline: 'Want a site like this?',
        subhead: 'Pixie builds full websites in 60 seconds — just text us.',
        whatsappPrefill: 'Hi! Just used a Pixie tool — interested in a website.',
      };
  }
}
