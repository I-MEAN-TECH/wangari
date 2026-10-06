"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/api-client";
import { getToken } from "@/lib/auth-client";

/**
 * The public feedback page — `/feedback`.
 *
 * This is the shareable link. It is deliberately **not** behind a login:
 * at the expo booth almost everyone who taps it is not a Wangari user yet,
 * and an account wall in front of the form would mean we only ever hear from
 * the handful of people already using the app — the sample least able to
 * explain why nobody else signs up.
 *
 * ## The design rules it obeys (module-plan.md §0.1)
 *
 * - **R1 no typing.** Every answer is a tap. The phone number at the end is
 *   optional and never blocks submission.
 * - **R2 icon and colour before words.** The rating is five faces; the label is
 *   a second layer. Colour means the same thing here as everywhere else in
 *   Wangari — green good, amber unsure, red bad.
 * - **R3 minimum taps.** Three taps is a complete response.
 * - **R5 Swahili first.** The English is a subtitle, not the headline.
 * - **R7 big targets.** Nothing is smaller than 64px.
 *
 * The vocabulary is fetched from the API rather than hardcoded, so the client
 * and the server cannot drift. When they drift, the failure is silent: a farmer
 * taps an icon and the server discards the key without telling anyone.
 */

type TagDef = { key: string; label: string; icon: string };
type RatingPoint = { value: number; icon: string; label: string; tone: "red" | "amber" | "green" };

type Instrument = {
  ratingScale: RatingPoint[];
  bestTags: TagDef[];
  improveTags: TagDef[];
  species: string[];
  audiences: TagDef[];
};

const TONE_CLASS: Record<string, string> = {
  red: "border-red-300 bg-red-50",
  amber: "border-amber-300 bg-amber-50",
  green: "border-emerald-300 bg-emerald-50",
};

const SPECIES_LABEL: Record<string, string> = {
  kuku: "Poultry",
  mifugo: "Livestock",
  mazao: "Crops",
  samaki: "Fish",
  nyuki: "Bees",
};

