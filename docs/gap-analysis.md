# Wangari — Industry Gap Analysis (Africa & Kenya)

> **Date:** 2 October 2026 · **Revised:** 3 October 2026 (headline corrected after the production usage audit)
> **Method:** research on current Kenya/Africa agriculture priorities (policy, insurance, finance, dairy) mapped against a **direct audit of Wangari's own codebase and database schema** — not against what the marketing pages claim — plus a **direct measurement of real usage** in the production database.
>
> **Purpose:** answer one question honestly — *what is the industry actively trying to solve that Wangari has not solved?* Each item is marked **✅ SOLVED**, **🟡 PARTIAL**, or **🔴 MISSING**, and every gap carries a "simplest possible fix."
>
> **Companions:** [roadmap.md](roadmap.md) · [vision.md](vision.md) · [founder-guide.md](founder-guide.md) · [aiae-2026-field-plan.md](aiae-2026-field-plan.md)

---

## The headline (read this first)

**Wangari is a well-built product that nobody is using.** That is the gap. Not a missing feature.

This conclusion did not exist in the first version of this document. The first version ranked the biggest gap as *"credit proof for smallholders"* and the second-biggest as *"individual animal identity."* Both of those are **now built and live** (`/api/farm-record`, `Animal` model, ANITRAC tag ranges). Building them was correct work. It was also the wrong order, because measurement showed the problem was never that the credit report was missing — it is that **5 of our 8 farms have never recorded anything at all.**

### What the production database actually says (audited 2 Oct 2026)

| Metric | Value | What it means |
|---|---|---|
| Users / farms | 9 / 8 | every account is **11–29 days old** — no long-tail yet |
| **Distinct production days, all farms, all time** | **7** | **no farm has a daily habit** |
| Farms that recorded *anything* | **3 of 8** | **5 farms are empty** |
| Farms with a gradeable record (≥30-day span) | **0 of 8** | the bankable report correctly says "not ready" for all of them |
| `Animal` rows / tagged flocks | **0 / 0** | the ANITRAC moat is built and unused |
| Deliveries · sales · transactions | 2 · 4 · 16 | all near-empty |

Read that last column honestly: the credit report has **nothing to report**, and the ANITRAC export has **nothing to export**. Both features will keep saying "not enough data" until a farmer records — and no farmer is recording.

### So the ranked gaps are now

1. 🔴 **REACH — can a farmer get in at all?** *(biggest gap, and it is a distribution problem, not an engineering one)*
2. 🔴 **ACTIVATION — does the first session pay them back the same day?** *(biggest product gap)*
3. 🔴 **PROOF & TRACEABILITY — records a third party will believe** *(built; earning its keep only after 1 and 2)*
4. 🔴 **COOPERATIVE / GROUP OPERATIONS** *(real, and the right bet — but it needs members who already record)*

**The strategic truth:** the industry frontier is genuinely *"make the farmer's records portable, verifiable and bankable"* and we have now built that layer. It is downstream of a habit that does not exist. **A bank will not lend against a record the farmer never wrote, and a traceability export with zero tags proves nothing.** The next unit of value is not a feature — it is a farmer recording one litre of milk and seeing money.

---

## Section A — What the industry is actively trying to solve (research)

### A1. The credit wall (Kenya, acute, 2026)
- ~**80% of smallholder farmers can't access formal bank loans** because they lack **land titles / collateral** (multiple 2026 sources).
- The industry's answer: **lend against the farmer's *records* instead of collateral** — "social collateral." IFC/AFC, Agricultural Finance Corporation (AFC), and new agri-fintech lenders are all moving to "collateral-free / digital-record-based lending."
- IFPRI's 2026 work on **TARA (Tool for Agricultural Risk Assessment)** is exactly this: expanding credit + insurance access to farmers who lack collateral.
- **Kenya context:** AFC adopted wholesale/smallholder lending using social collateral (2026); AFCI's 2026 Fintech commentary; "AI-powered financing opens credit access."
- **Our read, applied to our own numbers:** this opportunity is real but it is a **month-6 asset, not a month-1 asset**. A loan officer wants multiple seasons of history. Every farm we have would be turned away today — correctly, by our own report.

### A2. Index-based livestock insurance (East Africa, scaling fast)
- **IBLI (Index Based Livestock Insurance)** — payout triggered automatically by satellite pasture/NDVI data, sent straight to mobile money. The **World Bank DRIVE** project / ZEP-RE (COMESA) rolled this out across Kenya/Ethiopia/Somalia. In the 2026 short rains, **US$2.1M was auto-paid to 27,000+ Kenyan pastoralists within ~3 weeks.**
- **The problem the research emphasises:** *uptake is low (~10%)* — because farmers don't understand the product, and because **insurance bundled with animal health / nutrition / breed is what farmers actually want** (2026 study: farmers would pay 100–232% more for IBLI bundled with animal health or nutrition).
- **The link to you:** insurers and the state need **ground-truth, farm-level data on animals, mortality and productivity** to price risk, verify claims (reduce *basis risk*), and target products. A farm app that holds verified animal/mortality/production records is exactly the missing data source.

