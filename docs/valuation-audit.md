# Wangari — Honest Audit & Valuation

> **Audit date:** 2 October 2026 · **Auditor:** founder + agent, with live production data pulled from the VPS database and the real repository
> **Purpose:** an honest record of what Wangari actually is, what it is worth today, why — and what would have to be true for it to be worth more. Written to be *re-read before any sale, funding conversation, or investor meeting*, so that the founder never has to remember a flattering version.
>
> **Rule of this document:** no flattery, no projection dressed as fact. Numbers marked **[measured]** came from the code or the production database. Numbers marked **[assumption]** are reasoning and are labelled as such.

**Companion documents:** [vision.md](vision.md) · [roadmap.md](roadmap.md) · [founder-guide.md](founder-guide.md)

---

## 1. Verdict first (the honest version)

**Wangari today is a sophisticated, production-hard, feature-complete farm-management platform with almost no customers.**

Those two facts are both true, and the tension between them *is* the investment case. The engineering is genuinely far ahead of the traction. Anyone buying this is buying the code, the architecture, the brand, and the founder's execution speed — **not** a revenue stream, because there is none.

| Dimension | Honest state |
|---|---|
| Product maturity | **High.** Live in production, payment-integrated, security-audited, species-aware, offline-capable. |
| Revenue | **KES 0.** Zero paying customers. All 5 subscriptions are sponsored/goodwill. |
| Users | **9 total, 4 email-verified, 2 profile-complete, 8 farms.** |
| Traction | **No growth curve yet.** First user 3 Sep 2026; newest 21 Sep 2026. No partner signed. |
| Team | **One founder.** No co-founder, no employees, no technical co-founder. |
| Automation | **No tests at all** (see §5). Manual deploy via SSH. |
| Defensibility | **The code and speed, plus the offline/Swahili/WhatsApp + payment combination. Not yet the data or the network.** |

**One-line honest summary:** *This is what a well-built product looks like 30 days before it finds its first 1,000 users — not after.*

---

## 2. What has actually been built [measured]

### Scale of the codebase

| Measure | Value |
|---|---|
| TypeScript/TSX source lines | **54,695** (server 12,799 + frontend 41,896) |
| Source files | 300 (66 server + 234 frontend) |
| Backend route modules | 46 |
| Frontend pages | 65 |
| Next.js API routes | 52 |
| Prisma data models | 48 |
| Database migrations | 13 (clean, versioned history) |
| Git commits | 613, single-author, linear main |
| Elapsed build time | ~30 days (first user 3 Sep 2026) |

**[measured] ~54,700 lines / 48 data models / 65 screens in 30 days, by one person.** That build velocity is the single most valuable, least visible asset in this company.

### Production data [measured, pulled live from the VPS]

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| Users | 9 | | Promo codes | 8 |
| Farms | 8 | | Promo redemptions | 2 |
| Subscriptions (active) | 4 | | Plans (live) | 4 |
| Daily production records | 12 | | News articles | 53 |
| Flocks | 5 | | Email log | 179 |
| Crops | 5 | | Audit log | 200 |
| Crop harvests | 3 | | Deliveries | 2 |
| Sales | 4 | | Invoices | 5 |
| Transactions | 16 | | Quotes | 1 |
| Workers | 6 | | CRM contacts | 1 |
| Vaccinations | 31 | | Tickets | 0 |
| Inventory | 8 | | Offline sync rows | **0** |
| Attendance | 2 | | ZKTeco (biometric) logs | 0 |

### What this data honestly shows
- **The data model is rich but the *usage* is thin.** 31 vaccinations and 12 daily production rows across 8 farms means the app *works* but has not yet been used at volume by real farmers for a sustained period.
- **Crop diversity is proven:** real Coffee, Onions, Tea, Macadamia and Avocado records exist — the platform is genuinely whole-farm, not poultry-only. This is a differentiator versus most Kenyan farm apps.
- **Revenue is genuinely zero.** Every subscription carries `amount = 0` (goodwill/sponsored). There is no revenue, no MRR, no paying cohort. Anyone claiming otherwise is lying.
- **Offline sync is unproven.** The offline UI, queue and sync-status components exist, but the `SyncedWrite` sync ledger has **0 rows** and the server-side sync route does not reference it. The offline *experience* is built; the *sync guarantee* is not yet exercised in production. This is a claim-vs-reality gap (§5).

### Feature surface [measured from the codebase]

