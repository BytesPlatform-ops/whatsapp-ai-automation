# WhatsApp Flows — Website Builder (setup & runbook)

One dynamic, endpoint-driven Flow that collects website-intake info as a
native multi-screen form, for **CTWA (ad) users** (v1 scope). Multi-niche
(salon / hvac / realestate / portfolio / general) and multi-language
(EN / PT). On submit, Pixie builds the site and sends the preview in chat;
logo/photos/changes/payment continue in chat as today.

Spec: `pixie_whatsapp_flows.docx`.

## What's in the code

| Piece | File |
|---|---|
| Endpoint encryption (RSA-OAEP + AES-GCM, flipped-IV response) | `src/flows/crypto.js` |
| Question bank (EN+PT) + `classifyTheme()` | `src/flows/questionBank.js` |
| Language detection (first message → LLM, phone-number fallback) | `src/flows/lang.js` |
| Session persistence (keyed by `flow_token`) | `src/flows/store.js` + `migrations/024_flow_sessions.sql` |
| Screen state machine (ping/INIT/data_exchange) | `src/flows/endpoint.js` |
| `POST /flow` route (decrypt → handle → encrypt) | `src/flows/routes.js` (mounted in `src/index.js`) |
| Flow definition (3 screens) | `src/flows/flow.json` |
| Send Flow to CTWA users | `src/flows/send.js` |
| Map submitted answers → build | `src/flows/intake.js` |
| `nfm_reply` parsing | `src/webhook/parser.js` |
| `sendFlowMessage` | `src/messages/whatsappSender.js` |
| Provisioning CLI | `scripts/flows/provision-flow.js` |
| Offline test harness | `scripts/flows/test-flow-local.js` |

**Everything is inert until `PIXIE_FLOW_ID` is set** — no production
behavior changes before go-live.

## Tested locally (offline, no Meta)

`node scripts/flows/test-flow-local.js` → 23/23 pass: crypto round-trip,
ping/INIT, theme classification, full salon journey
(COMMON→THEME→FINISH→SUCCESS) with session persistence, HVAC field
hiding, Portuguese labels. Intake mapping verified for salon + hvac.

## Go-live runbook

Needs a token with **`whatsapp_business_management` + `whatsapp_business_messaging`**.
⚠️ Adding a scope to a System User does NOT update an existing token —
**regenerate** the token after adding scopes. The scripts read, in order:
`META_FLOW_TOKEN` → `META_TOKEN` → `META_CAPI_ACCESS_TOKEN` → `WHATSAPP_ACCESS_TOKEN`.

1. **DB migration** — run `src/db/migrations/024_flow_sessions.sql` in Supabase.
2. **Deploy** so `https://<server>/flow` is publicly reachable (HTTPS).
3. **Keys:**
   ```bash
   node -r dotenv/config scripts/flows/provision-flow.js genkeys
   # paste the printed WHATSAPP_FLOW_PRIVATE_KEY into server env, then:
   node -r dotenv/config scripts/flows/provision-flow.js upload-key
   ```
   (`FLOW_PHONE_NUMBER_IDS="id1,id2"` to upload to both numbers; defaults
   to `WHATSAPP_PHONE_NUMBER_ID`.)
4. **Create + upload + publish:**
   ```bash
   FLOW_ENDPOINT_URI=https://pixiebot.co/flow \
     node -r dotenv/config scripts/flows/provision-flow.js create   # prints PIXIE_FLOW_ID
   # add PIXIE_FLOW_ID=... to env, then:
   node -r dotenv/config scripts/flows/provision-flow.js upload
   node -r dotenv/config scripts/flows/provision-flow.js publish
   node -r dotenv/config scripts/flows/provision-flow.js status
   ```
5. **Set `PIXIE_FLOW_ID`** in the server env → the router starts sending
   the Flow to fresh CTWA users automatically.
6. **Test** in WhatsApp Manager → Flows → Preview, then with a real
   Click-to-WhatsApp ad click.

## Env vars

| Var | Purpose |
|---|---|
| `PIXIE_FLOW_ID` | Published Flow id. **Master switch** — unset = inert. |
| `WHATSAPP_FLOW_PRIVATE_KEY` | RSA private key (PEM; `\n`-escaped single line OK). Endpoint decrypts with it. |
| `WHATSAPP_FLOW_PRIVATE_KEY_PASSPHRASE` | Only if the key has a passphrase. |
| `FLOW_ENDPOINT_URI` | Endpoint URL registered on the Flow (default `https://pixiebot.co/flow`). |
| `FLOW_PHONE_NUMBER_IDS` | Comma-sep phone-number ids for key upload. |
| `FLOW_PHONE_LANG` | Fallback lang map, e.g. `id1:en,id2:pt`. Used only when first-message detection is low-signal. |
| `META_FLOW_TOKEN` | WABA-management token for provisioning scripts. |

## Language

Primary = detect from the user's first message (`src/flows/lang.js`,
LLM). Fallback = phone-number map (`FLOW_PHONE_LANG`) only when the first
message is too short to detect. Resolved language is persisted against the
`flow_token` so every screen + the build use the same language.

## v1 limitations (handled in chat after preview)

- Images (logo, listings/project photos) — collected in chat post-preview.
- Real-estate listings / portfolio projects beyond the first text answer —
  stored raw (`listingsRaw` / `projectsRaw`), refined in chat.
- Theme answers map to `websiteData` via Pixie's existing extractors; the
  generator fills sensible defaults for anything sparse.
