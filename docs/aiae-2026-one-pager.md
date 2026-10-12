# Wangari — AIAE 2026 One-Pager

> **What this is:** the one-pager the AIAE 2026 team asked for, to assess eligibility for the **Innovation Showcase & Startup Pitches**.
> **Written:** 9 October 2026, in reply to the AIAE 2026 Team's message of 9 October; **re-sent 12 October 2026** with the figures below refreshed from the live database. **Event dates they confirmed:** 23–25 October 2026, KICC Nairobi.
> **Numbers are current as of 12 October 2026 and read from the live database**, not from a roadmap. See §7 for what we deliberately do *not* claim.
> **Send as:** the attached PDF ([aiae-2026-one-pager.pdf](aiae-2026-one-pager.pdf), one A4 page) with the email text in §8. Markdown source is below; the print version is [aiae-2026-one-pager.html](aiae-2026-one-pager.html).
> **Companions:** [aiae-2026-readiness.md](aiae-2026-readiness.md) (criteria scorecard) · [aiae-2026-field-plan.md](aiae-2026-field-plan.md) (the three days) · [founder-guide.md](founder-guide.md) (the pitch)

---

## Wangari Farm OS

**Whole-farm records and profit truth for Kenyan smallholders — offline, in Swahili, in KES.**

**Lewis Ndungu**, Founder · wangari.imeantech.com · +254 114 971 070 · info@imeantech.com · Nairobi, Kenya
Live product: **wangari.imeantech.com** (working today, demo account on request)

### 1. The problem

A smallholder's farm is run from memory and a notebook. Feed, eggs, milk, labour, doses, sales and losses are known only approximately, and the month's real profit is discovered **after** the decisions that shaped it. The three costs that decide whether a season works — feed, mortality and a dropped price — are exactly the ones nobody writes down. Without records a farmer cannot price, cannot borrow (a bank will not lend against a record the farmer never wrote), cannot prove origin for export due diligence, and cannot see which enterprise is quietly losing money.

### 2. What it does

One app covering the **whole farm**, not one enterprise: poultry, dairy and beef cattle, goats, sheep, pigs, fish, bees **and** crops (coffee, tea, avocado, macadamia, vegetables) in the same account. A farmer records daily output, feed, health, vaccinations, workers, store stock, sales and deliveries in a few taps; the app returns **real profit in KES** and a per-enterprise view of what is worth keeping.

Built deliberately for how the farm actually operates:

- **Works with no signal.** Recording is fully offline; writes are queued on the device and replayed when a signal returns, with idempotent replay so a duplicated submission returns the original result instead of writing twice. This is the part that is easy to demo and hard to copy — and a farm tool that breaks in the field is worth nothing.
- **Swahili and English**, prices and money in KES.
- **M-Pesa payments** integrated (Paystack) — no payments taken yet; nothing to claim there.
- **Kenya-specific compliance in the data model:** ANITRAC tag ranges and the §20 animal-movement record are built in. No farmer has tagged animals yet, so we do not present it as in use (see §7).

### 3. Why it is different

Most digital tools in this space are either **poultry-only** or paper. Wangari is whole-farm and offline-first, and its data model is built to attach new capability to tables that already exist rather than to rebuild. That is what lets one small team produce a farm-wide record instead of a broiler counter.

### 4. Traction — the whole picture, as of 12 October 2026

| | |
|---|---|
| Accounts | **13** (7 with a verified email, 2 with a completed farm profile) |
| Farms registered | **12** — **4 hold livestock** |
| Livestock groups | **7**: poultry, dairy cattle, beef cattle |
| Crops | **6** enterprises |
| Records in the system | **37** vaccinations scheduled · **12** daily production entries across **6** days · **21** money entries · **4** sales · **6** workers · **9** store items |
| **Revenue** | **KES 0.** All six subscription rows are comped (sponsor promo codes and admin goodwill extensions, amount 0) |
| Individually tagged animals | **0** — ANITRAC is built, not yet in use |

We are **pre-revenue and pre-scale**. What exists is a working, paid-ready product with real usage on real farms, and a distribution plan that does not depend on paid acquisition.