export default function FeedbackPage() {
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [rating, setRating] = useState<number | null>(null);
  const [audience, setAudience] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [best, setBest] = useState<string | null>(null);
  const [improve, setImprove] = useState<string[]>([]);
  const [species, setSpecies] = useState<string[]>([]);
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/feedback/instrument`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setInstrument)
      .catch(() => setLoadError(true));
  }, []);

  // Which link brought this person here.
  //
  // GAP 1 (reach) is the reason there are 9 users, and the difference between
  // "the product is wrong" and "nobody was told" is one number we were not
  // keeping. So the shareable link carries ?utm_source=&utm_medium=&utm_campaign=
  // and we forward it. A booth QR, a WhatsApp forward and the marketing site
  // then become three countable things instead of one anonymous total.
  //
  // Read once, at mount, from the live URL. Forwarded as three separate parts
  // because the server owns the sanitising — a URL is untrusted input and the
  // column is shared storage, not a scratchpad.
  const utm = useMemo(() => {
    if (typeof window === "undefined") return {};
    const p = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
      const v = p.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, []);

  // Are we answering as ourselves?
  //
  // A signed-in farmer already told us who they are, so asking again would be
  // an insult to someone holding a phone in the sun. When a token exists we
  // send it, the server attaches the farm and user, and the answer is filed as
  // `in_app` — which is the whole point of asking real users rather than only
  // counting whoever walks past a booth.
  //
  // Read in an effect, not during render: `getToken` touches localStorage, and
  // `token` stays null through the server-rendered pass so we never guess.
  useEffect(() => {
    try {
      setToken(getToken() ?? null);
    } catch {
      setToken(null);
    }
  }, []);

  const inApp = token !== null;
  // A signed-in user is a farmer; an anonymous one has to say so.
  const effectiveAudience = audience ?? (inApp ? "farmer" : null);

  const toggle = useCallback((list: string[], setList: (v: string[]) => void, key: string) => {
    setList(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }, []);

  const ready = rating !== null || best !== null || improve.length > 0;

  async function submit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source: inApp ? "in_app" : "public_link",
          audience: effectiveAudience,
          utm: Object.values(utm).join("|") || null,
          rating,
          best: best ? [best] : [],
          improve,
          species,
          phone: phone.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <Shell>
        <p className="text-lg font-bold text-red-700">
          Could not load the questions. Please try again.
        </p>
      </Shell>
    );
  }

  if (!instrument) {
    return (
      <Shell>
        <p className="text-lg font-bold text-gray-500">Inapakia…</p>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="text-center">
          <div className="text-6xl">🙏</div>
          <h1 className="mt-4 text-2xl font-black text-gray-900">Thank you!</h1>
          <p className="mt-2 text-base text-gray-600">
            Your feedback helps us make Wangari better for every farmer.
          </p>
        </div>
      </Shell>
    );
  }

  // Step 0 — who is answering.
  //
  // This gate exists because the link used to accept anyone. A simulation of
  // an investor did exactly what a real one would: filled in the farmer form,
  // rated it 1/5 and ticked every species. The number an investor reads off an
  // open link is *how many people answered*, so an unclassified respondent
  // inflates the one number this project refuses to inflate.
  //
  // It is one tap, it is optional in spirit ("Other" is a real answer), and
  // it is the only screen shown before the questions — R3 still holds at three
  // taps to a complete response.
  if (!effectiveAudience) {
    return (
      <Shell>
        <h1 className="text-2xl font-black text-gray-900">What are you?</h1>
        <p className="mt-1 text-sm text-gray-500">Which of these are you?</p>
        <div className="mt-6 grid gap-3">
          {instrument.audiences.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setAudience(option.key)}
              className="flex min-h-[72px] items-center gap-4 rounded-2xl border-2 border-gray-200 bg-white px-5 text-left transition active:scale-[0.98]"
            >
              <span className="text-3xl">{option.icon}</span>
              <span className="text-lg font-black text-gray-800">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-gray-400">
          This helps us understand how people use Wangari.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {audience && (
        <button
          type="button"
          onClick={() => setAudience(null)}
          className="mb-4 min-h-[56px] rounded-2xl border-2 border-gray-200 bg-white px-4 text-sm font-bold text-gray-600"
        >
          ← Change your answer
        </button>
      )}

      <h1 className="text-2xl font-black text-gray-900">How much does Wangari help you?</h1>
      <p className="mt-1 text-sm text-gray-500">Rate it on the scale below.</p>

      {/* 1 — rating */}
      <div className="mt-6 grid grid-cols-5 gap-2">
        {instrument.ratingScale.map((point) => (
          <button
            key={point.value}
            type="button"
            aria-label={point.label}
            aria-pressed={rating === point.value}
            onClick={() => setRating(point.value)}
            className={`min-h-[72px] rounded-2xl border-2 text-3xl transition ${
              rating === point.value
                ? "border-emerald-600 bg-emerald-100 scale-105"
                : `${TONE_CLASS[point.tone]} opacity-80`
            }`}
          >
            {point.icon}
          </button>
        ))}
      </div>
      {rating !== null && (
        <p className="mt-2 text-center text-sm font-bold text-gray-700">
          {instrument.ratingScale.find((p) => p.value === rating)?.label}
        </p>
      )}

      {/* 2 — the best thing, single tap */}
      <h2 className="mt-8 text-lg font-black text-gray-900">What works best for you?</h2>
      <p className="mt-1 text-sm text-gray-500">What is the best thing?</p>
      <div className="mt-4 grid gap-2">
        {instrument.bestTags.map((tag) => (
          <button
            key={tag.key}
            type="button"
            aria-pressed={best === tag.key}
            onClick={() => setBest(best === tag.key ? null : tag.key)}
            className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 text-left transition ${
              best === tag.key
                ? "border-emerald-600 bg-emerald-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <span className="text-2xl">{tag.icon}</span>
            <span className="text-base font-bold text-gray-800">{tag.label}</span>
          </button>
        ))}
      </div>

      {/* 3 — what should improve, multi tap */}
      <h2 className="mt-8 text-lg font-black text-gray-900">What should we improve?</h2>
      <p className="mt-1 text-sm text-gray-500">What should improve? (choose any)</p>
      <div className="mt-4 grid gap-2">
        {instrument.improveTags.map((tag) => (
          <button
            key={tag.key}
            type="button"
            aria-pressed={improve.includes(tag.key)}
            onClick={() => toggle(improve, setImprove, tag.key)}
            className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 text-left transition ${
              improve.includes(tag.key)
                ? "border-amber-500 bg-amber-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <span className="text-2xl">{tag.icon}</span>
            <span className="text-base font-bold text-gray-800">{tag.label}</span>
          </button>
        ))}
      </div>

      {/* 4 — segmentation, multi tap, optional */}
      <h2 className="mt-8 text-lg font-black text-gray-900">What do you keep or grow?</h2>
      <p className="mt-1 text-sm text-gray-500">What do you keep or grow?</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {instrument.species.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={species.includes(s)}
            onClick={() => toggle(species, setSpecies, s)}
            className={`min-h-[56px] rounded-full border-2 px-5 text-base font-bold transition ${
              species.includes(s)
                ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {SPECIES_LABEL[s] ?? s}
          </button>
        ))}
      </div>

      {/* 5 — optional phone. Never required; R1 says no typing as the primary path. */}
      <h2 className="mt-8 text-lg font-black text-gray-900">Phone number (optional)</h2>
      <p className="mt-1 text-sm text-gray-500">
        Optional — only if you would like us to call you back.
      </p>
      <input
        type="tel"
        inputMode="numeric"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="07…"
        className="mt-3 w-full min-h-[64px] rounded-2xl border-2 border-gray-200 px-4 text-lg font-bold"
      />

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>
      )}

      <button
        type="button"
        disabled={!ready || submitting}
        onClick={submit}
        className="mt-6 min-h-[72px] w-full rounded-2xl bg-emerald-600 text-xl font-black text-white disabled:bg-gray-300"
      >
        {submitting ? "Sending…" : "Send feedback"}
      </button>

      <p className="mt-4 text-center text-xs text-gray-400">
        Your answer is not shown to anyone else.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-gray-50 px-4 py-8">
      {children}
    </main>
  );
}
