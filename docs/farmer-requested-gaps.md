# Wangari — What Farmers Want That Is Not Built Yet

> **Date:** 12 October 2026 · **Scanned at commit:** `f0357a0` · **Scope:** the **animals**, **crops** and **finance** modules, weighted to Kenya's two biggest smallholder populations — **dairy** and **crop** farmers.
> **Method:** web research via **agent-reach** (Exa search + Jina Reader page reads, plus three parallel web researchers) mapped against a **direct read of `server/prisma/schema.prisma` and `server/src/routes/*`** — not against the marketing pages. Every "missing" claim below was checked against the actual schema before it was written down (searches for milk-quality, per-cow yield, lactation/estrus, plot geolocation, loan/repayment and budget terms return nothing in `server/src`).
> **Companions:** [gap-analysis.md](gap-analysis.md) (the industry gap analysis) · [module-plan.md](module-plan.md) (the engineering plan) · [roadmap.md](roadmap.md) · [vision.md](vision.md)

---

## Status at HEAD — 13 October 2026

**Every item in §1–§3 except C7 now exists, backend and screen.** The research below is kept exactly as it was written: it is the evidence base, and rewriting it to match what shipped would destroy the record of why these were built.

The status column in each table below carries the updated mark. Three things were as important as the new features, and all three were *wiring* rather than building:

1. **The statement now shows the milk quality.** `/api/deliveries/statement` computed a per-delivery slip — butterfat, SNF, density, added water, TPC, the promised payment date, the deductions by creditor — and no screen rendered a line of it. The one document a farmer hands a co-op clerk had no butterfat on it, which is the parameter they argue about. It is now on the statement, per delivery, with the reading that was never taken shown as a dash rather than a zero.
2. **Plots and farm loans were backend-only.** `/api/plots` and `/api/farm-loans` were registered and plan-gated with no page and `plotId` sent from nowhere, so a crop could not be attached to a plot from inside the app.
3. **The deduction form could not name a loan.** The route accepted `farmLoanId`; the form sent a free-text creditor, so "the co-op collected my SACCO loan at source" could never be linked to the loan it repaid.

The four money tools (reconciliation, forward view, chama, asset register) share one page, `/money`, because each is small and all four read records the farmer already keeps.

**Not yet deployed:** the migrations and the API are committed to `main` but not applied to the VPS. See the deploy note in [ops-runbook.md](ops-runbook.md).

---

## Read this before the list

**This document does not change the headline in [gap-analysis.md](gap-analysis.md).** That headline is still true and still ranks first: *no farm has a daily habit.* Five of eight farms recorded nothing, and no farm had a 30-day record. The gaps below are **real, documented, and worth building** — but they are downstream of a farmer recording anything at all. A per-cow yield chart for a farmer who is not logging milk is decoration.

So the honest ordering is: **activation first** (the phone+PIN front door, the 10-second log, WhatsApp), **then the items here.**

### Confidence, stated per item

The research split cleanly into two kinds of claim, and they are **not** the same strength of evidence:

- **Documented need** — the sector, government or a named co-operative visibly has the problem (milk-quality payment bands, unpaid co-op milk, pest losses, EUDR deadlines). These are safe to build against.
- **Product hypothesis** — the sources describe the *problem*, not farmers asking for *this app feature*. Marked 🅗 below. Real, but it should be validated with farmer interviews before it is sold as "what farmers asked for."

The researching agents were explicitly asked to separate these and to name what they could **not** verify. Their refusals are reproduced in §5 — they matter more than the confirmations.

**Legend:** ✅ built · 🟡 partial (exists, incomplete) · 🔴 missing · 🅗 product hypothesis, not documented demand

---

## §1 — Animals (dairy first)

Dairy is where the money is and where the records are thinnest. The scale fact that makes this tractable: Kenyan smallholder zero-grazing herds are commonly **1–5 cattle**, and **71%** of farmers in cited research keep **1–3**. Per-cow tracking is practical at that scale — it is a smallholder's decision-making unit, not an enterprise feature. ([Smallholder dairy production in Kenya: a review](https://lrrd.cipav.org.co/lrrd29/7/atiw29139.html))