### 5. Technology and maturity

| | |
|---|---|
| Code | ~**110,000** lines across **532** source files · **78** screens · **67** data models · **65** API route files · **36** database migrations |
| Tests | **1,410** automated tests, all green (949 backend, 461 frontend) |
| Operation | Live in production with health monitoring, structured error reporting, role-based access and per-farm data isolation |
| Built since | First commit **27 June 2026** |
| Team | **One founder** — product, engineering and operations. No employees. |

A one-founder product that carries a test suite and a migration history is unusual at this stage; it is the reason the product can be extended without being rewritten.

### 6. Business model

Subscriptions: **Starter KES 1,500/month**, Growth KES 4,500/month, with annual plans at roughly a third less. Software gross margin is ~99%, so 100 paying farmers is KES 150,000/month and it compounds.

Distribution is **partner-led, not paid**: cooperatives, agrovets, feed companies and county extension teams get free sponsor-branded codes for their members plus a free onboarding session. The partner gets their name in front of their farmers daily and members who arrive at meetings with real numbers; the farmers get months of free use; we get adoption at near-zero acquisition cost. This is built and working today.

### 7. What we do not claim

We are not raising money on this page, and we are not going to inflate it. Revenue is zero. Animal tagging is unused. WhatsApp is in development. The 13 accounts are early. Anyone can open the live product in five minutes and see exactly what is described here — that is the point.

### 8. The ask

A place in the **Innovation Showcase & Startup Pitches** at AIAE 2026, with a **live demonstration on a phone** to pitch to potential investors and strategic partners. We are at pre-seed stage: the product is built, functional, and live — we are now seeking a demo opportunity to connect with investors and partners who can help us grow and scale. The demo works offline and needs nothing from the venue's WiFi.

Two questions we would be glad to have answered with it:

1. Which day and time the pitches fall on **within 23–25 October**, so we can prepare for the right slot.
2. Which materials and format the panel would prefer for the showcase.

### 9. Contact

**Lewis Ndungu** — Founder, Wangari Farm OS
wangari.imeantech.com · +254 114 971 070 · info@imeantech.com · Nairobi, Kenya

---

## 8. The email to send it with

**Hit Reply on their message — do not start a new email.** Keeping their subject line keeps the thread intact so the organiser doesn't have to reconnect your conversation. Attach [aiae-2026-one-pager.pdf](aiae-2026-one-pager.pdf).

> Dear AIAE 2026 Team,
>
> Thank you for the quick reply, and for confirming the dates — 23–25 October at KICC.
>
> Please find attached our one-pager, submitted for your review for the Innovation Showcase and Startup Pitches.
>
> **Wangari Farm OS** is a whole-farm records and profit app for Kenyan smallholders (poultry, dairy, goats, crops) working offline, in Swahili, with KES profit tracking. It is live today at wangari.imeantech.com. As shown in the attached one-pager, we are at pre-seed stage: the product is built, functional, and operating on real farms (13 accounts, 4 livestock farms, KES 0 revenue).
>
> Our primary focus for participating in the showcase is securing a **live demo opportunity to present to potential investors and strategic partners** to back us as we grow and scale. We would welcome the chance to demo it in person on a phone — offline recording works with the network switched off, so it requires nothing from the venue's WiFi.
>
> Two quick questions to help us prepare:
> 1. Which day and time do the Startup Pitches fall on within 23–25 October?
> 2. Is there a preferred format, time limit, or slide deck requirement for the showcase — and anything else you need from us?
>
> Thank you for considering us.
>
> Kind regards,
> **Lewis Ndungu**
> Founder, Wangari Farm OS
> wangari.imeantech.com · +254 114 971 070 · info@imeantech.com

**Attachment:** `aiae-2026-one-pager.pdf` (one A4 page, 334 KB — re-rendered 12 October 2026 with the figures refreshed).

### The re-send email (12 October 2026)

**Again: hit Reply on the same thread.** Keep their subject line so the one-pager arrives as a new message inside the conversation the organiser already has open, above the message where they asked for it.

