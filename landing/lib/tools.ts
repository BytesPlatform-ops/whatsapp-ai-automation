export interface ToolFaq {
  q: string;
  a: string;
}

export interface ToolDefinition {
  slug: string;
  title: string;
  h1: string;
  shortName: string;
  tagline: string;
  metaDescription: string;
  keywords: string[];
  category: 'Generator' | 'Calculator' | 'Converter';
  emoji: string;
  image: string;
  imageAlt: string;
  primaryKeyword: string;
  intro: string;
  howItWorks: { title: string; description: string }[];
  faqs: ToolFaq[];
  relatedSlugs: string[];
  ctaHook: string;
  aboutHeading: string;
  about: string;
}

export const TOOLS: ToolDefinition[] = [
  {
    slug: 'trust-badge-generator',
    title: 'Trust Badge Generator — Free Ecommerce Trust Badges | Pixie',
    h1: 'Pixie Trust Badge Generator',
    shortName: 'Trust Badge Generator',
    tagline: 'Generate trust badges for your online store in seconds.',
    metaDescription:
      'Free trust badge generator for ecommerce stores. Create custom guarantee, secure checkout, and shipping badges with AI-written copy. No signup, instant download.',
    keywords: [
      'trust badge generator',
      'ecommerce trust badges',
      'secure checkout badge',
      'money back guarantee badge',
      'free trust seal generator',
    ],
    category: 'Generator',
    emoji: '🛡️',
    image: '/tools/trust-badge-generator.jpg',
    imageAlt: 'Laptop displaying a secure ecommerce checkout with trust signals',
    primaryKeyword: 'trust badge generator',
    intro:
      'Turn any guarantee, return policy, or security claim into a polished badge for your product pages and checkout. Pick a style, write the promise (or let AI write it for you), and download a PNG or SVG ready to drop into Shopify, WooCommerce, or any landing page.',
    howItWorks: [
      {
        title: 'Describe the promise',
        description: 'Type the guarantee you want to display — "30-day money back", "Secure SSL checkout", "Free shipping over $50". AI suggests sharper copy variants.',
      },
      {
        title: 'Pick a style',
        description: 'Choose from circle, shield, or ribbon shapes. Pick brand colors that match your site.',
      },
      {
        title: 'Download and paste',
        description: 'Export as PNG or SVG. Drop it on your product page, checkout, or footer. No code needed.',
      },
    ],
    faqs: [
      {
        q: 'What is a trust badge and why do I need one?',
        a: 'A trust badge is a small visual seal that signals safety, guarantees, or credibility to shoppers — like "Secure Checkout", "Money Back Guarantee", or "Free Shipping". Stores that display relevant trust badges near the buy button typically see conversion rate lifts of 10–30%.',
      },
      {
        q: 'Where should I place trust badges on my store?',
        a: 'Place them next to the "Add to Cart" or "Checkout" button (the highest-anxiety moments), in the footer for site-wide reassurance, and below long product descriptions. Avoid cluttering the hero — too many badges read as desperate.',
      },
      {
        q: 'Are these badges free for commercial use?',
        a: 'Yes. Badges generated here are 100% free for personal and commercial use on your own store. We do not watermark or require attribution.',
      },
      {
        q: 'What file formats can I download?',
        a: 'PNG (transparent background) and SVG (scalable vector). SVG is recommended for retina displays and easy color edits in your CSS.',
      },
      {
        q: 'Can I add my own custom text?',
        a: 'Yes. You control every word. Use the AI suggestion button if you want sharper, more conversion-focused copy variants.',
      },
    ],
    relatedSlugs: ['ambigram-generator', 'superscript-generator'],
    ctaHook: 'Want a full ecommerce site with trust badges, checkout, and SEO already wired in? Text Pixie on WhatsApp — your store ships in 60 seconds.',
    aboutHeading: 'Why trust badges actually move conversion',
    about:
      'Trust badges work because checkout is the moment of highest buyer anxiety. A study by the Baymard Institute found that 18% of US shoppers abandon carts because they "don\'t trust the site with credit card info". A visible "Secure SSL Checkout" badge directly addresses that anxiety. Money-back guarantees reduce purchase risk, free-shipping badges remove the surprise-fee objection, and warranty badges signal quality. The key is relevance — a "GDPR compliant" badge means nothing to a US shopper on a $20 t-shirt page, but a "30-day returns" badge does. Pick the two or three badges that match the actual fears your buyer has at the moment they\'re about to click pay.',
  },
  {
    slug: 'ambigram-generator',
    title: 'Ambigram Generator — Free AI Ambigram Maker | Pixie',
    h1: 'Pixie Ambigram Generator',
    shortName: 'Ambigram Generator',
    tagline: 'Create ambigram designs that read the same upside down.',
    metaDescription:
      'Free ambigram generator. Create rotational ambigrams, mirror ambigrams, and tattoo designs from any word. AI-powered word suggestions and style picker.',
    keywords: [
      'ambigram generator',
      'ambigram maker',
      'free ambigram',
      'tattoo ambigram',
      'rotational ambigram',
    ],
    category: 'Generator',
    emoji: '🔄',
    image: '/tools/ambigram-generator.jpg',
    imageAlt: 'Hand-lettered calligraphy and typography artwork',
    primaryKeyword: 'ambigram generator',
    intro:
      'Type a word — see it rendered as an ambigram that reads identically when you rotate it 180°. Perfect for tattoos, logos, jewelry engravings, and band names. AI suggests font pairings and word combinations that ambigram cleanly.',
    howItWorks: [
      {
        title: 'Enter a word or two',
        description: 'Single words work for rotational ambigrams. Two words work for mirror ambigrams where each reads the other when flipped.',
      },
      {
        title: 'Pick a style',
        description: 'Choose from gothic, script, modern, or tribal lettering. AI ranks which style fits your word best.',
      },
      {
        title: 'Download or share',
        description: 'Export as PNG with transparent background. Use for tattoos, logos, social posts, or print.',
      },
    ],
    faqs: [
      {
        q: 'What is an ambigram?',
        a: 'An ambigram is a word or design that reads the same (or as a different word) when rotated, flipped, or mirrored. The most common style is the rotational ambigram, where the word reads identically when turned upside down — famously used by the band Boston and the novel Angels & Demons.',
      },
      {
        q: 'Which words make the best ambigrams?',
        a: 'Words with symmetrical letter structures work best — letters like O, X, S, H, N, I, and Z. Short words (5–8 letters) are easier to design. Names like "Anna" or "Otto" are natural fits; longer asymmetric words like "Mountain" need more creative letterforms.',
      },
      {
        q: 'Can I use these ambigrams for tattoos?',
        a: 'Yes. Export at maximum size, take the PNG to your tattoo artist, and they can use it as the stencil reference. Many of our users build ambigram tattoos from names, dates, or meaningful phrases.',
      },
      {
        q: 'Is this free for commercial use?',
        a: 'Yes. Generated ambigrams are free for personal and commercial use including logos, merch, and prints. No attribution required.',
      },
      {
        q: 'Why do some words not look symmetric?',
        a: 'Not every word has natural ambigram potential. The generator picks the closest visually balanced design, but words with rare letter combinations (like multiple Qs or Ws) require creative letter merging that won\'t be perfectly symmetric.',
      },
    ],
    relatedSlugs: ['trust-badge-generator', 'superscript-generator'],
    ctaHook: 'Need a full logo or brand identity, not just an ambigram? Text Pixie on WhatsApp — logos, websites, and ads delivered to your phone.',
    aboutHeading: 'The history of ambigram design',
    about:
      'Ambigrams have roots stretching back to medieval calligraphy, but the term was coined by cognitive scientist Douglas Hofstadter in 1983. The art form gained mainstream attention through Scott Kim\'s lettering work in the 1980s and later through Dan Brown\'s 2000 novel Angels & Demons, which featured ambigrams created by typographer John Langdon. Today ambigrams are used in tattoo art, logo design, wedding signage, and jewelry. The hardest letters to ambigram are k, m, q, w, and y because their structures resist 180° rotation; designers usually merge them into adjacent letterforms or substitute creative ligatures. The cleanest ambigrams use letters that already rotate symmetrically: o, x, s, z, n, h, and i.',
  },
  {
    slug: 'superscript-generator',
    title: 'Superscript Generator — Free Superscript Text Converter | Pixie',
    h1: 'Pixie Superscript Generator',
    shortName: 'Superscript Generator',
    tagline: 'Convert any text to superscript characters instantly.',
    metaDescription:
      'Free superscript generator. Convert text and numbers to superscript Unicode characters. Copy-paste into Instagram, TikTok, Twitter, Word, Google Docs.',
    keywords: [
      'superscript generator',
      'superscript text',
      'small text generator',
      'tiny text generator',
      'superscript copy paste',
    ],
    category: 'Converter',
    emoji: '²',
    image: '/tools/superscript-generator.jpg',
    imageAlt: 'Close-up of a keyboard with vintage typography characters',
    primaryKeyword: 'superscript generator',
    intro:
      'Type any text and instantly convert it to superscript characters you can copy and paste anywhere — Instagram bios, TikTok captions, Twitter, YouTube comments, Google Docs, Word, even math equations. Uses real Unicode characters so it works in places that block formatting.',
    howItWorks: [
      {
        title: 'Type your text',
        description: 'Letters, numbers, math symbols — anything you want raised above the baseline.',
      },
      {
        title: 'Auto-convert in real time',
        description: 'See the superscript version appear instantly. No button to click.',
      },
      {
        title: 'Copy and paste anywhere',
        description: 'Works on every platform because it uses real Unicode characters, not CSS formatting that strips on paste.',
      },
    ],
    faqs: [
      {
        q: 'What is superscript text?',
        a: 'Superscript text is small text raised above the normal baseline — used for exponents (x²), footnote markers, abbreviations like 1ˢᵗ, and stylized social media captions. It uses real Unicode characters, so it survives copy-paste across apps that don\'t support rich formatting.',
      },
      {
        q: 'Can I use superscript on Instagram and TikTok?',
        a: 'Yes. Because our generator outputs real Unicode characters, you can paste superscript directly into Instagram bios, captions, comments, TikTok descriptions, and DMs. It works in places where bold/italic don\'t.',
      },
      {
        q: 'Why are some letters missing in superscript?',
        a: 'Unicode does not include superscript versions of every letter. The letters q, X (capital), and a few others are missing. When you type a missing character, the generator falls back to the closest visual match or keeps the original character.',
      },
      {
        q: 'How is this different from formatting in Word or Google Docs?',
        a: 'Word and Google Docs apply CSS-style formatting that disappears when you copy text to plain-text fields. Our generator uses Unicode characters that survive any paste, including into plain text editors, social bios, and code.',
      },
      {
        q: 'Is this safe and free?',
        a: 'Yes. All conversion happens in your browser — your text never touches our server. No tracking, no signup, completely free.',
      },
    ],
    relatedSlugs: ['subscript-generator', 'ambigram-generator'],
    ctaHook: 'Need fancy text for a product page or ad creative? Pixie builds entire ad campaigns from a single WhatsApp message.',
    aboutHeading: 'Where superscript Unicode actually works',
    about:
      'Superscript Unicode characters are part of the broader "Mathematical Alphanumeric Symbols" and "Latin Superscript" blocks defined by the Unicode Consortium. They were originally added for scientific notation — exponents, isotope numbers (¹²C), and footnote markers — but social media culture has adopted them for stylized captions because they survive copy-paste between apps. The characters render natively in nearly every modern font, including system fonts on iOS, Android, Windows, and macOS. The main exception is that capital Q has no Unicode superscript equivalent, so generators typically fall back to a lowercase ᵠ or leave the original Q. Use superscript sparingly — it harms screen-reader accessibility, so don\'t use it for the main copy of headers or buttons.',
  },
  {
    slug: 'subscript-generator',
    title: 'Subscript Generator — Free Subscript Text Converter | Pixie',
    h1: 'Pixie Subscript Generator',
    shortName: 'Subscript Generator',
    tagline: 'Convert any text to subscript characters instantly.',
    metaDescription:
      'Free subscript generator. Convert text and numbers to subscript Unicode characters. Copy-paste into chemistry formulas, social media, Word, Google Docs.',
    keywords: [
      'subscript generator',
      'subscript text',
      'chemical formula text',
      'H2O subscript',
      'subscript copy paste',
    ],
    category: 'Converter',
    emoji: '₂',
    image: '/tools/subscript-generator.jpg',
    imageAlt: 'Chemistry beakers and laboratory equipment',
    primaryKeyword: 'subscript generator',
    intro:
      'Type any text and convert it to subscript characters you can copy-paste into chemical formulas (H₂O, CO₂), math equations, social media captions, or documents. Uses Unicode characters that work everywhere — even places that strip formatting.',
    howItWorks: [
      {
        title: 'Type your text',
        description: 'Letters, numbers, symbols — anything you want positioned below the baseline.',
      },
      {
        title: 'Auto-convert',
        description: 'See the subscript version appear in real time as you type.',
      },
      {
        title: 'Copy anywhere',
        description: 'Paste into chemistry homework, scientific papers, Instagram captions, or chat messages.',
      },
    ],
    faqs: [
      {
        q: 'What is subscript text?',
        a: 'Subscript text is small text positioned below the normal baseline. It\'s used for chemical formulas (H₂O, CO₂), mathematical notation (variables with index like x₁, x₂), and occasional stylistic formatting in social media.',
      },
      {
        q: 'Why use a Unicode subscript instead of Word\'s subscript button?',
        a: 'Word formatting strips when you paste into plain-text fields like Instagram bios, Slack, or browser forms. Unicode subscript characters survive any paste because they are actual characters, not formatting.',
      },
      {
        q: 'Are all letters available as subscript?',
        a: 'No. Unicode includes subscript versions of most lowercase letters and digits, but a few — like b, c, d, f, g, q, w, y, z — have no official subscript glyph. The generator falls back to the closest match or keeps the original.',
      },
      {
        q: 'Can I use this for chemistry homework?',
        a: 'Yes. Type "H2O" or "C6H12O6" and copy the subscript version into your document. It renders correctly in Google Docs, Word, Notion, and most LMS platforms.',
      },
      {
        q: 'Does this work on mobile?',
        a: 'Yes. The generator works in any modern mobile browser. Tap to copy and paste into any app on iOS or Android.',
      },
    ],
    relatedSlugs: ['superscript-generator', 'ap-chem-score-calculator'],
    ctaHook: 'Building a science tutor site or chemistry blog? Pixie ships full websites in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'Subscript in chemistry, math, and beyond',
    about:
      'Subscript notation originated in chemistry and mathematics. In chemistry, subscripts indicate the number of atoms of an element in a molecule (H₂O has two hydrogen atoms; the 2 is subscript). In math, subscripts denote sequence indices (x₁, x₂, x₃) or variable subscripts in tensor notation. Unicode standardized subscript characters in the "Latin Subscript" and "Combining Diacritical Marks" blocks. Unlike rich-text subscript in Word or HTML <sub>, Unicode subscripts are real characters that survive copy-paste across any application, which is why students copy chemistry formulas from Google Docs into messaging apps without losing the formatting. Note that subscripts harm screen reader accessibility — if you publish online content, use HTML <sub> tags with proper ARIA labels rather than Unicode characters when the audience matters.',
  },
  {
    slug: 'mortgage-calculator',
    title: 'Mortgage Calculator — Free Monthly Payment & Amortization | Pixie',
    h1: 'Pixie Mortgage Calculator',
    shortName: 'Mortgage Calculator',
    tagline: 'Calculate your monthly mortgage payment and full amortization.',
    metaDescription:
      'Free mortgage calculator. Calculate monthly payments, total interest, and full amortization schedule. AI explains your numbers and how to lower the payment.',
    keywords: [
      'mortgage calculator',
      'mortgage payment calculator',
      'home loan calculator',
      'amortization calculator',
      'monthly mortgage payment',
    ],
    category: 'Calculator',
    emoji: '🏠',
    image: '/tools/mortgage-calculator.jpg',
    imageAlt: 'House keys resting on a mortgage contract with a calculator',
    primaryKeyword: 'mortgage calculator',
    intro:
      'Enter your loan amount, interest rate, and term. See your monthly payment, total interest paid, and a full month-by-month amortization breakdown. Optional AI assistant explains your numbers and suggests strategies to lower the payment.',
    howItWorks: [
      {
        title: 'Enter loan details',
        description: 'Home price, down payment, interest rate, and loan term (15, 20, or 30 years).',
      },
      {
        title: 'See your monthly payment',
        description: 'Principal + interest calculated using the standard amortization formula. Optional property tax and insurance fields.',
      },
      {
        title: 'View the amortization schedule',
        description: 'Month-by-month breakdown showing how much of each payment goes to principal vs. interest.',
      },
    ],
    faqs: [
      {
        q: 'How is the monthly mortgage payment calculated?',
        a: 'The formula is M = P × [r(1+r)ⁿ] / [(1+r)ⁿ - 1], where P is the loan amount, r is the monthly interest rate (annual rate ÷ 12), and n is the total number of payments (years × 12). This calculator runs that formula and adds optional taxes/insurance.',
      },
      {
        q: 'Should I choose a 15-year or 30-year mortgage?',
        a: 'A 15-year mortgage has higher monthly payments but you pay less than half the total interest. A 30-year mortgage has lower monthly payments and more flexibility, but you pay much more interest over time. Choose based on your monthly cash flow needs vs. long-term cost.',
      },
      {
        q: 'What is amortization?',
        a: 'Amortization is the schedule of how each monthly payment is split between principal (reducing the loan balance) and interest (cost of borrowing). Early payments are mostly interest; later payments are mostly principal. The schedule shows the exact split for every month.',
      },
      {
        q: 'Does this include taxes and insurance?',
        a: 'The base calculation shows principal + interest only. You can optionally add property tax and homeowners insurance estimates to see your full PITI (Principal, Interest, Taxes, Insurance) monthly payment.',
      },
      {
        q: 'Are the numbers exact?',
        a: 'The math is exact for the loan terms you enter. Real-world payments may differ slightly due to PMI, escrow shortages, rate adjustments on ARMs, and lender fees. Always confirm with your loan officer before signing.',
      },
    ],
    relatedSlugs: ['share-incentive-plan-calculator', 'pool-salt-calculator'],
    ctaHook: 'Are you a realtor or mortgage broker? Pixie builds full lead-gen websites with mortgage calculators built in. Text us on WhatsApp.',
    aboutHeading: 'How mortgage interest really works',
    about:
      'A mortgage is a long-term amortizing loan where you pay the same fixed amount each month, but the proportion going to interest vs. principal shifts over time. In the first year of a 30-year mortgage at 7% interest, roughly 80% of every payment is interest and only 20% reduces your principal. By the final year, the ratio flips. This is why making extra principal payments early — even just one extra payment per year — can cut years off your mortgage and save tens of thousands in interest. Use this calculator to model "what if" scenarios: add an extra $100 per month, make biweekly payments instead of monthly, or refinance at a lower rate. The savings compound aggressively when applied early in the loan.',
  },
  {
    slug: 'midpoint-calculator',
    title: 'Midpoint Calculator — Free Midpoint Formula Tool | Pixie',
    h1: 'Pixie Midpoint Calculator',
    shortName: 'Midpoint Calculator',
    tagline: 'Find the midpoint between two coordinates with steps.',
    metaDescription:
      'Free midpoint calculator. Calculate the midpoint between two points (x, y) with step-by-step solution. AI explains the midpoint formula in plain English.',
    keywords: [
      'midpoint calculator',
      'midpoint formula',
      'midpoint between two points',
      'coordinate midpoint',
      'geometry midpoint',
    ],
    category: 'Calculator',
    emoji: '📐',
    image: '/tools/midpoint-calculator.jpg',
    imageAlt: 'Math notebook with geometry equations, compass and ruler',
    primaryKeyword: 'midpoint calculator',
    intro:
      'Enter two coordinate points and get the midpoint with a full step-by-step solution. Works for 2D and 3D coordinates. AI explanation breaks down the formula in plain English — perfect for homework or quick problem solving.',
    howItWorks: [
      {
        title: 'Enter two points',
        description: 'Type the x and y coordinates of Point A and Point B. Add z for 3D problems.',
      },
      {
        title: 'See the midpoint instantly',
        description: 'Result calculated with the midpoint formula: ((x₁+x₂)/2, (y₁+y₂)/2).',
      },
      {
        title: 'Read the step-by-step',
        description: 'Full worked solution showing the formula, substitutions, and final answer.',
      },
    ],
    faqs: [
      {
        q: 'What is the midpoint formula?',
        a: 'The midpoint of two points A(x₁, y₁) and B(x₂, y₂) is M = ((x₁+x₂)/2, (y₁+y₂)/2). You average the x-coordinates and average the y-coordinates. For 3D points, you also average the z-coordinates.',
      },
      {
        q: 'How do I find the midpoint of two points?',
        a: 'Add the x-coordinates of both points and divide by 2 — that\'s your midpoint x. Do the same for the y-coordinates. The result is the midpoint coordinate. Example: midpoint of (2, 4) and (6, 10) is ((2+6)/2, (4+10)/2) = (4, 7).',
      },
      {
        q: 'Does this work for negative coordinates?',
        a: 'Yes. The formula works for any real numbers including negatives, decimals, and fractions. Example: midpoint of (-3, 5) and (7, -1) is (2, 2).',
      },
      {
        q: 'Can I use this for 3D coordinates?',
        a: 'Yes. Switch to 3D mode and enter z-coordinates. The midpoint formula extends naturally: ((x₁+x₂)/2, (y₁+y₂)/2, (z₁+z₂)/2).',
      },
      {
        q: 'What is the midpoint used for?',
        a: 'Midpoints are used in geometry to find the center of line segments, in computer graphics for line interpolation, in physics for center-of-mass problems, and in navigation for finding the halfway point between two locations on a map.',
      },
    ],
    relatedSlugs: ['ap-chem-score-calculator', 'half-birthday-calculator'],
    ctaHook: 'Building a tutoring site or math blog? Pixie ships full educational websites from a single WhatsApp message.',
    aboutHeading: 'The midpoint formula in geometry and beyond',
    about:
      'The midpoint formula is one of the foundational tools in coordinate geometry, taught in middle-school algebra and used throughout high school and college math. It is derived directly from the definition of the average of two numbers: the midpoint is the point equidistant from both endpoints along a straight line segment. Beyond pure geometry, midpoints show up in computer graphics (line subdivision algorithms like the midpoint circle algorithm), physics (calculating the center of mass of a two-particle system with equal masses), GIS and mapping (finding meet-in-the-middle locations between two addresses), and statistics (the midrange of a dataset is the midpoint of the minimum and maximum values). The 3D extension just adds a third coordinate average. The same principle generalizes to n dimensions for vector spaces in linear algebra.',
  },
  {
    slug: 'ap-chem-score-calculator',
    title: 'AP Chemistry Score Calculator 2026 — Free AP Chem Predictor | Pixie',
    h1: 'AP Chemistry Score Calculator',
    shortName: 'AP Chem Score Calculator',
    tagline: 'Predict your AP Chemistry score from practice exam results.',
    metaDescription:
      'Free AP Chemistry score calculator. Enter your multiple choice and free response scores to predict your AP Chem 1–5 score. AI study plan included.',
    keywords: [
      'ap chemistry score calculator',
      'ap chem score predictor',
      'ap chem score',
      'ap chemistry curve',
      'ap chemistry exam predictor',
    ],
    category: 'Calculator',
    emoji: '🧪',
    image: '/tools/ap-chem-score-calculator.jpg',
    imageAlt: 'Chemistry lab with test tubes and colored solutions',
    primaryKeyword: 'ap chemistry score calculator',
    intro:
      'Enter your raw scores from the AP Chemistry multiple-choice and free-response sections. Get your predicted 1–5 score using the College Board\'s most recent score-conversion curve. Optional AI study plan suggests what to focus on based on your weakest section.',
    howItWorks: [
      {
        title: 'Enter MCQ score',
        description: 'Number of multiple choice questions you got right out of 60.',
      },
      {
        title: 'Enter free response points',
        description: 'Total points earned on the 7 free-response questions (out of 46).',
      },
      {
        title: 'Get predicted score',
        description: 'See your composite score and predicted 1–5 AP score. Optional AI breakdown identifies your weakest content area.',
      },
    ],
    faqs: [
      {
        q: 'How is the AP Chemistry score calculated?',
        a: 'The AP Chem composite score combines your weighted multiple choice score (50% of total) and your free-response score (50% of total). The composite is then mapped to a 1–5 scale using the College Board\'s curve. A composite around 70+ typically earns a 5; 55–69 earns a 4; 40–54 earns a 3.',
      },
      {
        q: 'What score do I need for a 5 on AP Chemistry?',
        a: 'Roughly 70% of total available points historically maps to a 5. That means about 42/60 multiple choice plus 32/46 free response. The exact cutoff varies year to year based on College Board curve adjustments.',
      },
      {
        q: 'Is this calculator accurate?',
        a: 'The calculator uses recent published curve data and is accurate within ±1 score band. The College Board adjusts the curve slightly each year, so treat the prediction as a strong estimate, not a guarantee.',
      },
      {
        q: 'What is the AP Chemistry exam format?',
        a: '60 multiple-choice questions (90 minutes, 50% of score) followed by 7 free-response questions — 3 long (10 points each) and 4 short (4 points each), 105 minutes total, 50% of score. Calculator allowed on both sections.',
      },
      {
        q: 'How should I study for AP Chemistry?',
        a: 'Focus on the 9 College Board units: Atomic Structure, Molecular Properties, Intermolecular Forces, Chemical Reactions, Kinetics, Thermodynamics, Equilibrium, Acids/Bases, and Applications of Thermodynamics. Practice FRQs from the past 5 years — they signal the exam style. The AI study plan in this tool suggests which unit to prioritize based on your section scores.',
      },
    ],
    relatedSlugs: ['midpoint-calculator', 'subscript-generator'],
    ctaHook: 'Teach AP Chem? Pixie builds full tutoring sites with course pages, lead forms, and Stripe checkout in 60 seconds. Text us on WhatsApp.',
    aboutHeading: 'How the AP Chemistry curve really works',
    about:
      'The AP Chemistry exam is scored on a 1–5 scale where 3 is considered "qualified" for college credit, 4 is "well qualified", and 5 is "extremely well qualified". Approximately 13–16% of students score a 5 each year, and about 55–60% earn a 3 or higher. The composite score is calculated by weighting your multiple-choice section to 50% (each MCQ worth ~0.83 points after weighting) and your free-response section to 50% (each FRQ point worth ~1.09 after weighting). College Board adjusts the curve based on overall exam difficulty — when the test is harder, the cutoffs drop slightly. The 5 cutoff has hovered around 70% of total points for the last decade. The hardest unit historically is Equilibrium and Acid-Base Chemistry (Units 7–8), which together account for roughly 25% of the exam content.',
  },
  {
    slug: 'pool-salt-calculator',
    title: 'Pool Salt Calculator — Free Saltwater Pool Calculator | Pixie',
    h1: 'Pixie Pool Salt Calculator',
    shortName: 'Pool Salt Calculator',
    tagline: 'Calculate exactly how much salt your saltwater pool needs.',
    metaDescription:
      'Free pool salt calculator. Calculate how many pounds of pool salt to add to reach the ideal 3000–3500 ppm salinity. Works for any pool size in gallons or liters.',
    keywords: [
      'pool salt calculator',
      'saltwater pool calculator',
      'pool salt ppm',
      'how much salt for pool',
      'salt water pool maintenance',
    ],
    category: 'Calculator',
    emoji: '🧂',
    image: '/tools/pool-salt-calculator.jpg',
    imageAlt: 'Clean backyard swimming pool with clear blue water',
    primaryKeyword: 'pool salt calculator',
    intro:
      'Enter your pool volume and current salt level. Get the exact pounds (or kilograms) of pool salt to add to reach your target salinity. Works for inground, above-ground, and saltwater chlorine generator pools.',
    howItWorks: [
      {
        title: 'Enter pool volume',
        description: 'Total gallons or liters. If you don\'t know, use the built-in volume estimator (length × width × average depth × 7.48 for rectangular pools).',
      },
      {
        title: 'Enter current salt level',
        description: 'Read from your salt test strip or salt cell display. Default is 0 ppm if you\'re starting fresh.',
      },
      {
        title: 'Set target salinity',
        description: 'Most chlorine generators run best at 3000–3500 ppm. Calculator shows exact pounds of pure salt to add.',
      },
    ],
    faqs: [
      {
        q: 'How much salt does my pool need?',
        a: 'A standard saltwater pool needs 3000–3500 ppm of salt. For a 15,000-gallon pool starting at 0 ppm, that\'s about 375–438 pounds of pure pool salt to reach the low end of the range. This calculator gives you the exact number based on your pool volume and current level.',
      },
      {
        q: 'What kind of salt should I use?',
        a: 'Use pool salt (sodium chloride, ≥99% pure, no iodine, no anti-caking agents). Common brands are AquaSalt and Morton Pool Salt. Never use table salt or rock salt with iodine — the additives stain the pool surface and damage the chlorine generator.',
      },
      {
        q: 'How long does it take for salt to dissolve?',
        a: 'With pumps running, salt typically fully dissolves and circulates within 24 hours. Brush the bottom of the pool to speed dissolution and prevent salt from settling on plaster or vinyl liners (it can stain).',
      },
      {
        q: 'Why is my salt cell saying "Low Salt"?',
        a: 'Either your salt level is genuinely below 2700 ppm (add salt per this calculator) or your salt cell is dirty/calcified and giving a false low reading. Clean the cell with diluted muriatic acid before adding more salt.',
      },
      {
        q: 'Can I add too much salt?',
        a: 'Yes. Above ~4500 ppm, the water tastes salty, can corrode metal pool components, and damages chlorine generators (most have a high-salt shutoff at 5500 ppm). If you over-salt, the only fix is to drain and refill partially with fresh water.',
      },
    ],
    relatedSlugs: ['mortgage-calculator', 'share-incentive-plan-calculator'],
    ctaHook: 'Run a pool service business? Pixie builds full booking websites with payment, lead forms, and SEO. Text us on WhatsApp.',
    aboutHeading: 'How saltwater pools actually work',
    about:
      'A saltwater pool is not chlorine-free — it generates its own chlorine on-demand from dissolved salt. The salt chlorine generator (SCG) runs pool water past a cell with low-voltage electrolysis, splitting NaCl into chlorine gas (which sanitizes the water) and sodium (which stays dissolved). Because the salt is consumed extremely slowly and replenished mostly by the natural recombination of byproducts, you usually only add salt after heavy rain, splash-out, or backwashing — about 1–2 times per swimming season for most pools. Ideal range is 3000–3500 ppm; below 2700 the generator can\'t produce enough chlorine, above 4500 the water feels salty and starts corroding metal. The salt itself is dirt-cheap (around $10–15 per 40-lb bag) but the chlorine generator cell costs $400–800 and lasts 3–5 years. The math for adding salt is straightforward: pounds needed = (target ppm − current ppm) × pool gallons × 0.00000834. This calculator does that conversion automatically.',
  },
  {
    slug: 'share-incentive-plan-calculator',
    title: 'Share Incentive Plan Calculator — Free SIP Tax Calculator UK | Pixie',
    h1: 'Pixie Share Incentive Plan (SIP) Calculator',
    shortName: 'SIP Calculator',
    tagline: 'Calculate your UK Share Incentive Plan tax savings.',
    metaDescription:
      'Free Share Incentive Plan calculator. Calculate UK SIP tax savings, partnership shares, free shares, and 5-year holding benefits. HMRC-rule compliant.',
    keywords: [
      'share incentive plan calculator',
      'sip calculator uk',
      'share incentive plan tax',
      'sip tax savings',
      'partnership shares calculator',
    ],
    category: 'Calculator',
    emoji: '📈',
    image: '/tools/share-incentive-plan-calculator.jpg',
    imageAlt: 'Stock market financial chart on a screen',
    primaryKeyword: 'share incentive plan calculator',
    intro:
      'Calculate the tax savings from contributing to your employer\'s UK Share Incentive Plan (SIP). Models partnership shares, free shares, matching shares, and dividend shares against the 5-year HMRC holding period for full tax efficiency.',
    howItWorks: [
      {
        title: 'Enter your salary and contribution',
        description: 'Annual gross salary and how much you want to put into partnership shares per month (up to £150 or 10% of salary, whichever is lower).',
      },
      {
        title: 'Add employer match',
        description: 'If your employer offers matching shares (up to 2 free shares per partnership share), include the ratio.',
      },
      {
        title: 'See your 5-year tax benefit',
        description: 'Compare net cost vs. share value after the 5-year HMRC holding period — including saved income tax and National Insurance.',
      },
    ],
    faqs: [
      {
        q: 'What is a Share Incentive Plan (SIP)?',
        a: 'A SIP is a UK tax-advantaged employee share scheme. You can buy company shares from pre-tax salary (partnership shares), receive free shares from your employer (up to £3,600/year), and potentially get matching shares (up to 2 per partnership share). Hold for 5 years and pay zero income tax and National Insurance on the shares.',
      },
      {
        q: 'How much can I contribute to a SIP per year?',
        a: 'Partnership shares: up to £1,800 per year or 10% of your salary (whichever is lower). Free shares: up to £3,600 per year. Matching shares: at the employer\'s discretion, up to 2 per partnership share. Dividend shares: reinvested without limit.',
      },
      {
        q: 'When do I pay tax on SIP shares?',
        a: 'Sell within 3 years: full income tax + NI on the market value at withdrawal. Sell between 3–5 years: tax on the lower of original price or market value. Hold for 5+ years: zero income tax, zero NI. You may still pay Capital Gains Tax if you sell at a gain after withdrawal.',
      },
      {
        q: 'Is SIP better than a regular ISA?',
        a: 'For company stock, SIP is usually better due to the income tax + NI savings on the contribution (effectively a ~32% discount for basic-rate taxpayers, ~42% for higher-rate). However, concentrating wealth in a single employer is risky — if the company tanks, you lose both your job and your savings. Most advisors suggest diversifying after the 5-year hold.',
      },
      {
        q: 'Is this calculator HMRC compliant?',
        a: 'The calculator uses current HMRC SIP rules and tax bands for the 2025/26 tax year. It\'s an estimation tool, not financial advice — consult an accountant before making decisions, especially around CGT planning at withdrawal.',
      },
    ],
    relatedSlugs: ['mortgage-calculator', 'pool-salt-calculator'],
    ctaHook: 'Run a UK accounting or fintech firm? Pixie builds compliance-ready lead-gen sites in 60 seconds. Text us on WhatsApp.',
    aboutHeading: 'Why SIPs are the UK\'s most tax-efficient share scheme',
    about:
      'Share Incentive Plans are HMRC-approved employee share schemes introduced in 2000 to encourage employee ownership. They are the most tax-efficient way for UK employees to acquire their employer\'s shares because the partnership share contribution comes out of gross salary — saving income tax (20%, 40%, or 45%) and Employee National Insurance (8% or 2%) at the point of purchase. Combined with potential employer matching and a 5-year tax-free holding period, the effective return can exceed any ISA or pension contribution for company shares. The catch is concentration risk: holding a meaningful percentage of your net worth in a single company exposes you to both job loss and stock crash in correlated ways. The classic example is Enron employees who held company stock in their 401(k)s — when the company collapsed, they lost jobs and savings simultaneously. SIPs in the UK have slightly better protections because they are not retirement accounts, but the diversification lesson stands: take the tax benefit, then sell and diversify once the 5-year hold matures.',
  },
  {
    slug: 'half-birthday-calculator',
    title: 'Half Birthday Calculator — Find Your Half Birthday Date | Pixie',
    h1: 'Pixie Half Birthday Calculator',
    shortName: 'Half Birthday Calculator',
    tagline: 'Find your half birthday — exactly 6 months from your birth date.',
    metaDescription:
      'Free half birthday calculator. Enter your birthday and find the exact date you turn half a year older. AI suggests messages and gift ideas for half birthdays.',
    keywords: [
      'half birthday calculator',
      'half birthday',
      'half birthday date',
      'find half birthday',
      'when is my half birthday',
    ],
    category: 'Calculator',
    emoji: '🎂',
    image: '/tools/half-birthday-calculator.jpg',
    imageAlt: 'Birthday cake with lit candles and festive decorations',
    primaryKeyword: 'half birthday calculator',
    intro:
      'Enter your birthday and instantly find your half birthday — the exact date six months from when you were born. Perfect for school cutoffs, summer-birthday kids who want a "half" celebration, gift planning, and social media posts. AI generates message and gift ideas.',
    howItWorks: [
      {
        title: 'Enter your birth date',
        description: 'Month, day, and year. The year doesn\'t affect the half-birthday date — just used for the age calculation.',
      },
      {
        title: 'See your half birthday',
        description: 'Calculated as 6 months from your birthday (handling 29/30/31-day month edge cases automatically).',
      },
      {
        title: 'Get message ideas',
        description: 'Optional AI suggestions for half birthday messages, gift ideas, and celebration themes.',
      },
    ],
    faqs: [
      {
        q: 'What is a half birthday?',
        a: 'Your half birthday is the date exactly six months from your birthday — when you become 6 months older. If you were born on January 15, your half birthday is July 15. The concept is popular with kids who have summer birthdays during school break and want a celebration during the school year.',
      },
      {
        q: 'How do you calculate a half birthday?',
        a: 'Add six months to your birthday. The calculator handles edge cases automatically — for example, if you were born on August 31, your half birthday falls on the last day of February (February 28 or 29 in a leap year), since February doesn\'t have a 31st.',
      },
      {
        q: 'Why do people celebrate half birthdays?',
        a: 'Most commonly: kids with summer birthdays whose friends are all on vacation, terminally ill patients celebrating milestones, dog parents marking pet ages, and couples who want extra reasons to celebrate together. Schools sometimes recognize half-birthdays so summer-birthday kids get the classroom moment.',
      },
      {
        q: 'Is the half birthday calculation always exactly 6 months?',
        a: 'Yes — it\'s always 6 calendar months. Note that 6 months is not exactly half a year in days (a year has 365.25 days; 6 months is 182.625 days, but calendar months vary), so the date is a calendar approximation, not a precise 182.5-day shift.',
      },
      {
        q: 'Can I share the result?',
        a: 'Yes. The calculator generates a shareable text card with your half birthday date and an AI-suggested celebration message. Copy and paste to Instagram, WhatsApp, or text.',
      },
    ],
    relatedSlugs: ['midpoint-calculator', 'ap-chem-score-calculator'],
    ctaHook: 'Run a kids\' party planning business or gifting brand? Pixie builds shoppable sites from one WhatsApp message.',
    aboutHeading: 'The cultural rise of the half birthday',
    about:
      'Half birthdays are a modern cultural phenomenon that exploded with social media. The tradition originally served two specific groups: kids with summer birthdays who couldn\'t celebrate at school, and people with serious illnesses for whom every milestone mattered. Over the past decade, half birthdays have gone mainstream — celebrities post half birthday tributes to their kids, dog owners post pet half birthdays, and couples mark relationship half-anniversaries. From a calendar-math perspective, the half birthday is simply six calendar months added to the birth date, with sensible handling of month-length edge cases (a January 31 birthday gives a July 31 half birthday; an August 31 birthday gives the last day of February). Some traditions calculate it as exactly 182.5 days after the birthday, but the calendar-month version is far more common in practice because it falls on the same numeric day of the month, making it easier to remember.',
  },
];

export function getTool(slug: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function getRelatedTools(slug: string): ToolDefinition[] {
  const tool = getTool(slug);
  if (!tool) return [];
  return tool.relatedSlugs
    .map(getTool)
    .filter((t): t is ToolDefinition => Boolean(t));
}