### A3. Dairy co-operative payment failure (Kenya, crisis-level, ongoing)
- **N-KCC and dairy co-ops are widely delinquent on milk payments** (Sept–Oct 2026: farmers demanding KES 300M+ / US$2.32M in pending payments; PS Jonathan Mueke warning co-ops that poor/delayed returns will *cause* a milk shortage).
- **Root problem:** a farmer **cannot verify their own milk deliveries or what they were paid** — so disputes are unresolvable and trust is gone.
- **The link to you:** if a farmer logs every delivery and the income from it in Wangari, they have an independent record. That is the *trust instrument* the co-op payment crisis is missing.
- **Why this is now the *day-one* item and not a later tab:** it is the one thing a new farmer can get value from **today**, with the thing already in their hands. It is the shortest path from zero to "this is worth using."

### A4. National livestock traceability — ANITRAC (Kenya, mandatory, rolling out now)
- The **Ministry of Agriculture launched the Animal Identification and Traceability System (ANITRAC) in July 2026**, expanding nationwide. Every cow, sheep and goat is to carry a **digital ear tag** giving each animal a traceable identity and lifetime digital history, to curb rustling and meet export-market traceability requirements.
- **The link to you:** traceability is only as good as the **farm-level record of each animal**. Wangari tracks flocks in aggregate *and* now tracks individual tagged animals (`Animal` model, `Flock.tagFrom/tagTo` ranges, 15-digit tags prefixed `141`). Ranges are stored as three numbers and expanded lazily, so a 500-head farm costs the farmer no extra daily work.
- **Correction to this document's earlier claim:** it previously said Wangari "cannot yet say *this specific cow produced this much milk*." That was true of the *original* build and is **no longer accurate** — the identity layer exists. The honest remaining gap is **adoption** (`0` tagged flocks in production), not capability.

### A5. Climate & food security / climate-smart agriculture
- **Kenya Climate Smart Agriculture Strategy (KCSAS 2017–2026)** and the **National Agri-Food Systems Investment Plan (NASIP 2026)** centre on climate resilience, irrigation/mechanisation, food security, and climate-smart practices; climate finance for small producers is a live gap (low creditworthiness, no collateral/records).

### A6. Export & market access / standards
- Kenya's agri trade sits at food-security vs. export-trade tension (2026 policy analysis). Traceability and standards compliance are the gate to higher-value/export markets.

### A7. Group/cooperative digitalisation at scale
- The biggest farmer organisations in Kenya (dairy co-ops like Fresha 27,000 farmers, Limuru 11,850, Mount Kenya/Meru 30,000+; agribusiness/MSME programmes) are where the farmer reach is. They need members' records aggregated, and members served at once.
- **Sequencing note:** this is the right long-term channel, but a chairperson cannot run a dashboard over members who record nothing. Co-op mode is a **Phase 4** item, deliberately after the farmer records individually.

