# Wangari — Pricing, Packaging & Go-To-Market Strategy

> **Context:** Strategic review based on the *Marketing for Founders* playbook (EdoStra / Growth Unhinged / Lenny's Newsletter) applied to smallholder farm economics in Kenya and East Africa.

---

## 1. Executive Summary: The Pricing Mismatch

Wangari's technical foundation is production-ready (deliveries, quality deductions, inventory auto-restock, ANITRAC animal identity, and Action Engine alerts). However, the **monetization model** currently mirrors Western B2B SaaS conventions that create high friction for East African smallholders.

### Current Model
* **Starter:** KES 1,500/month (~$11.50) · KES 12,000/year (1 hub)
* **Growth:** KES 4,500/month (~$34.50) · KES 36,000/year (3 hubs)
* **Enterprise:** KES 12,000/month (~$92.00) (All hubs)
* **Trial:** 14-day hard cutoff (pay or lose access)

### The Smallholder Reality
1. **Net Income Scale:** A farmer with 150 layers or 3 cows clears KES 15,000 – KES 35,000 in monthly net profit. KES 1,500/mo is **5% to 10% of their net profit**.
2. **Mixed Farming Norm:** East African smallholders do not run single-commodity operations. They have 2 cows, 100 chickens, and a plot of sukuma wiki/maize. Gating by *"1 hub vs 3 hubs"* penalizes the typical smallholder and forces premature upgrades to KES 4,500/mo.
3. **Cashflow Cycles:** Smallholders do not operate on corporate monthly payrolls. Cash flows in **seasons** (broiler harvest: 8 weeks; crop harvest: 4 months; co-op milk check-off: monthly on the 15th).

---

## 2. Framework Insights (*Marketing for Founders*)

### A. The Reverse Trial (PLG Standard)
* **Western Trap:** 14-day hard-stop trial → farmer logs 2 batches → gets locked out → abandons app for paper notebook.
* **The Solution:**
  1. Day 1–14: Complete access to all **Growth** features (AI assistant, full Action Engine, PDF exports).
  2. Day 15: If unpaid, **gracefully downgrade** to **Wangari Free Core** (1 active flock/crop, basic income/expense ledger, read-only historical records).
  3. **Never delete or brick farmer records.** A free farmer still drives network effects, co-op verification, and word-of-mouth.

### B. Value Metric: Scale & Automation (Not "Hubs")
* Do not restrict *which* species they farm (mixed farming is survival for smallholders).
* Restrict **scale** (head count / volume) and **advanced business features**:
  * Free / Starter: Up to 300 birds / 4 cattle / 2 acres.
  * Growth: Unlimited capacity, multi-worker logins, official Co-op statement exports, AI agronomist.

### C. Value Anchoring (From WTF to WTP)
* Never sell "database software" or "mobile access".
* Anchor price against **avoided agricultural losses**:
  * 1 bag of spoiled or stolen feed = **KES 3,200**.
  * 1 disputed co-op check-off deduction = **KES 5,000 – 15,000**.
  * 1 untreated flock infection = **KES 30,000+**.
  * Wangari Starter (KES 50/day) costs **less than the price of one egg per day**.

---

## 3. Proposed Revised Pricing Architecture

```
┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
│     WANGARI CORE        │     WANGARI STARTER     │     WANGARI GROWTH      │
│         FREE            │    KES 950 / month      │    KES 2,900 / month    │
│    (Perpetual Free)     │  or KES 2,400 / season   │  or KES 7,500 / season   │
├─────────────────────────┼─────────────────────────┼─────────────────────────┤
│ • 1 flock + 1 plot      │ • Mixed farming (all)   │ • Unlimited livestock   │
│ • Daily diary / ledger  │ • Up to 500 birds/5 cows│ • Unlimited acreage     │
│ • Delivery logging      │ • Feed stockout alerts  │ • Full Action Engine AI │
│ • WhatsApp quick input  │ • Delivery payout clock │ • Co-op Statement PDF   │
│ • Basic offline store   │ • Basic break-even badge│ • Multi-worker access   │
│                         │ • M-Pesa Till / Paybill │ • Loan deduction audits │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

### Alternative: Flexible Seasonal Passes (M-Pesa First)
Farmers love paying per cycle without recurring card subscriptions:
* **Broiler / Pig Cycle Pass (60 days):** KES 1,200 via M-Pesa.
* **Crop Season Pass (4 months):** KES 2,800 via M-Pesa.
* **Annual Smallholder Pass:** KES 8,000/year (Save ~35%).

---

## 4. Copywriting & Landing Page Overhaul

### Headline & Value Proposition
* **Old:** *"Start free. Upgrade when you see results. Choose the plan that fits your farm."*
* **New:** **"Stop losing money to co-op errors, feed waste, and hidden debts."**
* **Subhead:** *"Track every litre, egg, and bag on your phone. Wangari catches payment shortfalls and feed run-outs before they eat your profit."*

### Pricing Badge Correction (Immediate Win)
* **Bug:** Currently states `"Save 17%"` on annual plans.
* **Math:** KES 1,500 × 12 = KES 18,000 vs KES 12,000 = **33.3% savings**.
* **Fix:** Change badge to **`Save 33% (Get 4 Months Free)`** — significantly more compelling.

### Daily Micro-Price Anchors
Add micro-copy below prices:
* **Starter:** *"Just KES 30/day — less than the price of a single egg."*
* **Growth:** *"Pays for itself by catching one co-op deduction error."*

---

## 5. Execution Roadmap

### Phase 1: Immediate Conversion Tweaks (1 Day)
1. Fix the annual savings badge copy from `17%` to `33% (4 Months Free)`.
2. Add daily micro-anchors (*"KES 50/day"*) beneath pricing cards.
3. Update hero headline on `/pricing` to lead with financial protection (loss prevention).

### Phase 2: Reverse Trial & Free Tier Soft Landing (1–2 Days)
1. Update trial expiration logic: on day 15, transition user status to `free_tier` instead of blocking UI.
2. Ensure existing records remain read-only/viewable, with upgrade prompts on premium actions (PDF export, AI assistant).

### Phase 3: Seasonal M-Pesa Billing (Next Sprint)
1. Add Paystack M-Pesa options for 60-day and 120-day fixed passes.
2. Add seasonal SMS reminders before cycle expiration.
