# Wangari — The Long Vision (V1 → V2 → V3)

> Written October 2026. This is a permanent reference, not a sprint plan. It is here so that whoever works on Wangari next — in three weeks or three years — understands what the product is *becoming* and why the order of the versions matters.

**Companion documents:** [vision.md](vision.md) (the belief — start here) · [valuation-audit.md](valuation-audit.md) (honest current state and worth) · [founder-guide.md](founder-guide.md) (money, pitch, and doing the room) · [partnership-prospects.md](partnership-prospects.md) · [architecture.md](architecture.md) · [ops-runbook.md](ops-runbook.md)

---

## The shape of the vision in one line

> **V1: the farmer's own record book, in their pocket.**
> **V2: a farm that runs itself — AI and automation acting on the record.**
> **V3: a farm platform that connects to every sensor, bank, market and system the farmer already touches — so Wangari becomes the single front door to the whole agricultural ecosystem.**

The farmer's problem is not a lack of tools. It is that the tools are scattered across ten apps, five SMS messages, an agrovet's advice, a M-Pesa statement, and their own memory. V1 fixes the memory. V2 makes the memory act. V3 makes the memory the hub everything else plugs into.

---

## V1 — Records (where we are)

**Status: shipped and running in production.** V1 is the foundation and it is done enough.

- Offline-first farm records (production, flocks/crops, feed, workers, sales, costs, profitability)
- Species-aware across 11 species (layers, broilers, kienyeji, cattle_dairy/beef, goats, sheep, pigs, rabbits, fish, bees) and crops
- Payments (M-Pesa / Paystack), plans and plan-gating, promo/partnership codes, admin panel
- Swahili, WhatsApp integration, weather, action centre, news digests

**What V1 still owes before it can be called finished:**
- Shareable farm dashboard card (status object — see [vision.md §5](vision.md))
- *Mkulima Wangari* first-week certificate / badge
- Swahili-first naming across the whole farmer-facing app
- Signup → first-record-logged funnel tracking (the number that actually matters)

---

## V2 — AI and automation (the farm runs itself)

> **The promise:** the farmer stops *recording* and starts being *told what to do*. The record book becomes a manager.

**The transition:** V1 collects data. V2 reasons over it. This is where the business model gets its unfair advantage — because the data a farmer has in V1 is exactly what AI needs to be useful, and no competitor can retroactively collect two years of it.

### V2 pillars

| Pillar | What it actually does | Why it matters |
|---|---|---|
| **AI agronomist** (already embryonic) | Answers questions over the farm's *own* history: "is my feed cost per tray going up?", "why did mortality spike in week 3?" | Grounded in real records beats generic advice by 10x. This is the moat. |
| **Predictive production** | Forecast eggs/milk/harvest from flock size, breed, season, feed, weather | Turns records into planning. |
| **Automated action centre** (already exists) | Detects production drops, feed anomalies, price problems and *proposes* the fix | From record-keeping to management. |
| **Automated messaging** | Scheduled WhatsApp/SMS nudges: vaccination due, feed running low, market day, weekly farm report | Retention without a human. Cuts churn. |
| **Finance intelligence** | Auto-categorises spend, forecasts cashflow, flags a bad week before it happens | "To the shilling" taken to its conclusion. |
| **Feed + input optimisation** | Feed mix, ration cost per unit, comparing suppliers | Direct money savings → the easiest thing to prove value with. |
| **Marketing and sales assist** | Generate sale records, buyer offers, price benchmarking by region | Revenue side, not just cost side. |

### V2 principles
- **Grounded, not generic.** Every AI answer cites the farmer's own records. Never invent numbers. This is the same "say what is missing" rule from the belief.
- **AI as manager, not chatbot.** It should propose actions, not answer trivia. The best AI feature is one that stops a loss.
- **Swahili first.** Voice notes should work, for farmers who read little.
- **Automation must be visible and reversible.** A farmer must see what the app did on their behalf and undo it. Trust is fragile.
- **Cost-aware.** AI is an expense per user; it must earn its keep. Cheap models where sufficient, expensive only where the value is proven.

---

## V3 — IoT and connections (Wangari as the hub)

> **The promise:** the farmer opens one app and it talks to everything around the farm — sensors, M-Pesa, inputs, market prices, the co-op, the bank, even the government livestock registry.

This is the version that makes Wangari genuinely hard to displace: once the farmer's sensors, payments, and market data all flow through us, leaving is expensive. It is also the version that is most likely to be mis-scoped or done badly, so the sequencing discipline in §"How not to screw up V3" below matters more than the feature list.

### V3 has two halves

**A) IoT — physical sensing**

| Sensor | Farm signal | Value to farmer |
|---|---|---|
| Temperature / humidity (brooder, shed) | Chick mortality risk | Massive — brooder temperature kills whole batches. The single highest-value sensor in poultry. |
| Water tank level | Livestock water availability, irrigation | Prevents livestock deaths and crop loss. |
| Feed hopper weight | Feed consumption per flock | The number that turns feed cost into a real per-unit cost. |
| Egg counting / weigh station | Actual lay rate, weight grading | Automated, accurate production; premium/grade pricing. |
| Milk volume meter | Actual yield per cow | Per-cow performance, the core of dairy profit. |
| Light / photoperiod | Flock management, laying consistency | Cheap, useful, low power. |
| GPS collar / movement | Grazing, theft, herd location | Ties to ANITRAC and rustling concerns. |
| Soil moisture (crops) | Irrigation timing | Saves water and pump fuel. |

