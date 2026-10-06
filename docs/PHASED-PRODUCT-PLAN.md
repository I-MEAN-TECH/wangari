# Wangari — Phased Product Plan

**Date:** 2026-10-06
**Status:** Living document — build state as of 2026-10-06 evening below.
**Companion docs:** [DEPLOY-HARDENING.md](DEPLOY-HARDENING.md), [ADMIN-BLUEPRINT.md](ADMIN-BLUEPRINT.md)

## Build state (2026-10-06, end of day)

| Phase | State | Evidence |
|---|---|---|
| **M1 accountant layer** | ✅ shipped | taxonomy/attribution/feed libs, migration + backfill, `/api/profitability`; live probe (conservation) passes |
| **M2 compliance spine** | 🟡 groundwork shipped; animal parts correctly still gated | premises registration no. + plot GPS on `Farm`, national ID on owner (masked everywhere, full only in the owner's KIAMIS export), `GET /api/kiamis` with an honest `missing` list, settings UI with tap-to-capture GPS. **Still gated on §7 activation:** `AnimalMovement`, product traceability, owner-register/county export — 0 `Animal` rows makes them empty |
| **M3 three steps ahead** | 🟡 two of three shipped | sale-timing (market-price × production join) and feed-conversion drift are in the Action Center, both probed live. Flock replacement timing **not built — there is no bird-age data to build it on**. "Your week" is the existing Action Center; renaming it is not a feature |
| **M4 pride layer** | 🟡 two of four shipped | cost-vs-price band on `/profitability` (+ the three bugs it flushed out); shareable monthly statement at `/statement`. **Farm-health percentile deferred on purpose:** a percentile across 9 farms is a number we would have made up (never inflate). Scenario comparison: period toggles exist; deeper scenarios wait on real history |
| **M5 AgriWebb borrowings** | ⬜ not started | 0 `Animal` rows — same gate as M2's animal parts |
| **§8 activation** | Phases 0, 2, 6 ✅ · Phase 1 ❌ | phone+PIN door, delivery-first money moment, funnel instrumentation shipped. **WhatsApp advisory blocked on Meta/WABA setup (founder action)** — the only unbuilt capability in the product |
| **Swahili switch** | 🔴 founder decision | dictionary + onboarding copy shipped and bundle-verified; `PINNED_LANGUAGE` stays English until you flip it |

The binding constraint remains reach: none of this has touched a real farmer's handset yet, and the funnel cannot report until it does.

---

## Part 0 — How this was produced

Two independent inputs, both verified rather than recalled.

**Platform analysis.** Logged into `design.agritecture.com` (Rails + Next.js app on Google
Firestore) and recovered its full route map from its own JS bundles, then read the farm-model
builder's complete input set from the live DOM. Stack details came from the browser's own
network log: Firestore `agritecture-firestore`, `v6.exchangerate-api.com` for live FX, and
Google Maps Places for site selection.

**Policy research.** Primary sources — `kilimo.go.ke`, `afa.go.ke`, `ncpb.co.ke`,
`navcdp.go.ke`, `au.int` — via the **agent-reach** skill (Exa search). Not vendor pages.

Where a claim below rests on inference rather than a source, it says so.

---

## Part 0.5 — Reconciliation with the plans that already exist (read before Part 3)

**Correction.** This document was drafted before [module-plan.md](module-plan.md),
[gap-analysis.md](gap-analysis.md), [roadmap.md](roadmap.md) and [vision.md](vision.md) were
re-read. It is a **fifth** planning doc, and it overlaps three of them. Nothing below overrides
them. Precedence, stated explicitly:

| Existing rule | Where | Binding on this doc? |
|---|---|---|
| **EXTEND, NEVER REBUILD** — no new module, no new nav item | [module-plan.md §0](module-plan.md) | **Yes.** Every item in Part 3 must attach to an existing table/screen. Where this doc proposes a new Prisma model (`Budget`), that is the one exception and it must be justified as a *child* of an existing screen, not a new module. |
| **THE FARMER CANNOT READ** — no typing, icon-first, ≤3 taps, Swahili-first, ≥56px, `<BigKeypad>`/`<IconPicker>`/`<VoicePrompt>` | [module-plan.md §0.1–0.2](module-plan.md) | **Yes, unconditionally.** Part 3 as first written ignores this. Any economics screen here is a *statement you read to a farmer*, not a form he fills. |
| **EVERY FEATURE MUST SOLVE, NOT DECORATE** — state the test before shipping | module-plan.md §0 | **Yes.** Each Part 3 phase now needs a written success test. |
| **Adoption, not features, is the #1 gap** | [gap-analysis.md](gap-analysis.md) headline | **Yes — and this reorders Part 3.** |
| **ANITRAC/credit are deliberately sequenced *later*** (they are downstream of a habit; audit showed 7 production days all time, 0 Animal rows) | [module-plan.md §7 resequencing + §10](module-plan.md) | **Yes.** Part 3's Phase 2 (compliance spine) must **not** be built second. |

### What this means for the phasing below

Part 3's phases are a **money-truth track**, not the top of the backlog. They are renumbered
**M1–M5** accordingly, and they run *after* the activation work that
[module-plan.md §7](module-plan.md) already defines (open the front door; meet the farmer in the
WhatsApp advisory he already gets; pay him back the same evening with the delivery statement).

- **M1 (accountant layer) is not "Phase 1".** It is the prerequisite that makes the delivery
  statement *arithmetically honest* — you cannot say "you are owed KES Y" while `Transaction.category`
  conflates `animal_feed` with `milk`. That is why it is first *of this track*, not first overall.
- **M2 (compliance spine) inherits module-plan §1 MODULE A wholesale.** Do not re-specify ANITRAC
  here; §1 MODULE A is the spec. This doc only adds the *policy* findings (KIAMIS, e-voucher
  acreage, EUDR geo-mapping) that §1 did not have.
- **The Agritecture borrowings (Part 1) are inputs to M1 and M4**, not features in their own right.

---

## Part 1 — What Agritecture Designer is

A **controlled-environment agriculture (CEA) financial modelling tool**. Not a farm management
system. There is no daily record-keeping, no livestock, no inventory, no farm workers. Its
entire purpose is: *model a greenhouse or vertical farm before you build it, and see whether it
pays back.*

Published scale, from their own landing page: **1,100+ farm models**, average payback
**4.58 years**, average CapEx **$2,114,000**, split 37% small (<$500k) / 31% medium / 32% large.
**477 vertical farms, 317 greenhouses, 12 container farms.** 200+ clients, 40+ countries.
Explicitly **free** for the core tool.

### The full feature surface (recovered from their bundles)

```
/signin  /signup
/dashboard
/dashboard/projects                  — all models
/dashboard/projects/new-project      — the model builder
/dashboard/projects/compare          — compare models side by side
/dashboard/site-selection            — location-specific energy modelling
/dashboard/equipment-partners        — supplier directory
/dashboard/financing-partners        — lender directory
/dashboard/equipment-and-financing
/dashboard/service-providers
/dashboard/consulting-services
/dashboard/brand-development
/dashboard/facility-tours
/dashboard/industry-news  /dashboard/inspirations
/dashboard/faq  /dashboard/help  /dashboard/how-to  /dashboard/quoting-guide
/dashboard/submit-ticket
/dashboard/notifications  /dashboard/account  /dashboard/settings
/dashboard/trial  /dashboard/welcome
```

### The model builder's inputs (read live)

| Group | Fields |
|---|---|
| General | project name, **location** (Google Places), operation type (vertical / greenhouse / container), rooftop flag, automation level (low/med/high) |
| Currency & units | **34 currencies, each shown with its live USD rate**; length ft/m; weight lb/kg |
| Site | tenure (**owned / buy / rent**), **site area** |
| Crops | crop × grow system × **percentage of bedspace, with a running "0% used (100% left)"**, organic flag |
| Structure | insulation (light / medium / heavy duty), heating, supplemental lighting, CO₂ injection |
| Labour | owner-as-head-grower, **grower experience (low/mid/high)**, wage rate |
| Financing | **debt / equity / self-funded** |
| Overrides | water cost, electricity cost, tax rate — *defaults computed, overridable* |
| → | **SEE RESULTS** |

Outputs are **15-year financial projections and operating summaries**, with **CapEx and OpEx
breakouts**, a payback period, and side-by-side comparison. Their crop library is 75+ crops with
a "crop pricing algorithm".

### Their business model

Free core tool, then monetise the *edges*: an equipment-partner directory, financing partners,
paid expert access ("Talk to Niko"), a paid urban-farming course, and enterprise/education
packages. They are a **lead-generation and advisory business attached to a free calculator.**

---

## Part 2 — What we can take from them

Nine things, in rough order of value to us.

**1. Site area as the root driver of every cost.** Every figure in their model scales from area.
Our `Farm` has `name`, `location`, `county`, `farmType` — and **no size at all**. We cannot
compute cost per acre, stocking density, or input entitlement, because we do not know how big
anything is. This is one nullable column and it unlocks a whole class of advice.

**2. Allocation percentages that must sum to 100%.** Their crop panel tracks bedspace as
fractions with a live running total. This is *enterprise mix* — the exact concept our
profitability layer is missing — and they solve it with a constraint rather than a hierarchy.

**3. Computed defaults with explicit overrides.** Their "Overrides" panel computes water,
electricity and tax from location and structure, and lets you replace any of them. This is the
right shape for us: farmers should get a defensible number immediately and only be asked to
correct what they disagree with. It is the opposite of a form that demands 40 fields.

**4. Money that knows about currency.** Every currency carries a live FX rate, and the model
converts. Kenyan farmers buy feed, fertiliser, veterinary drugs and equipment priced in USD and
sell in KES. Value in our ledger is currently currency-blind. Given KES volatility, an input
bought at one rate and sold at another is a real P&L event we cannot represent.

**5. Financing as a first-class input, not an afterthought.** Debt / equity / self-funded, with
the debt case driving the projection. This is what turns a record-keeping app into a
*decision* tool, and it is precisely what a farmer needs before taking a loan — a market where
we already have `Credit`, `Invoice` and `Quote` models.

**6. Payback period as the headline number.** They lead with 4.58 years. For a Kenyan
smallholder the equivalent headline is **cost per egg**, **cost per litre**, or **break-even
yield**. One number, not a dashboard.

**7. Compare models side by side.** "Build & compare unlimited models" is their core promise. The
smallholder translation is comparing *scenarios* (these 200 layers vs those 300), or this season
against last. We have `flocks/compare` and `market-prices/compare` already; the pattern is
proven in our codebase.

**8. Grower experience as a yield input.** They model experience as affecting outcomes. We hold
enough history to do the inverse and better: *derive* the farm's own realised yield and feed
conversion from `DailyProduction`, then use the farm's own numbers as the baseline. Their
approach needs a survey; ours needs only the data we already collect.

**9. A partner directory, not just a calculator.** Equipment suppliers, financiers, experts. In
Kenya the equivalent is county extension officers, agrovets, vets, NCPB depots and cooperatives.
We already have `Coop`, `Customer` and `market-prices` — the directory is a small join away, and
it is monetisable the same way they monetise it.

**What we should NOT take:** their model is pre-build, one-shot, and static. Ours must be
compounding and living. A model built once and never updated is not memory, and memory is the
moat.

---

## Part 3 — The money-truth track (M1–M5; runs after module-plan §7 activation)

> Renumbered from "Phase 1–5". See Part 0.5. These are **not** the top of the backlog.

### Original phasing detail What the government is actually doing

### Kenya

**ASTGS 2019–2029** (Agriculture Sector Transformation and Growth Strategy) — nine flagships.
The three that touch us:

- **Flagship 1** — target 1 million farmers in ~40 zones, served by 1,000 farmer-facing SMEs.
- **Flagship 2** — register and screen farmers for subsidy eligibility. Registration is **free,
  by mobile-phone survey, capturing: name, ID number, SIZE OF FARM, commodities farmed, annual
  income.** Extension agents verify every registered farm over the first three years.
- **Flagship 8** — research, innovation and data. First-wave digital use cases: **digital subsidy
  registration and delivery, farmer and SME performance, automated Strategic Food Reserve buy/sell
  needs.**

**The e-voucher shift.** Government is reallocating **KES 5 billion** from procuring fertiliser
and maize seed into a digital e-voucher sent to farmers' phones. Critically, the voucher is
usable for *"a range of inputs, including seed for high value crops, **animal feed and health
products**."* That lands squarely inside our domain.

**KIAMIS** — Kenya Integrated Agriculture Management Information System. The national farmer
register and the gate to the fertiliser subsidy; **e-voucher eligibility requires the farmer to
be in KIAMIS**. Rolled out across all 47 counties by agricultural officers. Each farmer is issued
a voucher stating a maximum quantity, **derived from the acreage declared at registration**.
Coffee farmers additionally need **physical verification and geo-mapping of farm GPS coordinates**
for EU traceability.

**MoA-INFO** (Government of Kenya + IFAD + CABI + PxD) — free SMS advisory, **550,000+ farmers**,
English and Swahili, all 47 counties, with three decision-support tools (fall armyworm, seed
selection, fertiliser). Free, works on any phone, opt in by texting `FARM`/`SHAMBA` to 40130.

**ANITRAC Regulations (Cap 364, 2020)** — Animal Identification and Traceability. This is the
most important document in this section for us:

- Part II — establishment of an Animal Identification and Traceability System and **a central
  database**; identification devices and their application.
- Part III — **registration of animals and premises**. *Animal owners to keep registers*; the
  County Director keeps a register of animals; **establishments, farm holdings and premises to be
  registered**.
- Part IV — **traceability and tracking**: animal traceability, **animal product traceability**,
  animals presented to slaughterhouses must bear identification devices, animal tracking devices.

**National Livestock Vaccination Campaign** — protecting cattle, goats, sheep and pigs against
**FMD** and **PPR**, under the National Strategy for the Control and Eradication of PPR
(2017–2027) and the Risk-Based Strategic Plan for FMD (2019).

**EUDR (coffee)** — the Agriculture and Food Authority is geo-mapping across all **33
coffee-growing counties**; the EU requires a **due diligence statement** that products are
deforestation-free since December 2020 and legally compliant in their country of origin.

### Continental

**AU Digital Agriculture Strategy (DAS) 2024–2030**, under **CAADP**, alongside the AfCFTA.

### The pattern

Across all of it, the state needs four things: **a registered farm with a known size and
location**, **a registered animal with a known identity**, **a record of what happened to that
animal**, and **a way to verify it**. Every one of those is a data-model question.

---

## Part 4 — Where we already stand, and the gap

### The finding that matters: we are already most of the way to ANITRAC

`Animal.tagNumber` is annotated in our schema as **"ANITRAC: 15 digits, starts with 141"**, and
[tag-range.ts](../server/src/lib/tag-range.ts) implements the allocation properly:

- `ANITRAC_PREFIX = "141"`, `ANITRAC_MAX_DIGITS = 15`, `MAX_TAG_RANGE = 2000`
- **A 500-head herd costs three columns and zero extra rows** — first tag, last tag, count; the
  individual tags materialise only when a traceability list is actually requested. This is a
  genuinely good design and it is already built.
- `BigInt` arithmetic so 15-digit tags don't lose precision.
- A head-count mismatch is **reported, never used to suppress the tag**.
- Client and server helpers are kept in step, with the client validating before the server trusts.

We also have `HealthRecord` (animal-scoped, with the deliberate decision *not* to normalise a
farmer's own vocabulary — "foot rot", "footrot" and "foot-rot" must all be findable) and
`Vaccination` (with an optional `animalId`). ANITRAC and the FMD/PPR campaign need exactly this.

**So this is not a greenfield feature. It is 60% built and unwired.**

### The actual gaps

| Government need | What we have | What is missing |
|---|---|---|
| ANITRAC §18 premises registration | `Farm` | a holding/premises registration number |
| ANITRAC §20 animal movement | `status: "moved"` | **a movement ledger** — from, to, date, reason, permit |
| ANITRAC §21 product traceability | `Sale.items` (JSON) | animal → product → sale chain |
| ANITRAC §16 owner registers | animal data | a printable/exportable register per keeper |
| ANITRAC §6 county reporting | — | an export to the County Director's register |
| FMD/PPR campaign | `Vaccination` + `Animal` | campaign context, certificate, batch reporting |
| KIAMIS | `User` (has email/phone) | **size of farm, ID number, geo-coordinates**; no export to the register |
| Fertiliser e-voucher | `Inventory` | entitlement by acreage; no voucher representation |
| MoA-INFO reach | web + AI | **no SMS/feature-phone channel**; language coverage unverified |
| EUDR coffee | `Crop` (19 routes) | **plot GPS**; deforestation-free declaration |
| Cash-flow planning | `Transaction` | see Part 5, M1 |

Two of these are near-free. **Farm size is one nullable column** and it is a prerequisite for
KIAMIS, the e-voucher, and every per-acre metric we might ever compute. **Plot/animal
geo-coordinates** are likewise a schema addition with no algorithmic risk.

### The honest strategic read

The state is building a **registration and verification apparatus**. That is compliance
infrastructure, and compliance is a wedge: it is the one thing a farmer *cannot* opt out of if
they want subsidised inputs. It is also the one place where our existing data (animals, tags,
vaccinations, health) is genuinely ahead of what a WhatsApp chatbot or a spreadsheet can offer.

But do not mistake it for the moat. Compliance earns us the farmer's *data entry*; memory earns
us the farmer's *trust*. The order matters: **M1** makes the numbers true, **M2** makes us
useful to the state, **M3–M4** make us hard to leave. And all of it sits behind the
[module-plan.md §7](module-plan.md) activation loop, without which none of it is ever seen.

---

## Part 5 — The phased plan

### M1 — Make the promise true (the accountant layer)

**Goal:** "no accountant needed" becomes a true statement about live data.
**Success test (rule 3):** a farmer can see cost-per-egg and profit-per-enterprise in KES, computed
from his own rows, with no editing and no typing — and the number survives an accountant's check.

This is the **first of this track, not the first thing to build.** It exists because M2 and the
delivery statement are arithmetically dishonest without it (you cannot say "you are owed KES Y"
while `animal_feed` and `milk` share one column). It is the strongest lock-in because a farm's
financial history is the most expensive thing to recreate.

The blocker is the data model, not the features. Today `Transaction.category` is free text and
the live table already contains both **`animal_feed` and `Bird Purchase`** — two conventions in
17 rows. Worse, the column conflates **costs** (`animal_feed`, `veterinary`, `labor`) with
**revenue streams** (`meat`, `milk`, `eggs`, `crops`, `livestock`).

Work:

1. **Split `Transaction.category`** into a cost taxonomy for expenses and an enterprise
   reference for income. The income values are *already* enterprise names, so the seed mapping
   can be derived from existing data. `Transaction.type` is already clean (`expense` 11,
   `income` 6) and becomes the spine.
2. **Add enterprise attribution** — `flockId?` / `cropId?`. This single change makes cost of
   production per enterprise computable. **This is the highest-leverage change in the document.**
3. **Feed → flock consumption.** `Inventory.unitCost` exists and `InventoryLog` exists, but
   nothing links feed issued to a flock to its output. Without it there is no feed conversion
   ratio and no cost per egg.
4. **`Budget`** — the only genuinely new table in this phase.
   `{ farmId, period, enterpriseKind?, enterpriseId?, category, amount }`.
5. **Rewrite `profitability.ts` last.** It is 130 lines computing output as
   `eggsCollected * 0.06 + milkCollected` — a hardcoded kilograms-per-egg constant — because
   nothing connects physical output to money. It should become a thin read over the corrected
   schema. Touching it first means rewriting that heuristic twice.
6. **Farm size** — add area and units. One column; prerequisite for M2 and every per-unit
   metric.

**Cash flow needs no new model.** Once `Transaction` has `date`, `category` and enterprise
attribution, cash-flow planning is a projection over rows we already store. Budget is the only
new table.

**Why now:** the live table holds **17 rows** of test data. This migration is nearly free today
and becomes a mapping exercise the moment farmers have a season of real history in it.

### M2 — The compliance spine

> **Spec ownership:** the ANITRAC feature spec is [module-plan.md §1 MODULE A](module-plan.md), not
> this document. Do not re-derive it here. This doc only adds the **policy** findings §1 did not
> carry (KIAMIS registration shape, e-voucher **acreage**, EUDR **geo-mapping**).
> **Sequencing:** [module-plan.md §7](module-plan.md) deliberately moved ANITRAC **later** — it is
> downstream of a habit, and today there are **0 `Animal` rows**. M2 runs after the activation loop,
> not after M1 alone.

**Goal:** Wangari becomes the tool a farmer uses to satisfy the state, and a county uses to
verify.
**Success test (rule 3):** a farmer can produce the document a county officer or buyer asks for
(owner register / traceability list), from records he already had, without retyping anything.

1. **Premises registration number** on `Farm`; **plot GPS** on `Farm`/`Crop`.
   Serves ANITRAC §18, KIAMIS geo-mapping, and EUDR coffee simultaneously.
2. **`AnimalMovement`** — from premise, to premise, date, reason, permit reference.
   ANITRAC §20. The `status: "moved"` flag already anticipates it.
3. **Product traceability** — animal → product → sale. ANITRAC §21.
4. **Owner register export** — the printable per-keeper register from §16, and the county-facing
   export from §6.
5. **Vaccination campaign mode** — batch FMD/PPR records against a campaign, with a per-animal
   and per-premise certificate.
6. **National ID and farm size on the farmer profile**, exported in KIAMIS shape.

**Why this order:** it is built on M1's `Farm` size field, it reuses the ANITRAC tag
machinery that already exists, and it targets an obligation the farmer already has. It is the
easiest "yes" we will ever get.

### M3 — Three steps ahead

**Goal:** answer, on one screen, what needs doing, what will bite you, and what can wait.
**Success test (rule 3):** the screen produces at least one action a farmer would not have taken
on his own, and he can act on it in ≤3 taps.

We already have the seed: `action-engine.ts` exposes `GET /actions`. Turn it into **Your week**,
driven by the farm's own history rather than a generic checklist.

Then the join nobody has made: **`market-price` (`/board`, `/compare`, `/mine`) and `production`
are both live and never joined.** Sale timing — "egg prices peak in three weeks; you have 400
layers coming into peak lay" — is a join, not a build.

Then the smallholder equivalent of AgriWebb's Foragecaster: **feed conversion, egg-production
trend, flock replacement timing, sale timing** — all computable from `DailyProduction` + M1's
feed link.

### M4 — The pride layer

**Goal:** the farmer feels authoritative rather than advised.
**Success test (rule 3):** a farmer screenshots the statement or the cost-of-production screen and
sends it unprompted — to a buyer, a co-op, or WhatsApp Status.

- Farm health score; "you are better than N% of Wangari farms" (needs M1's taxonomy).
- **Cost of production vs market price**, side by side — the single most powerful screen we
  could ship.
- Shareable monthly statement (`export.ts` is the seed).
- Scenario comparison, borrowed from Agritecture's "compare unlimited models".

The Farmer.Chat RCT lists **"agency / decision-making capabilities"** as a primary outcome —
researchers treat this as causal, not cosmetic. It is also the retention mechanism.

### M5 — Borrow from AgriWebb

**Success test (rule 3):** a livestock keeper changes a decision (feed, rotation, culling) because
of a trend the app showed him that he could not see before.

Known-good, proven, and direct extensions of modules we have: **individual-animal weight trends**
(not just current weight), **auto-calculated grazing days**, **rotation planning** for `Coop`/
pasture. `flocks/compare` and `animals` are already the right shape.

---

## Part 6 — Sequencing, and what we are not doing

### Why this order

**Step 0 is not in this document.** It is [module-plan.md §7](module-plan.md): open the front
door (phone+PIN, WhatsApp OTP), meet the farmer in the advisory he already receives, and pay him
back the same evening with the delivery statement. [gap-analysis.md](gap-analysis.md) ranks
distribution (GAP 1) and activation (GAP 2) above every feature here, and the 2 Oct audit
(7 production days all-time, 3 of 8 farms recording) is the ground truth that a feature-first
order is wrong.

Within the money-truth track, **M1** is first because it is the *stated* product promise and
currently a false one. **M2** is second only *within this track* — and it is gated behind the §7
activation loop, because 0 `Animal` rows means the ANITRAC export has nothing to export. **M3–M4**
are the moat and need M1's numbers to be true before they can say anything trustworthy.

### We are not doing

- **More AI features.** Advice is the commoditised layer and is being benchmarked against us by
  IFPRI (600-village cluster-RCT, Nakuru County, to March 2027) with a larger budget. A free
  WhatsApp chatbot wins on price the moment that trial reports positively.
- **More CRUD modules.** 63 models and ~60 route files is the problem, not the solution. The
  bottleneck is the **join**, not the feature count.
- **A pre-build planning tool.** Agritecture's model is one-shot and static. Ours must compound.
  Copy their *inputs and constraints*, not their lifecycle.

### Open questions before M1 starts

1. Does every existing `Transaction` row map cleanly onto cost-or-revenue? I saw three rows
   confirming the correlation and inferred the rest. A full cross-tab decides whether the
   migration is a pure mapping or needs human judgement.
2. Which cost categories do Kenyan smallholders actually use? `animal_feed` and `Bird Purchase`
   in 17 rows says the vocabulary needs designing, not guessing.
3. Is the MoA-INFO channel gap real — do our target farmers have smartphones? If not, an SMS
   path is a reach question, not a feature question.

### The thesis, restated

Advice is being commoditised and measured. **Memory is not**, and it cannot be stolen — it has to
be earned one farmer's season at a time. Price against the accountant (KES 15,000–40,000/month),
not against apps, and charge for the outcome being replaced rather than for seats or modules.