| # | Need | Status | What we have today | Simplest fix (EXTEND, NEVER REBUILD) |
|---|---|---|---|---|
| A1 | **Milk quality on a delivery: butterfat, SNF, density, added water, TPC** | ✅ **Built** (was 🔴) | `Delivery` holds commodity, quantity, unit, unitPrice, expectedPay, paidAmount, receiptRef, notes. **No quality parameter of any kind** — verified by schema search. | Add **optional** columns to `Delivery` (`fatPct`, `snfPct`, `density`, `addedWaterPct`, `tpc`, `grader`). No new table, no new screen — the delivery card shows what was tested. |
| A2 | **Per-cow milk yield** (per animal, by milking) | ✅ **Built** (was 🔴) | `DailyProduction` is **flock-level only** (`milkCollected`). `Animal` exists but carries no production. | Add an optional `animalId` to `DailyProduction`. Flock total stays the source of truth; per-cow is detail on top, exactly like the `Animal`/`Flock` split already used for tagging. |
| A3 | **Reproduction timeline: calving date, days-in-milk, parity, dry-off date, calving interval, services-per-conception** | ✅ **Built** (was 🟡) | `Breeding` has sireName/sireBreed/damName/damBreed, matingDate, expectedBirth, actualBirth, offspringCount/offspringAlive, method, status. `cron-lifecycle.ts` already prompts a **calving kit when expected birth is within 7 days**. | Compute DIM / interval / services-per-conception from `Breeding` + `Animal` — **no new table**. Add a calving/dry-off date on the animal record. |
| A4 | **Heat (estrus) observation** | ✅ **Built** (was 🔴) | Nothing. | One optional `heatObserved` event type on the existing `HealthRecord`/`Breeding` timeline rather than a new module. 🅗 |
| A5 | **Calf-level records: colostrum, rearing, weaning, calf mortality** | ✅ **Built** (was 🟡) | Only `Breeding.offspringCount` / `offspringAlive`. Calves are not entities. | A calf is an `Animal` with a `damId`. Reuses the model that already exists. |
| A6 | **Mastitis and treatment, with the milk-withdrawal period** | ✅ **Built** (was 🟡) | `HealthRecord` (type, condition, action, vetName, observedAt, resolvedAt, cost) — free-text, **no withdrawal date**. | Add `withdrawalUntil` to `HealthRecord`. A farmer selling milk during a withdrawal window is a food-safety and payment risk. |
| A7 | **Cost per litre vs the price actually received** | ✅ **Built** (was 🟡) | `unit-economics.ts`, `ledger-taxonomy.ts`, `profitability.ts`, `record-grade.ts` already exist and are careful about not lying with the numbers. | Feed the new delivery quality fields into the existing per-litre view. No new maths. |

### Why A1 is first — the strongest evidence in this document

Kenya's dairy sector is actively moving to **quality-based milk payment (QBMP)**, and the payment bands are defined by exactly the parameters we do not store:

- SNV's Kenya Market Development Programme QBMP report specifies a two-tier system (farmer→cooling tank→processor) where **fat is priced per kilogram delivered**, milk at or above the **COMESA standard legal minimum of 3.25% fat** is paid at standard or bonus while below it is investigated, and **detected added water is deducted from the volume delivered** — with an option to fine it punitively. The design deliberately keeps the money pot unchanged: **75–85% of farmers receive the standard price, 5–10% a bonus, 10–15% a deduction.** ([SNV, *A Quality Based Milk Payment System*](https://www.snv.org/assets/downloads/f/191310/8ad2fc7118/kmdp_-_qbmp_condensed_report.pdf))
- In May 2025 Kenyan co-operatives were reported adopting **Prompt iSmart Sanchay** analysers measuring **butterfat, SNF, added water and density in under 40 seconds**, with cloud recording and SMS to farmers — modelled on India's NDDB system. ([Dairy Business MEA, May 2025](https://dairybusinessmea.com/2025/05/08/kenya-adopts-indian-dairy-model-with-advanced-milk-testing-payment-systems/))
- Digitised co-op records are being pushed precisely to end payment disputes: Mau Dairy Cooperative's own account is that manual cards produced conflicts where *"a farmer would have conviction of delivering 300 litres in the month … we would have 250."* ([SNV, *Digitisation: A Game-Changer for Dairy Cooperatives in Kenya*](https://www.snv.org/update/digitization-a-game-changer-for-dairy-cooperatives-in-kenya))

