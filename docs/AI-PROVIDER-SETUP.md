# AI Provider Setup

How Wangari AI talks to a model, and when you must stop using free quota.

## Current default: UnoRouter (DEV AND DEMO ONLY)

`server/src/routes/ai.ts` defaults to `AI_PROVIDER=unorouter`. One key, one
OpenAI-compatible endpoint, no card.

Set the key in the app environment:

```
AI_PROVIDER=unorouter
AI_API_KEY=sk-...
AI_BASE_URL=https://api.unorouter.com/v1
AI_MODEL=space-bunny-alpha:free
AI_MAX_STEPS=4
```

### Operational notes (verified against the live API)

**The free tier allows ONE request a minute, account-wide.** Not 20 RPM — one.
A farm task needs several calls (one per tool, then one for the sentence), so
`ai.ts` retries a 429 on a bounded schedule (`RATE_LIMIT_BACKOFF_MS`, past 60s
but under nginx's 120s `proxy_read_timeout`). A two-step exchange therefore
takes roughly 75 seconds. Correct, but not demo pace: **top up the account
before the expo.**

**The model is pinned, never discovered.** There is no roster. It used to be
discovered live, but discovery needs a provider that publishes per-model
pricing, and UnoRouter does not — it would have returned an empty roster,
which is a 404 by another route. Pinning also means a retired model cannot
silently become the default.

**Only one model id resolves on this endpoint.** `space-bunny-alpha`,
`space-bunny-alpha:paid` and `stealth/space-bunny-alpha` all answer 404
`model_not_found`; only `space-bunny-alpha:free` is served.

**A model advertising tool support is not guaranteed to chain tools.** What
matters is a correct two-step agentic run — call a tool, feed the result back,
get the *second* tool. Run `server/src/lib/agentic-probe.ts` against any
provider before pointing `AI_MODEL` at something new.

The same model id **fails that probe on OpenRouter and passes it on UnoRouter**,
at ~1.7s a call. The provider was the problem, not the model.

**Malformed tool arguments are expected, not exceptional.** Small free models
routinely return invalid JSON (`{"total_kes":4500,"customer_id3":"3"}` — a
corrupted key name). `ai.ts` already wraps every `JSON.parse` of
`tc.function.arguments` in try/catch, so a bad argument becomes a reported
step error and the run continues. Do not remove those guards.

**Some `:free` models are unreachable on a free account.** Expect HTTP 402
*"Insufficient credits"* and 404 *"guardrail restrictions"* on some ids; those
are account-level, not key-level, so they are not fixable by rotating the key.

### The probe, not a roster

`server/src/lib/agentic-probe.ts` answers one question: can this model finish
a farm job? It sends a two-part request — record a sale, *then* read the
farm — and requires a second tool call after the first result comes back. A
model that stops after step 1 looks identical to a working one until you ask
what happens next, and that failure leaves the screen quiet halfway through
recording a sale.

Measured live against real endpoints:

| Model / provider | Context | Step 1 | Step 2 | Verdict |
|---|---|---|---|---|
| `stealth/space-bunny-alpha` on OpenRouter | 1M | ok | **none** | rejected |
| `space-bunny-alpha:free` on UnoRouter | 1M | ok | ok, 1.7s | **used** |

An explicit `AI_MODEL` always wins; there is nothing to warm.
| `thinkingmachines/inkling:free` | 1M | HTTP 403 (harness-only) | — | rejected |
| `nvidia/nemotron-3-super-120b-a12b:free` | 256k | HTTP 404 (guardrail) | — | rejected |
| `google/gemma-4-31b-it:free` | 262k | HTTP 429 (rate limited) | — | rejected |
| `qwen/qwen3.8-27b:free` | 262k | ok | ok | **in use** |

Space Bunny is the obvious pick on paper — 1M context, the flashiest name —
and it still cannot finish a job. For a farmer that means the screen goes
quiet halfway through recording a sale, which is the most confusing failure
this product has. Hence the probe insists on the second call.

**`upstage/solar-mini4` is NOT free.** It exists and is good, but it costs
$0.05 per 1M input tokens. Only models priced at exactly zero on BOTH input
and output are eligible; a model free to prompt but paid to complete would
quietly bill the account.

Discovery is bounded (default 4 probes) because the free tier is 50 requests
a DAY **account-wide** — a sweep must never eat a farmer's demo quota. An
explicit `AI_MODEL` always wins over discovery.

## Why free quota cannot carry paying farmers

Measured against the free-tier limits published by each provider:

| Provider | Free RPM | Free RPD | Sustained req/min |
|---|---|---|---|
| UnoRouter free | 1 | — | 0.017 |
| Gemini Flash free | 10 | 1,500 | 1.0 |
| Groq free | 30 | 1,000 | ~0.7 |

UnoRouter's one request a minute is **account-wide** — every farmer shares it.
That is not enough for even a demo conversation, let alone production: a single
two-step question takes over a minute.

Check your provider's terms before serving paying subscribers on free quota.
That is a terms question, not only a capacity one.

## What production actually costs

At KES 129.6/USD, a grounded advisory turn (~1,500 in / 300 out tokens):

| Model | Per turn | 300 turns/farmer/month | Share of KES 1,500 sub |
|---|---|---|---|
| Gemini 3.8 Flash | KES 0.29 | KES 87 | 5.8% |
| Gemini 2.5 Flash | KES 0.16 | KES 47 | 3.1% |
| Gemini 2.5 Flash-Lite | KES 0.03 | KES 10 | 0.7% |

300 farmers x 3 questions/day on Gemini Flash = **KES 7,873/month (~USD 61)**.

The free tier saves about USD 61/month. That is not a trade worth making against
farmer records and reliability.

## Switching to production

Before the first real farmer pays:

1. Create a Google Cloud project with billing enabled (confirm your Kenyan card
   is accepted in AI Studio first — this is the prerequisite, not an assumption).
2. Set on the VPS environment:
   ```
   AI_PROVIDER=gemini
   AI_API_KEY=<paid key>
   AI_MODEL=gemini-3.8-flash
   ```
3. Add a per-user request cap in the app layer so one farmer cannot consume the
   shared quota.

Gemini's **free** tier states "Content used to improve our products: Yes". The
paid tier says No. That alone is why real farm records must not touch free quota.

## Agent safety model

- `MAX_AGENT_STEPS` (default 8) bounds the agentic loop per request.
- Destructive tools push an undo entry; `undo_last_action` restores the last one.
- The loop stops on the first failed step rather than compounding the mistake.
- `farmId` always comes from the verified token, never the request body.
- Guarded by `server/src/lib/ai-agent.test.ts` (mutation-proven).

## Internet research (`search_web`)

Wangari can look things up she cannot see in the farm records: current maize
and layer-mash prices, county regulations, disease outbreaks, feed
formulation. That is the difference between "feed is 60-70% of costs" (which
she knows) and "layer mash is KES 3,900 a bag at Greenfield Millers, checked
today" (which she cannot know without asking).

**No API key is required, by design.** The default path is two free public
endpoints, queried in parallel:

| Source | Endpoint | Measured from the server | Good for |
|---|---|---|---|
| Open web | `html.duckduckgo.com/html/` | 863 ms, 10 hits | current prices, suppliers, news |
| Wikipedia | `en.wikipedia.org/w/api.php` | 657 ms, JSON | breed, laying age, feed ratios, disease facts |

The split matters and is in the system prompt: Wikipedia is right for facts
that do not move and wrong for this morning's price. When sources disagree
the model is told to say so and give both, never to average them.

Exa remains supported as an **optional** upgrade. Set `EXA_API_KEY` and it is
preferred; leave it unset and nothing is lost. It is never required, and
`/api/ai/status` reports `webSearchTier` as `exa` or `open-web` so the
product never claims a tier nobody paid for.

### The two refusals

`server/src/lib/web-search.ts` distinguishes two failures that look identical
if you only inspect the result array:

- **Reached the web, found nothing** → "I looked, and found nothing on that."
- **Never reached the internet** → "I could not reach the internet just then."

Collapsing those is how a dropped connection becomes "the web has no answer on
that" — false, and false in a way a farmer would act on. A caught test pins
this; see `web-search.test.ts`.

### Cost on the free tier

Every provider call costs a minute, so every search costs a farmer a minute.
Measured on the layer-mash question: three searches took **198,128 ms**. With
`SEARCHES_PER_TURN` (default 2) the same question took **133,280 ms**. Raise it
with `AI_SEARCHES_PER_TURN` only if you have topped up the provider balance —
at one request a minute, the default is already the difference between one
minute and three.

Guarded by `server/src/lib/web-search.test.ts` (7 mutants, all caught).