*Research note:* low-cost LoRaWAN-based poultry/livestock sensing is now well proven and cheap (academic + commercial deployments across Kenya and globally). Battery + solar, low data rate, long range — which fits rural Kenya. LoRaWAN is the realistic transport for a first Wangari device fleet; cellular IoT SIMs (Safaricom/Orange) as a backhaul option.

**B) Connections — integrating what the farmer already uses**

This is the *software* half of V3 and is, honestly, the more valuable half at Kenyan smallholder scale. Realistically connectable today:

- **M-Pesa (Daraja API / Safaricom):** payments, STK push, transaction verification, even C2B/ Till reconciliation. This is a *must-have* integration and it is well documented with a sandbox.
- **WhatsApp Business Platform:** the primary communication channel; already used, will scale to official API + templates (note: Meta now bills per *delivered* template message, not per conversation — cost the unit economics carefully).
- **Weather:** Kenya Meteorological Department and/or free sources (Open-Meteo etc.) for farm-local forecasts feeding V2 predictions.
- **Input suppliers / agrovets:** feed and drug price lists, delivery tracking, reorder nudges.
- **Market prices:** livestock, egg, milk, and crop price boards to feed price benchmarking and sale assist.
- **Cooperative / SACCO systems:** member and group records, statement export, group savings — via file/API where the co-op has any system at all.
- **Government livestock registry (ANITRAC):** Kenya is rolling out mandatory Animal Identification and Traceability (ANITRAC) digital ear tags (launched mid-2026, expanding nationwide). This is a **strategic, must-earn integration**: if Wangari can import/store an animal's ANITRAC identity, we become the farmer's record for the national traceability scheme — enormous switching-cost and legitimacy value.
- **Banks / SACCO loans / inputs on credit:** financial records, repayment, and eventually credit scoring from real farm data (with consent).
- **Certification / export traceability** (for those who grow into it): meeting the traceability requirements that make export and premium markets possible.

### V3 principles
- **Hub, not replacement.** The farmer keeps using M-Pesa, WhatsApp, their co-op app, their agrovet. We *connect*, we don't demand migration. A V3 integration that makes the farmer quit their sacco's app to use us is a badly designed integration.
- **Data flows both ways where it counts, one way where it must.** Importing ANITRAC IDs and receipts is mandatory. Exporting farmer data to third parties is forbidden (belief rule 8).
- **Graceful degradation always.** A sensor gateway goes down, an API rate-limits us, a co-op's system is down — the app must keep logging. The offline-first promise extends to integrations. V1's offline rule is sacred at every version.
- **Open, documented integration surface.** Build a clean, stable internal API so sensors and partner systems have an obvious, supported way in. This is also how V3 partners plug in without asking us to build everything.
- **Local-first, not dependent on a single vendor.** Any single provider (Safaricom, Meta, Safaricom again) can change pricing or policy. Abstract them behind internal adapters.

---

## How not to screw up V3 (hard-won lessons, keep them)

1. **Sensors are not a business until someone pays for them.** A farmer will not fund a KES 3,000 sensor to save KES 1,000/month. Prove value in an obvious, monthly-visible way (mortality saved, feed cost cut) before asking anyone to buy hardware. Prefer **sponsor/partner-funded** device fleets (an agrovet or co-op buys them for their members) — same trick as sponsor promo codes.
2. **Do not start with hardware. Start with software connections.** Integrations (M-Pesa, weather, ANITRAC records, market data) are near-zero marginal cost and deliver value this year. Hardware is expensive, support-heavy, and a distraction until there are thousands of paying farms.
3. **Free is the growth engine; the *record* is the asset.** Give the first 30 farmers free personal setup, get the data discipline established, then let the record's value (and the AI in V2) justify a paid plan.
4. **Institution integration is where the real money eventually is.** Individual farmers are KES 1,500/month. A cooperative of 500 farmers, a county, or an agrovet chain is a different business entirely — and ANITRAC traceability is a government-mandated hook that could make Wangari infrastructure for a national scheme.
5. **Don't outrun your own promise.** A brand dies on a broken promise faster than on no marketing. Ship V2/V3 features only as solidly as V1's offline record, or not at all.

---

## Sequencing (the order, and why)

**Now → next 12 months:** finish V1's status objects and Swahili-first naming. Land the partners (sponsor codes). Prove activation (signup → first record). Get paying users. This is the foundation; nothing above it works without it.

**Then, V2:** AI grounded in real accumulated records, automation that acts (messaging, action centre), finance and production forecasting. This is where retention and pricing power live, and it is *earned by V1's data*, not bolted on.

**Then, V3:** connections first (M-Pesa/WhatsApp/weather/market/ANITRAC), sensors last and partner-funded. Connect the ecosystem so Wangari is the hub the farmer's whole farm life runs through.

---

## One-line summary to remember

> V1 remembers the farm. V2 runs the farm. V3 connects the farm to everything — and once it does, the farmer's entire working life runs through Wangari, which is how a tool becomes infrastructure, and how infrastructure outlasts its founders.