- **Auth & security:** JWT auth with token-version revocation, TOTP MFA + recovery codes, Google OAuth, mandatory email verification (6-digit code), role-based farm membership, worker tokens inheriting farm-owner access. A full security audit was run and all Critical/High findings fixed (see [SECURITY-AUDIT.md](SECURITY-AUDIT.md)).
- **Plan enforcement (recently hardened):** a central `plan-tier.ts` validator gates every subscription write path (checkout, webhooks, promo redeem, admin overrides), plus a server-side `plan-gate` middleware that enforces hub/tier on every module API — not just cosmetically in the sidebar.
- **Payments:** Paystack integration (init + verify + webhook), promo/partnership codes with per-code plan restriction, batch code generation, redeemer management and revoke.
- **Whole-farm modules:** flocks (11 species), crops + crop planner + harvests, production, feed, inventory, workers + attendance + tasks, breeding, vaccinations, sales, customers/credit, invoices, quotes, deliveries, profitability, documents, weather, audit.
- **Hardware/biometric (IoT foothold):** ZKTeco biometric device integration (fingerprint attendance) already exists in the backend.
- **AI:** a 297-line AI route + chat UI + task panel exist, **but `AI_API_KEY` is unset in production**, so AI is currently non-functional. V2 material, not V1.
- **Offline-first:** client offline queue, offline provider, sync status, and an offline page — a real differentiator, but see the caveat above.
- **Ops:** Next.js on Vercel + Express (PM2 cluster, 2 workers) on a VPS, nginx + TLS, MariaDB, health endpoint, audit logging, email pipeline, cron jobs (advisory digests, weekly, lifecycle), admin CRM panel, helpdesk.

### Infrastructure [measured on the VPS]
- PM2 cluster `wangari-api`, 2 workers **online**, 13 restarts lifetime (all during development).
- VPS: 913 MB RAM (424 used), 30 GB disk (46% used). Comfortable for ~1,000+ DAU; RAM is the first upgrade lever, not code.
- Paystack live key and SMTP both configured in production. `AI_API_KEY` **not** configured.

---

## 3. The honest SWOT

### Strengths (real)
- **Genuine whole-farm coverage** across 11 livestock species *and* crops — most Kenyan competitors are poultry-only. This is a real, defensible product position.
- **Offline-first, Swahili, WhatsApp, M-Pesa, KES** — the exact local stack, which English-first global tools get wrong.
- **Payment + partnership code system** is a distribution engine disguised as a billing feature — a genuine, working growth weapon.
- **30-day velocity, single founder** — a rare and fundable trait.
- **Zero known Critical security issues** (audited and fixed); server-side plan gating; comprehensive audit logs.

### Weaknesses (real, and deal-affecting)
- **No revenue, no customers, no growth.** The whole commercial case is hypothetical.
- **No tests whatsoever.** No test runner, no test files. This is the largest technical risk and a real discount factor for any acquirer or investor.
- **Single point of failure:** one founder, no bus factor. The project dies without Lewis.
- **AI advertised but not live** (no API key). Marketing pages promise an AI assistant that doesn't currently run — a promise/reality gap.
- **Offline sync unproven** in production data.
- **No team, no process, no documentation of business operations** (only technical docs exist so far).

### Opportunities (real)
- Kenya has ~10M+ smallholder farms; the market is enormous and the specific segment (whole-farm, offline, local-stack) is under-served.
- Partnerships with co-ops, SACCOs, agrovets and national associations (see [partnership-prospects.md](partnership-prospects.md)) can each bring hundreds of farmers.
- Government push behind **ANITRAC** digital livestock traceability makes a records system like Wangari strategically relevant and potentially integrable.
- V2 (AI/automation) and V3 (IoT/integrations) are credible because the data foundation (V1) already exists.

### Threats (real)
- **Resource competition:** global agritech and even local players with more capital.
- **Founder-burnout risk:** doing product, marketing, sales, ops, and support alone is unsustainable long-term.
- **One bad deployment or data incident** could destroy the brand before it has traction (small community, no margin for error).
- **Free-tool substitution:** farmers can keep using paper/WhatsApp — the status quo is free, so willingness-to-pay is unproven.

---

## 4. What the gaps are worth (the discount factors)

An honest valuation must subtract for what is missing. [assumption, but grounded in §2 measurements]

| Gap | Why it reduces value | Typical discount |
|---|---|---|
| **No tests** | Every change is a manual, risky deploy; an acquirer inherits an untestable codebase. Biggest technical red flag. | 20–35% |
| **Zero revenue** | No proof the business model works; buyer inherits an unvalidated market position. | Caps the whole valuation — see §5. |
| **No team / bus factor 1** | Key-person risk; the value is in *Lewis*, not the code alone. | Forces a founder-dependent structure, lower multiple. |
| **AI not live** | A marketed feature that doesn't run risks credibility; cheap to fix, but currently a gap. | Minor (cost of an API key) |
| **Offline sync unproven** | A key differentiator that isn't yet demonstrable at volume; a claim in a due-diligence meeting. | Minor–moderate until proven |
| **No business documentation** | Hard for a buyer to operate or raise on. Fixable in weeks. | Minor |

---

## 5. Valuation — the honest numbers

