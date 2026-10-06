"use client";

import { motion } from "framer-motion";
import { WifiOff, ShieldCheck, Sprout, LineChart, Handshake } from "lucide-react";

/**
 * EarlyAccessPanel — replaces a testimonials slider that was entirely invented.
 *
 * ── What was here before, and why it went ───────────────────────────────────
 * A carousel of five farmer testimonials, each attributed to a named Kenyan
 * farmer with a real-sounding location and a specific flock size: "John Mwangi,
 * Poultry Farmer, Nakuru, 2,500 Layers"; "Peter Ochieng, Commercial Poultry,
 * Eldoret, 5,000 Broilers, our feed cost per bird dropped by 18% in the first
 * month". None of these people exist. Wangari has eleven users in total and has
 * never had a 5,000-bird broiler operation.
 *
 * One of them credited "the WhatsApp bot", which is also not built — /whatsapp
 * is still a Coming Soon page.
 *
 * This sat on the HOMEPAGE, which is the first thing an investor, a Ministry
 * official or a feed company sees. The whole pitch at AIAE rests on being
 * straight about where the product actually is — the field plan's own rule is
 * "never inflate; the honesty IS the pitch". A named farmer vouching for results
 * that never happened is the single claim most capable of ending that
 * conversation, and the easiest for a due-diligence reader to disprove.
 *
 * So there is no quote here, and no invented percentage. What replaces it is
 * what is actually true and actually differentiated — the offline promise, the
 * whole-farm coverage, the money in shillings, and an honest statement about
 * the stage the product is at. Every claim below is a property of the code, not
 * a story about a customer.
 *
 * When real farmers write real sentences, they go here.
 */

const FACTS = [
  {
    icon: WifiOff,
    title: "Works with no signal",
    body: "Record eggs, milk, feed and sales on the phone with no internet. Everything is queued on the device and syncs when the connection returns — replayed writes collapse onto the original, so a farmer is never counted twice.",
  },
  {
    icon: Sprout,
    title: "The whole farm, not one enterprise",
    body: "Poultry, dairy, cattle, goats, sheep, pigs, fish and bees alongside maize, vegetables, fruit and flowers. Most tools in this market cover a single enterprise; a mixed farm needs one book, not four.",
  },
  {
    icon: LineChart,
    title: "Profit in shillings",
    body: "The record is the point. Feed cost, labour and inputs against real production, shown as money — so a farmer learns what the farm actually earns instead of what they hoped it earned.",
  },
  {
    icon: Handshake,
    title: "Built with farmers, not for a slide",
    body: "Screens are icon-first and colour-coded, entry is tap-and-hold rather than typing, and it stays usable on a cheap handset with little storage and one thumb in the sun.",
  },
] as const;

export function EarlyAccessPanel() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {FACTS.map((f) => {
        const Icon = f.icon;
        return (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-wangari-green-200 bg-white p-7"
          >
            <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-wangari-green-100">
              <Icon className="h-5 w-5 text-wangari-green-800" aria-hidden />
            </div>
            <h3 className="mb-2 text-base font-extrabold text-wangari-heading">
              {f.title}
            </h3>
            <p className="text-sm leading-relaxed text-tone-neutral-text">{f.body}</p>
          </motion.div>
        );
      })}

      {/* Say the quiet part out loud. An investor who notices we did not invent
          a testimonial has learned something true about how this company is
          run — which is worth more than the quote would have been. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="sm:col-span-2 rounded-2xl border border-tone-warn-border bg-tone-warn-bg p-7"
      >
        <div className="flex items-start gap-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-tone-warn-text" aria-hidden />
          <div>
            <h3 className="mb-1.5 text-base font-extrabold text-wangari-amber-800">
              Where we honestly are
            </h3>
            <p className="text-sm leading-relaxed text-wangari-amber-800">
              Wangari is live and in early access with Kenyan farmers. We are
              early — a small number of users, no revenue yet, and the AI
              assistant is still being built. We have deliberately not filled this
              page with testimonials, because inventing them would have been the
              easiest thing to do and the first thing to cost us your trust. If
              you are a farmer running a real farm, we would rather earn a real
              sentence from you than print a fake one today.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default EarlyAccessPanel;
