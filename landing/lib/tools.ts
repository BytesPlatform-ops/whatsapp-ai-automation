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
    title: 'Free Trust Badge Generator for Online Stores',
    h1: 'Pixie Trust Badge Generator',
    shortName: 'Trust Badge Generator',
    tagline: 'Generate trust badges for your online store in seconds.',
    metaDescription:
      'Use this free trust badge generator to create guarantee, secure checkout, and shipping badges for your store. No signup, instant export.',
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
    title: 'Free Ambigram Generator — Make Ambigrams Fast',
    h1: 'Pixie Ambigram Generator',
    shortName: 'Ambigram Generator',
    tagline: 'Create ambigram designs that read the same upside down.',
    metaDescription:
      'Create your own design with this free ambigram generator. Type any word and get an ambigram that reads the same upside down. No signup.',
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
    title: 'Superscript Generator — Make Superscript Text',
    h1: 'Pixie Superscript Generator',
    shortName: 'Superscript Generator',
    tagline: 'Convert any text to superscript characters instantly.',
    metaDescription:
      'Turn any text into superscript with this free superscript generator. Copy and paste small raised characters anywhere. No signup needed.',
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
    title: 'Subscript Generator — Make Subscript Text Free',
    h1: 'Pixie Subscript Generator',
    shortName: 'Subscript Generator',
    tagline: 'Convert any text to subscript characters instantly.',
    metaDescription:
      'Convert text to subscript with this free subscript generator. Copy and paste small lowered characters anywhere online. No signup needed.',
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
    title: 'Free Mortgage Calculator — Monthly Payments',
    h1: 'Pixie Mortgage Calculator',
    shortName: 'Mortgage Calculator',
    tagline: 'Calculate your monthly mortgage payment and full amortization.',
    metaDescription:
      'Estimate your monthly home loan payment with this free mortgage calculator. Enter price, rate, and term to see your payment instantly.',
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
    relatedSlugs: ['share-incentive-plan-calculator', 'trust-badge-generator', 'pool-salt-calculator'],
    ctaHook: 'Are you a realtor or mortgage broker? Pixie builds full lead-gen websites with mortgage calculators built in. Text us on WhatsApp.',
    aboutHeading: 'How mortgage interest really works',
    about:
      'A mortgage is a long-term amortizing loan where you pay the same fixed amount each month, but the proportion going to interest vs. principal shifts over time. In the first year of a 30-year mortgage at 7% interest, roughly 80% of every payment is interest and only 20% reduces your principal. By the final year, the ratio flips. This is why making extra principal payments early — even just one extra payment per year — can cut years off your mortgage and save tens of thousands in interest. Use this calculator to model "what if" scenarios: add an extra $100 per month, make biweekly payments instead of monthly, or refinance at a lower rate. The savings compound aggressively when applied early in the loan.',
  },
  {
    slug: 'midpoint-calculator',
    title: 'Midpoint Calculator — Find the Midpoint Fast',
    h1: 'Pixie Midpoint Calculator',
    shortName: 'Midpoint Calculator',
    tagline: 'Find the midpoint between two coordinates with steps.',
    metaDescription:
      'Find the midpoint between two points with this free midpoint calculator. Enter your coordinates and get the exact midpoint instantly.',
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
    title: 'AP Chem Score Calculator — Predict Your Score',
    h1: 'AP Chemistry Score Calculator',
    shortName: 'AP Chem Score Calculator',
    tagline: 'Predict your AP Chemistry score from practice exam results.',
    metaDescription:
      'Estimate your AP Chemistry exam result with this free AP Chem score calculator. Enter your raw points to see your predicted 1-5 score.',
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
    title: 'Pool Salt Calculator — How Much Salt to Add',
    h1: 'Pixie Pool Salt Calculator',
    shortName: 'Pool Salt Calculator',
    tagline: 'Calculate exactly how much salt your saltwater pool needs.',
    metaDescription:
      'Find out how much salt your pool needs with this free pool salt calculator. Enter pool size and current level for the exact amount.',
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
    title: 'Share Incentive Plan Calculator for UK SIPs',
    h1: 'Pixie Share Incentive Plan (SIP) Calculator',
    shortName: 'SIP Calculator',
    tagline: 'Calculate your UK Share Incentive Plan tax savings.',
    metaDescription:
      'Work out the value and tax savings of your shares with this free share incentive plan calculator for UK SIP employee share schemes.',
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
    relatedSlugs: ['mortgage-calculator', 'trust-badge-generator', 'pool-salt-calculator'],
    ctaHook: 'Run a UK accounting or fintech firm? Pixie builds compliance-ready lead-gen sites in 60 seconds. Text us on WhatsApp.',
    aboutHeading: 'Why SIPs are the UK\'s most tax-efficient share scheme',
    about:
      'Share Incentive Plans are HMRC-approved employee share schemes introduced in 2000 to encourage employee ownership. They are the most tax-efficient way for UK employees to acquire their employer\'s shares because the partnership share contribution comes out of gross salary — saving income tax (20%, 40%, or 45%) and Employee National Insurance (8% or 2%) at the point of purchase. Combined with potential employer matching and a 5-year tax-free holding period, the effective return can exceed any ISA or pension contribution for company shares. The catch is concentration risk: holding a meaningful percentage of your net worth in a single company exposes you to both job loss and stock crash in correlated ways. The classic example is Enron employees who held company stock in their 401(k)s — when the company collapsed, they lost jobs and savings simultaneously. SIPs in the UK have slightly better protections because they are not retirement accounts, but the diversification lesson stands: take the tax benefit, then sell and diversify once the 5-year hold matures.',
  },
  {
    slug: 'half-birthday-calculator',
    title: 'Half Birthday Calculator — Find Your Half Day',
    h1: 'Pixie Half Birthday Calculator',
    shortName: 'Half Birthday Calculator',
    tagline: 'Find your half birthday — exactly 6 months from your birth date.',
    metaDescription:
      'Find your exact half birthday with this free half birthday calculator. Enter your birth date to see the day you turn another half year.',
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
  {
    slug: 'ap-bio-score-calculator',
    title: 'AP Bio Score Calculator — Predict Your Score',
    h1: 'AP Biology Score Calculator',
    shortName: 'AP Bio Score Calculator',
    tagline: 'Predict your AP Biology score from practice exam results.',
    metaDescription:
      'Estimate your AP Biology exam result with this free AP Bio score calculator. Enter your raw points to see your predicted 1-5 score.',
    keywords: ['ap bio score calculator', 'ap biology score calculator', 'ap bio score predictor', 'ap biology curve', 'ap bio exam score'],
    category: 'Calculator',
    emoji: '🧬',
    image: '/tools/ap-bio-score-calculator.jpg',
    imageAlt: 'Biology textbook open to DNA double helix diagram',
    primaryKeyword: 'ap bio score calculator',
    intro:
      'Enter your raw multiple-choice and free-response scores from the AP Biology exam. Get your predicted 1–5 score using the College Board\'s latest scoring conversion. See exactly how many more MCQ or FRQ points you need to reach the next score band.',
    howItWorks: [
      { title: 'Enter MCQ score', description: 'Number of multiple-choice questions correct out of 60.' },
      { title: 'Enter free-response points', description: 'Total points earned on all 6 free-response questions (out of 40).' },
      { title: 'Get predicted score', description: 'See your composite score and predicted 1–5 AP score with breakdown.' },
    ],
    faqs: [
      {
        q: 'How is the AP Biology score calculated?',
        a: 'The AP Bio composite combines your MCQ section (60 questions, 50% weight) and FRQ section (6 questions, 50% weight). Both halves are scaled to 50 points and added together to form a 0–100 composite, then mapped to a 1–5 AP score using College Board cutoffs.',
      },
      {
        q: 'What score do I need for a 5 on AP Bio?',
        a: 'Historically, a composite of around 70%+ maps to a 5 — roughly 42/60 MCQ and 28/40 FRQ. The exact cutoff shifts yearly based on exam difficulty.',
      },
      {
        q: 'Is this calculator accurate?',
        a: 'The calculator uses published College Board curve data and is accurate within ±1 score band. Treat the prediction as a strong estimate — the real cutoff adjusts each year.',
      },
      {
        q: 'What is the AP Biology exam format?',
        a: '60 multiple-choice questions (90 min, 50% of score) + 6 free-response questions (90 min, 50% of score): 2 long FRQ (8–10 pts each) and 4 short FRQ (4 pts each).',
      },
      {
        q: 'What units are on the AP Biology exam?',
        a: 'The 8 units: Chemistry of Life, Cell Structure & Function, Cellular Energetics, Cell Communication & Cell Cycle, Heredity, Gene Expression & Regulation, Natural Selection, and Ecology. Units 3–4 have the heaviest weighting.',
      },
    ],
    relatedSlugs: ['ap-chem-score-calculator', 'ap-calc-ab-score-calculator'],
    ctaHook: 'Teach AP Biology? Pixie generates your tutoring website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How the AP Biology curve works',
    about:
      'AP Biology is one of the most popular AP exams, taken by over 280,000 students annually. About 14–16% earn a 5, and roughly 65% earn a 3 or higher. The exam was significantly redesigned in 2020 to emphasize scientific reasoning and data analysis over memorization. FRQ questions now frequently include graphs, experimental design problems, and mathematical models. The hardest units are Gene Expression (Unit 6) and Ecology (Unit 8). Unlike AP Chem, AP Bio allows some reference materials during the exam. The composite score combines both sections equally at 50% each, and College Board adjusts the 5-cutoff by 2–5 points annually based on overall exam difficulty.',
  },
  {
    slug: 'ap-calc-ab-score-calculator',
    title: 'AP Calc AB Score Calculator — Predict Score',
    h1: 'AP Calculus AB Score Calculator',
    shortName: 'AP Calc AB Score Calculator',
    tagline: 'Predict your AP Calculus AB score from practice exam results.',
    metaDescription:
      'Estimate your AP Calculus AB result with this free AP Calc AB score calculator. Enter your raw points to see your predicted 1-5 score.',
    keywords: ['ap calc ab score calculator', 'ap calculus ab score', 'ap calc ab predictor', 'ap calculus ab curve', 'ap calc score'],
    category: 'Calculator',
    emoji: '∫',
    image: '/tools/ap-calc-ab-score-calculator.jpg',
    imageAlt: 'Calculus textbook open with mathematical equations and graphs',
    primaryKeyword: 'ap calc ab score calculator',
    intro:
      'Enter your raw multiple-choice and free-response scores from AP Calculus AB. See your predicted 1–5 score using the College Board\'s most recent scoring curve, plus how many more points you need to hit the next score band.',
    howItWorks: [
      { title: 'Enter MCQ score', description: 'Total multiple-choice correct out of 45 (30 no-calculator + 15 calculator).' },
      { title: 'Enter FRQ points', description: 'Total points earned across 6 free-response questions (max 54 points).' },
      { title: 'Get predicted score', description: 'See composite score and predicted 1–5 AP score.' },
    ],
    faqs: [
      {
        q: 'How is AP Calculus AB scored?',
        a: 'The exam has two sections worth 50% each. Section I: 45 MCQ (30 no-calc, 15 calc). Section II: 6 FRQ (3 no-calc, 3 calc), each worth 9 points (54 total). Both sections are scaled to 50 composite points and combined.',
      },
      {
        q: 'What score do I need for a 5 on AP Calc AB?',
        a: 'Typically around 70% of total points — about 31/45 MCQ and 38/54 FRQ. The exact cutoff varies slightly each year; historically the 5 cutoff has been near 65–70% composite.',
      },
      {
        q: 'Is AP Calc AB harder than AP Calc BC?',
        a: 'AP Calc AB covers roughly the first semester of college calculus (limits, derivatives, integrals). AP Calc BC covers all of AB plus series, parametric, polar, and more. BC has a higher 5 rate (~40%) because only motivated students take it.',
      },
      {
        q: 'What topics are on AP Calc AB?',
        a: 'Limits and continuity, derivatives (basic, chain rule, implicit), applications of derivatives (optimization, related rates), integrals, the Fundamental Theorem of Calculus, area between curves, and basic differential equations.',
      },
      {
        q: 'Can I use a calculator on AP Calc AB?',
        a: 'On Part B of Section I (15 MCQ) and Part B of Section II (3 FRQ) yes. The rest is no-calculator. A graphing calculator is required — TI-84, TI-Nspire, or equivalent.',
      },
    ],
    relatedSlugs: ['ap-bio-score-calculator', 'ap-psych-score-calculator'],
    ctaHook: 'Teach calculus? Pixie generates your tutoring website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How the AP Calc AB scoring curve works',
    about:
      'AP Calculus AB is taken by roughly 300,000 students each year, making it one of the most common AP exams. About 20–22% earn a 5, and roughly 58–63% earn a 3 or higher — a higher 3+ rate than AP Chemistry or AP Physics. The exam tests limits, derivatives, integrals, the Fundamental Theorem, differential equations, and accumulation. Free-response questions are scored by trained AP readers who follow strict rubrics — partial credit is awarded, so showing work matters even when the final answer is wrong. Each FRQ is worth 9 points. The most commonly missed topics on AP Calc AB FRQs are related rates, implicit differentiation, and accumulation functions.',
  },
  {
    slug: 'ap-psych-score-calculator',
    title: 'AP Psych Score Calculator — Predict Your Score',
    h1: 'AP Psychology Score Calculator',
    shortName: 'AP Psych Score Calculator',
    tagline: 'Predict your AP Psychology score from practice exam results.',
    metaDescription:
      'Estimate your AP Psychology result with this free AP Psych score calculator. Enter your raw points to see your predicted 1-5 score.',
    keywords: ['ap psych score calculator', 'ap psychology score', 'ap psych predictor', 'ap psychology curve', 'ap psych exam score'],
    category: 'Calculator',
    emoji: '🧠',
    image: '/tools/ap-psych-score-calculator.jpg',
    imageAlt: 'Psychology textbook with brain diagram and neural network illustration',
    primaryKeyword: 'ap psych score calculator',
    intro:
      'Enter your raw multiple-choice and free-response scores from the AP Psychology exam. Get your predicted 1–5 score using the College Board\'s latest scoring conversion. See exactly how many more points you need to reach the next score band.',
    howItWorks: [
      { title: 'Enter MCQ score', description: 'Number of multiple-choice questions correct out of 100.' },
      { title: 'Enter FRQ points', description: 'Total points earned on both free-response questions (max 14 points, 7 each).' },
      { title: 'Get predicted score', description: 'See your composite and predicted AP score with section breakdown.' },
    ],
    faqs: [
      {
        q: 'How is AP Psychology scored?',
        a: 'Section I: 100 MCQ (70 min), worth 66.7% of composite. Section II: 2 FRQ — concept application (7 pts) + research design (7 pts), 50 min, worth 33.3% of composite. The two sections are weighted and combined into a 0–100 composite.',
      },
      {
        q: 'What score do I need for a 5 on AP Psych?',
        a: 'Typically around 75–80% of total composite. On the MCQ, that means roughly 80+ correct. The 2 FRQ questions (7 pts each) are scored strictly — even one missed component drops you a point.',
      },
      {
        q: 'Is AP Psychology easy?',
        a: 'AP Psych has one of the highest 5-rates of common AP exams — about 22–24% earn a 5, and roughly 65% earn a 3+. FRQ scoring is strict: you must use exact terminology correctly, like distinguishing "classical" from "operant" conditioning precisely.',
      },
      {
        q: 'What topics are on AP Psychology?',
        a: '9 units: Biological Bases of Behavior, Sensation & Perception, States of Consciousness, Learning, Cognitive Psychology, Developmental Psychology, Motivation/Emotion/Personality, Clinical Psychology, and Social Psychology. Social Psychology and Clinical Psychology together account for ~30% of MCQs.',
      },
      {
        q: 'How are the AP Psych FRQs graded?',
        a: 'Each FRQ is scored on a strict point-by-point rubric. The concept application question asks you to apply ~7 psychological terms to a scenario — each term earns 1 point only if correctly applied in context. Partial credit is given per term.',
      },
    ],
    relatedSlugs: ['ap-bio-score-calculator', 'ap-calc-ab-score-calculator'],
    ctaHook: 'Teach AP Psychology? Pixie generates your tutoring website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'Why AP Psychology has one of the highest 5 rates',
    about:
      'AP Psychology is the second most popular AP exam after AP Language, with over 350,000 test-takers annually. It has one of the highest 5-rates of any major AP exam (22–24%) because it does not require the mathematical fluency needed for AP Sciences or the writing speed of AP English. However, FRQ performance separates average students from high scorers: the concept application question demands precise use of psychological terminology. The most tested topics are Units 7–8 (Motivation, Emotion, Clinical Psychology). Psychologists like Freud, Pavlov, Skinner, Bandura, and Kohlberg appear frequently on MCQs.',
  },
  {
    slug: 'calculator-bacalaureat',
    title: 'Calculator Bacalaureat — Calculează Media BAC',
    h1: 'Calculator Bacalaureat',
    shortName: 'Calculator Bacalaureat',
    tagline: 'Calculează media de absolvire a examenului de bacalaureat.',
    metaDescription:
      'Folosește acest calculator Bacalaureat gratuit pentru a afla media ta la BAC. Introdu notele de la fiecare probă și vezi rezultatul.',
    keywords: ['calculator bacalaureat', 'media bacalaureat', 'calcul bacalaureat', 'nota bacalaureat', 'promovat bacalaureat'],
    category: 'Calculator',
    emoji: '🎓',
    image: '/tools/calculator-bacalaureat.jpg',
    imageAlt: 'Student with diploma and graduation ceremony',
    primaryKeyword: 'calculator bacalaureat',
    intro:
      'Introdu notele de la probele scrise, orale și competențe pentru a calcula media finală de bacalaureat. Calculatorul urmează grila oficială de ponderare — află dacă ai promovat și cu câte puncte.',
    howItWorks: [
      { title: 'Introdu notele la scris', description: 'Nota la Română scris, proba obligatorie de profil și proba la alegere.' },
      { title: 'Adaugă probele orale și media liceu', description: 'Notele la oral Română, limbă modernă, competențe digitale și media generală din liceu (cl. 9–12).' },
      { title: 'Află media finală', description: 'Calculatorul afișează media ponderată și dacă ai promovat (minim 6.00, note individuale ≥ 5.00).' },
    ],
    faqs: [
      {
        q: 'Cum se calculează media de bacalaureat?',
        a: 'Media finală = (Română scris × 0.2) + (Probă obligatorie profil × 0.2) + (Probă la alegere × 0.2) + (Oral Română × 0.1) + (Oral limbă modernă × 0.1) + (Competențe digitale × 0.1) + (Media generală liceu × 0.1). Suma ponderilor = 1.0.',
      },
      {
        q: 'Ce medie trebuie să am pentru a promova?',
        a: 'Condiții de promovare: (1) media finală ≥ 6.00; (2) fiecare notă la probele scrise ≥ 5.00; (3) fiecare notă la probele orale ≥ 5.00. Dacă oricare notă scrisă este sub 5, examenul nu este promovat indiferent de medie.',
      },
      {
        q: 'Cum influențează media de liceu nota finală?',
        a: 'Media generală din liceu (cl. 9–12) influențează 10% din nota finală de bacalaureat. Este media aritmetică a tuturor mediilor anuale din clasele 9–12.',
      },
      {
        q: 'Câte probe scrise sunt la bacalaureat?',
        a: 'Există 3 probe scrise: Română (obligatorie), o probă obligatorie de profil (ex. Matematică pentru real, Istorie pentru uman), și o probă la alegere a profilului. Fiecare probă durează 3 ore.',
      },
      {
        q: 'Ce se întâmplă dacă ai picat bacalaureatul?',
        a: 'Poți susține examenul în sesiunile din august ale aceluiași an sau în sesiunile din anii următori, fără limită de număr. Probele susținute cu notă ≥ 5.00 pot fi păstrate timp de 2 ani.',
      },
    ],
    relatedSlugs: ['ap-bio-score-calculator', 'midpoint-calculator'],
    ctaHook: 'Ești profesor sau meditator? Pixie îți generează site-ul în 60 de secunde — scrie-ne pe WhatsApp.',
    aboutHeading: 'Cum funcționează examenul de bacalaureat în România',
    about:
      'Bacalaureatul românesc este examenul de absolvire a liceului, echivalentul A-Level-urilor britanice. Susținut de elevi din clasa a 12-a, examenul include probe scrise pe 3 zile (Română, profil obligatoriu, la alegere) și probe orale evaluate anterior. Rata de promovare variază între 60–75% la nivel național. Notele de la bacalaureat sunt esențiale pentru admiterea la universitățile din România. Ministerul Educației publică anual metodologia de calcul; acest calculator implementează formula standard pentru sesiunea 2025–2026.',
  },
  {
    slug: 'crosswind-calculator',
    title: 'Crosswind Calculator for Pilots — Free Tool',
    h1: 'Crosswind Calculator',
    shortName: 'Crosswind Calculator',
    tagline: 'Calculate crosswind and headwind components for any runway.',
    metaDescription:
      'Work out the crosswind component for any runway with this free crosswind calculator. Enter wind and runway heading for an instant result.',
    keywords: ['crosswind calculator', 'crosswind component calculator', 'aviation crosswind', 'headwind calculator', 'runway crosswind'],
    category: 'Calculator',
    emoji: '✈️',
    image: '/tools/crosswind-calculator.jpg',
    imageAlt: 'Small aircraft on a runway with a wind sock blowing sideways',
    primaryKeyword: 'crosswind calculator',
    intro:
      'Enter the wind direction (from ATIS or METAR), wind speed, and the runway heading you\'re departing or landing on. Get the exact crosswind and headwind/tailwind component in seconds — no trigonometry required. Essential for student pilots and checkride prep.',
    howItWorks: [
      { title: 'Enter wind direction & speed', description: 'Wind direction in degrees and speed in knots from your ATIS/METAR report.' },
      { title: 'Enter runway heading', description: 'The runway heading in degrees (runway 27 = 270°, runway 09 = 090°).' },
      { title: 'Get crosswind & headwind', description: 'See the crosswind component and headwind (positive) or tailwind (negative) instantly.' },
    ],
    faqs: [
      {
        q: 'How do you calculate crosswind component?',
        a: 'Crosswind = wind speed × sin(wind angle), where wind angle is the difference between wind direction and runway heading. Example: wind from 270°, runway 240° → wind angle = 30° → Crosswind = 20 kts × sin(30°) = 10 kts.',
      },
      {
        q: 'How do you calculate headwind component?',
        a: 'Headwind = wind speed × cos(wind angle). Using the same example: 20 kts × cos(30°) = 17.3 kts headwind. A negative value means a tailwind.',
      },
      {
        q: 'What is the max crosswind for a Cessna 172?',
        a: 'The Cessna 172S has a demonstrated crosswind component of 15 knots. As a student pilot, treating it as a personal limit is wise. Always check your specific aircraft\'s POH.',
      },
      {
        q: 'What does demonstrated crosswind component mean?',
        a: 'It\'s the maximum crosswind at which the aircraft was tested during certification. The actual maximum depends on pilot skill — experienced pilots can handle crosswinds beyond the demonstrated limit in good conditions.',
      },
      {
        q: 'What runway number should I enter?',
        a: 'Multiply the runway number by 10 to get the heading. Runway 27 = 270°, Runway 09 = 090°, Runway 36 = 360°. Use the runway you\'re actually landing on.',
      },
    ],
    relatedSlugs: ['dunk-calculator', 'midpoint-calculator'],
    ctaHook: 'Run a flight school or aviation blog? Pixie generates your website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'Why crosswind calculation matters in aviation',
    about:
      'Crosswind landings are one of the most skill-intensive maneuvers in general aviation, and exceeding crosswind limits is a leading cause of runway excursions. The crosswind component formula resolves the wind vector into two components relative to the runway: one parallel (headwind/tailwind) and one perpendicular (crosswind). Each aircraft has a "demonstrated crosswind" value in the POH — for the Cessna 172, it\'s 15 knots; for a Boeing 737, up to 35 knots. ATIS and METAR reports give wind in degrees magnetic and speed in knots, so this calculator accepts those inputs directly. Always verify conditions at the actual airport — ground-level winds can differ significantly from reported winds.',
  },
  {
    slug: 'dunk-calculator',
    title: 'Dunk Calculator — Can You Dunk a Basketball?',
    h1: 'Dunk Calculator',
    shortName: 'Dunk Calculator',
    tagline: 'Find out if you can dunk — and exactly how high you need to jump.',
    metaDescription:
      'Find out if you can dunk with this free dunk calculator. Enter your height, reach, and vertical jump to see the rim height you can hit.',
    keywords: ['dunk calculator', 'can i dunk calculator', 'vertical jump to dunk', 'how high to dunk', 'basketball dunk calculator'],
    category: 'Calculator',
    emoji: '🏀',
    image: '/tools/dunk-calculator.jpg',
    imageAlt: 'Basketball player dunking over a defender in a gym',
    primaryKeyword: 'dunk calculator',
    intro:
      'Enter your height and standing reach to find out exactly how high you need to jump to dunk a standard 10-foot basketball rim. See your vertical gap, athleticism rating, and specific training targets to get you dunking.',
    howItWorks: [
      { title: 'Enter your height', description: 'Your height in feet/inches or cm. Used to estimate standing reach if you don\'t know it.' },
      { title: 'Enter standing reach (optional)', description: 'How high you can reach flat-footed with arm fully extended. Defaults to height × 1.33.' },
      { title: 'See your dunk gap', description: 'How many inches above the rim you need to reach, and the vertical jump needed to close that gap.' },
    ],
    faqs: [
      {
        q: 'How high do you need to jump to dunk?',
        a: 'The rim is at 10 feet (120 inches). You need your hand at least 6 inches above the rim to place the ball — so roughly 126 inches. Vertical needed = 126 inches minus your standing reach. A 6\'0" person has a standing reach of ~96 inches, so they need a ~30-inch vertical to dunk.',
      },
      {
        q: 'What vertical jump is needed to dunk at 5\'9"?',
        a: 'At 5\'9", standing reach is about 91 inches. You need fingertips to reach 126", so your vertical gap is 35 inches. A 35-inch vertical is elite athlete territory — achievable with serious training but not easy.',
      },
      {
        q: 'Can a 5\'10" person dunk?',
        a: 'Yes, but it requires a 30–35 inch vertical. Standing reach at 5\'10" is about 92 inches. Most recreational players need focused plyometric training to reach this.',
      },
      {
        q: 'How do I increase my vertical jump?',
        a: 'Proven methods: plyometric training (box jumps, depth jumps), strength training (squats, Romanian deadlifts, hip thrusts), and sprint work. Most athletes can add 4–8 inches to their vertical in 8–12 weeks of focused training.',
      },
      {
        q: 'What is a good standing reach?',
        a: 'Average standing reach is about 1.33× your height. NBA players average higher because they\'re selected for wingspan. If your reach is notably below 1.3× height, improving shoulder mobility can help.',
      },
    ],
    relatedSlugs: ['crosswind-calculator', 'midpoint-calculator'],
    ctaHook: 'Run a basketball gym or coaching business? Pixie generates your website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'The physics and training science behind dunking',
    about:
      'Dunking a basketball requires overcoming a precise physical gap: the rim is at 10 feet, and you need your hand at least 6 inches above it to place the ball — so fingertip reach must hit 126 inches. The gap between your standing reach and 126 inches is your vertical jump requirement. Most adults need a 24–40 inch vertical depending on height. The world record standing vertical jump is 46 inches (Brett Williams, 2019). In the NBA, the average vertical is about 28 inches. Training the vertical primarily targets fast-twitch muscle fibers in the quadriceps, glutes, and calves. Plyometric exercises are the most evidence-backed method for increasing jump height. Most programs report 4–8 inch gains in 8–12 weeks.',
  },
  {
    slug: 'dots-calculator',
    title: 'DOTS Calculator — Score Your Powerlifting Lift',
    h1: 'DOTS Calculator',
    shortName: 'DOTS Calculator',
    tagline: 'Score your powerlifting total across any bodyweight.',
    metaDescription:
      'Score your powerlifting total with this free DOTS calculator. Enter bodyweight and lift total to compare strength across weight classes.',
    keywords: ['dots calculator', 'dots score calculator', 'powerlifting dots calculator', 'dots coefficient calculator', 'powerlifting score calculator'],
    category: 'Calculator',
    emoji: '🏋️',
    image: '/tools/dots-calculator.jpg',
    imageAlt: 'Powerlifter mid-deadlift with a loaded barbell in a gym',
    primaryKeyword: 'dots calculator',
    intro:
      'Enter your bodyweight and total lifted to score your performance on the DOTS scale — the modern coefficient that lets lifters of any size compare strength pound-for-pound. Works in kg or lb for men and women, and rates your score from novice to world class.',
    howItWorks: [
      { title: 'Pick sex and units', description: 'DOTS uses separate coefficients for men and women. Switch between kg and lb to match your meet or gym.' },
      { title: 'Enter bodyweight and total', description: 'Your bodyweight and the total you lifted (squat + bench + deadlift, or any total you want to score).' },
      { title: 'Get your DOTS score', description: 'See your DOTS points and a rating from novice to world class — comparable across every weight class.' },
    ],
    faqs: [
      {
        q: 'What is a DOTS score?',
        a: 'DOTS is a coefficient that adjusts your total for bodyweight so lifters of different sizes can be ranked on one scale. Multiply your total by your DOTS coefficient and you get a single number — higher means stronger pound-for-pound.',
      },
      {
        q: 'How is the DOTS score calculated?',
        a: 'DOTS = total × 500 ÷ (a·bw⁴ + b·bw³ + c·bw² + d·bw + e), where bw is bodyweight in kg and the five coefficients differ for men and women. This calculator runs that exact formula.',
      },
      {
        q: 'What is a good DOTS score?',
        a: 'As a rough guide: under 200 is novice, around 300 is a solid intermediate/advanced lifter, 400 is elite/competitive, and 500+ is world-class. The exact bands vary slightly by federation and sex.',
      },
      {
        q: 'DOTS vs Wilks — what is the difference?',
        a: 'DOTS was introduced in 2019 as an updated single-formula replacement for the older Wilks coefficient. It uses one modern dataset for each sex and is considered fairer to lighter and heavier lifters than the original Wilks.',
      },
      {
        q: 'Does DOTS work for both men and women?',
        a: 'Yes. DOTS uses a separate set of five coefficients for men and women, so select your sex before scoring. The result is directly comparable across sexes and weight classes.',
      },
    ],
    relatedSlugs: ['dunk-calculator', 'era-calculator'],
    ctaHook: 'Run a powerlifting gym, coaching service, or barbell club? Pixie generates your website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How the DOTS formula scores strength',
    about:
      'DOTS solves a basic problem in strength sports: a 60 kg lifter and a 120 kg lifter can never be compared by raw total, because bigger bodies move bigger weights. A coefficient based on bodyweight levels the field. The original solution was the Wilks coefficient, used for decades, but it was criticized for unfairly favoring lifters at certain bodyweights. In 2019 Tim Konertz published DOTS as a modernized replacement, fitting a single fourth-order polynomial to updated competition data for each sex. The formula is total × 500 ÷ (a·bw⁴ + b·bw³ + c·bw² + d·bw + e). DOTS is now the default scoring system in many federations and lifting apps because it produces one clean, sex- and size-adjusted number, making it easy to rank an entire meet — or compare your own progress as your bodyweight changes — on a single scale.',
  },
  {
    slug: 'middle-name-generator',
    title: 'Middle Name Generator — Find the Right Name',
    h1: 'Middle Name Generator',
    shortName: 'Middle Name Generator',
    tagline: 'Generate perfect middle name ideas based on first and last name.',
    metaDescription:
      'Find the perfect middle name with this free middle name generator. Pick a first name, get matching middle name ideas instantly.',
    keywords: ['middle name generator', 'middle name ideas', 'baby middle name', 'find middle name', 'middle name for baby'],
    category: 'Generator',
    emoji: '👶',
    image: '/tools/middle-name-generator.jpg',
    imageAlt: 'Handwritten baby name list in a notebook with a pen',
    primaryKeyword: 'middle name generator',
    intro:
      'Enter a first name and last name to get middle name suggestions that flow well phonetically. Filter by style — classic, modern, nature-inspired, or short. Each suggestion includes origin and meaning. Perfect for new parents, authors naming characters, or anyone looking for the right fit.',
    howItWorks: [
      { title: 'Enter first and last name', description: 'The generator uses syllable count and phonetic patterns to find names that flow naturally in between.' },
      { title: 'Pick a style', description: 'Optional: classic, modern, nature, or short (1–2 syllables). Filter narrows suggestions to your vibe.' },
      { title: 'Get suggestions with meanings', description: 'See middle name options with origin and meaning, ranked by phonetic flow.' },
    ],
    faqs: [
      {
        q: 'How do you choose a middle name that flows well?',
        a: 'Alternate stressed syllables. If the first name ends with a stressed syllable (like "James"), pair it with a middle starting with an unstressed syllable. Avoid middle names that rhyme with the first or last name. Aim for different syllable counts than the first name.',
      },
      {
        q: 'Should a middle name have a special meaning?',
        a: 'Many parents use middle names to honor family members or cultural heritage. Others prioritize flow over meaning. Both are valid — the middle name is rarely used daily, so phonetic flow is pragmatic.',
      },
      {
        q: 'Can I have two middle names?',
        a: 'Yes. Two middle names are common in Spanish-speaking and British cultures. Just check the full name flows when said aloud quickly.',
      },
      {
        q: 'Are one-syllable middle names a good choice?',
        a: 'Yes — short middle names (Mae, Rose, James, Cole) are extremely popular. A three-syllable first name often pairs beautifully with a one-syllable middle: "Isabella Mae" or "Alexander James".',
      },
      {
        q: 'How important are the initials combination?',
        a: 'Worth checking. Initials like A.S.S. or D.I.E. can be embarrassing on monograms and luggage. Run the full initials before committing.',
      },
    ],
    relatedSlugs: ['half-birthday-calculator', 'era-calculator'],
    ctaHook: 'Running a baby brand or parenting blog? Pixie generates your website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'The history and culture of middle names',
    about:
      'Middle names are a relatively modern convention. In medieval Europe, most people had only one name. The practice expanded in the 16th century among Spanish and Portuguese nobility and spread through Germany, where the "Mittelname" became common in the 18th century. In the United States, middle names became near-universal by the 19th century, often used to preserve a mother\'s maiden surname or honor a godparent. Today, about 80% of Americans have a middle name. Middle names rarely appear in daily life — they show up on official documents, are invoked when a parent is very serious ("James Oliver Smith, come here!"), and appear on graduation diplomas. Despite rare use, middle names carry significant meaning as a vehicle for family history and cultural connection.',
  },
  {
    slug: 'era-calculator',
    title: 'ERA Calculator — Calculate Baseball ERA Fast',
    h1: 'ERA Calculator',
    shortName: 'ERA Calculator',
    tagline: 'Calculate a pitcher\'s earned run average in seconds.',
    metaDescription:
      'Calculate any pitcher\'s earned run average with this free ERA calculator. Enter earned runs and innings pitched to get the exact ERA.',
    keywords: ['era calculator', 'earned run average calculator', 'baseball era calculator', 'how to calculate era', 'pitching era calculator'],
    category: 'Calculator',
    emoji: '⚾',
    image: '/tools/era-calculator.jpg',
    imageAlt: 'Baseball pitcher throwing from the mound during a game',
    primaryKeyword: 'era calculator',
    intro:
      'Enter a pitcher\'s earned runs and innings pitched to get their exact earned run average (ERA) — the standard measure of pitching performance. Handles baseball innings notation (.1 = one out, .2 = two outs) automatically and rates the result from elite to high.',
    howItWorks: [
      { title: 'Enter earned runs', description: 'The number of earned runs charged to the pitcher (exclude unearned runs from errors).' },
      { title: 'Enter innings pitched', description: 'Use standard notation — 6.1 means 6 innings and 1 out, 6.2 means 6 innings and 2 outs.' },
      { title: 'Get the ERA', description: 'See the exact earned run average ((ER ÷ IP) × 9) plus a rating from elite to high.' },
    ],
    faqs: [
      {
        q: 'How do you calculate ERA?',
        a: 'ERA = (earned runs ÷ innings pitched) × 9. The × 9 normalizes the rate to a standard nine-inning game. Example: 3 earned runs over 7 innings = (3 ÷ 7) × 9 = 3.86 ERA.',
      },
      {
        q: 'What is a good ERA in baseball?',
        a: 'Under 2.00 is elite (Cy Young territory), 2.00–3.00 is excellent, 3.00–4.00 is good, 4.00–5.00 is roughly league average, and above 5.00 has room to improve. League average in MLB usually sits around 4.00.',
      },
      {
        q: 'What is the difference between earned and unearned runs?',
        a: 'An earned run is one the pitcher is responsible for. A run that scores only because of a fielding error or passed ball is "unearned" and is excluded from ERA — so ERA reflects pitching, not the defense behind it.',
      },
      {
        q: 'How do innings pitched (.1 and .2) work?',
        a: 'The decimal in innings pitched counts outs, not tenths. 6.1 means 6 innings plus 1 out (6⅓), and 6.2 means 6 innings plus 2 outs (6⅔). This calculator converts that notation automatically.',
      },
      {
        q: 'What is a perfect ERA?',
        a: 'A 0.00 ERA means the pitcher has allowed no earned runs all season. It is common over small samples (a few relief innings) but extremely rare across a full starter\'s workload.',
      },
    ],
    relatedSlugs: ['dunk-calculator', 'dots-calculator'],
    ctaHook: 'Run a baseball academy, league, or sports blog? Pixie generates your website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'What ERA really measures in baseball',
    about:
      'Earned run average is the oldest and most widely cited measure of pitching performance, dating back to the early 20th century when relief pitching made win-loss records an unfair way to judge pitchers. ERA answers a simple question: how many earned runs does this pitcher give up per nine innings? Because it is a rate stat, it lets you compare a starter who throws 200 innings against a reliever who throws 60. The formula is ERA = (earned runs ÷ innings pitched) × 9. A sub-3.00 ERA across a full season is excellent; the all-time single-season record is Tim Keefe\'s 0.86 (1880), and in the modern era Bob Gibson\'s 1.12 (1968) stands out. ERA has limitations — it depends on the defense behind the pitcher and on official-scorer error judgments — which is why analysts also use FIP and ERA+. But for a fast, intuitive read on how a pitcher is performing, ERA remains the number everyone checks first.',
  },
  {
    slug: 'uma-affinity-calculator',
    title: 'Uma Affinity Calculator — Best Inherit Pairs',
    h1: 'Uma Musume Affinity Calculator',
    shortName: 'Uma Affinity Calculator',
    tagline: 'Check breeding compatibility before you pick inherit parents.',
    metaDescription:
      'Find the best parent pairs with this free Uma affinity calculator. Check Uma Musume compatibility scores before breeding your next horse.',
    keywords: ['uma affinity calculator', 'uma musume affinity', 'uma musume breeding', 'uma musume inherit pairs', 'pretty derby affinity'],
    category: 'Calculator',
    emoji: '🐴',
    image: '/tools/uma-affinity-calculator.jpg',
    imageAlt: 'Colorful anime-style characters in racing uniforms',
    primaryKeyword: 'uma affinity calculator',
    intro:
      'Estimate the breeding affinity (相性) between two parent Umas before you commit to an inherit pair in Uma Musume Pretty Derby. Enter their shared race wins, relationship, and shared aptitudes to get a compatibility score and the ◎/○/△/✕ rating that drives better stat and skill inheritance.',
    howItWorks: [
      { title: 'Enter shared race wins', description: 'Count the major (G1) races BOTH parents have won — the single biggest affinity driver.' },
      { title: 'Set the relationship', description: 'Pick whether the two parents share a character line or rival relationship, plus shared distance/style aptitudes.' },
      { title: 'Get the affinity rating', description: 'See a 0–100 compatibility score and the ◎/○/△/✕ symbol so you can pick the strongest inherit pair.' },
    ],
    faqs: [
      {
        q: 'What is breeding affinity (相性) in Uma Musume?',
        a: 'Affinity is the compatibility between your trainee and its two parents — and between the two parents themselves. Higher affinity raises stat gains and the chance that inherited "factors" (sparks) activate, so a good inherit pair is the foundation of a strong Uma.',
      },
      {
        q: 'How do you increase breeding affinity?',
        a: 'The biggest driver is shared major (G1) race wins between the two parents. Character relationships (same line or rival pairs) add a fixed bonus, and shared distance/running-style aptitudes help too. Stack these and the pair moves toward the ◎ rating.',
      },
      {
        q: 'What does the ◎ affinity rating mean?',
        a: 'The game shows affinity as ◎ (best), ○ (good), △ (fair), or ✕ (poor). ◎ between all three relationships (trainee–parent1, trainee–parent2, parent1–parent2) gives the strongest inheritance — that is what you aim for when picking parents.',
      },
      {
        q: 'How accurate is this affinity calculator?',
        a: 'It estimates affinity from its main public drivers — shared race wins, parent relationship, and shared aptitudes. The game also adds fixed per-character relationship values from an internal table, so treat the score as a strong guide for choosing inherit pairs rather than an exact in-game number.',
      },
      {
        q: 'Why do inherit pairs matter so much?',
        a: 'Better affinity means more of the parents\' blue (stat) and pink (aptitude) factors carry over, plus higher base stat gains. Over multiple generations, consistently breeding high-affinity ◎ pairs is how players build the powerful inherited factors needed for top-tier Umas.',
      },
    ],
    relatedSlugs: ['dots-calculator', 'midpoint-calculator'],
    ctaHook: 'Running a gaming blog or esports brand? Pixie generates your website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How breeding affinity works in Uma Musume',
    about:
      'In Uma Musume Pretty Derby, every trained Uma can be used as a parent to pass inherited "factors" (sparks) to the next trainee. How much carries over depends on affinity — the compatibility score between the trainee and each parent, and between the two parents themselves. The game evaluates three relationships and rates each ◎/○/△/✕. Affinity is driven mainly by shared major race wins (when both parents won the same G1 races), fixed character relationships (same series, rival pairs, or story links), and shared aptitudes. A ◎/◎/◎ pairing maximizes both base stat inheritance and the activation rate of blue (stat) and pink (aptitude) factors, which is why experienced players plan inherit pairs carefully across generations rather than breeding at random. This calculator estimates that affinity from its main public drivers so you can compare candidate parent pairs before committing a breeding slot — the exact in-game value also includes Cygames\' internal per-character relationship table.',
  },
  {
    slug: 'fancy-text-generator',
    title: 'Fancy Text Generator — Cool Fonts to Copy',
    h1: 'Fancy Text Generator',
    shortName: 'Fancy Text Generator',
    tagline: 'Turn plain text into dozens of cool fonts you can copy and paste anywhere.',
    metaDescription:
      'Turn plain text into cool styled fonts with this free fancy text generator. Copy and paste fancy text into Instagram, TikTok, or anywhere.',
    keywords: ['fancy text generator', 'cool text generator', 'text fonts', 'font generator', 'cool fonts copy and paste', 'stylish text'],
    category: 'Generator',
    emoji: '✨',
    image: '/tools/fancy-text-generator.jpg',
    imageAlt: 'Colorful neon typography and lettering on a dark wall',
    primaryKeyword: 'fancy text generator',
    intro:
      'Type your text once and instantly get dozens of fancy font styles — bold, italic, cursive script, gothic fraktur, double-struck outline, small caps and more. Every style is made of real Unicode characters, so you can copy and paste them straight into Instagram bios, TikTok captions, Discord, Twitter/X, or anywhere else that accepts plain text. No app, no signup, no images — just tap copy.',
    howItWorks: [
      { title: 'Type your text', description: 'Enter any word, name, or sentence in the box. Every style updates live as you type.' },
      { title: 'Pick a style', description: 'Scroll the list of fancy fonts — bold, script, cursive, gothic, outline, small caps and more.' },
      { title: 'Copy & paste', description: 'Tap copy on the style you like and paste it anywhere — bios, captions, usernames, chats.' },
    ],
    faqs: [
      {
        q: 'How does a fancy text generator work?',
        a: 'It does not really change the font — it swaps each letter for a look-alike Unicode character (like 𝐛𝐨𝐥𝐝 or 𝓼𝓬𝓻𝓲𝓹𝓽). Because these are standard characters, they keep their styled look when you paste them anywhere, even where custom fonts are not allowed.',
      },
      {
        q: 'Where can I paste fancy text?',
        a: 'Anywhere that accepts text: Instagram and TikTok bios and captions, Twitter/X, Facebook, Discord, YouTube comments, WhatsApp, and most usernames. A few apps strip unusual characters, so paste and check before posting.',
      },
      {
        q: 'Is the fancy text free to use?',
        a: 'Yes — it is completely free, with no signup and no limits. The characters are part of the Unicode standard, so you can use them in personal and commercial posts.',
      },
      {
        q: 'Why do some letters look like a plain box?',
        a: 'A box (▯) means the device or app you pasted into does not have a glyph for that character. Try a different style — sans-serif, bold, and italic are the most widely supported across phones and browsers.',
      },
      {
        q: 'Will fancy text hurt my SEO or accessibility?',
        a: 'Avoid it for important on-page content. Screen readers can mispronounce styled Unicode, and search engines may not index it well. Use it for decorative bios and captions, not your headlines or body copy.',
      },
    ],
    relatedSlugs: ['bold-text-generator', 'glitch-text-generator', 'tiny-text-generator'],
    ctaHook: 'Building a creator or personal brand? Pixie builds your full site — shop, links, content — in 60 seconds. Text us on WhatsApp.',
    aboutHeading: 'How fancy fonts and Unicode text styles actually work',
    about:
      'A "fancy text generator" does not install a font — it maps each character you type to a different code point in the Unicode standard. Unicode includes whole alphabets of styled letters in its Mathematical Alphanumeric Symbols block: bold (𝐀–𝐳), italic (𝐴–𝑧), bold-italic, script/cursive (𝒜–𝓏), fraktur/gothic (𝔄–𝔷), double-struck/outline (𝔸–𝕫), sans-serif, monospace and more. There are also enclosed alphanumerics (Ⓐ, ⓐ), full-width forms (Ａ, ａ) used in CJK typography, and phonetic small caps (ᴀ, ʙ, ᴄ). Because these are genuine characters rather than formatting, they survive copy-paste into apps that strip styling — which is exactly why they are popular for Instagram and TikTok bios, Discord names, and aesthetic captions. The trade-offs are worth knowing: not every device ships a glyph for every style (you may see a placeholder box), some platforms filter unusual characters out of usernames, and assistive technology can read styled letters incorrectly or skip them entirely. For that reason, fancy text is best used sparingly and decoratively — a stylized name or a highlight word — rather than for the main, meaningful text people and search engines need to read. This generator renders the most widely supported styles first and lets you copy any one with a single tap, so you can experiment, paste, and keep whatever looks right on your platform of choice.',
  },
  {
    slug: 'glitch-text-generator',
    title: 'Glitch Text Generator — Make Zalgo Text Free',
    h1: 'Glitch Text Generator',
    shortName: 'Glitch Text Generator',
    tagline: 'Create creepy zalgo and cursed glitch text with an adjustable intensity.',
    metaDescription:
      'Create creepy distorted text with this free glitch text generator. Copy and paste Zalgo glitch text into chats, videos, or social posts.',
    keywords: ['glitch text generator', 'zalgo text generator', 'cursed text generator', 'zalgo text', 'glitch text', 'creepy text'],
    category: 'Generator',
    emoji: '👾',
    image: '/tools/glitch-text-generator.jpg',
    imageAlt: 'Blurred, distorted black-and-white portrait',
    primaryKeyword: 'glitch text generator',
    intro:
      'Turn normal text into glitchy, corrupted "zalgo" text dripping with combining marks. Use the intensity slider to go from a subtle creepy wobble to fully cursed chaos, then hit re-roll for a fresh distortion and copy the result into Discord, Instagram, Twitter/X, or your next horror-themed post. Every character is standard Unicode, so it pastes anywhere that accepts text.',
    howItWorks: [
      { title: 'Type your text', description: 'Enter the word or phrase you want to corrupt in the input box.' },
      { title: 'Set the intensity', description: 'Drag the slider for more or fewer combining marks above, through, and below each letter.' },
      { title: 'Re-roll & copy', description: 'Hit re-roll for a new random glitch, then copy and paste it anywhere.' },
    ],
    faqs: [
      {
        q: 'What is zalgo or glitch text?',
        a: 'Zalgo text stacks lots of Unicode "combining marks" (accents and diacritics) onto normal letters. The marks pile up above and below each character, creating the corrupted, glitchy, "cursed" look that spills out of the line.',
      },
      {
        q: 'Why does my glitch text look less intense after pasting?',
        a: 'Many apps cap how many combining marks they render per character for safety and performance. If your destination tames the effect, lower the intensity slightly so it looks intentional rather than clipped.',
      },
      {
        q: 'Where can I use glitch text?',
        a: 'Discord, Instagram, TikTok, Twitter/X, and most chat apps. Some platforms limit or filter heavy combining marks in usernames, so test before you rely on it there.',
      },
      {
        q: 'Is glitch text safe to copy and paste?',
        a: 'Yes. It is just ordinary Unicode characters — there is no code or script involved. Extremely heavy zalgo can briefly lag older apps when rendering, but it cannot harm your device.',
      },
      {
        q: 'Can I make subtle glitch text instead of full chaos?',
        a: 'Absolutely. Set the intensity slider low for a light, eerie distortion that stays readable, or crank it up for the classic over-the-top cursed effect.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'strikethrough-text-generator', 'upside-down-text-generator'],
    ctaHook: 'Run a gaming, streaming, or horror brand? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'The Unicode behind zalgo and cursed text',
    about:
      'Glitch or "zalgo" text relies on a quiet feature of Unicode: combining characters. A combining mark (code points roughly U+0300 to U+036F) has no width of its own — it attaches to the character before it. Normally that is how languages stack accents, like the marks in "café" or Vietnamese tone marks. Zalgo abuses the mechanism by attaching many marks to a single base letter: combiners that render above the glyph, ones that render through the middle, and ones that render below. Pile on enough and the text appears to melt, drip, and overflow its line — the signature corrupted look named after an internet horror meme. Because the result is built entirely from valid Unicode, it copies and pastes like any other text and needs no special font. There are practical limits, though. To protect performance and prevent abuse, many platforms normalize text or cap the number of combining marks they will render per base character, so an extreme glitch can look milder once pasted into Discord, iMessage, or a browser. Usernames are the strictest surface and often reject heavy combiners outright. This generator gives you an intensity slider so you can dial the chaos to match where it is going — a faint, unsettling shimmer for a caption, or a fully cursed wall for a horror post — plus a re-roll button that randomizes which marks land where, so no two generations look exactly alike. It is a fun, harmless typographic effect; just keep it out of anything that needs to stay cleanly readable or accessible.',
  },
  {
    slug: 'heart-symbol-generator',
    title: 'Heart Symbol Generator — Copy Heart Symbols',
    h1: 'Heart Symbol Generator',
    shortName: 'Heart Symbol Generator',
    tagline: 'Tap to copy hearts, stars, and aesthetic text symbols for any platform.',
    metaDescription:
      'Find every heart you need with this free heart symbol generator. Click any heart symbol to copy and paste it into messages or social posts.',
    keywords: ['heart symbol text', 'heart text symbol', 'text symbols', 'heart symbol copy and paste', 'text emojis', 'aesthetic symbols'],
    category: 'Generator',
    emoji: '💕',
    image: '/tools/heart-symbol-generator.jpg',
    imageAlt: 'Soft pink hearts and decorative symbols on a pastel background',
    primaryKeyword: 'heart symbol text',
    intro:
      'A tap-to-copy palette of heart symbols (♥ ♡ ❤ 💕), stars, sparkles, flowers, and aesthetic text symbols you can paste anywhere — Instagram and TikTok bios, WhatsApp, Discord, usernames, and captions. Want a quick decoration? Use the builder to wrap your name or text in the heart of your choice and copy the whole thing in one click. No keyboard shortcuts to memorize.',
    howItWorks: [
      { title: 'Browse the symbols', description: 'Scroll grouped palettes of hearts, stars, flowers, and decorative symbols.' },
      { title: 'Tap to copy', description: 'Click any symbol to copy it instantly — then paste it wherever you like.' },
      { title: 'Or wrap your text', description: 'Pick a heart, type your name, and copy your text wrapped in matching symbols.' },
    ],
    faqs: [
      {
        q: 'How do I type a heart symbol without emoji?',
        a: 'Use the text heart characters ♥ (solid) or ♡ (outline) from the palette above — just tap to copy. Unlike the 💕 emoji, these are monochrome text symbols that take on your text colour.',
      },
      {
        q: 'What is the difference between a heart symbol and a heart emoji?',
        a: 'A heart emoji (❤️, 💖) is a colour pictograph that looks different on each device. A heart text symbol (♥, ♡) is a single character that inherits your font colour and size, so it blends into text and usernames more cleanly.',
      },
      {
        q: 'Where can I paste these symbols?',
        a: 'Instagram, TikTok, WhatsApp, Discord, Twitter/X, YouTube, and most usernames and bios. They are standard Unicode characters, so they work almost everywhere text is allowed.',
      },
      {
        q: 'Can I use these symbols in my username?',
        a: 'Often yes, but it depends on the platform. Many allow ♥ and ★ in display names; some restrict symbols in handles. Paste and save to check whether your platform accepts it.',
      },
      {
        q: 'Are these symbols free to use?',
        a: 'Yes. They are part of Unicode and free for personal and commercial use — no attribution, signup, or limits.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'tiny-text-generator', 'bold-text-generator'],
    ctaHook: 'Run a shop or creator brand? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'Heart symbols, text symbols, and how copy-paste characters work',
    about:
      'Text symbols like ♥, ★, ✿, and ➳ are single Unicode characters — not images and not emoji. That distinction matters. An emoji such as 💖 is rendered by your operating system as a small colour picture that looks different on iPhone, Android, Windows, and each app. A text symbol such as ♥ is a monochrome glyph that behaves like a letter: it takes your current font, colour, and size, and it sits neatly inline with the rest of your text. That is why aesthetic bios and usernames lean on text symbols — they look consistent and tidy across platforms in a way emoji cannot. These characters come from a handful of Unicode blocks: Miscellaneous Symbols (hearts, stars, suits), Dingbats (decorative florals, arrows, check marks, snowflakes), and various arrow and geometric ranges. Because they are standard characters, copying one and pasting it into Instagram, TikTok, WhatsApp, Discord, or a document just works almost everywhere — no special keyboard, shortcut codes, or app required. The main caveat is usernames and handles: some platforms allow symbols in display names but restrict them in the unique handle, and a few strip non-letter characters entirely, so it is worth pasting and saving to confirm. This tool gives you a click-to-copy palette grouped by theme — hearts, stars and sparkles, flowers and nature, and a grab-bag of arrows and decorative marks — plus a small builder that wraps your name or phrase in the heart symbol of your choice so you can copy a finished, decorated string in one tap. Everything here is free Unicode you can reuse however you like.',
  },
  {
    slug: 'tiny-text-generator',
    title: 'Tiny Text Generator — Small Caps & Superscript',
    h1: 'Tiny Text Generator',
    shortName: 'Tiny Text Generator',
    tagline: 'Shrink your words into tiny superscript, subscript, and small-caps text.',
    metaDescription:
      'Turn any text into tiny letters with this free tiny text generator. Copy small caps, superscript, and subscript styles for bios and chats.',
    keywords: ['tiny text generator', 'small text', 'small text generator', 'tiny text copy and paste', 'small caps generator', 'mini text'],
    category: 'Generator',
    emoji: '🔡',
    image: '/tools/tiny-text-generator.jpg',
    imageAlt: 'Drawers of vintage metal letterpress type',
    primaryKeyword: 'tiny text generator',
    intro:
      'Convert your text into tiny letters using real Unicode characters — superscript (ᵗⁱⁿʸ), subscript (ₜᵢₙᵧ), and small caps (ᴛɪɴʏ). Type once and copy whichever small style fits your Instagram or TikTok bio, caption, or username. No images and no formatting tricks — just small, copy-paste-ready text that works almost anywhere.',
    howItWorks: [
      { title: 'Type your text', description: 'Enter any word or phrase. All three tiny styles update as you type.' },
      { title: 'Choose a style', description: 'Pick superscript, subscript, or small caps depending on the look you want.' },
      { title: 'Copy & paste', description: 'Tap copy and paste the small text into your bio, caption, or username.' },
    ],
    faqs: [
      {
        q: 'How does a tiny text generator work?',
        a: 'It replaces your normal letters with smaller Unicode look-alikes — superscript, subscript, and small-capital characters. Because these are real characters, the tiny look survives copy-paste, even in apps that do not let you change font size.',
      },
      {
        q: 'Why are some tiny letters missing or full-size?',
        a: 'Unicode does not have a small version of every letter. Subscript in particular is missing many letters, so unsupported characters stay full size. Superscript and small caps cover more of the alphabet.',
      },
      {
        q: 'Where can I use tiny text?',
        a: 'Instagram and TikTok bios and captions, Twitter/X, Discord, and many usernames. As always, paste and preview first — a few platforms normalize or strip unusual characters.',
      },
      {
        q: 'Is tiny text bad for accessibility?',
        a: 'It can be. Screen readers may skip or mispronounce superscript and small-caps characters, so keep tiny text decorative and avoid it for information people actually need to read.',
      },
      {
        q: 'Is the tiny text generator free?',
        a: 'Yes, completely free with no signup or limits. The characters are standard Unicode, free for personal and commercial use.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'bold-text-generator', 'heart-symbol-generator'],
    ctaHook: 'Building a personal brand or creator page? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How tiny text is made from Unicode',
    about:
      'Tiny text is not a smaller font size — it is a set of genuinely smaller characters that already exist in Unicode. Three families do most of the work. Superscript characters (the small raised letters and digits used in footnotes and maths, like ⁿ and ²) give you a compact, slightly-above-the-line look. Subscript characters (the small lowered letters and digits used in chemistry, like the 2 in H₂O) give a similar shrunk look sitting on the baseline, though Unicode only defines a limited set of subscript letters, so several letters of the alphabet have no subscript form and will appear full size. Small capitals (ᴀ, ʙ, ᴄ — borrowed from the phonetic alphabet) fold every letter to a uniform petite capital and tend to look the most polished for names and bios. Because all three are ordinary characters rather than styling, the tiny effect is preserved when you copy and paste into places that do not let you resize text at all, which is exactly why people use them for Instagram and TikTok bios, aesthetic captions, and compact usernames. The same caveats apply as with any decorative Unicode: not every device has a glyph for every small character, some platforms normalize text and may convert it back to full size, and assistive technology can read these characters incorrectly or skip them. The practical advice is to keep tiny text for decoration — a stylized handle or a quiet sub-line — and to keep the important, meaningful words in normal text so everyone, including screen readers and search engines, can read them. This generator shows all three tiny styles at once so you can compare and copy whichever one renders best where you are pasting it.',
  },
  {
    slug: 'upside-down-text-generator',
    title: 'Upside Down Text Generator — Flip Text Free',
    h1: 'Upside Down Text Generator',
    shortName: 'Upside Down Text Generator',
    tagline: 'Flip your text upside down to copy and paste anywhere.',
    metaDescription:
      'Flip any sentence with this free upside down text generator. Copy and paste backwards, mirrored text into chats, bios, and social posts.',
    keywords: ['upside down text', 'upside down text generator', 'flip text', 'reverse text', 'flip text generator', 'text flipper'],
    category: 'Generator',
    emoji: '🙃',
    image: '/tools/upside-down-text-generator.jpg',
    imageAlt: 'A child hanging upside down',
    primaryKeyword: 'upside down text generator',
    intro:
      'Flip your text completely upside down — uʍop ǝpᴉsdn — using look-alike Unicode characters, then copy and paste it into Instagram, TikTok, Twitter/X, Discord, or a text message for a fun, attention-grabbing effect. It works on letters, numbers, and common punctuation, and reverses the order so the whole sentence reads as if it were turned 180°.',
    howItWorks: [
      { title: 'Type your text', description: 'Enter any word or sentence in the box.' },
      { title: 'See it flip', description: 'Your text is mapped to upside-down characters and reversed automatically.' },
      { title: 'Copy & paste', description: 'Tap copy and paste the flipped text anywhere you like.' },
    ],
    faqs: [
      {
        q: 'How does upside down text work?',
        a: 'Each letter is swapped for a Unicode character that looks like the original turned 180° (for example a → ɐ, e → ǝ), and the whole string is reversed so it reads correctly when flipped. It is not an image — it is real, copy-paste-ready text.',
      },
      {
        q: 'Where can I paste upside down text?',
        a: 'Instagram, TikTok, Twitter/X, Facebook, Discord, WhatsApp, and most text fields. A few platforms strip unusual characters from usernames, so test there before relying on it.',
      },
      {
        q: 'Why do a few characters not flip?',
        a: 'Unicode does not have an upside-down look-alike for every symbol. Unsupported characters are left as-is, so an occasional letter or symbol may appear normal in the flipped output.',
      },
      {
        q: 'Can I flip numbers too?',
        a: 'Yes — digits are mapped to their closest upside-down forms (for example 3 → Ɛ, 4 → ㄣ), so phone-number-style strings and dates flip along with your words.',
      },
      {
        q: 'Is the upside down text generator free?',
        a: 'Completely free, no signup or limits. The flipped characters are standard Unicode and free to use in personal and commercial posts.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'glitch-text-generator', 'strikethrough-text-generator'],
    ctaHook: 'Run a creator or fun brand? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How flipping text upside down works',
    about:
      'Upside down text is a clever bit of Unicode substitution. There is no single switch that rotates text, so a flipper does two things at once. First, it replaces each character with a different Unicode character that happens to look like the original rotated 180 degrees. Some of these are intuitive — the letter "n" upside down looks like "u", and "p" looks like "d" — while others borrow glyphs from completely unrelated scripts and symbol sets to find a convincing match (for example, the turned "a" ɐ, turned "e" ǝ, and turned capital "A" ∀ come from phonetic and mathematical ranges). Second, it reverses the order of the characters, because when you physically flip a line of text the last letter ends up on the left. Combine the two steps and the result reads naturally when the page — or the reader — is turned over. Because the output is built from ordinary characters, it copies and pastes anywhere text is accepted and needs no special font, which is why it is a staple of playful Instagram and TikTok captions, novelty usernames, and surprise messages. The limitations are the same as with other Unicode tricks: not every glyph has a good upside-down counterpart, so a stray character may stay upright; some platforms normalize or reject unusual characters in handles; and screen readers will not interpret the flipped text the way a human eye does, so it should stay decorative. This generator handles letters, digits, and the most common punctuation, mapping and reversing your text instantly so you can copy a perfectly flipped string with a single tap.',
  },
  {
    slug: 'invisible-text-generator',
    title: 'Invisible Text Generator — Blank Spaces Free',
    h1: 'Invisible Text Generator',
    shortName: 'Invisible Text Generator',
    tagline: 'Copy invisible blank characters for empty messages, names, and bios.',
    metaDescription:
      'Create blank usernames and empty messages with this free invisible text generator. Copy and paste invisible characters anywhere online.',
    keywords: ['invisible text', 'blank text copy paste', 'invisible character', 'empty character', 'blank space copy paste', 'invisible text generator'],
    category: 'Generator',
    emoji: '👻',
    image: '/tools/invisible-text-generator.jpg',
    imageAlt: 'A blank white sheet of paper on a wooden table',
    primaryKeyword: 'invisible text',
    intro:
      'Generate and copy invisible blank characters — text that looks completely empty but is actually there. Use it to send a "blank" message, set an empty username or bio, leave a hidden space, or separate elements where a normal space gets trimmed. Pick how many invisible characters you need and copy them in one tap.',
    howItWorks: [
      { title: 'Choose how many', description: 'Use the slider to pick how many invisible characters you want to copy.' },
      { title: 'Copy the blank text', description: 'Tap copy — it looks like nothing was copied, but the invisible characters are on your clipboard.' },
      { title: 'Paste anywhere', description: 'Paste into a username, bio, message, or form field that needs to look empty.' },
    ],
    faqs: [
      {
        q: 'What is an invisible character?',
        a: 'It is a real Unicode character that renders with no visible mark — like a blank space that most apps will not trim. This tool uses the Hangul Filler (U+3164), which behaves like a real character so it survives in places that strip ordinary spaces.',
      },
      {
        q: 'How do I send a blank message?',
        a: 'Copy one or more invisible characters here, paste them into your chat box, and send. The message looks empty but contains the invisible characters, so the app accepts it as non-empty.',
      },
      {
        q: 'Can I set an invisible username or bio?',
        a: 'On many platforms, yes — paste the invisible characters where the name or bio goes. Some apps reject blank-looking input or normalize it, so if it does not save, try copying a few more characters.',
      },
      {
        q: 'Why did my invisible text disappear after pasting?',
        a: 'Some platforms strip or collapse blank characters for safety. If that happens, copy a larger batch, or the destination simply does not allow invisible input.',
      },
      {
        q: 'Is invisible text safe to use?',
        a: 'Yes — it is just a standard Unicode character with no code attached. It cannot harm your device or account; it simply takes up space without showing anything.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'tiny-text-generator', 'heart-symbol-generator'],
    ctaHook: 'Need a real website, not just a blank space? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How invisible characters and blank text work',
    about:
      'Invisible text is exactly what it sounds like: characters that occupy space but render nothing you can see. The everyday space bar produces U+0020, an ordinary space — but apps love to trim leading, trailing, and repeated spaces, so a "blank" built from normal spaces often collapses to nothing or is rejected as empty. The trick is to use characters that look blank yet behave like ordinary letters so they are not trimmed. There are several candidates in Unicode: the zero-width space (U+200B) which truly has no width, various fixed-width spaces, and the Hangul Filler (U+3164), a character originally meant as a placeholder in Korean text that most systems treat as a normal visible-width-but-blank character. This tool uses the Hangul Filler because it is the most reliable across chat apps, profiles, and games — it usually survives where a zero-width space would be stripped. People reach for invisible characters for a handful of practical reasons: sending a message that appears empty, setting a blank-looking username or display name, leaving an empty line where an app trims whitespace, or nudging layout in bios and forms. The behaviour is never guaranteed, though, because platforms increasingly normalize input to fight spam and impersonation — some collapse blank characters, some reject blank-looking names outright, and some allow them in one field but not another. That is why this generator lets you copy a single character or a whole batch at once: if one does not stick, a longer run sometimes does. It is a harmless typographic curiosity — just standard Unicode on your clipboard — useful whenever you need something that is present to the computer but invisible to the eye.',
  },
  {
    slug: 'bold-text-generator',
    title: 'Bold Text Generator — Copy Bold Unicode Text',
    h1: 'Bold Text Generator',
    shortName: 'Bold Text Generator',
    tagline: 'Make real bold text that stays bold when you copy and paste it.',
    metaDescription:
      'Turn plain text into bold Unicode with this free bold text generator. Copy and paste bold characters into Instagram, LinkedIn, or anywhere.',
    keywords: ['bold text', 'bold text generator', 'bold font copy and paste', 'bold text for instagram', 'bold letters', 'bold unicode'],
    category: 'Generator',
    emoji: '🅱️',
    image: '/tools/bold-text-generator.jpg',
    imageAlt: 'Bold block lettering on a billboard against a brick wall',
    primaryKeyword: 'bold text',
    intro:
      'Make genuine bold text that keeps its weight wherever you paste it — even in apps with no formatting button. Type once and copy from several bold styles: classic serif bold (𝐛𝐨𝐥𝐝), bold italic, bold sans-serif, and bold script. Perfect for Instagram and LinkedIn posts, Facebook, Twitter/X, and Discord where you cannot otherwise format text.',
    howItWorks: [
      { title: 'Type your text', description: 'Enter the words you want in bold. Every bold style previews live.' },
      { title: 'Pick a bold style', description: 'Choose serif bold, bold italic, bold sans, or bold script.' },
      { title: 'Copy & paste', description: 'Tap copy and paste bold text into posts, bios, headlines, and chats.' },
    ],
    faqs: [
      {
        q: 'How can text stay bold where there is no formatting?',
        a: 'This tool uses Unicode bold characters (𝐀–𝐳) rather than rich-text formatting. Because the bold look is built into the characters themselves, it survives in plain-text fields like Instagram captions and LinkedIn posts that have no bold button.',
      },
      {
        q: 'Is bold text good for LinkedIn and Instagram posts?',
        a: 'Used sparingly, yes — a bold opening line or key phrase draws the eye. Avoid bolding whole paragraphs: it hurts readability and can be mispronounced or skipped by screen readers.',
      },
      {
        q: 'Why does my bold text show as boxes on some phones?',
        a: 'A box means that device lacks a glyph for those bold characters. Bold sans-serif and serif bold are the most widely supported; switch styles if one is not rendering.',
      },
      {
        q: 'Will bold Unicode hurt my accessibility or SEO?',
        a: 'It can. Screen readers may read bold Unicode letter-by-letter or skip them, and search engines may not index them well. Keep it decorative — never use it for headings or important body text.',
      },
      {
        q: 'Is the bold text generator free?',
        a: 'Yes — free, no signup, no limits. Unicode bold characters are free to use in personal and commercial content.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'strikethrough-text-generator', 'tiny-text-generator'],
    ctaHook: 'Posting to grow a brand? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'Why Unicode bold text works in plain-text apps',
    about:
      'Most social platforms give you a plain-text box with no bold button — Instagram captions, LinkedIn posts, Twitter/X, Facebook, and Discord all store what you type as unformatted text. A bold text generator gets around that by not using formatting at all. Instead, it swaps each letter for a pre-bolded character from Unicode\'s Mathematical Alphanumeric Symbols block, which contains complete bold alphabets in several styles: bold serif (𝐀–𝐳 and digits 𝟎–𝟗), bold italic, bold sans-serif (𝗔–𝘇), bold sans-serif italic, and bold script/cursive (𝓐–𝔃). Since the heaviness lives in the characters themselves rather than in a style attribute, it is preserved when the text is copied and pasted into a field that otherwise cannot bold anything. That makes it a popular way to add a strong opening line, highlight a key phrase, or make a heading stand out in a feed. The trade-offs are important to respect. Not every device ships glyphs for every bold style, so a reader on an older phone might see placeholder boxes — bold sans-serif and bold serif have the widest support. More importantly, these are decorative substitutions, not semantic emphasis: assistive technologies often read mathematical bold characters one letter at a time, pronounce them oddly, or skip them, and search engines may fail to index them as normal words. The right approach is to use bold Unicode for emphasis and flair on a word or a line, while keeping your actual headings, links, and core message in ordinary text so everyone can read it and platforms can understand it. This generator previews each bold style side by side so you can copy whichever one looks best where you are posting.',
  },
  {
    slug: 'strikethrough-text-generator',
    title: 'Strikethrough Text Generator — Cross Text Out',
    h1: 'Strikethrough Text Generator',
    shortName: 'Strikethrough Text Generator',
    tagline: 'Cross out your text with strikethrough, slash, and underline styles.',
    metaDescription:
      'Cross out any text with this free strikethrough text generator. Copy and paste struck-through text into chats, bios, and social media posts.',
    keywords: ['strikethrough text', 'strikethrough text generator', 'cross out text', 'strikethrough copy and paste', 'crossed out text', 'underline text'],
    category: 'Generator',
    emoji: '🚫',
    image: '/tools/strikethrough-text-generator.jpg',
    imageAlt: 'A hand marking white paper with a red pen',
    primaryKeyword: 'strikethrough text',
    intro:
      'Cross out your text using Unicode combining marks so the line stays attached even in apps with no formatting. Type once and copy three styles: classic strikethrough (s̶t̶r̶i̶k̶e̶), a slashed look, and underline. Great for to-do lists, price drops, jokes, and edits on Instagram, WhatsApp, Discord, and Twitter/X.',
    howItWorks: [
      { title: 'Type your text', description: 'Enter the words you want to cross out.' },
      { title: 'Pick a style', description: 'Choose strikethrough, slashed, or underline — each previews live.' },
      { title: 'Copy & paste', description: 'Tap copy and paste the crossed-out text anywhere.' },
    ],
    faqs: [
      {
        q: 'How does strikethrough text work without formatting?',
        a: 'It adds a Unicode "combining" mark after each character — a line that renders through or under the letter. Because the line is part of the text, the strikethrough survives copy-paste into plain-text apps that have no formatting toolbar.',
      },
      {
        q: 'Where can I use strikethrough text?',
        a: 'Instagram, Twitter/X, Discord, and many other text fields. Note that some apps (like WhatsApp) already have their own ~strikethrough~ shortcut; the Unicode version works where that shortcut does not.',
      },
      {
        q: 'Why does the line look slightly off on some devices?',
        a: 'Combining marks are positioned by each font, so the exact placement of the line varies a little between devices and apps. The effect stays clearly readable as crossed-out text everywhere it renders.',
      },
      {
        q: 'Is strikethrough text accessible?',
        a: 'Not very. Screen readers may read the combining marks oddly or ignore them, so the "crossed out" meaning can be lost. Use it decoratively and do not rely on it to convey essential meaning.',
      },
      {
        q: 'Is the strikethrough generator free?',
        a: 'Yes — free, no signup, no limits. The combining marks are standard Unicode and free to use anywhere.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'bold-text-generator', 'glitch-text-generator'],
    ctaHook: 'Running a store with price drops to show off? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How strikethrough and overline text are built',
    about:
      'Strikethrough you can copy and paste is made the same way as glitch text — with Unicode combining marks — just used tastefully. A combining mark is a zero-width character that attaches to the character before it; instead of stacking many for a corrupted look, a strikethrough tool adds exactly one line-style mark after each letter. The long stroke overlay (U+0336) draws a line straight through the middle of the character for the classic crossed-out effect; the short solidus overlay (U+0337) gives a slashed look; and the combining low line (U+0332) sits beneath the character for a continuous underline. Because the mark is part of the text rather than a formatting attribute, the line travels with the characters wherever they go, which is why it works in plain-text fields — Instagram captions, Discord messages, Twitter/X, and forms — that offer no strikethrough button. People use it for to-do lists where an item is done, for showing an old price next to a new one, for edits and corrections, and for the comedic "I said too much" effect. A few things are worth knowing. Each font decides exactly where a combining mark lands, so the line can sit a hair high or low depending on the device, though it stays clearly legible as a strike. Spaces are usually left unmarked so the line breaks naturally between words. And, as with all decorative Unicode, accessibility suffers: a screen reader may not announce that text is struck through, so never depend on strikethrough alone to carry meaning that a reader must not miss. Some apps — WhatsApp and Telegram, for instance — already support their own native strikethrough via markup like tildes; this tool is most useful precisely where that native option does not exist. It previews all three line styles at once so you can copy whichever renders best in your destination.',
  },
  {
    slug: 'text-summarizer',
    title: 'Free Text Summarizer — Summarize Any Text',
    h1: 'AI Text Summarizer',
    shortName: 'Text Summarizer',
    tagline: 'Paste any text and get a clear AI summary with key points.',
    metaDescription:
      'Shrink long articles, emails, or notes with this free text summarizer. Paste any text and get a clear short summary in just a few seconds.',
    keywords: ['text summarizer', 'summarize text', 'ai summarizer', 'article summarizer', 'summary generator', 'free text summarizer'],
    category: 'Generator',
    emoji: '📝',
    image: '/tools/text-summarizer.jpg',
    imageAlt: 'A printed document resting on office stationery',
    primaryKeyword: 'text summarizer',
    intro:
      'Paste an article, essay, report, email thread, or any long block of text and get a clear, faithful summary in seconds — plus a short list of key points. Choose short, medium, or long depending on how much detail you want. The summary sticks strictly to what your text says, so you get the gist without invented facts. Free, no signup, and it works in your text\'s own language.',
    howItWorks: [
      { title: 'Paste your text', description: 'Drop in an article, essay, notes, or email — up to a few thousand words.' },
      { title: 'Choose a length', description: 'Pick short, medium, or long for the level of detail you want.' },
      { title: 'Get your summary', description: 'Read a concise summary plus key bullet points, then copy them in one tap.' },
    ],
    faqs: [
      {
        q: 'Is this text summarizer free?',
        a: 'Yes — it is free to use with no signup. To keep it available for everyone, there is a light rate limit on rapid repeated requests.',
      },
      {
        q: 'Does the summarizer make up facts?',
        a: 'It is instructed to summarize only what your text actually says and not to add outside information. As with any AI tool, skim the summary against the source for anything important before you rely on it.',
      },
      {
        q: 'What kind of text can I summarize?',
        a: 'Articles, blog posts, essays, research, meeting notes, transcripts, and long emails all work well. Paste up to roughly six thousand characters at a time for best results.',
      },
      {
        q: 'What languages does it support?',
        a: 'It summarizes in the same language as your input, so you can paste text in many languages and get a summary back in that language.',
      },
      {
        q: 'Are the key points different from the summary?',
        a: 'Yes — the summary is a short paragraph, while the key points break out the main ideas as quick, scannable bullets. Use whichever fits how you want to share or save the gist.',
      },
    ],
    relatedSlugs: ['ai-text-humanizer', 'da-pa-checker', 'fancy-text-generator'],
    ctaHook: 'Run a tutoring, research, or content business? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'What an AI text summarizer does well — and where to double-check it',
    about:
      'An AI text summarizer reads a long passage and produces a much shorter version that keeps the main ideas while dropping the detail. Modern summarizers are "abstractive": rather than just stitching together sentences pulled from the original, a language model rewrites the gist in fresh wording, which usually reads more naturally than older extractive tools. That makes them genuinely useful for getting through a long article quickly, turning a dense report into a few takeaways, catching up on a sprawling email thread, or condensing study notes and transcripts into something you can review at a glance. This tool asks the model to stay faithful to the source — to summarize only what the text says and to avoid introducing outside facts — and returns both a paragraph summary and a handful of key points so you can pick the format that suits you. It also works in the language of whatever you paste, summarizing back in that same language. A few practical notes. Summarization is lossy by design: nuance, caveats, and supporting evidence get compressed away, so for anything high-stakes — legal, medical, financial, or academic — treat the summary as a fast first pass and check the original before acting on it. Very long inputs are best broken into sections, since every model has a limit on how much it can consider at once; this tool accepts up to a few thousand characters per request. And while the model is instructed to be faithful, no AI summarizer is perfect, so a quick skim against the source is always wise when accuracy matters. Used with that light supervision, an AI summarizer is one of the highest-leverage everyday tools available — it turns the time-consuming job of reading-to-extract into a few seconds, and gives you a clean, copy-ready summary and bullet list you can paste into notes, messages, or documents.',
  },
  {
    slug: 'ai-text-humanizer',
    title: 'AI Text Humanizer — Rewrite AI Text Free',
    h1: 'AI Text Humanizer',
    shortName: 'AI Text Humanizer',
    tagline: 'Rewrite stiff or AI-sounding text so it reads naturally human.',
    metaDescription:
      'Make AI writing sound natural with this free AI text humanizer. Paste any AI text and get a rewritten version that reads like a real person.',
    keywords: ['ai text humanizer', 'humanize ai text', 'text humanizer', 'humanize ai text free', 'ai to human text', 'make ai text sound human'],
    category: 'Generator',
    emoji: '🧑‍💻',
    image: '/tools/ai-text-humanizer.jpg',
    imageAlt: 'A person writing in a notebook beside a laptop',
    primaryKeyword: 'ai text humanizer',
    intro:
      'Paste stiff, robotic, or AI-generated text and get a rewrite that reads like a real person wrote it — natural rhythm, plain wording, and none of the tell-tale AI filler. Choose a tone (casual, professional, friendly, or confident) to match where the text is going. It keeps your meaning and language intact while making the writing flow. Free, no signup, copy your result in one tap.',
    howItWorks: [
      { title: 'Paste your text', description: 'Drop in text that sounds stiff or machine-generated.' },
      { title: 'Pick a tone', description: 'Choose casual, professional, friendly, or confident.' },
      { title: 'Humanize & copy', description: 'Get a natural rewrite that keeps your meaning, then copy it.' },
    ],
    faqs: [
      {
        q: 'What does an AI text humanizer do?',
        a: 'It rewrites text so it reads more naturally — varying sentence length, swapping jargon for plain words, and removing robotic phrasing — while keeping your original meaning and language. Think of it as an editor that smooths stiff writing.',
      },
      {
        q: 'Will this guarantee my text passes AI detectors?',
        a: 'No. AI detectors are unreliable and change constantly, and we make no claim to beat them. This tool focuses on making writing clearer and more natural to read — not on gaming detection.',
      },
      {
        q: 'Does it keep my meaning and facts?',
        a: 'It is instructed to preserve your meaning and not add new claims. Because any rewrite can subtly shift emphasis, always read the result and confirm it still says what you intended before you use it.',
      },
      {
        q: 'Is the AI text humanizer free?',
        a: 'Yes — free with no signup. A light rate limit applies to rapid repeated requests so the tool stays available to everyone.',
      },
      {
        q: 'Should I use humanized AI text for schoolwork?',
        a: 'Follow your school or employer\'s rules on AI assistance and disclosure. Use this to improve your own writing\'s clarity, not to misrepresent authorship where that is against the rules.',
      },
    ],
    relatedSlugs: ['text-summarizer', 'da-pa-checker', 'fancy-text-generator'],
    ctaHook: 'Run a content, marketing, or tutoring business? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How AI text humanizers work, honestly',
    about:
      'An "AI text humanizer" is, under the hood, an AI editor. You give it a passage that sounds stiff, generic, or obviously machine-written, and a language model rewrites it to read more like natural human prose: it varies sentence length and rhythm, prefers plain words over jargon, trims filler and hedging, and strips out the tell-tale phrases that flag machine writing — the "in today\'s fast-paced world" openings, the relentless "moreover" and "it is important to note", the over-balanced both-sides sentences. The goal is clarity and flow, while keeping your meaning and your language intact. That is genuinely useful: first drafts, translated text, and quick AI outputs are often correct but lifeless, and a humanizing pass can make them readable and engaging without you rewriting from scratch. It is worth being clear-eyed about what these tools cannot do. Many are marketed as a way to "bypass AI detectors", but detection itself is unreliable — detectors produce false positives on human writing and false negatives on machine writing, and they shift constantly — so no rewrite can honestly promise to beat them, and this tool makes no such claim. What it can do is improve how the writing reads. Two cautions matter. First, any rewrite can subtly change emphasis or introduce a small inaccuracy, so always read the output and confirm it still says exactly what you meant before you publish or send it. Second, authorship rules apply: schools and many employers have policies on AI assistance and disclosure, and using a humanizer to misrepresent who or what wrote something can violate them. Used the right way — as an editing aid that makes your own ideas clearer and more natural, with a tone you choose to fit the context — an AI humanizer is a fast, practical writing assistant. This tool keeps your input under a sensible length per request, offers a few common tones, and returns a clean rewrite you can copy in a single tap.',
  },
  {
    slug: 'da-pa-checker',
    title: 'Free DA PA Checker — Check Domain Authority Instantly',
    h1: 'Pixie DA / PA Checker',
    shortName: 'DA / PA Checker',
    tagline: "Check any website's authority score in seconds — free, no signup.",
    metaDescription:
      'Free DA PA checker: enter any domain to see its authority score and global rank. Instant results, no signup. Powered by the free Open PageRank dataset.',
    keywords: [
      'da pa checker',
      'domain authority checker',
      'page authority checker',
      'check domain authority',
      'website authority score',
      'free da checker',
    ],
    category: 'Calculator',
    emoji: '📊',
    image: '/tools/da-pa-checker.jpg',
    imageAlt: 'SEO analytics dashboard showing website authority and ranking metrics',
    primaryKeyword: 'da pa checker',
    intro:
      "Type any domain and instantly see its authority score (0–100) and where it ranks among the world's websites. This checker is powered by Open PageRank — a free, link-based authority dataset that works just like the metric Moz calls Domain Authority. Use it to size up competitors, vet a backlink prospect, or track how your own site is trending, with no account and no credit card.",
    howItWorks: [
      {
        title: 'Enter a domain or URL',
        description: 'Paste a website like example.com or a full link — we strip it down to the domain automatically.',
      },
      {
        title: 'Get the authority score',
        description: 'We look up the domain in the Open PageRank dataset and show its authority (0–100) plus its global rank.',
      },
      {
        title: 'Compare and act',
        description: 'Check competitors and link targets side by side, then text Pixie to actually move the number with real SEO.',
      },
    ],
    faqs: [
      {
        q: 'What is DA / PA?',
        a: 'Domain Authority (DA) and Page Authority (PA) are scores from 0 to 100 that estimate how likely a website (DA) or a single page (PA) is to rank in search results. They are based mostly on the quantity and quality of links pointing at the site or page. Higher is stronger.',
      },
      {
        q: 'Where do these numbers come from?',
        a: 'This tool uses Open PageRank, a free authority dataset built from a large web-link graph. It produces a 0–100 authority score that behaves like Domain Authority. It is a genuine, independent metric — not a Moz API call — so it will not match Moz\'s DA exactly, but it tracks the same idea: stronger link profile, higher score.',
      },
      {
        q: 'Can it check Page Authority for a specific URL?',
        a: 'True page-level PA is a Moz-proprietary metric and is not available for free. This checker reports authority at the domain level. If you need page-by-page PA, backlink lists, and a full audit, Pixie can run that for you — tap the WhatsApp button after you check a domain.',
      },
      {
        q: 'Why is a site showing 0 or "not found"?',
        a: 'Open PageRank only has data for domains it has crawled in its link graph. Brand-new sites, very small sites, or unusual TLDs may not appear yet and will show as 0 or unranked. That usually means the site has few known backlinks — not that the tool is broken.',
      },
      {
        q: 'Is the DA PA checker free?',
        a: 'Yes — free with no signup. A light rate limit applies to rapid repeated lookups so the tool stays fast for everyone.',
      },
      {
        q: 'How do I actually raise my authority?',
        a: 'Authority grows when other reputable sites link to yours, which comes from genuinely useful content, a fast technical site, and real outreach. There is no instant trick. Pixie builds SEO-ready sites and runs ongoing audits to help you earn it — message us to start.',
      },
    ],
    relatedSlugs: ['text-summarizer', 'ai-text-humanizer', 'trust-badge-generator'],
    ctaHook: 'Want to actually raise your authority? Pixie builds SEO-ready websites and runs full audits — text us on WhatsApp.',
    aboutHeading: 'What Domain Authority really measures',
    about:
      'Domain Authority (DA) and Page Authority (PA) started as Moz metrics: a single 0–100 score that predicts how well a site or page is likely to rank in search, derived largely from its backlink profile — how many other sites link to it, and how trustworthy those sites are themselves. The scores are logarithmic, so climbing from 20 to 30 is far easier than climbing from 70 to 80, and they are relative, not absolute: a 40 is strong in a quiet niche and weak in a competitive one. Crucially, DA and PA are third-party estimates, not numbers Google publishes or uses — Google has repeatedly said it has no single "authority score." They are still useful precisely because they are comparable: line up five competitors or five link prospects and the scores tell you, at a glance, who carries weight. This tool is powered by Open PageRank, a free dataset that models the same web-link graph and outputs a comparable 0–100 authority score, so you get the practical signal without a paid subscription. Treat the number as a compass, not a verdict. A high score does not guarantee a page will rank for your keyword, and a low score does not mean you cannot win — relevance, content quality, search intent, page speed, and user experience all matter alongside links. The honest way to use an authority checker is for triage: spotting which competitors dominate a space, deciding whether a backlink is worth pursuing, and tracking whether your own trend line is moving up over months. Moving that line is the slow part — it comes from publishing things worth linking to, fixing the technical foundations of your site, and earning mentions from real, relevant sources. That is exactly the work Pixie is built to support: a fast, SEO-ready site to stand on, and ongoing audits to keep the trend pointing up.',
  },
  {
    slug: 'zalgo-text-generator',
    title: 'Zalgo Text Generator — Make Glitchy Cursed Text',
    h1: 'Pixie Zalgo Text Generator',
    shortName: 'Zalgo Text Generator',
    tagline: 'Turn normal text into creepy, glitchy zalgo text.',
    metaDescription:
      'Create creepy glitch text with this free zalgo text generator. Type anything, set the intensity, and copy zalgo text anywhere. No signup.',
    keywords: [
      'zalgo text generator',
      'zalgo text',
      'glitch text',
      'cursed text',
      'creepy text generator',
    ],
    category: 'Generator',
    emoji: '💀',
    image: '/tools/zalgo-text-generator.jpg',
    imageAlt: 'Glitchy distorted typography on a dark screen',
    primaryKeyword: 'zalgo text generator',
    intro:
      'Type any word and watch it melt into glitchy, corrupted zalgo text — the classic "he comes" effect. Drag the intensity slider, choose whether marks stack above, through, or below your letters, then copy it straight into Discord, Instagram, TikTok, or anywhere that accepts Unicode.',
    howItWorks: [
      {
        title: 'Type your text',
        description: 'Enter any word or sentence. The corruption is applied live as you type.',
      },
      {
        title: 'Set the intensity',
        description: 'Drag the slider for light static or full meltdown, and toggle marks above, middle, or below the line.',
      },
      {
        title: 'Copy anywhere',
        description: 'Hit copy and paste your zalgo text into Discord, IG bios, usernames, or captions.',
      },
    ],
    faqs: [
      {
        q: 'What is zalgo text?',
        a: 'Zalgo text is normal text decorated with dozens of stacked Unicode "combining" marks so it appears to glitch, drip, or corrupt. The look is associated with the internet horror meme "Zalgo" and the phrase "he comes". Because it uses real Unicode characters, it survives copy-paste across most apps.',
      },
      {
        q: 'Does zalgo text work on Discord and Instagram?',
        a: 'Yes. The output is real Unicode, so it pastes into Discord messages and nicknames, Instagram bios and captions, TikTok, and most chat apps. Some platforms cap how many combining marks they render, so extreme intensity may look slightly tamer once pasted.',
      },
      {
        q: 'Is zalgo text the same as glitch or cursed text?',
        a: 'They overlap. "Glitch" and "cursed" text usually mean the same combining-mark technique with a different vibe. Our Zalgo Text Generator gives you the strongest control over intensity and direction; the Glitch and Cursed generators are tuned for their own looks.',
      },
      {
        q: 'Why does my zalgo text look broken in some places?',
        a: 'Each app decides how many stacked marks to draw. Single-line inputs (usernames, search bars) often clip the marks, while multi-line text fields show the full effect. That clipping is the app, not your copied text — the characters are still there.',
      },
      {
        q: 'Is it free?',
        a: 'Completely. Everything runs in your browser, your text never touches a server, and there is no signup, watermark, or limit.',
      },
    ],
    relatedSlugs: ['glitch-text-generator', 'cursed-text-generator', 'fancy-text-generator'],
    ctaHook: 'Building a gaming, music, or horror brand? Pixie ships your full website in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'How zalgo text actually works',
    about:
      'Zalgo text exploits a feature of Unicode called combining diacritical marks — the accents and squiggles (U+0300 to U+036F) that normally sit on a single letter, like the tilde on ñ or the umlaut on ü. Unicode lets you stack many of these marks onto one base character, and renderers will try to draw all of them, piling glyphs above and below the line until the text looks like it is bleeding or corrupting. A zalgo generator simply takes each character you type and appends a random number of "up", "middle", and "down" combining marks. Because these are genuine characters rather than an image or font, the effect copies into almost any text field. The meme itself traces back to a 2004 webcomic edit and the eerie tagline "he comes / to end the world", which is why zalgo became shorthand for creepy, glitchy, corrupted text across forums, Discord servers, and horror content. The one practical caveat is accessibility: screen readers attempt to pronounce every combining mark, so heavy zalgo text is unreadable to assistive tech — use it for vibes and decoration, never for the core message you need everyone to understand.',
  },
  {
    slug: 'cursed-text-generator',
    title: 'Cursed Text Generator — Creepy Glitch Text',
    h1: 'Pixie Cursed Text Generator',
    shortName: 'Cursed Text Generator',
    tagline: 'Generate creepy cursed text with one click presets.',
    metaDescription:
      'Make eerie cursed text with this free cursed text generator. Pick a curse level and copy creepy glitch text anywhere. No signup needed.',
    keywords: [
      'cursed text generator',
      'cursed text',
      'creepy text',
      'glitch text generator',
      'zalgo text',
    ],
    category: 'Generator',
    emoji: '😈',
    image: '/tools/cursed-text-generator.jpg',
    imageAlt: 'Eerie distorted lettering glowing in the dark',
    primaryKeyword: 'cursed text generator',
    intro:
      'Turn plain words into eerie, cursed text with one tap. Pick a curse level — from a faint flicker to fully possessed — and copy the result into Discord, Instagram, TikTok, or your gamer tag. Presets keep it readable when you want creepy-but-legible, or unleash full corruption.',
    howItWorks: [
      {
        title: 'Type your text',
        description: 'Enter the word or phrase you want to curse. The effect updates instantly.',
      },
      {
        title: 'Pick a curse level',
        description: 'Mild, Cursed, Haunted, or Possessed — each preset stacks more eerie overlay and glitch marks.',
      },
      {
        title: 'Copy and paste',
        description: 'Copy the cursed text into chats, bios, usernames, or video captions.',
      },
    ],
    faqs: [
      {
        q: 'What is cursed text?',
        a: 'Cursed text is normal text overlaid with stacked Unicode combining marks — strike-throughs, overlays, and diacritics — so it looks corrupted, haunted, or "cursed". It is the same underlying technique as zalgo and glitch text, presented with eerie one-tap presets here.',
      },
      {
        q: 'Where can I use cursed text?',
        a: 'Anywhere that accepts Unicode: Discord servers and nicknames, Instagram and TikTok bios and captions, Twitter/X, Tumblr, and most chat apps. Because it is real characters, it survives copy-paste rather than relying on fonts.',
      },
      {
        q: 'What is the difference between the curse levels?',
        a: '"Mild" adds a light flicker that stays readable, "Cursed" gives a solid creepy look, "Haunted" stacks more marks for heavy distortion, and "Possessed" goes full meltdown. Use Re-roll to get a fresh random variation at any level.',
      },
      {
        q: 'Will cursed text break or show as boxes?',
        a: 'On modern devices the marks render correctly. Some apps limit how many stacked marks they draw — especially in single-line fields — so very high levels may look milder once pasted. The characters themselves are still intact.',
      },
      {
        q: 'Is the cursed text generator free?',
        a: 'Yes — no signup, no watermark, no limits. It runs entirely in your browser, so nothing you type is uploaded anywhere.',
      },
    ],
    relatedSlugs: ['zalgo-text-generator', 'glitch-text-generator', 'fancy-text-generator'],
    ctaHook: 'Run a gaming, streaming, or horror-themed brand? Pixie builds your full site in 60 seconds — text us on WhatsApp.',
    aboutHeading: 'Cursed, glitch, and zalgo text explained',
    about:
      'Cursed text, glitch text, and zalgo text are three names for the same Unicode trick: taking ordinary letters and layering "combining" marks on top of them. Combining marks are characters that have no width of their own — they attach to the letter before them, which is how accented letters work in many languages. Unicode does not stop you from attaching dozens of them to a single character, and most text renderers will dutifully try to draw every one, producing glyphs that drip, smear, and overflow their line. The "cursed" framing leans into overlay and strike-through marks for an eerie, haunted feel rather than the chaotic full-corruption of classic zalgo, which is why this tool ships curated curse-level presets instead of a raw slider. All three styles are popular in gaming usernames, horror edits, Discord communities, and aesthetic social posts because they read as unsettling and otherworldly while still being plain, copy-pasteable text. The trade-off is the same across all of them: screen readers and search engines cannot make sense of heavily decorated text, so keep cursed styling to decorative flourishes — a username, a caption accent, a title — rather than anything a reader genuinely needs to parse.',
  },
  {
    slug: 'backwards-text-generator',
    title: 'Backwards Text Generator — Reverse Any Text',
    h1: 'Pixie Backwards Text Generator',
    shortName: 'Backwards Text Generator',
    tagline: 'Reverse text by letters, words, or lines instantly.',
    metaDescription:
      'Reverse any text with this free backwards text generator. Flip letters, word order, or lines and copy the result. No signup needed.',
    keywords: [
      'backwards text generator',
      'reverse text',
      'reverse text generator',
      'flip text',
      'mirror text',
    ],
    category: 'Generator',
    emoji: '🔁',
    image: '/tools/backwards-text-generator.jpg',
    imageAlt: 'Letters reflected in a mirror on a clean desk',
    primaryKeyword: 'backwards text generator',
    intro:
      'Paste any text and instantly reverse it — flip the letters (hello → olleh), reverse the word order, or flip the line order. Useful for puzzles, secret messages, social captions, and checking palindromes. Everything happens live in your browser.',
    howItWorks: [
      {
        title: 'Type or paste text',
        description: 'Enter anything — a word, sentence, or several lines.',
      },
      {
        title: 'Choose a reverse mode',
        description: 'Reverse letters, reverse the order of words, or reverse the order of whole lines.',
      },
      {
        title: 'Copy the result',
        description: 'Grab the reversed text with one tap and paste it anywhere.',
      },
    ],
    faqs: [
      {
        q: 'What does the backwards text generator do?',
        a: 'It reverses your text. "Reverse letters" turns "hello" into "olleh", "reverse word order" turns "hello world" into "world hello", and "reverse line order" flips a list top-to-bottom. Pick whichever matches what you need.',
      },
      {
        q: 'Is backwards text the same as upside-down text?',
        a: 'No. Backwards text reverses the order of characters but keeps them upright. Upside-down text flips each letter so the whole thing reads as if rotated 180°. If you want the flipped look, use our Upside Down Text Generator instead.',
      },
      {
        q: 'Does it handle emoji and accented letters?',
        a: 'Yes. The reversal is done character-aware, so multi-byte characters like emoji and accented letters stay intact instead of splitting into broken symbols.',
      },
      {
        q: 'Can I use this to check palindromes?',
        a: 'Absolutely — reverse the letters and compare to the original. If they match (ignoring spaces and case), it is a palindrome. It is also handy for word puzzles, riddles, and simple obfuscation.',
      },
      {
        q: 'Is it free and private?',
        a: 'Yes. There is no signup, and the reversal runs entirely in your browser, so your text is never sent anywhere.',
      },
    ],
    relatedSlugs: ['upside-down-text-generator', 'fancy-text-generator', 'glitch-text-generator'],
    ctaHook: 'Run a puzzle, education, or content brand? Pixie builds full websites from one WhatsApp message.',
    aboutHeading: 'Reversing text: characters, words, and lines',
    about:
      'Reversing text sounds trivial, but there are three genuinely different things people mean by "backwards", and mixing them up is the usual reason an online reverser gives a surprising result. The first is character reversal: walk the string from the last character to the first, so "Hello" becomes "olleH". The subtlety is that modern text is made of Unicode code points, and naive reversal that works byte-by-byte will shatter emoji and combined characters into garbage — which is why this tool reverses by character, not by byte. The second meaning is word-order reversal, where the letters inside each word stay put but the sequence of words flips, turning "the quick brown fox" into "fox brown quick the"; this is what you usually want for readable secret messages or rearranging a sentence. The third is line-order reversal, which leaves each line untouched but flips the list from bottom to top — useful for reversing logs, rankings, or step lists. None of these is the same as upside-down text, which substitutes each letter for a rotated look-alike glyph so the result reads as if you physically turned the screen over. Reversed text shows up in word games, palindrome checking, light obfuscation, retro and mirror-writing aesthetics, and the classic trick of writing something that only makes sense when held up to a mirror.',
  },
  {
    slug: 'cool-text-generator',
    title: 'Cool Text Generator — Make Cool Text Logos Free',
    h1: 'Pixie Cool Text Generator',
    shortName: 'Cool Text Generator',
    tagline: 'Design cool text logos with neon, gradient, and 3D styles.',
    metaDescription:
      'Create cool text logos with this free cool text generator. Pick neon, gradient, chrome, or 3D styles and download a transparent PNG. No signup.',
    keywords: [
      'cool text generator',
      'cool text',
      'text logo maker',
      'cool fonts generator',
      'graphic text generator',
    ],
    category: 'Generator',
    emoji: '🎨',
    image: '/tools/cool-text-generator.jpg',
    imageAlt: 'Colorful stylized 3D text logo on a gradient background',
    primaryKeyword: 'cool text generator',
    intro:
      'Type a word and turn it into a cool, graphic text logo — neon glow, gradient, fire, chrome, 3D, or outline. Pick your color, preview live, and download a transparent PNG ready for a YouTube thumbnail, banner, profile picture, or logo mockup.',
    howItWorks: [
      {
        title: 'Type your text',
        description: 'Enter a word or short phrase — names, brands, gamer tags, and titles work best.',
      },
      {
        title: 'Pick a style and color',
        description: 'Choose neon, gradient, fire, chrome, 3D, or outline, then set your brand color.',
      },
      {
        title: 'Download the PNG',
        description: 'Export a transparent, retina-crisp PNG and drop it into any design.',
      },
    ],
    faqs: [
      {
        q: 'What does the cool text generator make?',
        a: 'It renders your text as a styled graphic — a small text logo — with effects like neon glow, gradients, chrome, fire, 3D depth, and outlines. The result downloads as a transparent PNG image, not as font characters.',
      },
      {
        q: 'Is the downloaded image free to use?',
        a: 'Yes. The PNG you generate is free for personal and commercial use — thumbnails, banners, merch, logos — with no watermark and no attribution required.',
      },
      {
        q: 'Why is this an image instead of copy-paste text?',
        a: 'Effects like glow, gradient, and 3D depth cannot be expressed with plain Unicode characters, so they have to be rendered as an image. If you want copy-paste styled letters instead, try the Fancy Text Generator.',
      },
      {
        q: 'Does the PNG have a transparent background?',
        a: 'Yes — the export is transparent, so you can layer it over any photo, color, or thumbnail without a white box around it.',
      },
      {
        q: 'Does it work on mobile?',
        a: 'Yes. It renders in any modern mobile browser, and the download saves straight to your device. Everything runs locally — your text never leaves your phone.',
      },
    ],
    relatedSlugs: ['fancy-text-generator', 'glitch-text-generator', 'trust-badge-generator'],
    ctaHook: 'Need a full logo and brand identity, not just text art? Pixie delivers logos, websites, and ads from one WhatsApp message.',
    aboutHeading: 'From cool text to a real brand identity',
    about:
      'The "cool text" category goes back to the early web, when sites like CoolText let anyone render a word as a glossy, beveled, flaming logo without opening Photoshop. The appeal has never really faded: creators still need quick, good-looking text graphics for YouTube thumbnails, Twitch overlays, Discord banners, profile pictures, and event flyers, and most of them do not want to learn vector software to get one. This generator draws your text onto an HTML canvas and applies the effect in real time — neon uses layered strokes and shadow blur to fake a glowing tube, the gradient and fire styles paint a vertical color ramp into the letterforms, chrome stacks light-to-dark-to-light bands for a metallic sheen, and the 3D style offsets multiple shadow copies to extrude depth. Because it is canvas-based, the export is a true transparent PNG you can drop onto any background. The honest limitation is that a single styled word is a graphic, not a brand: it cannot adapt to every size, it is not a vector you can recolor infinitely, and it does not come with the typography system, palette, and logo lockups a real identity needs. That is the line where a free tool stops and a designed brand begins — and exactly where Pixie picks up, turning a single WhatsApp message into a full logo, website, and ad set.',
  },
  {
    slug: 'compare-text',
    title: 'Compare Text — Free Text Difference Checker',
    h1: 'Pixie Compare Text Tool',
    shortName: 'Compare Text',
    tagline: 'Spot every difference between two blocks of text.',
    metaDescription:
      'Compare two texts and highlight every difference with this free text compare tool. See added and removed lines instantly. No signup, fully private.',
    keywords: [
      'compare text',
      'text compare',
      'text difference checker',
      'diff checker',
      'compare two texts',
    ],
    category: 'Converter',
    emoji: '🔍',
    image: '/tools/compare-text.jpg',
    imageAlt: 'Two documents side by side with differences highlighted',
    primaryKeyword: 'compare text',
    intro:
      'Paste two versions of any text and instantly see what changed — added lines in green, removed lines in red. Ideal for proofreading edits, comparing contract drafts, checking code or config changes, and catching plagiarism or duplicate copy. Runs entirely in your browser.',
    howItWorks: [
      {
        title: 'Paste both versions',
        description: 'Drop the original text on the left and the changed text on the right.',
      },
      {
        title: 'See the differences',
        description: 'A line-by-line diff highlights additions in green and removals in red, with a running count.',
      },
      {
        title: 'Tune the match',
        description: 'Optionally ignore case and leading/trailing spaces so only real changes show up.',
      },
    ],
    faqs: [
      {
        q: 'How does the text compare tool work?',
        a: 'It runs a line-by-line difference algorithm (longest common subsequence) between your two texts. Lines that exist only in the changed version are shown in green ("added"), lines only in the original are shown in red ("removed"), and unchanged lines stay neutral.',
      },
      {
        q: 'Is my text uploaded anywhere?',
        a: 'No. The entire comparison runs locally in your browser. Nothing is sent to a server, which makes it safe for confidential documents, contracts, and code.',
      },
      {
        q: 'What can I use it for?',
        a: 'Proofreading two drafts, reviewing contract or policy changes, comparing code or configuration files, checking whether two pieces of content are duplicates, and confirming that a copy-edit only changed what you intended.',
      },
      {
        q: 'What do "ignore case" and "ignore spaces" do?',
        a: '"Ignore case" treats "Hello" and "hello" as identical. "Ignore leading/trailing spaces" ignores indentation and trailing whitespace differences. Turn them on to focus on meaningful changes and hide cosmetic ones.',
      },
      {
        q: 'Is there a length limit?',
        a: 'There is no hard limit, but comparison is line-based and works best on documents up to a few thousand lines. Very large files may slow down because everything runs in your browser.',
      },
    ],
    relatedSlugs: ['text-summarizer', 'pdf-to-text', 'ai-text-humanizer'],
    ctaHook: 'Run a legal, editorial, or dev team? Pixie builds full websites and internal tools from one WhatsApp message.',
    aboutHeading: 'How a text diff actually finds changes',
    about:
      'Comparing two pieces of text is a surprisingly deep problem, and the elegant answer is an algorithm called the longest common subsequence, or LCS. Rather than comparing the texts character by character — which would flag everything after a single inserted word as "changed" — LCS finds the longest sequence of lines that appears in both versions in the same order, then treats everything not in that sequence as either an addition or a removal. That is why a good diff can insert one new paragraph in the middle of a document and still recognize that everything around it is unchanged, instead of marking half the file red. It is the same core technique that powers "track changes" in word processors and the side-by-side views in version-control tools like Git. This tool applies LCS at the line level and colors the result: green for lines that exist only in your changed text, red for lines that existed only in the original, and neutral for the common backbone. The optional case- and whitespace-insensitive modes let you decide what counts as a "real" difference — useful when comparing code where indentation is noise, or prose where capitalization at the start of a re-flowed line is not a meaningful edit. Because the whole comparison happens in your browser, you can safely diff sensitive material — contracts, medical notes, unreleased copy — without it ever leaving your device.',
  },
  {
    slug: 'pdf-to-text',
    title: 'PDF to Text — Free PDF Text Extractor',
    h1: 'Pixie PDF to Text Converter',
    shortName: 'PDF to Text',
    tagline: 'Extract text from any PDF right in your browser.',
    metaDescription:
      'Extract text from any PDF with this free PDF to text converter. No upload, no signup — your file stays in your browser. Copy or edit the result.',
    keywords: [
      'pdf to text',
      'pdf to text converter',
      'extract text from pdf',
      'pdf text extractor',
      'convert pdf to text',
    ],
    category: 'Converter',
    emoji: '📄',
    image: '/tools/pdf-to-text.jpg',
    imageAlt: 'A PDF document converting into editable plain text',
    primaryKeyword: 'pdf to text',
    intro:
      'Drop in a PDF and pull out all its text in seconds — ready to copy, edit, or paste elsewhere. The whole conversion happens inside your browser, so even confidential PDFs never leave your device. Works page by page across multi-page documents.',
    howItWorks: [
      {
        title: 'Choose a PDF',
        description: 'Drag and drop or browse for any PDF file on your device.',
      },
      {
        title: 'We extract the text',
        description: 'The PDF is parsed page by page in your browser, preserving line breaks where possible.',
      },
      {
        title: 'Copy or edit',
        description: 'The extracted text lands in an editable box — tweak it, then copy it out.',
      },
    ],
    faqs: [
      {
        q: 'Is my PDF uploaded to a server?',
        a: 'No. The PDF is read and parsed entirely in your browser using a JavaScript PDF engine. Your file never leaves your device, which makes the tool safe for contracts, statements, and other private documents.',
      },
      {
        q: 'Does it work on scanned PDFs?',
        a: 'Only if the PDF has a real text layer. A scanned document is essentially an image of text, so there is nothing to extract. For those, take a screenshot or export a page as an image and run it through our Image to Text (OCR) tool instead.',
      },
      {
        q: 'Will it keep my formatting?',
        a: 'It preserves the text content and reasonable line breaks, but not visual layout like columns, tables, fonts, or images. PDFs store text positionally, so complex multi-column layouts may extract in an unexpected reading order.',
      },
      {
        q: 'Is there a file size or page limit?',
        a: 'There is no hard limit, but because everything runs in your browser, very large PDFs (hundreds of pages) will take longer and use more memory. Most documents extract in a second or two.',
      },
      {
        q: 'Is it really free?',
        a: 'Yes — no signup, no watermark, no email required. Convert as many PDFs as you like.',
      },
    ],
    relatedSlugs: ['image-to-text', 'text-summarizer', 'compare-text'],
    ctaHook: 'Run a business that drowns in documents? Pixie builds websites and tools that handle them — text us on WhatsApp.',
    aboutHeading: 'Why extracting PDF text is trickier than it looks',
    about:
      'A PDF is not a document in the way a Word file is — it is a set of drawing instructions. When software creates a PDF, it records exactly where to paint each glyph on the page, which means the "text" is really a cloud of positioned characters rather than flowing sentences. Extracting readable text means reading those positions back and reconstructing lines and word boundaries from the coordinates, which is why this tool groups characters by their vertical position to rebuild line breaks. It works beautifully for PDFs that were exported from a word processor, web page, or design tool, because the underlying text layer is intact. It cannot help with scanned PDFs, though: a scan is just a photograph of a page wrapped in a PDF container, with no text layer at all, so there is literally nothing to read out — that job belongs to optical character recognition, which is what our Image to Text tool does. The big advantage of doing extraction in the browser, as this tool does with the open-source pdf.js engine, is privacy: your PDF is parsed locally and never uploaded, so you can safely pull text out of bank statements, signed contracts, medical forms, or unreleased manuscripts without trusting a third-party server. Once the text is out, it is plain and editable — ready to summarize, translate, compare against another version, or paste into whatever you are writing.',
  },
  {
    slug: 'image-to-text',
    title: 'Image to Text — Free OCR to Extract Text',
    h1: 'Pixie Image to Text (OCR)',
    shortName: 'Image to Text',
    tagline: 'Extract text from any image with free in-browser OCR.',
    metaDescription:
      'Extract text from images with this free image to text OCR tool. Drop a photo or screenshot and copy the text. No upload, no signup, fully private.',
    keywords: [
      'extract text from image',
      'image to text',
      'picture to text',
      'picture to text converter',
      'ocr online',
    ],
    category: 'Converter',
    emoji: '🖼️',
    image: '/tools/image-to-text.jpg',
    imageAlt: 'A photo of printed text being converted to editable characters',
    primaryKeyword: 'extract text from image',
    intro:
      'Drop in a photo, screenshot, or scan and pull the words out as editable text. Powered by in-browser OCR (optical character recognition) in six languages, it reads printed text from images without uploading them anywhere — your picture stays on your device.',
    howItWorks: [
      {
        title: 'Choose an image',
        description: 'Drag and drop or browse for a JPG, PNG, WebP, or screenshot containing text.',
      },
      {
        title: 'Pick the language',
        description: 'Select the language of the text so OCR recognizes the right characters and accents.',
      },
      {
        title: 'Copy the text',
        description: 'OCR runs in your browser and drops the recognized text into an editable, copyable box.',
      },
    ],
    faqs: [
      {
        q: 'What is OCR?',
        a: 'OCR stands for optical character recognition — technology that looks at an image of text and works out which letters and words it contains, turning a picture into editable, searchable text. This tool uses the open-source Tesseract engine running directly in your browser.',
      },
      {
        q: 'Is my image uploaded anywhere?',
        a: 'No. The OCR model runs locally in your browser, so your image never leaves your device. That makes it safe for screenshots of private messages, documents, or anything confidential.',
      },
      {
        q: 'What kinds of images work best?',
        a: 'Clear, high-contrast printed text — screenshots, scanned documents, signs, slides, book pages. Accuracy drops on handwriting, very small or blurry text, low light, heavy stylization, or text at an angle. A sharper photo almost always helps.',
      },
      {
        q: 'Which languages are supported?',
        a: 'English, Spanish, French, German, Italian, and Portuguese. Pick the matching language before running OCR — it tells the engine which character set and accents to expect, which improves accuracy.',
      },
      {
        q: 'Why is the first run a bit slow?',
        a: 'The first time you use a language, the OCR engine downloads its recognition model (a few megabytes). After that it is cached, so subsequent images process faster.',
      },
    ],
    relatedSlugs: ['pdf-to-text', 'text-summarizer', 'audio-to-text'],
    ctaHook: 'Digitizing receipts, forms, or documents for your business? Pixie builds the website and tools around it — text us on WhatsApp.',
    aboutHeading: 'How optical character recognition reads an image',
    about:
      'Optical character recognition is one of the oldest practical applications of machine vision, and it is genuinely clever about something humans do effortlessly: looking at shapes and recognizing them as letters. A modern OCR engine like Tesseract first cleans up the image — adjusting contrast, straightening lines, and separating text from background — then segments the page into blocks, lines, words, and finally individual character shapes. Each shape is compared against learned models of what letters look like, using neural networks trained on enormous amounts of text in many fonts and languages, and the engine combines that with a language model so it can prefer real words over near-miss gibberish. Telling it which language you are scanning matters because each language has its own alphabet, accents, and common word patterns; an English model does not expect ñ or ü, and a French model knows that "été" is more likely than a random accented string. The remarkable part of this particular tool is that all of that runs inside your web browser via WebAssembly — there is no server doing the recognition, so your image stays private and you can even use it offline once the model is cached. OCR has limits worth respecting: it reads printed type far better than handwriting, it struggles with low resolution and motion blur, and it can scramble the reading order of complex multi-column layouts. But for the everyday job of lifting text out of a screenshot, a photographed sign, a slide, or a scanned page, it turns a picture you cannot edit into words you can copy, search, translate, and reuse.',
  },
  {
    slug: 'text-to-speech',
    title: 'Text to Speech — Free Text to Voice Reader',
    h1: 'Pixie Text to Speech',
    shortName: 'Text to Speech',
    tagline: 'Turn any text into natural spoken audio, free.',
    metaDescription:
      'Convert text to speech free with this online text to voice reader. Pick a voice, adjust speed and pitch, and listen instantly. No signup needed.',
    keywords: [
      'text to speech',
      'text to voice',
      'read text aloud',
      'tts online',
      'text to speech free',
    ],
    category: 'Converter',
    emoji: '🔊',
    image: '/tools/text-to-speech.jpg',
    imageAlt: 'Sound waves emanating from a block of text',
    primaryKeyword: 'text to voice',
    intro:
      'Type or paste any text and have it read aloud in a natural voice. Choose from the voices installed on your device, adjust the speed and pitch, and play, pause, or stop. Great for proofreading by ear, accessibility, learning pronunciation, or listening to articles hands-free.',
    howItWorks: [
      {
        title: 'Enter your text',
        description: 'Type or paste anything you want read aloud — a paragraph, an article, a script.',
      },
      {
        title: 'Pick a voice and speed',
        description: 'Choose from your device voices and fine-tune the reading speed and pitch.',
      },
      {
        title: 'Press play',
        description: 'Listen instantly, and pause or stop whenever you like. Nothing is uploaded.',
      },
    ],
    faqs: [
      {
        q: 'How does the text to speech tool work?',
        a: 'It uses your browser\'s built-in speech synthesis engine to read text aloud using the voices already installed on your device. Because it is local, playback is instant, private, and free.',
      },
      {
        q: 'Why do the available voices differ on my phone vs laptop?',
        a: 'The voice list comes from your operating system, not from us. iPhones, Android phones, Windows, and Macs each ship different built-in voices, so the same page will offer different options depending on the device and browser you open it in.',
      },
      {
        q: 'Can I download the audio as an MP3?',
        a: 'Browser speech synthesis plays audio live but does not expose a downloadable file, so this tool is for listening rather than exporting. If you need downloadable, studio-quality AI voiceovers, message us on WhatsApp — that is something Pixie can build for you.',
      },
      {
        q: 'What is text to speech good for?',
        a: 'Proofreading by ear (you catch awkward phrasing faster when you hear it), accessibility for low-vision or dyslexic readers, learning pronunciation, listening to long articles hands-free, and previewing scripts or voiceover copy.',
      },
      {
        q: 'Is it free and private?',
        a: 'Yes. There is no signup, and because synthesis happens on your device, the text you enter is never sent to a server.',
      },
    ],
    relatedSlugs: ['audio-to-text', 'text-summarizer', 'image-to-text'],
    ctaHook: 'Need real AI voiceovers or an accessible website? Pixie builds it from one WhatsApp message.',
    aboutHeading: 'Text to speech, on-device and in the cloud',
    about:
      'Text to speech has quietly become one of the most useful everyday accessibility technologies, and most people do not realize their phone and laptop already ship a capable engine for it. This tool taps the Web Speech API, a browser standard that hands your text to the operating system\'s built-in synthesizer and streams the audio back instantly. That design has real advantages: it is free, it works offline, and because nothing is uploaded, the text you paste stays completely private. The catch is that the voices come from the device, so quality and selection vary — Apple, Google, and Microsoft each bundle their own set, and a high-end phone may sound noticeably more natural than an old laptop. There is also no way to capture the spoken audio as a file, because the browser plays it rather than rendering it to a download. That is the dividing line between an on-device reader like this and a cloud text-to-speech service: modern neural voices from providers like ElevenLabs or OpenAI sound strikingly human, can be exported as MP3 or WAV, and let you clone or customize a voice, but they cost money per character and send your text to a server. For the common jobs — proofreading by ear, reading an article hands-free, checking pronunciation, or making content accessible — the on-device reader is more than enough and respects your privacy. When you need broadcast-quality narration you can ship, that is where a built solution comes in, and exactly the kind of thing Pixie can wire into a website or product for you.',
  },
  {
    slug: 'audio-to-text',
    title: 'Audio to Text — Free Audio Transcription',
    h1: 'Pixie Audio to Text',
    shortName: 'Audio to Text',
    tagline: 'Transcribe audio recordings into text in minutes.',
    metaDescription:
      'Transcribe audio to text with this free audio to text converter. Upload a recording in any language and get an accurate transcript you can copy.',
    keywords: [
      'audio to text',
      'audio to text converter',
      'transcribe audio',
      'audio transcription',
      'speech to text',
      'voice recorder to text',
    ],
    category: 'Converter',
    emoji: '🎙️',
    image: '/tools/audio-to-text.jpg',
    imageAlt: 'A microphone beside a transcript of spoken words',
    primaryKeyword: 'audio to text',
    intro:
      'Upload a voice memo, interview, lecture, podcast, or meeting recording — or record live from your microphone — and get an accurate text transcript back. Powered by OpenAI\'s Whisper model, it handles dozens of languages and auto-detects the spoken language if you are not sure. Copy the transcript and you are done.',
    howItWorks: [
      {
        title: 'Upload or record',
        description: 'Drag in an mp3, m4a, wav, ogg, flac, or webm file (up to 25 MB), or record live from your mic.',
      },
      {
        title: 'Choose the language',
        description: 'Leave it on auto-detect, or pick the spoken language for best accuracy.',
      },
      {
        title: 'Get your transcript',
        description: 'The recording is transcribed and the text appears ready to copy.',
      },
    ],
    faqs: [
      {
        q: 'How accurate is the transcription?',
        a: 'It uses OpenAI\'s Whisper model, which is among the most accurate general-purpose speech recognizers available and handles accents and background noise well. Accuracy is highest on clear recordings; heavy noise, crosstalk, or very faint audio will reduce it.',
      },
      {
        q: 'What languages are supported?',
        a: 'Whisper supports dozens of languages and can auto-detect the one being spoken. You can also pick a specific language — English, Spanish, French, German, Italian, Portuguese, Hindi, Arabic, and more — to nudge accuracy.',
      },
      {
        q: 'What file formats and sizes can I use?',
        a: 'Common audio formats — mp3, m4a, wav, ogg, flac, and webm — up to 25 MB per file. For long recordings, exporting at a lower bitrate keeps you under the limit without hurting transcription much.',
      },
      {
        q: 'Can I record audio directly in the browser?',
        a: 'Yes. Switch to the Record tab and the tool captures audio straight from your microphone (your browser will ask for permission). Recordings can run up to 10 minutes; when you stop, you can play it back, then hit Transcribe. The recording happens locally and is only sent for transcription when you choose to transcribe it.',
      },
      {
        q: 'Is my audio stored?',
        a: 'No. Your file is sent securely to the transcription service, converted to text, and not retained by us. The transcript is returned to your browser and nowhere else.',
      },
      {
        q: 'What can I use it for?',
        a: 'Turning interviews and meetings into notes, captioning videos, drafting show notes from a podcast, transcribing voice memos and lectures, and making spoken content searchable. The transcript is plain editable text you can clean up and reuse.',
      },
    ],
    relatedSlugs: ['text-to-speech', 'text-summarizer', 'pdf-to-text'],
    ctaHook: 'Run a podcast, agency, or research team? Pixie builds the website and workflow around your content — text us on WhatsApp.',
    aboutHeading: 'Speech recognition, finally good enough to trust',
    about:
      'Automatic transcription used to be a punchline — the kind of feature that turned "recognize speech" into "wreck a nice beach" — but the technology crossed a real threshold with large speech models trained on enormous, diverse audio. OpenAI\'s Whisper, which powers this tool, was trained on hundreds of thousands of hours of multilingual speech, and the result is a transcriber that copes gracefully with accents, casual speech, technical vocabulary, and a fair amount of background noise. It also detects the spoken language automatically and can transcribe dozens of them, which is why a single tool can handle an English podcast, a Spanish interview, and a Hindi voice memo without you changing any settings. Under the hood the model listens to the audio in short overlapping windows and predicts the most likely sequence of words, using its language understanding to disambiguate similar-sounding phrases from context — the same principle that lets a human catch a mumbled word because they know what the sentence is about. The practical limits are honest ones: extremely noisy recordings, several people talking over each other, and very long files are still hard, and like any model it can occasionally invent a plausible-sounding word in a silent or garbled stretch, so a quick read-through is wise before you rely on a transcript. Used well, though, it collapses one of the most tedious knowledge-work tasks there is — turning hours of spoken audio into searchable, editable, shareable text — from an afternoon into a couple of minutes, freeing interviews, meetings, lectures, and podcasts to be summarized, quoted, captioned, and translated.',
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