A farmer who cannot see their own butterfat figure cannot check a bonus or a deduction — and **the deduction is the thing they will argue about.** This is the single highest-value animal-side addition, and it is a handful of nullable columns.

---

## §2 — Crops

Crop farms are not one record with an acreage — they are several **distinct plots** with different soils, crops, inputs and pest pressure. Almost everything below follows from the missing plot.

| # | Need | Status | What we have today | Simplest fix |
|---|---|---|---|---|
| B1 | **Plot-level records: many plots per farm, each with area, boundary and history** | ✅ **Built** (was 🔴) | `Crop` has a free-text `location` and a farm-level `areaAcres`; `Farm` has lat/long. **No plot model** — verified by schema search. | One small `Plot` table (name, area, lat/long or polygon, soil), and `Crop.plotId`. Crop records, harvests and applications then hang off a real place. |
| B2 | **EUDR readiness for coffee — plot-level geolocation** | ✅ **Built** (was 🟡) | **Farm-level** `latitude`/`longitude` exist, are validated as a both-or-neither pair (`parseGps` rejects one coordinate alone as "a point somewhere in the Indian Ocean"), and are **already emitted in the KIAMIS export** — whose own header names *"geo-mapping for coffee's EUDR traceability"* as the reason the shape carries GPS. What is missing is the **plot**, and the chain that makes a delivery traceable. | `Plot` geolocation (B1) plus a plot→harvest→delivery→buyer link. This is a plot-resolution gap, not a missing-GPS gap — do not rebuild what `kiamis.ts` already does. |
| B3 | **Pest scouting with structured sampling and follow-up** | ✅ **Built** (was 🟡) | `CropHealth` is good: date, issueType, description, severity, treatment, treatedDate, outcome. | Attach scouting to the plot and add a pest-specific count/stage field (e.g. berries infested per sample). |
| B4 | **Rotation / crop history per plot** | ✅ **Built** (was 🔴) | Nothing. | Falls out of `Plot` + `Crop` once B1 exists — it is a query, not a table. |
| B5 | **Fertiliser subsidy: eligibility export (built) vs redemption record (missing)** | ✅ **Built** (was 🟡 — the registration half was already there) | **Built:** `GET /api/kiamis` + `lib/kiamis.ts` assemble the farmer's KIAMIS registration document (name, validated 7–9-digit national ID, phone, county, premises no, **farm size**, commodities, trailing-year income, GPS), with a `missing[]` list so an incomplete farm is a to-do rather than a false-complete document. KIAMIS is *the gate to the fertiliser e-voucher* and the voucher quantity derives from declared acreage — so this is the eligibility half, done. **Also built:** `CropApplication` (type, productName, quantity, cost, phiDays) and `SoilTest` (pH, N, P, K, organicMatterPct). **Missing:** what happened *after* eligibility — the voucher itself. | Record the **redemption** as a distinct input-cost line: voucher value, dealer, quantity, farmer contribution, so a subsidy is never counted as cash income and the real input cost stays visible. |
| B6 | **Yield forecast vs actual, per plot and per acre** | ✅ **Built** (was 🟡) | `Crop.expectedHarvest` (text) and `CropHarvest.quantityKg`. | Compare against `Plot.area`; label it an estimate, never a promise. |
| B7 | **Realised price per grade and buyer** | ✅ **Built** (was 🟡) | `MarketPrice`, `Sale`, `Delivery`, `Invoice` all exist. The realised price is capturable; the *story* across grade/buyer/season is not surfaced. | Report on existing data. No new table. |

