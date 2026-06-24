# AI Receptionist Question Bank — Usage Guide

How to use `backend/receptionist/question_bank/ai-receptionist-industry-question-bank.json`
(1000 questions, 20 industries × 50) in the onboarding flow, backend, and AI prompt generation.

> Companion docs: the human-readable bank is `docs/ai-receptionist-industry-question-bank.md`.
> The build/validation script is `backend/receptionist/question_bank/build_bank.py`.

---

## 1. Frontend onboarding form

- The business picks its **industry** first. Load only that industry's 50 questions
  (`questions.filter(q => q.industry === selected)`), so the owner never sees all 1000.
- Render each question by **`expected_answer_type`** → the matching input widget:
  `short_text`→input, `long_text`→textarea, `number`→number, `yes_no`→toggle,
  `single_select`/`multi_select`→dropdown/checkboxes, `date_time`/`time_range`→pickers,
  `price`→currency input, `phone`/`email`/`url`→validated inputs, `file_upload`→uploader,
  `multi_select_or_text`→tag input with free text.
- Group by **`category`** into onboarding steps/sections (Business Identity → Services →
  Pricing → Booking → … → Automation) for a clean multi-step wizard.
- Show **`why_it_matters`** as helper text and **`example_answer`** as the placeholder.

## 2. Backend storage

- Store answers keyed by question `id`, scoped to the tenant:
  `tenant_answers { tenant_id, question_id, value, answered_at }` (or a JSONB
  `answers` map on the business profile). Question text/metadata stays in the bank;
  only the **value** is stored per tenant — so updating a question's wording later
  doesn't migrate data.
- Keep the bank itself as static, versioned data (this JSON), not in the DB.

## 3. Answers → AI receptionist system prompt

- Each answer's **`used_for`** says which capability consumes it. To build the
  receptionist's `BUSINESS INFO` block (see `prompts/RECEPTIONIST_RUNTIME_PROMPT.md`),
  collect answers where `used_for` includes `ai_prompt` and render them as
  `Label: value` lines that fill the prompt's `{{VARS}}`.
- `booking` answers → booking rules / slot logic; `pricing` → quoting; `faq` → FAQ
  knowledge; `lead_qualification` → the questions the AI asks customers;
  `escalation`/`compliance` → hard rules and human-handoff triggers;
  `voice_call`/`whatsapp`/`email`/`sms` → channel-specific tone + length;
  `follow_up`/`campaign` → automated follow-up workflows; `payment` → deposit rules;
  `staff_assignment` → routing; `analytics`/`reporting` → dashboards.

## 4. Industry presets pre-fill common answers

- Ship a preset per industry that **pre-fills** typical answers (e.g. salon services,
  standard cancellation policy, common FAQs). The owner only edits/confirms, turning a
  50-question form into a few minutes of review.
- Presets map `question_id → default_value`; merge preset over empty answers.

## 5. Don't ask all 1000 (or even all 50)

- **Industry filter** is the first cut (1000 → 50).
- **`required: true`** questions form the minimum onboarding (ask these first; the AI
  can operate once they're answered). `required: false` are progressive enhancement —
  ask later, in-app, or infer from presets.
- **Conditional / follow-up questions**: only show **`follow_up_question`** when the
  parent answer warrants it (e.g. "Do any services need a consultation?" → if yes, ask
  which). Implement as simple show-if rules keyed off the parent answer.
- Lazy-ask: collect more answers over time as real conversations reveal gaps.

## 6. How the AI uses answers across surfaces

- **Calls (voice):** booking + FAQ + qualification answers drive the spoken flow;
  `voice_call` answers set greeting/closing/tone.
- **WhatsApp / SMS / email:** `whatsapp`/`sms`/`email` answers set channel tone +
  templates; booking/quote answers fill confirmations.
- **Campaigns:** `campaign`/`follow_up` answers define reminders, re-activation, review
  requests — always gated by the compliance/opt-out rules.
- **Booking:** `booking` + `staff_assignment` + `payment` answers run availability,
  staff routing, and deposit handling.
- **Escalation:** `escalation`/`compliance` answers (especially for medical, dental,
  law, insurance, tax) force human handoff and forbid advice.

## 7. Required vs optional

- `required: true` → blocks "receptionist ready"; surface in the core onboarding step.
- `required: false` → optional/advanced; can be skipped or preset-filled.

## 8. Updating the bank later

- Edit the per-industry part files in `question_bank/parts/`, then re-run
  `python3 backend/receptionist/question_bank/build_bank.py` — it re-validates
  (1000/20/50, unique ids, enum-only values) and regenerates the combined JSON + Markdown.
- To add an industry: add a `parts/<PREFIX>.json` (50 questions) and append the
  `(PREFIX, name)` pair to `INDUSTRIES` in the build script.
- Never reuse an `id` for a different question (answers are keyed by id). Retire instead.

## 9. Validation guarantees (enforced by build_bank.py)

- Exactly **1000** questions, **20** industries, **50** each.
- Every object has all 10 fields; **ids unique**; `category`, `expected_answer_type`,
  and `used_for` use only the allowed enum values (synonyms normalized at build time).