**How to value a pre-revenue company:** you cannot use a revenue multiple (there is no revenue). The defensible methods are (a) **cost-to-rebuild** (what the engineering would cost to recreate), and (b) **asset + option value** (code + IP + brand + founder, discounted heavily for no traction). Any number quoted above these is a *story*, not a valuation.

### Cost-to-rebuild [assumption grounded in measured LOC]
- 54,700 lines of production TypeScript + 48 data models + 13 migrations + full security audit + offline system.
- Kenyan market-rate senior dev: ~KES 250–400/hour [assumption]. Blended build rate across 30 days ≈ KES 500,000–1,200,000 to rebuild to this quality, **plus** 6–12 months of calendar time (which is usually worth more than the money for a solo founder).
- **Cost-to-rebuild: KES 500K–1.2M equivalent, or roughly KES 4–10M if you price the founder's calendar time at a normal salary. Call it KES 3–8M of sunk build value.**

### The three scenarios a buyer/investor would actually underwrite

| Scenario | Condition | Honest valuation range today | Notes |
|---|---|---|---|
| **A. Asset sale now** (sell the code/IP to an agtech, bank, or co-op) | Buyer wants Kenya smallholder distribution + a working codebase | **KES 2–6M** (≈ $15K–$45K) | Highly buyer-dependent. A big agtech might pay more for the *position* than the code. A small buyer may pay far less. |
| **B. Pre-seed investment** (raise capital against this + the plan) | Equity investment, not a purchase | **Pre-money KES 5–15M** for 10–25% | Only credible once there is *some* traction (partners, 100+ users, 1+ paying). Today an investor would ask "where's the proof?" — the answer is "not yet." |
| **C. Prove it, then it's worth 10–50× more** | 1,000 users, 50–150 paying, a signed partner, retention data | **KES 50–300M+** (revenue multiple) | THIS is the path worth walking. See below. |

### The honest conclusion on worth
- **Today, Wangari is worth roughly the effort you put in plus a modest premium: call it KES 2–6M as an asset, or nothing at all as a "business" with revenue.** A buyer today is buying a *very good foundation*, not a going concern.
- **The premium is entirely about optionality:** offline + Swahili + WhatsApp + M-Pesa + whole-farm (livestock *and* crops) is a combination no obvious Kenyan competitor has assembled. That combination, if it lands with farmers, is worth a great deal to an acquirer who would otherwise have to build it.
- **The honest path to real value is not selling now — it is Scenario C.** Even a rough proof (one cooperative partner, a few hundred farmers, first paying users) moves the number far more than any amount of polish. Selling now would be selling the foundation before the house is built.

**If you ever must sell now:** lead with cost-to-rebuild and the competitive positioning, not revenue. Be upfront about the tests gap, the bus-factor, and the unproven sync — a buyer who discovers those in due diligence loses trust; a buyer you told them up front negotiates from respect.

---

## 6. The three fixes that most raise the number (highest leverage, lowest cost)

These are the concrete moves that most increase valuation per shilling spent — and none need money:

1. **Add a real test suite** (even 30–50 tests over the money and permission paths: auth, plan-gate, promo redeem, profitability, offline sync). Removes the biggest discount factor and makes the product genuinely acquirable.
2. **Prove offline sync end-to-end** in production with real offline writes (the ledger is at 0 rows). The offline claim is a headline differentiator; it should be demonstrable.
3. **Get traction evidence on paper:** one signed partner, a cohort of real farmers, first paying users, and an "activation funnel" (signup → first record). Traction evidence is the single thing that moves valuation most per shilling.

---

## 7. What to tell people (the honest pitch, integrity-protected)

The founder's integrity is a compounding asset. Say the true version:

> *"I built Wangari — a whole-farm management platform for Kenyan smallholders — that's live, payment-integrated, and covers livestock and crops offline in Swahili. It has 9 users and zero revenue today, because I've spent this month building it properly and hardening it for scale, not chasing signups. What I have is a production-ready foundation with a defensible position — offline-first, M-Pesa, WhatsApp, whole-farm — that no obvious competitor has put together. I'm now going after partnerships to drive adoption. I'm not selling you traction I don't have; I'm showing you the engine and the plan to fill it."*

That answer wins more long-term money (partners, investors, acquirers) than any inflated claim, because everyone in the room can verify the product in five minutes, and they will respect not being pitched fiction.

---

## 8. Re-audit trigger

Re-run this audit (or have an agent re-run the metrics pull) **before** any sale, funding round, or investor conversation, and any time a milestone is hit (first 100 users, first paying cohort, first partner). The numbers here are a snapshot of **2 October 2026**; they will be wrong in a month, and that is fine — the point is the habit of measuring honestly.

---

*Figures marked [measured] were pulled from the production database and repository on 2 October 2026. Figures marked [assumption] are the founder's reasoning, not facts, and are labelled so they are never mistaken for data.*
