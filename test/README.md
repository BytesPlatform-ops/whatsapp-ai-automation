# Pixie regression test suite (Phase 2)

Saved tester convos, run as fixtures, replayed against the live router. Each
fixture is a real bug that was once shipped — keeping them here means the
same class of bug never ships twice.

## Run

```bash
node test/replay.js                       # run every fixture
node test/replay.js test/fixtures/02_*    # specific
node test/replay.js --list                # see what's there
```

You'll need a working `.env` (Supabase + OpenAI creds). The runner uses the
real DB and real LLM, so each fixture sweep costs ~$0.05–0.20 in OpenAI
tokens and creates short-lived `test_…` user rows that get deleted on exit.

## Outbound calls

Mocked. The runner hijacks `src/messages/sender.js` exports BEFORE loading the
router so nothing reaches WhatsApp / Messenger / Instagram. Mocks live in
[lib/mockSender.js](lib/mockSender.js); each captured send is collected into a
buffer that the runner reads per-turn for `reply_contains` / `reply_not_contains`
assertions.

## DB writes

NOT mocked. Test users are created via the real `findOrCreateUser` path so the
test exercises the same code as production. Cleanup runs in a `finally`,
deleting the user row plus every related row in `conversations`,
`classifier_decisions`, `llm_usage`, etc. If you ever see leftover `test_*`
rows in Supabase after a crash, run a one-off cleanup query manually.

## Fixture format

```json
{
  "name": "what-this-fixture-tests",
  "description": "1-2 sentences explaining the regression this guards against.",
  "channel": "whatsapp",
  "turns": [
    {
      "user": "What user types",
      "type": "text",
      "extra": { "buttonId": "svc_webdev" },
      "expect": {
        "state": "WEB_COLLECT_NAME",
        "state_one_of": ["WEB_COLLECT_NAME", "SALES_CHAT"],
        "state_not": "WEB_COLLECT_INDUSTRY",
        "state_not_one_of": ["WEB_COLLECT_INDUSTRY", "WEB_COLLECT_AREAS"],
        "metadata.websiteData.businessName": "Noman Plumbing",
        "metadata.websiteDemoTriggered": true,
        "metadata.emailSkipped": "*exists*",
        "metadata.undoPendingState": "*missing*",
        "reply_contains": ["spin up", "preview"],
        "reply_not_contains": ["Let's build it", "Nothing to go back to"],
        "sent_count_gte": 1,
        "sent_count_lte": 3
      }
    }
  ]
}
```

| Matcher | Meaning |
|---|---|
| `state` | Strict equals on `user.state` after the turn |
| `state_one_of` | Set membership |
| `state_not` / `state_not_one_of` | Negations |
| `metadata.<dot.path>` | Strict equals on a metadata path. Use `"*exists*"` / `"*missing*"` for presence checks |
| `reply_contains` (string OR array) | Case-insensitive substring; ALL items in the array must be found |
| `reply_not_contains` | Case-insensitive substring negation |
| `sent_count_gte` / `sent_count_lte` | Send-count bounds (defensive — reasonable assertion that bot replied) |

`turn.user` is the user's message text. `turn.type` defaults to `"text"`. For
non-text turns (location pin, button tap, image upload), put the relevant
fields under `turn.extra` — the runner spreads it into the synthesized
message object so the router sees the same shape it would from a real
webhook.

State and metadata assertions are STRICT (deterministic). Reply assertions are
SOFT (substring) because the LLM is non-deterministic — testing against fixed
phrasing would flake constantly. Pin enough state + reply substrings to catch
the regression you care about, no more.

## Adding a fixture

1. Save the tester transcript that hit the bug.
2. Strip it down to the smallest sequence of turns that reproduces.
3. Identify what should be true after each turn (state, metadata field,
   what the bot must / must-not say).
4. Drop it into `test/fixtures/NN_<short_name>.json`.
5. Run: `node test/replay.js test/fixtures/NN_*` — confirm it passes on
   `main` after the fix is in.
6. Commit. Future you / Umair / a refactor that breaks this convo gets a
   loud failure on the next replay.

## What's NOT covered yet

- Stripe payment / Netlify deploy / Namecheap domain paths — those need
  separate stubs because they reach external services in handlers themselves
  (not just outbound messaging).
- LLM-response caching — every sweep currently makes real OpenAI calls.
  Acceptable while we have ~10 fixtures; if it grows, add a cache layer.
- CI integration — runner exits with code 0/1 so it'll work as a CI step,
  but no GitHub Action wired yet. Add when push velocity warrants it.