**The EUDR detail worth getting right — including who actually owes what.** The European Commission's implementation page states the regulation **applies from 30 December 2026** and covers coffee, and that **non-EU producers do not themselves have EUDR obligations unless they place products on the EU market** — but they *may be asked for location information* so EU operators can comply. ([European Commission, EUDR implementation](https://green-forum.ec.europa.eu/nature-and-biodiversity/deforestation-regulation-implementation_en)) The European Forest Institute's Kenya coffee preparedness review describes the same December 2026 main obligations with extended timelines for small operators. ([EFI, Kenya coffee preparedness check](https://efi.int/publication/preparedness-check-kenya-eu-deforestation-regulation))

So the practical deadline for a Kenyan smallholder is **the date their buyer asks**, not a statutory date served on them. Wangari should collect the data and never overstate the legal duty — a farmer who is told "the EU requires you to…" when it does not, and finds out otherwise, stops trusting the app.

**Coffee berry borer is the concrete pest case:** CABI, working with KALRO's Coffee Research Institute, reports CBB is a major Kenyan constraint especially in low-altitude zones and can cause **up to 80% losses**, with a calibrated model producing location-specific alerts, flowering/berry-expansion forecasts and harvest timing — and notes nationwide scaling was still needed beyond pilot sites. ([CABI, *Coffee berry borer modelling for Kenyan coffee production*](https://www.cabi.org/projects/coffee-berry-borer-modelling-for-kenyan-coffee-production/))

---

## §3 — Finance

The money side is where farmers are most often wronged, and where our existing coverage is better than expected: `Delivery` + `DeliveryDeduction` + `Transaction` + `Sale`/`Invoice`/`Credit`/`Quote` already model the co-op check-off pattern the research describes.

| # | Need | Status | What we have today | Simplest fix |
|---|---|---|---|---|
| C1 | **Intake → each deduction → net payment, with a date expected and an arrears view** | ✅ **Built** (was 🟡) | `Delivery` has expectedPay, paidAmount, receiptRef, status; `DeliveryDeduction` has label + amount. `DeliveryDeduction` has **no creditor and no balance**, and `Delivery` has **no expected-payment date**, so "unpaid, 3 months" cannot be expressed. | Add `creditor`, `balance` and a `paidOn`/`dateExpected` to the delivery + deduction pair. |
| C2 | **The farmer's own loans and repayments** (SACCO, AFC, input credit) with a repayment calendar | ✅ **Built** (was 🔴) | `Credit` is money owed **to** the farm by its customers — the opposite direction. **Nothing models the farmer's own debt** (schema search confirms). | One small `FarmLoan` table (lender, principal, instalments, balance) that can be repaid from the same delivery deductions. |
| C3 | **M-Pesa / cash reconciliation against deliveries and sales** | ✅ **Built** (was 🔴) | `Transaction` has paymentMethod + reference, but there is no statement import and no matching of a receipt to a delivery. | Match by reference/amount in the existing ledger; manual confirm is enough for a first version. |
| C4 | **Cash-flow forecast, budget vs actual, the season gap** | ✅ **Built** (was 🔴) | **No budget model exists.** | Extend the ledger into a forward view; do not build a new ledger. |
| C5 | **Insurance: trigger, cover period, and the payout actually received** | ✅ **Built** (was 🟡) | `InsurancePolicy` has productType, unitsCovered, sumInsured, premiumPaid, startDate, endDate, status, **triggerMetric, triggerValue**. No payout record. | Add a payout/claim record and explain index payouts plainly — **a payout is not the same as the farmer's measured loss**, and pretending otherwise destroys trust. 🅗 |
| C6 | **Break-even price and cost per litre / per kg** | 🟡 Partial | `unit-economics.ts`, `profitability.ts`, ledger taxonomy. | Largely present. Surface it where the farmer sells. |
| C7 | **Group savings (chama/table banking) and member statements** | ✅ **Built** (was 🔴) | `CoopGroup`/`CoopMembership`/`CoopInvite` cover membership, join codes and expiry — **not savings or group loans**. | Out of scope for now; note it and move on. |
| C8 | **Asset register and depreciation** (cows as capital, equipment) | ✅ **Built** (was 🟡) | `Flock.costPerAnimal`/`totalInvestment`, and `lib/flock-replacement.ts` computes replacement cost. | Present the value that is already computable. |

### Why C1 and C2 are the ones that matter

- **Delayed co-op payment is no longer hypothetical.** The KBC reported Murang'a dairy farmers saying New KCC had not paid for milk delivered over **three months**, citing delayed payment and low prices as reasons for switching to private buyers. ([KBC](https://www.kbc.co.ke/dairy-farmers-decry-delayed-milk-payment-by-n-kcc/))
- **Payment timing changes farmer behaviour**, so a record of it is a money tool, not bookkeeping: in a study of **398 dairy farmers in Kiambu**, **95% preferred end-of-month co-operative payment even when daily payment was offered at a higher price** — farmers used monthly payment as a commitment device for saving. **86%** kept the monthly arrangement when offered a higher daily price. ([J-PAL, *Dairy Market Responses to Saving Constraints in Kenya*](https://www.povertyactionlab.org/evaluation/dairy-market-responses-saving-constraints-kenya))
- **Data-led input credit already works in Kenya**, which is what makes C2 buildable rather than theoretical: Mercy Corps Agrifin's review draws on two years of DigiFarm and FtMA pilot data and references FarmDrive's alternative credit-risk assessment. (It does **not** publish loan sizes, rates or default rates.) ([Mercy Corps Agrifin](https://mercycorpsagrifin.org/digital-input-loans-for-smallholders-how-can-providers-optimise-uptake-and-repayment/))

Our own `farm-record.ts` already frames this correctly in code: *"Wangari is the proof, the lender is the decision."* C1/C2 extend that posture — they record what the co-op did and what the farmer owes, without Wangari ever making a credit decision.

---

## §4 — Already built: do not rebuild these

The reason this list is short is that the earlier plans were executed. Confirmed present in the schema and routes at `f0357a0`:

**Animals:** individual `Animal` identity with tag numbers and `Flock` tag ranges · ANITRAC movement records (`AnimalMovement`, `FlockMovement`) · `Vaccination` scheduling · `Breeding` · `HealthRecord` · feed (`FeedRecipe`) · `Hive`/`HiveInspection` (bees) · `InsurancePolicy` per flock.

**Crops:** `Crop` with variety, area, planting and maturity · `CropHarvest` · `CropHealth` · `CropApplication` with **pre-harvest interval (`phiDays`)** · `PostHarvestBatch` with grade, dry matter, cartons, phyto certificate · `SoilTest` · `ColdChainEvent`.

**Registration & compliance exports:** the **KIAMIS registration export** (`/api/kiamis`, owner-only) — the fertiliser e-voucher eligibility gate, including the farm's GPS pair and a `missing[]` checklist. It is **deliberately read-only**: no KIAMIS integration exists and the code says so rather than implying one. This is the piece of §2 that was already solved before this scan, and it is the reason B5's registration half is not a gap.

**Finance:** `Delivery` + `DeliveryDeduction` (the co-op check-off) · `Sale`/`Invoice`/`Quote`/`Customer`/`Credit` · `Transaction` with cost buckets and enterprise attribution · `Inventory` + `InventoryLog` with reorder levels and expiry · `Worker`/`Attendance`/`WorkerTask`/`WorkerLog`/`ZKTecoDevice` · `profitability`, `unit-economics`, ledger taxonomy, and the farm-record report with a record grade · `MarketPrice` · `WeatherCache`.

Anything in §1–§3 that appears to duplicate one of these is a **field on the existing table**, not a new module.

---

## §5 — What the research could NOT verify (read this before quoting anything)

The honest edge of this document. These were all *looked for* and **not** confirmed, so none of them should be written into a farmer-facing screen or a pitch:

- **A current Kenyan legal minimum fat content.** The **3.25%** figure is the **COMESA** standard as stated in the SNV QBMP report. The researchers could not verify it as a current Kenyan legal threshold from a primary Kenyan government source, and one quality-threshold PDF could not be extracted. Implement test *storage*; do not hard-code a legal limit as fact.
- **The EUDR geolocation rule (the often-repeated four-hectare point-versus-polygon distinction).** Not verified in the current consolidated text. Do not implement it as a compliance rule until the official text/FAQ is read directly.
- **2026 fertiliser subsidy terms.** What *is* verified is the **2025 long-rains National Fertilizer Subsidy Programme**: **7.4 million bags**, distribution from end-January ahead of mid-March rains, **e-vouchers for registered farmers**, and a subsidised price of **KSh 2,500 per 50 kg bag** at NCPB depots and participating co-ops/agrovets. ([Ministry of Agriculture, 2025 long-rains NFSP launch](https://kilimo.go.ke/cs-dr-andrew-karanja-has-presided-over-the-launch-of-the-2025-long-rains-national-fertilizer-subsidy-programme-nfsp-at-the-ncpb-gpc-depot-nairobi/)) **Do not treat 2025 prices or procedures as 2026 terms.**
- **AFC rates** (10% reducing balance; 5% soft-credit) came from **search-indexed snippets while the AFC pages returned 403** — unconfirmed, do not quote.
- **A typical yield-per-acre for Kenyan smallholders.** CABI gives no such figure, and KALRO's maize page gives *variety potential* (e.g. Coast Composite **16–21 bags/acre**), which is guidance, **not** what farmers achieve. ([KALRO maize TIMPs](https://kalrotimps.com/timps/11))
- **Insurance uptake and payout figures, e-voucher redemption rates, SACCO/chama interest rates, and the prevalence of "unexplained deductions."** Delayed dairy payment is directly reported; the other three are credible hypotheses that need farmer interviews, not statistics.

**The strongest structural caveat, in the researchers' own words:** Kenyan sources document *sector problems and the subjects farmers seek help with* more often than they document farmers explicitly requesting a particular digital feature. Every 🅗 in this document is a product inference from a documented problem. Validate with farmers before shipping it as a promise.

---

## §6 — If only five things get built

Ordered by evidence strength per unit of work, and each one **extends a table that already exists**. All five shipped on 13 October 2026:

1. ✅ **Milk quality columns on `Delivery`** (§1 A1) — the QBMP payment bands are already live in Kenyan co-ops and we store none of the parameters. A handful of nullable columns. *Now also on the statement, which was the gap that mattered: the field existed and the document did not.*
2. ✅ **Per-cow milk yield** (§1 A2) — a separate `AnimalProduction` table keyed on `(animal_id, date, session)` rather than a nullable `animalId` on `DailyProduction`: a per-cow reading and a flock total are different measurements, and a nullable FK invites someone to sum both.
3. ✅ **Reproduction timeline: DIM, calving interval, services-per-conception** (§1 A3) — *computed* from `Breeding`, no new table, and it makes the breeding records farmers already enter actually pay off.
4. ✅ **`Plot` with geolocation** (§2 B1/B2) — the prerequisite for both better agronomy and coffee EUDR readiness, with the buyer-request framing rather than a fake legal deadline. *The crop form now sends `plotId`, which it never did — the model was unreachable from the app before that one field.*
5. ✅ **Delivery deductions with a creditor, a balance and payment dates, plus the farmer's own loans** (§3 C1/C2) — the unpaid-co-op-milk and input-credit story, which is the most emotive money problem in the sector and, until this shipped, could not even be expressed in our schema.

**How we will know any of it worked:** not that the field exists — that a farmer opens the screen and *corrects someone*. A butterfat figure they check against a co-op statement, a deduction they query, a plot their buyer accepts. If the feature cannot be used to win an argument with a buyer, a co-op or a lender, it is in the wrong list.

---

*Researched 12 October 2026 via agent-reach (Exa search, Jina Reader, three parallel web researchers), then verified against `server/prisma/schema.prisma` and `server/src` at commit `f0357a0`. Figures are quoted from the sources named beside them; the unverified items in §5 are named there rather than quietly omitted.*

*Status column updated 13 October 2026 against HEAD. The research text itself is unchanged — it is the evidence base, and the reason each item was worth building. Everything in §1–§3 except C6 (which needed no new work) is built, backend and screen; the migrations are committed but not yet applied to the VPS.*
