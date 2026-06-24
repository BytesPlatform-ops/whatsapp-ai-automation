# AI Receptionist Industry Question Bank

## Overview

A bank of **1000 onboarding questions** (20 industries × 50) the AI Receptionist platform uses to learn a business deeply during onboarding. Answers feed the AI receptionist's system prompt, booking logic, FAQs, lead qualification, follow-ups, and escalation rules — so the AI behaves like a trained human receptionist for that specific business. See `ai-receptionist-question-bank-usage.md` for how to use it.

## Question Object Schema

Each question (in the JSON file) has these fields:

- **id** — unique id, `PREFIX-NNN` (e.g. `SALON-001`).
- **industry** — the industry this question belongs to.
- **category** — one of the 20 onboarding categories (A–T).
- **question** — the question shown to the business owner.
- **why_it_matters** — why the AI receptionist needs this answer.
- **expected_answer_type** — input type (e.g. `multi_select`, `price`, `time_range`).
- **required** — whether onboarding requires it.
- **used_for** — which AI capabilities consume the answer (e.g. `ai_prompt`, `booking`).
- **example_answer** — a realistic sample answer.
- **follow_up_question** — an optional conditional follow-up.

## Industries Covered

1. Beauty Parlour / Salon
2. Dental Clinic
3. Medical Clinic
4. Real Estate Agency
5. Restaurant / Cafe
6. Fitness Gym
7. Auto Repair Workshop
8. Law Firm
9. Cleaning Service
10. Home Services / Plumbing / Electrical
11. Ecommerce Store
12. Digital Marketing Agency
13. School / Academy
14. Event Planner
15. Travel Agency
16. SaaS / Software Company
17. Insurance Agency
18. Accounting / Tax Firm
19. Hotel / Guest House
20. Construction / Contractor Business


## 1. Beauty Parlour / Salon

### Business Identity

- **SALON-001. What is the exact name of your salon as it should appear when the AI greets callers and chat customers?**
  - Why it matters: The salon name sets the brand identity in every greeting and confirmation message.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Glamour Studio Hair & Beauty
  - Follow-up question: Do you have a shorter nickname customers commonly use that the AI should also recognize?
- **SALON-002. What are the full street address and any landmark details the AI should share when customers ask how to find your salon?**
  - Why it matters: Accurate location details reduce missed appointments from customers who cannot find the salon.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Shop 12, Crescent Plaza, Main Boulevard, Gulberg III, Lahore (next to the pharmacy)
  - Follow-up question: Is there parking or a specific entrance the AI should mention to first-time visitors?
- **SALON-003. What are your salon's opening hours for each day of the week, including any days you are closed?**
  - Why it matters: Hours drive whether the AI offers a slot or tells the customer the salon is closed.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Tue-Sun 10am-8pm, Monday closed; Fridays open 2pm-9pm
  - Follow-up question: Do your hours change during festivals, Eid, or the wedding season?
- **SALON-004. Is your salon ladies-only, gents-only, unisex, or does it have separate sections, and how should the AI explain this to callers?**
  - Why it matters: Gender policy affects which customers and services the AI should accept or redirect.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Ladies-only salon with a private bridal room
  - Follow-up question: Do you allow children with their mothers, and is there an age limit?
- **SALON-005. What makes your salon stand out (e.g., award-winning bridal artist, organic products, luxury experience) that the AI should highlight to interested customers?**
  - Why it matters: A clear differentiator helps the AI sell the salon and justify pricing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, campaign
  - Required: no
  - Example answer: We use ammonia-free organic color and our lead stylist trained in London
  - Follow-up question: Which of these selling points should the AI mention first to price-sensitive customers?

### Services / Products

- **SALON-006. List every hair service you offer (haircut, blow-dry, color, highlights, keratin, smoothing) with a short description for each.**
  - Why it matters: A complete hair-service menu lets the AI answer questions and book the correct service.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Haircut & style, blow-dry, global color, root touch-up, balayage highlights, keratin treatment, hair spa
  - Follow-up question: Which of these services require a patch test or consultation before booking?
- **SALON-007. List all skin and facial services (clean-up, facial types, derma treatments, waxing, threading) you provide.**
  - Why it matters: Skin services often have different durations and pricing the AI must quote correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Gold facial, hydra facial, fruit clean-up, full-arm waxing, eyebrow threading, underarm threading
  - Follow-up question: Do any facial treatments require the customer to avoid sun exposure beforehand?
- **SALON-008. What nail and hand/foot services do you offer (manicure, pedicure, gel polish, nail extensions, nail art)?**
  - Why it matters: Nail services have distinct add-ons and durations that affect scheduling and upsell.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: no
  - Example answer: Classic manicure, spa pedicure, gel polish, acrylic extensions, French nail art
  - Follow-up question: Do you charge extra for gel removal or nail repair as separate add-ons?
- **SALON-009. Describe your bridal and party makeup packages, including what is included (trial, draping, hairstyle, dupatta setting).**
  - Why it matters: Bridal is high-value and complex, so the AI needs exact package contents to quote and qualify.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, pricing, lead_qualification
  - Required: yes
  - Example answer: Bridal package: HD makeup + hairstyle + dupatta setting + one free trial; Party makeup: makeup + hairstyle only
  - Follow-up question: Do you travel to the client's home or venue for bridal bookings, and is there a travel fee?
- **SALON-010. Do you sell retail products (shampoo, serums, skincare) and should the AI offer them as add-ons during bookings?**
  - Why it matters: Retail add-ons raise average ticket value if the AI knows what is available.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, pricing, campaign
  - Required: no
  - Example answer: Yes, we sell L'Oreal and home-care kits at the counter
  - Follow-up question: Which products should the AI recommend after specific services like keratin or facials?

### Pricing / Packages

- **SALON-011. What is the price (or price range) for each of your core services such as haircut, color, facial, and manicure?**
  - Why it matters: Accurate prices let the AI quote confidently without escalating every question.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: Haircut 1500, global color 4000-8000, gold facial 3500, classic manicure 1200
  - Follow-up question: Do prices vary by hair length or stylist seniority, and how should the AI explain that?
- **SALON-012. Do you offer bundled packages or memberships (e.g., monthly facial plan, bridal-month package) and what do they cost?**
  - Why it matters: Packages improve retention and the AI should pitch them to the right customers.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign, lead_qualification
  - Required: no
  - Example answer: Bridal month package: 3 facials + 2 clean-ups + manicure/pedicure for 18000
  - Follow-up question: Is there an expiry period on package sessions the AI should mention?

### Booking / Appointment Rules

- **SALON-016. How far in advance can customers book, and what is the minimum notice you need for same-day appointments?**
  - Why it matters: Booking windows define which slots the AI can offer immediately versus decline.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Up to 60 days ahead; same-day needs at least 2 hours notice
  - Follow-up question: Do bridal bookings require a longer minimum lead time than regular services?
- **SALON-017. What is the typical duration the AI should block for each service so appointments do not overlap?**
  - Why it matters: Correct durations prevent double-booking and stylist overload.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: Haircut 45 min, color 2 hrs, facial 1 hr, bridal 3-4 hrs
  - Follow-up question: Should the AI add buffer/cleanup time between appointments for any service?
- **SALON-018. What is your reschedule and cancellation policy (notice required, limits, fees) the AI should enforce?**
  - Why it matters: Reschedule rules let the AI move appointments without manager involvement while protecting revenue.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, follow_up
  - Required: yes
  - Example answer: Free reschedule with 24 hrs notice; cancellations under 24 hrs forfeit deposit
  - Follow-up question: How many times can a single appointment be rescheduled before the AI requires manager approval?
- **SALON-019. Do you accept walk-ins, and if so for which services and how should the AI handle walk-in inquiries during busy hours?**
  - Why it matters: Walk-in policy controls whether the AI promises immediate service or offers a slot.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: no
  - Example answer: Walk-ins welcome for threading and blow-dry; color and bridal by appointment only
  - Follow-up question: During peak weekends, should the AI still tell walk-ins to expect a wait time?
- **SALON-020. Can a customer book multiple services or multiple people in one appointment, and how should the AI sequence them?**
  - Why it matters: Group and multi-service bookings need careful sequencing across staff and chairs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: no
  - Example answer: Yes, group bookings of up to 5; AI should assign separate stylists and confirm total time
  - Follow-up question: Is there a group-size threshold above which the AI should require advance deposit?

### Customer Qualification

- **SALON-021. What questions should the AI ask to qualify a bridal inquiry (event date, location, number of looks, budget)?**
  - Why it matters: Qualifying bridal leads early routes serious high-value clients to the right artist.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Ask wedding date, venue city, number of functions, and whether they want trial included
  - Follow-up question: What budget threshold means the AI should immediately involve the senior bridal artist?
- **SALON-022. How should the AI determine whether a chemical service (color, keratin, smoothing) is suitable based on the customer's hair history?**
  - Why it matters: Prior treatments and damage affect whether a chemical service is safe to book.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, compliance
  - Required: no
  - Example answer: Ask if hair was recently colored, henna-treated, or chemically straightened before booking keratin
  - Follow-up question: Which combinations of past treatments require an in-person consultation first?

### FAQs

- **SALON-026. What are the most common questions customers ask before booking that the AI should answer instantly?**
  - Why it matters: Pre-loaded FAQs let the AI resolve inquiries without staff involvement.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Do you do home service, what products do you use, how long does keratin last, is parking available
  - Follow-up question: Are there any questions you would prefer the AI route to a human instead of answering?
- **SALON-027. How should the AI answer questions about how long a treatment lasts (keratin, gel nails, color, facial glow)?**
  - Why it matters: Longevity answers manage expectations and reduce complaints after the service.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: no
  - Example answer: Keratin lasts 3-4 months, gel polish 2-3 weeks, global color until roots show in 4-6 weeks
  - Follow-up question: Should the AI suggest a maintenance schedule when answering longevity questions?
- **SALON-028. What aftercare advice should the AI share after major services like keratin, color, facial, or nail extensions?**
  - Why it matters: Correct aftercare protects results and signals professionalism.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, follow_up, customer_support
  - Required: no
  - Example answer: After keratin: no washing for 48 hrs, use sulphate-free shampoo; after facial: avoid sun and makeup for 24 hrs
  - Follow-up question: Should aftercare tips be sent automatically by WhatsApp after the appointment?
- **SALON-029. How should the AI respond when customers ask whether your products are safe for sensitive skin, pregnancy, or allergies?**
  - Why it matters: Safety FAQs need careful, consistent answers to avoid liability and reassure customers.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, compliance
  - Required: no
  - Example answer: We use hypoallergenic options; for pregnancy we recommend a patch test and consultation first
  - Follow-up question: Are there services you do not perform on pregnant clients that the AI should decline?
- **SALON-030. How should the AI explain the difference between similar services (e.g., clean-up vs facial, keratin vs smoothing)?**
  - Why it matters: Clear comparisons help undecided customers pick and book the right service.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: no
  - Example answer: A clean-up is a quick exfoliation; a facial adds massage and a mask for deeper nourishment
  - Follow-up question: Which service should the AI recommend as the better value for a first-time customer?

### Staff / Team / Availability

- **SALON-031. List your stylists and specialists with their specialties and the services each can perform.**
  - Why it matters: Knowing who does what lets the AI assign the right staff to each booking.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: Ayesha: bridal & color; Sara: facials & threading; Nida: nails; Maria: haircuts
  - Follow-up question: Which stylist is the default when a customer has no preference?
- **SALON-032. What are the individual working days and shift hours for each stylist so the AI books within their availability?**
  - Why it matters: Per-stylist availability prevents booking someone on their day off.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: Ayesha Tue-Sat 11-7; Sara Wed-Sun 10-6; Nida weekends only
  - Follow-up question: How should the AI handle requests for a senior stylist who is fully booked that day?
- **SALON-033. Do senior or specialist stylists carry a price premium, and how should the AI communicate that when a customer requests them?**
  - Why it matters: Stylist-tier pricing must be quoted accurately to avoid checkout surprises.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, staff_assignment
  - Required: no
  - Example answer: Senior stylist adds 30% to the base service price
  - Follow-up question: Should the AI offer a junior stylist as a cheaper alternative when quoting the premium?

### Communication Channels

- **SALON-034. Which channels (WhatsApp, phone calls, Instagram DM, website chat) should the AI handle, and which is your primary?**
  - Why it matters: Channel coverage defines where customers reach the AI and where to focus.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: WhatsApp primary, plus Instagram DM and phone calls
  - Follow-up question: If a customer messages on Instagram, should the AI move them to WhatsApp to complete the booking?

### Voice Call Behavior

- **SALON-035. How should the AI handle incoming phone calls — book directly, take a message, or transfer to staff for certain requests?**
  - Why it matters: Call-handling rules decide when the AI acts versus hands off to a human.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Book regular services directly; transfer bridal and complaint calls to the manager
  - Follow-up question: What greeting should the AI use when answering a call during busy salon hours?

### WhatsApp / Email / SMS Behavior

- **SALON-036. Should the AI send appointment confirmations and reminders by WhatsApp, and what details should each message include?**
  - Why it matters: Confirmation content reduces no-shows and reflects the salon's professionalism.
  - Expected answer type: `long_text`
  - Used for: whatsapp, booking, follow_up, sms
  - Required: yes
  - Example answer: WhatsApp confirmation with service, date/time, stylist, and salon location
  - Follow-up question: How many hours before the appointment should the reminder go out?

### Follow-up Rules

- **SALON-038. After a service, when and how should the AI follow up to check satisfaction or remind about the next appointment?**
  - Why it matters: Timely follow-ups drive repeat visits and surface issues before they become bad reviews.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, whatsapp, campaign
  - Required: yes
  - Example answer: WhatsApp 2 days after visit to ask satisfaction; rebook reminder at 4 weeks for color clients
  - Follow-up question: Which services should trigger an automatic rebooking reminder and at what interval?

### Sales / Upsell Opportunities

- **SALON-039. Which add-on services should the AI suggest when a customer books a base service (e.g., hair spa with color, manicure with pedicure)?**
  - Why it matters: Targeted upsells increase ticket size without feeling pushy.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, pricing
  - Required: no
  - Example answer: Offer hair spa with color, head massage with blow-dry, and pedicure with manicure
  - Follow-up question: Is there an upsell discount the AI can offer to make the combo more attractive?
- **SALON-040. What seasonal or promotional offers (Eid, Valentine's, bridal season, membership deals) should the AI promote and when?**
  - Why it matters: Promoting the right offer at the right time fills slow periods and boosts revenue.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, follow_up
  - Required: no
  - Example answer: Eid package 20% off bundles in the week before Eid; bridal early-bird discount in wedding season
  - Follow-up question: Which customer segments should receive each promotion via the AI's outreach?

### Complaints / Escalation

- **SALON-041. How should the AI respond when a customer complains about a service result (bad color, uneven cut, skin reaction)?**
  - Why it matters: A consistent complaint script protects reputation and resolves issues quickly.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Apologize sincerely, offer a free correction within 7 days, and notify the manager immediately
  - Follow-up question: What is the deadline for a customer to claim a free correction?
- **SALON-042. Under what conditions must the AI immediately escalate to a human (refund demands, allergic reactions, angry customers)?**
  - Why it matters: Clear escalation triggers ensure sensitive situations reach staff fast.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Escalate on refund requests, skin reactions, or anyone threatening a public review
  - Follow-up question: Who is the designated person and contact number for these escalations?

### Payments / Deposits / Refunds

- **SALON-013. Do you require a deposit to confirm bookings, and if so for which services and how much?**
  - Why it matters: Deposit rules let the AI take or request payment and reduce no-shows on high-value slots.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, payment
  - Required: yes
  - Example answer: 50% advance for bridal and group bookings; walk-in services no deposit
  - Follow-up question: What payment methods (bank transfer, JazzCash, card) should the AI share for the deposit?
- **SALON-014. What is your refund and cancellation policy for deposits if a customer cancels or reschedules?**
  - Why it matters: A clear refund policy prevents disputes and the AI must state it consistently.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment, escalation
  - Required: yes
  - Example answer: Deposit non-refundable within 48 hours of appointment; adjustable to a new date if rescheduled 3+ days prior
  - Follow-up question: Should the AI handle refund requests itself or always escalate them to the manager?
- **SALON-015. Which payment methods do you accept at the salon and which can be used to pay deposits remotely?**
  - Why it matters: Customers need to know payment options up front so the AI can complete deposit collection.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, payment, faq
  - Required: yes
  - Example answer: Cash, card, JazzCash, Easypaisa, and bank transfer for deposits
  - Follow-up question: Do you charge any card-processing surcharge the AI should disclose?

### Industry-Specific Rules

- **SALON-044. Are there services that require special preparation by the customer beforehand (clean hair for keratin, no makeup for facial)?**
  - Why it matters: Pre-appointment prep instructions prevent wasted appointments and poor results.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: no
  - Example answer: Come with clean dry hair for keratin; remove gel polish before a new nail set
  - Follow-up question: Should the AI send these prep instructions automatically with the booking confirmation?
- **SALON-045. How should the AI handle no-shows and late arrivals (grace period, partial service, fee, slot release)?**
  - Why it matters: No-show and lateness rules protect the schedule and stylist time.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, payment
  - Required: yes
  - Example answer: 15-minute grace period; beyond that the slot may be shortened or rebooked and deposit forfeited
  - Follow-up question: After how many no-shows should the AI require advance payment for future bookings?

### Compliance / Safety

- **SALON-025. What consent or disclosure must be obtained before storing a customer's personal data and sending marketing messages?**
  - Why it matters: Marketing and data storage require explicit consent to stay compliant with privacy rules.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, campaign
  - Required: yes
  - Example answer: Ask permission to save details and send offers via WhatsApp; record their yes/no
  - Follow-up question: How should the AI handle a customer who later asks to delete their data?
- **SALON-043. What hygiene and safety practices should the AI mention to reassure customers (sterilized tools, single-use items, sanitization)?**
  - Why it matters: Hygiene assurances build trust, especially for facials, threading, and nail services.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, compliance
  - Required: no
  - Example answer: We sterilize all tools, use disposable wax strips, and sanitize stations between clients
  - Follow-up question: Do you require a patch test before any chemical or color service for first-time clients?

### Customer Data Collection

- **SALON-023. What customer details must the AI collect for every booking (name, phone, service, preferred stylist)?**
  - Why it matters: Standard data capture ensures bookings are complete and reachable for reminders.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: yes
  - Example answer: Full name, WhatsApp number, service, preferred date/time, preferred stylist
  - Follow-up question: Should the AI also capture how the customer heard about the salon for marketing?
- **SALON-024. Should the AI record customer preferences and history (allergies, favorite products, color formula) for repeat visits?**
  - Why it matters: Stored preferences personalize service and reduce errors on return visits.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, customer_support, follow_up
  - Required: no
  - Example answer: Yes, note allergies, preferred stylist, and last color formula
  - Follow-up question: Which preference fields are most important for the AI to confirm before each appointment?

### AI Tone / Personality

- **SALON-037. What tone and personality should the AI use with customers (warm and friendly, luxury and formal, casual and trendy)?**
  - Why it matters: Tone must match the salon's brand so the AI feels like part of the team.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Warm, friendly, and a little glamorous, using customer's first name
  - Follow-up question: Should the AI mix in any local language or slang your customers commonly use?

### Reporting / Analytics

- **SALON-046. Which metrics do you want the AI to report regularly (bookings made, no-show rate, most-booked service, revenue from upsells)?**
  - Why it matters: Defined metrics turn AI activity into actionable business insight.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics
  - Required: no
  - Example answer: Weekly bookings, no-show rate, top services, upsell conversion, busiest hours
  - Follow-up question: How often and through which channel would you like to receive these reports?
- **SALON-047. Should the AI track which marketing source or campaign each booking came from for reporting?**
  - Why it matters: Attribution shows which promotions and channels actually drive bookings.
  - Expected answer type: `yes_no`
  - Used for: reporting, analytics, campaign
  - Required: no
  - Example answer: Yes, tag bookings as Instagram, referral, walk-in, or Eid campaign
  - Follow-up question: Which channels do you most want to compare in the conversion report?
- **SALON-050. Should the AI alert you in real time when key thresholds are hit (fully booked day, high cancellation spike, VIP client booking)?**
  - Why it matters: Real-time alerts let you react to operational issues and VIP opportunities immediately.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics, escalation
  - Required: no
  - Example answer: Alert me when a day is fully booked, when 3+ cancellations happen, or when a VIP bridal client books
  - Follow-up question: Which contact (WhatsApp, email) should receive these real-time alerts?

### Automation Triggers

- **SALON-048. What events should automatically trigger an AI message (booking confirmed, 24h before, after service, package expiring)?**
  - Why it matters: Defined triggers automate the customer journey without manual effort.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, whatsapp
  - Required: yes
  - Example answer: On booking: confirmation; 24h before: reminder; after visit: thank-you; package: expiry reminder
  - Follow-up question: Should birthday or anniversary dates also trigger an automatic offer message?
- **SALON-049. When a customer has not visited for a set period, should the AI automatically send a win-back offer, and after how long?**
  - Why it matters: Automated win-back outreach revives lapsed customers and recovers revenue.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign
  - Required: no
  - Example answer: After 60 days of no visit, send a 15% comeback discount
  - Follow-up question: Should the win-back discount differ between regular and high-value bridal clients?


## 2. Dental Clinic

### Business Identity

- **DENTAL-001. What is the official registered name of your dental clinic and any short name patients commonly use when calling or messaging?**
  - Why it matters: The AI must introduce the clinic with the correct name so patients trust they reached the right practice.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Bright Smile Dental Care (patients usually say 'Bright Smile')
  - Follow-up question: Should the AI use the full name or the short name in everyday conversation?
- **DENTAL-002. What are the full physical addresses of each clinic location, including parking or access notes patients ask about?**
  - Why it matters: Patients frequently ask for directions and parking, and the AI must give the correct branch details.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, voice_call
  - Required: yes
  - Example answer: 12 King Street, Manchester M1 2AB — free patient parking at rear, wheelchair access via main entrance
  - Follow-up question: Which location should the AI treat as the default if a patient does not specify a branch?
- **DENTAL-003. What are your clinic's opening hours by day, including any late-night, weekend, or emergency dental hours?**
  - Why it matters: Accurate hours prevent the AI from booking or promising appointments when the clinic is closed.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, faq, voice_call
  - Required: yes
  - Example answer: Mon-Fri 8:30am-6pm, Sat 9am-1pm, closed Sun; emergency line Sat afternoon only
  - Follow-up question: Are there any public holidays or seasonal closures the AI should announce?
- **DENTAL-004. What is your clinic's main contact phone number, WhatsApp number, general email, and website URL for patient inquiries?**
  - Why it matters: The AI needs verified contact channels to direct patients and confirm where bookings are managed.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, voice_call, whatsapp, email
  - Required: yes
  - Example answer: Phone 0161 555 0100, WhatsApp 07700 900123, hello@brightsmile.co.uk, brightsmile.co.uk
  - Follow-up question: Which channel do you prefer patients use for new appointment requests?
- **DENTAL-005. Which regulatory registrations and credentials should the AI mention when patients ask (e.g., GDC registration, CQC rating, NHS contract status)?**
  - Why it matters: Patients judge credibility by official registrations, and the AI must state only accurate, verifiable credentials.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: no
  - Example answer: CQC-registered, all dentists GDC-registered, NHS and private patients accepted
  - Follow-up question: Should the AI proactively mention NHS availability, or only when asked?

### Services / Products

- **DENTAL-006. List every treatment your clinic offers across general, cosmetic, and specialist categories (e.g., checkups, scale & polish, fillings, root canal, extractions, crowns, veneers, implants, braces, Invisalign, teeth whitening, hygienist visits).**
  - Why it matters: The AI must only offer treatments you actually provide and route specialist requests correctly.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, faq, lead_qualification
  - Required: yes
  - Example answer: Checkups, hygiene cleaning, white fillings, root canal, extractions, crowns, veneers, dental implants, Invisalign, whitening
  - Follow-up question: Are any of these treatments offered only at specific locations or by specific dentists?
- **DENTAL-007. Which treatments do you NOT offer and instead refer out to a specialist or hospital (e.g., wisdom tooth surgery, complex orthodontics, sedation, oral surgery)?**
  - Why it matters: The AI must avoid promising services you cannot deliver and hand off referrals cleanly.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, escalation
  - Required: yes
  - Example answer: We refer out surgical wisdom tooth removal and IV sedation cases to the local oral surgery hospital
  - Follow-up question: What should the AI tell a patient who needs a service you refer out?
- **DENTAL-008. How do you define and handle a dental emergency (e.g., severe pain, knocked-out tooth, swelling, bleeding, lost filling), and what same-day options exist?**
  - Why it matters: Emergency triage is time-sensitive and the AI must respond correctly without giving clinical advice.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, escalation, voice_call
  - Required: yes
  - Example answer: Severe pain, facial swelling, trauma, or uncontrolled bleeding = emergency; we hold daily emergency slots at 9am and 2pm
  - Follow-up question: If no emergency slot is available, where should the AI direct the patient (e.g., NHS 111, A&E)?
- **DENTAL-009. What appointment types and durations should the AI know for booking (e.g., new patient exam 30 min, hygiene 30 min, filling 45 min, emergency 20 min)?**
  - Why it matters: Correct durations prevent double-booking and let the AI offer realistic slots.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: New patient exam 30 min, routine checkup 15 min, hygiene 30 min, filling 45 min, root canal 90 min, emergency 20 min
  - Follow-up question: Should new patients always be booked into a longer first-visit slot?
- **DENTAL-010. Do you offer dental membership or care plans (e.g., Denplan, monthly checkup+hygiene plans), and what do they include?**
  - Why it matters: Membership plans are a common upsell and FAQ, so the AI must describe them accurately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing, campaign
  - Required: no
  - Example answer: Denplan Essentials from £18/month covering 2 checkups, 2 hygiene visits, and 10% off treatments
  - Follow-up question: Should the AI proactively suggest a care plan to patients booking repeated visits?

### Pricing / Packages

- **DENTAL-011. What are your private prices (or price ranges) for common treatments such as new patient exam, hygiene, white filling, root canal, crown, extraction, implant, and Invisalign?**
  - Why it matters: Price is the most common patient question, and the AI must quote your real figures rather than guessing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing, lead_qualification
  - Required: yes
  - Example answer: Exam £55, hygiene £65, white filling £120-180, root canal £400-650, crown £550, implant from £2,000, Invisalign from £2,800
  - Follow-up question: Should the AI give exact prices or ranges, and when must it say a consultation is needed for a quote?
- **DENTAL-012. Which NHS bands and charges apply at your clinic, and how should the AI explain the difference between NHS and private pricing?**
  - Why it matters: NHS vs private cost confusion is frequent, and the AI must explain it correctly to avoid complaints.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: no
  - Example answer: NHS Band 1 £26.80, Band 2 £73.50, Band 3 £319.10; private offers more material/appointment choice
  - Follow-up question: Are you currently accepting new NHS patients, and should the AI say so?

### Booking / Appointment Rules

- **DENTAL-016. What is your appointment booking notice and lead time (e.g., how far ahead routine vs emergency appointments can be booked)?**
  - Why it matters: The AI needs booking-window rules to offer valid slots and avoid impossible requests.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Routine checkups up to 8 weeks ahead, emergencies same day, hygiene up to 12 weeks ahead
  - Follow-up question: Should the AI offer a waitlist when no near-term slots are available?
- **DENTAL-017. What is your cancellation and rescheduling policy, including the minimum notice period and any fees?**
  - Why it matters: Consistent cancellation handling reduces lost revenue and the AI must enforce your stated notice.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, follow_up
  - Required: yes
  - Example answer: 48 hours notice required; late cancellation incurs a £30 fee or deposit loss
  - Follow-up question: How many times can a patient reschedule before the AI flags the booking for staff review?
- **DENTAL-018. How should the AI handle new-patient bookings versus existing-patient bookings differently (registration forms, longer slots, medical history)?**
  - Why it matters: New patients need extra steps, and the AI must collect the right information up front.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: New patients get a 30-min exam, must complete a medical history form, and provide ID/insurance before arrival
  - Follow-up question: Should the AI send the registration/medical history form link automatically after booking?
- **DENTAL-019. Which dentists or hygienists can the AI book for, and are there preferences such as patients requesting a specific clinician or female/male provider?**
  - Why it matters: Provider matching keeps continuity of care and respects patient comfort preferences.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: Dr. Khan (general), Dr. Lee (cosmetic/Invisalign), Sarah (hygienist); patients can request a specific provider
  - Follow-up question: If a requested clinician is unavailable, should the AI offer an alternative or hold for that provider?
- **DENTAL-020. What confirmation and reminder schedule should the AI follow for booked appointments (e.g., instant confirmation, 24h reminder)?**
  - Why it matters: Reminders cut no-shows and the AI must trigger them on the cadence you choose.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, follow_up, sms, whatsapp
  - Required: yes
  - Example answer: Instant WhatsApp confirmation, SMS reminder 24h before, plus a 2h-before nudge for emergency slots
  - Follow-up question: Should reminders include preparation instructions for specific treatments?

### Customer Qualification

- **DENTAL-021. What information must the AI collect to qualify and register a patient (full name, date of birth, contact, address, GP/medical alerts, reason for visit)?**
  - Why it matters: Capturing the right details up front speeds check-in and ensures safe treatment planning.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, lead_qualification, customer_support
  - Required: yes
  - Example answer: Full name, DOB, mobile, email, address, reason for visit, NHS or private preference
  - Follow-up question: Which of these fields are mandatory before the AI can confirm a booking?
- **DENTAL-022. What screening questions should the AI ask to route patients correctly (e.g., new vs returning, in pain now, child or adult, nervous patient, insurance vs self-pay)?**
  - Why it matters: Qualification routing sends urgent and complex cases to the right slot or human quickly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, booking, escalation
  - Required: yes
  - Example answer: Are you in pain now? New or returning? Adult or child? NHS or private? Any swelling or trauma?
  - Follow-up question: Which answers should immediately trigger an emergency or human handoff?
- **DENTAL-023. How should the AI handle requests for children's dental appointments (minimum age you treat, parent/guardian consent, paediatric availability)?**
  - Why it matters: Children require consent and sometimes specialist availability, which the AI must respect.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification, compliance
  - Required: no
  - Example answer: We treat children from age 1; a parent/guardian must book and attend; under-18s are NHS-free
  - Follow-up question: Should the AI require the booking adult to confirm guardian status?
- **DENTAL-025. How should the AI handle insurance and payment-method qualification (which insurers you accept, what details to capture, when to verify cover)?**
  - Why it matters: Insurance handling affects pricing answers and prevents surprises at the appointment.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, pricing, faq
  - Required: no
  - Example answer: We accept Bupa, AXA, Denplan; capture insurer name and ask patients to verify cover before treatment
  - Follow-up question: Should the AI confirm an insurer is accepted before quoting any price?

### FAQs

- **DENTAL-026. How should the AI answer 'Does it hurt?' or 'Will the treatment be painful?' without giving clinical reassurance it cannot guarantee?**
  - Why it matters: Pain questions are emotionally charged and the AI must reassure generally while deferring clinical detail to the dentist.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: yes
  - Example answer: Most procedures use local anaesthetic for comfort; the dentist will discuss what to expect at your visit
  - Follow-up question: What sedation or comfort options should the AI mention for nervous patients?
- **DENTAL-027. What are the most common FAQs your front desk hears (whitening results, how long implants take, can I eat before, do you treat nervous patients), and the approved answers?**
  - Why it matters: Pre-approved answers keep the AI accurate and consistent on repeated questions.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: Whitening takes 2-3 weeks for home kits; implants 3-6 months total; we welcome nervous patients with sedation options
  - Follow-up question: Which FAQs are you happy for the AI to answer fully versus deflect to a callback?
- **DENTAL-028. How should the AI respond when a patient describes symptoms (toothache, swelling, sensitivity) and asks 'what is wrong with me' or 'what should I take'?**
  - Why it matters: The AI must never diagnose or recommend medication and must redirect to a dentist safely.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance, escalation
  - Required: yes
  - Example answer: I can't diagnose or advise on medication, but I can book you with a dentist quickly — would you like a same-day slot?
  - Follow-up question: What exact disclaimer wording do you want the AI to use when declining clinical questions?
- **DENTAL-029. What should the AI say about how long results last or recovery times for treatments (whitening, fillings, extractions) without overpromising outcomes?**
  - Why it matters: Outcome questions risk implied guarantees, so the AI must give general info and defer specifics to the clinician.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: no
  - Example answer: Whitening typically lasts 6-12 months depending on habits; your dentist will advise on your specific case
  - Follow-up question: Are there treatments where the AI must explicitly say 'results vary and cannot be guaranteed'?
- **DENTAL-030. How should the AI answer questions about whether you are accepting new patients (NHS and private) and any current waiting lists?**
  - Why it matters: Availability status changes often and incorrect answers create disappointment and complaints.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Currently accepting private new patients immediately; NHS waiting list approx 3 months
  - Follow-up question: How should the AI capture details for the NHS waiting list when the practice is full?

### Communication Channels

- **DENTAL-031. Which channels should the AI operate on (voice phone, WhatsApp, SMS, email, website chat) and what is the priority/fallback order between them?**
  - Why it matters: The AI must know where it is allowed to respond and how to escalate across channels.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, sms, email
  - Required: yes
  - Example answer: WhatsApp primary, voice phone for emergencies, email for forms; SMS for reminders only
  - Follow-up question: If a patient asks to switch channels mid-conversation, what should the AI do?
- **DENTAL-035. What languages should the AI support, and how should it handle a patient who messages in a language you do not serve?**
  - Why it matters: Language coverage affects accessibility and the AI must hand off gracefully when it cannot help.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: no
  - Example answer: English and Urdu supported; for other languages, offer a human callback during reception hours
  - Follow-up question: Should the AI auto-detect language or ask the patient to choose?

### Voice Call Behavior

- **DENTAL-032. How should the AI behave on inbound voice calls (greeting script, when to offer a callback, when to transfer to reception, after-hours message)?**
  - Why it matters: Voice is the main emergency channel and the script must triage urgency and hand off correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Greet as 'Bright Smile Dental', ask if it's an emergency, book or transfer; after-hours give the emergency NHS 111 message
  - Follow-up question: What phone number or extension should the AI transfer urgent calls to?

### WhatsApp / Email / SMS Behavior

- **DENTAL-033. How should the AI behave on WhatsApp, SMS, and email differently (response time expectations, message length, sending booking links, attaching forms)?**
  - Why it matters: Each channel has different norms, and the AI must adapt format and tone accordingly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, sms, email
  - Required: yes
  - Example answer: WhatsApp: short friendly replies with booking link; SMS: reminders only, no clinical detail; email: longer, attach forms
  - Follow-up question: What approved booking/form links should the AI send on each channel?

### Follow-up Rules

- **DENTAL-036. What follow-up should the AI send after a completed appointment (post-treatment care reminders, next-visit booking, feedback request)?**
  - Why it matters: Post-visit follow-up improves retention and recovery while avoiding clinical overreach.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, whatsapp, sms
  - Required: yes
  - Example answer: Send a thank-you + general aftercare link 1 day after, and a feedback request 3 days after
  - Follow-up question: Should aftercare messages contain only general guidance and avoid any specific clinical instructions?
- **DENTAL-037. What recall/recare reminder cadence should the AI run for routine checkups and hygiene visits (e.g., 6-month checkup, 6-month hygiene)?**
  - Why it matters: Recall reminders are the backbone of dental revenue and patient health continuity.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign, sms, whatsapp
  - Required: yes
  - Example answer: 6-month checkup recall and 6-month hygiene recall via WhatsApp, with a reminder 2 weeks before due
  - Follow-up question: How many recall reminders should the AI send before marking a patient as lapsed for staff review?

### Sales / Upsell Opportunities

- **DENTAL-038. What upsell or cross-sell opportunities should the AI surface, and how (e.g., whitening after a checkup, hygiene add-on, Invisalign for crowding, care plan enrollment)?**
  - Why it matters: Appropriate upsells grow revenue, but the AI must suggest them tactfully and never pressure or imply clinical need.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up, lead_qualification
  - Required: no
  - Example answer: Offer whitening to patients booking a checkup, and mention care plans to patients booking 2+ visits
  - Follow-up question: Which upsells are forbidden because they imply a clinical recommendation the dentist must make?
- **DENTAL-039. How should the AI re-engage lapsed patients or abandoned booking inquiries (timing, message, incentive limits)?**
  - Why it matters: Win-back campaigns recover revenue, but messaging must stay compliant and non-pushy.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up, whatsapp
  - Required: no
  - Example answer: Message patients who haven't visited in 9 months with a friendly checkup reminder; no health-scare language
  - Follow-up question: Are you allowed to offer a discount or free consult as a win-back incentive, and what is the cap?
- **DENTAL-040. What promotional campaigns can the AI mention (new patient offers, whitening promotions, Invisalign open days), and what consent rules apply to marketing messages?**
  - Why it matters: Marketing requires opt-in consent, and the AI must only promote approved, currently active offers.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, compliance, follow_up
  - Required: no
  - Example answer: New patient exam £29 (normally £55); only send marketing to patients who opted in
  - Follow-up question: How should the AI confirm and record marketing consent before sending promotions?

### Complaints / Escalation

- **DENTAL-041. When must the AI immediately escalate to a human or dentist (clinical questions, severe symptoms, distressed patients, complaints, safeguarding concerns)?**
  - Why it matters: Knowing hard escalation triggers protects patient safety and limits clinical liability.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, compliance, customer_support
  - Required: yes
  - Example answer: Escalate on: any clinical/diagnosis question, severe pain/swelling, complaint, distressed patient, child safeguarding
  - Follow-up question: Who is the named contact and what is the channel for each escalation type?
- **DENTAL-042. How should the AI handle complaints about treatment, billing, or staff (acknowledge, log, escalate to practice manager), and what must it never promise?**
  - Why it matters: Mishandled dental complaints can become regulatory issues, so the AI must follow your complaints procedure exactly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, compliance, customer_support
  - Required: yes
  - Example answer: Apologise, log details, escalate to the practice manager within 24h; never admit liability or promise refunds
  - Follow-up question: What is your formal complaints timeline and who owns the response?

### Payments / Deposits / Refunds

- **DENTAL-013. Do you require a deposit to secure appointments (especially new patients, cosmetic consults, or long treatments), and how much?**
  - Why it matters: Deposit rules reduce no-shows and the AI must state them when booking to set expectations.
  - Expected answer type: `price`
  - Used for: ai_prompt, booking, payment
  - Required: yes
  - Example answer: £40 deposit for new patient and cosmetic consultation appointments, redeemable against treatment
  - Follow-up question: Is the deposit refundable if the patient cancels within your notice period?
- **DENTAL-014. What payment methods do you accept, and do you offer finance or payment plans for treatments like implants, braces, or veneers?**
  - Why it matters: Finance availability influences high-value treatment decisions and is a common AI question.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, pricing, payment, campaign
  - Required: yes
  - Example answer: Card, cash, bank transfer; 0% finance over 12 months on treatments over £1,000 via Tabeo
  - Follow-up question: Should the AI mention finance proactively when quoting treatments above a certain price?
- **DENTAL-015. What is your refund and deposit-forfeit policy for cancellations, late arrivals, and no-shows?**
  - Why it matters: Clear refund rules prevent disputes and the AI must communicate them consistently.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment, escalation
  - Required: yes
  - Example answer: Deposit forfeited if cancelled with less than 48h notice or no-show; otherwise fully refunded or transferred
  - Follow-up question: Who should the AI escalate a refund dispute to?

### Industry-Specific Rules

- **DENTAL-046. Which dental-specific operational rules must the AI enforce (e.g., no antibiotics/prescriptions over chat, X-rays only in clinic, sedation patients need an escort, fasting not required for routine dentistry)?**
  - Why it matters: Dental practice has unique operational constraints the AI must respect to keep patients safe and visits valid.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, compliance, faq
  - Required: yes
  - Example answer: Sedation patients must bring an escort and not drive; antibiotics require a dentist; X-rays done in clinic only
  - Follow-up question: Are there pre-appointment instructions the AI should send for specific treatments like implants or sedation?

### Compliance / Safety

- **DENTAL-043. What clinical and medical-advice boundaries must the AI strictly observe (no diagnosis, no medication advice, no treatment recommendations, mandatory disclaimers)?**
  - Why it matters: Giving dental/medical advice without a clinician is unsafe and a serious regulatory risk.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, escalation
  - Required: yes
  - Example answer: AI must never diagnose, suggest medication, or interpret X-rays/symptoms; always defer to a GDC-registered dentist
  - Follow-up question: What exact safety disclaimer should the AI append whenever a patient raises a clinical concern?
- **DENTAL-044. What patient-data privacy rules must the AI follow (GDPR/health-data consent, what can be discussed in chat, identity verification before sharing records)?**
  - Why it matters: Dental records are special-category data and mishandling them risks ICO breaches and patient harm.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, customer_support
  - Required: yes
  - Example answer: Never share or confirm treatment history over chat without verifying identity; obtain consent before storing data
  - Follow-up question: What identity-verification steps must the AI complete before discussing any existing patient's records?
- **DENTAL-045. How should the AI handle urgent safety situations such as a patient describing facial swelling spreading to the eye/neck, difficulty breathing/swallowing, or uncontrolled bleeding?**
  - Why it matters: These can be medical emergencies and the AI must direct the patient to urgent care immediately, not just book.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, compliance, voice_call
  - Required: yes
  - Example answer: Tell the patient to call 999/A&E immediately for breathing/swallowing difficulty or rapidly spreading swelling
  - Follow-up question: What exact wording should the AI use to direct a patient to emergency services?

### Customer Data Collection

- **DENTAL-024. What patient data must be collected, stored, and confirmed for consent, and how should the AI ask for it in line with privacy rules?**
  - Why it matters: Dental records are special-category health data and the AI must capture consent lawfully.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, customer_support, lead_qualification
  - Required: yes
  - Example answer: Collect contact + reason for visit only via chat; confirm GDPR consent before storing; full medical history taken in clinic
  - Follow-up question: Should the AI avoid collecting detailed medical history over chat and defer it to the secure in-clinic form?

### AI Tone / Personality

- **DENTAL-034. What tone and personality should the AI use with patients (warm and reassuring, professional, calming for nervous patients), and what language/tone is off-limits?**
  - Why it matters: Dental anxiety is common, so tone directly affects whether patients book and trust the clinic.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Warm, calm, reassuring; never clinical jargon or alarming language; gentle with anxious patients
  - Follow-up question: Should the AI use the patient's first name, and how formal should greetings be?

### Reporting / Analytics

- **DENTAL-047. What reports and metrics do you want the AI to track and surface (bookings made, no-shows prevented, emergency triages, recall conversions, escalations, top FAQs)?**
  - Why it matters: Defined metrics prove ROI and reveal where the AI helps or needs tuning.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, analytics, reporting
  - Required: no
  - Example answer: Weekly: bookings, recall conversions, no-show rate, emergency calls handled, escalations, most-asked FAQs
  - Follow-up question: How often and to whom should the AI send these reports?
- **DENTAL-048. Which patient-experience signals should the AI capture for analytics (satisfaction after booking, NPS, drop-off points where patients stop replying)?**
  - Why it matters: Experience analytics highlight where patients hesitate so the practice can improve conversion and care.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, analytics, reporting, follow_up
  - Required: no
  - Example answer: Capture post-booking satisfaction, NPS after treatment, and where inquiries drop off before booking
  - Follow-up question: Should low satisfaction scores automatically trigger a staff follow-up?

### Automation Triggers

- **DENTAL-049. What automation triggers should fire on specific events (new emergency message, deposit paid, appointment confirmed, no-show recorded, recall due, complaint logged)?**
  - Why it matters: Event-based automations keep the workflow moving without manual reception effort.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, follow_up, escalation
  - Required: yes
  - Example answer: Emergency keyword -> alert on-call dentist; deposit paid -> confirm booking; no-show -> send rebooking link
  - Follow-up question: Which triggers require a human approval step before the AI acts?
- **DENTAL-050. What should happen automatically when a patient does not respond or does not show up (re-engagement sequence, slot release, lapsed-patient tagging)?**
  - Why it matters: Automated handling of silent and no-show patients recovers revenue and frees up appointment slots.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, booking, analytics
  - Required: yes
  - Example answer: No reply in 48h -> one gentle nudge then close; no-show -> release slot, send rebooking link, tag for recall
  - Follow-up question: After how many missed appointments should the AI flag a patient for manual review or removal?


## 3. Medical Clinic

### Business Identity

- **MEDICAL-001. What is the full legal and trading name of your medical clinic as it should appear in patient-facing communications?**
  - Why it matters: The AI must identify the clinic correctly and consistently across calls, messages, and confirmations.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq, voice_call
  - Required: yes
  - Example answer: Riverside Family Medical Centre (trading as Riverside Health)
  - Follow-up question: Should the AI use the full legal name or the shorter trading name when greeting patients?
- **MEDICAL-002. What are the physical addresses of all clinic locations the AI may be answering for, including any parking or access notes patients commonly ask about?**
  - Why it matters: Patients frequently ask for directions and the AI needs accurate per-location details to avoid sending them to the wrong site.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, voice_call, whatsapp
  - Required: yes
  - Example answer: Main: 14 Riverside Road, Leeds LS1 2AB (free patient parking at rear). Branch: 3 High Street, Otley LS21 3AA (street parking only).
  - Follow-up question: Is one location designated as the default for new patients if they do not specify?
- **MEDICAL-003. What are your clinic's standard opening hours per location, and do they differ for specific services such as phlebotomy or nurse clinics?**
  - Why it matters: Accurate hours prevent the AI from offering or implying appointments when the clinic is closed.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq, voice_call
  - Required: yes
  - Example answer: Mon-Fri 8:00-18:30, Sat 9:00-12:00 (GP only). Blood tests Mon-Thu 8:00-11:00 by appointment.
  - Follow-up question: Are there any public holiday closures or seasonal hours the AI should announce?
- **MEDICAL-004. What is the official registration, licensing, or regulatory body and registration number for your clinic (e.g., CQC, GMC practice number)?**
  - Why it matters: Patients and partners may request regulatory details, and the AI should provide verified, accurate information only.
  - Expected answer type: `short_text`
  - Used for: faq, compliance, ai_prompt
  - Required: no
  - Example answer: Registered with the Care Quality Commission (CQC), provider ID 1-234567890.
  - Follow-up question: Should the AI share this proactively or only when explicitly asked?
- **MEDICAL-005. Who is the primary point of contact (name, role, email, phone) for the AI to route operational, billing, or clinical-governance questions it cannot handle?**
  - Why it matters: Defines a reliable human owner so unresolved or sensitive matters reach the right person quickly.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Practice Manager, Sarah Khan, sarah@riversidehealth.co.uk, 0113 555 0101.
  - Follow-up question: Is there a separate clinical lead for any matter touching patient care?

### Services / Products

- **MEDICAL-006. List the core clinical services your clinic offers (e.g., GP consultations, vaccinations, blood tests, women's health, minor surgery) that the AI may discuss and help book.**
  - Why it matters: The AI must only describe and book services the clinic actually provides to avoid false promises.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: GP consultations, travel vaccinations, blood tests, ECG, women's health, minor surgery, health checks.
  - Follow-up question: Are any of these services offered only at specific locations or on specific days?
- **MEDICAL-007. Which specialist or consultant services do you offer (e.g., dermatology, cardiology, physiotherapy), and which require a referral before booking?**
  - Why it matters: Specialist routing and referral requirements determine whether the AI can book directly or must capture details for clinical review.
  - Expected answer type: `long_text`
  - Used for: booking, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Dermatology (referral required), physiotherapy (self-referral allowed), cardiology (GP referral required).
  - Follow-up question: For referral-required specialists, what details should the AI collect before handing to staff?
- **MEDICAL-008. What lab tests and diagnostics do you offer in-house versus send out, and what are typical turnaround times patients ask about?**
  - Why it matters: Patients frequently ask about results timing, and the AI needs accurate turnaround information without making clinical interpretations.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, booking
  - Required: no
  - Example answer: In-house: basic blood panels (2-3 days). Send-out: hormone profiles (5-7 days), histology (up to 2 weeks).
  - Follow-up question: How should the AI respond if a patient asks the AI to interpret or explain their results?
- **MEDICAL-009. What appointment types and durations should the AI offer for each service (e.g., 10-min standard GP, 20-min double appointment, 30-min new patient)?**
  - Why it matters: Correct durations keep the booking calendar realistic and prevent overbooked or under-scheduled slots.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Standard GP 10 min, double 20 min, new patient 30 min, nurse blood test 15 min, travel clinic 30 min.
  - Follow-up question: When should the AI suggest a double appointment rather than a standard one?
- **MEDICAL-010. Are there services your clinic explicitly does NOT provide that the AI should clearly decline and redirect (e.g., controlled-drug prescriptions, emergency care, paediatric surgery)?**
  - Why it matters: Clear exclusions prevent the AI from raising patient expectations the clinic cannot meet.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, escalation
  - Required: yes
  - Example answer: We do not provide A&E/emergency care, controlled-drug repeat scripts, or maternity delivery; redirect to NHS or relevant service.
  - Follow-up question: Where should the AI redirect patients for each excluded service?

### Pricing / Packages

- **MEDICAL-011. What are your private consultation and service fees that the AI is permitted to quote (per service or appointment type)?**
  - Why it matters: Accurate, approved pricing prevents the AI from quoting incorrect fees that the clinic must then honor or correct.
  - Expected answer type: `long_text`
  - Used for: pricing, faq, ai_prompt
  - Required: yes
  - Example answer: Private GP consult GBP 75, double GBP 130, blood test from GBP 45 plus phlebotomy GBP 25, travel consult GBP 50.
  - Follow-up question: Are there any fees the AI must NOT quote and instead direct to a staff member?
- **MEDICAL-012. Do you offer bundled health-check or membership packages, and what does each include and cost?**
  - Why it matters: Packages are common upsell points and the AI needs precise inclusions to describe them correctly.
  - Expected answer type: `long_text`
  - Used for: pricing, faq, ai_prompt, campaign
  - Required: no
  - Example answer: Executive Health Check GBP 350 (bloods, ECG, BP, GP review). Annual membership GBP 600 (4 GP visits, priority booking).
  - Follow-up question: Should the AI proactively mention packages when a patient books a relevant individual service?
- **MEDICAL-013. Which insurers and self-pay arrangements do you accept, and what information must the AI capture from insured patients before booking?**
  - Why it matters: Insurance handling affects eligibility and billing, and the AI must gather the right details without quoting cover it cannot verify.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, payment, booking, ai_prompt
  - Required: yes
  - Example answer: Accept Bupa, AXA, Vitality, self-pay. Capture insurer, membership number, authorisation/pre-auth code if held.
  - Follow-up question: Should the AI ever confirm coverage, or only collect details and let staff verify with the insurer?

### Booking / Appointment Rules

- **MEDICAL-016. What scheduling system or calendar does the AI integrate with, and what are the rules for available slot lookup (buffer times, lead time, same-day cutoff)?**
  - Why it matters: These rules determine which slots the AI may offer so it never books impossible or conflicting appointments.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: SystmOne. 10-min buffer between patients, minimum 2h lead time online, same-day GP requests cut off at 16:00.
  - Follow-up question: How far in advance can patients book, and is there a maximum future window?
- **MEDICAL-017. How should the AI handle same-day or urgent appointment requests that are not life-threatening (e.g., on-the-day triage list, callback from a clinician)?**
  - Why it matters: Defines a safe, non-clinical pathway so the AI captures urgency without making any triage or severity judgment itself.
  - Expected answer type: `long_text`
  - Used for: booking, escalation, ai_prompt, compliance
  - Required: yes
  - Example answer: Capture symptoms and contact details, add to the duty clinician callback list, and tell patient a clinician will call within 2 hours.
  - Follow-up question: What exact wording should the AI use so it never implies it has assessed how urgent the case is?
- **MEDICAL-018. What information must a patient provide before the AI can confirm a booking (e.g., full name, date of birth, registered status, reason category)?**
  - Why it matters: Required fields ensure the booking is valid and the patient can be matched to the correct record.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, customer_support, ai_prompt
  - Required: yes
  - Example answer: Full name, date of birth, phone number, whether registered patient, brief reason category (not detailed symptoms).
  - Follow-up question: Should the AI avoid recording detailed clinical symptoms in the booking note for privacy reasons?
- **MEDICAL-019. What are your rules for rescheduling and cancellations through the AI (allowed window, number of changes, which appointment types are locked)?**
  - Why it matters: Clear rules let the AI safely manage changes without violating clinic policy or double-booking clinicians.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, follow_up
  - Required: yes
  - Example answer: Reschedule up to 24h before, max 2 self-service moves; surgery and health checks must be changed by staff.
  - Follow-up question: Should the AI offer the next available alternative automatically when a patient cancels?
- **MEDICAL-020. Are there clinician- or gender-preference rules the AI should honor (e.g., female patient requesting a female GP, continuity with usual doctor)?**
  - Why it matters: Honoring preferences improves patient comfort and is sometimes clinically or culturally important.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: no
  - Example answer: Always offer a female clinician for cervical screening and women's health; try to keep continuity with the patient's named GP.
  - Follow-up question: What should the AI say if the preferred clinician has no availability within the requested window?

### Customer Qualification

- **MEDICAL-021. How should the AI determine whether a contact is an existing registered patient versus a new patient, and what differs in the flow for each?**
  - Why it matters: New versus existing status changes registration steps, eligible services, and which slots can be offered.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking, ai_prompt
  - Required: yes
  - Example answer: Ask if registered; existing: match by name/DOB. New: explain registration requirements and offer a new-patient appointment.
  - Follow-up question: Can new patients self-book online, or must registration be completed by staff first?
- **MEDICAL-022. What eligibility criteria gate certain services (e.g., age limits for vaccines, residency for NHS services, fasting before blood tests)?**
  - Why it matters: The AI must screen for eligibility prerequisites so patients are not booked into appointments they cannot use.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking, faq, ai_prompt
  - Required: yes
  - Example answer: Flu jab 65+ free; under 18 paediatric pathway; fasting required for lipid/glucose bloods; UK residency for NHS services.
  - Follow-up question: What preparation instructions should the AI send once a fasting or prep-dependent test is booked?
- **MEDICAL-025. When a patient describes symptoms, what is the exact protocol for the AI to capture details and hand off WITHOUT assessing severity or suggesting any cause?**
  - Why it matters: The AI must never perform triage or imply a clinical assessment; it only records and routes to clinical staff.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, escalation, compliance, ai_prompt
  - Required: yes
  - Example answer: Record symptom description verbatim, do not comment on it, say a clinician will review, and add to the clinician callback queue.
  - Follow-up question: What standard phrase should the AI use to make clear it cannot give medical advice?

### FAQs

- **MEDICAL-026. What are the most common general (non-clinical) questions patients ask, and the approved answers for each (hours, parking, registration, prescriptions, results)?**
  - Why it matters: A curated FAQ set lets the AI answer routine queries instantly and consistently without inventing answers.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: How to register, repeat prescription turnaround (48h), how to get results (via reception, not by AI), parking, sick notes.
  - Follow-up question: Which of these FAQs change seasonally and need periodic review?
- **MEDICAL-027. How should the AI answer requests about test results, and what is it forbidden from disclosing?**
  - Why it matters: Disclosing or interpreting results is a clinical and privacy risk; the AI must redirect these safely.
  - Expected answer type: `long_text`
  - Used for: faq, compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: AI never reads out or interprets results; it confirms whether results are back and books a clinician call to discuss them.
  - Follow-up question: Who is authorised to release results, and how is patient identity verified before release?
- **MEDICAL-028. How should the AI handle prescription and repeat-medication requests, including which it can log and which require a clinician?**
  - Why it matters: Prescriptions are clinically sensitive; the AI must route them correctly without making any medication decisions.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, escalation, compliance
  - Required: yes
  - Example answer: Log repeat requests for listed medications and forward to the prescribing clinician; never approve dose changes or new meds.
  - Follow-up question: What is the standard turnaround the AI should quote for repeat prescriptions?
- **MEDICAL-029. What should the AI say about referrals, sick notes (fit notes), and medical letters, including process and cost?**
  - Why it matters: These are frequent administrative requests where accurate process and pricing prevent confusion.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, pricing
  - Required: no
  - Example answer: Fit notes require a clinician review; private letters GBP 30, allow 5 working days; referrals issued after consultation.
  - Follow-up question: Can patients request these through chat, or must they book an appointment first?
- **MEDICAL-030. What should the AI tell patients about how to access the clinic outside opening hours, including the out-of-hours and emergency pathway?**
  - Why it matters: Patients contacting after hours need correct, safe guidance toward the appropriate urgent service.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, compliance, escalation
  - Required: yes
  - Example answer: Out of hours, call NHS 111; for emergencies call 999. The clinic reopens at 8:00; non-urgent messages are reviewed next working day.
  - Follow-up question: Should the AI display this out-of-hours guidance automatically when contacted while closed?

### Staff / Team / Availability

- **MEDICAL-046. List the clinicians and staff the AI may book or route to, including their roles, services, working days, and any booking restrictions.**
  - Why it matters: Accurate staff and availability data ensures the AI offers valid slots and routes patients to the right clinician.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: yes
  - Example answer: Dr Patel (GP, Mon-Wed), Dr Lewis (GP, women's health, Tue-Fri), Nurse Amy (bloods/vaccines, Mon-Thu).
  - Follow-up question: How should the AI find out about leave or last-minute clinician absence to avoid offering unavailable slots?

### Communication Channels

- **MEDICAL-031. Which channels will the AI operate on (voice phone, WhatsApp, SMS, email, web chat), and is there a priority order for responses?**
  - Why it matters: Knowing active channels and priority ensures consistent coverage and that urgent paths are not missed.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, voice_call, whatsapp, sms, email
  - Required: yes
  - Example answer: Voice phone (primary), WhatsApp, web chat, email; SMS for confirmations only.
  - Follow-up question: Are there any channels where booking is disabled and only information is provided?

### Voice Call Behavior

- **MEDICAL-032. How should the AI open and identify itself on a voice call, and what disclosure must it make about being an automated assistant?**
  - Why it matters: Transparency about being an AI plus a clear greeting set patient expectations and meet disclosure norms.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, compliance
  - Required: yes
  - Example answer: Thank you for calling Riverside Health, you're speaking with our automated assistant. How can I help with your appointment today?
  - Follow-up question: At what point in a call should the AI offer to transfer to a human receptionist?
- **MEDICAL-033. What triggers an immediate live transfer or callback during a voice call (e.g., distress, mention of emergency words, explicit request for a human)?**
  - Why it matters: Defines safe stop-conditions so the AI never tries to handle situations that require a person.
  - Expected answer type: `long_text`
  - Used for: voice_call, escalation, compliance, ai_prompt
  - Required: yes
  - Example answer: Transfer on words like chest pain, can't breathe, suicidal, emergency; on caller distress; or on any request for a person.
  - Follow-up question: If no human is available to transfer, what fallback should the AI offer for these cases?

### WhatsApp / Email / SMS Behavior

- **MEDICAL-034. What are your rules for sending appointment information over WhatsApp, SMS, and email regarding how much clinical detail may appear in a message?**
  - Why it matters: Messaging channels are less secure, so limiting clinical detail protects patient privacy and meets data rules.
  - Expected answer type: `long_text`
  - Used for: whatsapp, sms, email, compliance, ai_prompt
  - Required: yes
  - Example answer: Confirmations include date, time, clinician, location only; never diagnoses, results, or medication names in any message.
  - Follow-up question: Should email confirmations use a secure link rather than including details in the body?

### Follow-up Rules

- **MEDICAL-036. What appointment reminders should the AI send, on which channel, and at what intervals before the appointment?**
  - Why it matters: Well-timed reminders reduce no-shows, a major cost driver for clinics.
  - Expected answer type: `long_text`
  - Used for: follow_up, sms, whatsapp, ai_prompt
  - Required: yes
  - Example answer: SMS 48h before and WhatsApp 2h before, each with a reply-to-confirm or reschedule option.
  - Follow-up question: Should reminder content differ for prep-dependent appointments such as fasting blood tests?
- **MEDICAL-037. What recall and review programs should the AI manage (e.g., annual diabetic review, blood-pressure check, vaccination due), and how are patients identified for them?**
  - Why it matters: Recall management drives chronic-disease compliance and recurring clinic revenue when handled reliably.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, ai_prompt, booking
  - Required: no
  - Example answer: Annual diabetic and asthma reviews, 6-monthly BP checks, flu recall each autumn; flagged from the recall register by staff.
  - Follow-up question: Should the AI auto-offer a booking slot in the recall message or just prompt the patient to call?
- **MEDICAL-038. How should the AI follow up after a missed appointment (no-show) or an unconfirmed reminder?**
  - Why it matters: Structured no-show follow-up recovers appointments and enforces the clinic's cancellation policy fairly.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, sms, whatsapp
  - Required: no
  - Example answer: Send a missed-appointment message offering to rebook, note the no-show fee per policy, and flag repeat no-shows to staff.
  - Follow-up question: After how many no-shows should the AI stop offering self-service rebooking and escalate to staff?

### Sales / Upsell Opportunities

- **MEDICAL-039. What appropriate, non-clinical additional services may the AI suggest during relevant conversations (e.g., flu jab when booking a check, travel vaccines before a trip)?**
  - Why it matters: Tasteful, relevant suggestions increase preventive uptake and revenue without pressuring patients.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, booking
  - Required: no
  - Example answer: Offer flu jab in autumn, travel vaccines if travel mentioned, health check when booking a private GP for general concerns.
  - Follow-up question: Are there contexts where the AI must NOT suggest add-ons, such as when symptoms or distress are present?
- **MEDICAL-040. Which seasonal or promotional campaigns should the AI be aware of and able to mention (e.g., autumn flu campaign, summer travel-clinic push)?**
  - Why it matters: Campaign awareness lets the AI promote timely offers consistently across all patient interactions.
  - Expected answer type: `long_text`
  - Used for: campaign, follow_up, ai_prompt
  - Required: no
  - Example answer: Autumn flu and COVID booster drive (Sept-Nov), spring travel-clinic promotion, January health-check New Year offer.
  - Follow-up question: Should the AI proactively send campaign messages, or only mention them when a related topic arises?

### Complaints / Escalation

- **MEDICAL-041. What is the exact escalation path for complaints, and what should the AI do versus route to a human (e.g., log details, apologise, never admit liability)?**
  - Why it matters: Complaints in healthcare are sensitive and sometimes regulated; the AI must capture them correctly without overstepping.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, compliance, ai_prompt
  - Required: yes
  - Example answer: Acknowledge, apologise for the experience, log details, do not admit fault, and forward to the Practice Manager within 1 hour.
  - Follow-up question: Is there a formal complaints procedure or timeframe the AI should reference to the patient?

### Payments / Deposits / Refunds

- **MEDICAL-014. Do you require a deposit or prepayment to confirm certain appointments, and if so for which services and how much?**
  - Why it matters: Deposit rules directly drive what the AI must collect to confirm a booking and reduce no-shows.
  - Expected answer type: `long_text`
  - Used for: payment, booking, ai_prompt
  - Required: yes
  - Example answer: GBP 25 deposit for travel clinic and minor surgery; full payment up front for health checks; no deposit for standard GP.
  - Follow-up question: How should the AI send the payment link or instructions to the patient?
- **MEDICAL-015. What is your refund and cancellation-fee policy, including how late cancellations or no-shows are charged?**
  - Why it matters: The AI must state the policy accurately when patients cancel or reschedule to set correct expectations.
  - Expected answer type: `long_text`
  - Used for: payment, faq, ai_prompt
  - Required: yes
  - Example answer: Free cancellation 24h+ before. Within 24h: deposit forfeited. No-show: full consult fee charged. Refunds within 5 working days.
  - Follow-up question: Should the AI process the cancellation itself or escalate any fee disputes to staff?

### Industry-Specific Rules

- **MEDICAL-045. Are there special handling rules for vulnerable patients, safeguarding concerns, or sensitive topics that the AI must escalate to a clinician immediately?**
  - Why it matters: Safeguarding and vulnerability are legal and ethical duties that the AI must route to humans without attempting to handle.
  - Expected answer type: `long_text`
  - Used for: compliance, escalation, ai_prompt
  - Required: yes
  - Example answer: Mentions of abuse, self-harm, child welfare, or a vulnerable adult: capture minimally, escalate to the duty clinician at once.
  - Follow-up question: Who is the designated safeguarding lead the AI should route these concerns to?

### Compliance / Safety

- **MEDICAL-042. What are the exact emergency and red-flag keywords or phrases that must immediately trigger the AI to advise contacting emergency services and stop normal flow?**
  - Why it matters: This is the single most safety-critical rule: emergencies must be redirected to 999/emergency services instantly, never handled by the AI.
  - Expected answer type: `long_text`
  - Used for: compliance, escalation, ai_prompt, voice_call
  - Required: yes
  - Example answer: Chest pain, difficulty breathing, stroke signs, severe bleeding, suicidal intent, anaphylaxis, unconscious; advise call 999 now.
  - Follow-up question: What exact emergency message and number should the AI provide for each region the clinic serves?
- **MEDICAL-043. What are the AI's hard boundaries on medical advice, diagnosis, dosing, and triage, and what standard refusal must it give when asked?**
  - Why it matters: The AI must never provide medical advice or clinical judgments; an explicit boundary and refusal script prevent harm and liability.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Never diagnose, advise on medication, or assess urgency. Refusal: 'I can't give medical advice, but I can arrange for a clinician to help.'
  - Follow-up question: Should this refusal always be paired with an offer to book a clinician or arrange a callback?
- **MEDICAL-044. What identity-verification steps must the AI perform before discussing any existing patient's appointment or releasing administrative information?**
  - Why it matters: Verifying identity protects patient confidentiality and prevents data being shared with the wrong person.
  - Expected answer type: `long_text`
  - Used for: compliance, customer_support, ai_prompt
  - Required: yes
  - Example answer: Confirm full name plus date of birth, and for sensitive actions a third identifier such as postcode before proceeding.
  - Follow-up question: How should the AI handle a caller speaking on behalf of another patient (e.g., a parent or carer)?

### Customer Data Collection

- **MEDICAL-023. What patient personal and contact details should the AI collect, and which fields are mandatory versus optional?**
  - Why it matters: Defines the minimum data set the AI gathers while avoiding collecting more sensitive data than necessary.
  - Expected answer type: `long_text`
  - Used for: customer_support, booking, compliance, ai_prompt
  - Required: yes
  - Example answer: Mandatory: name, DOB, phone. Optional: email, address, NHS number. Do not collect detailed clinical history in chat.
  - Follow-up question: Should the AI mask or avoid storing sensitive identifiers like NHS number in plain text?
- **MEDICAL-024. What explicit consent must the AI capture before collecting or processing patient data, and what exact consent wording should it use?**
  - Why it matters: Patient data is special-category data; documented consent is a legal requirement before processing it.
  - Expected answer type: `long_text`
  - Used for: compliance, customer_support, ai_prompt
  - Required: yes
  - Example answer: Confirm: 'Do you consent to us recording your details to manage your appointment, per our privacy policy?' before saving.
  - Follow-up question: Where is the full privacy policy link the AI should provide on request?

### AI Tone / Personality

- **MEDICAL-035. What tone and personality should the AI use with patients (e.g., warm and reassuring, calm, professional), and are there phrases to always use or always avoid?**
  - Why it matters: A consistent, appropriate tone builds trust in a sensitive healthcare context and avoids alarming patients.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Warm, calm, professional, never rushed. Avoid jokes or casual slang. Never say 'don't worry' about a clinical concern.
  - Follow-up question: How should the tone adapt when a patient sounds anxious or upset?

### Reporting / Analytics

- **MEDICAL-047. What metrics and reports should the AI track and deliver (e.g., bookings made, no-show rate, calls handled vs transferred, top FAQs)?**
  - Why it matters: Defined metrics let the clinic measure the AI's impact and spot operational issues early.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: no
  - Example answer: Bookings, cancellations, no-show rate, calls handled vs escalated, emergency redirects, top 10 FAQ topics, response times.
  - Follow-up question: How often and to whom should these reports be delivered, and in what format?
- **MEDICAL-048. Which events should the AI log for compliance and audit purposes (e.g., emergency redirects, escalations, consent captured, advice refusals)?**
  - Why it matters: An auditable log of safety-critical events is essential for governance, incident review, and regulatory assurance.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, compliance, analytics, ai_prompt
  - Required: yes
  - Example answer: Log every emergency redirect, human escalation, consent confirmation, advice refusal, and identity-verification outcome.
  - Follow-up question: How long should these audit logs be retained per your data-retention policy?

### Automation Triggers

- **MEDICAL-049. What automated actions should fire on key events (e.g., on booking send confirmation, on cancellation free the slot and notify staff, on no-show flag follow-up)?**
  - Why it matters: Clear event-to-action mappings make the AI's automation predictable and aligned with clinic workflows.
  - Expected answer type: `long_text`
  - Used for: booking, follow_up, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Booking -> SMS confirm + calendar entry; cancellation -> release slot + notify reception; no-show -> log + follow-up message.
  - Follow-up question: Which of these actions require staff approval before they execute?
- **MEDICAL-050. Under what conditions should the AI automatically hand a conversation to a human, and how should it notify staff (channel, urgency level, included context)?**
  - Why it matters: Reliable handoff rules ensure sensitive or complex cases reach staff promptly with the right context.
  - Expected answer type: `long_text`
  - Used for: escalation, staff_assignment, ai_prompt, customer_support
  - Required: yes
  - Example answer: Hand off on emergencies, complaints, safeguarding, advice requests, or human request; notify duty staff via Slack with patient name and reason.
  - Follow-up question: What should the AI tell the patient while the human handoff is being arranged?


## 4. Real Estate Agency

### Business Identity

- **REALESTATE-001. What is the legal and trading name of your real estate agency, and which name should the AI receptionist use when greeting callers and clients?**
  - Why it matters: Callers expect to hear the brand they contacted; using the wrong name erodes trust and can cause licensing confusion.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Legal name: Skyline Realty LLC. Greeting name: Skyline Realty.
  - Follow-up question: Should the AI mention any tagline or 'powered by' line after the agency name?
- **REALESTATE-002. What is your real estate brokerage license number and the licensing authority/state it was issued under?**
  - Why it matters: Many jurisdictions require a license number to be disclosed in advertising and client communications; the AI may need to cite it.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, compliance
  - Required: yes
  - Example answer: License #01234567, California Department of Real Estate (DRE).
  - Follow-up question: Should the license number be appended automatically to outbound marketing messages?
- **REALESTATE-003. What geographic markets, neighborhoods, or ZIP codes does your agency primarily serve?**
  - Why it matters: Lets the AI confirm whether a lead's desired area is covered and avoid promising service in regions you don't operate in.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Greater Austin metro: Downtown, Mueller, Round Rock, Cedar Park, Leander (ZIPs 78701-78759).
  - Follow-up question: If a lead asks about an area outside your coverage, should the AI refer them out or capture the lead anyway?
- **REALESTATE-004. What are your office hours, and is there an after-hours or weekend point of contact for urgent buyer/seller inquiries?**
  - Why it matters: Real estate is time-sensitive; the AI must set accurate expectations on when a human agent will respond.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Mon-Fri 9am-6pm, Sat 10am-4pm; after-hours urgent line forwards to on-call agent.
  - Follow-up question: What counts as 'urgent' enough to warrant an after-hours callback (e.g., offer deadline, lockout)?
- **REALESTATE-005. What is your office address, and do you handle in-person meetings at the office or only at properties?**
  - Why it matters: The AI needs accurate location details for clients planning visits and to clarify whether walk-ins are accepted.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: 100 Congress Ave, Suite 200, Austin TX. Office meetings by appointment; viewings at the property.
  - Follow-up question: Should the AI share parking or check-in instructions for office visits?

### Services / Products

- **REALESTATE-006. Which transaction types does your agency handle: residential sales, rentals/leasing, commercial, land, new construction, or property management?**
  - Why it matters: Determines which workflows the AI offers and prevents it from accepting leads for services you don't provide.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Residential sales, residential rentals, and property management. No commercial or land.
  - Follow-up question: For any service you don't offer, do you have a trusted referral partner the AI can mention?
- **REALESTATE-007. Do you represent buyers, sellers/landlords, or both, and do you offer dual agency where permitted?**
  - Why it matters: Agency representation rules are legally significant; the AI must qualify leads into the correct representation track.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, lead_qualification, compliance
  - Required: yes
  - Example answer: Both buyer and seller representation; dual agency only with written consent from both parties.
  - Follow-up question: Should the AI explicitly disclose dual-agency limitations to leads, or leave that to the agent?
- **REALESTATE-008. What ancillary services do you offer or coordinate, such as home valuations/CMAs, staging, mortgage referrals, photography, or relocation support?**
  - Why it matters: These are common requests; the AI should be able to describe or route them to capture more value per lead.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Free home valuation, professional photography, staging consultations, preferred mortgage broker referrals.
  - Follow-up question: Are any of these paid add-ons, and if so what do they cost?
- **REALESTATE-009. For property management, what services are included (rent collection, maintenance coordination, tenant screening, eviction handling)?**
  - Why it matters: Property-owner leads ask specific scope questions; the AI needs an accurate service list to answer correctly.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Rent collection, tenant screening, 24/7 maintenance coordination, annual inspections. Eviction handled via partner attorney.
  - Follow-up question: Is there a minimum number of units or property type you'll manage?
- **REALESTATE-010. Where do your current listings live (MLS, your website, Zillow, a portal link) so the AI can reference or share availability?**
  - Why it matters: Lets the AI point leads to live inventory and avoid quoting properties that are already sold or off-market.
  - Expected answer type: `url`
  - Used for: ai_prompt, faq, whatsapp
  - Required: no
  - Example answer: https://skylinerealty.com/listings (synced to MLS hourly).
  - Follow-up question: Should the AI ever share a specific listing link, or only the general listings page?

### Pricing / Packages

- **REALESTATE-011. What is your standard commission rate for seller/listing representation, and is it negotiable?**
  - Why it matters: Commission is the most common pricing question; the AI must answer consistently or know when to defer to an agent.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: Typically 5-6% total, split with the buyer's agent; negotiable based on property and scope.
  - Follow-up question: Should the AI quote a specific number or say it's discussed during the listing consultation?
- **REALESTATE-012. What fees apply to rental/leasing transactions (e.g., one month's rent, percentage of annual lease, tenant placement fee)?**
  - Why it matters: Rental clients need clear fee expectations; vague answers cause disputes and lost trust.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, faq
  - Required: no
  - Example answer: Tenant placement fee of one month's rent; landlords pay 50% of first month.
  - Follow-up question: Who pays the rental fee in your market — landlord, tenant, or split?
- **REALESTATE-013. What are your property management fees (monthly management %, leasing fee, renewal fee, setup fee)?**
  - Why it matters: Owner leads compare on fee structure; the AI needs exact figures to qualify and inform them.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: no
  - Example answer: 8% monthly management, one-time leasing fee of 50% of first month, $200 setup.
  - Follow-up question: Are there discounts for multiple units or longer contracts?
- **REALESTATE-014. Do you offer any tiered listing packages or flat-fee options (e.g., basic vs. premium marketing), and what's included in each?**
  - Why it matters: Lets the AI present clear options and upsell premium packages instead of giving a one-size answer.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign
  - Required: no
  - Example answer: Standard (MLS + photos), Premium (drone, video tour, social ads), Luxury (full staging + brochure).
  - Follow-up question: Which package should the AI present as the default/recommended one?
- **REALESTATE-015. Are there any upfront or out-of-pocket costs a client should expect (photography, staging, marketing) versus costs covered by commission?**
  - Why it matters: Avoids surprise charges; the AI should be transparent about what is bundled vs. billed separately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: no
  - Example answer: Photography and standard marketing are covered by commission; staging is an optional out-of-pocket add-on.
  - Follow-up question: Should the AI ever quote add-on prices, or only confirm they exist and let the agent quote?

### Booking / Appointment Rules

- **REALESTATE-016. What appointment types can the AI schedule (property viewing, listing consultation, buyer consultation, valuation visit, phone consultation)?**
  - Why it matters: Defines the booking menu and ensures the AI collects the right info for each appointment type.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Property viewing, listing/seller consultation, buyer consultation, and free home valuation.
  - Follow-up question: Which of these can be booked instantly vs. require an agent to confirm first?
- **REALESTATE-017. How much advance notice is required to book a property viewing, and what is the typical duration of a viewing slot?**
  - Why it matters: Listings may need owner/tenant notice; the AI must not offer slots that can't be honored.
  - Expected answer type: `short_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Minimum 24 hours' notice for occupied homes, 2 hours for vacant; viewings are 30 minutes.
  - Follow-up question: Does notice differ for vacant vs. tenant-occupied properties?
- **REALESTATE-018. What information must be collected before confirming a viewing (pre-approval status, ID verification, number of attendees)?**
  - Why it matters: Some sellers require qualification before granting access; the AI must gate bookings accordingly.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, lead_qualification, compliance
  - Required: yes
  - Example answer: Full name, phone, financing/pre-approval status, and number of attendees. ID checked on-site.
  - Follow-up question: Should the AI require proof of pre-approval before booking luxury/high-value listings?
- **REALESTATE-019. What are your rules for rescheduling, cancellations, and no-shows for viewings and consultations?**
  - Why it matters: Agent time is wasted by no-shows; the AI should communicate and enforce your policy.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, follow_up
  - Required: no
  - Example answer: Reschedule anytime up to 2 hours prior; two no-shows pause self-booking and require a callback.
  - Follow-up question: Should the AI automatically send a reminder before the appointment to reduce no-shows?
- **REALESTATE-020. Should viewings be assigned to the listing agent, the lead's assigned agent, or any available agent, and how should the AI handle that routing?**
  - Why it matters: Determines calendar logic and which agent's availability the AI books against.
  - Expected answer type: `single_select`
  - Used for: booking, staff_assignment
  - Required: yes
  - Example answer: Viewings go to the listing agent; if unavailable, offer the team's duty agent for that day.
  - Follow-up question: If the preferred agent is unavailable, can the AI offer another agent or only their next opening?

### Customer Qualification

- **REALESTATE-021. What budget or price-range questions should the AI ask buyers, and is there a minimum budget you serve?**
  - Why it matters: Budget is the core buyer qualifier; it routes leads to the right inventory and agent.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Ask target price range and max budget; minimum we serve is $250k purchase or $1,500/mo rent.
  - Follow-up question: If a buyer's budget is below your minimum, should the AI refer out or still capture them?
- **REALESTATE-022. What property criteria should the AI capture from buyers/renters (bedrooms, bathrooms, area, property type, must-haves)?**
  - Why it matters: Detailed criteria let agents match inventory immediately and make the lead worth following up.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, ai_prompt, follow_up
  - Required: yes
  - Example answer: Beds, baths, preferred neighborhoods, property type, parking, and any must-haves like a yard or office.
  - Follow-up question: Which single criterion matters most for matching — area, price, or property type?
- **REALESTATE-023. What financing/qualification questions should the AI ask (pre-approval, cash buyer, mortgage in progress, contingency on selling current home)?**
  - Why it matters: Financing readiness strongly predicts close likelihood and sets agent priority.
  - Expected answer type: `single_select`
  - Used for: lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Ask: pre-approved, cash, in-process, or not started; and whether purchase depends on selling another home.
  - Follow-up question: Should the AI offer a mortgage-broker referral to leads who aren't yet pre-approved?
- **REALESTATE-024. What timeline questions should the AI ask to gauge urgency (when do they want to move/buy/sell)?**
  - Why it matters: Timeline determines lead priority and which nurture sequence to place them in.
  - Expected answer type: `single_select`
  - Used for: lead_qualification, follow_up, ai_prompt
  - Required: yes
  - Example answer: Within 30 days, 1-3 months, 3-6 months, 6+ months / just browsing.
  - Follow-up question: What timeline threshold should mark a lead as 'hot' for immediate agent attention?

### FAQs

- **REALESTATE-026. What are the most common buyer questions you want the AI to answer directly (e.g., 'Is this home still available?', 'What's the HOA fee?', 'Are pets allowed?')?**
  - Why it matters: Pre-answering FAQs deflects routine calls and frees agents for high-value conversations.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: yes
  - Example answer: Availability, price, HOA fees, pet policy, square footage, school district, and tour scheduling.
  - Follow-up question: For property-specific facts the AI doesn't have, should it offer to text the listing agent?
- **REALESTATE-027. What are the most common seller/landlord questions the AI should handle (e.g., 'What's my home worth?', 'How long to sell?', 'What's your commission?')?**
  - Why it matters: Seller FAQs convert into listing consultations; consistent answers build credibility.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Home valuation process, average days-on-market, commission, marketing plan, and prep recommendations.
  - Follow-up question: For valuation questions, should the AI book a CMA appointment rather than give a number?
- **REALESTATE-028. What questions should the AI NEVER answer and instead always route to a licensed agent (legal advice, exact appraisal, fair-housing-sensitive topics)?**
  - Why it matters: Protects against unlicensed-practice and fair-housing violations; some answers must come from a human.
  - Expected answer type: `long_text`
  - Used for: faq, compliance, escalation
  - Required: yes
  - Example answer: Legal/tax advice, guaranteed pricing, questions about neighborhood demographics, or 'is this area safe?'.
  - Follow-up question: What exact phrasing should the AI use to decline and hand off these questions?
- **REALESTATE-029. Do you have standard FAQ content about the buying/selling/renting process you want the AI to use (steps, documents needed, deposit timing)?**
  - Why it matters: Process FAQs reduce repetitive explanation and set client expectations early.
  - Expected answer type: `file_upload`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Uploaded: buyer-journey.pdf and seller-checklist.pdf covering each step and required documents.
  - Follow-up question: Should the AI offer to email or WhatsApp these documents to interested leads?
- **REALESTATE-030. What should the AI say when a property is already under contract, sold, or rented but the lead is asking about it?**
  - Why it matters: Turns a dead-end inquiry into a captured lead for similar properties instead of losing them.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Inform them it's under contract, then offer to find similar active listings and capture their criteria.
  - Follow-up question: Should the AI add such leads to a waitlist for that building/neighborhood?

### Staff / Team / Availability

- **REALESTATE-031. List your agents/team members the AI can route to, with their specialties (buyers, sellers, luxury, rentals, areas) and working days.**
  - Why it matters: Enables accurate agent assignment and availability-aware scheduling.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: yes
  - Example answer: Maria (luxury sales, Mon-Fri), Dev (rentals + property mgmt, Tue-Sat), Priya (first-time buyers, Mon-Fri).
  - Follow-up question: Is there a default 'catch-all' agent for leads that don't match a specialty?
- **REALESTATE-032. How should leads be distributed among agents (round-robin, by area, by specialty, by who's on duty)?**
  - Why it matters: Fair, predictable routing prevents lead conflicts and ensures fast follow-up.
  - Expected answer type: `single_select`
  - Used for: staff_assignment, follow_up
  - Required: yes
  - Example answer: By area first, then round-robin among agents covering that area.
  - Follow-up question: If two agents cover the same area, what's the tie-breaker (response time, workload)?
- **REALESTATE-033. How should the AI handle requests for a specific agent who is unavailable or on vacation?**
  - Why it matters: Prevents leads from going cold while their requested agent is out.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, ai_prompt, escalation
  - Required: no
  - Example answer: Offer the agent's next available slot, or a covering teammate if the lead is time-sensitive.
  - Follow-up question: Should the AI ever override an agent request to keep a hot lead moving?

### Communication Channels

- **REALESTATE-034. Which channels should the AI receptionist operate on (voice calls, WhatsApp, SMS, email, website chat), and which is primary?**
  - Why it matters: Defines deployment surfaces and where booking/lead capture must function.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, sms, email
  - Required: yes
  - Example answer: Primary: WhatsApp and voice; secondary: website chat and email.
  - Follow-up question: Should the AI follow up on a different channel than the one the lead first used?

### Voice Call Behavior

- **REALESTATE-035. How should the AI behave on inbound calls — answer everything, only after hours, or as overflow when agents are busy — and what's the spoken greeting?**
  - Why it matters: Sets call-handling scope and the first impression on the most personal channel.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt
  - Required: yes
  - Example answer: Answer overflow + after-hours. Greeting: 'Thanks for calling Skyline Realty, how can I help with your property search today?'
  - Follow-up question: When should a live call be transferred to a human agent versus handled fully by the AI?

### WhatsApp / Email / SMS Behavior

- **REALESTATE-036. What should the AI send over WhatsApp/SMS after a lead inquires — listing links, viewing options, a brochure, or a qualification question first?**
  - Why it matters: Defines the messaging playbook so leads get the right asset without overwhelming them.
  - Expected answer type: `long_text`
  - Used for: whatsapp, sms, email, ai_prompt
  - Required: yes
  - Example answer: First confirm budget and area, then send 2-3 matching listing links and offer to book a viewing.
  - Follow-up question: Are there quiet hours during which the AI should not send messages?

### Follow-up Rules

- **REALESTATE-038. When and how often should the AI follow up with a lead who inquired but didn't book a viewing?**
  - Why it matters: Real estate leads convert with persistence; the cadence directly affects conversion.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign
  - Required: yes
  - Example answer: Follow up at 1 hour, day 2, day 5, then weekly for 4 weeks with new matching listings.
  - Follow-up question: After how many unanswered follow-ups should the AI stop and mark the lead dormant?
- **REALESTATE-039. How should the AI follow up after a completed viewing to gather feedback and gauge interest?**
  - Why it matters: Post-viewing feedback drives offer conversion and informs the agent's next step.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, analytics
  - Required: no
  - Example answer: Within 2 hours: 'How did you like the home? Would you like to make an offer or see similar properties?'
  - Follow-up question: Should negative feedback automatically trigger a fresh listing search for the lead?

### Sales / Upsell Opportunities

- **REALESTATE-040. What cross-sell or upsell offers should the AI surface (mortgage referral, insurance, property management for new owners, premium marketing for sellers)?**
  - Why it matters: Each transaction has adjacent revenue; the AI can introduce these at the right moment.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Offer mortgage referral to unapproved buyers and property management to investor buyers post-close.
  - Follow-up question: Do any partner referrals earn a fee, and should the AI mention they are partners?

### Complaints / Escalation

- **REALESTATE-041. What types of issues should the AI escalate immediately to a human (offer deadlines, contract disputes, upset clients, maintenance emergencies for managed properties)?**
  - Why it matters: Time-critical and emotional situations can damage the business if mishandled by automation.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Offer/closing-deadline issues, contract questions, complaints, and habitability emergencies escalate now.
  - Follow-up question: Who is the escalation contact for each type, and via what channel should they be alerted?
- **REALESTATE-042. What is the maintenance emergency protocol for managed properties (e.g., flooding, no heat, gas leak) and who should the AI notify?**
  - Why it matters: Habitability emergencies have legal urgency; the AI must trigger the correct rapid response.
  - Expected answer type: `long_text`
  - Used for: escalation, compliance, ai_prompt
  - Required: no
  - Example answer: Gas leak/flood/no heat: advise safety steps, alert on-call property manager immediately, log a ticket.
  - Follow-up question: Should the AI provide tenants with emergency utility shutoff guidance while help is dispatched?

### Payments / Deposits / Refunds

- **REALESTATE-046. Does the AI ever need to discuss or collect deposits/holding fees (earnest money, application fee, holding deposit), and what are the amounts and rules?**
  - Why it matters: Money handling has strict rules; the AI must communicate amounts and never improperly accept funds.
  - Expected answer type: `long_text`
  - Used for: payment, ai_prompt, faq
  - Required: no
  - Example answer: Rental application fee $50; holding deposit one week's rent. Earnest money handled by escrow, not the AI.
  - Follow-up question: Should the AI ever send a payment link, or only explain amounts and route to the office?
- **REALESTATE-047. What is your refund/return policy for application fees, holding deposits, and earnest money, and what should the AI tell clients?**
  - Why it matters: Refund disputes are common in rentals/purchases; clear AI messaging prevents conflict.
  - Expected answer type: `long_text`
  - Used for: payment, faq, ai_prompt
  - Required: no
  - Example answer: Application fees non-refundable; holding deposits refundable if landlord declines; earnest money per contract terms.
  - Follow-up question: Should refund requests always be escalated to a human rather than answered by the AI?

### Industry-Specific Rules

- **REALESTATE-048. What property-specific data points should the AI always capture or confirm when discussing a listing (address, MLS#, HOA, square footage, lot size, year built, occupancy status)?**
  - Why it matters: Standardizing listing data ensures accurate answers and clean handoffs to agents.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Address, MLS#, list price, beds/baths, sq ft, HOA fee, year built, and whether vacant or occupied.
  - Follow-up question: Which of these should never be quoted by the AI and must be confirmed by the agent?

### Compliance / Safety

- **REALESTATE-043. What fair-housing rules must the AI follow — which topics (race, religion, family status, disability, national origin) are strictly off-limits in any response?**
  - Why it matters: Fair-housing violations carry serious legal liability; the AI must never steer or discuss protected classes.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt
  - Required: yes
  - Example answer: Never answer 'is this a good area for families/a certain group' or describe neighborhood demographics; redirect to objective facts.
  - Follow-up question: What neutral response should the AI give when asked a demographic/steering question?
- **REALESTATE-044. What disclosures or consent must the AI present (recording notice on calls, data-privacy consent, agency disclosure) and when?**
  - Why it matters: Recording laws and agency-disclosure rules vary by jurisdiction; non-compliance is a legal risk.
  - Expected answer type: `long_text`
  - Used for: compliance, voice_call, ai_prompt
  - Required: yes
  - Example answer: Voice: 'This call may be recorded.' Chat: link to privacy policy and capture consent before storing data.
  - Follow-up question: Is explicit opt-in required before sending marketing texts/emails in your jurisdiction?
- **REALESTATE-045. What identity/safety verification should occur before sharing access details or scheduling an unaccompanied/lockbox viewing?**
  - Why it matters: Protects agents and properties from fraud and unsafe showings (a real industry safety concern).
  - Expected answer type: `long_text`
  - Used for: compliance, booking, lead_qualification
  - Required: no
  - Example answer: Verify ID and pre-approval; never share lockbox codes via chat; require an agent to be present for first viewings.
  - Follow-up question: Should the AI ever decline to book if a lead refuses to provide identifying details?

### Customer Data Collection

- **REALESTATE-025. What contact and personal details must the AI collect and store for every lead (name, phone, email, preferred contact method, current address)?**
  - Why it matters: Defines the minimum CRM record and ensures leads can be re-contacted and matched to listings.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, compliance, follow_up
  - Required: yes
  - Example answer: Full name, phone, email, preferred contact method/time, and buyer vs. seller vs. renter intent.
  - Follow-up question: Where should the captured lead data be pushed (CRM name, email, spreadsheet, webhook)?

### AI Tone / Personality

- **REALESTATE-037. What tone and personality should the AI use (warm and consultative, professional and concise, high-end/luxury), and any words/phrases to avoid?**
  - Why it matters: Tone must match brand positioning; a luxury brokerage and a high-volume rental shop sound different.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Warm, knowledgeable, never pushy. Avoid hype words like 'amazing deal'; never guarantee returns.
  - Follow-up question: Should the AI use the client's first name, and how formal should it be?

### Reporting / Analytics

- **REALESTATE-049. What metrics and reports do you want from the AI (leads captured, viewings booked, source channel, conversion to offer, response time, dormant leads)?**
  - Why it matters: Defines the reporting outputs that justify the AI's value and inform pipeline decisions.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics
  - Required: yes
  - Example answer: Daily: new leads, viewings booked, channel breakdown; weekly: lead-to-viewing and viewing-to-offer rates.
  - Follow-up question: Who should receive these reports, how often, and on which channel?

### Automation Triggers

- **REALESTATE-050. What automated actions should fire on specific events (new listing alert to matching leads, instant agent notification on hot lead, drip campaign on no-show, post-close upsell)?**
  - Why it matters: Event-driven automation keeps the pipeline moving without manual effort and captures revenue at the right moment.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, staff_assignment
  - Required: yes
  - Example answer: New matching listing -> notify saved-search leads; pre-approved buyer inquiry -> instant SMS to duty agent; no-show -> 3-step re-engagement drip.
  - Follow-up question: Should a hot-lead alert go to the assigned agent only, or to the whole team if unanswered in 5 minutes?


## 5. Restaurant / Cafe

### Business Identity

- **RESTAURANT-001. What is the exact name of your restaurant or cafe as you want it spoken and written to customers?**
  - Why it matters: The AI must greet callers and sign messages with the correct brand name to sound legitimate and consistent across channels.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp, email
  - Required: yes
  - Example answer: The Olive Branch Bistro
  - Follow-up question: Do you have a shorter nickname or phonetic spelling the AI should use when speaking it aloud?
- **RESTAURANT-002. What is the full street address of your restaurant, including any parking or entrance instructions?**
  - Why it matters: Callers frequently ask for directions and parking; accurate location details reduce no-shows and confused arrivals.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, voice_call, whatsapp
  - Required: yes
  - Example answer: 44 Market Street, Brighton BN1 2AA. Paid parking in the NCP behind the building; step-free entrance on the left.
  - Follow-up question: Is there a separate entrance or address for deliveries and takeaway pickup?
- **RESTAURANT-003. What are your opening hours for each day of the week, including kitchen close times if different?**
  - Why it matters: Most inbound questions are about whether you are open now; the AI needs exact hours to avoid taking bookings when closed.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking, voice_call
  - Required: yes
  - Example answer: Mon-Thu 11:00-22:00 (kitchen closes 21:30), Fri-Sat 11:00-23:00, Sun 12:00-21:00.
  - Follow-up question: Are there any seasonal, holiday, or weekly closures the AI should mention proactively?
- **RESTAURANT-004. What type of restaurant or cafe is this and what cuisine or concept best describes you?**
  - Why it matters: Helps the AI set expectations, answer 'what kind of food do you serve' instantly, and adopt the right tone.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Casual Italian trattoria with wood-fired pizza and a small wine bar
  - Follow-up question: Is there a signature dish or experience you want the AI to highlight when describing you?
- **RESTAURANT-005. What are your main contact details and links the AI can share (phone, website, menu URL, social profiles)?**
  - Why it matters: The AI must route callers to the right resource for menus, online ordering, or follow-up without guessing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, whatsapp, email
  - Required: yes
  - Example answer: Phone 01273 555 100, www.olivebranch.co.uk, menu at /menu, Instagram @olivebranchbn1
  - Follow-up question: Which single link do you most want customers to click when they reach out?

### Services / Products

- **RESTAURANT-006. Which service modes do you offer: dine-in, takeaway, delivery, catering, private events, or others?**
  - Why it matters: Determines which requests the AI can fulfil and which to politely decline, preventing impossible orders.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, booking, faq, lead_qualification
  - Required: yes
  - Example answer: Dine-in, takeaway, delivery via our own drivers, and catering for events of 20+
  - Follow-up question: Are any of these modes only available on certain days or during certain hours?
- **RESTAURANT-007. What is your current menu, and where is the authoritative, up-to-date version stored?**
  - Why it matters: The AI must answer 'what's on the menu' and 'do you have X' accurately; a stale menu erodes trust.
  - Expected answer type: `file_upload`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Uploaded PDF of dinner menu; specials live at www.olivebranch.co.uk/specials
  - Follow-up question: How often does the menu change, and who should the AI rely on for daily specials?
- **RESTAURANT-008. Which dietary options do you reliably offer (vegetarian, vegan, gluten-free, halal, kosher, dairy-free, nut-free)?**
  - Why it matters: Dietary questions are extremely common; confident, correct answers convert hesitant diners into bookings.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Vegetarian (extensive), vegan (6 mains), gluten-free pasta and pizza base on request
  - Follow-up question: Are any dietary options limited to certain dishes or available only with advance notice?
- **RESTAURANT-009. Do you serve alcohol, and what is your drinks offering (wine list, cocktails, beer, non-alcoholic, corkage)?**
  - Why it matters: Drinks questions affect both bookings and licensing answers; corkage policy is a frequent caller question.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: no
  - Example answer: Full bar, 30-bin wine list, cocktails until 22:30, corkage £15 per bottle by arrangement
  - Follow-up question: Do you have a minimum age policy or any restrictions on alcohol service the AI should state?
- **RESTAURANT-010. Do you offer any recurring specials, set menus, happy hours, or seasonal offerings the AI should promote?**
  - Why it matters: Lets the AI proactively upsell and answer 'do you have any deals on' which directly drives covers.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, campaign
  - Required: no
  - Example answer: 2-course lunch £18 Mon-Fri, half-price pizza Tuesdays, festive set menu in December
  - Follow-up question: Which of these would you like the AI to mention unprompted versus only when asked?

### Pricing / Packages

- **RESTAURANT-011. What is your typical price range per person for a main meal, and how should the AI phrase it?**
  - Why it matters: Callers ask 'how expensive are you'; a clear price band qualifies leads and avoids surprises at the table.
  - Expected answer type: `price`
  - Used for: ai_prompt, faq, pricing, lead_qualification
  - Required: yes
  - Example answer: Around £25-£35 per head for two courses and a drink
  - Follow-up question: Is there a discreet way you want the AI to communicate this without sounding off-putting?
- **RESTAURANT-012. What set menu or group dining packages do you offer for larger bookings, and at what per-head prices?**
  - Why it matters: Large-party callers need package details to commit; this is where high-value bookings are won or lost.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, booking, lead_qualification
  - Required: yes
  - Example answer: Group set menu: 2 courses £30pp, 3 courses £38pp, includes shared starters for 8+
  - Follow-up question: Above what party size does the set menu become mandatory rather than optional?

### Booking / Appointment Rules

- **RESTAURANT-016. What are your reservation rules: do you take bookings, walk-ins only, or both, and during which hours?**
  - Why it matters: Defines the core booking behavior; the AI must not promise a reservation if you only accept walk-ins.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Reservations for dinner; lunch is walk-in only; last booking 90 minutes before close
  - Follow-up question: Do you hold any tables back for walk-ins even during reservation hours?
- **RESTAURANT-017. What is the minimum and maximum party size the AI can book directly without staff approval?**
  - Why it matters: Large groups often need manual coordination; a clear ceiling stops the AI overcommitting on capacity.
  - Expected answer type: `number`
  - Used for: ai_prompt, booking, staff_assignment, escalation
  - Required: yes
  - Example answer: Auto-book 1-8; parties of 9+ must be passed to the manager
  - Follow-up question: Who should handle parties above that limit, and how quickly should they be contacted?
- **RESTAURANT-018. How long is a standard table held, and what are your table-turn or dining-time limits per party size?**
  - Why it matters: Time limits affect how many bookings the AI can place per slot and what it tells guests about duration.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: 2 hours for tables up to 4; 2.5 hours for 5-8; tables held 15 minutes past booking time
  - Follow-up question: After how many minutes late should the AI treat a booking as a no-show and release the table?
- **RESTAURANT-019. Do you operate a waitlist when fully booked, and how should the AI offer and manage it?**
  - Why it matters: A waitlist captures demand instead of losing it; the AI needs rules for adding and notifying waiting guests.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, follow_up, whatsapp
  - Required: no
  - Example answer: Offer waitlist when slot is full; notify by WhatsApp if a table opens, hold for 10 minutes
  - Follow-up question: How long should the AI hold a freed table for a waitlisted guest before offering it to the next?
- **RESTAURANT-020. Which seating areas or table types can be requested (window, booth, outdoor, bar, private room), and any rules?**
  - Why it matters: Seating-preference requests are frequent; the AI should know what can be promised versus offered subject to availability.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: no
  - Example answer: Indoor, heated terrace, two booths, and a private room for 10-16; terrace not guaranteed in rain
  - Follow-up question: Which seating requests can be confirmed versus only noted as a preference?

### Customer Qualification

- **RESTAURANT-021. When taking a booking, which details must the AI always collect (name, party size, date, time, contact)?**
  - Why it matters: Defines the required booking fields so no reservation is captured incomplete or unverifiable.
  - Expected answer type: `multi_select`
  - Used for: booking, lead_qualification, customer_support
  - Required: yes
  - Example answer: Name, phone number, party size, date, time, and any dietary needs
  - Follow-up question: Which single field, if missing, should block the booking from being confirmed?
- **RESTAURANT-022. Should the AI ask whether the booking is for a special occasion, and how should it use that information?**
  - Why it matters: Occasions unlock upsells (cake, decor, set menu) and let staff deliver memorable service that drives repeat visits.
  - Expected answer type: `yes_no`
  - Used for: booking, lead_qualification, campaign
  - Required: yes
  - Example answer: Yes, always ask; flag birthdays and anniversaries for the floor team
  - Follow-up question: Which occasions should trigger an upsell offer such as a celebration cake or fizz on arrival?
- **RESTAURANT-023. How should the AI handle bookings that include children, high chairs, or accessibility needs?**
  - Why it matters: Family and accessibility requirements affect table allocation and equipment; capturing them early prevents on-the-day problems.
  - Expected answer type: `long_text`
  - Used for: booking, lead_qualification, staff_assignment
  - Required: yes
  - Example answer: Ask number and ages of children, offer high chairs (3 available), note wheelchair access needs
  - Follow-up question: How many high chairs and accessible tables do you have, and should the AI confirm or just note these?

### FAQs

- **RESTAURANT-026. What are your most common customer questions, and what is the correct short answer the AI should give for each?**
  - Why it matters: A curated FAQ set lets the AI resolve the bulk of inbound contacts instantly without escalation.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Do you take walk-ins? Yes for lunch. Is there parking? NCP behind us. Dogs allowed? On the terrace.
  - Follow-up question: Which question do you get most often that you'd like the AI to answer without ever escalating?
- **RESTAURANT-027. What is your policy on dogs, children, large groups, and dress code, and how should the AI state each?**
  - Why it matters: These yes/no policy questions come up constantly and a clear answer prevents arrivals being turned away.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Dogs welcome on terrace, children welcome until 20:00, no dress code, groups of 8+ on set menu
  - Follow-up question: Are any of these policies different on busy evenings or weekends?
- **RESTAURANT-028. Do you offer gift cards or vouchers, and how can customers buy and redeem them?**
  - Why it matters: Gift-card questions are common revenue opportunities; the AI should be able to point buyers to the right channel.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, campaign
  - Required: no
  - Example answer: Gift cards available online and at the till, any value, valid 12 months, redeemable on food and drink
  - Follow-up question: Where should the AI send someone who wants to buy a gift card right now?
- **RESTAURANT-029. What are your delivery and takeaway details: areas covered, minimum order, fees, and estimated times?**
  - Why it matters: Off-premise orders need precise logistics info so the AI never promises delivery outside your zone or hours.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: no
  - Example answer: Delivery within 3 miles, £15 minimum, £2.50 fee, 30-45 minutes; takeaway ready in 20
  - Follow-up question: Which postcodes or radius defines your delivery zone, and what happens to orders just outside it?
- **RESTAURANT-030. How should the AI answer when asked about today's availability for a same-day table?**
  - Why it matters: Same-day availability is the highest-intent question; the AI needs a reliable rule to check or escalate.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: Check the booking system live; if no slot, offer the waitlist and suggest walk-in for the bar area
  - Follow-up question: If the system shows no live availability, what alternative should the AI always offer?

### Communication Channels

- **RESTAURANT-031. Which channels should the AI handle for your restaurant: voice calls, WhatsApp, SMS, email, web chat?**
  - Why it matters: Defines where the AI is active so customers are answered consistently on the channels you actually use.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, sms, email
  - Required: yes
  - Example answer: Voice calls during open hours, WhatsApp 24/7, email overnight; no SMS
  - Follow-up question: Is there a channel you'd like the AI to steer customers toward for bookings?

### Voice Call Behavior

- **RESTAURANT-032. How should the AI answer the phone, and at what point should it transfer to a human staff member?**
  - Why it matters: Phone is the primary booking channel for restaurants; the greeting and handoff rules shape every call.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Greet 'Thanks for calling The Olive Branch, how can I help?'; transfer on complaints or parties of 9+
  - Follow-up question: During service rushes, should the AI take a message instead of transferring to busy staff?

### WhatsApp / Email / SMS Behavior

- **RESTAURANT-033. What is your expected response time and tone for WhatsApp and email enquiries outside of phone hours?**
  - Why it matters: Sets customer expectations and ensures the AI's async replies match your service standards and speed.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, email, customer_support
  - Required: yes
  - Example answer: Reply on WhatsApp within 5 minutes; emails answered by 10am next morning; warm and concise
  - Follow-up question: Should overnight WhatsApp messages get an auto-acknowledgement before a full reply?
- **RESTAURANT-035. Should the AI send a written confirmation for every booking, and what details and channel should it include?**
  - Why it matters: Confirmations cut no-shows and disputes; consistent format reassures the guest the booking is real.
  - Expected answer type: `long_text`
  - Used for: booking, whatsapp, sms, email
  - Required: yes
  - Example answer: Yes, WhatsApp confirmation with name, party size, date, time, address, and cancellation policy link
  - Follow-up question: Should the confirmation include a one-tap way to amend or cancel the booking?

### Follow-up Rules

- **RESTAURANT-036. Should the AI send a booking reminder, and how far in advance and on which channel?**
  - Why it matters: Timely reminders are the single biggest lever against no-shows on reserved tables.
  - Expected answer type: `long_text`
  - Used for: follow_up, booking, whatsapp, sms
  - Required: yes
  - Example answer: WhatsApp reminder at 10am on the day of the booking with a confirm/cancel prompt
  - Follow-up question: If a guest doesn't confirm the reminder, should the AI follow up again or release the table?
- **RESTAURANT-037. After a visit, should the AI send a thank-you or review request, and when and how?**
  - Why it matters: Post-visit follow-up drives reviews and repeat bookings, directly impacting reputation and revenue.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, whatsapp, email
  - Required: no
  - Example answer: Send a WhatsApp thank-you the next morning with a Google review link for happy guests
  - Follow-up question: Should the review request only go to guests who didn't raise a complaint during the visit?

### Sales / Upsell Opportunities

- **RESTAURANT-038. Which upsells should the AI offer during booking (set menu, celebration cake, wine pairing, terrace upgrade)?**
  - Why it matters: Booking is the ideal moment to raise average spend; defined upsells increase per-cover revenue without pressure.
  - Expected answer type: `multi_select`
  - Used for: campaign, booking, ai_prompt
  - Required: no
  - Example answer: Celebration cake (£25), prosecco on arrival, chef's tasting menu for tables of 4+
  - Follow-up question: Which upsell has the best take-up, and should the AI lead with it?
- **RESTAURANT-039. Do you run loyalty, referral, or repeat-visit offers the AI should mention, and what are the terms?**
  - Why it matters: Loyalty mechanics turn one-time diners into regulars; the AI should surface them at the right moment.
  - Expected answer type: `long_text`
  - Used for: campaign, follow_up, ai_prompt
  - Required: no
  - Example answer: Loyalty stamp card: 10th main free; refer-a-friend gives both a free dessert
  - Follow-up question: Should the AI mention loyalty offers during booking, at confirmation, or in follow-up?
- **RESTAURANT-040. Should the AI run outbound campaigns (quiet-night offers, event invites, birthday messages) to past guests?**
  - Why it matters: Proactive campaigns fill slow periods and re-engage lapsed customers, but must respect consent and frequency limits.
  - Expected answer type: `long_text`
  - Used for: campaign, follow_up, compliance
  - Required: no
  - Example answer: Yes, midweek fill-up offer to opted-in guests, birthday WhatsApp with a free dessert, max 2 per month
  - Follow-up question: What is the maximum frequency of outbound marketing messages a single customer should receive?

### Complaints / Escalation

- **RESTAURANT-041. How should the AI handle a customer complaint, and at what point must it escalate to a human?**
  - Why it matters: Mishandled complaints damage reputation; clear de-escalation and handoff rules protect the relationship.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Apologise, log details, escalate any food-safety, refund, or angry complaint to the duty manager immediately
  - Follow-up question: Who is the named escalation contact for complaints during and after service hours?
- **RESTAURANT-042. What are your escalation contacts and routing rules for different issue types and times of day?**
  - Why it matters: The AI needs an unambiguous routing map so urgent issues reach the right person without delay.
  - Expected answer type: `long_text`
  - Used for: escalation, staff_assignment, customer_support
  - Required: yes
  - Example answer: Bookings -> floor manager; complaints -> GM (07700 900111); after hours -> owner voicemail
  - Follow-up question: Which issues are urgent enough to call a manager directly versus leaving a message?

### Payments / Deposits / Refunds

- **RESTAURANT-013. Do you require a deposit or card-on-file for large bookings or events, and what are the amounts and rules?**
  - Why it matters: Deposits reduce no-shows on high-value tables; the AI must quote the exact amount and collection method.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, payment, pricing
  - Required: yes
  - Example answer: £10 per head deposit for parties of 8+, taken via payment link, deducted from final bill
  - Follow-up question: At what party size or booking type does the deposit requirement kick in?
- **RESTAURANT-014. What is your deposit refund and cancellation policy, including notice periods and forfeiture rules?**
  - Why it matters: The AI must state refund terms accurately to avoid disputes and to set fair expectations on cancellations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment, escalation
  - Required: yes
  - Example answer: Full refund if cancelled 48h+ before; deposit forfeited inside 48h or for no-shows
  - Follow-up question: Who should the AI escalate to if a customer disputes a forfeited deposit?
- **RESTAURANT-015. Which payment methods do you accept, and are there any minimums, surcharges, or service charges to disclose?**
  - Why it matters: Prevents at-table friction; service charge and card-minimum questions are common and best answered upfront.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment
  - Required: no
  - Example answer: All cards, Apple/Google Pay, cash; optional 12.5% service charge on tables of 6+
  - Follow-up question: Is the service charge automatically added or discretionary, and can it be removed on request?

### Industry-Specific Rules

- **RESTAURANT-045. What special-event and private-hire rules apply (minimum spend, exclusive use, set menu, advance notice)?**
  - Why it matters: Events are high-value but rule-heavy; the AI must qualify enquiries against your minimums and lead times.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, pricing, lead_qualification
  - Required: no
  - Example answer: Private room min spend £500, exclusive hire £3,000, set menu only, 7 days notice
  - Follow-up question: Below what minimum spend should the AI decline a private-hire request outright?

### Compliance / Safety

- **RESTAURANT-043. How should the AI handle allergen questions, and what disclaimer must it give about cross-contamination?**
  - Why it matters: Allergen safety is a legal and life-safety matter; the AI must never improvise and must give the correct caution.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, customer_support, escalation
  - Required: yes
  - Example answer: State known allergens from the matrix, always add 'prepared in a kitchen handling nuts and gluten', flag severe allergies to staff
  - Follow-up question: For severe or anaphylactic allergies, should the AI require the guest to speak to the chef before confirming?
- **RESTAURANT-044. What compliance details must the AI respect (alcohol licensing hours, age verification, food hygiene rating, data handling)?**
  - Why it matters: The AI must not breach licensing or data rules; these constraints govern what it can offer and store.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt
  - Required: yes
  - Example answer: No alcohol orders after 23:00, Challenge-25 noted, 5-star hygiene, data stored per UK GDPR
  - Follow-up question: Are there any statements the AI is legally required to make that you want pre-approved?

### Customer Data Collection

- **RESTAURANT-024. What customer contact details do you want stored for marketing and re-booking, and with what consent wording?**
  - Why it matters: Building a marketing-permission database is valuable, but it must be collected with explicit consent to stay compliant.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, campaign, compliance, follow_up
  - Required: yes
  - Example answer: Name, mobile, email; opt-in line: 'Happy to receive our monthly offers? Yes/No'
  - Follow-up question: What exact opt-in phrasing should the AI use to record marketing consent?
- **RESTAURANT-025. Should the AI capture and store allergy and dietary information against a customer's profile for future visits?**
  - Why it matters: Remembering allergies improves safety and service, but the data is sensitive and must be handled carefully.
  - Expected answer type: `yes_no`
  - Used for: compliance, customer_support, staff_assignment
  - Required: yes
  - Example answer: Yes, store allergens with the booking and flag prominently to the kitchen each visit
  - Follow-up question: How long should allergy data be retained, and who is allowed to view it?

### AI Tone / Personality

- **RESTAURANT-034. What personality and tone should the AI use, and are there any words or phrases it should always or never use?**
  - Why it matters: Tone is part of your brand; the AI should sound like your venue, whether that's relaxed-friendly or refined.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp, email
  - Required: yes
  - Example answer: Warm, upbeat, local; use 'lovely' and 'pop in', never 'reservation slot' or corporate jargon
  - Follow-up question: Should the tone shift at all between a casual WhatsApp and a formal event enquiry?

### Reporting / Analytics

- **RESTAURANT-046. Which booking and enquiry metrics do you want reported, and how often?**
  - Why it matters: Reporting closes the loop so you can see covers booked, no-shows, and missed enquiries the AI handled.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics
  - Required: no
  - Example answer: Daily: bookings made, covers, no-shows, waitlist conversions; weekly summary by email
  - Follow-up question: Which single metric matters most to you for judging whether the AI is performing?
- **RESTAURANT-047. What insights about customer questions and lost enquiries would help you improve the menu or service?**
  - Why it matters: Aggregated question trends reveal gaps (e.g., frequent vegan requests) you can act on commercially.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics, campaign
  - Required: no
  - Example answer: Report top 10 unanswered questions and most-requested dietary options each month
  - Follow-up question: Should the AI flag recurring requests it couldn't fulfil so you can consider adding them?

### Automation Triggers

- **RESTAURANT-048. What events should automatically trigger an AI action (full slot -> waitlist, no-show -> follow-up, big party -> deposit link)?**
  - Why it matters: Defining triggers turns the AI from reactive to proactive, automating the repetitive operational moments.
  - Expected answer type: `long_text`
  - Used for: follow_up, booking, payment, ai_prompt
  - Required: yes
  - Example answer: Party of 8+ -> send deposit link; no-show -> log and flag; freed table -> notify waitlist
  - Follow-up question: Which trigger would save your team the most time if automated first?
- **RESTAURANT-049. Should the AI automatically pause taking bookings when you reach capacity or hit a manual stop, and how is that signalled?**
  - Why it matters: Overbooking ruins service; the AI needs a reliable signal to stop accepting tables when the floor is full.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, follow_up
  - Required: yes
  - Example answer: Stop bookings when system shows 0 tables; staff can text 'STOP DINNER' to pause manually
  - Follow-up question: What word or signal should staff use to instantly pause or resume bookings?
- **RESTAURANT-050. Should the AI send a daily booking summary or alert to staff, and at what time and on which channel?**
  - Why it matters: A pre-service briefing of covers, occasions, and allergies helps the team prepare and deliver better service.
  - Expected answer type: `long_text`
  - Used for: reporting, staff_assignment, follow_up
  - Required: no
  - Example answer: Send a WhatsApp run-sheet to the duty manager at 4pm: covers, special occasions, allergy flags
  - Follow-up question: Who should receive the daily run-sheet, and should allergy flags be highlighted separately?


## 6. Fitness Gym

### Business Identity

- **GYM-001. What is the official name of your gym as it should appear in all member communications?**
  - Why it matters: The AI must introduce the gym correctly on every call, message, and confirmation so members recognize who is contacting them.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Iron Forge Fitness
  - Follow-up question: Do you have a shorter nickname or tagline the AI should use in casual chat?
- **GYM-002. What are the full street addresses of all gym locations you operate?**
  - Why it matters: Members frequently ask for directions, parking, and which branch to visit, so the AI needs exact location data to answer reliably.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: Main: 120 King St, Downtown. Branch 2: 45 Park Ave, Westside.
  - Follow-up question: Which location should be treated as the default if a member does not specify one?
- **GYM-003. What are your gym's standard staffed opening and closing hours for each day of the week?**
  - Why it matters: Hours drive booking availability and let the AI answer 'are you open now?' without escalating to staff.
  - Expected answer type: `time_range`
  - Used for: faq, booking, ai_prompt
  - Required: yes
  - Example answer: Mon-Fri 6am-10pm, Sat-Sun 8am-8pm
  - Follow-up question: Do members with key-fob access have different 24/7 access hours than staffed hours?
- **GYM-004. What is the primary phone number and email address members should be directed to for human support?**
  - Why it matters: When the AI cannot resolve a request it must hand off to a real contact channel the gym actually monitors.
  - Expected answer type: `phone`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Phone: +1 555 0100, Email: hello@ironforge.com
  - Follow-up question: Are there separate contacts for billing versus general membership questions?
- **GYM-005. What makes your gym different from competitors nearby (e.g., 24/7 access, women-only hours, specialty equipment)?**
  - Why it matters: These differentiators are the AI's main selling points when converting prospects and answering 'why should I join here?'.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: no
  - Example answer: Olympic lifting platforms, 24/7 access, free first PT session, sauna and recovery room.
  - Follow-up question: Which single differentiator should the AI lead with for cold prospects?

### Services / Products

- **GYM-006. What group fitness classes do you offer, and what is the schedule for each?**
  - Why it matters: Class names and times are the most common booking and FAQ topic, so the AI needs the full timetable to answer and book accurately.
  - Expected answer type: `long_text`
  - Used for: booking, faq, ai_prompt
  - Required: yes
  - Example answer: Spin (Mon/Wed/Fri 7am), Yoga (Tue/Thu 6pm), HIIT (Sat 9am), Bootcamp (Mon 6pm).
  - Follow-up question: Which classes have limited spots that require advance booking versus drop-in?
- **GYM-007. Do you offer personal training, and what formats are available (1-on-1, partner, small group)?**
  - Why it matters: PT is a high-value service the AI should qualify and book, so it must know which formats exist and how they are sold.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, pricing, lead_qualification
  - Required: yes
  - Example answer: 1-on-1, partner (2 people), small group (3-5 people).
  - Follow-up question: Are PT sessions sold individually or only in packs?
- **GYM-008. What facilities and amenities are available on site (e.g., pool, sauna, showers, lockers, kids' area)?**
  - Why it matters: Amenities are a top decision factor for prospects, and the AI should describe them accurately when selling memberships.
  - Expected answer type: `multi_select_or_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Sauna, steam room, 25m pool, showers, day lockers, smoothie bar.
  - Follow-up question: Do any amenities require an extra fee or a higher membership tier?
- **GYM-009. Do you offer any additional services such as nutrition coaching, body composition scans, or physiotherapy?**
  - Why it matters: Ancillary services create upsell paths and FAQ answers the AI can offer beyond core membership.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, campaign
  - Required: no
  - Example answer: Nutrition coaching, InBody scans, sports massage.
  - Follow-up question: Are these services included in any membership tier or always paid separately?
- **GYM-010. Which specialized equipment or training zones do you want the AI to highlight (e.g., powerlifting rack area, functional turf, cardio deck)?**
  - Why it matters: Equipment-focused prospects choose gyms by gear, so the AI should be able to confirm specifics on demand.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: no
  - Example answer: 6 squat racks, deadlift platforms, sled track, full Hammer Strength line.
  - Follow-up question: Is there any equipment members commonly ask about that you do NOT have?

### Pricing / Packages

- **GYM-011. What membership tiers do you offer and what is the monthly price of each?**
  - Why it matters: Pricing is the single most asked question; the AI must quote tiers exactly to avoid lost sales or wrong expectations.
  - Expected answer type: `price`
  - Used for: pricing, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Basic $29/mo, Standard $49/mo, Premium (all-access) $79/mo.
  - Follow-up question: What exactly is included in each tier that justifies the price difference?
- **GYM-012. What are your joining fee, contract length, and any cancellation terms?**
  - Why it matters: Hidden fees and contract length cause friction and complaints, so the AI must disclose them upfront and accurately.
  - Expected answer type: `long_text`
  - Used for: pricing, faq, ai_prompt
  - Required: yes
  - Example answer: $25 joining fee, no contract month-to-month, 30-day cancellation notice.
  - Follow-up question: Is the joining fee ever waived during promotions?
- **GYM-013. What are your personal training prices per session and per package?**
  - Why it matters: PT pricing is needed for the AI to quote and close higher-ticket sales accurately.
  - Expected answer type: `price`
  - Used for: pricing, booking, ai_prompt
  - Required: yes
  - Example answer: Single $60, 10-pack $500, 20-pack $900.
  - Follow-up question: Do PT packages expire after a certain number of weeks?

### Booking / Appointment Rules

- **GYM-016. How far in advance can members book classes, and how many can they hold at once?**
  - Why it matters: These rules govern what the AI is allowed to book and prevents over-booking or hoarding of limited spots.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Up to 7 days in advance, max 3 active bookings at a time.
  - Follow-up question: Do Premium members get a longer booking window than Basic members?
- **GYM-017. What is your class cancellation and no-show policy (notice period and penalties)?**
  - Why it matters: The AI must enforce cancellation windows and warn members of penalties when they try to cancel late.
  - Expected answer type: `long_text`
  - Used for: booking, faq, ai_prompt
  - Required: yes
  - Example answer: Cancel free up to 4 hours before; late cancel or no-show = $10 fee or one class credit lost.
  - Follow-up question: How many no-shows before a member is temporarily blocked from booking?
- **GYM-018. How should free trial sessions or guest passes be booked and what limits apply?**
  - Why it matters: Trials are the main lead-conversion tool; the AI needs the booking rules to schedule them without abuse.
  - Expected answer type: `long_text`
  - Used for: booking, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: One free 1-day pass per person, must be 18+, booked at least 1 day ahead.
  - Follow-up question: Can the AI book a trial directly into the calendar, or must staff confirm it first?
- **GYM-019. What information must be collected before confirming any class or PT booking?**
  - Why it matters: Defining required fields ensures the AI never books an incomplete appointment that staff must chase.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, customer_support
  - Required: yes
  - Example answer: Full name, phone, preferred class/time, membership status.
  - Follow-up question: Is a signed waiver required before a first-time booking can be confirmed?
- **GYM-020. How should the AI handle a fully booked class — offer a waitlist, suggest alternatives, or both?**
  - Why it matters: Defines the AI's fallback behavior so a popular full class still results in a captured booking or lead.
  - Expected answer type: `single_select`
  - Used for: booking, ai_prompt, follow_up
  - Required: yes
  - Example answer: Add to waitlist and suggest the next available session of the same class.
  - Follow-up question: Should the AI auto-notify waitlisted members when a spot opens?

### Customer Qualification

- **GYM-021. What fitness goals should the AI ask prospects about to recommend the right membership or program?**
  - Why it matters: Goal-based qualification lets the AI match prospects to the right tier or PT package, raising conversion.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, ai_prompt, campaign
  - Required: yes
  - Example answer: Weight loss, muscle gain, general fitness, sport-specific, rehab/recovery.
  - Follow-up question: Which goal should be routed straight to a personal trainer consultation?
- **GYM-022. What fitness-level or experience questions should the AI ask to gauge a prospect's needs?**
  - Why it matters: Knowing if someone is a beginner versus advanced lets the AI recommend appropriate classes and avoid intimidating new members.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, ai_prompt, booking
  - Required: yes
  - Example answer: Beginner / intermediate / advanced, current weekly activity, any prior gym experience.
  - Follow-up question: Should beginners be steered toward an intro class or onboarding session first?
- **GYM-025. What budget or payment-preference questions should the AI ask to recommend the right plan?**
  - Why it matters: Surfacing budget early lets the AI propose a tier the prospect can afford instead of losing the sale on price shock.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, pricing, ai_prompt
  - Required: no
  - Example answer: Monthly budget range, preference for class access vs full gym, interest in PT add-on.
  - Follow-up question: Should the AI proactively mention any low-cost or off-peak membership to price-sensitive leads?

### FAQs

- **GYM-026. What is your guest and family policy (can members bring friends, partner add-ons, child supervision)?**
  - Why it matters: Guest and family rules are asked daily; clear answers reduce front-desk load and avoid disputes.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Premium members get 2 guest passes/month; partner add-on $20/mo; kids 12+ with adult.
  - Follow-up question: Is there an unaccompanied-minor age policy the AI should enforce?
- **GYM-027. What is your dress code and gym etiquette policy (footwear, chalk, re-racking, phone use)?**
  - Why it matters: Etiquette questions are common and consistent answers keep the floor orderly without staff intervention.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Closed-toe shoes required, chalk allowed in lifting zone only, re-rack weights, no calls on the floor.
  - Follow-up question: Are there any items banned outright that the AI should warn members about?
- **GYM-028. What parking and public-transport options are available at each location?**
  - Why it matters: Access questions are frequent for new members and visitors; accurate answers reduce friction before first visit.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Free underground parking for 2 hours; bus stop outside; bike racks at entrance.
  - Follow-up question: Is parking validated only for members or also for trial guests?
- **GYM-029. What is your policy on lost property, locker rentals, and securing belongings?**
  - Why it matters: These routine questions clog the front desk and the AI can fully resolve them with documented answers.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: no
  - Example answer: Day lockers free (bring own lock); monthly rented lockers $10; lost property held 14 days.
  - Follow-up question: Where should the AI direct members who believe an item was stolen rather than lost?
- **GYM-030. What COVID/illness, hygiene, and equipment-cleaning policies should the AI communicate?**
  - Why it matters: Hygiene expectations affect comfort and safety; documented answers keep messaging consistent and reassuring.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, compliance
  - Required: no
  - Example answer: Wipe equipment after use, sanitizer stations throughout, please stay home if symptomatic.
  - Follow-up question: Should the AI advise sick members about freezing their membership instead of attending?

### Staff / Team / Availability

- **GYM-031. Who are your personal trainers and instructors, and what are their specialties?**
  - Why it matters: The AI should match members to the right trainer by specialty and answer 'who teaches this class?'.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: no
  - Example answer: Sarah (strength, women's training), Mike (HIIT, weight loss), Priya (yoga, mobility).
  - Follow-up question: Which trainer should be the default when a member has no preference?
- **GYM-032. What are each trainer's working days and hours for booking PT sessions?**
  - Why it matters: The AI cannot schedule PT correctly without knowing trainer availability windows.
  - Expected answer type: `time_range`
  - Used for: booking, staff_assignment
  - Required: yes
  - Example answer: Mike: Mon-Fri 7am-3pm; Sarah: Tue/Thu/Sat 10am-7pm.
  - Follow-up question: Should the AI check a live calendar for availability or use these fixed windows?

### Communication Channels

- **GYM-033. Which channels should the AI receptionist operate on (voice calls, WhatsApp, SMS, email, web chat)?**
  - Why it matters: Defines where the AI is deployed and shapes tone, length, and feature expectations per channel.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: WhatsApp, voice calls, and web chat.
  - Follow-up question: Which channel is your highest-volume one that the AI should be optimized for first?

### Voice Call Behavior

- **GYM-034. How should the AI answer phone calls, and when should it transfer to a human?**
  - Why it matters: Voice greeting and transfer rules define the caller experience and prevent the AI from mishandling urgent calls.
  - Expected answer type: `long_text`
  - Used for: voice_call, escalation, ai_prompt
  - Required: yes
  - Example answer: Greet with gym name, offer booking/info; transfer to front desk for billing disputes or complaints.
  - Follow-up question: What number should calls transfer to during versus outside staffed hours?

### WhatsApp / Email / SMS Behavior

- **GYM-035. What response style and limits should the AI follow on WhatsApp and SMS (length, emojis, business hours)?**
  - Why it matters: Channel-specific style rules keep messaging on-brand and prevent the AI from sending overly long or off-tone replies.
  - Expected answer type: `long_text`
  - Used for: whatsapp, sms, ai_prompt
  - Required: no
  - Example answer: Short friendly replies, light emoji use, reply 24/7 but note staff respond 9-6 for complex issues.
  - Follow-up question: Should the AI send booking confirmations via the same channel the member contacted from?

### Follow-up Rules

- **GYM-037. How and when should the AI follow up with prospects who inquired but did not join?**
  - Why it matters: Most gym leads need nurturing; defined follow-up timing and channel directly drive conversion rate.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, lead_qualification
  - Required: yes
  - Example answer: Message 1 day after inquiry, again at 3 days with a trial offer, final nudge at 7 days.
  - Follow-up question: After how many unanswered follow-ups should the AI stop contacting a lead?
- **GYM-038. How should the AI follow up after a free trial or first PT session to encourage sign-up?**
  - Why it matters: The post-trial window is the highest-conversion moment; timely follow-up captures members before interest fades.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, ai_prompt
  - Required: yes
  - Example answer: Same-day thank-you, next-day membership offer, 3-day reminder of trial expiry.
  - Follow-up question: Should a limited-time discount be included in the post-trial follow-up?
- **GYM-039. How should the AI re-engage inactive members who have not visited recently?**
  - Why it matters: Inactivity precedes cancellation; proactive re-engagement improves retention, the core gym profitability metric.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, customer_support
  - Required: no
  - Example answer: If no visit in 14 days, send a friendly check-in and offer a free PT session or class.
  - Follow-up question: At what inactivity threshold should a member be flagged to staff for a personal call?

### Sales / Upsell Opportunities

- **GYM-040. What upsell and cross-sell offers should the AI present, and to whom?**
  - Why it matters: Defining upsell triggers turns routine interactions into revenue (PT, supplements, tier upgrades) without being spammy.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Offer PT to new joiners, tier upgrade to frequent class users, supplements at checkout.
  - Follow-up question: Which upsell should the AI never offer to a member who recently complained or canceled?
- **GYM-041. What referral program do you run, and how should the AI promote it?**
  - Why it matters: Referrals are a low-cost acquisition channel; the AI can drive them if it knows the incentive and mechanics.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, follow_up
  - Required: no
  - Example answer: Refer a friend: both get one month free when the friend joins on a 6-month plan.
  - Follow-up question: When in the member journey should the AI proactively mention the referral offer?

### Complaints / Escalation

- **GYM-042. What types of complaints should the AI handle directly versus escalate immediately to a human?**
  - Why it matters: Clear escalation rules prevent the AI from mishandling sensitive issues like injuries, billing disputes, or harassment.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Handle: hours, lost property. Escalate: injuries, billing disputes, staff conduct, safety incidents.
  - Follow-up question: Who is the named escalation contact and what is the expected response time?
- **GYM-043. How should the AI respond to an angry or frustrated member before escalating?**
  - Why it matters: A calm, on-brand de-escalation script protects reputation and buys time until a human can take over.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: no
  - Example answer: Apologize, acknowledge the issue, assure a manager will follow up within 2 hours, capture details.
  - Follow-up question: Should the AI offer any goodwill gesture (e.g., a free day pass) during de-escalation, or leave that to staff?

### Payments / Deposits / Refunds

- **GYM-014. What is your membership freeze (hold) policy, including allowed duration and any fee?**
  - Why it matters: Freeze requests are extremely common (travel, injury), and the AI must apply the exact policy to avoid disputes.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: Up to 3 months per year, $5/month hold fee, requires 7 days notice.
  - Follow-up question: Can a member freeze for medical reasons without the hold fee if they provide a doctor's note?
- **GYM-015. What is your refund policy for memberships, PT packages, and class bookings?**
  - Why it matters: Refund expectations drive complaints; the AI needs the exact rule set to respond consistently and route refunds correctly.
  - Expected answer type: `long_text`
  - Used for: payment, faq, escalation
  - Required: yes
  - Example answer: No membership refunds after 14-day cooling-off; unused PT packs refundable minus 10% admin fee.
  - Follow-up question: Should all refund requests be escalated to a human, or can the AI confirm policy and start the process?

### Compliance / Safety

- **GYM-044. What health screening or PAR-Q waiver must members complete before training, and when?**
  - Why it matters: Health waivers are a legal and safety requirement; the AI must ensure they are completed before any first session.
  - Expected answer type: `long_text`
  - Used for: compliance, booking, ai_prompt
  - Required: yes
  - Example answer: All members complete a PAR-Q and liability waiver before first workout; sent as a digital form on sign-up.
  - Follow-up question: Should the AI block a first booking until the waiver is confirmed signed?
- **GYM-045. How should the AI handle medical, injury, or emergency situations raised in conversation?**
  - Why it matters: The AI must never give medical advice and must escalate emergencies safely; getting this wrong creates serious liability.
  - Expected answer type: `long_text`
  - Used for: compliance, escalation, ai_prompt
  - Required: yes
  - Example answer: Never give medical advice; for emergencies advise calling 911; flag injuries to staff and recommend a doctor.
  - Follow-up question: Is there a minimum age or any condition (e.g., pregnancy) that requires medical clearance before joining?

### Customer Data Collection

- **GYM-023. What contact and personal details must the AI collect from a new lead?**
  - Why it matters: Standardizing captured fields ensures every lead is usable for follow-up and CRM entry.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, follow_up, analytics
  - Required: yes
  - Example answer: Name, mobile number, email, preferred location, how they heard about us.
  - Follow-up question: Is date of birth required to confirm the member meets the minimum age?
- **GYM-024. Should the AI ask about health conditions or injuries during qualification, and how should that data be handled?**
  - Why it matters: Health info informs trainer assignment and safety but is sensitive data requiring careful collection and storage.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, compliance, staff_assignment
  - Required: yes
  - Example answer: Ask only about conditions affecting exercise; flag for trainer; never store beyond what is needed.
  - Follow-up question: Should any flagged health condition automatically require a PAR-Q form before booking?

### AI Tone / Personality

- **GYM-036. What personality and tone should the AI receptionist have (motivational, professional, casual, energetic)?**
  - Why it matters: Tone defines the brand voice across every interaction and must match the gym's culture to feel authentic.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Energetic and motivational but never pushy.
  - Follow-up question: Are there any words, slang, or phrases you want the AI to always use or always avoid?

### Reporting / Analytics

- **GYM-046. What metrics do you want the AI to report on (leads captured, trials booked, conversions, common questions)?**
  - Why it matters: Defining KPIs ensures the AI logs the right data so you can measure its impact on membership growth.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, campaign
  - Required: no
  - Example answer: Leads/week, trials booked, trial-to-member conversion, top 5 FAQs, no-show rate.
  - Follow-up question: How often and to whom should these reports be delivered?
- **GYM-047. Which recurring member questions or pain points do you most want tracked to improve the gym?**
  - Why it matters: Trend data from conversations reveals what to fix (e.g., busy hours, missing equipment) before it drives cancellations.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: no
  - Example answer: Track complaints about peak-hour crowding, broken equipment reports, and class-availability requests.
  - Follow-up question: Should the AI alert you in real time when a specific issue spikes (e.g., repeated equipment faults)?

### Automation Triggers

- **GYM-048. What automated messages should fire on booking events (confirmation, reminder, cancellation)?**
  - Why it matters: Automated booking lifecycle messages cut no-shows and front-desk load; the AI needs the exact triggers and timing.
  - Expected answer type: `long_text`
  - Used for: booking, follow_up, whatsapp
  - Required: yes
  - Example answer: Confirm instantly, remind 2 hours before, notify on cancellation with rebook link.
  - Follow-up question: How long before a class should the reminder be sent for each channel?
- **GYM-049. What member-lifecycle events should trigger automated outreach (sign-up welcome, renewal due, payment failed, birthday)?**
  - Why it matters: Lifecycle automations drive retention and recover failed payments without manual staff effort.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, campaign, payment
  - Required: no
  - Example answer: Welcome on day 1, renewal reminder 5 days before, failed-payment retry message, birthday discount.
  - Follow-up question: For failed payments, how many automated reminders before the issue is escalated to staff?
- **GYM-050. What seasonal or promotional campaigns should the AI run automatically (New Year, summer-body, off-peak offers)?**
  - Why it matters: Time-based campaigns capture predictable demand spikes; pre-defining them lets the AI launch them without manual setup.
  - Expected answer type: `long_text`
  - Used for: campaign, follow_up, ai_prompt
  - Required: no
  - Example answer: January New-Year join offer, May summer-prep PT bundle, August off-peak student discount.
  - Follow-up question: Which audience segment should each seasonal campaign target (new leads, lapsed members, existing members)?


## 7. Auto Repair Workshop

### Business Identity

- **AUTO-001. What is the full registered name of your auto repair workshop as it should appear in customer messages and invoices?**
  - Why it matters: The AI must introduce the business correctly on calls and in chats, and the name appears on quotes and confirmations.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: Greenline Auto Repair Ltd
  - Follow-up question: Do you trade under any other name or brand customers might recognise?
- **AUTO-002. What is the full street address of your workshop, including any access or parking notes for drop-offs?**
  - Why it matters: The AI needs to give accurate directions and drop-off instructions to customers booking a repair.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: yes
  - Example answer: Unit 4, Riverside Industrial Estate, Leeds LS10 1AB. Customer parking at the rear, enter via Dock Street.
  - Follow-up question: Is there a separate key-drop or after-hours drop-off point?
- **AUTO-004. What is your main public phone number and the email address customers should use for enquiries?**
  - Why it matters: The AI shares these contact details and routes overflow or complex cases to the right channel.
  - Expected answer type: `phone`
  - Used for: ai_prompt, customer_support, escalation
  - Required: yes
  - Example answer: Phone 0113 555 0199, email bookings@greenlineauto.co.uk
  - Follow-up question: Should the AI ever share a direct mobile number for urgent cases?
- **AUTO-005. What accreditations, approvals or trade memberships do you hold (e.g. DVSA MOT centre, manufacturer-approved, Good Garage Scheme)?**
  - Why it matters: Mentioning accreditations builds trust and answers customer credibility questions accurately.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: DVSA-approved MOT centre, RAC Approved Garage, and BMW-trained technicians.
  - Follow-up question: Are any of these specific to certain vehicle makes only?

### Services / Products

- **AUTO-006. Which core repair and maintenance services do you offer (e.g. brakes, clutch, suspension, timing belt, exhaust)?**
  - Why it matters: The AI must know your service catalogue to answer enquiries and only book jobs you can actually perform.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Brakes, clutches, suspension, timing belts, exhausts, batteries, and general servicing.
  - Follow-up question: Are there any common repairs you do NOT handle and should refer out?
- **AUTO-007. Do you offer MOT testing, and if so for which vehicle classes (e.g. Class 4 cars, Class 7 vans)?**
  - Why it matters: MOT eligibility by class determines whether the AI can book an MOT for a given vehicle.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, ai_prompt, faq
  - Required: yes
  - Example answer: Yes, Class 4 (cars and small vans) and Class 7 (vans up to 3,500kg).
  - Follow-up question: Do you offer free or discounted retests after a failed MOT?
- **AUTO-008. What diagnostic services do you provide and what equipment do you use (e.g. OBD scan, manufacturer diagnostics, electrical fault-finding)?**
  - Why it matters: Diagnostics are often the first booked job; the AI must describe what's involved and set expectations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: Full OBD2 scan, manufacturer-level diagnostics for VAG and BMW, and electrical fault-finding for intermittent issues.
  - Follow-up question: How long does a typical diagnostic appointment take?
- **AUTO-009. Which servicing packages do you offer (e.g. interim, full, major service) and what is included in each?**
  - Why it matters: The AI must explain service tiers so customers choose the right one and book the correct slot length.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: Interim (oil and filter, 15-point check), Full (interim plus air/fuel filters and fluids), Major (full plus spark plugs and brake fluid).
  - Follow-up question: Do you follow manufacturer service schedules to preserve the warranty?
- **AUTO-010. Do you offer any specialist or value-add services (e.g. air-con regas, EV/hybrid servicing, tyres, wheel alignment, recovery)?**
  - Why it matters: Specialist services are upsell and differentiation points the AI should surface when relevant.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, campaign
  - Required: no
  - Example answer: Air-con regas, EV/hybrid servicing (we are IMI-qualified), tyre fitting, four-wheel alignment, and local recovery.
  - Follow-up question: Are any of these seasonal services you want promoted at certain times of year?

### Pricing / Packages

- **AUTO-011. What are your standard prices or price ranges for your most common services (MOT, interim/full service, brake replacement)?**
  - Why it matters: The AI needs reliable price guidance to quote confidently and avoid over- or under-promising.
  - Expected answer type: `price`
  - Used for: pricing, ai_prompt, faq
  - Required: yes
  - Example answer: MOT £45, interim service £119, full service £189, front brake pads from £150.
  - Follow-up question: Should the AI quote fixed prices or 'from' prices subject to inspection?
- **AUTO-012. What is your diagnostic fee, and is it waived or deducted if the customer proceeds with the repair?**
  - Why it matters: Diagnostic-fee policy is a frequent question; the AI must state it accurately to set expectations.
  - Expected answer type: `price`
  - Used for: pricing, faq, ai_prompt
  - Required: yes
  - Example answer: £59 diagnostic fee, fully deducted from the repair cost if you go ahead with us.
  - Follow-up question: Does the diagnostic fee differ for complex electrical faults?
- **AUTO-013. What is your labour rate per hour, and does it vary by job type or vehicle make?**
  - Why it matters: Labour rate underpins estimates; the AI uses it to give credible ballpark figures.
  - Expected answer type: `price`
  - Used for: pricing, ai_prompt, faq
  - Required: yes
  - Example answer: £75 per hour standard, £95 per hour for prestige and EV work.
  - Follow-up question: Do you charge in full-hour or half-hour increments?
- **AUTO-015. How do you handle estimates and customer approval before carrying out additional work discovered during a job?**
  - Why it matters: Authorisation-before-work is a core auto-repair rule; the AI must promise the customer is contacted before extra cost.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: We always call or message with a written estimate and never carry out extra work without explicit approval.
  - Follow-up question: What is your policy if the customer cannot be reached to approve urgent additional work?

### Booking / Appointment Rules

- **AUTO-016. How many vehicles can you take in per day, and how many ramps/bays do you run simultaneously?**
  - Why it matters: Capacity limits stop the AI from overbooking the workshop on any given day.
  - Expected answer type: `number`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: Up to 12 vehicles per day across 4 ramps.
  - Follow-up question: Are certain bays reserved for MOTs or longer jobs only?
- **AUTO-017. What are your drop-off and collection rules (drop-off window, courtesy car availability, while-you-wait jobs)?**
  - Why it matters: The AI must explain the logistics of leaving and collecting a vehicle when confirming a booking.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, customer_support
  - Required: yes
  - Example answer: Drop off 8:00-9:00, collect by 17:30. Courtesy cars by prior arrangement; MOTs can be while-you-wait.
  - Follow-up question: Is a courtesy car free or chargeable, and is a deposit required for it?
- **AUTO-018. How much lead time do you need for different job types (same-day MOT vs. clutch replacement needing parts ordered)?**
  - Why it matters: Lead-time rules let the AI offer realistic dates rather than promising slots you cannot meet.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: MOT/diagnostics often same or next day; clutches and timing belts usually need 2-3 days to order parts.
  - Follow-up question: Do you keep emergency slots open each day for urgent breakdowns?
- **AUTO-019. What is your cancellation and no-show policy, including how much notice you require?**
  - Why it matters: The AI must communicate cancellation terms and can enforce them when rescheduling.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, customer_support
  - Required: yes
  - Example answer: Please give 24 hours notice; missed appointments with ordered parts may incur a restocking fee.
  - Follow-up question: Should the AI send an automated reminder the day before to reduce no-shows?
- **AUTO-020. How long should the AI allocate per job type when scheduling (MOT, full service, brakes, diagnostics)?**
  - Why it matters: Accurate slot durations prevent scheduling clashes and keep the workshop running on time.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: MOT 45 min, full service 2.5 hrs, brakes 1.5 hrs, diagnostics 1 hr.
  - Follow-up question: Should the AI add buffer time between jobs for write-ups and road tests?

### Customer Qualification

- **AUTO-021. What vehicle details must the AI collect before booking (registration, make, model, year, mileage, fuel/EV type)?**
  - Why it matters: Accurate vehicle data lets the workshop prepare parts and assign the right technician and bay.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, booking, customer_support
  - Required: yes
  - Example answer: Registration plate, make, model, year, approximate mileage, and fuel type (petrol/diesel/hybrid/EV).
  - Follow-up question: Should the AI use the registration to auto-look-up make and model where possible?
- **AUTO-022. What questions should the AI ask to understand the reported fault (symptoms, warning lights, noises, when it occurs)?**
  - Why it matters: A structured symptom triage helps the workshop diagnose faster and quote more accurately.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, customer_support
  - Required: yes
  - Example answer: Ask what the symptom is, any dashboard lights, noises, when it happens (cold start, braking, turning), and whether it's drivable.
  - Follow-up question: Should the AI ask the customer to send a photo or video of the warning light or issue?
- **AUTO-024. How should the AI determine whether a job is urgent/safety-critical vs. routine (e.g. brakes failing, no MOT, warning light)?**
  - Why it matters: Urgency triage ensures unsafe vehicles are prioritised or advised not to be driven.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, escalation, ai_prompt
  - Required: yes
  - Example answer: Brake failure, steering issues, or smoke are urgent; advise not to drive and offer same-day or recovery. Service reminders are routine.
  - Follow-up question: What should the AI advise if a customer reports an unsafe-to-drive vehicle?

### FAQs

- **AUTO-026. Do you provide a warranty or guarantee on parts and labour, and for how long?**
  - Why it matters: Warranty terms are a top customer question the AI must answer precisely.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: 12 months or 12,000 miles on parts and labour; longer on manufacturer parts where applicable.
  - Follow-up question: Does the warranty cover customer-supplied parts?
- **AUTO-027. Will fitting customer-supplied parts be allowed, and how does that affect warranty or pricing?**
  - Why it matters: Customer-supplied-parts policy is a recurring enquiry and affects liability and quotes.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, pricing
  - Required: no
  - Example answer: We can fit customer parts but cannot warranty the part itself, only our labour.
  - Follow-up question: Are there part types you refuse to fit if supplied by the customer?
- **AUTO-028. Which vehicle makes or types do you specialise in or, conversely, not work on (e.g. HGVs, classic cars, certain EVs)?**
  - Why it matters: The AI must avoid booking vehicles you cannot service and highlight your specialisms.
  - Expected answer type: `long_text`
  - Used for: faq, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: All mainstream cars and light vans; we specialise in German makes. We do not handle HGVs or motorcycles.
  - Follow-up question: Should the AI refer unsupported vehicles to a partner garage?
- **AUTO-029. What payment methods do you accept, and do you offer finance or 'pay later' options on larger repairs?**
  - Why it matters: Payment-options answers are common and influence whether a customer commits to a big job.
  - Expected answer type: `multi_select_or_text`
  - Used for: faq, payment, ai_prompt
  - Required: yes
  - Example answer: Cash, all major cards, bank transfer, and Bumper interest-free service finance over 4 months.
  - Follow-up question: Is there a minimum spend to qualify for finance?
- **AUTO-030. Do you offer collection and delivery of the vehicle, courtesy cars, or a local lift, and at what cost?**
  - Why it matters: Mobility options are decisive for many customers and the AI should offer them when relevant.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, booking
  - Required: no
  - Example answer: Free collection/delivery within 5 miles, courtesy cars subject to availability, otherwise a lift to the station.
  - Follow-up question: Does the customer need to be a named driver or provide insurance details for a courtesy car?

### Staff / Team / Availability

- **AUTO-003. What are your workshop's opening hours for each day of the week, including any reduced bank-holiday hours?**
  - Why it matters: The AI uses opening hours to offer valid booking slots and to tell callers when the workshop is open.
  - Expected answer type: `time_range`
  - Used for: booking, ai_prompt, voice_call
  - Required: yes
  - Example answer: Mon-Fri 8:00-17:30, Sat 8:00-13:00, Sun closed.
  - Follow-up question: Do you accept vehicle drop-offs outside these hours?

### Communication Channels

- **AUTO-031. Which channels should the AI receptionist handle (voice calls, WhatsApp, SMS, email, website chat) and what is the priority order?**
  - Why it matters: Defines where the AI operates and which channel to default to for confirmations and follow-ups.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: Voice calls and WhatsApp primary; SMS for reminders; email for quotes and invoices.
  - Follow-up question: If a customer starts on voice, should follow-ups move to WhatsApp automatically?
- **AUTO-035. What is your expected response time on each channel, and should the AI set an out-of-hours auto-reply?**
  - Why it matters: Response-time expectations and out-of-hours messaging keep customers informed when staff are unavailable.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, customer_support
  - Required: yes
  - Example answer: Reply within 15 minutes during opening hours; out-of-hours auto-reply promising a callback next working morning.
  - Follow-up question: Should urgent/breakdown messages out-of-hours trigger an emergency contact path?

### Voice Call Behavior

- **AUTO-032. How should the AI handle phone calls (greeting script, when to take a message, when to transfer to a human)?**
  - Why it matters: Sets the voice persona and the rules for live escalation so callers are handled professionally.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Greet with the business name, offer to book or quote, take a message if asked, and transfer urgent or complaint calls to the foreman.
  - Follow-up question: What hours is a human available for live transfer versus message-taking?

### WhatsApp / Email / SMS Behavior

- **AUTO-033. How should the AI use WhatsApp/SMS/email for quotes, photos of faults, approvals, and invoices?**
  - Why it matters: Defines channel-specific behaviour so quotes and approvals flow cleanly and are recorded.
  - Expected answer type: `long_text`
  - Used for: whatsapp, email, sms
  - Required: yes
  - Example answer: Send written estimates on WhatsApp, accept fault photos there, request approval replies, and email formal invoices.
  - Follow-up question: Should photo approvals require a typed 'yes' or is a thumbs-up reaction enough?

### Follow-up Rules

- **AUTO-036. How and when should the AI send MOT and service reminders before they fall due?**
  - Why it matters: Reminders drive repeat bookings and are a core retention tool for a workshop.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, whatsapp
  - Required: yes
  - Example answer: MOT reminder 4 weeks and 1 week before expiry; service reminder at 11 months or mileage-based.
  - Follow-up question: Should reminders include a one-tap link to book the slot directly?
- **AUTO-037. After a quote or diagnostic with no booking, how many follow-ups should the AI send and over what timeframe?**
  - Why it matters: Structured quote follow-up recovers lost jobs without annoying the customer.
  - Expected answer type: `long_text`
  - Used for: follow_up, lead_qualification, campaign
  - Required: yes
  - Example answer: Follow up at 24 hours and 3 days, then stop unless the customer replies.
  - Follow-up question: Should the follow-up include a limited-time discount to prompt a decision?
- **AUTO-038. After a completed repair, should the AI request a review or send a satisfaction check, and on which channel?**
  - Why it matters: Post-service follow-up builds reviews and catches dissatisfaction before it becomes a public complaint.
  - Expected answer type: `long_text`
  - Used for: follow_up, customer_support, analytics
  - Required: no
  - Example answer: Send a WhatsApp thank-you next day with a Google review link if they were happy.
  - Follow-up question: Should an unhappy reply route to a human before any review request is sent?

### Sales / Upsell Opportunities

- **AUTO-039. Which upsells or add-ons should the AI proactively suggest (e.g. air-con regas at service, brake fluid, wiper blades, tyre check)?**
  - Why it matters: Relevant upsells raise average job value when offered at the right moment in the conversation.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: At service: air-con regas, brake fluid change, wipers, and a free tyre/health check.
  - Follow-up question: Should upsells only be offered if the customer's vehicle is actually due for them?
- **AUTO-040. Do you run seasonal campaigns or offers (winter checks, summer air-con, MOT-month discounts) the AI should promote?**
  - Why it matters: The AI can drive bookings by surfacing current promotions to the right customers at the right time.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, follow_up
  - Required: no
  - Example answer: Winter battery and antifreeze check in November, air-con regas offer in spring, October MOT discount.
  - Follow-up question: Should these campaigns target only customers whose history matches the offer?

### Complaints / Escalation

- **AUTO-041. How should the AI handle complaints (comeback faults, disputed charges, delayed work) and when must it escalate to a human?**
  - Why it matters: Clear escalation rules prevent the AI from mishandling sensitive disputes and protect your reputation.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Acknowledge, apologise, log details, and escalate any comeback fault or charge dispute to the manager within the hour.
  - Follow-up question: Who is the named escalation contact and what is their notification channel?
- **AUTO-042. Under what circumstances must the AI NOT attempt to answer and always hand off to a human (e.g. legal/insurance disputes, accident damage, warranty claims)?**
  - Why it matters: Hard hand-off rules keep the AI within safe boundaries on high-risk topics.
  - Expected answer type: `long_text`
  - Used for: escalation, compliance, ai_prompt
  - Required: yes
  - Example answer: Insurance/accident claims, legal threats, injury claims, and warranty disputes must always go to a human.
  - Follow-up question: Should the AI capture key details first or transfer immediately on these topics?

### Payments / Deposits / Refunds

- **AUTO-014. Do you require a deposit before starting work, and if so when and how much (e.g. for parts ordering or large jobs)?**
  - Why it matters: Deposit rules tell the AI when to collect payment and how to phrase commitment to a booking.
  - Expected answer type: `long_text`
  - Used for: payment, booking, ai_prompt
  - Required: yes
  - Example answer: No deposit for standard jobs; 50% deposit for special-order parts over £300.
  - Follow-up question: Is the deposit refundable if the customer cancels before parts are ordered?
- **AUTO-045. What is your refund and goodwill policy for unsatisfactory work or cancelled jobs after parts are ordered?**
  - Why it matters: The AI must state refund terms accurately and know when refunds require human authorisation.
  - Expected answer type: `long_text`
  - Used for: payment, customer_support, escalation
  - Required: yes
  - Example answer: Comeback faults rectified free; refunds for parts only if unopened; all refunds approved by the manager.
  - Follow-up question: Is there a restocking fee on returned special-order parts?

### Industry-Specific Rules

- **AUTO-046. What rules govern MOT failures and advisories (retest window, repair-before-retest, free vs. paid retest, fail-the-car-can't-be-driven scenarios)?**
  - Why it matters: MOT-specific rules are heavily regulated and the AI must guide customers correctly through failures and retests.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: Free retest if returned within 10 working days; a dangerous-fail vehicle must not be driven until repaired.
  - Follow-up question: Should the AI automatically book the retest when booking the repair after a fail?

### Compliance / Safety

- **AUTO-043. What safety advice or disclaimers must the AI give when a customer describes an unsafe vehicle (brakes, steering, tyres, overheating)?**
  - Why it matters: Giving correct safety guidance protects the customer and limits the workshop's liability.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, customer_support
  - Required: yes
  - Example answer: Advise not to drive a vehicle with failed brakes or steering and to arrange recovery rather than risk it.
  - Follow-up question: Should the AI offer or arrange recovery automatically for unsafe-to-drive vehicles?
- **AUTO-044. What data-protection and consent rules must the AI follow when storing vehicle, contact and payment data (GDPR, retention, deletion requests)?**
  - Why it matters: Compliant data handling is legally required and the AI must honour consent and deletion requests.
  - Expected answer type: `long_text`
  - Used for: compliance, customer_support, ai_prompt
  - Required: yes
  - Example answer: Collect only what's needed, store securely, honour opt-outs and deletion requests, and never share data with third parties without consent.
  - Follow-up question: Who handles data-deletion or subject-access requests, and how should the AI route them?

### Customer Data Collection

- **AUTO-023. What customer contact and consent details must be captured (name, mobile, email, preferred contact method, marketing consent)?**
  - Why it matters: These fields feed bookings, reminders and follow-ups while respecting consent requirements.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, compliance, follow_up
  - Required: yes
  - Example answer: Full name, mobile, email, preferred channel, and explicit opt-in for service reminders and offers.
  - Follow-up question: Should marketing consent be a separate opt-in from booking-related messages?
- **AUTO-025. Should the AI keep a vehicle service history per registration, and what should it record after each visit?**
  - Why it matters: A retained history powers accurate reminders, repeat-customer recognition and upsell relevance.
  - Expected answer type: `long_text`
  - Used for: customer_support, follow_up, analytics
  - Required: no
  - Example answer: Yes, store reg, work done, mileage, date, and next service/MOT due date.
  - Follow-up question: How long should service history be retained before deletion under data-retention rules?

### AI Tone / Personality

- **AUTO-034. What tone and personality should the AI use (e.g. friendly and plain-English, avoiding jargon, reassuring on cost)?**
  - Why it matters: Tone shapes every reply and must match how your customers expect to be spoken to about car trouble.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Friendly, honest, jargon-free, reassuring about cost, and never pushy.
  - Follow-up question: Should the AI explain repairs in simple terms by default or assume some mechanical knowledge?

### Reporting / Analytics

- **AUTO-047. Which metrics should the AI track and report to you (bookings, conversion rate, missed calls, no-shows, average job value, channel split)?**
  - Why it matters: Defining the KPIs ensures the receptionist reports the numbers you actually use to run the workshop.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: yes
  - Example answer: Daily bookings, quote-to-booking conversion, missed calls, no-shows, average job value, and channel breakdown.
  - Follow-up question: How often and via which channel should the AI send the summary report?
- **AUTO-048. Should the AI flag trends or alerts (rising no-shows, unbooked quotes piling up, repeat comeback faults on a make)?**
  - Why it matters: Proactive alerts help you act on problems early rather than discovering them in monthly figures.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics, escalation
  - Required: no
  - Example answer: Alert me if no-shows exceed 3 in a week or if more than 5 quotes go unbooked.
  - Follow-up question: What thresholds should trigger an immediate alert versus a weekly summary note?

### Automation Triggers

- **AUTO-049. Which events should automatically trigger an AI action (new booking -> confirmation, parts arrived -> notify customer, job done -> invoice and collection message)?**
  - Why it matters: Defining triggers turns the AI from reactive to proactive across the repair lifecycle.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, whatsapp, booking
  - Required: yes
  - Example answer: Booking confirmed -> WhatsApp confirmation; parts arrived -> notify; job complete -> send invoice and 'ready for collection' message.
  - Follow-up question: Should the 'ready for collection' message include the final total and payment link?
- **AUTO-050. What conditions should automatically escalate or pause AI automation (no reply to approval, payment failed, customer asks for a human)?**
  - Why it matters: Safe stop/escalate conditions prevent the AI from continuing autonomously when human attention is needed.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, follow_up
  - Required: yes
  - Example answer: Pause and alert staff if approval isn't received within 2 hours, payment fails, or the customer asks to speak to someone.
  - Follow-up question: Should the AI keep the customer informed while waiting for a human to take over?


## 8. Law Firm

### Business Identity

- **LAW-001. What is the full registered name of your law firm as it should appear in all communications?**
  - Why it matters: The AI receptionist must introduce the firm correctly and consistently on every channel to maintain professionalism and trust.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, whatsapp, email, voice_call
  - Required: yes
  - Example answer: Hartwell & Associates Solicitors LLP
  - Follow-up question: Is there a shorter trading or brand name clients commonly use that we should also recognize?
- **LAW-002. What are your office locations and the main address clients should be directed to?**
  - Why it matters: Clients frequently ask where to attend in-person consultations or send documents; the AI needs accurate location details to answer.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, voice_call
  - Required: yes
  - Example answer: Main office: 12 King Street, Manchester M2 6AG. Satellite office: 4 Bridge Road, Leeds LS1 4DY.
  - Follow-up question: Do you offer in-person meetings at all locations, or are some appointment-only?
- **LAW-003. What are your firm's standard office hours and the time zone you operate in?**
  - Why it matters: The AI must set expectations on response times and only book consultations within available hours.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Monday to Friday, 9:00 AM to 5:30 PM GMT; closed weekends and public holidays.
  - Follow-up question: Are there any days with extended or reduced hours, such as late evenings or Saturday mornings?
- **LAW-004. What is your firm's regulatory authorisation and registration details (e.g. SRA / Bar registration number)?**
  - Why it matters: Prospective clients and the AI may need to confirm the firm is properly regulated, and these details are often legally required on communications.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq, compliance
  - Required: yes
  - Example answer: Regulated by the Solicitors Regulation Authority, SRA No. 556231.
  - Follow-up question: Should this regulatory information be included automatically in email signatures or footers?
- **LAW-005. What is your firm's main phone number, general email address, and website URL?**
  - Why it matters: The AI needs verified contact points to share with clients and to direct enquiries that fall outside its scope.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, email, voice_call
  - Required: yes
  - Example answer: Phone: +44 161 555 0199; Email: enquiries@hartwell-law.co.uk; Website: https://www.hartwell-law.co.uk
  - Follow-up question: Is there a separate direct line or inbox for existing clients versus new enquiries?

### Services / Products

- **LAW-006. Which practice areas does your firm handle (e.g. family, conveyancing, personal injury, commercial, immigration)?**
  - Why it matters: The AI must know what work the firm accepts so it routes enquiries correctly and declines matters outside scope.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq, staff_assignment
  - Required: yes
  - Example answer: Family law, residential conveyancing, wills and probate, employment law, and commercial litigation.
  - Follow-up question: Which of these practice areas is the firm most actively trying to grow right now?
- **LAW-007. Are there any matter types or practice areas you explicitly do NOT take on?**
  - Why it matters: The AI must avoid booking consultations or raising expectations for work the firm cannot handle, and politely refer those enquiries elsewhere.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, escalation
  - Required: yes
  - Example answer: We do not handle criminal defence, legal aid matters, or class-action claims.
  - Follow-up question: When you can't take a matter, do you want the AI to refer the client to a specific partner firm or directory?
- **LAW-008. For each main practice area, what specific services or matter types fall within it?**
  - Why it matters: Detailed service breakdowns let the AI capture the right matter category and ask relevant intake questions.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, faq, staff_assignment
  - Required: yes
  - Example answer: Family: divorce, child arrangements, financial settlements, prenuptial agreements. Conveyancing: purchase, sale, remortgage, transfer of equity.
  - Follow-up question: Are there any niche or high-value services within these areas you want highlighted to prospective clients?
- **LAW-009. Do you offer any fixed-scope or productised legal services (e.g. fixed-fee will, standard tenancy review)?**
  - Why it matters: Productised services can be explained and sometimes booked directly by the AI without lawyer involvement, improving conversion.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq, booking
  - Required: no
  - Example answer: Yes: fixed-fee single will, lasting power of attorney package, and a standard employment contract review.
  - Follow-up question: For these fixed services, can the AI proceed to booking directly, or must a lawyer approve first?
- **LAW-010. Do you provide services in languages other than English, and which ones?**
  - Why it matters: The AI can reassure non-English-speaking clients and route them to the right fee earner if multilingual support exists.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, staff_assignment
  - Required: no
  - Example answer: Yes: Urdu, Polish, and French through specific fee earners.
  - Follow-up question: Which lawyers handle each language, so the AI can route those enquiries appropriately?

### Pricing / Packages

- **LAW-011. Do you charge for the initial consultation, and if so how much?**
  - Why it matters: This is one of the most common first questions; the AI must answer accurately to avoid disputes and set expectations.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, faq, booking
  - Required: yes
  - Example answer: First 30-minute consultation is free; extended consultations are charged at £120 + VAT.
  - Follow-up question: Does the free or paid consultation policy differ by practice area?
- **LAW-012. What are your standard hourly rates by fee earner level (partner, associate, paralegal)?**
  - Why it matters: Clients often ask about costs upfront; the AI can share ranges while making clear final fees depend on the matter.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: no
  - Example answer: Partner £350/hr, Senior Associate £275/hr, Associate £220/hr, Paralegal £140/hr, all plus VAT.
  - Follow-up question: Should the AI quote exact rates, or only say 'rates start from X, confirmed after a consultation'?
- **LAW-013. Which matter types do you offer on a fixed-fee or capped-fee basis, and what are those prices?**
  - Why it matters: Fixed pricing is a strong conversion driver; the AI should communicate it clearly where it applies.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq, lead_qualification
  - Required: no
  - Example answer: Single will £180, mirror wills £300, uncontested divorce from £750 + court fee, freehold purchase from £950 + disbursements.
  - Follow-up question: Do these fixed fees exclude disbursements or third-party costs the AI should mention?
- **LAW-014. Do you take on any matters on a no-win-no-fee or conditional fee basis, and under what conditions?**
  - Why it matters: Personal injury and certain claims clients specifically seek this; the AI must describe it accurately without overpromising.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq, lead_qualification
  - Required: no
  - Example answer: Yes, for personal injury and employment claims, subject to merits assessment and a success fee of up to 25% of damages.
  - Follow-up question: What basic criteria must a claim meet before the AI describes no-win-no-fee as potentially available?
- **LAW-015. How do you typically handle retainers or upfront payments on account of costs?**
  - Why it matters: The AI needs to set expectations that some matters require money on account before work begins.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq, payment
  - Required: no
  - Example answer: Most ongoing matters require £1,000-£2,500 on account before work starts, held in our client account and offset against invoices.
  - Follow-up question: Should the AI mention typical retainer amounts, or only say a retainer 'may be required' until the lawyer confirms?

### Booking / Appointment Rules

- **LAW-016. What consultation formats do you offer (in-person, phone, video) and how long is each?**
  - Why it matters: The AI must offer the right options and reserve the correct duration when booking.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, faq, voice_call
  - Required: yes
  - Example answer: 30-minute phone or video consultation, or 45-minute in-person meeting at the Manchester office.
  - Follow-up question: Is there a default format the AI should suggest first if the client has no preference?
- **LAW-017. How far in advance can consultations be booked, and what is the minimum notice required?**
  - Why it matters: Prevents the AI from offering same-hour slots or booking too far out beyond your scheduling window.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Booked up to 4 weeks ahead, with a minimum of 24 hours' notice for new consultations.
  - Follow-up question: Should urgent matters be allowed to bypass the minimum-notice rule, and how should the AI identify them?
- **LAW-018. Which fee earners take new-client consultations, and how should they be assigned by practice area?**
  - Why it matters: The AI must book with the correct lawyer for the matter type rather than a generic slot.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: Family with Sarah Lewis or James Okafor; conveyancing with the property team; employment with Priya Nair only.
  - Follow-up question: If the assigned lawyer is unavailable, should the AI offer another qualified fee earner or just the next available date?
- **LAW-019. What is your cancellation and rescheduling policy for consultations?**
  - Why it matters: The AI must communicate and enforce the policy when clients want to change or cancel appointments.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Free cancellation or reschedule with 24 hours' notice; paid consultations cancelled with less notice are non-refundable.
  - Follow-up question: Should the AI be allowed to reschedule directly, or only flag cancellation requests to staff?
- **LAW-020. What information must be collected before a consultation can be confirmed?**
  - Why it matters: Ensures the lawyer is prepared and a basic conflict check can be run before the meeting.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, lead_qualification, compliance
  - Required: yes
  - Example answer: Full name, contact details, matter type, brief description, opposing party name (for conflict check), and how they heard about us.
  - Follow-up question: Is there any document or ID you want the AI to request the client bring to the consultation?

### Customer Qualification

- **LAW-021. What initial questions should the AI ask to classify the matter type and route it correctly?**
  - Why it matters: Proper triage ensures the enquiry reaches the right team and that out-of-scope matters are identified early.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Ask what area of law the issue relates to, when it started, whether court proceedings have begun, and any key deadlines.
  - Follow-up question: Are there any keywords that should immediately flag a matter as urgent or high-value?
- **LAW-022. What details must the AI capture to run a conflict-of-interest check before accepting an enquiry?**
  - Why it matters: Running a conflict check is a regulatory and ethical requirement; missing it can prevent the firm from acting.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, compliance, customer_support
  - Required: yes
  - Example answer: Client's full legal name, all opposing party names, any related companies, and the nature of the dispute.
  - Follow-up question: Who should the conflict-check details be sent to, and should booking be held until clearance?
- **LAW-023. Are there matters the AI should screen out as too small, out of jurisdiction, or unsuitable, and what are the thresholds?**
  - Why it matters: Avoids wasting fee-earner time on enquiries the firm cannot or will not take, while keeping the interaction polite.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, escalation
  - Required: no
  - Example answer: Decline small-claims disputes under £1,000, matters governed by Scottish law, and litigation already part-heard by another firm.
  - Follow-up question: When screening out, should the AI signpost an alternative such as Citizens Advice or a referral firm?

### FAQs

- **LAW-026. What are the most common questions prospective clients ask, and the approved answers?**
  - Why it matters: A curated FAQ lets the AI answer instantly and accurately without venturing into legal advice.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: How much does a divorce cost, how long does conveyancing take, do you offer free consultations, where are you based.
  - Follow-up question: Are there any questions you want the AI to deflect to a lawyer rather than answer directly?
- **LAW-027. How should the AI respond when a client asks for an opinion on the merits or likely outcome of their case?**
  - Why it matters: Giving legal advice or predicting outcomes is prohibited for the AI and risks liability; a strict scripted response is essential.
  - Expected answer type: `long_text`
  - Used for: faq, compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Reply: 'I'm not able to give legal advice, but I can capture your details and arrange a consultation with one of our solicitors who can.'
  - Follow-up question: Are there phrasings you want the AI to always avoid, such as estimating success chances or compensation amounts?
- **LAW-028. How should the AI answer questions about typical timescales for common matters?**
  - Why it matters: Timescales are a frequent concern; the AI should give general ranges while clarifying every matter differs.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: no
  - Example answer: Standard conveyancing typically takes 8-12 weeks; uncontested divorce around 6-8 months, subject to court timelines.
  - Follow-up question: Should the AI always add a disclaimer that timescales are estimates and depend on individual circumstances?
- **LAW-029. What should the AI say about how client confidentiality and legal privilege are protected?**
  - Why it matters: Clients sharing sensitive matters need reassurance, and the AI must describe confidentiality accurately.
  - Expected answer type: `long_text`
  - Used for: faq, compliance, ai_prompt
  - Required: yes
  - Example answer: Explain that all information shared is treated as confidential under solicitor-client privilege and only accessed by relevant staff.
  - Follow-up question: Should the AI proactively mention confidentiality before clients share matter details?
- **LAW-030. What should the AI tell clients about what to bring or prepare for their first consultation?**
  - Why it matters: Well-prepared clients make consultations more productive and reduce follow-up admin.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, booking
  - Required: no
  - Example answer: Bring photo ID, proof of address, and any relevant documents such as contracts, letters, or court papers.
  - Follow-up question: Do document requirements differ by practice area that the AI should tailor its answer to?

### Staff / Team / Availability

- **LAW-046. Who are the key fee earners and support staff, their roles, and the matters each handles?**
  - Why it matters: Lets the AI name the right person, route enquiries, and answer 'who would handle my matter' questions.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, ai_prompt, booking, faq
  - Required: yes
  - Example answer: Sarah Lewis (Partner, Family), James Okafor (Associate, Family), Priya Nair (Employment), the property team (Conveyancing).
  - Follow-up question: How should the AI know when a fee earner is on leave so it doesn't book or promise them?

### Communication Channels

- **LAW-031. Which channels should the AI receptionist operate on (phone, WhatsApp, email, SMS, website chat)?**
  - Why it matters: Defines where the AI is active so coverage matches client expectations and firm capacity.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, email, sms, voice_call
  - Required: yes
  - Example answer: Phone, WhatsApp, and website chat for new enquiries; email for document follow-ups.
  - Follow-up question: Is any channel reserved for existing clients only, where the AI should verify before assisting?

### Voice Call Behavior

- **LAW-032. How should the AI answer phone calls, including greeting, and when must it transfer to a human?**
  - Why it matters: The phone greeting sets the firm's tone, and clear transfer rules prevent the AI from handling matters beyond its remit.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Greet: 'Thank you for calling Hartwell & Associates, how can I help?' Transfer to reception for existing clients or urgent court deadlines.
  - Follow-up question: During out-of-hours calls, should the AI take a message, offer a callback, or provide an emergency contact?
- **LAW-035. What disclaimer should the AI state on voice calls to clarify it is an automated assistant and cannot give legal advice?**
  - Why it matters: Transparency about the AI's nature and limits is both an ethical expectation and a liability safeguard.
  - Expected answer type: `long_text`
  - Used for: voice_call, compliance, ai_prompt
  - Required: yes
  - Example answer: State: 'I'm an automated assistant. I can help with general questions and bookings but cannot provide legal advice.'
  - Follow-up question: Should this disclaimer be given at the start of every call or only when a legal-advice question arises?

### WhatsApp / Email / SMS Behavior

- **LAW-033. What are the tone, length, and signature expectations for AI messages on WhatsApp, SMS, and email?**
  - Why it matters: Each channel has different norms; consistent, appropriate messaging maintains professionalism and legal compliance.
  - Expected answer type: `long_text`
  - Used for: whatsapp, sms, email, ai_prompt
  - Required: yes
  - Example answer: WhatsApp/SMS: concise and warm, no legal opinions. Email: formal, full firm signature and SRA footer included.
  - Follow-up question: Should every email automatically include a confidentiality disclaimer and the firm's regulatory details?

### Follow-up Rules

- **LAW-036. When an enquiry doesn't book a consultation, how and when should the AI follow up?**
  - Why it matters: Timely, well-judged follow-up recovers leads that would otherwise be lost without being intrusive.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, campaign
  - Required: yes
  - Example answer: Send one follow-up after 24 hours and a final reminder after 3 days, then stop unless the client re-engages.
  - Follow-up question: Which channel should follow-ups use, and should the message differ from the original enquiry channel?
- **LAW-037. Should the AI send appointment reminders before consultations, and how far in advance?**
  - Why it matters: Reminders reduce no-shows, which directly protects fee-earner utilisation.
  - Expected answer type: `long_text`
  - Used for: follow_up, booking, whatsapp, sms
  - Required: yes
  - Example answer: Yes: a reminder 24 hours before and another 1 hour before, including location or video link.
  - Follow-up question: Should reminders ask the client to confirm attendance so the slot can be released if needed?
- **LAW-038. After a consultation, what post-meeting follow-up should the AI send?**
  - Why it matters: Post-consultation follow-up encourages the client to instruct the firm and keeps the matter moving.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, campaign
  - Required: no
  - Example answer: Thank-you message with next steps, any quote or client-care letter reference, and a prompt to confirm if they wish to proceed.
  - Follow-up question: Should the AI chase clients who received a quote but haven't instructed within a set period?

### Sales / Upsell Opportunities

- **LAW-039. Which complementary services should the AI suggest based on a client's matter (e.g. a will alongside a property purchase)?**
  - Why it matters: Relevant cross-service prompts increase value per client while genuinely serving their needs.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Suggest a will when buying a home, an LPA alongside a will, and a shareholder agreement when forming a company.
  - Follow-up question: Should these suggestions be made only after the primary matter is confirmed, to avoid seeming pushy?
- **LAW-040. Do you run any campaigns, seasonal offers, or content (e.g. free will month) the AI should mention to relevant enquiries?**
  - Why it matters: Surfacing timely offers to the right clients improves engagement and conversion.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, follow_up
  - Required: no
  - Example answer: Yes: 'Free Wills Month' each October and a discounted first-time-buyer conveyancing package in spring.
  - Follow-up question: Should the AI only mention an offer when it directly matches the client's stated matter type?

### Complaints / Escalation

- **LAW-041. How should the AI handle a client who expresses a complaint or dissatisfaction?**
  - Why it matters: Complaints in regulated firms must follow a formal procedure; the AI must not improvise responses or admit liability.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, compliance, ai_prompt
  - Required: yes
  - Example answer: Apologise for the experience, avoid admitting fault, log details, and escalate to the practice manager within the same day.
  - Follow-up question: Should the AI provide the firm's formal complaints procedure and ombudsman details when a complaint is raised?
- **LAW-042. What situations must the AI immediately escalate to a human, and to whom?**
  - Why it matters: Some matters are urgent or sensitive and cannot wait; clear escalation routing prevents harm and missed deadlines.
  - Expected answer type: `long_text`
  - Used for: escalation, compliance, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Escalate imminent court deadlines, safeguarding or domestic abuse disclosures, and existing-client emergencies to the duty solicitor.
  - Follow-up question: Who is the named escalation contact for out-of-hours emergencies, and how should the AI reach them?

### Payments / Deposits / Refunds

- **LAW-045. Can the AI collect any payments (e.g. paid consultation fees or fixed-service fees), and through what method?**
  - Why it matters: Determines whether the AI can complete transactions and what payment rules and limits apply.
  - Expected answer type: `long_text`
  - Used for: payment, ai_prompt, booking
  - Required: no
  - Example answer: AI may take payment for paid consultations and fixed-fee wills via a secure Stripe link; it cannot take money on account for ongoing matters.
  - Follow-up question: What is your refund policy if a paid service is cancelled, and can the AI communicate it?

### Industry-Specific Rules

- **LAW-047. Are there any limitation periods or urgent deadlines the AI should flag and prioritise for certain matter types?**
  - Why it matters: Missing a limitation deadline can bar a client's claim entirely; the AI must surface time-critical matters fast.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, escalation, ai_prompt, compliance
  - Required: yes
  - Example answer: Personal injury claims approaching the 3-year limit, employment tribunal claims (3 months less a day), and imminent court hearings.
  - Follow-up question: If a client mentions a possible deadline, should the AI escalate immediately rather than scheduling a routine consultation?

### Compliance / Safety

- **LAW-043. What are the firm's strict rules on what the AI must NEVER do regarding legal advice and case opinions?**
  - Why it matters: Unauthorised legal advice creates regulatory and liability exposure; this is the single most important compliance guardrail.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Never advise on rights, interpret law, predict outcomes, estimate compensation, or recommend a course of action; only capture and book.
  - Follow-up question: Are there borderline questions clients ask that you want explicitly scripted as 'refer to a lawyer'?
- **LAW-044. What anti-money-laundering or client-identity rules must the AI respect during intake?**
  - Why it matters: Law firms have AML obligations; the AI must not bypass ID verification or accept instructions it isn't permitted to.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: The AI may collect ID documents but cannot verify identity or accept funds; AML checks are completed by staff before engagement.
  - Follow-up question: Should the AI request ID documents at intake, or only inform clients they'll be needed before instruction?

### Customer Data Collection

- **LAW-024. What personal and matter data fields must the AI collect from every new enquiry, and which are mandatory?**
  - Why it matters: Defines the intake dataset so records are complete and consistent for the lawyer and CRM.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, compliance, reporting
  - Required: yes
  - Example answer: Mandatory: full name, phone, email, matter type, brief summary. Optional: postcode, preferred contact time, referral source.
  - Follow-up question: Should the AI ever collect sensitive details like financials or health information, or defer those to the lawyer?
- **LAW-025. What consent and privacy notice must the AI present before collecting a client's personal information?**
  - Why it matters: Data protection law requires informed consent and a lawful basis before processing personal data.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, customer_support
  - Required: yes
  - Example answer: Confirm the client agrees their details are stored under our privacy policy at hartwell-law.co.uk/privacy before proceeding.
  - Follow-up question: Should the AI capture and timestamp explicit consent confirmation for each enquiry?

### AI Tone / Personality

- **LAW-034. What personality and tone should the AI receptionist project to reflect your firm's brand?**
  - Why it matters: The right tone builds trust with clients who are often stressed or in sensitive situations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp, email
  - Required: yes
  - Example answer: Professional, calm, empathetic, and reassuring; never casual, salesy, or dismissive of a client's concerns.
  - Follow-up question: Are there sensitive practice areas, like family or immigration, where the AI should be especially gentle?

### Reporting / Analytics

- **LAW-048. What metrics and reports do you want from the AI receptionist, and how often?**
  - Why it matters: Defines the reporting outputs so the firm can measure enquiry volume, conversion, and AI performance.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: yes
  - Example answer: Daily enquiry count by practice area, consultation bookings, conversion rate, missed/after-hours calls, and escalations.
  - Follow-up question: Who should receive these reports and in what format (email summary, dashboard, or both)?
- **LAW-049. Which referral sources and marketing channels should the AI track for each enquiry?**
  - Why it matters: Knowing where enquiries originate lets the firm measure marketing ROI and focus spend effectively.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, lead_qualification
  - Required: no
  - Example answer: Track: Google search, referral from existing client, Law Society directory, social media, and repeat client.
  - Follow-up question: Should the AI always ask 'how did you hear about us', or only when the source isn't already known?

### Automation Triggers

- **LAW-050. What automated actions should fire on key events (new enquiry, booking confirmed, conflict flagged, urgent deadline)?**
  - Why it matters: Defines the workflow automations that connect the AI to the firm's CRM, calendar, and team in real time.
  - Expected answer type: `long_text`
  - Used for: analytics, booking, escalation, staff_assignment
  - Required: yes
  - Example answer: New enquiry creates a CRM lead and notifies reception; booking adds a calendar event; conflict or deadline alerts the relevant lawyer instantly.
  - Follow-up question: Which tools (CRM, calendar, case management system) should these automations integrate with?


## 9. Cleaning Service

### Business Identity

- **CLEANING-001. What is the exact legal and trading name of your cleaning business as customers should hear it?**
  - Why it matters: The AI must greet callers and sign messages with the correct brand name to sound legitimate and consistent across channels.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp, email
  - Required: yes
  - Example answer: SparkleHome Cleaning Services Ltd, trading as SparkleHome
  - Follow-up question: Should the AI use the full legal name or the short trading name in everyday conversation?
- **CLEANING-002. What geographic area, postcodes, or radius do you serve for cleaning jobs?**
  - Why it matters: The AI needs to qualify whether a job location is in range before booking, avoiding wasted visits and out-of-area bookings.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Within a 20-mile radius of central Manchester, covering postcodes M1 to M40 and parts of Stockport (SK1-SK8)
  - Follow-up question: Do you charge a travel surcharge for jobs near the edge of your service area?
- **CLEANING-003. What are your standard operating hours and which days do you accept cleaning jobs?**
  - Why it matters: The AI must only offer appointment slots within working hours and clearly state when the business is closed.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Monday to Friday 8:00 AM to 6:00 PM, Saturday 9:00 AM to 2:00 PM, closed Sundays and bank holidays
  - Follow-up question: Do you offer early-morning, evening, or weekend cleans at a premium rate?
- **CLEANING-004. How long has your cleaning business been operating and what makes it stand out from competitors?**
  - Why it matters: The AI can use credibility and differentiators to build trust and win hesitant prospects during sales conversations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Operating since 2014, fully insured, eco-friendly products only, same cleaner every visit, 100% satisfaction guarantee
  - Follow-up question: Are there any awards, certifications, or notable client testimonials the AI should mention?
- **CLEANING-005. What is the primary contact phone number, email, and website the AI should reference or hand off to?**
  - Why it matters: The AI needs accurate contact details to direct customers, confirm bookings, and escalate when human help is required.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, email, escalation
  - Required: yes
  - Example answer: Phone 0161 555 0123, email hello@sparklehome.co.uk, website www.sparklehome.co.uk
  - Follow-up question: Which of these channels should the AI prioritize when a customer wants a callback?

### Services / Products

- **CLEANING-006. Which types of cleaning do you offer (regular home, office/commercial, deep clean, end-of-tenancy/move-out)?**
  - Why it matters: The AI must know your full service catalogue to correctly match a customer's request to a bookable service.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Regular home cleaning, office cleaning, deep cleaning, end-of-tenancy/move-out cleaning, post-construction cleaning
  - Follow-up question: Which of these services is your most requested or most profitable?
- **CLEANING-007. What exactly is included in a standard regular clean versus a deep clean?**
  - Why it matters: The AI needs to explain scope precisely so customers pick the right service and avoid disputes about what was promised.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Regular: dusting, vacuuming, mopping, kitchen and bathroom surfaces. Deep: regular tasks plus inside oven, inside fridge, limescale removal, skirting boards, behind appliances
  - Follow-up question: Are there any tasks you explicitly do NOT cover (e.g. exterior windows, biohazard, ironing)?
- **CLEANING-008. Do you provide your own cleaning supplies and equipment, or does the customer?**
  - Why it matters: The AI must set expectations on what customers need to provide and answer a very common pre-booking question.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: We bring all our own supplies and equipment, including vacuum and eco-friendly products, at no extra charge
  - Follow-up question: Can customers request you use their own products (e.g. for allergies or surfaces)?
- **CLEANING-009. Do you offer any add-on services such as inside oven, inside windows, laundry/ironing, fridge, or carpet cleaning?**
  - Why it matters: The AI can present add-ons during booking to increase order value and capture jobs that need extra scope.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, pricing
  - Required: no
  - Example answer: Inside oven, inside windows, laundry and ironing, inside fridge, carpet shampooing, balcony/patio cleaning
  - Follow-up question: Which add-ons require advance notice or extra time on site?
- **CLEANING-010. Do you use eco-friendly, fragrance-free, or pet-safe products, and is this a standard or optional offering?**
  - Why it matters: Many customers have allergies, children, or pets and this is a frequent qualifying and differentiating question.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: All products are eco-friendly and pet-safe by default; fragrance-free options available on request
  - Follow-up question: Is there an additional cost for specialist hypoallergenic or fragrance-free products?

### Pricing / Packages

- **CLEANING-011. How do you price your cleans — per hour, per square foot/meter, flat rate per property size, or custom quote?**
  - Why it matters: The AI must know your pricing model to quote accurately or correctly route a job to a custom quote.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Hourly at £18/hour per cleaner for regular cleans; flat-rate quotes for deep and end-of-tenancy based on property size
  - Follow-up question: Is there a minimum number of hours or a minimum charge per visit?
- **CLEANING-012. What are your typical price ranges for common jobs (e.g. 1-bed regular clean, 3-bed deep clean, end-of-tenancy)?**
  - Why it matters: The AI can give realistic ballpark figures so customers self-qualify before booking a survey or quote.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: 1-bed regular from £45, 3-bed regular from £75, 3-bed deep clean £180-£250, 2-bed end-of-tenancy £200-£280
  - Follow-up question: Should the AI always quote a range, or only give exact prices after a site assessment?
- **CLEANING-013. Do you offer discounted packages or lower rates for recurring (weekly/fortnightly/monthly) cleaning?**
  - Why it matters: Recurring discounts are a key upsell lever, and the AI should promote them to convert one-off jobs into contracts.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign
  - Required: yes
  - Example answer: Weekly 15% off, fortnightly 10% off the standard hourly rate; one-off cleans charged at full rate
  - Follow-up question: Is there a minimum commitment period to qualify for the recurring discount?

### Booking / Appointment Rules

- **CLEANING-016. How far in advance can customers book, and what is the minimum notice you need for a new booking?**
  - Why it matters: The AI must not offer slots inside your minimum notice window or beyond your scheduling horizon.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Bookings accepted up to 8 weeks ahead; minimum 48 hours notice for new jobs, 24 hours for existing clients
  - Follow-up question: Do you accept same-day or emergency cleans, and is there a surcharge for them?
- **CLEANING-017. How long do typical jobs take, and how should the AI estimate duration when scheduling?**
  - Why it matters: Accurate duration estimates prevent double-booking cleaners and let the AI block the right amount of calendar time.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: Regular 1-bed approx 2 hours, 3-bed approx 3 hours; deep cleans 4-6 hours; end-of-tenancy a full day for 2 cleaners
  - Follow-up question: Should the AI add buffer time between jobs for travel and setup?
- **CLEANING-018. What is your cancellation and rescheduling policy, including any fees?**
  - Why it matters: The AI must communicate cancellation terms when booking and enforce fees consistently to protect your schedule.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq, payment
  - Required: yes
  - Example answer: Free cancellation with 24+ hours notice; under 24 hours incurs a £20 fee; no-shows charged 50% of the job value
  - Follow-up question: Should the AI automatically apply the late-cancellation fee or flag it for a human to confirm?
- **CLEANING-019. For recurring cleans, what scheduling patterns do you support (fixed day/time, same cleaner, skip-week options)?**
  - Why it matters: Recurring bookings have special rules and the AI needs to set up repeat slots and handle one-off skips correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, follow_up
  - Required: yes
  - Example answer: Fixed weekly/fortnightly slot, same cleaner where possible, customers can skip a week with 48 hours notice
  - Follow-up question: When a recurring slot is skipped, should the AI offer to move it to another day that week?
- **CLEANING-020. Do larger or complex jobs (deep clean, end-of-tenancy, commercial) require a site visit or quote before booking?**
  - Why it matters: The AI must route complex jobs to a survey/quote step rather than confirming a price and slot it cannot guarantee.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Yes for commercial and post-construction; deep cleans and end-of-tenancy can be quoted from photos and room count
  - Follow-up question: What information or photos should the AI collect to enable a remote quote?

### Customer Qualification

- **CLEANING-021. What property details must the AI collect to size a job (number of bedrooms, bathrooms, total rooms, square footage)?**
  - Why it matters: Property size is the single biggest driver of price and duration, so the AI must capture it to quote and schedule.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, pricing, booking
  - Required: yes
  - Example answer: Number of bedrooms, number of bathrooms, kitchen, living areas, approximate square footage, number of floors
  - Follow-up question: Which single detail is most important if the customer can only give you one?
- **CLEANING-022. Does the AI need to ask about the current condition of the property (lightly used, heavily soiled, hoarding, post-renovation)?**
  - Why it matters: Condition dramatically affects time and pricing; capturing it prevents under-quoting and cleaner disputes on arrival.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification, pricing
  - Required: yes
  - Example answer: Yes — ask whether it is regularly maintained, heavily soiled, post-renovation, or has not been cleaned in months
  - Follow-up question: Are there conditions you will not accept (e.g. biohazard, severe hoarding) that the AI should screen out?
- **CLEANING-023. Should the AI ask whether there are pets in the home, and capture details?**
  - Why it matters: Pets affect product choice, cleaner safety, allergy considerations, and time, so the AI should always ask.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, lead_qualification, staff_assignment
  - Required: yes
  - Example answer: Yes — ask if there are pets, what type, and whether they need to be secured during the clean
  - Follow-up question: Do any of your cleaners have allergies that mean certain pet jobs must be assigned carefully?

### FAQs

- **CLEANING-026. What are your most frequently asked pre-booking questions and the answers you want the AI to give?**
  - Why it matters: Pre-loading common Q&A lets the AI resolve enquiries instantly without escalating, improving conversion.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: Do you bring supplies? Yes. Are you insured? Yes, fully. Same cleaner each time? Yes where possible. Do I need to be home? No.
  - Follow-up question: Are there any questions you want the AI to deflect to a human rather than answer itself?
- **CLEANING-027. What is your satisfaction guarantee or re-clean policy if a customer is unhappy?**
  - Why it matters: A clear guarantee is a strong sales point and the AI must state it accurately to reassure prospects and handle complaints.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support, escalation
  - Required: yes
  - Example answer: If you are not happy, report it within 24 hours and we return to re-clean the affected areas free of charge
  - Follow-up question: What is the time limit for reporting an issue to qualify for a free re-clean?
- **CLEANING-028. Do customers need to do anything to prepare before a clean (tidy clutter, secure valuables, pets)?**
  - Why it matters: Setting prep expectations improves clean quality and prevents disputes; the AI should communicate it at booking.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: no
  - Example answer: Please clear surfaces of clutter, secure valuables and cash, and keep pets in a separate room during the clean
  - Follow-up question: Will the cleaner tidy clutter for an extra charge, or only clean already-clear surfaces?
- **CLEANING-029. Are your cleaners background-checked, vetted, and trained, and what should the AI say about trust and safety?**
  - Why it matters: Trust is a top concern for letting strangers into a home; the AI must answer vetting questions confidently.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: All cleaners are DBS-checked, reference-verified, uniformed, and complete a 2-week training programme before solo work
  - Follow-up question: Can a customer request the same cleaner each visit, and how is that arranged?
- **CLEANING-030. Do you clean while the customer is away, and how do you handle homes left unattended?**
  - Why it matters: Many customers are at work; the AI must explain unattended-clean procedures and reassure on security.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: no
  - Example answer: Yes, most clients are out during the clean; we follow agreed access and lock-up procedures and send a completion message
  - Follow-up question: Do you send a photo or message confirming the clean is complete when no one is home?

### Staff / Team / Availability

- **CLEANING-046. How many cleaners or teams do you have and how should the AI check real availability before confirming a slot?**
  - Why it matters: The AI must respect actual cleaner capacity so it never confirms a slot that cannot be staffed.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: yes
  - Example answer: 4 solo cleaners and 1 two-person team; check the shared calendar for open slots before confirming any booking
  - Follow-up question: Should the AI assign a specific cleaner, or just hold the slot for you to assign manually?
- **CLEANING-047. Do you assign jobs by area, cleaner skill, or continuity (same cleaner for recurring clients), and how should the AI factor this?**
  - Why it matters: Assignment rules affect quality and travel efficiency; the AI should propose slots that fit your assignment logic.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: no
  - Example answer: Assign by postcode zone for travel efficiency, keep the same cleaner for recurring clients, use the team for end-of-tenancy
  - Follow-up question: If a regular cleaner is unavailable, should the AI offer a substitute or only reschedule?

### Communication Channels

- **CLEANING-031. Which channels should the AI handle for cleaning enquiries (WhatsApp, voice calls, SMS, email, web chat)?**
  - Why it matters: Defining active channels ensures the AI responds where customers reach out and ignores channels you don't use.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, voice_call, email, sms
  - Required: yes
  - Example answer: WhatsApp, voice calls, and email for enquiries and bookings; SMS for reminders only
  - Follow-up question: Is there a preferred channel you want the AI to steer customers toward for booking?

### Voice Call Behavior

- **CLEANING-032. How should the AI answer the phone, and when should it transfer or take a message for a human?**
  - Why it matters: Voice is high-stakes; the AI needs a clear greeting and escalation rules so callers feel handled, not stuck.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Answer warmly with the business name, handle quotes and bookings, transfer complaints or commercial contracts to the owner
  - Follow-up question: What is the fallback if a call comes in outside business hours — voicemail, callback booking, or text back?

### WhatsApp / Email / SMS Behavior

- **CLEANING-033. What response time and message style do you want for WhatsApp, SMS, and email replies?**
  - Why it matters: Channel-specific tone and timing keep replies on-brand and appropriate to each medium's expectations.
  - Expected answer type: `long_text`
  - Used for: whatsapp, sms, email, ai_prompt
  - Required: yes
  - Example answer: WhatsApp short and friendly with emojis, SMS concise and plain, email more detailed and professional, all within minutes
  - Follow-up question: Should booking confirmations be sent on all channels or only the one the customer used?

### Follow-up Rules

- **CLEANING-036. When a customer enquires but does not book, how and when should the AI follow up?**
  - Why it matters: Timely follow-up recovers lost leads; the AI needs explicit timing and message rules to nurture without nagging.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, campaign
  - Required: yes
  - Example answer: Follow up after 24 hours with a quote reminder, again after 3 days with the recurring discount, then stop
  - Follow-up question: How many follow-up attempts should the AI make before marking the lead as cold?
- **CLEANING-037. After a completed one-off clean, should the AI follow up to convert it into a recurring booking?**
  - Why it matters: Converting one-offs to recurring is the highest-value follow-up; the AI should pitch it at the right moment.
  - Expected answer type: `yes_no`
  - Used for: follow_up, ai_prompt, campaign
  - Required: yes
  - Example answer: Yes — message the day after a one-off clean offering 15% off if they switch to a weekly or fortnightly schedule
  - Follow-up question: What incentive should the AI offer to encourage the switch to recurring?
- **CLEANING-038. For recurring clients, should the AI send reminders before each scheduled clean, and how far ahead?**
  - Why it matters: Pre-clean reminders reduce no-access failures and let clients prep or skip, protecting the cleaner's schedule.
  - Expected answer type: `single_select`
  - Used for: follow_up, ai_prompt, booking
  - Required: yes
  - Example answer: Yes — send a reminder the evening before each recurring clean with the time slot and option to skip or reschedule
  - Follow-up question: Should the reminder include a way for the client to confirm, skip, or change the appointment?

### Sales / Upsell Opportunities

- **CLEANING-039. Which upsells or add-ons should the AI proactively suggest during booking (deep clean, oven, windows, extra hours)?**
  - Why it matters: Structured upsell prompts raise average job value; the AI needs your approved upsell list and triggers.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: Suggest inside oven and inside windows on first-time deep cleans, and an extra hour for properties with 3+ bathrooms
  - Follow-up question: Should upsells be suggested only on first booking or also offered periodically to recurring clients?
- **CLEANING-040. Do you run seasonal promotions (spring deep clean, pre-Christmas, end-of-tenancy season) the AI should mention?**
  - Why it matters: Seasonal campaigns drive demand; the AI can promote active offers to relevant enquirers to lift bookings.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: Spring deep-clean promo at 10% off in March-April, and a pre-Christmas clean offer with priority booking in December
  - Follow-up question: How should the AI be told when a promotion starts and ends so it doesn't quote expired offers?

### Complaints / Escalation

- **CLEANING-041. How should the AI handle complaints about clean quality, damage, or a missed appointment?**
  - Why it matters: Complaints need careful, consistent handling; the AI must de-escalate, log, and route serious issues to a human fast.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Apologise, log the details, offer a free re-clean for quality issues, and escalate any damage or injury claim to the owner immediately
  - Follow-up question: Which complaint types must always be escalated to a human rather than resolved by the AI?
- **CLEANING-042. Who should the AI escalate to, and what are the contact details and response expectations for urgent issues?**
  - Why it matters: Clear escalation paths ensure urgent problems (damage, breach, injury) reach the right person without delay.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt
  - Required: yes
  - Example answer: Escalate to owner Sarah on 07700 900123 for damage or safety; office manager for scheduling issues, respond within 1 hour
  - Follow-up question: What should the AI tell the customer about expected response time when it escalates?

### Payments / Deposits / Refunds

- **CLEANING-014. Do you require a deposit or upfront payment to confirm a booking, and how much?**
  - Why it matters: The AI must collect or explain deposit requirements at booking time to secure the slot and reduce no-shows.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking, payment
  - Required: yes
  - Example answer: 25% deposit required for deep cleans and end-of-tenancy; no deposit for regular recurring customers
  - Follow-up question: How should the deposit be paid — payment link, bank transfer, or card over the phone?
- **CLEANING-015. Which payment methods do you accept and when is the balance due (before, on the day, or after the clean)?**
  - Why it matters: The AI needs to give clear payment instructions and timing so the customer knows exactly how and when to pay.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, payment, faq
  - Required: yes
  - Example answer: Card, bank transfer, and cash; balance due on completion of the clean, recurring clients invoiced monthly
  - Follow-up question: Do you send an automatic invoice or receipt after payment is taken?

### Industry-Specific Rules

- **CLEANING-045. Are there jobs, conditions, or substances you refuse (biohazard, mould remediation, exterior heights, pest infestations)?**
  - Why it matters: The AI must screen out jobs you cannot legally or safely accept to avoid liability and protect cleaner safety.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: We do not handle biohazard/needles, sewage, mould remediation, exterior windows above ground floor, or active infestations
  - Follow-up question: Where should the AI refer customers for jobs you decline (e.g. specialist remediation firms)?

### Compliance / Safety

- **CLEANING-043. What insurance do you hold (public liability, employer's liability, treatment risk) and what should the AI tell customers?**
  - Why it matters: Insurance is a key trust and safety question; the AI must state coverage accurately and reassure on accidental damage.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, faq
  - Required: yes
  - Example answer: £5m public liability and employer's liability insurance covering accidental damage and breakages during cleaning
  - Follow-up question: What is the process and time limit for a customer to claim for accidental damage?
- **CLEANING-044. What are your key, code, and access-data handling rules the AI must follow and communicate?**
  - Why it matters: Handling keys and codes is a security and liability risk; the AI must follow strict rules and never expose sensitive access info.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Keys are coded not addressed, stored in a locked safe, signed in and out; the AI never shares codes over open channels
  - Follow-up question: Should the AI confirm access details verbally or only via a secure verified channel?

### Customer Data Collection

- **CLEANING-024. What contact and address details must the AI collect to confirm a booking (name, phone, full address, access notes)?**
  - Why it matters: Complete details are essential for the cleaner to arrive, gain access, and for you to confirm and follow up.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Full name, mobile number, email, full property address with postcode, parking notes, and entry instructions
  - Follow-up question: Is there a specific field, like a gate code, the AI should always confirm before the visit?
- **CLEANING-025. How will the cleaner gain access to the property (customer present, key, lockbox, building concierge, code)?**
  - Why it matters: Access method is critical operationally and for security; the AI must capture it to avoid failed visits.
  - Expected answer type: `single_select`
  - Used for: booking, ai_prompt, staff_assignment, compliance
  - Required: yes
  - Example answer: Customer present, lockbox with code, key held by us, concierge, or smart-lock code provided on the day
  - Follow-up question: If keys are held by you, what is your secure key-handling and labelling procedure the AI should mention?

### AI Tone / Personality

- **CLEANING-034. What personality and tone should the AI receptionist have when representing your cleaning business?**
  - Why it matters: Tone shapes brand perception; a cleaning brand may want warm and reassuring rather than corporate or salesy.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Warm, friendly, trustworthy and reassuring — like a helpful local team member, never pushy
  - Follow-up question: Are there any words, phrases, or a level of formality the AI should always or never use?
- **CLEANING-035. How should the AI handle price-sensitive or hesitant customers without sounding pushy?**
  - Why it matters: Cleaning is competitive; the AI must reassure on value (insurance, guarantee, vetting) rather than discount aggressively.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Emphasise insurance, vetted staff and the satisfaction guarantee; offer a recurring discount rather than cutting the one-off price
  - Follow-up question: Is the AI allowed to offer any discount on its own, or must all discounts be approved by you?

### Reporting / Analytics

- **CLEANING-048. What metrics and reports do you want from the AI receptionist (bookings, conversion rate, no-shows, recurring conversions)?**
  - Why it matters: Defined reporting lets you measure the AI's impact and spot trends like high cancellation or low conversion.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: no
  - Example answer: Weekly report on new bookings, enquiry-to-booking conversion, cancellations, no-shows, and one-off-to-recurring conversions
  - Follow-up question: How often and through which channel would you like these reports delivered?
- **CLEANING-049. Which enquiry sources and lead reasons should the AI track and tag (Google, referral, repeat, social, advert)?**
  - Why it matters: Source tracking shows which marketing drives bookings so you can invest where it pays off.
  - Expected answer type: `multi_select_or_text`
  - Used for: analytics, reporting, ai_prompt, campaign
  - Required: no
  - Example answer: Tag each enquiry as Google search, Facebook/Instagram, word-of-mouth referral, repeat customer, or local flyer
  - Follow-up question: Should the AI always ask new customers how they heard about you, and at what point in the chat?

### Automation Triggers

- **CLEANING-050. Which events should automatically trigger AI actions (booking confirmation, deposit request, day-before reminder, post-clean review request)?**
  - Why it matters: Defined automation triggers let the AI run the booking lifecycle hands-free, sending the right message at the right step.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, booking, ai_prompt, campaign
  - Required: yes
  - Example answer: On booking send confirmation and deposit link, evening before send reminder, after completion request a Google review
  - Follow-up question: How long after a completed clean should the AI wait before sending a review request?


## 10. Home Services / Plumbing / Electrical

### Business Identity

- **HOMESERVICES-001. What is your business's legal and trading name, and do you operate as a plumber, electrician, or general home-services company?**
  - Why it matters: The AI must introduce the business correctly and know which trades it can credibly book and quote for.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: ProFix Home Services Ltd — we cover both plumbing and electrical work.
  - Follow-up question: Do you have a shorter brand name customers usually call you by?
- **HOMESERVICES-002. What geographic service area do you cover (towns, postal codes, or radius from your base)?**
  - Why it matters: The AI must qualify whether a caller's address is in range before booking, avoiding wasted trips and unfulfillable jobs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: We cover all of Greater Manchester and within 25 miles of the M60.
  - Follow-up question: Do you charge extra or refuse jobs outside that core area?
- **HOMESERVICES-003. What are your standard business hours, and do you offer 24/7 emergency cover outside those hours?**
  - Why it matters: Determines when the AI books standard jobs versus routes after-hours emergencies, and sets caller expectations.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Mon-Fri 8am-6pm, Sat 9am-1pm; 24/7 emergency line for leaks and power loss.
  - Follow-up question: Is the emergency line the same number or a separate one?
- **HOMESERVICES-005. What is your main contact phone number, business email, and website for the AI to share with customers?**
  - Why it matters: The AI needs verified contact details to hand off, confirm bookings, and send customers to the right channels.
  - Expected answer type: `phone`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: 0161 555 0199, hello@profixhome.co.uk, www.profixhome.co.uk
  - Follow-up question: Which channel do you prefer customers use first — phone or WhatsApp?

### Services / Products

- **HOMESERVICES-006. What plumbing services do you offer (e.g. leak repair, boiler service, blocked drains, bathroom installs, water heaters)?**
  - Why it matters: The AI must only offer and book services you actually provide, and recognise out-of-scope requests.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, faq, lead_qualification
  - Required: yes
  - Example answer: Leak detection, boiler servicing, blocked drains, tap and toilet repairs, full bathroom installs.
  - Follow-up question: Are there any plumbing jobs you specifically do NOT take on?
- **HOMESERVICES-007. What electrical services do you offer (e.g. rewiring, fuse board upgrades, EV charger installs, fault finding, lighting)?**
  - Why it matters: Ensures the AI can correctly classify and book electrical jobs and flag work needing certification.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, faq, lead_qualification
  - Required: yes
  - Example answer: Rewiring, consumer unit upgrades, EV charger installs, EICR inspections, fault finding, downlights.
  - Follow-up question: Do you issue electrical safety certificates (EICR / installation certs) with these jobs?
- **HOMESERVICES-008. Do you handle emergency / urgent repairs separately from scheduled work, and which job types count as emergencies?**
  - Why it matters: The AI must triage emergencies (burst pipe, no power, gas smell) differently from routine bookings.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification, escalation
  - Required: yes
  - Example answer: Emergencies: burst pipes, total power loss, gas smell, overflowing drains, no heating in winter.
  - Follow-up question: What is your typical response time for an emergency call-out?
- **HOMESERVICES-009. Which installation or larger projects do you offer (e.g. boiler replacement, full rewire, bathroom fit-out, solar)?**
  - Why it matters: Larger projects need a site survey rather than instant booking; the AI should route these to a quote process.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: no
  - Example answer: Boiler swaps, full house rewires, bathroom and kitchen fit-outs, EV charge points.
  - Follow-up question: Do these projects always require an in-person survey before you quote?
- **HOMESERVICES-010. Do you service both residential and commercial properties, or residential only?**
  - Why it matters: Commercial jobs often have different pricing, scheduling, and compliance needs; the AI must qualify property type early.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Residential and small commercial (shops, offices); no industrial sites.
  - Follow-up question: Should commercial enquiries be handled by a specific person or team?

### Pricing / Packages

- **HOMESERVICES-011. Do you charge a call-out / dispatch fee, and how much is it?**
  - Why it matters: Call-out fees are a top customer question; the AI must state them upfront to avoid disputes and no-shows.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, faq, booking
  - Required: yes
  - Example answer: £60 call-out fee, which includes the first 30 minutes of labour.
  - Follow-up question: Is the call-out fee waived if the customer goes ahead with the repair?
- **HOMESERVICES-012. What is your hourly labour rate, and do you have different rates for standard, evening, weekend, and emergency work?**
  - Why it matters: The AI needs accurate rates to set expectations and avoid quoting standard prices for premium emergency slots.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: £75/hr standard, £110/hr evenings/weekends, £150/hr emergency call-out.
  - Follow-up question: From what time does the evening/weekend rate apply?
- **HOMESERVICES-013. Do you offer fixed-price jobs or packages for common work (e.g. boiler service, EICR, tap replacement), and what do they cost?**
  - Why it matters: Fixed prices let the AI give instant quotes for common jobs without a survey, improving conversion.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq, booking
  - Required: no
  - Example answer: Boiler service £90, EICR from £150, outdoor tap fit £130, consumer unit upgrade from £450.
  - Follow-up question: Do these fixed prices include parts/materials or labour only?
- **HOMESERVICES-014. How do you handle estimates and quotes — can the AI give ballpark figures, or must every quote come after a survey?**
  - Why it matters: Defines how far the AI can go on pricing without misquoting; trades risk losing money on AI-given hard quotes.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: AI can give ballpark ranges for common jobs; firm quotes only after we assess on site.
  - Follow-up question: What disclaimer should the AI add when giving a ballpark figure?

### Booking / Appointment Rules

- **HOMESERVICES-016. How are appointments scheduled — fixed time slots, AM/PM windows, or 'first available'?**
  - Why it matters: The AI must offer slots in the format your scheduling actually uses so bookings are realistic and honoured.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Two-hour arrival windows (e.g. 9-11am, 1-3pm); we confirm a tighter ETA on the day.
  - Follow-up question: How much lead time do you need before the earliest bookable slot?
- **HOMESERVICES-017. Do you offer same-day and emergency call-outs, and what are the rules and cut-off times for them?**
  - Why it matters: Same-day and emergency promises drive bookings but must be accurate so the AI doesn't overcommit your team.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Same-day if booked before 12pm; true emergencies (leaks, power loss) any time, 24/7.
  - Follow-up question: Is there a premium fee for same-day or emergency slots?
- **HOMESERVICES-018. What is your cancellation and rescheduling policy, including any notice period or fee?**
  - Why it matters: The AI needs to state cancellation rules and handle reschedule requests consistently to protect your schedule.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Free reschedule with 24h notice; missed appointments without notice incur the £60 call-out fee.
  - Follow-up question: Can the AI reschedule customers automatically, or must it route them to a person?
- **HOMESERVICES-019. What information must the AI capture to confirm a booking (name, address, contact, access details)?**
  - Why it matters: Missing details cause failed visits; the AI must collect everything the engineer needs before confirming.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: yes
  - Example answer: Full name, address with postcode, mobile number, problem description, parking/access notes.
  - Follow-up question: Do you need to know if anyone will be home to grant access?
- **HOMESERVICES-020. Which booking calendar or scheduling tool should the AI write appointments into?**
  - Why it matters: The AI must integrate with your live calendar so slots reflect real availability and avoid double-booking.
  - Expected answer type: `single_select`
  - Used for: booking, staff_assignment
  - Required: no
  - Example answer: We use Google Calendar synced with ServiceM8.
  - Follow-up question: Should the AI assign jobs to a specific engineer or to a shared diary?

### Customer Qualification

- **HOMESERVICES-021. What questions should the AI ask to understand the exact problem (symptom, location, when it started)?**
  - Why it matters: Accurate triage lets you bring the right parts and tools, and separates emergencies from routine jobs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Ask what's wrong, which room/fixture, when it started, and whether it's getting worse.
  - Follow-up question: Are there photo requests that help you diagnose before arriving?
- **HOMESERVICES-022. How should the AI assess urgency and triage a job into emergency, same-day, or scheduled?**
  - Why it matters: Correct urgency triage protects customers from harm and ensures genuine emergencies jump the queue.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, escalation
  - Required: yes
  - Example answer: Active leak/flood, no power, gas smell, no heat in winter = emergency; dripping tap = scheduled.
  - Follow-up question: What phrases from a customer should immediately flag a true emergency?
- **HOMESERVICES-023. What property details should the AI capture (property type, age, owner vs tenant, access constraints)?**
  - Why it matters: Property type and age affect job complexity, parts, and whether the caller is even authorised to commission work.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: no
  - Example answer: House/flat, owner or tenant, approximate age, number of floors, stairs/parking access.
  - Follow-up question: If the caller is a tenant, should the AI ask for landlord authorisation first?

### FAQs

- **HOMESERVICES-026. What are your most common customer questions about availability, response time, and how quickly you can attend?**
  - Why it matters: Pre-loading these lets the AI answer instantly and reduces repeat calls to your team.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: 'Can you come today?', 'How fast for an emergency?', 'Do you work weekends?'
  - Follow-up question: What is the single most-asked question you'd like the AI to nail every time?
- **HOMESERVICES-027. What questions do customers ask about guarantees, warranties, and parts (e.g. how long is work guaranteed)?**
  - Why it matters: Guarantee questions affect trust and conversion; the AI must answer them accurately and consistently.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: All workmanship guaranteed 12 months; parts carry manufacturer warranty.
  - Follow-up question: Does the guarantee differ for parts the customer supplies themselves?
- **HOMESERVICES-028. What do customers commonly ask about whether they need a permit, certificate, or landlord/regulatory sign-off?**
  - Why it matters: Many electrical/gas jobs require certificates; the AI should explain compliance accurately without giving bad advice.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: no
  - Example answer: Consumer unit changes and rewires need certification; we notify Building Control where required.
  - Follow-up question: Should the AI mention you handle the certification/notification paperwork for them?
- **HOMESERVICES-029. What basic self-help or safety tips should the AI offer for common issues while a customer waits (e.g. turn off stopcock)?**
  - Why it matters: Safe interim advice limits damage and reassures customers, but must avoid risky DIY for gas/electrics.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: no
  - Example answer: Leak: turn off the stopcock. No power: check the trip switch. Never touch gas/exposed wiring.
  - Follow-up question: Which DIY tips should the AI explicitly refuse to give for safety reasons?
- **HOMESERVICES-030. What questions arise about pricing transparency (do you charge for quotes, are there hidden fees, materials markup)?**
  - Why it matters: Pricing-trust questions are decisive; consistent honest answers from the AI prevent disputes and lost jobs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: yes
  - Example answer: Quotes are free; no hidden fees; materials charged at cost plus 10%.
  - Follow-up question: Is there anything customers are often surprised by that the AI should clarify upfront?

### Staff / Team / Availability

- **HOMESERVICES-031. How many engineers do you have, and which trades/skills does each cover (gas, electrical, drainage)?**
  - Why it matters: The AI must match the right qualified engineer to the job and know real capacity when offering slots.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: 3 engineers: Dave (gas+plumbing), Sam (electrical/EV), Priya (drainage+plumbing).
  - Follow-up question: Are there jobs only one specific engineer is qualified to do?
- **HOMESERVICES-032. How should the AI assign jobs to engineers — by skill, by area, by availability, or round-robin?**
  - Why it matters: Sensible assignment logic reduces travel time and ensures only qualified staff are booked for each job.
  - Expected answer type: `single_select`
  - Used for: booking, staff_assignment
  - Required: no
  - Example answer: Match by required skill first, then nearest available engineer to the postcode.
  - Follow-up question: Should the AI avoid booking an engineer outside their usual coverage zone?

### Communication Channels

- **HOMESERVICES-033. Which channels should the AI handle (voice calls, WhatsApp, SMS, email, web chat) and which is primary?**
  - Why it matters: Defines where the AI operates and how it should hand off across channels for one customer.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, sms, email
  - Required: yes
  - Example answer: Voice and WhatsApp are primary; SMS for confirmations; email for quotes.
  - Follow-up question: If a call is missed, should the AI follow up automatically by SMS or WhatsApp?

### Voice Call Behavior

- **HOMESERVICES-034. How should the AI answer and conduct phone calls — greeting, when to take over, and when to transfer to a human?**
  - Why it matters: Voice is the main channel for trades; a clear script and handoff rules keep callers from hanging up.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Greet, identify emergency vs routine, book routine jobs, transfer emergencies/complex quotes to on-call.
  - Follow-up question: What words should trigger an immediate transfer to a human?

### WhatsApp / Email / SMS Behavior

- **HOMESERVICES-035. How should the AI behave on WhatsApp/SMS/email — message tone, response speed, and what it sends (confirmations, quotes, photos)?**
  - Why it matters: Channel behaviour must match customer expectations and your brand; e.g. WhatsApp for quick photos and confirmations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, sms, email
  - Required: yes
  - Example answer: WhatsApp: friendly, accepts photos, sends booking confirmations; email for formal written quotes.
  - Follow-up question: Should booking confirmations always go out on a specific channel?

### Follow-up Rules

- **HOMESERVICES-037. When and how should the AI follow up after a quote is given but not yet booked?**
  - Why it matters: Trades lose many jobs to slow follow-up; timed nudges recover quotes that would otherwise go cold.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign
  - Required: yes
  - Example answer: Follow up by WhatsApp 24h after a quote, then once more at 72h if no reply.
  - Follow-up question: Should the AI offer a small incentive on the second follow-up to close the job?
- **HOMESERVICES-038. Should the AI send post-job follow-ups (satisfaction check, review request) and on what timing?**
  - Why it matters: Post-job follow-up drives reviews and repeat business, key growth levers for home-services firms.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, customer_support
  - Required: no
  - Example answer: Day after completion: thank-you + satisfaction check; if happy, request a Google review.
  - Follow-up question: Which review platform should the AI direct happy customers to?
- **HOMESERVICES-039. Do you offer recurring maintenance plans or annual service reminders (e.g. boiler service, EICR every 5 years)?**
  - Why it matters: Maintenance reminders create predictable recurring revenue; the AI can schedule and prompt these automatically.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign, booking
  - Required: no
  - Example answer: Annual boiler service reminders and EICR reminders every 5 years; gas safety checks for landlords yearly.
  - Follow-up question: How far in advance should the AI send each maintenance reminder?

### Sales / Upsell Opportunities

- **HOMESERVICES-040. What complementary services or upgrades should the AI suggest during a booking (e.g. boiler cover, smart thermostat, EV charger)?**
  - Why it matters: Relevant upsells raise job value; the AI can suggest them naturally without being pushy.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, campaign, lead_qualification
  - Required: no
  - Example answer: Offer boiler service plans, smart thermostats, surge protection, and EV charger installs.
  - Follow-up question: Which upsell has the best take-up that the AI should prioritise?

### Complaints / Escalation

- **HOMESERVICES-041. How should the AI handle complaints about work quality, pricing, or a missed appointment?**
  - Why it matters: Mishandled complaints damage reputation; clear escalation rules protect both customer and business.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: Apologise, log details, never argue, and escalate to the owner within 1 hour for a callback.
  - Follow-up question: Who specifically should complaints be escalated to and how fast?
- **HOMESERVICES-042. What situations must the AI escalate to a human immediately rather than try to handle?**
  - Why it matters: Some scenarios (legal threats, safety incidents, large disputes) are unsafe for the AI to manage alone.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation
  - Required: yes
  - Example answer: Property damage claims, injury, gas leaks, legal threats, and anything the customer flags as urgent.
  - Follow-up question: What is the out-of-hours escalation contact for urgent safety issues?

### Payments / Deposits / Refunds

- **HOMESERVICES-015. What payment methods do you accept and when is payment due (on completion, on invoice, deposit upfront)?**
  - Why it matters: The AI must answer payment questions accurately and explain any deposit before booking large jobs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, payment, faq
  - Required: yes
  - Example answer: Card, bank transfer, and cash; payment on completion for repairs, 50% deposit for installs.
  - Follow-up question: For deposits, how should the AI collect or arrange payment — link, call-back, or invoice?

### Industry-Specific Rules

- **HOMESERVICES-046. Are there jobs you legally cannot or will not do via the AI (e.g. notifiable gas work without a survey, landlord certs)?**
  - Why it matters: Some regulated work cannot be booked blind; the AI must route these correctly instead of confirming directly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, compliance, lead_qualification
  - Required: yes
  - Example answer: Notifiable electrical work and new gas appliance fits always need a survey first — AI cannot finalise these.
  - Follow-up question: Which of these should the AI route to a callback versus a survey booking?

### Compliance / Safety

- **HOMESERVICES-004. What licenses, certifications, and trade registrations do you hold (e.g. Gas Safe, NICEIC, NAPIT, state license number)?**
  - Why it matters: Customers and the AI both need proof you are licensed and insured; some jobs legally require certified tradespeople.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: yes
  - Example answer: Gas Safe registered (No. 123456), NICEIC approved contractor, fully insured to £5m.
  - Follow-up question: Should the AI proactively mention these credentials when customers ask if you're qualified?
- **HOMESERVICES-043. How should the AI respond to a suspected gas leak or smell of gas?**
  - Why it matters: Gas leaks are life-threatening; the AI must give correct emergency-service advice and escalate, not book a routine slot.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, compliance, voice_call
  - Required: yes
  - Example answer: Advise: leave the property, don't use switches/flames, call the National Gas Emergency line (0800 111 999), then escalate to our on-call engineer.
  - Follow-up question: What is the exact emergency number the AI should give for gas in your region?
- **HOMESERVICES-044. How should the AI respond to electrical hazards (sparks, burning smell, exposed wiring, electric shock)?**
  - Why it matters: Electrical hazards risk fire and injury; the AI must give safe interim advice and escalate as an emergency.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, compliance, voice_call
  - Required: yes
  - Example answer: Advise: switch off at the consumer unit if safe, don't touch wiring, call 999 if fire/shock, then escalate to on-call electrician.
  - Follow-up question: When should the AI tell a customer to call emergency services (999/911) rather than wait for you?
- **HOMESERVICES-045. What safety disclaimers and limits must the AI always include (no DIY gas/electrical advice, only certified work)?**
  - Why it matters: The AI must never give unsafe DIY guidance for regulated trades; clear limits reduce liability and protect customers.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, faq
  - Required: yes
  - Example answer: Never advise DIY on gas or electrical work; always state work must be done by a certified engineer.
  - Follow-up question: Is there required legal wording you must include with quotes or safety advice?

### Customer Data Collection

- **HOMESERVICES-024. What customer contact and address data must the AI collect and store, and with what consent?**
  - Why it matters: Trades need accurate addresses to attend; data must be collected with consent to satisfy privacy rules.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, compliance, customer_support
  - Required: yes
  - Example answer: Name, phone, email, service address; explicit consent to store and contact about the job.
  - Follow-up question: Should the AI confirm consent to send marketing/maintenance reminders separately?
- **HOMESERVICES-025. Should the AI request photos or videos of the problem, and how should they be submitted?**
  - Why it matters: Visual evidence improves diagnosis and quoting accuracy and reduces wasted visits.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification, whatsapp
  - Required: no
  - Example answer: Yes — ask for photos of the leak/fitting via WhatsApp before confirming the slot.
  - Follow-up question: Which jobs most benefit from a photo before you attend?

### AI Tone / Personality

- **HOMESERVICES-036. What tone and personality should the AI use (e.g. friendly tradesperson, calm and reassuring in emergencies)?**
  - Why it matters: Tone affects trust; a calm, no-nonsense voice reassures stressed customers during leaks or outages.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Friendly, down-to-earth, and reassuring; calm and directive when someone is in an emergency.
  - Follow-up question: Are there words or phrases the AI should always avoid?

### Reporting / Analytics

- **HOMESERVICES-047. What metrics do you want reported (calls handled, bookings made, emergencies, missed leads, conversion rate)?**
  - Why it matters: Reporting shows the AI's value and surfaces where leads are lost so you can improve operations.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics
  - Required: no
  - Example answer: Daily: calls answered, jobs booked, emergencies triaged, quotes sent, missed/abandoned leads.
  - Follow-up question: How often and to whom should these reports be delivered?
- **HOMESERVICES-048. Which job types and times should the AI track to reveal demand patterns (peak emergency hours, seasonal trends)?**
  - Why it matters: Demand-pattern insight helps you staff for peaks (e.g. frozen pipes in winter) and price emergency slots.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics
  - Required: no
  - Example answer: Track emergency volume by hour and season, and which services trend monthly.
  - Follow-up question: Is there a seasonal pattern (e.g. winter heating, summer drainage) you want highlighted?

### Automation Triggers

- **HOMESERVICES-049. What automated actions should fire on key events (booking confirmed, emergency flagged, quote sent, job completed)?**
  - Why it matters: Defining triggers lets the AI send confirmations, alerts, and reminders automatically without manual steps.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, booking
  - Required: yes
  - Example answer: Booking confirmed -> SMS confirmation + calendar event; emergency -> alert on-call engineer instantly.
  - Follow-up question: Which event most needs an instant alert to your team?
- **HOMESERVICES-050. Under what conditions should the AI auto-escalate or notify a human (no engineer available, repeat caller, high-value job)?**
  - Why it matters: Conditional escalation ensures urgent or valuable jobs reach a person fast instead of stalling in automation.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, escalation
  - Required: yes
  - Example answer: Notify owner if: no engineer free for an emergency, quote over £1,000, or the same customer calls 3x in a day.
  - Follow-up question: What value threshold should automatically flag a job as high-priority?


## 11. Ecommerce Store

### Business Identity

- **ECOMMERCE-001. What is the official name of your ecommerce store as customers see it at checkout and on receipts?**
  - Why it matters: The AI must use the exact storefront name so customers trust the conversation and order/receipt references match.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, customer_support
  - Required: yes
  - Example answer: Nordic Home Goods
  - Follow-up question: Do you operate under any other brand names or sub-brands the AI should recognize?
- **ECOMMERCE-002. What is your primary online store URL and which platform powers it (Shopify, WooCommerce, Magento, etc.)?**
  - Why it matters: Knowing the platform and URL lets the AI link customers to the right pages and informs order-lookup integration options.
  - Expected answer type: `url`
  - Used for: ai_prompt, customer_support, faq
  - Required: yes
  - Example answer: https://nordichomegoods.com (Shopify)
  - Follow-up question: Do you also sell on marketplaces like Amazon, Etsy, or eBay that customers might be contacting you about?
- **ECOMMERCE-003. What are your customer support operating hours and time zone?**
  - Why it matters: The AI needs to set expectations on human response times and decide when to auto-handle versus queue for staff.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, customer_support, escalation
  - Required: yes
  - Example answer: Mon-Fri 9am-6pm EST, closed weekends
  - Follow-up question: How should the AI respond to messages received outside these hours?
- **ECOMMERCE-004. Which countries and regions do you ship to and sell in?**
  - Why it matters: The AI must avoid promising delivery or pricing to regions you don't serve and can route international queries correctly.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: USA, Canada, UK, EU
  - Follow-up question: Are there any countries you explicitly cannot ship to due to restrictions?
- **ECOMMERCE-005. What is your contact email, support phone number, and any physical/returns address customers may need?**
  - Why it matters: The AI must provide accurate contact and return-shipping details when escalating or handling returns.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, customer_support, escalation
  - Required: yes
  - Example answer: support@nordichomegoods.com, +1-800-555-0199, Returns: 42 Warehouse Rd, Newark NJ 07102
  - Follow-up question: Is the returns address different from your business mailing address?

### Services / Products

- **ECOMMERCE-006. What are your main product categories and how many SKUs do you carry overall?**
  - Why it matters: The AI needs the catalog shape to answer browsing and availability questions and route product inquiries accurately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Kitchenware, bedding, lighting, decor; ~1,200 SKUs
  - Follow-up question: Which category drives the most sales or support questions?
- **ECOMMERCE-007. What are your best-selling or flagship products that the AI should be able to describe in detail?**
  - Why it matters: Customers frequently ask about hero products; the AI should answer confidently and steer toward them.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: Linen duvet set, ceramic pour-over kettle, oak floor lamp
  - Follow-up question: Should the AI proactively recommend these flagship items when relevant?
- **ECOMMERCE-008. Do your products have size, color, or other variant options, and how should the AI help customers choose?**
  - Why it matters: Variant confusion is a top driver of WISMO and returns; the AI must guide selection correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Bedding comes in Twin/Queen/King and 6 colors; kettles in 2 sizes
  - Follow-up question: Do you have a sizing chart or fit guide URL the AI can share?
- **ECOMMERCE-009. How should the AI handle out-of-stock or low-stock items when a customer asks about them?**
  - Why it matters: Stock handling affects sales recovery and trust; back-in-stock capture protects revenue.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, faq, lead_qualification, follow_up
  - Required: yes
  - Example answer: Offer back-in-stock notification signup and suggest a similar in-stock alternative
  - Follow-up question: Do you have a back-in-stock waitlist system the AI can enroll customers into?
- **ECOMMERCE-010. Do you offer product bundles, gift sets, or custom/personalized items, and what are the rules around them?**
  - Why it matters: Bundles and personalization have special lead times and return rules the AI must communicate accurately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: no
  - Example answer: Monogrammed towels (5-day lead, non-returnable); gift sets with free wrapping
  - Follow-up question: Are personalized items final-sale and excluded from returns?

### Pricing / Packages

- **ECOMMERCE-011. What is your general price range across categories and your average order value?**
  - Why it matters: Price context helps the AI set expectations, qualify intent, and recommend within budget.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: $15-$450 per item; AOV around $85
  - Follow-up question: Should the AI ever quote prices, or always direct customers to the live product page?
- **ECOMMERCE-012. What are your shipping costs, free-shipping thresholds, and delivery time estimates by region?**
  - Why it matters: Shipping cost and ETA are the most common pre-purchase questions and a key abandoned-cart driver.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: yes
  - Example answer: Free over $75 US; standard $6.95 (3-5 days); express $14.95 (1-2 days)
  - Follow-up question: Do international shipping rates and times differ enough to list separately?
- **ECOMMERCE-013. What discount codes, promotions, or loyalty pricing should the AI know about and how should it share them?**
  - Why it matters: The AI must apply current promos correctly and avoid leaking expired or stacked discounts.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign, follow_up
  - Required: no
  - Example answer: WELCOME10 for first order; loyalty members get 15% on weekends
  - Follow-up question: Are discount codes stackable, and what is the policy on price-match or post-purchase adjustments?
- **ECOMMERCE-014. Do you charge taxes, customs, or duties that customers should be informed about before purchase?**
  - Why it matters: Unexpected duties cause refused deliveries and chargebacks; clear disclosure prevents disputes.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: no
  - Example answer: US sales tax at checkout; international duties paid by customer on delivery
  - Follow-up question: Should the AS proactively warn international buyers about possible customs charges?
- **ECOMMERCE-015. Do you offer gift cards, store credit, or installment payment options (e.g., Klarna, Afterpay)?**
  - Why it matters: Payment flexibility is a sales lever and a frequent question; the AI should explain available options.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, payment
  - Required: no
  - Example answer: Gift cards yes; Afterpay and Klarna available at checkout
  - Follow-up question: Are there minimum order amounts for installment payment options?

### Booking / Appointment Rules

- **ECOMMERCE-016. How can customers check order status, and what information must the AI collect to look up an order?**
  - Why it matters: WISMO is the #1 ecommerce support volume; the AI needs the exact lookup inputs to resolve it fast.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: yes
  - Example answer: Order number + email, or email + ZIP; lookup via Shopify order API
  - Follow-up question: Should the AI fetch live tracking, or only point customers to the tracking link in their confirmation email?
- **ECOMMERCE-017. What is your returns window and the step-by-step process a customer must follow to start a return?**
  - Why it matters: Treating return initiation like a booking lets the AI walk customers through eligibility and steps consistently.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: yes
  - Example answer: 30-day window; start via returns portal with order number, print prepaid label, drop at carrier
  - Follow-up question: Are items eligible for return if opened or used, and which items are final sale?
- **ECOMMERCE-018. Do you offer return pickups or scheduled exchanges, and how should the AI schedule them?**
  - Why it matters: Pickup/exchange scheduling is the booking-style action for ecommerce returns and needs clear slot rules.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: no
  - Example answer: Free home pickup for items over $200; customer picks a weekday window, courier confirms next-day
  - Follow-up question: What date/time windows are available for pickups and how far in advance must they be booked?
- **ECOMMERCE-019. Can customers modify or cancel an order after placing it, and within what time limit?**
  - Why it matters: Order-change requests are time-sensitive; the AI must know the cutoff to avoid promising impossible changes.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, customer_support, escalation
  - Required: yes
  - Example answer: Changes/cancellations allowed within 1 hour before fulfillment; after that, must return
  - Follow-up question: What should the AI do if the modification window has already passed?
- **ECOMMERCE-020. How should the AI handle exchange requests versus refund requests differently?**
  - Why it matters: Exchanges and refunds have different workflows, timelines, and stock checks the AI must not conflate.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: yes
  - Example answer: Exchanges ship replacement on receipt scan; refunds processed after warehouse inspection
  - Follow-up question: Do you offer instant exchanges before the original item is received back?

### Customer Qualification

- **ECOMMERCE-021. How should the AI determine whether a contact is a pre-sale shopper, an existing-order customer, or a wholesale/B2B inquiry?**
  - Why it matters: Routing by intent type lets the AI qualify, answer, or escalate appropriately and protects sales conversion.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, escalation
  - Required: yes
  - Example answer: Ask if they have an order number; bulk/reseller mentions route to wholesale team
  - Follow-up question: Do you have a separate wholesale process or minimum order quantity for B2B inquiries?
- **ECOMMERCE-022. What questions should the AI ask to help a shopper find the right product (use case, room, budget, recipient)?**
  - Why it matters: Guided discovery increases conversion and reduces returns from mismatched purchases.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Ask room/use, preferred color palette, budget range, and whether it's a gift
  - Follow-up question: Should the AI recommend specific products based on these answers or hand off to a stylist?

### FAQs

- **ECOMMERCE-026. What are your most common shipping-related questions and the approved answers (delivery time, lost package, wrong address)?**
  - Why it matters: Shipping FAQs are the highest-volume queries; pre-approved answers keep responses consistent and accurate.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Standard delivery 3-5 days; lost packages reported after 7 days trigger a carrier claim
  - Follow-up question: At what point should a delayed or lost-package query escalate to a human?
- **ECOMMERCE-027. What are your standard answers to returns, refunds, and exchange questions including timelines for money back?**
  - Why it matters: Refund-timeline expectations drive disputes; the AI must state them precisely.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Refunds issued to original payment within 5-7 business days after inspection
  - Follow-up question: Do you refund original shipping costs, and who pays return shipping?
- **ECOMMERCE-028. What sizing, fit, or product-spec questions come up most, and where are the reference guides?**
  - Why it matters: Sizing confusion drives returns; accurate fit guidance reduces them and improves satisfaction.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: no
  - Example answer: Bedding fit by mattress depth; size chart at /pages/size-guide
  - Follow-up question: Should the AI recommend sizing up or down for any specific product lines?
- **ECOMMERCE-029. What product care, warranty, or authenticity questions should the AI be ready to answer?**
  - Why it matters: Care and warranty info reduces post-purchase friction and supports upsell of protection plans.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: no
  - Example answer: Linens machine-wash cold; 1-year manufacturer warranty on lighting
  - Follow-up question: Do you offer extended warranties or care kits the AI can mention?
- **ECOMMERCE-030. What payment, billing, and checkout questions does the AI need pre-approved answers for?**
  - Why it matters: Checkout and billing confusion abandons carts; clear answers recover sales.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment
  - Required: no
  - Example answer: We accept Visa, MC, Amex, PayPal, Apple Pay; double charges auto-reverse in 3-5 days
  - Follow-up question: How should the AI respond to a customer who says they were charged but got no order confirmation?

### Staff / Team / Availability

- **ECOMMERCE-031. Who are the human team members or departments the AI can hand off to, and for what topics?**
  - Why it matters: Correct routing reduces resolution time and ensures sensitive issues reach the right person.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, staff_assignment
  - Required: yes
  - Example answer: Returns team, wholesale rep, billing/disputes specialist
  - Follow-up question: What is the contact method or channel for each team (email, Slack, ticket queue)?
- **ECOMMERCE-032. What is the expected human response time when the AI escalates a ticket, by channel?**
  - Why it matters: The AI should set accurate expectations so customers aren't left guessing after handoff.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, staff_assignment
  - Required: yes
  - Example answer: Email within 4 business hours; live chat handoff within 10 minutes during hours
  - Follow-up question: What response time should the AI promise for after-hours escalations?

### Communication Channels

- **ECOMMERCE-033. Which channels will the AI handle (WhatsApp, web chat, Instagram DM, email, SMS) and is one the primary?**
  - Why it matters: Channel mix determines formatting, attachments, and how order links and tracking are delivered.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, email, sms, customer_support
  - Required: yes
  - Example answer: WhatsApp (primary), web chat, Instagram DM, email
  - Follow-up question: Should responses differ in tone or length between, say, Instagram DM and email?

### Voice Call Behavior

- **ECOMMERCE-034. If the AI answers voice calls, how should it handle order lookups and when should it transfer to a person?**
  - Why it matters: Voice has different verification and transfer needs; clear rules prevent dead-ends on calls.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, customer_support, escalation
  - Required: no
  - Example answer: Read order status after verifying email; transfer billing disputes to a human immediately
  - Follow-up question: What is the voice greeting and what number should the AI transfer to?

### WhatsApp / Email / SMS Behavior

- **ECOMMERCE-035. On WhatsApp/SMS, should the AI send tracking links, order summaries, or images, and how concise should replies be?**
  - Why it matters: Messaging channels favor short, link-rich replies; this shapes the AI output format.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, sms, customer_support
  - Required: yes
  - Example answer: Send tracking link + 1-line status; keep replies under 3 sentences
  - Follow-up question: Are there approved message templates required for WhatsApp business-initiated messages?

### Follow-up Rules

- **ECOMMERCE-037. After resolving a query, should the AI follow up (delivery confirmation, satisfaction check) and on what schedule?**
  - Why it matters: Post-resolution follow-ups improve CSAT and surface unresolved issues before they become complaints.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, customer_support
  - Required: no
  - Example answer: Check in 2 days after delivery to confirm satisfaction and offer a review link
  - Follow-up question: How many follow-ups are acceptable before the AI stops to avoid spamming?
- **ECOMMERCE-040. For back-in-stock and waitlist follow-ups, how and when should the AI notify customers?**
  - Why it matters: Timely restock alerts recover otherwise-lost sales and capture demand signals.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign
  - Required: no
  - Example answer: Notify within 1 hour of restock with a direct add-to-cart link
  - Follow-up question: Should high-demand restocks include urgency messaging like limited quantity?

### Sales / Upsell Opportunities

- **ECOMMERCE-039. What cross-sell, upsell, or replenishment suggestions should the AI make and when?**
  - Why it matters: Well-timed recommendations raise AOV without feeling pushy.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up
  - Required: no
  - Example answer: Suggest matching pillowcases with duvets; remind to reorder consumables at 60 days
  - Follow-up question: Are there products you never want bundled or recommended together?

### Complaints / Escalation

- **ECOMMERCE-041. What complaint scenarios must the AI escalate immediately rather than attempt to resolve?**
  - Why it matters: Some issues (chargebacks, damaged-on-arrival, legal threats) need human handling to avoid liability.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: Chargebacks, allergic reactions, legal/press threats, repeated unresolved complaints
  - Follow-up question: Who should receive these urgent escalations and through what channel?
- **ECOMMERCE-042. How should the AI handle damaged, defective, or wrong-item-received reports?**
  - Why it matters: These are high-emotion, high-cost issues; consistent handling protects reputation and limits cost.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: Request a photo, offer reship or refund, no return needed under $30
  - Follow-up question: What dollar threshold or item type requires manager approval before offering a replacement?

### Payments / Deposits / Refunds

- **ECOMMERCE-043. What is your refund policy detail — method, timeline, partial refunds, and restocking fees?**
  - Why it matters: Precise refund rules prevent disputes and let the AI answer money-back questions confidently.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, payment, customer_support, faq
  - Required: yes
  - Example answer: Refund to original method in 5-7 days; 15% restocking fee on opened large items
  - Follow-up question: Can the AI offer store credit as an alternative, and is it ever a higher amount than a cash refund?
- **ECOMMERCE-044. How should the AI handle disputed charges, double charges, or failed payments?**
  - Why it matters: Payment disputes are sensitive and time-bound; mishandling triggers chargebacks.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, payment, escalation
  - Required: yes
  - Example answer: Explain pending authorizations drop in 3-5 days; escalate confirmed double charges to billing
  - Follow-up question: Should the AI ever tell a customer to contact their bank, or always handle it internally first?

### Industry-Specific Rules

- **ECOMMERCE-045. Are there product-specific rules the AI must enforce (age-restricted items, hazmat shipping, perishables, final-sale categories)?**
  - Why it matters: Restricted-product rules carry legal and shipping consequences the AI must never violate.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, faq
  - Required: yes
  - Example answer: Candles ship ground only; clearance items are final sale and non-returnable
  - Follow-up question: Are any items barred from international shipping or specific states?

### Compliance / Safety

- **ECOMMERCE-046. What privacy, data-handling, and consent rules must the AI follow (GDPR/CCPA, marketing opt-in, data deletion requests)?**
  - Why it matters: Privacy compliance is legally required; the AI must honor opt-ins and deletion requests correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, customer_support
  - Required: yes
  - Example answer: Honor GDPR/CCPA deletion requests; never add to marketing without explicit opt-in
  - Follow-up question: Who handles data-deletion or privacy requests when they come in?

### Customer Data Collection

- **ECOMMERCE-023. What customer details must the AI collect and store for order support (name, email, order number, phone)?**
  - Why it matters: Defines the minimum data set to resolve issues while staying within privacy limits.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, customer_support, compliance
  - Required: yes
  - Example answer: Name, email, order number, shipping ZIP
  - Follow-up question: Is a phone number ever required, or is email always sufficient for support?
- **ECOMMERCE-024. Should the AI capture and sync new contacts to your CRM, email list, or marketing platform, and with what consent?**
  - Why it matters: Lead capture fuels remarketing, but consent must be explicit to stay compliant.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, compliance, analytics
  - Required: yes
  - Example answer: Sync to Klaviyo only after the customer opts in to marketing messages
  - Follow-up question: What exact opt-in wording must the AI use before adding someone to marketing?
- **ECOMMERCE-025. How should the AI verify identity before sharing order details or processing changes?**
  - Why it matters: Identity verification prevents fraud and protects personal data on shared accounts.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, customer_support, compliance
  - Required: yes
  - Example answer: Match order number to the email on file before revealing address or status
  - Follow-up question: What should the AI do if the customer cannot pass verification?

### AI Tone / Personality

- **ECOMMERCE-036. What tone and personality should the AI use, and are there phrases or emojis to always use or avoid?**
  - Why it matters: Brand-consistent voice builds trust; banned phrases protect brand and legal positioning.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, customer_support
  - Required: yes
  - Example answer: Warm, helpful, lightly playful; use first name; avoid slang and over-promising
  - Follow-up question: Should the tone shift to more formal when handling complaints or refunds?

### Reporting / Analytics

- **ECOMMERCE-047. What conversation metrics and outcomes do you want reported (top question types, WISMO volume, resolution rate, recovered carts)?**
  - Why it matters: Reporting priorities shape what the AI logs and how performance and ROI are measured.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, reporting, analytics
  - Required: yes
  - Example answer: WISMO count, return-reason breakdown, CSAT, abandoned-cart recovery rate
  - Follow-up question: How often do you want these reports and in what format (dashboard, email digest)?
- **ECOMMERCE-048. What return reasons and product-issue trends should the AI capture for merchandising insight?**
  - Why it matters: Structured return-reason data drives product and listing improvements that cut future returns.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, reporting, analytics
  - Required: no
  - Example answer: Too small, color differs from photo, arrived damaged, changed mind
  - Follow-up question: Should the AI flag products with repeated identical complaints for review?

### Automation Triggers

- **ECOMMERCE-038. How should the AI handle abandoned carts — what message, what delay, and what incentive?**
  - Why it matters: Abandoned-cart recovery is a major revenue lever; timing and incentive rules must be explicit.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up, whatsapp
  - Required: no
  - Example answer: 1h: friendly reminder; 24h: offer 10% code if order over $50
  - Follow-up question: Should the AI only message customers who opted in, and stop after how many attempts?
- **ECOMMERCE-049. What events should automatically trigger an AI message (order shipped, delivery delayed, payment failed, review request)?**
  - Why it matters: Event-driven messaging reduces inbound WISMO and proactively manages customer expectations.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, follow_up, campaign, whatsapp
  - Required: no
  - Example answer: Shipped, out-for-delivery, delivered, delay over 2 days, payment failed
  - Follow-up question: Which of these should go out on WhatsApp versus email versus SMS?
- **ECOMMERCE-050. Under what conditions should the AI automatically pause automation and hand the entire conversation to a human?**
  - Why it matters: Clear auto-handoff rules prevent the AI from worsening high-risk or frustrated-customer situations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: After 2 failed resolution attempts, on angry sentiment, or on any legal/chargeback mention
  - Follow-up question: Should the AI notify the customer that a human is taking over, and in what wording?


## 12. Digital Marketing Agency

### Business Identity

- **MARKETING-001. What is the full legal and trading name of your agency, and how should the AI receptionist refer to it when greeting prospects?**
  - Why it matters: The AI must introduce the agency consistently and use the brand name customers recognise.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: Legal name: Brightwave Media Ltd. Trading as 'Brightwave Agency'.
  - Follow-up question: Are there any abbreviations or nicknames clients commonly use that the AI should also recognise?
- **MARKETING-002. What are your office hours and timezone, and is the agency fully remote, hybrid, or office-based?**
  - Why it matters: Determines when discovery calls can be booked and how the AI sets response-time expectations.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Mon-Fri 9:00-17:30 GMT, fully remote with clients worldwide.
  - Follow-up question: Do you take meetings outside these hours for clients in other timezones?
- **MARKETING-003. Which industries or niches does your agency specialise in (e.g. SaaS, e-commerce, local services, B2B)?**
  - Why it matters: Lets the AI qualify whether an inbound lead is a good fit and tailor the conversation.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: We specialise in DTC e-commerce brands and B2B SaaS companies.
  - Follow-up question: Are there any industries you do NOT work with or explicitly avoid?
- **MARKETING-004. What is your agency website URL and primary contact email for new business enquiries?**
  - Why it matters: The AI uses these to direct prospects and confirm where proposals or follow-ups will come from.
  - Expected answer type: `url`
  - Used for: ai_prompt, faq, email
  - Required: yes
  - Example answer: https://brightwave.agency, newbusiness@brightwave.agency
  - Follow-up question: Is there a separate portfolio or case-study page the AI should link to?
- **MARKETING-005. What is your agency's core value proposition or one-line elevator pitch?**
  - Why it matters: Gives the AI a consistent, on-brand answer to 'what do you do / why you?'.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: We help e-commerce brands scale profitably with paid social and conversion-focused SEO.
  - Follow-up question: What single result or proof point best demonstrates this claim?

### Services / Products

- **MARKETING-006. Which core service lines do you offer (SEO, PPC/paid ads, social media management, web design, content, email, branding)?**
  - Why it matters: Defines what the AI can sell and route enquiries toward.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: SEO, Google Ads, Meta Ads, social media management, web design.
  - Follow-up question: Which of these is your flagship or highest-margin service?
- **MARKETING-007. For your SEO offering, what specifically is included (technical audit, on-page, link building, content, local SEO)?**
  - Why it matters: Lets the AI answer scope questions accurately and avoid over-promising.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Technical audit, on-page optimisation, monthly content, and white-hat link building.
  - Follow-up question: Do you offer local SEO and Google Business Profile management separately?
- **MARKETING-008. For paid advertising, which platforms do you manage (Google, Meta, TikTok, LinkedIn, YouTube)?**
  - Why it matters: The AI must only commit to channels you actually run.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: no
  - Example answer: Google Ads, Meta Ads, TikTok Ads, LinkedIn Ads.
  - Follow-up question: Is there a minimum recommended monthly ad spend per platform?
- **MARKETING-009. Do you offer social media management, and what does a typical package include (content creation, posting, community management, reporting)?**
  - Why it matters: Clarifies social-media scope so the AI sets correct deliverable expectations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: 12 posts/month, content design, scheduling, community replies, monthly report.
  - Follow-up question: Do clients supply their own content or do you produce it all?
- **MARKETING-010. Do you offer web design/development, and is it standalone or bundled with marketing retainers?**
  - Why it matters: Helps the AI route web enquiries and explain how web fits into broader engagements.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: We offer web design as a standalone project and also bundled with SEO retainers.
  - Follow-up question: What platforms do you build on (WordPress, Webflow, Shopify, custom)?

### Pricing / Packages

- **MARKETING-011. What is your monthly retainer pricing range, and what tiers or packages do you offer?**
  - Why it matters: The AI needs price guidance to qualify budget and set expectations early.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Starter $2,500/mo, Growth $5,000/mo, Scale $10,000+/mo.
  - Follow-up question: What is the lowest retainer you will accept for a new client?
- **MARKETING-012. How do you charge for one-off projects (web build, SEO audit, brand identity) versus ongoing retainers?**
  - Why it matters: The AI must distinguish project fees from recurring fees when discussing cost.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: Projects are fixed-fee quotes; retainers are monthly. Audits start at $1,500.
  - Follow-up question: Are project deposits required before work begins?
- **MARKETING-013. Is management fee charged as a flat retainer, a percentage of ad spend, or hybrid?**
  - Why it matters: Pricing model strongly affects qualification and the AI's framing of cost to prospects.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Flat retainer up to $20k spend, then 15% of spend above that.
  - Follow-up question: Does the ad spend itself sit on top of your fee, paid directly by the client?
- **MARKETING-014. What is your minimum contract term or commitment for retainer clients?**
  - Why it matters: Lets the AI state commitment terms so prospects self-select before booking.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: 3-month minimum, then month-to-month with 30 days' notice.
  - Follow-up question: Is there a discount for clients who commit to 6 or 12 months upfront?
- **MARKETING-015. Should the AI share specific pricing with prospects, give a range, or only after a discovery call?**
  - Why it matters: Controls how openly pricing is disclosed in chat to protect deal positioning.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Share a starting-from range, then defer exact pricing to the discovery call.
  - Follow-up question: What range, if any, is the AI allowed to quote upfront?

### Booking / Appointment Rules

- **MARKETING-016. What is the standard discovery-call length and which calendar/booking tool do you use?**
  - Why it matters: The AI needs to book the correct slot type into the right system.
  - Expected answer type: `single_select`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: 30-minute discovery call via Calendly.
  - Follow-up question: Is there a longer strategy-call option for highly qualified leads?
- **MARKETING-017. What days and time windows are available for discovery calls, and how far in advance can prospects book?**
  - Why it matters: Defines bookable availability so the AI offers valid slots only.
  - Expected answer type: `time_range`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Tue-Thu, 10:00-16:00 GMT, bookable up to 2 weeks out.
  - Follow-up question: Do you require a minimum notice period before a call (e.g. 24 hours)?
- **MARKETING-018. Who on the team takes discovery calls, and should the AI assign by service line or availability?**
  - Why it matters: Ensures the right specialist or closer is matched to each prospect.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment
  - Required: yes
  - Example answer: Sarah (founder) takes all calls over $5k; the sales rep takes the rest.
  - Follow-up question: Should the AI route SEO vs paid-ads enquiries to different people?
- **MARKETING-019. What information must the AI collect before confirming a discovery call (company, website, budget, goals)?**
  - Why it matters: Pre-call qualification reduces no-shows and wasted time on unfit leads.
  - Expected answer type: `multi_select`
  - Used for: booking, lead_qualification
  - Required: yes
  - Example answer: Company name, website, monthly budget range, primary goal, and channels of interest.
  - Follow-up question: Should the AS decline to book if budget is below your minimum?
- **MARKETING-020. What are your rescheduling and no-show policies for discovery calls?**
  - Why it matters: The AI must explain and enforce policy consistently to protect calendar time.
  - Expected answer type: `long_text`
  - Used for: booking, faq, follow_up
  - Required: no
  - Example answer: One free reschedule with 12h notice; no-shows get one rebooking link, then closed.
  - Follow-up question: Should the AI auto-send a reminder before each scheduled call?

### Customer Qualification

- **MARKETING-021. What monthly marketing budget must a prospect have to be a qualified lead?**
  - Why it matters: Budget is the primary fit filter; the AI uses it to qualify or politely decline.
  - Expected answer type: `price`
  - Used for: lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Minimum $3,000/month total marketing budget including fees.
  - Follow-up question: How should the AI handle a promising lead who is just below the threshold?
- **MARKETING-022. What primary goals do you most often solve for (more leads, sales/ROAS, brand awareness, app installs)?**
  - Why it matters: Matching goal to capability ensures the AI only advances aligned prospects.
  - Expected answer type: `multi_select`
  - Used for: lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Lead generation, e-commerce sales/ROAS, and brand awareness.
  - Follow-up question: Which goal are you strongest at and want the AI to emphasise?
- **MARKETING-023. What company size or revenue range is your ideal client (employees, annual revenue, stage)?**
  - Why it matters: Helps the AI screen for fit beyond budget and tailor positioning.
  - Expected answer type: `single_select`
  - Used for: lead_qualification, ai_prompt
  - Required: no
  - Example answer: $1M-$20M annual revenue, 10-150 employees, post-product-market-fit.
  - Follow-up question: Do you take on early-stage startups or pre-revenue companies?

### FAQs

- **MARKETING-026. How quickly can clients expect to see results, and how should the AI set timeline expectations per service?**
  - Why it matters: Managing the 'how fast will it work?' question prevents mismatched expectations.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: yes
  - Example answer: Paid ads: 2-4 weeks for early data. SEO: 3-6 months for meaningful movement.
  - Follow-up question: Do you offer any performance guarantees or KPIs in the first 90 days?
- **MARKETING-027. Do clients own their ad accounts, assets, and reporting dashboards, and what happens to them if they leave?**
  - Why it matters: Ownership is a frequent objection; a clear answer builds trust.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Clients own all accounts and assets; we keep access during the engagement only.
  - Follow-up question: Is there an offboarding handover process the AI can describe?
- **MARKETING-028. What makes your agency different from competitors, and what proof do you have (case studies, results)?**
  - Why it matters: The AI needs differentiators and proof to handle 'why you over others?'.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Senior-only team, no junior handoffs; grew client X from $0 to $2M/yr in 14 months.
  - Follow-up question: Which case study should the AI cite most often, and is it shareable?
- **MARKETING-029. Do you work with clients in our industry/region and in our language, and any geographic restrictions?**
  - Why it matters: Quickly filters out clients you can't serve and reassures those you can.
  - Expected answer type: `long_text`
  - Used for: faq, lead_qualification
  - Required: no
  - Example answer: We serve UK, US, and EU clients in English; campaigns can run in multiple languages.
  - Follow-up question: Are there regions or markets you do not operate in?
- **MARKETING-030. What is required from the client to get started, and what does onboarding look like?**
  - Why it matters: Prospects often ask 'what do you need from me?'; a clear answer reduces friction.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Signed contract, deposit, account access, brand assets, and a 60-min kickoff call.
  - Follow-up question: How long does onboarding take before campaigns go live?

### Staff / Team / Availability

- **MARKETING-031. Who are the key team members and roles the AI should be able to name or route to?**
  - Why it matters: Lets the AI direct enquiries to the right person and sound informed.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, staff_assignment, escalation
  - Required: no
  - Example answer: Sarah - Founder/Strategy; Tom - Head of Paid; Mia - SEO Lead; Jay - Sales.
  - Follow-up question: Which team member should sales and partnership enquiries go to?

### Communication Channels

- **MARKETING-032. Which channels should the AI receptionist operate on (WhatsApp, website chat, email, SMS, voice)?**
  - Why it matters: Defines where the AI is deployed and how to greet on each.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, email, sms, voice_call
  - Required: yes
  - Example answer: Website chat, WhatsApp, and email; no voice for now.
  - Follow-up question: Is there a primary channel where most qualified leads come from?

### Voice Call Behavior

- **MARKETING-033. For inbound phone calls, should the AI fully qualify and book, or take a message and hand off to the team?**
  - Why it matters: Sets the scope and guardrails for the AI's voice interactions.
  - Expected answer type: `single_select`
  - Used for: voice_call, ai_prompt, escalation
  - Required: no
  - Example answer: Qualify, capture details, and book a discovery call; hand off complex queries.
  - Follow-up question: Should the AI offer to transfer to a live person during business hours?

### WhatsApp / Email / SMS Behavior

- **MARKETING-034. What is your target first-response time and after-hours behavior on WhatsApp and email?**
  - Why it matters: Sets SLA expectations and how the AI handles out-of-hours contacts.
  - Expected answer type: `long_text`
  - Used for: whatsapp, email, sms, ai_prompt
  - Required: no
  - Example answer: Reply within minutes during hours; after hours, acknowledge and book next-day call.
  - Follow-up question: Should the AI send a different message on weekends or holidays?

### Follow-up Rules

- **MARKETING-036. How should the AI follow up with leads who don't book a call after the first conversation?**
  - Why it matters: Defines the nurture cadence to recover undecided prospects without nagging.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, ai_prompt
  - Required: yes
  - Example answer: Follow up at 24h, 3 days, and 7 days, then move to monthly newsletter.
  - Follow-up question: After how many ignored follow-ups should the AI stop and mark the lead cold?
- **MARKETING-037. What should the AI do for booked leads before the call (reminders, prep materials, confirmation)?**
  - Why it matters: Pre-call nurture reduces no-shows and primes prospects to convert.
  - Expected answer type: `long_text`
  - Used for: follow_up, booking, email
  - Required: no
  - Example answer: Send confirmation, a 24h reminder, and a case study relevant to their goal.
  - Follow-up question: Should the AI send a short pre-call questionnaire to qualify deeper?

### Sales / Upsell Opportunities

- **MARKETING-038. When a lead enquires about one service, which complementary services should the AI suggest?**
  - Why it matters: Cross-selling raises deal size; the AI needs a clear bundling map.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, campaign
  - Required: no
  - Example answer: SEO leads -> suggest content + Google Ads; web design -> suggest ongoing SEO retainer.
  - Follow-up question: Is there a flagship bundle the AI should push when budget allows?
- **MARKETING-039. Should the AI offer existing clients upsells or upgrades (more channels, higher tier, add-on audits)?**
  - Why it matters: Existing-client expansion is high margin; the AI can surface relevant offers.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, campaign, follow_up
  - Required: no
  - Example answer: Yes - prompt clients on Starter to upgrade to Growth after 60 days of results.
  - Follow-up question: What signals should trigger an upsell offer to an existing client?

### Complaints / Escalation

- **MARKETING-040. How should the AI handle an unhappy client or a complaint about results or service?**
  - Why it matters: Mishandled complaints damage retention; the AI needs a calm escalation script.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Acknowledge, avoid making promises, log the issue, and escalate to the account manager.
  - Follow-up question: Who is the named escalation contact and what's their response SLA?
- **MARKETING-041. What situations must always be escalated to a human immediately (legal threats, refund demands, churn risk)?**
  - Why it matters: Hard escalation rules prevent the AI from mishandling high-stakes moments.
  - Expected answer type: `multi_select`
  - Used for: escalation, compliance, ai_prompt
  - Required: yes
  - Example answer: Cancellation requests, refund demands, legal/contract disputes, and press enquiries.
  - Follow-up question: How should the AI notify the team of an urgent escalation (Slack, SMS, email)?

### Payments / Deposits / Refunds

- **MARKETING-042. What payment terms apply (deposit, invoicing schedule, accepted methods) and what is your refund/cancellation policy?**
  - Why it matters: The AI must answer billing questions and state policy consistently.
  - Expected answer type: `long_text`
  - Used for: payment, faq, ai_prompt
  - Required: yes
  - Example answer: 50% deposit on projects; retainers billed monthly in advance; no refunds on delivered work.
  - Follow-up question: Can the AI send a payment or deposit link, or only the human team?

### Industry-Specific Rules

- **MARKETING-045. Are there exclusivity rules or conflicts of interest (e.g. only one client per niche/region) the AI must enforce?**
  - Why it matters: Agencies often promise category exclusivity; the AI must not over-commit.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, compliance
  - Required: no
  - Example answer: We take only one client per local market per service to avoid conflicts.
  - Follow-up question: How should the AI respond if a prospect's competitor is already a client?
- **MARKETING-046. What reporting and communication cadence do clients receive (weekly check-ins, monthly reports, dashboards)?**
  - Why it matters: Prospects ask about reporting; the AI must describe your standard cadence.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, reporting
  - Required: no
  - Example answer: Live dashboard access, biweekly calls, and a monthly performance report.
  - Follow-up question: Is there a dedicated account manager for every client?

### Compliance / Safety

- **MARKETING-043. What claims or promises is the AI strictly forbidden from making (guaranteed rankings, specific ROI, traffic numbers)?**
  - Why it matters: Prevents legally risky or platform-violating guarantees in conversation.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt
  - Required: yes
  - Example answer: Never guarantee #1 rankings, specific ROAS, or fixed lead counts.
  - Follow-up question: How should the AI phrase results when a prospect pushes for guarantees?
- **MARKETING-044. What data-protection and consent rules apply (GDPR/CCPA), and what consent must the AI capture before storing contact data?**
  - Why it matters: Lead capture must be lawful; the AI must obtain and record consent.
  - Expected answer type: `long_text`
  - Used for: compliance, customer_support, ai_prompt
  - Required: yes
  - Example answer: GDPR applies; capture explicit opt-in consent before storing or marketing to contacts.
  - Follow-up question: Where should the AI link your privacy policy during data collection?

### Customer Data Collection

- **MARKETING-024. What contact and business details should the AI capture from every inbound lead?**
  - Why it matters: Standardised data capture feeds your CRM and downstream follow-up.
  - Expected answer type: `multi_select`
  - Used for: lead_qualification, analytics, follow_up
  - Required: yes
  - Example answer: Name, email, phone, company, website, budget, goal, how they heard of us.
  - Follow-up question: Which CRM or tool should these details be pushed into?
- **MARKETING-025. Should the AI ask how the prospect heard about you and capture their current marketing situation?**
  - Why it matters: Attribution and current-state context sharpen qualification and reporting.
  - Expected answer type: `yes_no`
  - Used for: lead_qualification, analytics, reporting
  - Required: no
  - Example answer: Yes - capture referral source and whether they currently work with an agency.
  - Follow-up question: Should the AI ask what's currently NOT working in their marketing?

### AI Tone / Personality

- **MARKETING-035. What tone and personality should the AI use (e.g. confident and consultative, friendly and casual, premium and formal)?**
  - Why it matters: Tone must match your brand and resonate with your buyer persona.
  - Expected answer type: `single_select`
  - Used for: ai_prompt
  - Required: yes
  - Example answer: Confident, consultative, and concise - like a senior strategist, not a salesperson.
  - Follow-up question: Are there words, emojis, or phrases the AI should always or never use?

### Reporting / Analytics

- **MARKETING-047. What lead and conversation metrics do you want the AI to track and report on?**
  - Why it matters: Defines the analytics the AI should log so you can measure pipeline performance.
  - Expected answer type: `multi_select`
  - Used for: analytics, reporting
  - Required: yes
  - Example answer: Leads captured, qualified rate, calls booked, no-show rate, and source attribution.
  - Follow-up question: How often and to whom should the AI deliver these reports?
- **MARKETING-048. Should the AI tag and segment leads (by service interest, budget tier, source) for reporting and routing?**
  - Why it matters: Segmentation enables accurate reporting and smarter follow-up campaigns.
  - Expected answer type: `yes_no`
  - Used for: analytics, reporting, lead_qualification
  - Required: no
  - Example answer: Yes - tag by service, budget tier (low/mid/high), and acquisition source.
  - Follow-up question: Which segment matters most for prioritising sales follow-up?

### Automation Triggers

- **MARKETING-049. What events should automatically trigger an AI action (qualified lead -> notify sales, booking -> add to CRM, no-show -> rebook)?**
  - Why it matters: Defines the automation rules connecting the AI to your workflows.
  - Expected answer type: `multi_select`
  - Used for: follow_up, booking, staff_assignment, analytics
  - Required: yes
  - Example answer: Qualified lead -> Slack alert to sales; booked call -> create CRM deal; no-show -> rebook link.
  - Follow-up question: Which tools (Slack, HubSpot, Zapier) should these triggers connect to?
- **MARKETING-050. When a high-value lead (above a budget threshold) comes in, what immediate automated action should fire?**
  - Why it matters: Fast routing of premium leads protects conversion of your best opportunities.
  - Expected answer type: `long_text`
  - Used for: escalation, follow_up, staff_assignment
  - Required: no
  - Example answer: Leads above $10k/mo budget -> instant alert to founder and priority booking link.
  - Follow-up question: What budget threshold defines a high-value lead for this trigger?


## 13. School / Academy

### Business Identity

- **SCHOOL-001. What is the official name of your school or academy as it should appear in messages and on enrollment documents?**
  - Why it matters: The receptionist must introduce the institution consistently and parents must recognise it on receipts and admission letters.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, whatsapp, email
  - Required: yes
  - Example answer: Bright Future Academy
  - Follow-up question: Do you also have a shorter nickname or abbreviation parents commonly use?
- **SCHOOL-002. What type of institution are you (e.g. preschool, K-12 school, tuition centre, coaching academy, language institute, music/arts academy)?**
  - Why it matters: The category shapes the vocabulary, age range, and admission flow the receptionist should assume.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: After-school tuition and coaching academy
  - Follow-up question: Do you serve a specific exam board or curriculum (e.g. CBSE, IGCSE, IB, A-Levels)?
- **SCHOOL-003. What are the full addresses of all your campuses or branches?**
  - Why it matters: Parents frequently ask for directions and the receptionist must route trial-class and tour bookings to the correct campus.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: yes
  - Example answer: Main campus: 12 Park Road, Springfield. Branch: 88 Lake Avenue, Springfield.
  - Follow-up question: Which campus is the default for new enquiries if a parent does not specify one?
- **SCHOOL-004. What are your operating hours and term/semester calendar (term start/end dates and holiday breaks)?**
  - Why it matters: Admission availability, trial-class scheduling and follow-up timing all depend on knowing when the school is open and when terms begin.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Mon-Fri 8am-6pm, Sat 9am-1pm. Term 1: Sep 1-Dec 15; winter break Dec 16-Jan 5.
  - Follow-up question: Do you accept mid-term admissions or only at the start of a term?
- **SCHOOL-005. What languages should the receptionist be able to communicate in with parents and students?**
  - Why it matters: Many families prefer a home language; the receptionist must match the parent's language for clear admission communication.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: English, Spanish
  - Follow-up question: Which language should be used by default when a parent's preference is unknown?

### Services / Products

- **SCHOOL-006. What courses, programs, or grade levels do you offer, and for what age range each?**
  - Why it matters: This is the core catalogue the receptionist uses to match a child to the right program and answer 'do you teach X?' questions.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Math & Science tuition (Grades 6-12), English & language arts (Grades 1-10), SAT/ACT prep, coding bootcamp (ages 10-16).
  - Follow-up question: Are any programs currently full or with a waitlist?
- **SCHOOL-007. What is the class format for each program (in-person, online, hybrid) and the typical class size?**
  - Why it matters: Parents compare format and group size when choosing; the receptionist must state these accurately to qualify and convert leads.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: In-person group classes (max 12), online live classes, and 1-on-1 tutoring available for all subjects.
  - Follow-up question: Do you offer 1-on-1 tutoring as an upgrade from group classes?
- **SCHOOL-008. What weekly schedule options exist per program (days, times, batch slots)?**
  - Why it matters: The receptionist needs available batch slots to offer parents a workable time and to book trial classes.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Math batches: Mon/Wed 4-5:30pm or Tue/Thu 5-6:30pm; Saturday morning intensive 9-12.
  - Follow-up question: Can students switch batch slots after enrolling if their availability changes?
- **SCHOOL-009. Do you provide any extra or value-added services (transport/van service, meals, after-care, exam prep, study materials, certificates)?**
  - Why it matters: These influence the parent's decision and create upsell opportunities the receptionist should surface.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, campaign
  - Required: no
  - Example answer: Pickup/drop van service, printed study packs, and free monthly mock tests.
  - Follow-up question: Are these services included in tuition or charged separately?
- **SCHOOL-010. What makes your academy different from nearby competitors (results, teacher credentials, methodology, accreditation)?**
  - Why it matters: The receptionist uses these differentiators to persuade undecided parents and answer 'why should I choose you?'.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, campaign
  - Required: no
  - Example answer: 95% of our Grade 12 students improved by at least one grade; all teachers are subject-certified with 5+ years experience.
  - Follow-up question: Do you have recent result statistics or testimonials we can quote?

### Pricing / Packages

- **SCHOOL-011. What is the tuition fee for each course or grade level, and how is it billed (per month, per term, per year)?**
  - Why it matters: Fees are the most common question; the receptionist must quote accurate, current pricing per program and billing cycle.
  - Expected answer type: `long_text`
  - Used for: pricing, ai_prompt, faq
  - Required: yes
  - Example answer: Math tuition $180/month; full Grade 10 package $1,600/term; coding bootcamp $900 for 12 weeks.
  - Follow-up question: Do prices differ between in-person and online formats?
- **SCHOOL-012. What one-time fees apply (registration/admission fee, materials, exam fees, uniform, security deposit)?**
  - Why it matters: Parents need the total cost of enrolment, not just tuition; hidden fees cause drop-off if not disclosed.
  - Expected answer type: `long_text`
  - Used for: pricing, ai_prompt, faq
  - Required: yes
  - Example answer: One-time admission fee $100, materials kit $45 per subject.
  - Follow-up question: Is the registration fee refundable if the student does not start?
- **SCHOOL-013. Do you offer installment plans for tuition, and if so what are the terms (number of installments, due dates, late fees)?**
  - Why it matters: Installments are a major affordability lever; the receptionist must explain plans accurately to close enrolments.
  - Expected answer type: `long_text`
  - Used for: pricing, payment, ai_prompt
  - Required: yes
  - Example answer: Annual fee can be split into 3 installments (start of each term); $20 late fee after 7 days.
  - Follow-up question: Is there a discount for paying the full year upfront?
- **SCHOOL-014. What discounts or scholarships do you offer (sibling discount, early-bird, merit scholarship, referral, financial aid)?**
  - Why it matters: Discounts are decisive for many families; the receptionist should proactively mention eligible ones to convert.
  - Expected answer type: `multi_select_or_text`
  - Used for: pricing, campaign, ai_prompt
  - Required: no
  - Example answer: 10% sibling discount, 5% early-bird before Aug 1, merit scholarships for top performers.
  - Follow-up question: What documents or criteria are needed to qualify for a scholarship?
- **SCHOOL-015. Do you bundle multiple subjects or siblings into a package price, and what is the bundle pricing?**
  - Why it matters: Bundles raise average enrolment value and the receptionist can upsell parents enquiring about a single subject.
  - Expected answer type: `long_text`
  - Used for: pricing, campaign, ai_prompt
  - Required: no
  - Example answer: All-subjects package $450/month (vs $180 per subject); two siblings billed at 1.8x single rate.
  - Follow-up question: Should the receptionist always suggest the all-subjects bundle when a parent asks about two or more subjects?

### Booking / Appointment Rules

- **SCHOOL-016. What bookable appointment types do you offer for prospective families (free trial class, campus tour, counselling session, assessment test)?**
  - Why it matters: The receptionist must know which appointment types exist before it can offer and schedule them.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Free trial class, campus tour, and a placement assessment.
  - Follow-up question: Which of these is the preferred first step you want most leads to take?
- **SCHOOL-017. What are the rules for booking a trial class or tour (advance notice required, available days/times, duration, max per family)?**
  - Why it matters: The receptionist needs concrete scheduling constraints to avoid double-booking or offering invalid slots.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Trials run Mon-Fri 4-6pm, 1 hour, book at least 24h ahead, one free trial per subject per child.
  - Follow-up question: Can a parent attend the trial class with their child or do they wait outside?
- **SCHOOL-018. What is your cancellation, rescheduling, and no-show policy for trial classes and tours?**
  - Why it matters: Clear policy lets the receptionist handle changes consistently and reduces wasted teacher time.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, follow_up
  - Required: yes
  - Example answer: Reschedule allowed up to 4h before; no-shows are offered one more slot, then asked to book again later.
  - Follow-up question: Should the receptionist send a reminder before the trial, and how long before?
- **SCHOOL-019. What information must be collected from a parent before a trial class or tour is confirmed?**
  - Why it matters: Staff need the child's grade and goals in advance to assign the right teacher and prepare the session.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, lead_qualification, staff_assignment
  - Required: yes
  - Example answer: Child's name, age/grade, subject of interest, current school, parent contact number.
  - Follow-up question: Which of these fields are mandatory versus optional to confirm the booking?
- **SCHOOL-020. How should the receptionist handle admission/enrolment requests outside the open admission window?**
  - Why it matters: Mid-term or waitlist handling differs from normal admission, and the receptionist must respond appropriately rather than promise availability.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, follow_up
  - Required: yes
  - Example answer: Add them to a waitlist, take details, and inform them admissions reopen for the next term.
  - Follow-up question: Should waitlisted families be automatically contacted when admissions reopen?

### Customer Qualification

- **SCHOOL-021. What questions should the receptionist ask to qualify a prospective student (current grade, subjects needed, academic goals, exam target)?**
  - Why it matters: Qualifying upfront lets the receptionist recommend the right program and pass quality leads to staff.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Ask grade level, target exam, weak subjects, preferred schedule, and whether they want group or 1-on-1.
  - Follow-up question: Is there a particular goal (exam, grade improvement) that signals a high-priority lead?
- **SCHOOL-022. Are there any eligibility or admission requirements (minimum grade/age, entrance test, prerequisites)?**
  - Why it matters: The receptionist should not enroll or promise admission to ineligible students and must explain requirements clearly.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, faq
  - Required: yes
  - Example answer: SAT prep requires Grade 10+; advanced math requires passing a short placement test.
  - Follow-up question: Who decides admission after the placement test, and how is the result communicated?
- **SCHOOL-023. How should the receptionist handle enquiries for a child whose needs you do not serve (wrong age, subject not offered, special-needs support beyond capacity)?**
  - Why it matters: Honest, kind redirection protects reputation and avoids mis-enrolment; the bot needs a defined fallback.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, escalation
  - Required: no
  - Example answer: Politely explain we don't offer that, and suggest the closest program or refer them elsewhere if possible.
  - Follow-up question: Do you have partner institutions you refer families to?

### FAQs

- **SCHOOL-026. What are the most common questions parents ask before enrolling, and what are your approved answers?**
  - Why it matters: A curated FAQ lets the receptionist answer instantly and accurately instead of guessing.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: yes
  - Example answer: Q: What's the teacher-student ratio? A: Max 12 per class. Q: Do you give homework? A: Yes, weekly assignments.
  - Follow-up question: Are there any answers that change seasonally (e.g. during exam season)?
- **SCHOOL-027. What is your policy on missed classes, make-up sessions, and absences?**
  - Why it matters: This is a frequent parent concern; the receptionist must state the policy clearly to set expectations.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: yes
  - Example answer: One make-up class allowed per month if notified 24h in advance; no refunds for missed classes.
  - Follow-up question: Is there a limit on how many make-up classes a student can take per term?
- **SCHOOL-028. How do you communicate student progress to parents (report cards, parent-teacher meetings, app, frequency)?**
  - Why it matters: Parents want to know how they'll track results; the receptionist should answer this to build confidence.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Monthly progress reports via WhatsApp plus a parent-teacher meeting each term.
  - Follow-up question: Do you offer a parent portal or app to track attendance and grades?
- **SCHOOL-029. What are your homework, attendance, and discipline expectations and policies?**
  - Why it matters: Parents ask about expectations before enrolling; consistent answers prevent later disputes.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Homework assigned weekly; 80% attendance required; three discipline warnings trigger a parent meeting.
  - Follow-up question: Should attendance issues be escalated to staff automatically?
- **SCHOOL-030. What questions should the receptionist NEVER answer on its own and always defer to staff (e.g. individual student grades, disciplinary cases, legal/custody matters)?**
  - Why it matters: Some topics are sensitive or confidential; the bot must escalate rather than improvise.
  - Expected answer type: `multi_select_or_text`
  - Used for: faq, escalation, compliance
  - Required: yes
  - Example answer: Individual grades, disciplinary action, custody disputes, refund disputes.
  - Follow-up question: Who specifically should these be routed to?

### Staff / Team / Availability

- **SCHOOL-031. Who are the teachers/staff and what subjects, grades, or roles does each handle?**
  - Why it matters: The receptionist needs this to assign trial classes and route subject-specific questions to the right person.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: yes
  - Example answer: Ms. Rivera - Math Grades 6-10; Mr. Chen - Physics & SAT; Admin: Sara handles enrolments.
  - Follow-up question: Should the receptionist share specific teacher names with parents, or keep assignments internal?
- **SCHOOL-032. What are the availability windows for booking trial classes and counselling with staff?**
  - Why it matters: Offering slots staff cannot honour creates no-shows; the receptionist must respect real availability.
  - Expected answer type: `time_range`
  - Used for: booking, staff_assignment
  - Required: yes
  - Example answer: Trials and counselling Mon-Fri 3-6pm; admissions office Sat 9am-12pm.
  - Follow-up question: Are there blackout dates (exam weeks, holidays) when no trials should be booked?

### Communication Channels

- **SCHOOL-033. Which channels do you want the receptionist to operate on (WhatsApp, voice calls, SMS, email, Instagram, website chat)?**
  - Why it matters: Channel coverage defines where the receptionist responds and how parents can reach the school.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, voice_call, email, sms
  - Required: yes
  - Example answer: WhatsApp, voice calls, and email.
  - Follow-up question: Which channel do most of your parents prefer for enquiries?

### Voice Call Behavior

- **SCHOOL-034. How should the receptionist behave on voice calls (greeting script, when to take a message, when to transfer to a human, after-hours handling)?**
  - Why it matters: Voice is high-stakes for first impressions; the bot needs a clear script and escalation rules.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Greet as 'Bright Future Academy', answer fees/schedule questions, transfer urgent or complaint calls to the office, take a message after hours.
  - Follow-up question: What phone number or person should urgent calls be transferred to?

### WhatsApp / Email / SMS Behavior

- **SCHOOL-035. What are your rules for WhatsApp, email, and SMS messaging (response time targets, what can be shared via each, sending fee links or documents)?**
  - Why it matters: Each channel has different norms; the receptionist must know what content is allowed and how fast to reply.
  - Expected answer type: `long_text`
  - Used for: whatsapp, email, sms, ai_prompt
  - Required: yes
  - Example answer: WhatsApp for quick Q&A and booking; email for formal admission letters and fee invoices; reply within 15 minutes during hours.
  - Follow-up question: Are you allowed to send fee invoices or payment links over WhatsApp?

### Follow-up Rules

- **SCHOOL-038. How should the receptionist follow up with parents who enquired or attended a trial but did not enroll (timing, number of attempts, channel)?**
  - Why it matters: Most enrolments happen after follow-up; defined rules prevent both lost leads and over-messaging.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, campaign
  - Required: yes
  - Example answer: Follow up 1 day after trial, again after 3 days, then a final nudge after 1 week; max 3 attempts.
  - Follow-up question: What message or offer should the final follow-up include to encourage enrolment?
- **SCHOOL-039. How should the receptionist remind parents about upcoming fee installments or renewal at the start of a new term?**
  - Why it matters: Timely reminders reduce late payments and dropouts at term transitions.
  - Expected answer type: `long_text`
  - Used for: follow_up, payment, campaign
  - Required: no
  - Example answer: Send a friendly reminder 5 days before each installment due date and 2 weeks before term renewal.
  - Follow-up question: Should the reminder include the payment link directly?

### Sales / Upsell Opportunities

- **SCHOOL-040. What upsell or cross-sell opportunities should the receptionist suggest (additional subjects, 1-on-1 upgrade, exam-prep crash courses, holiday camps)?**
  - Why it matters: Defined upsell logic increases revenue per family without feeling pushy.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Offer an extra subject, a 1-on-1 upgrade before exams, and summer holiday camps.
  - Follow-up question: At what point in the conversation should the receptionist introduce an upsell?

### Complaints / Escalation

- **SCHOOL-041. How should the receptionist handle complaints from parents (about teaching, fees, a teacher, or a child's safety) and when must it escalate to a human?**
  - Why it matters: Complaints, especially safety-related, must be handled with care and routed quickly to the right person.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Acknowledge, apologise, log details, and immediately escalate safety or teacher complaints to the principal.
  - Follow-up question: Who is the designated person for complaint escalation and how should they be alerted?

### Payments / Deposits / Refunds

- **SCHOOL-044. What payment methods do you accept and how should the receptionist take or request payment (links, bank transfer, in-person)?**
  - Why it matters: The receptionist must guide parents to a valid payment path to complete enrolment.
  - Expected answer type: `multi_select_or_text`
  - Used for: payment, ai_prompt, faq
  - Required: yes
  - Example answer: Card via payment link, bank transfer, and cash at the office.
  - Follow-up question: Should the receptionist send a payment link automatically once a parent confirms enrolment?
- **SCHOOL-045. What is your deposit and refund policy for admission fees and tuition?**
  - Why it matters: Refund questions are common and sensitive; the receptionist must state the policy precisely to avoid disputes.
  - Expected answer type: `long_text`
  - Used for: payment, faq, ai_prompt
  - Required: yes
  - Example answer: Admission fee is non-refundable; tuition refundable on a pro-rata basis if withdrawn within the first two weeks.
  - Follow-up question: Should refund requests be auto-escalated to staff rather than handled by the receptionist?

### Industry-Specific Rules

- **SCHOOL-046. Are there curriculum, exam-board, or accreditation rules the receptionist must reference accurately (board alignment, syllabus coverage, certification)?**
  - Why it matters: Parents choosing by curriculum expect precise, correct information; errors damage trust.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: no
  - Example answer: We follow the CBSE syllabus for Grades 6-12 and are an accredited Cambridge exam prep centre.
  - Follow-up question: Are there any claims about accreditation the receptionist must NOT make until verified?

### Compliance / Safety

- **SCHOOL-042. What guardian consent and safeguarding rules must the receptionist follow when interacting about or with a minor?**
  - Why it matters: Schools have legal duties around minors; the receptionist must obtain consent and avoid unsupervised data sharing.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Only share student info with the verified guardian; require guardian consent before booking or storing a minor's data; never arrange contact with a student without guardian involvement.
  - Follow-up question: Do you require explicit consent confirmation before the receptionist stores a child's personal details?
- **SCHOOL-043. How should the receptionist respond if a message raises a child welfare or safety concern (disclosure of harm, distress, emergency)?**
  - Why it matters: Welfare disclosures are critical safeguarding events that must never be handled by the bot alone.
  - Expected answer type: `long_text`
  - Used for: compliance, escalation, ai_prompt
  - Required: yes
  - Example answer: Do not attempt to advise; immediately escalate to the designated safeguarding lead and, if an emergency, direct them to emergency services.
  - Follow-up question: Who is your designated safeguarding lead and what is their emergency contact?

### Customer Data Collection

- **SCHOOL-024. What student and parent data should the receptionist collect and store for every new enquiry or enrolment?**
  - Why it matters: A defined data set ensures consistent records for admission, billing, and follow-up without over-collecting.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, compliance, reporting
  - Required: yes
  - Example answer: Student name, DOB, grade; parent/guardian name, phone, email, relationship to child.
  - Follow-up question: Do you require the student's previous school or report card at enrolment?
- **SCHOOL-025. How should the receptionist verify and record who the legal guardian or primary contact for a minor is?**
  - Why it matters: For minors, communication and consent must go to a verified guardian; getting this wrong is a safeguarding and legal risk.
  - Expected answer type: `long_text`
  - Used for: compliance, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Record the parent/guardian's full name, relationship, and contact; flag if a different adult will collect the child.
  - Follow-up question: Should the receptionist collect an authorised pickup list for each student?

### AI Tone / Personality

- **SCHOOL-036. What tone and personality should the receptionist use with parents and students (warm, formal, professional, encouraging)?**
  - Why it matters: Tone must match a school's trust-based, family-facing brand; the wrong tone undermines confidence.
  - Expected answer type: `single_select`
  - Used for: ai_prompt
  - Required: yes
  - Example answer: Warm, reassuring, and professional - like a friendly admissions counsellor.
  - Follow-up question: Should the tone differ when speaking to a student directly versus a parent?
- **SCHOOL-037. Are there words, phrases, claims, or promises the receptionist must avoid (e.g. guaranteeing exam results, ranking guarantees)?**
  - Why it matters: Overpromising academic outcomes is misleading and risky; clear guardrails protect the school's credibility.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance
  - Required: yes
  - Example answer: Never guarantee specific grades or admission to a particular university; avoid criticising other schools.
  - Follow-up question: Is there approved language for describing your results without making a guarantee?

### Reporting / Analytics

- **SCHOOL-047. What metrics do you want reported from the receptionist's activity (enquiries received, trials booked, trial-to-enrolment conversion, top subjects asked about)?**
  - Why it matters: Reporting lets the school measure lead quality and the receptionist's contribution to enrolment.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics
  - Required: no
  - Example answer: Weekly count of enquiries, trials booked, enrolments, and most-requested subjects.
  - Follow-up question: How often and through which channel should these reports be delivered?
- **SCHOOL-048. Which lead sources do you want tracked (referral, Instagram, Google, walk-in, sibling) and how should the receptionist capture them?**
  - Why it matters: Source tracking shows which marketing works and helps the receptionist tailor follow-up.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, lead_qualification
  - Required: no
  - Example answer: Ask 'How did you hear about us?' and log: referral, Instagram, Google, flyer, walk-in.
  - Follow-up question: Should the receptionist always ask the lead source, or only when not obvious?

### Automation Triggers

- **SCHOOL-049. What automated actions should fire on key events (e.g. send a welcome pack on enrolment, alert staff on a new trial booking, send a reminder before a class)?**
  - Why it matters: Defined triggers turn the receptionist from reactive Q&A into an operational assistant that reduces admin load.
  - Expected answer type: `long_text`
  - Used for: follow_up, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: On enrolment: send welcome message + fee schedule; on trial booking: notify the assigned teacher; 1h before trial: send parent a reminder.
  - Follow-up question: Which of these triggers is highest priority to set up first?
- **SCHOOL-050. Under what conditions should the receptionist automatically hand the conversation over to a human (keywords, complaint, safety concern, high-value enrolment, repeated confusion)?**
  - Why it matters: A clear handover trigger prevents the bot from mishandling sensitive or complex cases.
  - Expected answer type: `multi_select_or_text`
  - Used for: escalation, ai_prompt
  - Required: yes
  - Example answer: Hand over on complaints, safety concerns, refund disputes, custody/legal mentions, or after the bot fails to answer twice.
  - Follow-up question: During off-hours, should these be queued for the next morning or sent as an urgent alert?


## 14. Event Planner

### Business Identity

- **EVENTS-001. What is the official name of your event planning business as it should appear in all customer conversations?**
  - Why it matters: The receptionist must greet clients and sign off using the exact brand name to sound authentic and avoid confusion.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, whatsapp, email
  - Required: yes
  - Example answer: Evergreen Events & Celebrations
  - Follow-up question: Do you have a shorter nickname or trading name clients commonly use?
- **EVENTS-002. Which city, region, or service area do you cover for events?**
  - Why it matters: The AI must qualify whether a client's venue or location is within reach before quoting or booking a consultation.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Greater London plus a 50-mile radius; destination weddings on request.
  - Follow-up question: Do you charge travel fees for events outside your core area?
- **EVENTS-003. What are your office or studio working hours and time zone?**
  - Why it matters: Lets the AI set response-time expectations and offer consultation slots only when staff are available.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Mon-Fri 9:00-18:00, Sat 10:00-14:00, GMT.
  - Follow-up question: Are you reachable for event-day emergencies outside these hours?
- **EVENTS-004. How long has your business been operating and roughly how many events do you plan per year?**
  - Why it matters: Credibility cues help the AI build trust and answer prospective clients asking about experience.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: 8 years in business, around 60 events per year.
  - Follow-up question: What is the largest event you have successfully delivered?
- **EVENTS-005. What makes your event planning service different from competitors (your key selling points)?**
  - Why it matters: The AI uses these differentiators to position the brand persuasively during sales conversations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Full in-house decor team, dedicated day-of coordinator, and a fixed no-surprise pricing guarantee.
  - Follow-up question: Do you have any awards or notable client testimonials to mention?

### Services / Products

- **EVENTS-006. Which event types do you plan (weddings, corporate, birthdays, conferences, private parties, etc.)?**
  - Why it matters: Determines which inquiries the AI can confidently handle versus politely decline or redirect.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Weddings, corporate galas, milestone birthdays, baby showers, product launches.
  - Follow-up question: Is there any event type you specifically do NOT take on?
- **EVENTS-007. Which planning service levels do you offer (full planning, partial planning, day-of coordination)?**
  - Why it matters: Service tiers map directly to pricing and to the questions the AI asks to qualify a lead.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Full planning, partial planning, day-of coordination.
  - Follow-up question: Which service level is your most popular or recommended starting point?
- **EVENTS-008. Which production elements do you provide in-house (decor, catering, florals, AV, entertainment)?**
  - Why it matters: The AI must know what is bundled versus outsourced so it answers scope questions accurately.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: In-house decor and florals; catering, AV, and entertainment via vetted partners.
  - Follow-up question: Can clients bring their own vendors, or must they use your partners?
- **EVENTS-009. Do you offer any add-on services such as photography, transport, or guest accommodation coordination?**
  - Why it matters: Add-ons feed upsell prompts and let the AI present a complete solution rather than a bare package.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: no
  - Example answer: Photography, videography, valet/transport, hotel block booking, and gifting.
  - Follow-up question: Are these add-ons priced individually or in bundles?
- **EVENTS-010. What is the minimum and maximum guest count you can accommodate?**
  - Why it matters: Lets the AI screen out events that are too small or too large for your operating model.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Minimum 20 guests, maximum 800 guests.
  - Follow-up question: Do very small or very large events carry different pricing structures?

### Pricing / Packages

- **EVENTS-011. What are your standard packages and their starting prices for each event type?**
  - Why it matters: Gives the AI concrete figures to quote and to qualify budget-fit before booking a consultation.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Wedding full planning from $6,000; corporate from $4,500; party day-of from $1,200.
  - Follow-up question: Are these prices flat fees, percentages of event budget, or per-guest?
- **EVENTS-012. How is your planning fee calculated (flat fee, percentage of total budget, or per-guest)?**
  - Why it matters: Pricing model changes how the AI gathers budget and guest data before giving an estimate.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: 15% of total event budget, with a $2,000 minimum fee.
  - Follow-up question: Is there a minimum fee regardless of how small the event is?
- **EVENTS-013. What deposit amount or percentage is required to secure a booking?**
  - Why it matters: The AI needs the exact deposit terms to explain payment expectations and trigger payment links.
  - Expected answer type: `price`
  - Used for: ai_prompt, payment, booking
  - Required: yes
  - Example answer: 30% non-refundable deposit due at contract signing.
  - Follow-up question: When is the remaining balance due relative to the event date?
- **EVENTS-014. Do you offer custom or bespoke packages outside the standard tiers?**
  - Why it matters: Tells the AI whether to quote fixed prices or route high-budget clients to a tailored consultation.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: no
  - Example answer: Yes, fully bespoke packages for budgets above $25,000.
  - Follow-up question: What budget level triggers a custom proposal rather than a standard package?
- **EVENTS-015. Are there any seasonal, peak-date, or weekend surcharges clients should know about?**
  - Why it matters: Prevents the AI from quoting low when premium dates carry higher pricing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: no
  - Example answer: Saturdays in May-September carry a 20% peak surcharge; bank holidays +15%.
  - Follow-up question: Are there off-peak dates where you offer discounts?

### Booking / Appointment Rules

- **EVENTS-016. How should clients book an initial consultation (call, video, or in-person), and how long does it last?**
  - Why it matters: Defines the booking object the AI creates and the resources it must reserve.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: 45-minute video consultation via Zoom, booked through our calendar.
  - Follow-up question: Is the first consultation free or paid?
- **EVENTS-017. How far in advance must an event be booked before you can take it on?**
  - Why it matters: The AI must reject or flag last-minute requests that cannot realistically be delivered.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Minimum 8 weeks lead time; weddings ideally 6+ months out.
  - Follow-up question: Do you accept rush bookings, and is there a rush fee?
- **EVENTS-018. How should the AI check whether a requested event date is available?**
  - Why it matters: Date availability is the single most common gating question for an event planner; the AI must handle it correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Check the shared Google Calendar; we take a maximum of 2 events per weekend.
  - Follow-up question: What is the maximum number of events you can run on the same day?
- **EVENTS-019. What is your cancellation and rescheduling policy for consultations and confirmed events?**
  - Why it matters: The AI must state policy clearly to avoid disputes and protect deposits.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment
  - Required: yes
  - Example answer: Consultations reschedule free with 24h notice; event deposits are non-refundable but transferable once.
  - Follow-up question: Is there a fee for rescheduling a confirmed event date?
- **EVENTS-020. Should the AI confirm a booking instantly or route requests to a human for approval first?**
  - Why it matters: Controls whether the AI can finalize bookings autonomously or must hand off for manual confirmation.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking, escalation
  - Required: yes
  - Example answer: Auto-confirm consultations; route actual event bookings to a planner for approval.
  - Follow-up question: Who should receive the booking approval requests?

### Customer Qualification

- **EVENTS-021. What event type is the client planning, and what is the occasion?**
  - Why it matters: Event type drives every downstream qualification path, pricing, and service recommendation.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Wedding reception for 150 guests.
  - Follow-up question: Is this a multi-day or single-day event?
- **EVENTS-022. What is the client's preferred event date or date range?**
  - Why it matters: Date is required to check availability and is the primary booking constraint.
  - Expected answer type: `date_time`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Saturday 14 September 2026.
  - Follow-up question: Is the date fixed, or are you flexible by a few weeks?
- **EVENTS-023. How many guests does the client expect to attend?**
  - Why it matters: Guest count determines venue scale, catering, staffing, and price; it is a core qualifier.
  - Expected answer type: `number`
  - Used for: ai_prompt, lead_qualification, pricing
  - Required: yes
  - Example answer: Approximately 120 guests.
  - Follow-up question: Is this a confirmed number or an early estimate?
- **EVENTS-024. What is the client's total budget range for the event?**
  - Why it matters: Budget lets the AI recommend the right package and filter out non-viable leads early.
  - Expected answer type: `price`
  - Used for: ai_prompt, lead_qualification, pricing
  - Required: yes
  - Example answer: $15,000-$20,000 total.
  - Follow-up question: Does that budget include or exclude the venue cost?

### FAQs

- **EVENTS-026. Do clients need to have a venue booked before contacting you, or do you help find one?**
  - Why it matters: A frequent first question; a clear answer prevents the AI from stalling on venue logistics.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: no
  - Example answer: No venue needed first; venue sourcing is included in full and partial planning.
  - Follow-up question: Do you charge separately for venue sourcing?
- **EVENTS-027. Do you handle vendor coordination and contracts on the client's behalf?**
  - Why it matters: Clarifies scope of coordination so the AI sets accurate expectations.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Yes, we source, negotiate, and manage all vendor contracts and timelines.
  - Follow-up question: Are vendor costs paid through you or directly by the client?
- **EVENTS-028. What is included in day-of coordination versus full planning?**
  - Why it matters: Confusion between tiers is common; a crisp comparison helps the AI sell the right service.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, pricing
  - Required: no
  - Example answer: Day-of covers timeline and on-site management; full planning covers everything from concept to cleanup.
  - Follow-up question: Can a client upgrade from day-of to full planning later?
- **EVENTS-029. Do you carry liability insurance, and can you provide a certificate for venues?**
  - Why it matters: Many venues require proof of insurance; the AI should answer confidently to reassure clients.
  - Expected answer type: `yes_no`
  - Used for: faq, ai_prompt, compliance
  - Required: no
  - Example answer: Yes, we hold $2M public liability insurance and can provide certificates.
  - Follow-up question: How quickly can you supply an insurance certificate to a venue?
- **EVENTS-030. Can clients see a portfolio or examples of past events before committing?**
  - Why it matters: Social proof is a key conversion lever; the AI should know where to point clients.
  - Expected answer type: `url`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: no
  - Example answer: Yes, full portfolio at evergreenevents.com/gallery and on Instagram @evergreenevents.
  - Follow-up question: Do you have references from clients with similar events?

### Staff / Team / Availability

- **EVENTS-031. Who are the planners or coordinators, and which event types or roles do they handle?**
  - Why it matters: Lets the AI route inquiries to the right specialist and check the correct person's availability.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, staff_assignment, booking
  - Required: yes
  - Example answer: Sarah leads weddings, Marcus handles corporate, Priya manages day-of coordination.
  - Follow-up question: Should clients be able to request a specific planner?

### Communication Channels

- **EVENTS-032. Which channels should the AI receptionist operate on (WhatsApp, voice, email, SMS, web chat)?**
  - Why it matters: Defines where the AI is active and how it should adapt tone and format per channel.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, voice_call, email, sms
  - Required: yes
  - Example answer: WhatsApp, email, and inbound voice calls.
  - Follow-up question: Which channel do most of your clients prefer?

### Voice Call Behavior

- **EVENTS-033. How should the AI greet and handle inbound phone calls, and when should it transfer to a human?**
  - Why it matters: Sets the voice persona and the hand-off rules so callers get a smooth, on-brand experience.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Greet warmly, capture event details, transfer to a planner for budgets over $30k or urgent dates.
  - Follow-up question: Should the AI offer to take a message when no planner is available?

### WhatsApp / Email / SMS Behavior

- **EVENTS-034. How quickly should the AI respond on each channel, and should it send proposals or brochures automatically?**
  - Why it matters: Sets response SLAs and controls whether documents are auto-sent versus reviewed by a human.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, email, sms, follow_up
  - Required: no
  - Example answer: Reply within 5 minutes; auto-send the brochure PDF, but route custom proposals to a planner.
  - Follow-up question: Which document should the AI send first to a new wedding lead?

### Follow-up Rules

- **EVENTS-036. How and when should the AI follow up with leads who inquired but did not book?**
  - Why it matters: Event sales cycles are long; structured follow-up recovers leads that would otherwise go cold.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign
  - Required: yes
  - Example answer: Follow up at 48 hours, 1 week, and 1 month with tailored messages and a portfolio link.
  - Follow-up question: After how many unanswered follow-ups should the AI stop and mark the lead cold?
- **EVENTS-037. How should the AI follow up after a consultation to move the client toward signing?**
  - Why it matters: Post-consultation follow-up is the highest-conversion moment; timing and content matter.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign
  - Required: no
  - Example answer: Send a recap and proposal within 24h, then a gentle nudge at day 3 and day 7.
  - Follow-up question: Should the AI offer a limited-time incentive to encourage faster signing?

### Sales / Upsell Opportunities

- **EVENTS-038. Which upsells or add-ons should the AI proactively suggest, and at what point in the conversation?**
  - Why it matters: Well-timed upsells lift average order value without feeling intrusive.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up
  - Required: no
  - Example answer: Suggest photography and floral upgrades after the package is selected; offer transport for 100+ guests.
  - Follow-up question: Are there bundle discounts the AI can mention to encourage upsells?
- **EVENTS-039. Should the AI run promotional campaigns for off-peak dates or seasonal events?**
  - Why it matters: Filling slow dates improves revenue; the AI can broadcast targeted offers if permitted.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, campaign, follow_up
  - Required: no
  - Example answer: Yes, promote winter weekday weddings with a 15% planning-fee discount.
  - Follow-up question: Which months are slowest and most in need of promotion?

### Complaints / Escalation

- **EVENTS-040. How should the AI handle complaints or upset clients, and who should it escalate to?**
  - Why it matters: Events are high-stakes and emotional; mishandled complaints damage reputation fast.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: Acknowledge, apologize, never argue, and escalate to the lead planner within 15 minutes.
  - Follow-up question: Which issues require immediate phone escalation versus a logged ticket?
- **EVENTS-041. What event-day emergencies must be escalated to a human immediately?**
  - Why it matters: On the event day, certain problems cannot wait for asynchronous handling.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, escalation, voice_call
  - Required: yes
  - Example answer: Vendor no-show, venue access problems, weather emergencies, medical incidents.
  - Follow-up question: What emergency phone number should the AI route these to?

### Payments / Deposits / Refunds

- **EVENTS-042. What payment methods do you accept and how should the AI share payment links?**
  - Why it matters: The AI must collect deposits smoothly using only your approved methods.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, payment, booking
  - Required: yes
  - Example answer: Card via Stripe link, bank transfer, and split-payment plans on request.
  - Follow-up question: Do you offer installment plans for larger events?
- **EVENTS-043. What is your refund policy for deposits and cancellations at different timelines?**
  - Why it matters: Refund rules vary by how close to the event a cancellation occurs; the AI must state them precisely.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, payment, faq
  - Required: yes
  - Example answer: Deposit non-refundable; 50% refund if cancelled 60+ days out, no refund within 30 days.
  - Follow-up question: Are refunds ever credited toward a future rescheduled event?

### Industry-Specific Rules

- **EVENTS-044. What rules govern vendor coordination, timelines, and venue restrictions the AI should know?**
  - Why it matters: Event delivery hinges on vendor and venue logistics; the AI should reflect these constraints to clients.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, booking
  - Required: no
  - Example answer: Final guest count due 14 days out; venues set noise curfews and load-in windows we must honor.
  - Follow-up question: Is there a deadline for clients to finalize their vendor and menu choices?

### Compliance / Safety

- **EVENTS-045. What safety, licensing, and consent requirements apply (alcohol licenses, fire safety, GDPR data consent)?**
  - Why it matters: Non-compliance creates legal and safety risk; the AI must collect consent and flag licensing needs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, lead_qualification
  - Required: yes
  - Example answer: Capacity limits enforced, alcohol service needs a TEN license, and GDPR consent required before storing data.
  - Follow-up question: Should the AI require an explicit data-consent confirmation before saving a lead?

### Customer Data Collection

- **EVENTS-025. What contact details and event details should the AI always collect from a new inquiry?**
  - Why it matters: Standardizes the lead record so planners have everything needed to follow up and quote.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, follow_up
  - Required: yes
  - Example answer: Full name, phone, email, event type, date, guest count, budget, venue status.
  - Follow-up question: Should the AI ask how the client heard about you?
- **EVENTS-046. What additional event-specific details should the AI capture (theme, dietary needs, accessibility, VIPs)?**
  - Why it matters: Rich event details reduce back-and-forth and let planners prepare an accurate proposal faster.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, follow_up
  - Required: no
  - Example answer: Theme/style, dietary restrictions, accessibility needs, VIP guests, must-have vendors.
  - Follow-up question: Should the AI ask about cultural or religious traditions to be honored?

### AI Tone / Personality

- **EVENTS-035. What tone and personality should the AI use when speaking with clients?**
  - Why it matters: Event clients are emotionally invested; tone must match the brand and the occasion's significance.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, whatsapp, voice_call, email
  - Required: yes
  - Example answer: Warm, polished, celebratory, and reassuring without being pushy.
  - Follow-up question: Should the tone shift for corporate clients versus wedding clients?

### Reporting / Analytics

- **EVENTS-047. Which metrics should the AI track and report (inquiries, consultations booked, conversion rate, revenue by event type)?**
  - Why it matters: Defines the reporting outputs the owner needs to understand pipeline and AI performance.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, reporting, analytics
  - Required: yes
  - Example answer: Weekly inquiries, consultation bookings, lead-to-booking conversion, revenue by event type.
  - Follow-up question: How often and to whom should these reports be sent?
- **EVENTS-048. Should the AI track which marketing source each lead came from?**
  - Why it matters: Source attribution shows which channels drive the best clients and informs ad spend.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, reporting, analytics
  - Required: no
  - Example answer: Yes, capture source (Instagram, referral, Google, wedding fair) for every lead.
  - Follow-up question: Which marketing sources currently bring you the most bookings?

### Automation Triggers

- **EVENTS-049. What automated actions should fire when a deposit is paid or a booking is confirmed?**
  - Why it matters: Automating post-booking steps removes manual work and ensures nothing falls through the cracks.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, booking, payment
  - Required: no
  - Example answer: On deposit paid: send confirmation, add to calendar, notify planner, schedule a planning-call invite.
  - Follow-up question: Should a welcome packet be emailed automatically after the deposit clears?
- **EVENTS-050. What time-based reminders should the AI send automatically before an event?**
  - Why it matters: Pre-event reminders for balance payments and final counts keep events on track without manual chasing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign, payment
  - Required: no
  - Example answer: 30-day balance reminder, 14-day final guest count request, 2-day event-day logistics confirmation.
  - Follow-up question: Should the AI also send a post-event thank-you and review request?


## 15. Travel Agency

### Business Identity

- **TRAVEL-001. What is the registered name of your travel agency and any trading/brand name customers know you by?**
  - Why it matters: The AI must greet callers and message senders with the exact name customers recognize, avoiding confusion between legal and brand identities.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Wanderlust Travels Ltd, known to customers as Wanderlust Holidays.
  - Follow-up question: Should the AI use the legal name or the brand name when answering calls and messages?
- **TRAVEL-002. What are your office locations and the primary service area or markets you sell trips from?**
  - Why it matters: Lets the AI confirm coverage, set correct time zones for callbacks, and tell customers where they can meet an advisor in person.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Head office in Manchester city centre, branch in Leeds; we serve customers across the UK and book worldwide travel.
  - Follow-up question: Do you offer in-person consultations at the office or only phone/online?
- **TRAVEL-003. What are your standard opening hours and time zone, including any out-of-hours emergency travel support?**
  - Why it matters: The AI needs accurate hours to set callback expectations, route urgent in-trip emergencies, and avoid promising contact when staff are unavailable.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, voice_call, booking
  - Required: yes
  - Example answer: Mon-Fri 9am-6pm, Sat 10am-4pm (GMT); 24/7 emergency line for travelers currently abroad.
  - Follow-up question: What qualifies as an emergency that the AI should escalate after hours?
- **TRAVEL-004. What licenses, bonding, or memberships do you hold (e.g. ABTA, ATOL, IATA) that the AI can cite to reassure customers?**
  - Why it matters: Travelers often ask whether their money is protected; the AI must state genuine credentials to build trust and meet advertising rules.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, compliance
  - Required: yes
  - Example answer: ATOL protected (number 12345), ABTA member (Y1234), IATA accredited agent.
  - Follow-up question: Should the AI proactively mention financial protection when quoting packages?
- **TRAVEL-005. How would you describe your agency's specialty and positioning (luxury, budget, adventure, corporate, family, etc.)?**
  - Why it matters: Shapes how the AI frames recommendations and qualifies leads so messaging matches the type of traveler you want to attract.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, campaign
  - Required: yes
  - Example answer: We specialise in luxury honeymoons and tailor-made safaris; mid-to-high budget couples and families.
  - Follow-up question: Are there any trip types or destinations you do NOT want the AI to promote?

### Services / Products

- **TRAVEL-006. Which core services do you offer (flights, hotels, full packages, cruises, tours, visa assistance, travel insurance)?**
  - Why it matters: Defines what the AI can offer and prevents it from quoting or promising services you don't actually provide.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Full holiday packages, flight-only, hotel-only, cruises, escorted tours, visa assistance, and travel insurance.
  - Follow-up question: Which of these is your highest-margin or most-promoted service?
- **TRAVEL-007. What are your most popular destinations and signature tour packages the AI should know in detail?**
  - Why it matters: Allows the AI to make confident, specific recommendations and answer questions about your flagship products without escalating.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, campaign
  - Required: yes
  - Example answer: Maldives all-inclusive, Dubai city breaks, Thailand 10-day tour, European river cruises, Turkey package holidays.
  - Follow-up question: Do any of these packages have fixed departure dates the AI should reference?
- **TRAVEL-008. Do you provide visa and passport assistance, and for which countries or visa types?**
  - Why it matters: Visa questions are extremely common; the AI must know your scope so it gives accurate guidance and routes complex cases to staff.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: We assist with UAE, Schengen, US ESTA, and Turkey e-visa applications; we do not handle work or immigration visas.
  - Follow-up question: Should the AI collect passport details, or only confirm interest and pass to a visa specialist?
- **TRAVEL-009. Do you offer corporate or group travel services, and what minimum group size applies?**
  - Why it matters: Group and corporate bookings follow different pricing and approval rules; the AI must identify and route these leads correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, staff_assignment
  - Required: no
  - Example answer: Yes, group rates for 10+ travelers and dedicated corporate accounts with monthly invoicing.
  - Follow-up question: Who should the AI assign corporate enquiries to?
- **TRAVEL-010. What add-on services can you sell alongside a trip (airport transfers, excursions, lounge access, car hire, travel insurance)?**
  - Why it matters: Enables the AI to surface relevant extras during booking, increasing average order value without overstepping your offering.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, campaign, faq
  - Required: no
  - Example answer: Airport transfers, private excursions, fast-track security, car hire, and comprehensive travel insurance.
  - Follow-up question: Which add-on should the AI always offer to attach to a booking?

### Pricing / Packages

- **TRAVEL-011. How is pricing structured for your packages (per person, per room, fixed package price, dynamic)?**
  - Why it matters: The AI must explain quotes correctly so customers understand what is included and avoid disputes over per-person vs total cost.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: Mostly per person sharing a twin/double room, with single supplements for solo travelers.
  - Follow-up question: Should the AI quote per person or total trip price by default?
- **TRAVEL-012. What starting or 'from' prices can the AI quote for your most common packages?**
  - Why it matters: Lets the AI give realistic price anchors to qualify budget early without committing to a firm price that requires a live search.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Dubai 4-night from £499pp, Maldives 7-night from £1,899pp, Turkey 7-night all-inclusive from £429pp.
  - Follow-up question: Should the AI always add 'subject to availability and final quote' when stating prices?
- **TRAVEL-013. What deposit amount or percentage is required to confirm a booking?**
  - Why it matters: Deposits secure bookings and trigger payment flows; the AI must state the exact amount so customers know what to pay to hold a trip.
  - Expected answer type: `price`
  - Used for: ai_prompt, payment, booking
  - Required: yes
  - Example answer: £150 per person deposit, or 20% of total package price, whichever is higher.
  - Follow-up question: When is the full balance due relative to the departure date?
- **TRAVEL-014. Do you offer installment or 'pay monthly' plans, and what are the terms?**
  - Why it matters: Payment flexibility is a strong selling point; the AI must present accurate plan details to convert hesitant budget-conscious travelers.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, payment
  - Required: no
  - Example answer: Yes, spread the balance over up to 6 monthly payments with no interest if booked 90+ days before departure.
  - Follow-up question: Is there a minimum trip value required to qualify for installments?
- **TRAVEL-015. What is typically included versus excluded in your package prices (taxes, baggage, meals, transfers)?**
  - Why it matters: Clear inclusion/exclusion handling prevents complaints and lets the AI answer 'is X included?' instantly and accurately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: yes
  - Example answer: Includes flights, 23kg baggage, accommodation, and airport taxes; excludes meals unless all-inclusive, and resort fees.
  - Follow-up question: Are there any common hidden costs the AI should warn customers about upfront?

### Booking / Appointment Rules

- **TRAVEL-016. Do customers book directly through a consultation/appointment, or can the AI take a booking request immediately?**
  - Why it matters: Defines whether the AI schedules a call with an advisor or captures a booking request, shaping the entire conversation flow.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: Most bookings start with a free 20-minute consultation with a travel advisor; the AI books that appointment.
  - Follow-up question: Are consultations offered by phone, video, or in person?
- **TRAVEL-017. How far in advance should customers book consultations, and what are your available consultation time slots?**
  - Why it matters: The AI needs valid scheduling windows so it only offers slots that exist and respects advisor availability.
  - Expected answer type: `time_range`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: Consultations available next-day onward, in 30-minute slots between 9:30am and 5:30pm Mon-Fri.
  - Follow-up question: What is the minimum notice required to book a same-day consultation?
- **TRAVEL-018. What is your policy for rescheduling or cancelling a consultation appointment?**
  - Why it matters: Lets the AI handle change requests consistently and reduce no-shows by communicating clear rules.
  - Expected answer type: `long_text`
  - Used for: booking, faq, ai_prompt
  - Required: no
  - Example answer: Customers can reschedule free up to 2 hours before; repeated no-shows may be deprioritised.
  - Follow-up question: Should the AI send a confirmation and reminder before each consultation?
- **TRAVEL-019. What essential details must the AI capture before booking a consultation or quote request?**
  - Why it matters: Ensures advisors arrive prepared with destination, dates, and party size so consultations are productive.
  - Expected answer type: `multi_select`
  - Used for: booking, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Destination, travel dates or month, number of travelers, budget range, and preferred contact method.
  - Follow-up question: Which of these is mandatory before a consultation can be confirmed?
- **TRAVEL-020. How should the AI handle urgent or last-minute trip requests (departing within 7 days)?**
  - Why it matters: Last-minute travel has tighter availability and different handling; the AI must flag and fast-track these to avoid lost sales.
  - Expected answer type: `long_text`
  - Used for: booking, escalation, ai_prompt
  - Required: no
  - Example answer: Flag as urgent, attempt to connect to an available advisor immediately, and mark the lead high priority.
  - Follow-up question: Is there a dedicated advisor or hotline for last-minute bookings?

### Customer Qualification

- **TRAVEL-021. What destination and trip-type questions should the AI ask first to qualify a traveler?**
  - Why it matters: Front-loading destination and trip type lets the AI route to the right specialist and tailor recommendations early.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Where are you thinking of going, is it a beach/city/tour holiday, and is it a special occasion?
  - Follow-up question: Should the AI suggest destinations if the customer is undecided?
- **TRAVEL-022. How should the AI capture travel dates or flexibility (fixed dates vs flexible month)?**
  - Why it matters: Date flexibility hugely affects pricing and availability; the AI must record it so advisors can find the best deals.
  - Expected answer type: `date_time`
  - Used for: lead_qualification, booking, ai_prompt
  - Required: yes
  - Example answer: Ask for exact dates if known, otherwise a target month and whether dates are flexible by a few days.
  - Follow-up question: Is there a peak-season surcharge the AI should mention for certain months?
- **TRAVEL-023. What details about the travel party should the AI collect (number of adults, children and ages, accessibility needs)?**
  - Why it matters: Party composition drives room types, child pricing, and special arrangements; missing it leads to inaccurate quotes.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking, ai_prompt
  - Required: yes
  - Example answer: Number of adults, number and ages of children, and any mobility or dietary requirements.
  - Follow-up question: Do you need exact child ages because some hotels price by age bands?
- **TRAVEL-025. How should the AI ask about budget without putting customers off?**
  - Why it matters: Budget is the most important qualifier but is sensitive; phrasing it well improves data quality and conversion.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, pricing, ai_prompt
  - Required: yes
  - Example answer: Ask 'roughly what budget per person are you working with?' framed as helping find the best matching options.
  - Follow-up question: Should budget be captured per person or as a total trip figure?

### FAQs

- **TRAVEL-026. What are the most common visa and entry-requirement questions, and how should the AI answer them?**
  - Why it matters: Visa questions dominate enquiries; consistent, cautious answers reduce risk and free up advisors.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: Do I need a visa for Dubai/Turkey/USA, how long does it take, and what documents are needed; AI gives general guidance and refers to official sources.
  - Follow-up question: Should the AI always add a disclaimer that visa rules are the traveler's responsibility to verify?
- **TRAVEL-027. What baggage allowance and airline policy questions should the AI be ready to answer?**
  - Why it matters: Baggage confusion causes complaints; standard answers keep customers informed before they travel.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: no
  - Example answer: Hand vs hold baggage limits, how to add extra bags, and that allowances vary by airline and fare type.
  - Follow-up question: Can customers add extra baggage through you, and at what cost?
- **TRAVEL-028. What are your most frequent refund and cancellation FAQs, and the standard answers?**
  - Why it matters: Refund questions are high-stakes; precise answers prevent disputes and manage expectations from the start.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: Are deposits refundable (no), what cancellation charges apply by timeframe, and how refunds are processed.
  - Follow-up question: Should the AI quote the cancellation charge schedule or always route refunds to a human?
- **TRAVEL-029. What payment and pricing FAQs come up most (currency, card fees, price changes before final payment)?**
  - Why it matters: Payment confusion stalls bookings; the AI answering confidently keeps customers moving toward confirmation.
  - Expected answer type: `long_text`
  - Used for: faq, pricing, payment
  - Required: no
  - Example answer: Prices are in GBP, no card surcharge on debit cards, and the price is fixed once the deposit is paid.
  - Follow-up question: Are prices guaranteed at quote time or only once a deposit is paid?
- **TRAVEL-030. What travel insurance and health FAQs should the AI handle (vaccinations, COVID rules, medical cover)?**
  - Why it matters: Health and insurance questions affect whether a trip is safe and legal; consistent answers reduce liability.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, compliance
  - Required: no
  - Example answer: We strongly recommend travel insurance, advise checking vaccination requirements on official health sites, and can sell cover.
  - Follow-up question: Should the AI require customers to confirm they have insurance before departure?

### Staff / Team / Availability

- **TRAVEL-048. Who are your advisors, their specialties, and how should the AI route leads to the right person?**
  - Why it matters: Matching leads to the right specialist improves conversion and customer experience; the AI needs a routing map.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, ai_prompt, booking
  - Required: yes
  - Example answer: Sara handles luxury and honeymoons, Ahmed handles Hajj/Umrah and Middle East, Tom handles cruises and Europe.
  - Follow-up question: If the matching specialist is unavailable, should the AI assign anyone or hold the lead?

### Communication Channels

- **TRAVEL-031. Which channels should the AI handle, and which is the primary channel for travel enquiries (phone, WhatsApp, email, SMS)?**
  - Why it matters: Determines where the AI operates and how it directs customers to the fastest path for their enquiry type.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: WhatsApp and phone are primary; email for detailed quotes and SMS for booking reminders.
  - Follow-up question: If a customer phones with a complex quote, should the AI move them to WhatsApp or email?

### Voice Call Behavior

- **TRAVEL-032. How should the AI behave on inbound calls, including greeting, when to transfer, and how to take messages?**
  - Why it matters: Voice is high-touch; clear rules ensure callers feel handled and complex cases reach a human advisor promptly.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Greet with the brand name, qualify destination/dates, book a callback if no advisor is free, and transfer urgent in-trip emergencies.
  - Follow-up question: What phrases or situations should always trigger a live transfer?

### WhatsApp / Email / SMS Behavior

- **TRAVEL-033. How should the AI use WhatsApp, email, and SMS differently (quote attachments, itineraries, reminders)?**
  - Why it matters: Each channel suits different content; correct usage keeps long itineraries readable and reminders timely.
  - Expected answer type: `long_text`
  - Used for: whatsapp, email, sms
  - Required: yes
  - Example answer: WhatsApp for quick chat and photos, email for full itineraries and invoices, SMS for time-sensitive reminders only.
  - Follow-up question: Should detailed quotes always be sent by email rather than WhatsApp?
- **TRAVEL-035. What languages should the AI communicate in, and should it match the customer's language automatically?**
  - Why it matters: Multilingual support widens your market and avoids losing leads who message in another language.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: no
  - Example answer: English primary; respond in Urdu, Arabic, or Spanish if the customer writes in those languages.
  - Follow-up question: Should quotes and itineraries also be sent in the customer's chosen language?

### Follow-up Rules

- **TRAVEL-036. When and how often should the AI follow up on a quote that hasn't been confirmed?**
  - Why it matters: Travel decisions take time; well-timed follow-ups recover bookings without annoying customers into opting out.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, ai_prompt
  - Required: yes
  - Example answer: Follow up 24 hours after a quote, again at day 3 with availability reminder, and a final nudge at day 7.
  - Follow-up question: Should follow-ups stop automatically after a certain number of attempts?
- **TRAVEL-037. What pre-departure and post-trip follow-ups should the AI send (balance reminders, travel tips, review requests)?**
  - Why it matters: Lifecycle messaging reduces missed payments, improves the trip experience, and generates reviews and repeat bookings.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, customer_support
  - Required: no
  - Example answer: Balance-due reminder 14 days before deadline, pre-departure checklist 7 days before, and a review request 3 days after return.
  - Follow-up question: Should the AI request a review on a specific platform like Google or Trustpilot?

### Sales / Upsell Opportunities

- **TRAVEL-038. Which upsells and cross-sells should the AI offer, and at what point in the conversation?**
  - Why it matters: Timely upsells raise average booking value; the AI needs to know what to offer and when to avoid being pushy.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: Offer room upgrades and excursions after destination is chosen, and insurance plus transfers before payment.
  - Follow-up question: Is there a priority order for which upsells the AI should try first?
- **TRAVEL-039. What promotions, seasonal deals, or loyalty offers should the AI mention to drive bookings?**
  - Why it matters: Active offers create urgency and reward repeat customers; the AI must present current, accurate deals only.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, follow_up
  - Required: no
  - Example answer: Free child place on selected summer packages, £100 off for returning customers, early-bird discounts before December.
  - Follow-up question: How will you keep the AI updated when promotions change or expire?

### Complaints / Escalation

- **TRAVEL-041. How should the AI handle complaints, and what types must be escalated to a human immediately?**
  - Why it matters: Travel complaints can be urgent and emotional; clear escalation rules protect customers and your reputation.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Acknowledge and apologise, log details, and immediately escalate stranded travelers, flight cancellations, and refund disputes.
  - Follow-up question: Who is the named contact or team for handling escalated complaints?
- **TRAVEL-042. What is the emergency protocol if a customer is already abroad and has an urgent problem?**
  - Why it matters: In-trip emergencies are time-critical; the AI must connect customers to the right help fast, day or night.
  - Expected answer type: `long_text`
  - Used for: escalation, voice_call, customer_support
  - Required: yes
  - Example answer: Provide the 24/7 emergency number, capture location and issue, and alert the on-call duty manager immediately.
  - Follow-up question: What information must the AI collect before escalating an in-destination emergency?

### Payments / Deposits / Refunds

- **TRAVEL-045. What payment methods do you accept, and how should the AI take or request payment?**
  - Why it matters: Smooth, secure payment handling is essential; the AI must guide customers to approved methods and never mishandle card data.
  - Expected answer type: `multi_select_or_text`
  - Used for: payment, ai_prompt, booking
  - Required: yes
  - Example answer: Card via secure payment link, bank transfer, and pay-monthly plans; AI sends a secure link and never collects card numbers in chat.
  - Follow-up question: Should the AI send a secure payment link rather than ever asking for card details directly?
- **TRAVEL-046. What is your full refund and cancellation policy by timeframe before departure?**
  - Why it matters: Refund rules vary by how close to departure a cancellation is; the AI needs the exact schedule to set correct expectations.
  - Expected answer type: `long_text`
  - Used for: payment, faq, compliance
  - Required: yes
  - Example answer: Deposit non-refundable; 60+ days lose deposit, 30-59 days 50% charge, under 30 days 100% charge; refunds in 14 days.
  - Follow-up question: Are there supplier-specific cancellation rules the AI should mention for flights or cruises?

### Industry-Specific Rules

- **TRAVEL-047. Are there destination-specific or seasonal rules the AI must apply (peak pricing, monsoon seasons, religious holidays, minimum stays)?**
  - Why it matters: Travel has many context-specific constraints; the AI must apply them so it doesn't recommend unsuitable dates or destinations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Avoid Maldives in May-Sep monsoon, flag Hajj-season Saudi restrictions, and note 7-night minimum stays at some resorts.
  - Follow-up question: Which destinations have rules the AI most often needs to warn customers about?

### Compliance / Safety

- **TRAVEL-043. How should the AI handle travel advisories, restricted destinations, and government safety warnings?**
  - Why it matters: Selling travel to advised-against destinations carries legal and safety risk; the AI must follow your policy strictly.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: If a destination has a government advisory, the AI must flag it, refer to official guidance, and escalate to an advisor.
  - Follow-up question: Should the AI refuse to quote destinations under an active 'do not travel' advisory?
- **TRAVEL-044. What passport, document, and entry-rule disclaimers must the AI always communicate?**
  - Why it matters: Passport validity and entry rules are the traveler's legal responsibility; clear disclaimers reduce liability and denied boardings.
  - Expected answer type: `long_text`
  - Used for: compliance, faq, ai_prompt
  - Required: yes
  - Example answer: Passport must have 6 months validity; the AI states the traveler is responsible for valid passports, visas, and entry compliance.
  - Follow-up question: Should the AI verify passport validity dates before confirming a booking?

### Customer Data Collection

- **TRAVEL-024. What contact details must the AI collect and store for a lead or booking?**
  - Why it matters: Reliable contact data lets advisors follow up and send quotes; missing details mean lost leads.
  - Expected answer type: `multi_select`
  - Used for: lead_qualification, follow_up, customer_support
  - Required: yes
  - Example answer: Full name, mobile number, email, and preferred contact channel and time.
  - Follow-up question: Should the AI confirm the spelling of names as they appear on passports for bookings?

### AI Tone / Personality

- **TRAVEL-034. What tone and personality should the AI use when speaking with travelers?**
  - Why it matters: Tone sets the brand experience; an aspirational, warm voice converts better for holidays than a transactional one.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Warm, enthusiastic, and inspiring like a knowledgeable friend who loves travel, but concise and professional.
  - Follow-up question: Are there any words or sales phrases you want the AI to avoid?

### Reporting / Analytics

- **TRAVEL-049. What metrics and reports do you want the AI to track (leads by destination, quote-to-booking rate, response times, top channels)?**
  - Why it matters: Reporting tells you what's converting and where leads leak, so you can optimise the AI and your offers.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: no
  - Example answer: Leads per destination, consultations booked, quote-to-booking conversion, average response time, and revenue by advisor.
  - Follow-up question: How often would you like these reports, and to whom should they be sent?
- **TRAVEL-050. What lead and booking statuses should the AI track through the funnel (new, qualified, quoted, deposit paid, traveled)?**
  - Why it matters: A clear status pipeline lets you see funnel health and lets the AI trigger the right follow-up at each stage.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, follow_up
  - Required: no
  - Example answer: New enquiry, qualified, consultation booked, quoted, deposit paid, balance paid, traveled, returned.
  - Follow-up question: Should reaching certain statuses automatically trigger a follow-up or campaign message?

### Automation Triggers

- **TRAVEL-040. What events should automatically trigger a campaign message (abandoned quote, birthday, anniversary of last trip)?**
  - Why it matters: Trigger-based outreach captures repeat business at the right moment and keeps your agency top of mind.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, campaign
  - Required: no
  - Example answer: Abandoned quote after 48h, anniversary of last booking with a 'time for another trip?' message, and birthday offers.
  - Follow-up question: Should these triggered messages only go to customers who opted in to marketing?


## 16. SaaS / Software Company

### Business Identity

- **SAAS-001. What is the official name of your SaaS company and the primary product brand the receptionist should use when greeting people?**
  - Why it matters: The AI must greet leads and customers with the correct company and product name to sound legitimate and on-brand.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, whatsapp, voice_call
  - Required: yes
  - Example answer: FlowDesk Inc., product brand 'FlowDesk' for help-desk automation.
  - Follow-up question: Are there any sub-brands or legacy product names customers might still reference?
- **SAAS-002. In one or two sentences, what does your software do and what core problem does it solve?**
  - Why it matters: A crisp value proposition lets the AI explain the product to new leads and qualify fit quickly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: FlowDesk is a shared inbox and AI help-desk that lets support teams resolve customer tickets across email, chat, and WhatsApp from one place.
  - Follow-up question: Who is the typical buyer or decision-maker for this product?
- **SAAS-003. What is your company website URL and primary product/docs domain?**
  - Why it matters: The AI links leads to the right pages for signup, pricing, and documentation instead of guessing.
  - Expected answer type: `url`
  - Used for: ai_prompt, faq, whatsapp, email
  - Required: yes
  - Example answer: https://flowdesk.io and docs at https://docs.flowdesk.io
  - Follow-up question: Is there a separate status page or community forum URL we should share?
- **SAAS-004. What are your business hours and time zone for live sales and support coverage?**
  - Why it matters: Lets the AI set response expectations and tell leads when a human can follow up.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Mon-Fri 9:00-18:00 ET, with limited weekend coverage for enterprise customers.
  - Follow-up question: Do you offer 24/7 support for any specific plan tier?
- **SAAS-005. Which markets, regions, and languages do you actively sell and provide support in?**
  - Why it matters: Determines whether the AI should engage a lead, set localized expectations, or route to a regional team.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, staff_assignment
  - Required: yes
  - Example answer: North America and EU; support in English and German.
  - Follow-up question: Are there regions where you cannot sell due to data residency or licensing restrictions?

### Services / Products

- **SAAS-006. List your main product modules or feature areas that the AI should be able to describe.**
  - Why it matters: The AI needs an accurate feature map to answer 'does it do X?' questions and steer fit conversations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Shared inbox, AI reply suggestions, ticket routing, reporting dashboard, and a customer self-service portal.
  - Follow-up question: Which feature is your strongest differentiator versus competitors?
- **SAAS-007. What are your defined product plans or editions (e.g., Free, Starter, Pro, Enterprise)?**
  - Why it matters: Plan names anchor every pricing, upgrade, and qualification conversation the AI has.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Free, Starter, Growth, and Enterprise.
  - Follow-up question: Which plan do you most want the AI to steer new leads toward?
- **SAAS-008. Which key features are gated to higher plans and should NOT be promised on lower tiers?**
  - Why it matters: Prevents the AI from over-promising features that a prospect's plan doesn't include, avoiding churn and disputes.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: SSO/SAML, audit logs, and custom SLAs are Enterprise-only; API access starts at Growth.
  - Follow-up question: Are any gated features available as paid add-ons regardless of plan?
- **SAAS-009. What integrations and platforms does your software officially support?**
  - Why it matters: Integration support is a top pre-sales question; accurate answers prevent lost deals and false claims.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Slack, Salesforce, HubSpot, Zapier, Shopify, and a REST API plus webhooks.
  - Follow-up question: Which requested integration is on the roadmap but not yet released?

### Pricing / Packages

- **SAAS-011. What is the monthly and annual price for each plan tier?**
  - Why it matters: Pricing is the most common pre-sales question; exact figures keep the AI accurate and trustworthy.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Starter $29/mo or $290/yr; Growth $99/mo or $990/yr; Enterprise custom quote.
  - Follow-up question: Is pricing per seat, per usage, or flat per workspace?
- **SAAS-012. Do you offer a free trial or freemium plan, and what are its terms (length, card required, feature scope)?**
  - Why it matters: Trial terms drive conversion conversations; the AI must state them precisely to set expectations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, lead_qualification, follow_up
  - Required: yes
  - Example answer: 14-day free trial of the Growth plan, no credit card required, full features except SSO.
  - Follow-up question: Can the trial be extended, and who is allowed to approve an extension?
- **SAAS-013. What discounts do you offer (annual prepay, nonprofit, startup, volume, education)?**
  - Why it matters: Lets the AI present approved discounts without inventing offers that erode margin.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign
  - Required: no
  - Example answer: 20% off annual prepay; 50% startup discount for companies under 2 years old via our partner program.
  - Follow-up question: What proof or eligibility is required to qualify for each discount?

### Booking / Appointment Rules

- **SAAS-016. What types of calls can leads book (product demo, onboarding, technical/solutions call, renewal review)?**
  - Why it matters: Defines the booking menu so the AI offers the right meeting type for the lead's stage and need.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Product demo (30 min), technical deep-dive (45 min), and onboarding kickoff (60 min).
  - Follow-up question: Which call type should be the default offer for a brand-new inbound lead?
- **SAAS-017. What is your demo booking link or scheduling tool, and how should the AI present it?**
  - Why it matters: The AI needs the exact scheduling resource to convert interested leads into booked meetings.
  - Expected answer type: `url`
  - Used for: booking, ai_prompt, whatsapp, email
  - Required: yes
  - Example answer: Calendly link https://calendly.com/flowdesk/demo, shared after qualifying questions.
  - Follow-up question: Should the AI collect qualifying info before sharing the link or share it immediately?
- **SAAS-018. What are the scheduling rules for demos (lead time, buffer, business hours, max per day per rep)?**
  - Why it matters: Prevents the AI from booking calls that conflict with rep capacity or fall outside working hours.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: Minimum 4-hour lead time, 15-min buffer, business hours only, max 6 demos/day per AE.
  - Follow-up question: Should high-intent enterprise leads be allowed to bypass the standard lead-time rule?

### Customer Qualification

- **SAAS-020. What is your ideal customer profile (company size, industry, role of the contact)?**
  - Why it matters: Lets the AI score fit and prioritize high-value leads for human follow-up.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, analytics
  - Required: yes
  - Example answer: B2B software and e-commerce companies, 20-500 employees, contact is a support or ops leader.
  - Follow-up question: What is a clear sign that a lead is NOT a fit and should be politely deflected?
- **SAAS-021. What qualifying questions should the AI ask to gauge company size and team size?**
  - Why it matters: Company and team size drive plan recommendation and routing to the right sales segment.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, booking
  - Required: yes
  - Example answer: Ask number of employees, size of support/ops team, and current monthly ticket volume.
  - Follow-up question: What size threshold separates self-serve from sales-assisted?
- **SAAS-022. What use cases or pain points should the AI probe for to assess fit?**
  - Why it matters: Use-case fit predicts conversion and helps the AI tailor the value pitch and demo type.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, campaign
  - Required: yes
  - Example answer: Ask what channels they support today, current tooling, and biggest bottleneck (volume, response time, reporting).
  - Follow-up question: Which use case correlates most strongly with a successful sale?
- **SAAS-048. What budget or willingness-to-pay signals should the AI capture to qualify a lead?**
  - Why it matters: Budget signals help prioritize sales-assisted handling versus self-serve and set the right plan expectation.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, ai_prompt, campaign
  - Required: no
  - Example answer: Ask about current tooling spend and approximate budget range, framed softly to avoid scaring the lead off.
  - Follow-up question: What minimum deal size warrants routing to an Enterprise AE?

### FAQs

- **SAAS-025. What are your most common pre-sales support and product FAQs the AI should answer directly?**
  - Why it matters: Pre-answered FAQs let the AI resolve routine questions instantly and reduce human load.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: Mobile app availability, data import, onboarding time, number of seats, contract length.
  - Follow-up question: Which FAQ answer changes most often and needs to stay easy to update?
- **SAAS-026. What are the most common integration and API questions, and what are the approved answers?**
  - Why it matters: Integration capability is a deal-maker; consistent, accurate answers prevent misrepresentation.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Yes to Slack/Salesforce/Zapier; REST API with rate limits on Growth+; native Shopify app available.
  - Follow-up question: For unsupported integrations, should the AI offer a feature request capture or route to solutions engineering?
- **SAAS-027. What support tiers and response-time SLAs exist per plan, and how should the AI describe them?**
  - Why it matters: Support expectations are often a buying criterion; the AI must state SLAs accurately by tier.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support, pricing
  - Required: yes
  - Example answer: Email support all plans; chat on Growth+ with 4-hour response; Enterprise gets a dedicated CSM and 1-hour SLA.
  - Follow-up question: Are SLAs contractual for Enterprise or best-effort across the board?

### Staff / Team / Availability

- **SAAS-019. Which team members or roles should demos and sales calls be routed to, and by what criteria?**
  - Why it matters: Routing rules ensure the right rep (by region, segment, or product) gets each booking.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: SMB leads to the SDR pool; 50+ employee companies to Enterprise AEs by region.
  - Follow-up question: Is there a round-robin order or a named owner for inbound demo requests?
- **SAAS-047. Who are the key contacts for sales, support, billing, and security that the AI may name or route to?**
  - Why it matters: Accurate routing contacts ensure escalations and handoffs reach the right person fast.
  - Expected answer type: `long_text`
  - Used for: escalation, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: Sales: AE team via round-robin; Support: support@; Billing: finance@; Security: security@.
  - Follow-up question: Should the AI ever share a direct human phone number, or only emails and scheduling links?

### Communication Channels

- **SAAS-028. Which channels should the AI receptionist operate on (website chat, WhatsApp, email, SMS, voice)?**
  - Why it matters: Defines where the AI engages leads and customers and how behavior should adapt per channel.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, whatsapp, email, sms, voice_call
  - Required: yes
  - Example answer: Website chat and WhatsApp for pre-sales; email for follow-up; voice for inbound enterprise calls.
  - Follow-up question: Which channel is the primary one for capturing new leads?

### Voice Call Behavior

- **SAAS-029. How should the AI handle inbound voice calls — greeting script, what it can resolve, and when to transfer to a human?**
  - Why it matters: Voice callers expect fast, clear handling; defined boundaries prevent the AI from stalling on complex calls.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Greet, identify caller and need, answer pricing/availability, and transfer technical or billing disputes to a rep.
  - Follow-up question: What is the fallback if no human is available to take a transferred call?
- **SAAS-050. How should the AI verify a caller's identity before discussing account-specific details on a voice call?**
  - Why it matters: Discussing account or billing details with an unverified caller risks data exposure and account takeover.
  - Expected answer type: `long_text`
  - Used for: voice_call, compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Confirm name and registered work email; for billing or account changes, route to a human after basic verification.
  - Follow-up question: What account actions should never be performed over voice regardless of verification?

### WhatsApp / Email / SMS Behavior

- **SAAS-030. What are your response-style rules for WhatsApp, email, and SMS (length, links allowed, attachments, signatures)?**
  - Why it matters: Each channel has different norms; tailored rules keep messages effective and on-brand.
  - Expected answer type: `long_text`
  - Used for: whatsapp, email, sms, ai_prompt
  - Required: yes
  - Example answer: WhatsApp short with one link; email longer with signature and demo link; SMS one-line reminders only.
  - Follow-up question: Should the AI send pricing PDFs or only link to the pricing page?

### Follow-up Rules

- **SAAS-032. What is your follow-up cadence for leads who don't book or respond after an initial conversation?**
  - Why it matters: Timely, structured follow-up is the biggest lever on SaaS lead conversion.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, campaign
  - Required: yes
  - Example answer: Follow up at 1 day, 3 days, and 7 days, then move to a monthly nurture if no reply.
  - Follow-up question: After how many ignored follow-ups should the AI stop contacting a lead?
- **SAAS-033. How should the AI follow up with users during and at the end of a free trial to drive conversion?**
  - Why it matters: Trial-to-paid conversion is where most SaaS revenue is won or lost; timed nudges matter.
  - Expected answer type: `long_text`
  - Used for: follow_up, ai_prompt, campaign, lead_qualification
  - Required: yes
  - Example answer: Day 1 welcome, day 7 feature tips, day 11 'trial ending' nudge with upgrade link, day 14 last-chance offer.
  - Follow-up question: Should low-activity trials get a different message than highly engaged trials?

### Sales / Upsell Opportunities

- **SAAS-034. What upsell and cross-sell triggers should the AI watch for (approaching usage limits, seat growth, feature interest)?**
  - Why it matters: Expansion revenue is core to SaaS; the AI can flag or pitch upgrades at the right moment.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, follow_up
  - Required: yes
  - Example answer: Suggest upgrade when a customer hits 80% of seat or ticket limit, or asks about an Enterprise-only feature.
  - Follow-up question: Should the AI offer the upgrade directly or route hot expansion signals to an account manager?
- **SAAS-035. What add-ons or premium services can the AI offer (extra seats, premium support, onboarding services, additional usage)?**
  - Why it matters: Knowing the add-on catalog lets the AI surface relevant upsells without over-promising.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: Extra seats at $12/seat/mo, premium support pack, and a $1,500 guided onboarding package.
  - Follow-up question: Which add-on has the highest attach rate that the AI should proactively mention?

### Complaints / Escalation

- **SAAS-037. What complaint types must always be escalated to a human, and who owns each (billing, outages, security)?**
  - Why it matters: High-stakes issues like outages or security need human ownership, not AI handling.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Billing disputes to finance, outages to on-call engineering, security concerns to the security team.
  - Follow-up question: What is the escalation channel and target response time for an urgent outage report?
- **SAAS-038. How should the AI handle an angry or churn-risk customer before a human takes over?**
  - Why it matters: A calm, empathetic holding response preserves the relationship while routing to a human.
  - Expected answer type: `long_text`
  - Used for: escalation, ai_prompt, customer_support
  - Required: yes
  - Example answer: Acknowledge, apologize, avoid blame, capture details, and promise a human callback within the SLA window.
  - Follow-up question: Should the AI offer any retention concession, or leave all concessions to the human team?

### Payments / Deposits / Refunds

- **SAAS-014. Which payment methods and billing cycles do you accept (card, ACH, invoice, PO)?**
  - Why it matters: Enterprise buyers often need invoicing or POs; the AI should confirm what's supported before promising.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, payment, faq
  - Required: yes
  - Example answer: Card and ACH self-serve; invoice and PO available for annual Enterprise contracts.
  - Follow-up question: What is the minimum contract value required to qualify for invoice billing?
- **SAAS-015. What is your refund, cancellation, and downgrade policy?**
  - Why it matters: The AI must answer billing-policy questions consistently and avoid making refund promises it can't authorize.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, payment, customer_support, escalation
  - Required: yes
  - Example answer: Cancel anytime; monthly is non-refundable, annual offers a 30-day money-back guarantee. Downgrades apply at next renewal.
  - Follow-up question: Should the AI process refund requests itself or always route them to billing for approval?

### Industry-Specific Rules

- **SAAS-010. What are the usage limits or metering units per plan (seats, API calls, messages, storage)?**
  - Why it matters: SaaS pricing is usage-based; the AI must explain limits accurately so leads pick the right tier and avoid overage surprises.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: Starter: 3 seats / 1k tickets/mo; Growth: 10 seats / 10k tickets/mo; Enterprise: custom.
  - Follow-up question: What happens when a customer exceeds their plan limit — overage charge, soft cap, or upgrade prompt?
- **SAAS-045. How should the AI handle competitor comparison questions and switching/migration inquiries?**
  - Why it matters: Competitor and migration questions are high-intent; consistent, fair handling protects credibility and wins deals.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, campaign
  - Required: yes
  - Example answer: Stay factual, highlight our differentiators without disparaging rivals, and offer free migration help for switchers.
  - Follow-up question: Is there approved competitor battlecard language the AI should follow?
- **SAAS-046. How should the AI respond to feature requests or capabilities the product does not yet have?**
  - Why it matters: Honest handling of gaps preserves trust while capturing valuable roadmap signal instead of false promises.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Be honest it's not available, log the request, and avoid committing to timelines unless approved.
  - Follow-up question: Where should logged feature requests be sent for product review?

### Compliance / Safety

- **SAAS-039. How should the AI respond to security, data-residency, and compliance questions (SOC 2, GDPR, HIPAA)?**
  - Why it matters: Security questions carry legal weight; the AI must not improvise claims and should route to authorized staff.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Confirm SOC 2 Type II and GDPR; for HIPAA, DPAs, or detailed security reviews, route to the security/legal team.
  - Follow-up question: Is there a trust center or security documentation link the AI may share?
- **SAAS-040. What are the strict boundaries on what the AI must NOT promise regarding uptime, incidents, data handling, or legal terms?**
  - Why it matters: Unauthorized promises about SLAs, incidents, or contract terms create legal and financial liability.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Never promise specific uptime numbers, incident resolution times, custom contract terms, or that data is 'unhackable'; defer to legal/security.
  - Follow-up question: Should the AI use a fixed disclaimer when asked about uptime or incidents?
- **SAAS-041. How should the AI handle requests to access, export, or delete personal data (DSAR / right-to-be-forgotten)?**
  - Why it matters: Data-subject requests are legally regulated and must be routed and logged correctly, not handled ad hoc.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Acknowledge, verify identity through the official process, and route to the privacy team; never delete data itself.
  - Follow-up question: What is the official intake address or form for data-subject requests?

### Customer Data Collection

- **SAAS-023. What lead fields should the AI always capture before handing off (name, work email, company, role, team size)?**
  - Why it matters: Complete lead records let sales follow up effectively and keep CRM data clean.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, ai_prompt, reporting
  - Required: yes
  - Example answer: Full name, work email, company name, role, employee count, and primary use case.
  - Follow-up question: Should the AI reject personal email domains (gmail, yahoo) for sales-qualified leads?
- **SAAS-024. How should the AI obtain marketing/communications consent when collecting contact details?**
  - Why it matters: Consent capture is required for compliant follow-up campaigns and to avoid CAN-SPAM/GDPR violations.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, campaign, follow_up
  - Required: yes
  - Example answer: Ask an explicit opt-in question for product updates and store the consent timestamp before any campaign send.
  - Follow-up question: Should the AI store the exact consent wording shown to the lead for audit purposes?
- **SAAS-049. What technical context should the AI collect for solutions/demo calls (current stack, team size, integration needs, ticket volume)?**
  - Why it matters: Pre-call context lets the solutions team prepare a tailored demo and shortens the sales cycle.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking, ai_prompt
  - Required: no
  - Example answer: Current helpdesk tool, channels supported, monthly ticket volume, and must-have integrations.
  - Follow-up question: Which single piece of context is most useful for the demo team to have in advance?

### AI Tone / Personality

- **SAAS-031. What tone and personality should the AI use (e.g., professional, friendly, technical, concise)?**
  - Why it matters: Tone shapes brand perception across every interaction and must match your audience.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, whatsapp, voice_call, email
  - Required: yes
  - Example answer: Friendly and professional, lightly technical, never pushy.
  - Follow-up question: Are there words, phrases, or claims the AI must never use (e.g., 'guaranteed', 'unlimited')?

### Reporting / Analytics

- **SAAS-042. What metrics do you want reported from AI conversations (leads captured, demos booked, qualification rate, FAQ deflection)?**
  - Why it matters: Defining KPIs makes the AI's impact measurable and guides ongoing optimization.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, ai_prompt
  - Required: yes
  - Example answer: Leads captured, demos booked, MQL-to-SQL rate, trial signups, and top unanswered questions.
  - Follow-up question: What does a 'good week' look like in numbers for these metrics?
- **SAAS-043. How often and to whom should the AI send performance reports, and in what format?**
  - Why it matters: Clear reporting cadence keeps stakeholders informed and the system accountable.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics
  - Required: no
  - Example answer: Weekly email summary to the head of sales and a monthly dashboard to leadership.
  - Follow-up question: Should the report flag any conversation the AI was unable to handle?

### Automation Triggers

- **SAAS-036. What inbound events should automatically trigger a campaign or message (signup, trial start, demo no-show, payment failure)?**
  - Why it matters: Event-driven automation keeps engagement timely without manual effort and reduces leakage.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, campaign, ai_prompt
  - Required: yes
  - Example answer: Trial start, demo booked, demo no-show reminder, and a payment-failure recovery message.
  - Follow-up question: For payment failures, should the AI retry softly before escalating to billing?
- **SAAS-044. Where should captured leads and conversation data sync (CRM, marketing tool, spreadsheet)?**
  - Why it matters: Automatic sync prevents lost leads and keeps the sales pipeline accurate and actionable.
  - Expected answer type: `multi_select_or_text`
  - Used for: analytics, reporting, lead_qualification
  - Required: yes
  - Example answer: Push leads to HubSpot, log demo bookings in the calendar, and notify the #sales Slack channel.
  - Follow-up question: Which CRM stage or lifecycle status should a new AI-captured lead be created in?


## 17. Insurance Agency

### Business Identity

- **INSURANCE-001. What is the full legal and trading name of your insurance agency?**
  - Why it matters: The AI must introduce the agency consistently and accurately on every channel, and the legal name may differ from the brand name used in marketing.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, compliance
  - Required: yes
  - Example answer: Summit Shield Insurance Group LLC, trading as Summit Shield Insurance
  - Follow-up question: Which name should the AI use when greeting customers?
- **INSURANCE-002. Are you an independent agency, a captive agency, or a brokerage, and which carriers do you represent?**
  - Why it matters: This shapes how the AI describes options to customers (single carrier vs. multiple) and sets accurate expectations about quote sourcing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Independent agency representing Progressive, Travelers, Nationwide, and Liberty Mutual
  - Follow-up question: Should the AI name specific carriers to customers, or keep carrier details until an agent is involved?
- **INSURANCE-003. What is your agency's license number(s) and which states or regions are you licensed to sell in?**
  - Why it matters: Insurance is jurisdiction-restricted; the AI must avoid engaging leads in states where the agency cannot legally write policies and may need to display license info.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, lead_qualification
  - Required: yes
  - Example answer: Licensed in Texas (Lic #1234567), Oklahoma, and New Mexico
  - Follow-up question: What should the AI tell a customer who contacts you from a state you are not licensed in?
- **INSURANCE-004. What are your office locations and business hours, including time zone?**
  - Why it matters: The AI needs accurate hours to set callback expectations, route after-hours messages, and tell customers when a licensed agent is available.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Main office: 100 Main St, Austin TX. Mon-Fri 8:30am-5:30pm CST, closed weekends
  - Follow-up question: How should the AI handle messages that arrive outside of business hours?
- **INSURANCE-005. What makes your agency different from competitors (specialties, years in business, local focus, claims advocacy)?**
  - Why it matters: Gives the AI authentic differentiators to share so conversations feel personalized rather than generic, improving lead conversion.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Family-owned for 30 years, dedicated claims advocate on staff, specialize in small-business and contractor coverage
  - Follow-up question: Which of these points should the AI lead with for new prospects?

### Services / Products

- **INSURANCE-006. Which personal insurance lines do you offer (auto, home, renters, life, health, umbrella)?**
  - Why it matters: Defines what the AI can collect details for; offering a line not actually sold would create false expectations and wasted leads.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Auto, Home, Renters, Umbrella, Term Life
  - Follow-up question: Are there any personal lines you want the AI to actively cross-sell?
- **INSURANCE-007. Which commercial or business insurance lines do you offer (general liability, BOP, workers' comp, commercial auto, professional liability)?**
  - Why it matters: Commercial intake requires different qualifying details than personal lines, so the AI must know which products are in scope.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: General Liability, Business Owners Policy, Workers' Comp, Commercial Auto
  - Follow-up question: What industries or business sizes are these commercial products best suited for?
- **INSURANCE-008. Do you offer specialty or niche coverages (motorcycle, boat/RV, flood, pet, event, cyber)?**
  - Why it matters: Specialty lines often drive unique leads; the AI should recognize and capture interest rather than treating them as out of scope.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: no
  - Example answer: Flood, Boat/RV, Motorcycle, Cyber liability
  - Follow-up question: Which specialty line do you most want to grow this year?
- **INSURANCE-009. Besides selling policies, what services do you provide (policy reviews, claims assistance, certificates of insurance, bundling reviews)?**
  - Why it matters: Many inbound messages are service requests, not new sales; the AI must route these correctly instead of treating everyone as a new quote.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, customer_support, faq
  - Required: yes
  - Example answer: Annual policy reviews, claims assistance, COI issuance, ID card requests
  - Follow-up question: Which of these service requests should be handled by the AI versus routed to a specific person?
- **INSURANCE-010. Do you offer bundling or multi-policy options, and which combinations are most common?**
  - Why it matters: Bundling is a primary upsell and savings message in insurance; the AI can surface relevant bundles when collecting customer needs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Auto + Home bundle, Auto + Renters, Business package + Commercial Auto
  - Follow-up question: Should the AI mention potential bundle savings, or leave savings claims to a licensed agent?

### Pricing / Packages

- **INSURANCE-011. Can the AI provide any pricing or premium estimates, or must all pricing come from a licensed agent?**
  - Why it matters: Quoting and binding prices is a regulated, licensed activity; the AI must never quote a binding premium, so this rule must be explicit.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, compliance, pricing
  - Required: yes
  - Example answer: No pricing from AI — all premiums and quotes come from a licensed agent only
  - Follow-up question: What exact wording should the AI use to decline giving a price?
- **INSURANCE-012. Are there any free services or no-cost offerings the AI can confidently mention (free quotes, free policy reviews)?**
  - Why it matters: Free quote/review offers are low-risk to state and are strong conversion hooks, so the AI should know what it can promise.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Free no-obligation quotes and free annual policy reviews
  - Follow-up question: Is the free quote available for all lines, or only certain ones?
- **INSURANCE-013. What factors most commonly affect premiums for your main lines (driving record, credit, home age, coverage limits)?**
  - Why it matters: The AI can explain in general terms why a quote requires details, helping set expectations without quoting a number.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Auto: driving record, vehicle, mileage, location. Home: age, roof, location, claims history
  - Follow-up question: How should the AI respond when a customer pushes for a ballpark price anyway?
- **INSURANCE-014. Are there any fees the customer should be aware of (broker fees, installment fees, policy fees)?**
  - Why it matters: Transparency about fees prevents complaints; the AI can disclose general fee structures truthfully if you authorize it.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: no
  - Example answer: $25 broker fee on new policies; installment fees vary by carrier
  - Follow-up question: Should the AI mention fees proactively or only when asked?
- **INSURANCE-015. What payment plans or financing options do customers typically have (monthly, quarterly, pay-in-full discounts)?**
  - Why it matters: Payment flexibility is a common pre-purchase question; accurate general info helps the AI keep prospects engaged toward an agent handoff.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: no
  - Example answer: Monthly, quarterly, semi-annual, or pay-in-full (often discounted) — varies by carrier
  - Follow-up question: Should the AI direct payment-setup questions to a specific team member?

### Booking / Appointment Rules

- **INSURANCE-016. What types of appointments can customers book through the AI (quote consultation, policy review, claims walkthrough)?**
  - Why it matters: Defines the booking menu so the AI offers only appointment types your agents actually handle.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Quote consultation, annual policy review, new-business intake call
  - Follow-up question: How long is each appointment type scheduled for?
- **INSURANCE-017. Are consultations done by phone, video, or in-person, and does the customer choose?**
  - Why it matters: The AI must capture the meeting channel so the agent and customer connect correctly and the AI can collect the right contact detail.
  - Expected answer type: `single_select`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Phone by default, video or in-person on request
  - Follow-up question: If a customer wants in-person, which location should the AI book them at?
- **INSURANCE-018. What are your available booking windows and how much advance notice is required?**
  - Why it matters: Prevents the AI from booking outside agent availability or too soon for prep; ensures realistic scheduling.
  - Expected answer type: `time_range`
  - Used for: booking
  - Required: yes
  - Example answer: Mon-Fri 9am-4pm CST, minimum 2 hours advance notice
  - Follow-up question: Do you want buffer time between consultations?
- **INSURANCE-019. What information must the AI collect before confirming a quote consultation?**
  - Why it matters: Pre-gathering details (lines of interest, basic info) lets the agent prepare and shortens the call, improving close rates.
  - Expected answer type: `long_text`
  - Used for: booking, lead_qualification
  - Required: yes
  - Example answer: Name, phone, email, line(s) of interest, ZIP code, current carrier if any
  - Follow-up question: Which of these fields are mandatory before the AI can finalize the booking?
- **INSURANCE-020. What are your cancellation, no-show, and rescheduling policies for consultations?**
  - Why it matters: The AI needs clear rules to handle changes and communicate policy consistently, reducing missed appointments.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: no
  - Example answer: Reschedule anytime with 1 hour notice; no penalty for cancellation; missed calls get one auto follow-up
  - Follow-up question: Should the AI automatically offer to reschedule a missed consultation?

### Customer Qualification

- **INSURANCE-021. For an auto quote lead, what details should the AI collect (vehicles, drivers, current coverage, ZIP)?**
  - Why it matters: Structured auto intake lets the agent produce an accurate quote fast; missing fields create back-and-forth.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking
  - Required: yes
  - Example answer: Year/make/model of vehicles, number of drivers, current carrier, desired start date, ZIP
  - Follow-up question: Should the AI ask for current premium so the agent can target a savings?
- **INSURANCE-022. For a home or property quote lead, what details should the AI collect (address, year built, square footage, coverage type)?**
  - Why it matters: Property risk details drive quote accuracy; the AI capturing these up front speeds the agent's work.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking
  - Required: yes
  - Example answer: Property address, year built, square footage, owner/renter, current carrier, mortgage status
  - Follow-up question: Do you also want roof age or recent renovation details collected?
- **INSURANCE-023. How should the AI determine whether a lead is a hot prospect, a shopper, or just a service request?**
  - Why it matters: Lead scoring routes hot prospects to agents quickly and lower-priority requests appropriately, maximizing agent time.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, staff_assignment
  - Required: yes
  - Example answer: Hot: renewal due within 30 days or recent rate increase. Shopper: comparing quotes. Service: existing policy questions
  - Follow-up question: Which signal should immediately flag a lead as high priority for an agent?

### FAQs

- **INSURANCE-026. What are the most common questions about getting a quote, and how should the AI answer each?**
  - Why it matters: Pre-approved answers keep the AI accurate and on-message for the highest-volume questions while avoiding advice.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: yes
  - Example answer: How long does a quote take? Usually same day. Do I need to switch immediately? No, quotes are no-obligation
  - Follow-up question: Are there any quote questions the AI should always route to an agent?
- **INSURANCE-027. What are the most common questions about filing or starting a claim, and what should the AI say?**
  - Why it matters: Claims questions are urgent and emotional; the AI must give correct first steps and escalate rather than offering claims advice.
  - Expected answer type: `long_text`
  - Used for: faq, escalation, customer_support
  - Required: yes
  - Example answer: For a claim, the AI collects policy number and brief incident details, then connects to our claims team or carrier hotline
  - Follow-up question: What is the carrier claims hotline the AI should provide for emergencies?
- **INSURANCE-028. What are the most common policy-servicing questions (ID cards, adding a vehicle, payment due dates) and the approved answers?**
  - Why it matters: Servicing FAQs deflect routine workload from staff while keeping answers accurate and consistent.
  - Expected answer type: `long_text`
  - Used for: faq, customer_support
  - Required: no
  - Example answer: ID cards can be emailed same day; adding a vehicle requires an agent; payment dates are on the carrier portal
  - Follow-up question: Which servicing tasks can the AI initiate versus which require an agent?
- **INSURANCE-029. What questions should the AI explicitly refuse to answer and redirect to a licensed agent?**
  - Why it matters: Defines the hard compliance boundary so the AI never gives coverage advice, confirms coverage, or interprets policy language.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, escalation
  - Required: yes
  - Example answer: Whether something is covered, recommended coverage limits, claim approval likelihood, legal/tax advice
  - Follow-up question: What handoff message should the AI use when refusing one of these?

### Staff / Team / Availability

- **INSURANCE-030. Who are your licensed agents and what lines or specialties does each handle?**
  - Why it matters: Lets the AI route leads to the right specialist (e.g., commercial vs. life) for faster, more competent handling.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, ai_prompt
  - Required: yes
  - Example answer: Maria — personal auto/home; James — commercial; Priya — life/health
  - Follow-up question: Should the AI name the assigned agent to the customer or keep it internal?
- **INSURANCE-031. When an agent is unavailable, how should the AI handle the lead (assign backup, take a message, schedule callback)?**
  - Why it matters: Prevents leads from stalling when a specific agent is out, protecting conversion and customer experience.
  - Expected answer type: `single_select`
  - Used for: staff_assignment, follow_up
  - Required: yes
  - Example answer: Capture details and schedule a callback within 1 business day; assign to backup for urgent items
  - Follow-up question: Who is the designated backup for each line of business?

### Communication Channels

- **INSURANCE-032. Which channels should the AI operate on (WhatsApp, SMS, voice, email, website chat)?**
  - Why it matters: Determines where the AI is active and how it should adapt tone and format for each channel.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, whatsapp, sms, email, voice_call
  - Required: yes
  - Example answer: WhatsApp, website chat, and inbound voice calls
  - Follow-up question: Is there a primary channel customers should be steered toward?

### Voice Call Behavior

- **INSURANCE-033. How should the AI handle inbound voice calls (greeting, what it can resolve, when to transfer to a live agent)?**
  - Why it matters: Voice callers often have urgent claims or sales intent; the AI must triage and transfer correctly without giving advice.
  - Expected answer type: `long_text`
  - Used for: voice_call, ai_prompt, escalation
  - Required: yes
  - Example answer: Greet, identify need, collect basic info for quotes; for claims or coverage questions, transfer to a licensed agent
  - Follow-up question: What is the transfer number or process for reaching a live agent during business hours?

### WhatsApp / Email / SMS Behavior

- **INSURANCE-034. How should the AI format messages on WhatsApp/SMS (length, use of links, sending intake forms)?**
  - Why it matters: Text channels need concise, scannable messages; oversharing or long blocks hurt response rates and clarity.
  - Expected answer type: `long_text`
  - Used for: whatsapp, sms, ai_prompt
  - Required: no
  - Example answer: Short messages, one question at a time, send a secure intake link rather than collecting sensitive data inline
  - Follow-up question: Do you have a secure intake form link the AI should send for quote details?

### Follow-up Rules

- **INSURANCE-036. How should the AI follow up with a lead who requested a quote but hasn't booked or responded?**
  - Why it matters: Insurance shoppers compare multiple agencies; timely, structured follow-up significantly improves close rates.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign
  - Required: yes
  - Example answer: Follow up at 1 day, 3 days, and 7 days, then mark cold; max 3 touches unless they re-engage
  - Follow-up question: What message or offer should each follow-up touch contain?
- **INSURANCE-037. How far ahead of a policy renewal or expiration should the AI proactively reach out, and what should it say?**
  - Why it matters: Renewals are the prime retention and re-shop moment; proactive outreach reduces churn and surfaces re-quote opportunities.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, customer_support
  - Required: yes
  - Example answer: Reach out 30 days before renewal to offer a review and confirm details; never auto-confirm new pricing
  - Follow-up question: Should the renewal outreach offer a re-shop/comparison or simply schedule a review?

### Sales / Upsell Opportunities

- **INSURANCE-038. What cross-sell or upsell opportunities should the AI surface (bundling, umbrella, life on an auto/home customer)?**
  - Why it matters: Identifies where the AI can plant a seed for additional coverage and flag it to an agent, without quoting or advising.
  - Expected answer type: `long_text`
  - Used for: campaign, lead_qualification, ai_prompt
  - Required: no
  - Example answer: Suggest reviewing a home bundle for auto leads, and umbrella for high-asset customers — agent confirms details
  - Follow-up question: Should the AI raise upsells during the first conversation or only on follow-up?

### Complaints / Escalation

- **INSURANCE-040. How should the AI handle an upset customer or a complaint about a claim or rate increase?**
  - Why it matters: Mishandled complaints damage reputation and may have regulatory implications; the AI must de-escalate and route to a human quickly.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Acknowledge calmly, avoid blame or coverage opinions, collect contact and issue, escalate to a manager within the hour
  - Follow-up question: Who is the designated contact for escalated complaints?
- **INSURANCE-041. What constitutes an emergency or urgent situation that must be escalated immediately (accident in progress, total loss, injury)?**
  - Why it matters: Some insurance contacts are genuine emergencies; the AI must recognize them and route to the right hotline instantly rather than collecting a normal lead.
  - Expected answer type: `long_text`
  - Used for: escalation, compliance, voice_call
  - Required: yes
  - Example answer: Active accident, injury, fire, or theft in progress — direct to 911 if life-threatening, then the carrier 24/7 claims line
  - Follow-up question: What exact emergency message and phone number should the AI provide?

### Payments / Deposits / Refunds

- **INSURANCE-046. How should the AI handle payment, billing, and refund questions?**
  - Why it matters: Payments often run through carriers; the AI must not take payment over chat and should route billing issues correctly.
  - Expected answer type: `long_text`
  - Used for: payment, customer_support, ai_prompt
  - Required: yes
  - Example answer: Never collect card info; direct premium payments to the carrier portal and refund/billing disputes to our billing team
  - Follow-up question: What is the billing contact or carrier portal link the AI should share?
- **INSURANCE-047. Do you collect any payment or deposit at the agency level (broker fee, down payment), and how is it processed?**
  - Why it matters: If the agency itself collects funds, the AI needs to know the correct, secure process and never take payment data inline.
  - Expected answer type: `long_text`
  - Used for: payment, compliance
  - Required: no
  - Example answer: Down payment is collected by the agent via a secure carrier link; the AI only sends the link, never card details
  - Follow-up question: Should the AI send a secure payment link itself or hand off to an agent for that step?

### Industry-Specific Rules

- **INSURANCE-044. Are there state-specific or carrier-specific rules the AI must respect (no quoting in certain states, mandatory coverage notices)?**
  - Why it matters: Insurance rules vary by jurisdiction and carrier; the AI must avoid actions that are non-compliant in a given state.
  - Expected answer type: `long_text`
  - Used for: compliance, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Do not engage quote requests from non-licensed states; note mandatory UM/UIM coverage where required
  - Follow-up question: Which states or carriers have the strictest rules the AI must guard against?
- **INSURANCE-045. How should the AI handle a customer who asks the AI to bind, change, or cancel a policy?**
  - Why it matters: Binding/altering coverage is a licensed action with legal effect; the AI must never confirm such changes and must route to an agent.
  - Expected answer type: `long_text`
  - Used for: compliance, escalation, customer_support
  - Required: yes
  - Example answer: The AI never binds, changes, or cancels — it records the request and confirms a licensed agent will action it, no change is in effect yet
  - Follow-up question: What confirmation should the AI give so the customer knows the change is NOT yet effective?

### Compliance / Safety

- **INSURANCE-042. What mandatory disclaimers must the AI state (not a licensed agent, no binding coverage, quotes are estimates from an agent)?**
  - Why it matters: Regulators require clear disclosure that the AI is not giving licensed advice or binding coverage; this protects the agency legally.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt
  - Required: yes
  - Example answer: I'm an automated assistant, not a licensed agent — I can't confirm coverage or quote prices; a licensed agent will help with that
  - Follow-up question: Must this disclaimer appear on every channel or only the first message of a session?
- **INSURANCE-043. What consent and privacy requirements apply before collecting or storing customer information (TCPA consent, privacy notice)?**
  - Why it matters: Insurance contact and data handling is heavily regulated; the AI must capture consent and present privacy notices to stay compliant.
  - Expected answer type: `long_text`
  - Used for: compliance, customer_support
  - Required: yes
  - Example answer: Capture explicit opt-in consent for SMS/calls and link the privacy policy before saving contact details
  - Follow-up question: What is the exact consent language and privacy policy link the AI should use?

### Customer Data Collection

- **INSURANCE-024. What contact and identity details must the AI collect from every new lead?**
  - Why it matters: Consistent contact capture ensures no lead is lost and the agent can follow up via the customer's preferred channel.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, follow_up
  - Required: yes
  - Example answer: Full name, phone, email, ZIP code, preferred contact method and time
  - Follow-up question: Is email required, or is phone alone sufficient to proceed?
- **INSURANCE-025. What sensitive information must the AI NEVER request or store over chat (SSN, full driver's license, bank or card numbers, full DOB)?**
  - Why it matters: Collecting sensitive PII over unsecured channels creates compliance and data-breach risk; the AI must defer these to a secure agent process.
  - Expected answer type: `multi_select_or_text`
  - Used for: compliance, ai_prompt, customer_support
  - Required: yes
  - Example answer: Never collect SSN, full DL number, payment card details, or medical records over chat
  - Follow-up question: How should the AI explain why it can't take that information directly?

### AI Tone / Personality

- **INSURANCE-035. What tone and personality should the AI use with insurance customers (warm, professional, reassuring)?**
  - Why it matters: Insurance involves stress and trust; the right tone improves engagement while staying compliant and non-advisory.
  - Expected answer type: `long_text`
  - Used for: ai_prompt
  - Required: yes
  - Example answer: Warm, professional, and reassuring — never pushy, always clarifies that final advice comes from a licensed agent
  - Follow-up question: Are there phrases or a disclaimer the AI must include in its first message?

### Reporting / Analytics

- **INSURANCE-048. What metrics do you want reported on AI-handled conversations (leads captured, quote consultations booked, claims escalated, response time)?**
  - Why it matters: Defines the KPIs the system tracks so you can measure the AI's impact on pipeline and service.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics
  - Required: yes
  - Example answer: New leads, consultations booked, line-of-business breakdown, claims escalated, average first-response time
  - Follow-up question: How often should these reports be delivered and to whom?
- **INSURANCE-049. How should leads be tagged or categorized for reporting (line of business, source channel, lead temperature)?**
  - Why it matters: Consistent tagging enables meaningful pipeline analysis and lets you see which lines and channels convert best.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics, lead_qualification
  - Required: no
  - Example answer: Tag by line (auto/home/life/commercial), channel (WhatsApp/voice/web), and temperature (hot/warm/cold)
  - Follow-up question: Are there existing CRM stages these tags should map to?

### Automation Triggers

- **INSURANCE-039. What events should automatically notify an agent in real time (claim mention, renewal-due lead, high-value prospect)?**
  - Why it matters: Time-sensitive insurance events need immediate human attention; alerts prevent lost business and unhandled urgent issues.
  - Expected answer type: `multi_select_or_text`
  - Used for: escalation, staff_assignment, follow_up
  - Required: yes
  - Example answer: Any claim mention, renewal within 14 days, commercial lead, or request to speak to a human
  - Follow-up question: Which alert method should be used (SMS, email, dashboard) for each trigger?
- **INSURANCE-050. What automated workflows should fire after a conversation (create CRM lead, assign agent, send confirmation, schedule follow-up)?**
  - Why it matters: Post-conversation automation ensures every lead is captured in your systems and acted on without manual entry.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, staff_assignment, reporting
  - Required: yes
  - Example answer: Create CRM lead, assign by line, send booking confirmation, and schedule a 1-day follow-up reminder
  - Follow-up question: Which CRM or system should new leads be pushed into?


## 18. Accounting / Tax Firm

### Business Identity

- **ACCOUNTING-001. What is the full legal and trading name of your accounting/tax firm?**
  - Why it matters: The AI receptionist must greet callers and message senders with the correct firm name and use it consistently across channels.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp, email
  - Required: yes
  - Example answer: Maple & Co Chartered Accountants (trading as Maple Tax)
  - Follow-up question: Should the AI use your trading name or legal name when answering calls?
- **ACCOUNTING-002. What professional bodies or licenses is your firm registered with (e.g. ACCA, ICAEW, AICPA, CPA, IRS PTIN, HMRC agent)?**
  - Why it matters: Credentials reassure prospective clients and let the AI answer trust questions accurately without overstating qualifications.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, compliance
  - Required: yes
  - Example answer: ICAEW chartered, registered HMRC tax agent, AML supervised by ICAEW
  - Follow-up question: Is there a registration or license number you want the AI to share if asked?
- **ACCOUNTING-003. What are your office address(es), and do you offer in-person, phone, or video-only consultations?**
  - Why it matters: The AI needs to tell clients where to go or how meetings happen and route remote vs in-person bookings correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: 12 King Street, Suite 4, London; in-person, phone, and Zoom all available
  - Follow-up question: Which meeting mode should the AI suggest by default for a new client?
- **ACCOUNTING-004. What are your standard office hours, including any extended hours during tax season?**
  - Why it matters: Hours govern when the AI offers live booking slots and when it sets after-hours expectations for callbacks.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Mon-Fri 9am-5:30pm; Jan-Apr also Saturdays 9am-1pm
  - Follow-up question: Should the AI announce different hours during your busy tax-season months?
- **ACCOUNTING-005. Who are your typical clients (e.g. sole traders, small businesses, contractors, high-net-worth individuals, nonprofits)?**
  - Why it matters: Knowing the target client lets the AI tailor language, qualify fit, and avoid promising services outside the firm's focus.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Sole traders, limited companies up to £2m turnover, and landlords
  - Follow-up question: Are there any client types you do NOT take on that the AI should politely decline?

### Services / Products

- **ACCOUNTING-006. What core services do you offer (e.g. self-assessment/personal tax returns, corporate tax, bookkeeping, payroll, VAT/sales tax, audit, advisory)?**
  - Why it matters: This is the master service list the AI uses to answer 'do you do X?' and route bookings to the right service line.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, faq, booking, lead_qualification
  - Required: yes
  - Example answer: Personal tax returns, corporation tax, bookkeeping, payroll, VAT returns
  - Follow-up question: Which one or two services should the AI promote most actively to new enquiries?
- **ACCOUNTING-007. Which bookkeeping software do you support or specialize in (e.g. Xero, QuickBooks, Sage, FreeAgent)?**
  - Why it matters: Software compatibility is a common qualifying question; the AI can confirm fit before booking a consultation.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Xero (certified partner), QuickBooks Online, Sage 50
  - Follow-up question: If a client uses software you don't support, should the AI still book a call to discuss migration?
- **ACCOUNTING-008. Do you offer payroll services, and if so what scope (payslips, PAYE/withholding filings, pensions/auto-enrolment, year-end forms)?**
  - Why it matters: Payroll has many sub-tasks; the AI must describe exactly what is included to set correct expectations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: Monthly payroll, RTI submissions, auto-enrolment pension uploads, P60s/P11Ds
  - Follow-up question: Is there a minimum or maximum number of employees you handle for payroll?
- **ACCOUNTING-009. Do you provide audit or assurance services, and for which entity types or thresholds?**
  - Why it matters: Audit is regulated and not all firms offer it; the AI must avoid implying audit capability the firm lacks.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification, compliance
  - Required: no
  - Example answer: Statutory audits for companies above the audit threshold; charity independent examinations
  - Follow-up question: If you don't offer audit, should the AI refer such enquiries to a partner firm?
- **ACCOUNTING-010. Do you offer specialist or advisory services (e.g. R&D tax credits, tax planning, business valuations, company formation, expat/non-resident tax)?**
  - Why it matters: Specialist services attract higher-value clients; the AI should surface them and capture interest for accountant follow-up.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: R&D tax credits, company formation, capital gains tax planning
  - Follow-up question: Which specialist service generates your most valuable clients?

### Pricing / Packages

- **ACCOUNTING-011. How do you price personal/self-assessment tax returns (fixed fee, by complexity, hourly)?**
  - Why it matters: Pricing is the most common question; the AI needs an accurate model to quote ranges or explain that a quote follows a consultation.
  - Expected answer type: `price`
  - Used for: ai_prompt, faq, pricing
  - Required: yes
  - Example answer: Fixed fee from £150 for a simple return, rising with rental or dividend income
  - Follow-up question: Should the AI quote a starting-from price or only say 'pricing depends on complexity'?
- **ACCOUNTING-012. Do you offer monthly retainer or fixed-fee packages for small businesses (e.g. bookkeeping + accounts + tax bundled)?**
  - Why it matters: Package pricing lets the AI present clear options and steer clients toward recurring-revenue plans.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing, lead_qualification
  - Required: no
  - Example answer: Starter £95/mo, Growth £180/mo, Premium £350/mo including payroll
  - Follow-up question: What is included at each package tier so the AI can describe them?
- **ACCOUNTING-013. Is the initial consultation free or paid, and what is the fee if paid?**
  - Why it matters: The AI must state consultation cost upfront so clients aren't surprised and the booking step is accurate.
  - Expected answer type: `price`
  - Used for: ai_prompt, faq, pricing, booking
  - Required: yes
  - Example answer: First 30-minute discovery call is free; detailed advisory sessions are £120
  - Follow-up question: Is the free consultation limited in length or to new clients only?
- **ACCOUNTING-014. How do you price bookkeeping, payroll, and VAT/sales-tax filing (per transaction, per employee, per return, monthly)?**
  - Why it matters: These recurring services have varied pricing units; the AI needs them to give meaningful ballpark figures.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: no
  - Example answer: Bookkeeping from £75/mo, payroll £5/payslip, VAT returns £90/quarter
  - Follow-up question: Are there setup or onboarding fees the AI should mention?
- **ACCOUNTING-015. Are there extra fees for urgent, late, or last-minute deadline work (e.g. filing right before the tax deadline)?**
  - Why it matters: Rush fees are common near deadlines; the AI should set expectations so late clients aren't surprised by surcharges.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: no
  - Example answer: 25% express surcharge for returns submitted within 7 days of the deadline
  - Follow-up question: Is there a cut-off date after which you stop accepting new deadline work entirely?

### Booking / Appointment Rules

- **ACCOUNTING-016. What appointment types can the AI book (e.g. free discovery call, tax-return review, bookkeeping setup, year-end meeting)?**
  - Why it matters: Defining bookable types lets the AI map an enquiry to the correct calendar event and duration.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Discovery call (30m), tax review (45m), advisory session (60m)
  - Follow-up question: What is the default duration for each appointment type?
- **ACCOUNTING-017. How does booking availability change during peak tax season versus off-season?**
  - Why it matters: Tax-season demand spikes; the AI must throttle or prioritize bookings differently so the team isn't overwhelmed.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Jan-Apr limit new self-assessment bookings to 4/day; off-season open scheduling
  - Follow-up question: Should the AI add a waitlist or callback when peak-season slots are full?
- **ACCOUNTING-018. How much advance notice and what lead time do you require for booking a consultation?**
  - Why it matters: Lead-time rules prevent same-minute bookings and let staff prepare; the AI enforces the minimum gap.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Minimum 24 hours notice; up to 8 weeks ahead
  - Follow-up question: Can clients self-cancel or reschedule, and how much notice is required?
- **ACCOUNTING-019. Should the AI ask clients to bring or upload specific documents before a consultation (e.g. last year's return, ID, financials)?**
  - Why it matters: Pre-meeting documents make consultations productive; the AI can prompt for them at booking time.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, faq
  - Required: no
  - Example answer: Prior tax return, photo ID, and last 3 months bank statements
  - Follow-up question: Should the AI send a document checklist automatically after booking?
- **ACCOUNTING-020. Which staff member or service line should each appointment type be assigned to?**
  - Why it matters: Routing to the right accountant (e.g. payroll specialist vs tax partner) avoids reassignment and delays.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment
  - Required: no
  - Example answer: Payroll queries to Sarah, corporate tax to David, general intake to anyone
  - Follow-up question: If the preferred staff member is unavailable, should the AI offer the next available accountant?

### Customer Qualification

- **ACCOUNTING-021. What entity type questions should the AI ask (sole trader, partnership, limited company, LLC, corporation, trust)?**
  - Why it matters: Entity type drives which service and fee apply; capturing it early lets the accountant prepare correctly.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Ask: are you a sole trader, partnership, or limited company?
  - Follow-up question: Should an unincorporated client be routed differently from a limited company?
- **ACCOUNTING-022. Should the AI ask about annual turnover/revenue and VAT/sales-tax registration status to gauge complexity?**
  - Why it matters: Turnover and tax-registration status indicate scope and fee tier and whether registration thresholds apply.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Yes — ask approximate annual turnover and whether they are VAT registered
  - Follow-up question: What turnover band makes a lead high-priority for the team to call back fast?
- **ACCOUNTING-023. What qualifying questions identify a good-fit client versus one to politely decline?**
  - Why it matters: Clear fit criteria let the AI avoid booking out-of-scope work and wasting accountant time.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: no
  - Example answer: Good fit: UK-based SME under £10m turnover. Decline: US tax filings, crypto traders
  - Follow-up question: When a lead is out of scope, what message should the AI give them?

### FAQs

- **ACCOUNTING-026. What are the key tax filing deadlines clients ask about, and how should the AI state them?**
  - Why it matters: Deadline questions are extremely common; the AI can state dates factually while reminding the client to confirm with an accountant.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: Self-assessment online filing 31 Jan; corporation tax 9 months after year-end
  - Follow-up question: Should the AI add a disclaimer that deadlines depend on the client's specific circumstances?
- **ACCOUNTING-027. What documents do clients typically need to prepare for a tax return or year-end accounts?**
  - Why it matters: A standard document list answers a frequent question and helps clients arrive prepared.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: Income records, expense receipts, bank statements, prior return, P60/1099s
  - Follow-up question: Do requirements differ for a limited company versus a sole trader?
- **ACCOUNTING-028. How should the AI handle requests for actual tax or financial ADVICE (e.g. 'how much tax will I owe?', 'can I claim this expense?')?**
  - Why it matters: The AI must NOT give tax, financial, or accounting advice; it must capture the question and hand off to a qualified accountant.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, escalation, faq
  - Required: yes
  - Example answer: Say it can't give tax advice, note the question, and book a call with an accountant
  - Follow-up question: Exactly what wording should the AI use to decline giving advice while staying helpful?
- **ACCOUNTING-029. What is the typical turnaround time for common jobs (tax return, year-end accounts, VAT return)?**
  - Why it matters: Turnaround expectations reduce 'when will it be done?' chasing and set realistic delivery timelines.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq
  - Required: no
  - Example answer: Tax returns 5-10 working days once all documents received; VAT 3-5 days
  - Follow-up question: Does turnaround change during peak season, and how should the AI explain that?
- **ACCOUNTING-030. What switching/onboarding process should the AI describe for clients moving from another accountant?**
  - Why it matters: Switching anxiety blocks conversions; explaining the smooth handover (e.g. professional clearance) wins clients.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: We request professional clearance from your old accountant; you just sign an authority form
  - Follow-up question: Is there a typical timeframe for completing a switch the AI can quote?

### Staff / Team / Availability

- **ACCOUNTING-031. Who are the accountants/partners and what are their specialisms (e.g. personal tax, corporate, payroll, audit)?**
  - Why it matters: Knowing specialisms lets the AI route enquiries and name the right person when scheduling.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, staff_assignment
  - Required: yes
  - Example answer: David (corporate tax & audit), Sarah (payroll & VAT), Priya (personal tax)
  - Follow-up question: Should the AI offer the client a choice of accountant or assign automatically?

### Communication Channels

- **ACCOUNTING-032. Which channels should the AI receptionist operate on (phone/voice, WhatsApp, SMS, email, website chat)?**
  - Why it matters: Channel scope defines where the AI is active and where to hand off to humans.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, email, sms
  - Required: yes
  - Example answer: Phone, WhatsApp, and website chat; email for document follow-ups
  - Follow-up question: Is there a primary channel clients should be steered toward for sensitive matters?

### Voice Call Behavior

- **ACCOUNTING-033. How should the AI answer and greet phone calls, and when should it transfer to a human?**
  - Why it matters: Voice greeting and transfer rules shape first impressions and ensure complex or urgent calls reach staff.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Greet with firm name, offer to book or take a message; transfer existing-client urgent calls
  - Follow-up question: What is the fallback if no human is available to take a transferred call?

### WhatsApp / Email / SMS Behavior

- **ACCOUNTING-034. What are your rules for WhatsApp/SMS/email replies, including handling of document attachments and response-time promises?**
  - Why it matters: Text channels are where clients send documents; the AI must guide secure sharing and set reply expectations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, email, sms, customer_support
  - Required: yes
  - Example answer: Acknowledge within minutes; ask clients to upload docs via secure portal, not WhatsApp
  - Follow-up question: What secure method should the AI direct clients to for sharing financial documents?

### Follow-up Rules

- **ACCOUNTING-036. How should the AI follow up with leads who enquire but don't book (timing and number of attempts)?**
  - Why it matters: Structured follow-up recovers lost leads without nagging; rules prevent over-messaging.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign
  - Required: yes
  - Example answer: Follow up after 24h, then 3 days, then stop after 2 attempts
  - Follow-up question: Should follow-ups stop automatically once the lead books or replies?
- **ACCOUNTING-037. Should the AI send deadline reminders (e.g. tax return due, VAT quarter, payroll cut-off), and how far in advance?**
  - Why it matters: Proactive deadline reminders are a core value of an accounting firm and reduce missed-deadline penalties.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign, whatsapp, email
  - Required: yes
  - Example answer: Remind clients 30 days, 14 days, and 3 days before the self-assessment deadline
  - Follow-up question: Should reminders only go to clients who haven't yet sent in their documents?
- **ACCOUNTING-038. Should the AI chase clients for missing documents needed to complete their work, and how persistently?**
  - Why it matters: Missing documents are the top cause of delays; automated chasing keeps jobs moving without staff effort.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, whatsapp, email
  - Required: no
  - Example answer: Chase weekly for outstanding documents, escalating to a staff call after 3 weeks
  - Follow-up question: What document checklist should the AI reference when chasing?

### Sales / Upsell Opportunities

- **ACCOUNTING-039. What additional services should the AI proactively offer to existing clients (e.g. payroll add-on, tax planning, bookkeeping upgrade)?**
  - Why it matters: Cross-selling existing clients is high-margin; the AI can surface relevant add-ons at the right moment.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, campaign, lead_qualification
  - Required: no
  - Example answer: Offer payroll to clients hiring staff, tax planning before year-end
  - Follow-up question: What signals (e.g. mentions of hiring) should trigger an upsell suggestion?
- **ACCOUNTING-040. Do you run seasonal campaigns (e.g. early-bird tax-return discount, new-year business health check) the AI should promote?**
  - Why it matters: Seasonal promotions drive volume; the AI can mention them when relevant to boost conversions.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up
  - Required: no
  - Example answer: 10% off self-assessment for clients who submit documents before 31 October
  - Follow-up question: What dates should each campaign run, and who is eligible?

### Complaints / Escalation

- **ACCOUNTING-041. How should the AI handle complaints (e.g. fee disputes, missed deadlines, errors) and when must it escalate to a human immediately?**
  - Why it matters: Complaints are sensitive and regulated; the AI must de-escalate and route to a person without making promises.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: Apologize, log details, and escalate any complaint about errors or penalties to a partner same-day
  - Follow-up question: Who is the named person or role that complaints should be escalated to?
- **ACCOUNTING-042. What situations require an immediate human handoff (e.g. HMRC/IRS investigation, suspected fraud, urgent penalty notice)?**
  - Why it matters: Some matters carry legal/financial urgency and risk; the AI must recognize and escalate them at once.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, compliance
  - Required: yes
  - Example answer: Tax investigation letters, suspected fraud, or penalty deadlines within 48 hours
  - Follow-up question: What is the escalation path and contact for these urgent cases outside office hours?

### Payments / Deposits / Refunds

- **ACCOUNTING-043. How and when do clients pay (upfront, on completion, monthly direct debit), and which methods do you accept?**
  - Why it matters: Payment terms are a common pre-engagement question; the AI must state them accurately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment
  - Required: yes
  - Example answer: Monthly clients pay by direct debit; one-off returns invoiced on completion, card or bank transfer
  - Follow-up question: Do you require a deposit before starting work for new clients?
- **ACCOUNTING-044. What is your refund or fee-dispute policy, and how should the AI explain it without making commitments?**
  - Why it matters: Refund expectations must be set carefully; the AI should describe the policy and route disputes to a human.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment, escalation
  - Required: no
  - Example answer: Fees for work already completed are non-refundable; disputes reviewed by a partner
  - Follow-up question: Should the AI ever quote a refund amount, or always defer to a partner?

### Industry-Specific Rules

- **ACCOUNTING-045. Are there engagement-letter, money-laundering ID verification, or authorization steps that must happen before work begins?**
  - Why it matters: Accounting firms are legally required to perform AML/KYC checks and engagement letters; the AI must include these in onboarding.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, booking
  - Required: yes
  - Example answer: Signed engagement letter and photo ID + proof of address required before any filing
  - Follow-up question: What identity documents satisfy your money-laundering verification?

### Compliance / Safety

- **ACCOUNTING-046. What explicit disclaimers must the AI give about not providing regulated tax/financial advice?**
  - Why it matters: Stating that the AI is not giving advice protects the firm legally and sets correct client expectations.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, faq
  - Required: yes
  - Example answer: I'm an assistant and can't give tax or financial advice; an accountant will advise you directly
  - Follow-up question: Should this disclaimer appear at the start of every conversation or only when advice is requested?
- **ACCOUNTING-047. What are your data-protection rules for handling and storing client financial information shared with the AI (e.g. GDPR consent, retention, no storing on chat)?**
  - Why it matters: Financial data is highly sensitive and regulated; the AI must follow strict handling and consent rules to avoid breaches.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance
  - Required: yes
  - Example answer: Capture only minimal contact details, require GDPR consent, never store IDs in chat logs
  - Follow-up question: What consent statement should the AI present before collecting any personal data?

### Customer Data Collection

- **ACCOUNTING-024. What contact and identity details must the AI collect from every new enquiry (name, business name, email, phone)?**
  - Why it matters: Standardized intake data ensures the team can follow up and attach the enquiry to the right record.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, booking, follow_up
  - Required: yes
  - Example answer: Full name, business name, email, mobile number, and nature of enquiry
  - Follow-up question: Which of these fields are mandatory before the AI confirms a booking?
- **ACCOUNTING-025. Which sensitive financial identifiers must the AI NEVER collect over chat or voice (e.g. full tax ID, SSN/NI number, bank logins, passwords)?**
  - Why it matters: Capturing sensitive identifiers via an AI channel creates serious data-protection and fraud risk; these must be explicitly off-limits.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, compliance, customer_support
  - Required: yes
  - Example answer: Never collect full National Insurance/SSN, UTR, bank login, or card details
  - Follow-up question: How should the AI respond if a client tries to send one of these sensitive details?

### AI Tone / Personality

- **ACCOUNTING-035. What tone and personality should the AI use (e.g. professional and reassuring, friendly and plain-English, formal)?**
  - Why it matters: Accounting clients value trust and clarity; tone must match the firm's brand and reduce jargon anxiety.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: Professional, warm, and jargon-free — explains things in plain English
  - Follow-up question: Are there phrases or jargon the AI should avoid to keep things approachable?

### Reporting / Analytics

- **ACCOUNTING-048. What metrics do you want reported from AI conversations (enquiry volume, bookings, service interest, missed-document chases, conversion rate)?**
  - Why it matters: Reporting tells the firm what the AI is delivering and where demand and drop-off occur.
  - Expected answer type: `multi_select_or_text`
  - Used for: analytics, reporting
  - Required: no
  - Example answer: Weekly: enquiries, booked consultations, top requested services, conversion rate
  - Follow-up question: How often and to whom should these reports be sent?
- **ACCOUNTING-049. Which enquiries should be flagged as high-value leads for priority human follow-up in reports?**
  - Why it matters: Flagging high-value leads (e.g. large turnover, multiple services) helps the team prioritize the best opportunities.
  - Expected answer type: `long_text`
  - Used for: analytics, reporting, lead_qualification
  - Required: no
  - Example answer: Flag limited companies over £1m turnover or anyone asking about R&D or audit
  - Follow-up question: What turnover or service criteria define a 'hot' lead for your team?

### Automation Triggers

- **ACCOUNTING-050. What automated actions should fire on key events (e.g. booking confirmed, ID verification needed, deadline approaching, document received)?**
  - Why it matters: Defining triggers turns the AI into a workflow engine that sends confirmations, reminders, and handoffs automatically.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, booking, compliance, staff_assignment
  - Required: yes
  - Example answer: On booking: send confirmation + document checklist; on new client: request ID for AML; pre-deadline: send reminder
  - Follow-up question: Should any trigger also notify a specific staff member, and who?


## 19. Hotel / Guest House

### Business Identity

- **HOTEL-001. What is the full legal and trading name of your hotel or guest house?**
  - Why it matters: The AI must introduce the property correctly on calls and messages so guests know they reached the right place.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: yes
  - Example answer: The Riverside Guest House (legal entity: Riverside Hospitality Ltd)
  - Follow-up question: Do you have any shorthand name or nickname guests commonly use that we should also recognise?
- **HOTEL-002. What is the full property address, including any directions or landmarks guests need to find you?**
  - Why it matters: Guests frequently ask for the address and directions, and the AI should answer accurately for arrivals and check-in.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, voice_call
  - Required: yes
  - Example answer: 12 Riverside Lane, Bath BA1 2QR. Two minutes from Pulteney Bridge; parking entrance is on the rear lane off Argyle Street.
  - Follow-up question: Is there a separate entrance or reception location guests should be directed to after hours?
- **HOTEL-003. What are your reception/front-desk operating hours and is the property staffed 24/7?**
  - Why it matters: The AI needs to tell guests when staff are available and how to handle requests outside staffed hours.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, faq, voice_call, escalation
  - Required: yes
  - Example answer: Reception staffed 07:00-23:00 daily; after-hours guests use a key safe and an on-call phone line.
  - Follow-up question: What should the AI tell guests who contact you outside reception hours?
- **HOTEL-004. What is your official star rating, classification, or any quality certifications (e.g. AA, VisitBritain, boutique)?**
  - Why it matters: Classification sets guest expectations and helps the AI position the property accurately in enquiries.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: 4-star Gold, AA-rated; VisitBritain Breakfast Award.
  - Follow-up question: Are there any awards or review scores you'd like the AI to mention to prospective guests?
- **HOTEL-005. How many rooms does the property have in total?**
  - Why it matters: Total inventory shapes availability answers and helps the AI gauge group-booking feasibility.
  - Expected answer type: `number`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: 18 rooms
  - Follow-up question: Do you ever close part of the property seasonally, reducing the number of bookable rooms?

### Services / Products

- **HOTEL-006. What room types do you offer and how many of each (e.g. Single, Double, Twin, Family, Suite)?**
  - Why it matters: Room types are the core product; the AI must match guest needs to the right room and quantity available.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, pricing, lead_qualification
  - Required: yes
  - Example answer: 6 Double, 4 Twin, 4 Family (sleeps 4), 2 Single, 2 Suites.
  - Follow-up question: Which room type is your most popular or best to recommend by default?
- **HOTEL-007. What amenities are included in each room (e.g. ensuite, TV, tea/coffee, air conditioning, Wi-Fi)?**
  - Why it matters: Guests routinely ask about in-room features before booking; the AI must answer precisely per room type.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: All rooms: ensuite, smart TV, free Wi-Fi, tea/coffee tray, hairdryer. Suites add air conditioning and a Nespresso machine.
  - Follow-up question: Are there any amenities that differ between room types we should flag clearly?
- **HOTEL-008. What property-wide facilities and services do you offer (e.g. restaurant, bar, spa, gym, breakfast, room service)?**
  - Why it matters: Facility questions are among the most common pre-booking enquiries and influence the guest's decision.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: On-site restaurant (breakfast + dinner), licensed bar, garden terrace, free Wi-Fi throughout, daily housekeeping.
  - Follow-up question: Are any of these facilities seasonal or restricted to certain hours?
- **HOTEL-009. What breakfast and dining options are available, and are they included or charged separately?**
  - Why it matters: Meal inclusion is a frequent question and affects how the AI quotes total stay cost.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, pricing
  - Required: yes
  - Example answer: Full English breakfast included in all room rates, served 07:30-09:30. Dinner available a la carte until 21:00.
  - Follow-up question: Do you cater to dietary requirements such as vegan, gluten-free, or halal?
- **HOTEL-010. Do you offer any extra services guests can add to a stay (e.g. airport transfer, parking, late checkout, extra bed, cot)?**
  - Why it matters: Add-on services are upsell opportunities and the AI needs to know what to offer and arrange.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, pricing
  - Required: no
  - Example answer: Airport transfer, on-site parking, extra bed, baby cot, packed lunch, early check-in.
  - Follow-up question: Which of these add-ons require advance notice and how much notice?

### Pricing / Packages

- **HOTEL-011. What is the standard nightly rate for each room type?**
  - Why it matters: The AI must quote accurate prices per room type to answer cost enquiries and qualify leads.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: yes
  - Example answer: Single from £85, Double from £120, Twin from £120, Family from £160, Suite from £220 per night.
  - Follow-up question: Are these rates per room or per person, and do they include breakfast and taxes?
- **HOTEL-012. Do your rates vary by season, day of week, or demand, and how should the AI handle dynamic pricing?**
  - Why it matters: Seasonal and dynamic pricing means a single quoted rate can be wrong; the AI must set expectations correctly.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, booking
  - Required: yes
  - Example answer: Rates rise ~25% on weekends and during festival season (May-Sept). The AI should quote 'from' prices and confirm exact rates by date.
  - Follow-up question: Should the AI quote exact rates or only 'from' prices and hand off to staff for confirmation?
- **HOTEL-013. Do you offer any packages or special rates (e.g. weekend break, romantic package, midweek deal, long-stay discount)?**
  - Why it matters: Packages drive higher-value bookings and the AI should proactively present relevant offers.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign
  - Required: no
  - Example answer: Romantic Escape (Champagne + late checkout, £260), 3-night midweek 15% off, 7+ nights 20% off.
  - Follow-up question: Are any of these packages restricted to specific room types or dates?

### Booking / Appointment Rules

- **HOTEL-017. What are your standard check-in and check-out times?**
  - Why it matters: Check-in/out times are essential for the AI to set arrival expectations and manage requests.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, faq
  - Required: yes
  - Example answer: Check-in from 15:00, check-out by 11:00.
  - Follow-up question: Do you offer early check-in or late check-out, and is there a charge?
- **HOTEL-018. Is there a minimum stay requirement on any dates (e.g. weekends, peak season, events)?**
  - Why it matters: Minimum-stay rules prevent the AI from confirming bookings that violate property policy.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: 2-night minimum on Friday/Saturday and a 3-night minimum over bank holidays and the August festival.
  - Follow-up question: Should the AI try to upsell an extra night when a guest requests a stay below the minimum?
- **HOTEL-019. How should the AI handle a booking request when the desired dates appear unavailable?**
  - Why it matters: Defines whether the AI offers alternatives, a waitlist, or hands off, avoiding lost bookings on sold-out dates.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking, follow_up
  - Required: yes
  - Example answer: Offer the nearest available dates, then add the guest to a cancellation waitlist if still interested.
  - Follow-up question: Should the AI notify the guest automatically if a room becomes available on their original dates?
- **HOTEL-020. Can the AI confirm and take a booking directly, or must every reservation be confirmed by staff or your booking system?**
  - Why it matters: Determines the AI's authority limit so it never double-books or overpromises availability.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, booking, escalation
  - Required: yes
  - Example answer: The AI collects details and creates a provisional hold; staff confirm within 1 hour via the PMS.
  - Follow-up question: Which booking system or channel manager should reservations be entered into?

### Customer Qualification

- **HOTEL-021. What details must the AI collect to check availability and quote a stay (dates, nights, number of guests, room type)?**
  - Why it matters: Without core booking parameters the AI cannot quote accurately or check availability for the guest.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Check-in date, number of nights, number of adults and children, preferred room type, special requests.
  - Follow-up question: Is there any detail you'd like the AI to always ask even if the guest doesn't mention it?
- **HOTEL-022. What is your maximum occupancy per room type, and how are children and infants counted?**
  - Why it matters: Occupancy limits stop the AI from confirming a room that cannot legally or comfortably hold the party.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, lead_qualification
  - Required: yes
  - Example answer: Double sleeps 2, Family sleeps 2 adults + 2 children. Infants under 2 in a cot don't count toward occupancy.
  - Follow-up question: Can occupancy be increased with an extra bed or sofa bed, and at what cost?

### FAQs

- **HOTEL-026. What is your parking situation (on-site, free, paid, street, capacity)?**
  - Why it matters: Parking is one of the most common pre-arrival questions and the AI must answer it definitively.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, voice_call
  - Required: yes
  - Example answer: 10 free on-site spaces, first come first served; overflow at the public car park 100m away (£8/day).
  - Follow-up question: Can guests reserve a parking space in advance, and is there EV charging?
- **HOTEL-027. What is your pet policy (allowed, restrictions, fees, designated rooms)?**
  - Why it matters: Pet questions are frequent and a wrong answer leads to arrival conflicts and bad reviews.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: yes
  - Example answer: Dogs welcome in 4 designated ground-floor rooms, £15/night, max 2 dogs; assistance dogs free everywhere.
  - Follow-up question: Are there areas of the property where pets are not allowed (e.g. restaurant)?
- **HOTEL-028. What are your policies on smoking, Wi-Fi, accessibility, and children?**
  - Why it matters: These recurring policy questions need consistent, accurate answers from the AI across all channels.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, compliance
  - Required: yes
  - Example answer: Non-smoking throughout (£100 cleaning fee if breached); free Wi-Fi; lift to all floors; children of all ages welcome.
  - Follow-up question: Are there any age restrictions, such as adults-only periods or rooms?
- **HOTEL-029. What local information do guests most often ask about (attractions, transport, restaurants, distances)?**
  - Why it matters: Acting as a local concierge improves guest satisfaction and reduces front-desk load.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: no
  - Example answer: Nearest station 8 min walk; Roman Baths 5 min; recommended dinner spots: The Olive Tree, Sotto Sotto.
  - Follow-up question: Are there partner attractions or restaurants you'd like the AI to recommend specifically?
- **HOTEL-030. What is your luggage storage and early-arrival/late-departure policy?**
  - Why it matters: Guests arriving before check-in or leaving after check-out commonly ask about storing bags.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: no
  - Example answer: Free luggage storage at reception before check-in and after check-out on departure day.
  - Follow-up question: Is luggage storage available during reception hours only, or via a secure room after hours?

### Communication Channels

- **HOTEL-031. Which channels should the AI handle guest enquiries on (phone, WhatsApp, email, SMS, website chat)?**
  - Why it matters: Defines where the AI operates so coverage matches your guests' preferred contact methods.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, email, sms
  - Required: yes
  - Example answer: Phone (voice), WhatsApp, and email; website chat for general enquiries.
  - Follow-up question: Which channel should be the AI's primary one for booking confirmations?
- **HOTEL-035. What languages should the AI be able to communicate in with guests?**
  - Why it matters: International guests may need support in other languages, and the AI should know which to offer.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, voice_call, whatsapp
  - Required: no
  - Example answer: English primary; also French and Spanish for international guests.
  - Follow-up question: Should the AI automatically detect and switch language, or always start in English?

### Voice Call Behavior

- **HOTEL-032. How should the AI greet callers and at what point should it offer to transfer to a human?**
  - Why it matters: The phone greeting and transfer rules set the tone and protect against the AI overstepping on complex calls.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, voice_call, escalation
  - Required: yes
  - Example answer: Greet: 'Good day, thank you for calling Riverside Guest House, how can I help?' Transfer for complaints, group bookings, or anything it can't confirm.
  - Follow-up question: What phone number or extension should calls be transferred to, and what are the hours for live transfer?

### WhatsApp / Email / SMS Behavior

- **HOTEL-033. How should the AI behave on WhatsApp/SMS/email regarding response speed, message length, and sending links?**
  - Why it matters: Channel-specific behaviour keeps messaging on-brand and ensures booking/payment links are delivered appropriately.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, whatsapp, sms, email
  - Required: yes
  - Example answer: Reply within 2 minutes on WhatsApp; keep messages short with bullet points; send a secure booking/payment link rather than taking card numbers in chat.
  - Follow-up question: Are there any messages that must always be sent by email rather than WhatsApp (e.g. invoices, confirmations)?

### Follow-up Rules

- **HOTEL-036. When and how should the AI follow up with guests who enquired but did not book?**
  - Why it matters: Timely follow-up recovers undecided enquiries that would otherwise be lost bookings.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign
  - Required: yes
  - Example answer: If no booking within 24 hours, send a friendly WhatsApp reminder with availability; a second nudge with a small offer after 72 hours.
  - Follow-up question: After how many follow-ups with no response should the AI stop contacting the guest?
- **HOTEL-037. What pre-arrival and post-stay messages should the AI send (e.g. confirmation, arrival reminder, review request)?**
  - Why it matters: Lifecycle messaging reduces no-shows and drives reviews and repeat bookings.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, campaign, customer_support
  - Required: no
  - Example answer: Booking confirmation immediately; check-in details 24h before arrival; thank-you + review link the morning after checkout.
  - Follow-up question: Which review platform link should the AI share after a guest's stay?

### Sales / Upsell Opportunities

- **HOTEL-038. What upsells should the AI offer during the booking conversation (room upgrade, breakfast, late checkout, packages)?**
  - Why it matters: Proactive upselling increases average booking value during the booking flow.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, pricing, campaign
  - Required: no
  - Example answer: Offer suite upgrade for +£50/night, dinner package, late checkout, and a celebration add-on if it's a special occasion.
  - Follow-up question: Which upsell has the best margin or take-rate that the AI should prioritise?
- **HOTEL-039. Should the AI promote direct booking over OTAs, and what incentive can it offer to do so?**
  - Why it matters: Direct bookings save OTA commission; the AI can steer guests with a benefit if you allow it.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, campaign
  - Required: no
  - Example answer: Yes - offer 'best rate guarantee + free room upgrade' for guests who book direct instead of via Booking.com.
  - Follow-up question: What is the maximum discount or perk the AI is allowed to offer for a direct booking?

### Complaints / Escalation

- **HOTEL-041. How should the AI handle guest complaints, and which issues must be escalated to a human immediately?**
  - Why it matters: Complaint handling protects your reputation; some issues must reach staff at once rather than being handled by AI.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, escalation, customer_support
  - Required: yes
  - Example answer: Acknowledge, apologise, log the issue, and escalate to the duty manager immediately for refunds, room faults, safety, or any upset guest.
  - Follow-up question: Who is the escalation contact and what is the maximum time before a human responds?
- **HOTEL-042. What decisions is the AI explicitly NOT allowed to make on its own (e.g. issuing refunds, comping rooms, waiving fees)?**
  - Why it matters: Clear boundaries prevent the AI from making costly commitments that only staff should authorise.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, escalation, payment, compliance
  - Required: yes
  - Example answer: May not issue refunds, waive cancellation fees, comp rooms, or override the cancellation policy without manager approval.
  - Follow-up question: Is there a small-value goodwill gesture (e.g. free breakfast) the AI may offer without approval?

### Payments / Deposits / Refunds

- **HOTEL-014. Do you require a deposit to confirm a booking, and if so how much and when is it taken?**
  - Why it matters: Deposit rules determine how the AI confirms reservations and what it tells guests about payment timing.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, payment
  - Required: yes
  - Example answer: First night's rate taken as a non-refundable deposit at the time of booking; balance due on arrival.
  - Follow-up question: Is the deposit refundable, and under what conditions?
- **HOTEL-015. What payment methods do you accept and when is the full balance due?**
  - Why it matters: Guests ask how and when to pay; the AI must answer correctly and avoid quoting unsupported methods.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, payment, faq
  - Required: yes
  - Example answer: Visa, Mastercard, Amex, Apple Pay and cash. Balance due on check-in unless prepaid online.
  - Follow-up question: Do you take a pre-authorisation hold for incidentals at check-in, and how much?
- **HOTEL-016. What is your cancellation and refund policy, including any free-cancellation window?**
  - Why it matters: Cancellation policy is one of the highest-frequency guest questions and directly affects refunds and disputes.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, payment, escalation
  - Required: yes
  - Example answer: Free cancellation up to 48 hours before arrival; within 48 hours the first night is charged. No-shows charged the full stay.
  - Follow-up question: Do non-refundable rate bookings have a different cancellation policy?

### Industry-Specific Rules

- **HOTEL-050. Are there any property-specific rules, restrictions, or quirks the AI must always respect (e.g. no stag/hen parties, quiet hours, adults-only, group limits)?**
  - Why it matters: Property-specific policies prevent the AI from accepting bookings or making promises that violate house rules.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, booking, compliance, lead_qualification
  - Required: yes
  - Example answer: No stag/hen groups; quiet hours 22:00-07:00; max group booking 6 rooms; no events without manager sign-off.
  - Follow-up question: Which of these rules should the AI state upfront versus only mention if a guest's request would breach them?

### Compliance / Safety

- **HOTEL-043. What guest registration, ID, and legal record-keeping requirements must the AI follow at booking or check-in?**
  - Why it matters: Hotels have legal obligations (e.g. guest registers, ID for non-residents) the AI must support and not skip.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, booking
  - Required: yes
  - Example answer: Lead guest must provide name, nationality, and ID at check-in; records kept per the Immigration (Hotel Records) regulations.
  - Follow-up question: How long must guest records be retained and where are they stored securely?
- **HOTEL-044. How should the AI handle data privacy, marketing consent, and payment data when collecting guest information?**
  - Why it matters: GDPR and PCI obligations require explicit consent and prohibit the AI from mishandling card or personal data.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, payment, customer_support
  - Required: yes
  - Example answer: Capture explicit marketing consent; never store card numbers in chat - always use a secure payment link; honour data deletion requests.
  - Follow-up question: Should the AI link to your privacy policy when collecting personal data?
- **HOTEL-045. What safety and emergency information should the AI know to share (fire procedures, accessibility, allergy/medical handling)?**
  - Why it matters: Guests with accessibility or safety needs require accurate answers, and the AI must escalate genuine emergencies.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, compliance, escalation, faq
  - Required: no
  - Example answer: Step-free access to all floors via lift; fire assembly point in the front car park; for medical emergencies advise calling 999 and alert staff.
  - Follow-up question: Should the AI immediately escalate any message describing a medical or safety emergency to staff?

### Customer Data Collection

- **HOTEL-023. What guest contact and identity details must be captured for a confirmed booking (name, phone, email, address, ID)?**
  - Why it matters: Defines the data the AI collects so reservations are complete and contactable for confirmations and arrival.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, booking, customer_support, compliance
  - Required: yes
  - Example answer: Full name, mobile number, email, home address, and photo ID required at check-in for the lead guest.
  - Follow-up question: Is government-issued ID required at check-in, and should the AI mention this in advance?
- **HOTEL-024. What special requests or preferences should the AI record (e.g. bed type, floor, quiet room, accessibility, allergies)?**
  - Why it matters: Capturing preferences improves guest experience and lets staff prepare the room ahead of arrival.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking, customer_support
  - Required: no
  - Example answer: Bed preference, ground floor / step-free, quiet room away from road, dietary or allergy notes, arrival time.
  - Follow-up question: Should the AI clearly state that special requests are subject to availability and not guaranteed?
- **HOTEL-025. Should the AI ask the purpose of stay (leisure, business, event, group) and record it?**
  - Why it matters: Purpose of stay enables relevant upsells, room matching, and reporting on guest segments.
  - Expected answer type: `yes_no`
  - Used for: ai_prompt, lead_qualification, analytics
  - Required: no
  - Example answer: Yes - record purpose so we can offer business invoices or celebration packages where relevant.
  - Follow-up question: Which purposes should trigger a specific package or offer from the AI?

### AI Tone / Personality

- **HOTEL-034. What tone and personality should the AI use when speaking with guests (e.g. warm, formal, concise, friendly)?**
  - Why it matters: Tone must match your brand and guest expectations so the AI feels like a natural extension of your team.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, voice_call, whatsapp, email
  - Required: yes
  - Example answer: Warm, welcoming and professional - like a friendly front-desk host, never pushy.
  - Follow-up question: Are there any phrases, words, or styles the AI should always use or always avoid?

### Reporting / Analytics

- **HOTEL-046. What metrics and reports do you want from the AI (enquiries, conversion rate, occupancy impact, common questions)?**
  - Why it matters: Defines the analytics the AI should track so you can measure its impact on bookings and operations.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, analytics, reporting
  - Required: no
  - Example answer: Weekly: total enquiries, bookings created, enquiry-to-booking conversion %, top 5 guest questions, missed/escalated calls.
  - Follow-up question: How often and to whom should these reports be sent?
- **HOTEL-047. Should the AI flag lost bookings and their reasons (price, availability, policy) for review?**
  - Why it matters: Tracking why enquiries don't convert reveals pricing, availability, or policy issues you can fix.
  - Expected answer type: `yes_no`
  - Used for: analytics, reporting, follow_up
  - Required: no
  - Example answer: Yes - tag each lost enquiry with a reason so we can see if we're losing bookings to price or sold-out dates.
  - Follow-up question: Which lost-booking reason would you most want to be alerted about in real time?

### Automation Triggers

- **HOTEL-040. What returning-guest or seasonal campaigns should the AI run automatically (e.g. loyalty offers, off-season deals)?**
  - Why it matters: Automated campaigns fill low-occupancy periods and re-engage past guests without manual effort.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, campaign, follow_up
  - Required: no
  - Example answer: Send returning guests a 10% loyalty code each spring; promote off-season midweek deals when occupancy drops below 50%.
  - Follow-up question: Should campaign messages only go to guests who consented to marketing contact?
- **HOTEL-048. What events should automatically trigger an AI action (e.g. new OTA booking, cancellation, check-in date approaching)?**
  - Why it matters: Event triggers let the AI act proactively rather than only responding, automating routine guest touchpoints.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, follow_up, booking
  - Required: yes
  - Example answer: New booking -> send confirmation; 24h before arrival -> send check-in info; cancellation -> notify waitlist guests.
  - Follow-up question: Should any of these triggers require staff approval before the AI sends the message?
- **HOTEL-049. When occupancy is low or high, what automated pricing or messaging adjustments should the AI make?**
  - Why it matters: Occupancy-driven automation helps fill empty rooms and protects rates when demand is high.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, follow_up, pricing, campaign
  - Required: no
  - Example answer: Below 40% occupancy 7 days out -> send a flash midweek offer; above 90% -> stop discounting and promote premium rooms only.
  - Follow-up question: What is the lowest rate the AI is permitted to advertise during low-occupancy promotions?


## 20. Construction / Contractor Business

### Business Identity

- **CONSTRUCTION-001. What is the registered/trading name of your construction or contracting business as it should appear in customer conversations?**
  - Why it matters: The AI must introduce the business with the exact name customers expect, avoiding confusion with similarly named contractors in the area.
  - Expected answer type: `short_text`
  - Used for: ai_prompt, faq
  - Required: yes
  - Example answer: Apex Build & Renovation Ltd
  - Follow-up question: Do you also operate under any other trading names or DBA brands the AI should recognise?
- **CONSTRUCTION-002. Which type of contractor are you (general contractor, design-build, subcontractor specialty, etc.)?**
  - Why it matters: Defines the scope of work the AI should claim and prevents it from accepting jobs outside your trade.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Design-build general contractor
  - Follow-up question: Do you self-perform any trades, or do you manage subcontractors for all of them?
- **CONSTRUCTION-003. What geographic service area (cities, postcodes, or radius) do you cover for projects?**
  - Why it matters: Lets the AI qualify out-of-area leads early and avoid scheduling site visits you cannot service.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification, booking
  - Required: yes
  - Example answer: Within 40 miles of Denver, CO — including Aurora, Lakewood, and Boulder.
  - Follow-up question: Do you charge a travel/mobilisation fee for projects near the edge of your service area?
- **CONSTRUCTION-004. What are your standard office hours and your typical on-site working hours?**
  - Why it matters: Office hours govern when callers reach a human; site hours set expectations for crew availability and noise/permit windows.
  - Expected answer type: `time_range`
  - Used for: ai_prompt, booking, voice_call
  - Required: yes
  - Example answer: Office Mon-Fri 8am-5pm; crews on site 7am-4pm weekdays.
  - Follow-up question: Do you take or schedule any work on weekends?
- **CONSTRUCTION-005. What is your main business phone, email, and office/yard address for customer reference?**
  - Why it matters: The AI needs accurate contact and location details to share with customers and to route physical visits or document drop-offs.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: Phone 303-555-0142, info@apexbuild.com, 120 Industrial Way, Denver CO 80216.
  - Follow-up question: Is the office address open to walk-ins, or appointment only?

### Services / Products

- **CONSTRUCTION-006. What new-build construction services do you offer (custom homes, commercial shells, ADUs, etc.)?**
  - Why it matters: Defines which new-build inquiries the AI can confidently accept and quote-qualify.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Custom single-family homes, detached ADUs, light commercial tenant build-outs.
  - Follow-up question: Is there a minimum project size or value you accept for new builds?
- **CONSTRUCTION-007. What renovation and remodeling services do you provide (kitchens, baths, whole-home, etc.)?**
  - Why it matters: Renovation is often the highest-volume lead type; the AI must match inquiries to services you actually deliver.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Kitchen remodels, bathroom remodels, whole-home renovations, basement finishing.
  - Follow-up question: Do you handle structural renovations or only cosmetic/non-structural work?
- **CONSTRUCTION-008. Do you offer extensions, additions, or structural expansions, and what types?**
  - Why it matters: Extensions carry permit and engineering complexity; the AI should set expectations and gather scope accordingly.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, lead_qualification, faq
  - Required: yes
  - Example answer: Single and double-storey rear extensions, garage conversions, second-storey additions.
  - Follow-up question: Do you provide in-house structural engineering and architectural drawings for these?
- **CONSTRUCTION-009. What specialty or trade services do you self-perform (concrete, framing, roofing, electrical, etc.)?**
  - Why it matters: Helps the AI answer trade-specific inquiries and distinguish work you do directly from work you subcontract.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, faq, lead_qualification
  - Required: no
  - Example answer: We self-perform framing and concrete; subcontract MEP and roofing.
  - Follow-up question: Do you take standalone trade jobs (e.g. concrete only) or only as part of a full project?
- **CONSTRUCTION-010. Are there any common requests you do NOT take (e.g. small handyman jobs, asbestos removal, mobile homes)?**
  - Why it matters: Lets the AI politely decline and redirect unsuitable inquiries instead of booking unwanted site visits.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, lead_qualification
  - Required: yes
  - Example answer: We don't do handyman/punch-list jobs under $5k, asbestos abatement, or mobile home work.
  - Follow-up question: Should the AI refer declined jobs to a partner contractor, or just decline?

### Pricing / Packages

- **CONSTRUCTION-011. How do you typically price projects (fixed bid, cost-plus, time-and-materials, per-square-foot)?**
  - Why it matters: The AI must explain your pricing model correctly so customers understand how their final cost is determined.
  - Expected answer type: `single_select`
  - Used for: ai_prompt, pricing, faq
  - Required: yes
  - Example answer: Fixed bid for most projects; cost-plus for open-scope renovations.
  - Follow-up question: When do you switch from a fixed bid to cost-plus?
- **CONSTRUCTION-012. Do you charge for estimates, quotes, or site visits, and if so how much?**
  - Why it matters: Customers frequently ask if quotes are free; the AI must state this accurately to avoid disputes at booking.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, booking, faq
  - Required: yes
  - Example answer: Initial site visit and ballpark estimate are free; detailed design/estimate package is $750 credited to the project.
  - Follow-up question: Is the paid estimate fee refundable or credited if they proceed with the work?
- **CONSTRUCTION-013. What rough price ranges or starting points can the AI share for your common project types?**
  - Why it matters: Ballpark ranges qualify budget-mismatched leads early without committing you to a firm number.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, pricing, lead_qualification
  - Required: no
  - Example answer: Kitchen remodels start around $35k; bathroom remodels around $18k; additions from $250/sq ft.
  - Follow-up question: Should the AI always caveat these as estimates subject to a site visit?

### Booking / Appointment Rules

- **CONSTRUCTION-016. What types of appointments can the AI book (initial site visit, design consultation, estimate walkthrough)?**
  - Why it matters: Defines the bookable event types so the AI offers the right meeting for each stage of the customer journey.
  - Expected answer type: `multi_select_or_text`
  - Used for: ai_prompt, booking
  - Required: yes
  - Example answer: Free initial site visit, paid design consultation, final estimate review.
  - Follow-up question: Which appointment type should be the default first step for a new lead?
- **CONSTRUCTION-017. How long does a typical site visit take and who from your team attends?**
  - Why it matters: Accurate duration and attendee info lets the AI block the right calendar time and tell the customer who to expect.
  - Expected answer type: `long_text`
  - Used for: booking, staff_assignment, ai_prompt
  - Required: yes
  - Example answer: About 45-60 minutes; the estimator or project manager attends.
  - Follow-up question: Should the customer or all decision-makers be present for the visit?
- **CONSTRUCTION-018. How much advance notice do you need to schedule a site visit, and what days/times are available?**
  - Why it matters: Prevents the AI from offering same-day slots when estimators are booked and aligns availability with your calendar.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt
  - Required: yes
  - Example answer: Minimum 2 business days notice; site visits Tue-Thu, 9am-3pm.
  - Follow-up question: Should the AI offer a waitlist for earlier slots if a cancellation opens up?
- **CONSTRUCTION-019. What is your cancellation, reschedule, and no-show policy for site visits and consultations?**
  - Why it matters: The AI must state policies and enforce them when customers change plans, protecting estimator time.
  - Expected answer type: `long_text`
  - Used for: booking, ai_prompt, faq
  - Required: yes
  - Example answer: Please give 24 hours notice; repeated no-shows may require a refundable $100 hold for future visits.
  - Follow-up question: Should the AI send a reminder the day before to reduce no-shows?
- **CONSTRUCTION-020. What information must the customer provide before you'll confirm a site visit (address, property access, photos)?**
  - Why it matters: Ensures estimators arrive prepared and aren't sent to incomplete or inaccessible jobs.
  - Expected answer type: `multi_select_or_text`
  - Used for: booking, lead_qualification, ai_prompt
  - Required: yes
  - Example answer: Property address, project description, photos of the area, and confirmation they own/can authorise work.
  - Follow-up question: Should the AI block booking until the property-owner authorisation is confirmed?

### Customer Qualification

- **CONSTRUCTION-021. What project type and scope details should the AI capture from every lead?**
  - Why it matters: Scope drives whether a lead is viable; capturing it upfront lets estimators prioritise and prepare.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, ai_prompt, staff_assignment
  - Required: yes
  - Example answer: Project type, rooms/areas involved, square footage, whether structural work, existing drawings.
  - Follow-up question: Which single detail most often disqualifies a lead for you?
- **CONSTRUCTION-022. What budget range do you ask leads about, and what is your minimum viable project budget?**
  - Why it matters: Budget qualification filters tyre-kickers and aligns the AI's tone with serious buyers.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, pricing, ai_prompt
  - Required: yes
  - Example answer: We ask their target budget; minimum viable project is $25k.
  - Follow-up question: Should the AI gently disqualify or still book a call when budget is below minimum?
- **CONSTRUCTION-023. What timeline questions should the AI ask (desired start date, hard deadlines, flexibility)?**
  - Why it matters: Timeline mismatch is a common deal-killer; capturing it early sets realistic expectations and prioritises bookings.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, booking, ai_prompt
  - Required: yes
  - Example answer: Ask desired start month, any fixed deadline (e.g. event, lease), and how flexible they are.
  - Follow-up question: What is your current typical lead time before a project can start?
- **CONSTRUCTION-024. How should the AI determine whether the lead is the property owner or has authority to commission work?**
  - Why it matters: Construction work requires owner authorisation; booking non-owners wastes estimator time and creates legal risk.
  - Expected answer type: `long_text`
  - Used for: lead_qualification, compliance, ai_prompt
  - Required: yes
  - Example answer: Ask if they own the property or are an authorised agent/landlord/property manager.
  - Follow-up question: Do you require written owner authorisation before any site visit?

### FAQs

- **CONSTRUCTION-026. How do you handle permits — do you pull them, and how should the AI explain permit responsibilities?**
  - Why it matters: Permit confusion is one of the most common customer questions and a major source of project delay disputes.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, compliance
  - Required: yes
  - Example answer: We pull all required building permits and coordinate inspections; permit fees are billed at cost.
  - Follow-up question: Roughly how long do permits typically add to a project timeline in your area?
- **CONSTRUCTION-027. What typical timelines should the AI quote for your common project types?**
  - Why it matters: Timeline expectations are a top FAQ; consistent answers reduce friction and set realistic schedules.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: yes
  - Example answer: Bathroom remodel 3-4 weeks, kitchen 6-8 weeks, full addition 4-6 months including permits.
  - Follow-up question: Should the AI always state timelines are estimates subject to permits and weather?
- **CONSTRUCTION-028. What warranty or guarantee do you offer on workmanship, and for how long?**
  - Why it matters: Warranty is a key trust and closing question; the AI must state terms accurately to support sales and reduce disputes.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, customer_support
  - Required: yes
  - Example answer: 2-year workmanship warranty plus manufacturer warranties on materials.
  - Follow-up question: How should a customer initiate a warranty claim, and who handles it?
- **CONSTRUCTION-029. What are the most common questions customers ask before hiring you, and your preferred answers?**
  - Why it matters: Pre-loading your real FAQs lets the AI answer instantly and consistently in your voice.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt
  - Required: no
  - Example answer: Are you licensed/insured? Do you offer financing? Can I live in the home during work? How are changes handled?
  - Follow-up question: Are there any questions you'd prefer the AI defer to a human rather than answer?
- **CONSTRUCTION-030. Do you offer financing options, and how should the AI describe them?**
  - Why it matters: Financing availability often determines whether a budget-sensitive lead proceeds; the AI should surface it appropriately.
  - Expected answer type: `long_text`
  - Used for: faq, ai_prompt, pricing
  - Required: no
  - Example answer: Yes — we partner with a lender offering project financing from 6.9% APR; the AI can share the application link.
  - Follow-up question: Should financing only be mentioned when a customer raises budget concerns?

### Staff / Team / Availability

- **CONSTRUCTION-040. Who are the estimators/project managers and how should the AI assign or route leads to them?**
  - Why it matters: Routing leads to the right person by project type or area speeds up quoting and avoids double-booking.
  - Expected answer type: `long_text`
  - Used for: staff_assignment, booking, ai_prompt
  - Required: yes
  - Example answer: Maria handles residential remodels, Tom handles new builds/commercial; route by project type.
  - Follow-up question: Should the AI check each estimator's calendar availability before offering a visit slot?

### Communication Channels

- **CONSTRUCTION-031. Which channels should the AI receptionist handle (voice calls, WhatsApp, SMS, email, web chat)?**
  - Why it matters: Defines where the AI is active so leads are captured on every channel you advertise.
  - Expected answer type: `multi_select`
  - Used for: ai_prompt, voice_call, whatsapp, email, sms
  - Required: yes
  - Example answer: Voice calls, WhatsApp, and web chat; email for quote delivery only.
  - Follow-up question: Which channel is your highest-volume source of new leads?
- **CONSTRUCTION-035. What response-time expectations should the AI set for quotes, callbacks, and messages?**
  - Why it matters: Clear SLAs reduce chase-up messages and align customer expectations with your team's capacity.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, customer_support, faq
  - Required: no
  - Example answer: Replies within 1 business hour; detailed quotes within 3-5 business days of the site visit.
  - Follow-up question: Should the AI proactively message if a quote will be delayed beyond that window?

### Voice Call Behavior

- **CONSTRUCTION-032. How should the AI handle inbound calls — answer everything, screen, or only take overflow/after-hours?**
  - Why it matters: Sets the AI's role on the phone so it complements rather than competes with your office staff.
  - Expected answer type: `single_select`
  - Used for: voice_call, ai_prompt
  - Required: yes
  - Example answer: Answer after-hours and overflow when the office line rings more than 4 times.
  - Follow-up question: When the AI can't help, should it take a message or transfer to an on-call manager?

### WhatsApp / Email / SMS Behavior

- **CONSTRUCTION-033. How should the AI handle photos and documents sent over WhatsApp or email (site photos, plans)?**
  - Why it matters: Customers often send images of their space; the AI must acknowledge, store, and route them to the estimator.
  - Expected answer type: `long_text`
  - Used for: whatsapp, email, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Confirm receipt, attach to the lead record, and ask for additional angles if helpful.
  - Follow-up question: Should the AI proactively request photos to pre-qualify before booking a visit?

### Follow-up Rules

- **CONSTRUCTION-036. How and when should the AI follow up with leads who requested a quote but haven't responded?**
  - Why it matters: Quote nurture recovers stalled deals; defined timing prevents both neglect and over-messaging.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, ai_prompt
  - Required: yes
  - Example answer: Follow up 2 days, 7 days, and 14 days after the quote is sent, then close as cold.
  - Follow-up question: What incentive (if any) can the AI offer on the final follow-up to re-engage?
- **CONSTRUCTION-037. How should the AI follow up with past customers for maintenance, warranty check-ins, or repeat work?**
  - Why it matters: Repeat and referral business is high-margin; structured check-ins keep your pipeline warm.
  - Expected answer type: `long_text`
  - Used for: follow_up, campaign, ai_prompt
  - Required: no
  - Example answer: Warranty check-in at 11 months, plus a seasonal maintenance reminder once a year.
  - Follow-up question: Should the AI ask satisfied past customers for a review or referral during follow-up?

### Sales / Upsell Opportunities

- **CONSTRUCTION-038. What add-ons or upgrades should the AI suggest during the conversation (premium finishes, extra rooms, smart-home)?**
  - Why it matters: Well-timed upsells raise project value; the AI should surface relevant ones without being pushy.
  - Expected answer type: `multi_select_or_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: Suggest design package, premium fixtures, energy-efficiency upgrades, and warranty extensions.
  - Follow-up question: At what point in the conversation should upsells be raised without harming trust?
- **CONSTRUCTION-039. Should the AI bundle related services (e.g. landscaping after an extension) and how?**
  - Why it matters: Bundling captures adjacent work the customer would otherwise hire elsewhere for.
  - Expected answer type: `long_text`
  - Used for: campaign, ai_prompt, pricing
  - Required: no
  - Example answer: Offer exterior/landscaping and driveway work as a discounted add-on to any extension.
  - Follow-up question: Do you offer a discount when services are bundled into one contract?

### Complaints / Escalation

- **CONSTRUCTION-041. How should the AI handle complaints about active project delays, quality, or crew conduct?**
  - Why it matters: Construction complaints can escalate fast; the AI must de-escalate and route to the right person promptly.
  - Expected answer type: `long_text`
  - Used for: escalation, customer_support, ai_prompt
  - Required: yes
  - Example answer: Apologise, log details, and notify the assigned project manager immediately for a same-day callback.
  - Follow-up question: Which complaints (e.g. safety incidents) must trigger an instant human escalation?
- **CONSTRUCTION-042. What situations must the AI escalate immediately to a human, and to whom?**
  - Why it matters: Some issues (injuries, structural concerns, legal threats) are unsafe for the AI to handle alone.
  - Expected answer type: `long_text`
  - Used for: escalation, compliance, ai_prompt
  - Required: yes
  - Example answer: On-site injuries, gas/electrical hazards, legal threats, and refund demands go straight to the owner's cell.
  - Follow-up question: What is the after-hours escalation contact for emergencies?

### Payments / Deposits / Refunds

- **CONSTRUCTION-014. What is your deposit requirement to secure a project on the schedule?**
  - Why it matters: The AI must communicate deposit terms so customers can prepare funds and the booking is genuinely committed.
  - Expected answer type: `price`
  - Used for: ai_prompt, pricing, payment, faq
  - Required: yes
  - Example answer: A 10% deposit (minimum $2,500) is required to lock in a start date.
  - Follow-up question: Is the deposit refundable if the customer cancels before work begins?
- **CONSTRUCTION-015. What is your staged/progress payment schedule across the life of a project?**
  - Why it matters: Staged payments are central to construction cash flow; the AI should explain milestones so customers aren't surprised by draws.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, payment, pricing, faq
  - Required: yes
  - Example answer: 10% deposit, 30% at start, 30% at midpoint, 25% at substantial completion, 5% retainage at final.
  - Follow-up question: What payment methods do you accept for progress draws?

### Industry-Specific Rules

- **CONSTRUCTION-045. How should the AI handle change orders and scope changes once a project is underway?**
  - Why it matters: Change orders are a frequent source of disputes; the AI must explain the process and avoid promising free changes.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: yes
  - Example answer: All scope changes are documented in a written change order with cost/timeline impact before work proceeds.
  - Follow-up question: Who is authorised to approve and sign change orders on your side?
- **CONSTRUCTION-046. How should the AI talk about weather, supply-chain, and inspection delays that affect timelines?**
  - Why it matters: These external factors are unavoidable; consistent framing protects you from being blamed for delays outside your control.
  - Expected answer type: `long_text`
  - Used for: ai_prompt, faq, customer_support
  - Required: no
  - Example answer: Explain that weather, material lead times, and city inspections can shift dates and we communicate changes promptly.
  - Follow-up question: Should the AI proactively notify active customers when a delay occurs?

### Compliance / Safety

- **CONSTRUCTION-043. What licensing, registration, and insurance details should the AI be able to confirm to customers?**
  - Why it matters: Customers routinely verify licensing/insurance before hiring; accurate, ready answers build trust and meet legal disclosure norms.
  - Expected answer type: `long_text`
  - Used for: compliance, faq, ai_prompt
  - Required: yes
  - Example answer: Licensed GC #CO-12345, $2M general liability, full workers' comp; proof available on request.
  - Follow-up question: Should the AI send insurance/license certificates automatically when asked, or route to staff?
- **CONSTRUCTION-044. What site-safety rules and access requirements should the AI communicate to customers before work begins?**
  - Why it matters: Setting safety and access expectations protects occupants, crews, and reduces liability and delays.
  - Expected answer type: `long_text`
  - Used for: compliance, ai_prompt, faq
  - Required: yes
  - Example answer: Keep children/pets clear of work zones, provide parking and power/water access, secure valuables.
  - Follow-up question: Are there any sites or conditions where you require occupants to vacate during work?

### Customer Data Collection

- **CONSTRUCTION-025. What contact and project details must the AI collect and store for each new lead?**
  - Why it matters: Complete, consistent lead records let your team follow up, estimate, and track the pipeline accurately.
  - Expected answer type: `multi_select_or_text`
  - Used for: lead_qualification, reporting, follow_up, compliance
  - Required: yes
  - Example answer: Name, phone, email, property address, project type, scope notes, budget, timeline, lead source.
  - Follow-up question: Do you need explicit consent captured before storing or contacting the lead?

### AI Tone / Personality

- **CONSTRUCTION-034. What tone and personality should the AI use with your customers?**
  - Why it matters: Tone shapes brand perception; a contractor's voice should feel trustworthy and competent, not salesy.
  - Expected answer type: `single_select`
  - Used for: ai_prompt
  - Required: yes
  - Example answer: Professional, reassuring, plain-spoken — like an experienced project manager.
  - Follow-up question: Are there words or phrases you want the AI to always use or always avoid?

### Reporting / Analytics

- **CONSTRUCTION-047. What lead and conversation metrics do you want reported (volume, source, qualified rate, booked visits)?**
  - Why it matters: Defines the reporting dashboard so you can measure the AI's impact on your pipeline.
  - Expected answer type: `multi_select_or_text`
  - Used for: reporting, analytics
  - Required: yes
  - Example answer: Weekly: total leads, by source, qualified count, site visits booked, and estimated pipeline value.
  - Follow-up question: How often and through which channel should these reports be delivered?
- **CONSTRUCTION-048. How should the AI capture and report lead source so you can measure marketing ROI?**
  - Why it matters: Knowing which channels produce qualified leads tells you where to invest marketing budget.
  - Expected answer type: `long_text`
  - Used for: reporting, analytics, lead_qualification
  - Required: no
  - Example answer: Ask 'how did you hear about us?' and tag each lead with the source for monthly ROI reporting.
  - Follow-up question: What are the main marketing channels you currently run?

### Automation Triggers

- **CONSTRUCTION-049. What events should automatically trigger an action (new qualified lead alerts the estimator, deposit paid schedules start)?**
  - Why it matters: Automation removes manual handoffs so qualified leads and paid deposits move forward without delay.
  - Expected answer type: `multi_select_or_text`
  - Used for: follow_up, staff_assignment, payment, ai_prompt
  - Required: yes
  - Example answer: Qualified lead -> SMS the on-call estimator; deposit paid -> notify scheduler; quote sent -> start follow-up sequence.
  - Follow-up question: Which trigger is most important to get right first?
- **CONSTRUCTION-050. When should the AI automatically book a site visit versus hand off to a human for review first?**
  - Why it matters: Defines guardrails so straightforward jobs auto-book while complex or borderline leads get human judgment.
  - Expected answer type: `long_text`
  - Used for: booking, escalation, ai_prompt, lead_qualification
  - Required: yes
  - Example answer: Auto-book in-area residential remodels above minimum budget; hand off commercial, out-of-area, or structural jobs.
  - Follow-up question: What threshold or red flag should always force a human review before booking?
