# Wangari — Feedback Hypotheses (simulation, NOT user data)

> **Date:** 6 October 2026 · **Status:** speculation, used only to design the survey instrument.
>
> ## READ THIS FIRST
>
> **Nothing in this document is user feedback.** Every sentence below is
> speculation generated to decide *which questions to ask real people*. It must
> never be quoted, counted, averaged, or shown to an investor, a partner, or at
> AIAE as if a farmer said it.
>
> The project's first rule is **never inflate** ([vision.md](vision.md),
> [founder-guide.md](founder-guide.md)): *"9 users, 0 revenue. Say it calmly."*
> A simulated rating is exactly the kind of number that would be caught in
> thirty seconds by anyone who opens the app — and it would destroy the one
> asset we actually have, which is that our numbers are true.
>
> **How it was produced, stated plainly:** the intended tool was
> [MiroFish](https://github.com/666ghj/MiroFish), a multi-agent swarm
> simulation engine. The first draft of these hypotheses was written by hand,
> on the argument that MiroFish needed a paid LLM key plus a Zep Cloud key and
> would simulate thousands of agents against a free tier of roughly 50 requests
> per day ([AI-PROVIDER-SETUP.md](AI-PROVIDER-SETUP.md)).
>
> **Update, 6 October 2026: MiroFish has since been run for real**, and the
> panel's answers to this very instrument are in
> [mirofish-panel.md](mirofish-panel.md). That run killed **H1 and H2**, gave
> weak support to H3, and could not test H4. The conclusions below are retained
> because they are still the pre-registered guesses — but two of them are now
> known to be wrong, and the panel's version is the current one.

---

## 1. Who we are guessing about

Drawn from the segments the policy research already identified ([PHASED-PRODUCT-PLAN.md](PHASED-PRODUCT-PLAN.md) Part 2):
smallholder poultry, smallholder dairy, mixed crops, a co-op chairperson, an
agrovet, a feed dealer, a county livestock officer, and an investor.

## 2. What we think each would say — and the confidence

| Persona | Guessed "best thing" | Guessed "worst thing" | Confidence |
|---|---|---|---|
| Poultry smallholder | Counting eggs in 3 taps, offline | Wants to record a sale without doing it twice | **Medium** — 7 production days ever, so we have almost nothing to reason from |
| Dairy smallholder | Milk litres + the delivery statement ("what am I owed") | Co-op reconciliation still manual | **Low** — only 2 deliveries exist |
| Crop farmer | One place for coffee/tea/avocado, not just poultry | Wants per-acre numbers; we don't ask for acreage yet | **Medium** — real crop rows exist (coffee, tea, macadamia, avocado) |
| Co-op chairperson | Aggregate view, free sponsored accounts for members | Needs proof it works before rolling out to 700+ members | **Medium** |
| Agrovet | Brand on the sponsored code | Data on what their customers actually buy | **Low** |
| County officer | A farmer register their extension staff can verify | Needs a document they can accept, not a screen | **Medium** |
| Investor | Team speed and honest traction reporting | 9 users, 0 revenue, no tests, one founder | **High** — [valuation-audit.md](valuation-audit.md) already says this |

**The honest summary of this table: most of it is Medium confidence at best,
and the lowest-confidence rows are the ones about *what users think of the
app*. That is precisely the question we cannot answer by guessing — which is
why the survey exists.**

## 3. The three things guessing changes about the instrument

1. **Ask "best" and "improve" separately.** A single "rate us" question tells us
   nothing actionable. The pair is what produces a to-do list.
2. **Offer tags, never a text box.** Every persona above is a farmer who may not
   read fluently (module-plan §0.1 R1/R2). A rating screen with a typing box is a
   screen with no answers on it.
3. **Segment by what they keep.** A poultry answer and a dairy answer mean
   different things. One tap on species makes the difference legible.

## 4. The questions this produced

Deliberately five or fewer, tap-only, Swahili-first:

| # | Question (Swahili) | English | Type |
|---|---|---|---|
| 1 | Wangari inakusaidia kiasi gani? | How much does Wangari help you? | 5-point icon scale |
| 2 | Kitu kizuri zaidi ni kipi? | What is the best thing? | single tap |
| 3 | Kitu gani kiboreshwe? | What should improve? | multi tap |
| 4 | Unafuga au unapanda nini? | What do you keep or grow? | multi tap |
| 5 | *(public link only)* Namba ya simu — hiari | Phone number — optional | numeric keypad |

## 5. The falsifiable claims to check against real answers

Written down so that real data can prove this document wrong — which is its
only job:

- **H1:** the most-chosen "best thing" is *works offline*, not the AI advice.
- **H2:** the most-chosen "improve" is a **missing feature**, not speed or bugs.
- **H3:** at least a third of respondents choose **"I don't understand it"** or
  **"I need training"** — i.e. the problem is not the software.
- **H4:** a public, no-login link gets more responses than the in-app prompt,
  because most people at AIAE are not users yet.

If H3 holds, it confirms [gap-analysis.md](gap-analysis.md)'s ranking: adoption
and activation outrank every feature on the roadmap. If it fails, that is
genuinely useful and we should say so.

---

*This document designs a survey. It is not evidence. The evidence is the
`Feedback` table, after real people have filled it in.*

*MiroFish's simulated panel ([mirofish-panel.md](mirofish-panel.md)) is not
evidence either — it is the same model answering itself. Its one real output
was a defect in the public link, not a set of numbers.*
