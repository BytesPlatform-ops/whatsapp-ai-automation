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
    relatedSlugs: ['share-incentive-plan-calculator', 'pool-salt-calculator'],
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
    relatedSlugs: ['mortgage-calculator', 'pool-salt-calculator'],
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