This is a re-send rather than a first send for two reasons, and both are worth saying out loud in the email: the first message may have landed in spam or had the attachment stripped, and the figures have genuinely moved since 9 October (7 livestock groups, 37 vaccinations, 21 money entries, 9 store items, 67 models, 1,410 tests). So the attachment going out now is **more current than the one sent on 9 October** — not just a copy of it.

> Dear AIAE 2026 Team,
>
> Apologies for the second message — I am re-sending the attached one-pager in case it did not reach you, or in case the attachment was stripped on the way.
>
> It is the same one-pager we submitted for the Innovation Showcase and Startup Pitches, re-issued today with the figures refreshed from our live database: still 13 accounts, 12 farms registered and 4 farms holding livestock, on KES 0 revenue — and now 7 livestock groups, 37 scheduled vaccinations and 21 money entries as records accumulate. Nothing on the page is a projection.
>
> The short version: **Wangari Farm OS** is a whole-farm records and profit app for Kenyan smallholders — poultry, dairy and beef cattle, goats, crops — working fully offline, in Swahili, with real profit in KES. It is live today at wangari.imeantech.com. We are pre-seed: the product is built, functional, and operating on real farms.
>
> What we are asking for is a **live demo slot in front of investors and strategic partners** — we would welcome the chance to present on a phone, offline, so it requires nothing from the venue's WiFi.
>
> Two things would help us prepare, and either would be enough to act on:
> 1. Which day and time the Startup Pitches fall on within 23–25 October?
> 2. Is there a preferred format, time limit, or slide deck requirement — and anything else you need from us to assess eligibility?
>
> Thank you for your time; we will hold the slot open on our side.
>
> Kind regards,
> **Lewis Ndungu**
> Founder, Wangari Farm OS
> wangari.imeantech.com · +254 114 971 070 · info@imeantech.com

**If this one also goes unanswered**, the short nudge below still works — but send it only *after* the re-send, not instead of it:

> Hi — just floating this up in case it got buried. Happy to send a 60-second screen recording of the offline demo instead if that is easier to review. — Lewis

---

## How to regenerate the print version

The HTML is the print master; the PDF is that page printed to A4. To rebuild it:

1. Open [aiae-2026-one-pager.html](aiae-2026-one-pager.html) in Chrome.
2. **Print → Save as PDF.** Paper A4, margins default (the `@page` rule sets 11mm), **Background graphics on**.

No build step and no dependency: `docs/aiae-2026-one-pager.pdf` was produced exactly that way and is **verified as a single A4 page** (one `/Type /Page`, `/Count 1`, content **1022.5px** against an A4 printable height of 1039.4px — about 17px, or 4.5mm, of headroom). That is tighter than it was on 9 October, because the traction and technology figures gained digits; it still fits, but re-check the page count on every edit. If you edit the HTML, re-print and check it has not spilled to a second page — that is the only thing that breaks this document.

**The page is styled from the product's own brand system, not a generic template.** The colours are the `wangari-*` tokens from `src/app/globals.css` (green-800 `#166534` primary, green-50 `#F0FDF4` tints, amber-500 `#F59E0B` reserved as the single accent — used only on the KES 0 stat and the "what we do not claim" box). The logo is `public/images/wangari-logo.png` with its cream background keyed out, and the body face is **Inter** — the same typeface the app ships — embedded in the file as a data URI so the PDF lays out identically on any machine with no network and no sibling files.

Two regeneration helpers sit alongside this file: `render-one-pager.mjs` (measures the print layout and regenerates the PDF) and `cdp-measure.mjs` (reports per-block heights under real print media). Run `node docs/render-one-pager.mjs` after any edit and confirm it still prints `/Count 1`.

To see it on screen, `node docs/serve-docs.mjs 8791` and open `http://127.0.0.1:8791/docs/aiae-2026-one-pager.pdf` — Chrome's own viewer is the fastest way to confirm the page count and the colours together.

<sub>Numbers read from the production database on 12 October 2026. If any figure here has moved by the time you send it, update it — an accurate small number is worth more than an impressive stale one.</sub>