### A8. Why farmers don't adopt agri-apps at all (the gap that outranks all of the above)
- **ICTworks (Jun 2025)** documents 12 documented reasons farmers abandon agri-apps, among them: *reluctant or unable to install new apps* (device storage), *poor eyesight / cannot read*, *reluctant to read long text*, *reluctant to send SMS*, and shared handsets.
- **IFPRI (Jul 2026)**: across two Kenyan potato counties ~70% of farming households own a smartphone but **fewer than 5% use any farming app.** We are not competing for the 5%; we are competing for the other 95%.
- Wangari's **sign-up as it stood** asked for a typed name, typed email, typed password, farm name, and an email OTP. Per ICTworks that stacks *five* documented abandonment triggers before the farmer sees a single thing they came for.
- **The channel that is designed around every one of those blockers is WhatsApp** — which Wangari did not have. `/whatsapp` was a "Coming Soon" page while the daily Swahili seasonal advisory (long/short rains, 7-day outlook for the farm's location, Kenyan agri press, aflatoxin/armyworm/drought risk) was **emailed** to a farmer who may not own an inbox.
- **Conclusion: the front door is the bottleneck.** Open it, and the industry problems in A1–A4 become reachable. Leave it shut, and they stay theoretical.

---

## Section B — Wangari's coverage, audited

| # | Industry need | Status | Evidence from the codebase / DB |
|---|---|---|---|
| 0 | **A farmer can actually get in and get value on day one** | ✅ **SOLVED** *(code; unlaunched)* | **Phone + PIN sign-in shipped** (`/phone`, `auth-phone.ts`): number, 4-digit PIN, farm created automatically. Email optional, no OTP. Co-op invite code accepted at signup. Rate-limited per phone with lockout, because 4 digits is 10,000 combinations. **Not yet deployed or tested with a real farmer.** |
| 1 | **The farmer's own reliable record** | ✅ **SOLVED** | Offline write queue with on-device persistence + background sync, 11 species + crops, whole-farm, KES. 48 models, 54.7k LOC, live in production. *The capability is done; farmers are not using it.* |
| 2 | **Production + mortality + feed + labour costing** | ✅ **SOLVED** | DailyProduction (eggs/milk/weight/feed/mortality), flocks, feed, workers, profitability engine (species-aware). |
| 3 | **Payments reaching the farmer (M-Pesa)** | ✅ **SOLVED** | Paystack init/verify/webhook + M-Pesa; plans, promo/partnership codes. |
| 4 | **Weather / climate awareness** | ✅ **SOLVED** *(code)* | `weather-rules.ts` (29 tests) turns the forecast into decisions: hold irrigation, get harvest off the ground, stock feed before a dry spell, heat stress, cold nights, drying windows. Wired into the action engine off the existing `WeatherCache` — no extra API call, no new data entry. Silent when there is no cached forecast. |
| 5 | **Vet/animal health records** | ✅ **SOLVED** *(code)* | `HealthRecord` model — the animal is the record, not the flock. `animalId` optional because most Kenyan keepers manage untagged groups and would never use it if forced. Includes **outbreak detection**: the same condition on 2+ animals in 30 days, grouped case-insensitively so "foot rot"/"footrot" count together. A recorded death updates the animal's status. |
| 6 | **Farm financial records (revenue, cost, profit)** | ✅ **SOLVED** | Sales, Transactions, Profitability, Invoices, Quotes, Deliveries. |
| 7 | **Farmer owing/credit given BY the farm to customers** | ✅ **SOLVED** | `Credit` model (customer credit the *farm* extends) + action-engine overdue-credit alerts. *Note: this is the farm's credit to buyers — different from the farmer getting a loan.* |
| 8 | **Farmer getting a LOAN using their records (credit proof)** | ✅ **SOLVED** *(capability)* · 🟡 **USELESS YET** *(data)* | `/api/farm-record` assembles the four evidence categories a loan officer assesses with a 5-star explainable grade. Farmer-initiated, never auto-shared. **But 0 of 8 farms hold a gradeable record (≥30-day span), so all 8 currently grade "not ready."** The feature is correct; the input data does not exist yet. |
| 9 | **Records provable to a third party (printable/shareable record)** | ✅ **SOLVED** *(capability)* | Farmer's card (share + print) and a denser **LenderBrief** with scope/limits stated up front and a farmer attestation block. No forged signature, no self-hash — a hash we generate proves nothing to a bank. |
| 10 | **Individual animal identity (ANITRAC ear-tag ready)** | ✅ **SOLVED** *(capability)* · 🔴 **UNUSED** *(adoption)* | `Animal` model + `Flock.tagFrom/tagTo` ranges, 15-digit `141` prefix, lazily expanded. **0 tagged flocks in production.** The moat exists and nobody is standing on it. |
| 11 | **Cooperative / group serving (multi-farmer, member records)** | ✅ **SOLVED** *(code)* | `CoopGroup` / `CoopMembership`. **Privacy is enforced in the data shape, not the UI**: the aggregate endpoint reads `COUNT` and `SUM` only, and no member-scoped table is reachable from a group. `coop-aggregate.ts` additionally suppresses totals below 3 recording members, because at that size a total reveals its members by subtraction. Chairs get a per-member active/silent flag and nothing else. |
| 12 | **Milk delivery record for co-op disputes** | ✅ **SOLVED** *(code)* | Capability was already ~80% there. **Both remaining gaps now closed:** the statement is promoted to the **day-one dashboard**, gated by `statementPrompt` — shown only when real money is owed, never "KES 0" at a working farmer. The gate is the exact inverse of the first-run rules: the form offers itself when there is nothing, the statement speaks only when there is something. |
| 13 | **Index-insurance linkage** | ✅ **SOLVED** *(code)* | `InsurancePolicy` register. **Deliberately not a product**: no risk pricing, no payout estimate — that is insurance business, and a farmer disputing a claim should be arguing with their insurer, not our arithmetic. Value is the ANITRAC linkage: each policy reports whether it can be evidenced against tagged animals, and says so plainly when it cannot. |
| 14 | **Market / commodity price board (selling above floor price)** | ✅ **SOLVED** *(code)* | `MarketPrice` + `market-price.ts` (24 tests). Live check as the farmer types: "KES 10 per litre below Nakuru — on 400 litres that is 4,000 left on the table." Region-scoped and dated, because a national average teaches a farmer to ignore the number. Every reference shows its source and age; stale ones are labelled a guide. |
| 15 | **Value-add / post-harvest / cold chain** | ✅ **SOLVED** *(code)* | `ColdChainEvent` — an append-only log, because one stored temperature is not evidence and the buyer wants the curve. `cold-chain.ts` (23 tests) derives hours above threshold, time-to-cool from harvest, and clean / excursion / broken. Readings are never edited or deleted: a deletable temperature proves nothing. |
| 16 | **Digital ID for the farmer (phone + email)** | ✅ **SOLVED** *(for a typed-email farmer)* | Full auth, verified email, MFA, Google. **Note the qualifier: this is a solution to identity for someone who already uses typed accounts — it does not solve identity for the 95% who do not.** |
| 17 | **Bulk/group onboarding** | ✅ **SOLVED** *(code)* | A chair types phone numbers from a meeting and reads out 6-character codes built from an alphabet with no `0/O/1/I/L` — codes that survive being spoken in a room and typed on a cheap handset. The farmer enters the code at signup and the farm joins the co-op automatically. Per-number errors are reported individually, so one typo does not discard the other nine. |
| 18 | **Working where the farmer works (weak-signal rural connectivity)** | ✅ **SOLVED** *(shipped Oct 2026)* | Write queue (`offline-queue.ts` + `/sw.js` + server-side `SyncedWrite` idempotency) **plus** offline reads: `read-cache.ts` keeps the last good GET per user per screen, serves it when the network is down, and always labels its age. Escalation fresh → stale (2d) → abandoned (7d). |
| 19 | **Language fit** | 🟡 **PARTIAL** *(deliberate)* | A full Swahili dictionary ships in the client, but the app is **pinned to English** while the i18n layer is stabilised. **This is now a decision, not an oversight**: the owner chose to keep English for now rather than ship half-translated screens. Switch `PINNED_LANGUAGE` to `"sw"` to reverse it. Do not promise a Swahili product to a funder until then. |

---

## Section C — The gaps, ranked, with the *simplest possible* fix

Ranked by **severity × how many farmers it unblocks**, not by how impressive the feature sounds.

### 🔴 GAP 1 — Reach: the farmer cannot get in without an email and a password — **BUILT (Oct 2026)**
**Why:** ~70% of Kenyan farming households own a smartphone and **under 5% use any farming app** (IFPRI, Jul 2026). ICTworks lists the reasons in order: storage, poor eyesight, long text, SMS refusal, shared handsets. Our old sign-up stacked a typed name, typed email, typed password, farm name and an **email OTP** — five documented blockers, back to back, before the farmer sees anything.
**What shipped:** phone number + 4-digit PIN at `/phone`. Email optional. Farm created in the same request, so abandoning the form never leaves a half-made farm. A co-op invite code entered at signup attaches the farm to the group immediately.
**Two decisions worth defending:**
- **We deliberately did not send an SMS OTP.** An OTP needs a paid SMS gateway we have not configured, and adding a dependency to fix a problem that is not the biggest one is backwards. The PIN is the credential and the phone is the identity. `phoneVerifiedAt` is left NULL, so the data honestly records that we have not proven the number — it does not claim a verification we skipped.
- **4 digits is 10,000 combinations**, which is not safe on its own. So limiting is per *phone*, not per IP: IP limiting alone locks out a whole village behind one NAT address while doing nothing against someone sweeping one account. Per-phone lockout after 5 attempts.
**Not yet done:** nothing here has been deployed or tested with a real farmer. Code-complete is not solved.
**Second half of the fix (same phase, easy):** the advisory we already write daily in Swahili must go out where farmers are — WhatsApp template + **voice note**, with a reply path that logs production without opening the app. Voice is the literacy/eyesight bridge.
**Solves test:** a farmer goes from a WhatsApp message to a saved record in under 2 minutes, on a cheap phone, having never typed an email.
**Blocker:** the WhatsApp half waits on Meta Business / WABA / approved-template setup by the founder. The signup half does not.

### 🔴 GAP 2 — Activation: nothing pays the farmer back on day one — **DO SECOND**
**Why:** 5 of 8 farms have never recorded anything. The first screen after login is a KPI grid of zeros. A farmer who opens an app and sees zeros has learned one thing: *this app does not work for me.*
**Simplest fix:** the first screen for a farmer with no records offers exactly two big choices — **milk/eggs → deliveries**, **crops → crops** — and the delivery form is already open waiting for them. All-zero KPIs stay hidden until there is something real to show.
**Why deliveries first, not credit:** the delivery statement is the only thing that returns *money* the same evening. A new farmer has no history for a credit report, so the credit page would correctly say "not ready" — technically honest, emotionally fatal.
**Already done:** the first-run card, the auto-opened delivery form, `firstRecordAt` derived from real rows rather than inferred, and the onboarding gate that actually persists (an earlier version silently never saved, and a later version created an infinite redirect loop — both are fixed and pinned by tests).

### 🔴 GAP 3 — Proveability and traceability — **BUILT; WAITING ON DATA**
`/api/farm-record` + the ANITRAC tag layer are live and correct. **No work is owed here right now.** They will start producing value on their own once Gaps 1 and 2 land, because they read the rows those phases create. Any new work on this layer before then is building on an empty table.
**One caveat to hold us honest:** we can measure when a farmer records. We cannot yet measure whether a record got them a loan. Treat the credit report as an *enabling* asset, not a validated outcome.

### 🔴 GAP 4 — Cooperative / group mode — **BUILT (Oct 2026)**
**Why:** co-ops and SACCOs are where the scale is, and a co-op could not buy or use Wangari — it was strictly one-farmer-one-farm.
**What shipped:** `CoopGroup` + `CoopMembership`. A chair creates a group, gets a spoken join code, invites members by phone number, and sees how many are recording plus group totals.
**The privacy rule, enforced structurally.** A chair never sees a member's deliveries, sales, credit or profit. This is not a UI convention: the aggregate endpoint issues `COUNT` and `SUM` queries and there is no `findMany` over any member-scoped table anywhere in the route, so no parameter a caller passes can return one. The aggregate library's input type has no identifying fields to leak.
**And a second layer most implementations skip:** totals are suppressed below **3 recording members**, because with 2 members a total minus one member's own figure reveals the other exactly. A privacy failure wearing the costume of an aggregate. The UI says why, rather than showing blanks.
**Still true:** a co-op dashboard over zeros is still a dashboard over zeros. This was built because the mechanism was requested, not because production has a cohort ready.

### ✅ GAP 5 — Offline *reads* so the farmer can see their numbers without signal — **BUILT (Oct 2026)**
**Was:** the write queue was real and the idempotency server-enforced, but a farmer who lost signal saw an empty screen. "Record now, read later" was half-built.
**Now shipped:** `read-cache.ts` caches the last good response per user per screen, serves it when the network fails, and **never serves without a plain-language age label**; `api-client.ts` reads through it; an offline banner in `offline-provider.tsx` states the age. Escalation is fresh → stale (2d) → abandoned (7d).
**Bonus bug found while wiring it:** the write queue was **not user-keyed**, so on a shared handset farmer A's unsent delivery would have replayed into farmer B's farm. Queue and cache are now per-user and cleared on sign-out.
**Solves test:** a farmer with the phone in aeroplane mode opens Deliveries and still sees *"you've supplied 140 litres, you're owed KES 4,200 — as of 2 hours ago."*

### ✅ GAP 6 — Market price board — **BUILT (Oct 2026)**
**Why:** farmers routinely sell below market price because they don't know the going rate.
**What shipped:** the farmer types the price they were offered and the checker answers in money, on their load: *"KES 10 per litre below Nakuru — on 400 litres that is 4,000 left on the table."* Region-scoped and dated, with the source and the age shown, because a benchmark without provenance teaches farmers to ignore it.
**The rule that shapes it:** regional beats fresher-national. You can only sell where you are, so a Nakuru price from six weeks ago is more useful than a national average from yesterday.

### ✅ GAP 7 — Weather → action rules — **BUILT (Oct 2026)**
**Why:** we already fetched weather; the industry wants climate-*smart* decisions, not a forecast icon.
**What shipped:** six rules in `weather-rules.ts` (29 tests), wired into the action engine off the `WeatherCache` the daily cron already fills — no extra API call, no new farmer data entry. Hold irrigation; get the harvest off the ground before heavy rain; stock feed before a dry spell; heat stress; cold nights; and the optimistic one, a good drying window.
**Two calibration decisions the tests forced:**
- **A dry spell needs the full 7-day window.** With 3 days of forecast, "no rain" is an incomplete forecast, not a drought — calling it one fires every dry morning and is ignored by Friday.
- **A drying window is the clear days *between* rains**, not a clear week. A clear week IS a dry spell, and a rule set that fires both for the same weather has no judgement in it.

### ✅ GAP 8 — Measuring whether any of this works — **BUILT (Oct 2026)**
**Was:** we had reordered the whole product on the strength of a one-off usage audit and had no standing mechanism to produce the next one.
**Now shipped:** `ActivationEvent` table (unique per user/stage/day) + `activation-funnel.ts` (pure maths, 21 tests) + a heartbeat route + `GET /api/admin/activation` + an `ActivationFunnelCard` in the admin panel. Signup → onboarding → **first record** → day-7 return. `first_record` is verified against the same rows the dashboard uses, not a self-reported flag. The card prints its own coverage caveat, so an empty funnel cannot be mistaken for a broken product.

### ✅ GAP 9 — Milk-delivery record (dairy co-op payment proof) — *capability built, day-one placement still owed*
**Correction (Oct 2026):** the first version of this document filed this as 🔴 MISSING. That was wrong. Direct inspection found the `Delivery` model (`buyer`, `receiptRef`, `unitPrice`, `expectedPay`, `status`, `paidAmount`) plus `DeliveryDeduction`, and `/api/deliveries/statement` already returning gross/deductions/net/paid/outstanding. The capability was ~80% present before we built anything.
**What was genuinely missing, and is now shipped:** a **per-buyer** breakdown (one line a co-op must answer to), an **all-time** outstanding figure, and a printable statement (`StatementCard.tsx`).
**What is still open — and it is a placement problem, not a feature:** the statement is still a tab the farmer must navigate to, and it reads "you're owed KES 0" to a farmer who has logged nothing. Promoting it to the day-one screen is Gap 2.
**Why it still matters:** the N-KCC/co-op payment crisis is headline news, and the root problem is that a farmer cannot verify their own deliveries — so disputes are unresolvable. That part is unchanged.

### ✅ GAP 10 — Tests
Started and grown to **77 frontend + 23 server tests**, including the record-grade maths, tag ranges, the delivery statement reconciliation, the first-run gating rule and the onboarding gate. The onboarding suite exists specifically because it **proved** it can catch the infinite-redirect bug that shipped. Continue alongside every phase.

---

## Section D — "Have we already solved it?" — the honest yes-list

So you know what NOT to rebuild. Wangari **already solves** the core records problem and these related ones, which is genuinely more than most Kenyan farm apps:

- ✅ **The farmer's own reliable, offline-capable, whole-farm record** (the hard foundational one)
- ✅ **Real profit in KES** (profitability engine, species/crop-aware)
- ✅ **Actual payments to the farmer** (M-Pesa/Paystack) — most competitors have no money path at all
- ✅ **Production costing incl. feed & mortality** (the lines that decide a month)
- ✅ **Farmer credit the farm extends to buyers** (overdue alerts) — often missing elsewhere
- ✅ **Partnership/sponsor promo-code distribution** (a growth engine competitors don't have)
- ✅ **Whole-farm: livestock AND crops** (Coffee, Tea, Avocado, Macadamia, Onions — proven in your data)
- ✅ **Multi-species (11) + biometric attendance (ZKTeco) + offline write queue + full Swahili dictionary**
- ✅ **Loan-proof and ANITRAC-tagged record layers** — the industry frontier, built and idle

**The pattern:** you have nailed **"the farmer's own operations"** and, as of October, **"the farmer's relationship with the outside world."** Both are downstream of a farmer who actually opens the app. The next edge is **reach and habit**, not capability.

---

## Section E — The strategic read

- **Your V1 is genuinely strong** and there is nothing to "fix" in the core. Do not rebuild what works.
- **The highest-value work is now the least impressive work:** a phone-and-PIN signup, a WhatsApp advisory, and a first screen that pays the farmer back tonight. None of it demos well. All of it is the bottleneck.
- **Do not start co-op mode yet.** It is the right Phase 4 and it will be wasted on an empty cohort.
- **Framing that ties it together:** *"Wangari is the farmer's record book — and we're making sure they actually write in it: open the door, meet them on WhatsApp, and pay them back the same night. Then the record becomes bankable and traceable — income for credit, and the ANITRAC tag for Kenya's traceability push."* Lead with the first clause; the second is only true for them once the first is.

---

## The honest priority order — REVISED after the October 2026 build

Every PARTIAL and MISSING row in Section B is now **built and tested except two**: the WhatsApp channel (blocked on Meta) and Swahili (a deliberate decision, not an oversight). 323 tests across both apps. **Nothing here has been deployed.**

The order below is therefore no longer "what to build" — it is **what to deploy, then measure**.

1. ✅ **Deploy and test with real farmers.** Everything above is code-complete and unproven. This is now the whole of GAP 1 and the honest state of every other row on this page.
2. 🔴 **GAP 1b — WhatsApp advisory + reply-to-record.** *Still blocked on Meta Business / WABA / template setup (founder action).* The only remaining unbuilt capability.
3. ✅ **GAP 8 — Funnel instrumentation.** Built. The only job left is to *read it weekly* — and it cannot tell us anything until step 1 exists.
4. ✅ **GAP 2 — Activation.** First-run card, auto-opened form, honest `firstRecordAt`, and the statement now promoted to the day-one screen.
5. ✅ **Gaps 3, 5, 6, 7, 9, 10 — built.** Proof, traceability, offline reads, price board, weather rules, delivery statement, tests. No further work owed.
6. ✅ **GAP 4 — Co-op / group mode.** Built with server-enforced aggregate privacy. Use it when a chair has members to onboard, not before.
7. 🟡 **Swahili.** Switch `PINNED_LANGUAGE` to `"sw"` when the copy is ready. Do not promise a Swahili product to a funder until then.

**The uncomfortable summary:** the gap analysis that drove this work said the problem was reach and day-one value, and it was right. Nine features were built in one pass. The binding constraint is no longer engineering — it is that none of it has touched a farmer's handset, and the funnel that would tell us whether it works cannot report until it does.

---

*Note on language:* Swahili was described throughout earlier versions of this file as shipped. It is currently pinned to English while the i18n layer is stabilised; the dictionary ships intact and returns via that layer. Do not promise a Swahili product to a funder until it is switched back on.

---

*Capability verified by direct inspection of `server/src/routes/*` and `server/prisma/schema.prisma` on 2 Oct 2026 (not from marketing copy). Usage figures verified by direct query of the production database on 2 Oct 2026. "Solved" means the capability exists in code; "partial" means it exists but not at the level required; where a capability is solved but the data does not yet exist, both facts are stated rather than the row being quietly upgraded.*

## Corrections log

An audit that is never corrected becomes a lie. Recording the mistakes here, because a founder who trusts his own analysis without checking it will be wrong in front of investors too.

- **Oct 2026 — Gap 12 / milk delivery statement was mislabelled 🔴 MISSING.** It was **PARTIAL and mostly built**: the `Delivery` model and `/api/deliveries/statement` already computed gross, deductions, net, paid and outstanding. The genuine gaps were per-buyer, all-time and printable — now shipped. Lesson: the "missing" rows came from scanning route *filenames* and the schema, not from reading the route bodies. `deliveries.ts` was 284 lines and none of it was visible from its name.
- **Oct 2026 — Gap 9 ("records provable to a third party") was filed as needing "signed export / attestation".** Re-reading the actual lender framework showed what a loan officer wants is an **operational history in four categories over multiple seasons** — activity, inputs, yield, market linkage. A signature or a self-generated hash proves nothing to them; a farm code plus a dated four-category history does. Built the latter.
- **Oct 2026 — Gap 8 was framed as "credit scoring", which would have been the wrong product.** Building a `creditScore` would make Wangari a regulated credit decision-maker. The build instead produces **record strength** — five stars, each one a thing the farmer controls — and explicitly no loan estimate, no rate, no approval. The proof layer, not the lender.
- **Oct 2026 — The headline of this document was wrong, and this is the correction that mattered most.** It ranked "credit proof" as the single biggest gap and "animal identity" second — both of which have since been **built**. Building them was good work and the wrong order. A production usage audit then showed 5 of 8 farms had never recorded anything and **0 of 8 held a gradeable record**, which means both headline features were returning "not enough data" to every single user. **The biggest gap was never a feature; it was that nobody could get in or get value.** Lesson: a gap analysis that reads only the codebase and the market — never the usage data — will confidently rank a bank-report builder above the login screen.
- **Oct 2026 — "Offline-first" was claimed as ✅ SOLVED.** The write queue is real and its server-side idempotency (`SyncedWrite`) is correct, but **reads are not covered** — a farmer who loses signal after saving sees an empty screen, not their numbers. Split into row 18 and marked 🟡 PARTIAL. **Row 18 flipped to ✅ SOLVED the same month:** offline reads shipped (`read-cache.ts`), and wiring them exposed a worse pre-existing bug — the write queue was not user-keyed, so one farmer's unsent record could replay into another farmer's farm on a shared handset. Queue and cache are per-user now, cleared on sign-out.
- **Oct 2026 — eight rows were marked ✅ SOLVED in one pass, and that is the most dangerous thing in this document.** Rows 0, 4, 5, 11, 12, 13, 14, 15 and 17 all moved from 🟡/🔴 to ✅ in a single build, on the strength of 323 passing tests and nothing else. **Not one line of it has been deployed, and not one farmer has touched it.** The correction log exists because an audit that is never corrected becomes a lie, and this is the moment it was most at risk of becoming one: the fastest way to repeat the original mistake — reading the codebase and concluding the problem is solved — is to mark eight features done because their tests are green. Green tests mean the code does what the code says. They say nothing about whether a farmer in Nakuru can get in, and the whole lesson of this document's headline correction is that usage data, not code, decides what is solved. **Treat every ✅ in Section B as "built, unproven" until the funnel has a week of real data behind it.**
- **Oct 2026 — deployed, and the first thing production testing found was a security control that did not exist.** All of Section B reached `wangari.imeantech.com` and the VPS. Verifying it properly (creating a real account through the browser, signing back in, then guessing at the PIN five times) produced `attemptsLeft` readings of 3, 2, 3, 1, 2 — non-sequential — and the correct PIN still worked after five wrong ones. The counter was a `Map` in the route module; pm2 runs two cluster workers, each with its own copy, so guesses split across two halves that never reached the threshold. **The only defence a 4-digit PIN has was absent in production, while its unit tests passed.** Now counted in Postgres (`lib/pin-attempts.ts`, migration 19); the same five attempts read 4, 3, 2, 1, 0 across workers and the correct PIN is refused with a 429. The counting arithmetic was wrong too, reporting three tries left after the first of five failures.
- **Oct 2026 — what deploying actually verified, beyond "it builds".** `curl /health` returns 200; migrations 17, 18 and 19 are recorded applied in `_prisma_migrations`; all seven new tables and the three phone columns exist; a phone signup through the real browser created user + farm + membership with `auth_method = phone_pin` and `+254712345000` normalisation; the same number signed back in on a later request; all six new screens return 200 with the correct `x-matched-path`. **These are the first rows in Section B backed by anything other than a passing test.** They are still not backed by a real farmer, which is the claim that actually matters.
- **Oct 2026 — reading the error log after deploying found a query that had been breaking the dashboard since March.** `prisma.vaccination.findMany({ where: { farmId } })` in the action engine. Vaccination has no `farmId` column, so Prisma threw at runtime and the farmer's daily action list never rendered — for every user, since commit `bd13eff`. **`tsc` cannot catch this**: a deliberate probe confirmed Prisma's generated types accept the query, so 194 green tests sat on top of a broken screen. Nothing short of reading production logs found it. Now filtered through `flock: { farmId }`, and `schema-truth.test.ts` checks every such filter against Prisma's generated `WhereInput` types.
- **Oct 2026 — the guard written to catch that bug passed, four times, with the bug still in the file.** This is the entry that matters most for how the rest of this document should be read. First attempt keyed models by PascalCase while call sites are camelCase, and skipped every miss. Widening the window flagged two correct `flock: { farmId }` sites. A character budget was then exhausted by the explanatory comment inside the very query being checked. **Each version passed while the bug was present, which is exactly what a green suite did in the original incident.** The working version brace-matches the call's argument object and reads Prisma's own generated types instead of the schema, asserts it covers more than 50 call sites so a dead matcher fails, and was verified by reintroducing the bug and confirming the failure. A check that has never been seen to fail is not evidence of anything.
- **Oct 2026 — a farmer reported "I can't save". The save worked; three separate things were broken, and only clicking the buttons found them.** The create POST returned 201 and the flock existed the whole time. What was actually broken: (1) the setup wizard's steps were wrapped in `AnimatePresence mode="wait"`, which refuses to mount the next panel until the previous one finishes exiting — the exit never completed, so "Next: Vaccinations" advanced the step indicator and left the Feed Plan panel on screen, with only "Skip all" working; (2) `handleSubmit` had `try/finally` and no `catch`, so a failed save rejected invisibly and the farmer clicked Save over and over; (3) `FlockAnimalsPanel` and `HivePanel` called `api.get("/animals")` and `api.get("/hives")` **without the `/api` prefix** — four calls, all 404, so ANITRAC tags and the entire beekeeping feature had never worked. **None of this was reachable by reading the code or by a green test suite.** The only method that found any of it was driving the live UI as the farmer would and watching the network.
- **Oct 2026 — a guard that proves it can fail, applied to UI wiring.** The species fix shipped a resolver; this one ships a scanner asserting every `api.*` call carries the `/api` prefix. Same discipline as the Prisma `WhereInput` check, for the same reason: the bug was a missing string that no type and no test could see.
- **Oct 2026 — a deploy broke for a reason no test covers: local scratch in the upload.** `vercel --prod` failed with "File size limit exceeded (100 MB)". The Vercel project builds `wangari-next/` only, but the CLI was run from the repo root and uploaded all 2913 files including a 95 MB agent scratch database. Added `.vercelignore`. A green build suite says nothing about what you are shipping, only about what compiles.
- **Oct 2026 — "in Swahili and KES" was claimed as shipped while the app is pinned to English.** The dictionary ships; the UI does not use it. Corrected in Section B row 19 and in the closing note.