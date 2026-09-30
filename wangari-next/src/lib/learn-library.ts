/**
 * Wangari Learn Library — the content layer for the in-app document library.
 *
 * Every learning resource is a first-class document on OUR platform (no
 * external redirects): farmers read inside the app, in a book-like reader.
 * Docs flagged `memberOnly` render as teasers on the public /learn page and
 * in full inside the dashboard — the "free taste, full library inside" play.
 *
 * `live` blocks are fetched fresh from live APIs at read time (weather from
 * Open-Meteo, news from the farm-advisory RSS pipeline) so documents update
 * with time — a guide read today shows this season's data.
 */

export interface DocSection {
  heading: string;
  /** Simple paragraph text, or `list:` prefixed lines separated by \n */
  body: string;
}

export interface LearnDoc {
  slug: string;
  title: string;
  emoji: string;
  category: "growing-guide" | "farm-type" | "rights" | "official" | "business";
  /** short summary for cards */
  summary: string;
  memberOnly: boolean;
  readMinutes: number;
  updatedAt: string;
  source: string;
  /** section slugs of live blocks to inject (weather, news) */
  live?: ("weather" | "news")[];
  sections: DocSection[];
}

export const LEARN_DOCS: LearnDoc[] = [
  // ───────────────────────── GROWING GUIDES ─────────────────────────
  {
    slug: "maize",
    title: "Maize — Kenya's Staple Cash Crop",
    emoji: "🌽",
    category: "growing-guide",
    summary: "Varieties, spacing, top-dressing timing, aflatoxin-safe storage and market windows.",
    memberOnly: false,
    readMinutes: 6,
    updatedAt: "2026-09-10",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "Why maize pays", body: "Maize is Kenya's staple — demand never disappears, and the National Cereals and Produce Board (NCPB) buys at set prices in good seasons. A well-managed acre under hybrid seed can yield 25–35 bags of 90kg; poorly managed, fewer than 10. The difference is almost never the seed — it is timing." },
      { heading: "Choose the right variety", body: "list:Highlands (Kitale, Nandi, Uasin Gishu): H614, H628 — long season, high yield.\nMid-altitude (Central, Rift lower zones): H513, H520 — 120–135 days.\nDrylands (Eastern, Machakos, Kitui): Katumani Composite, DH02 — drought-escape, 90–110 days.\nCoastal belt: PH1, PH4 — tolerant of coastal humidity.\nAlways buy certified seed from a registered agrovet — fake seed is the #1 silent yield killer." },
      { heading: "Land preparation & planting", body: "list:Plough at the first rains, harrow to a fine tilth.\nSpacing: 75cm between rows × 25cm between holes, one seed per hole (2 for Katumani, thin later).\nDepth: 2–3cm in moist soil; slightly deeper in sandy soils.\nPlant within the first 2 weeks of the rains — every week of delay costs measurable yield.\nBasal fertilizer (DAP/NPK 10-26-10): one teaspoon per hole, mixed with soil so seed never touches fertilizer directly." },
      { heading: "Top-dressing — the money moment", body: "Top-dress with CAN when maize is knee-high (about 4–6 weeks after emergence), and again at tasseling for long-season varieties. Right before or right after a rain, never onto dry ground. One 50kg bag of CAN per acre is the common rate. Miss this window and no later input recovers the yield." },
      { heading: "Weeding & pests", body: "list:Weed twice: 3 weeks after emergence and 6 weeks — competition in these windows is what cuts yields.\nFall armyworm: scout leaf whorls weekly for 'window pane' damage and wet frass. Act at the first sign — hand-pick larvae in small plots, or use recommended pesticides at dusk when larvae feed.\nStalk borer: crop residue destruction after harvest breaks its cycle." },
      { heading: "Harvest & safe storage (aflatoxin)", body: "Harvest when husks are dry and black layer forms at the kernel base. Dry on cobs to 13% moisture before shelling — storing wet maize causes aflatoxin, which can make an entire shipment (or family) sick. Treat with approved storage insecticide, use hermetic bags (PICS/ZeroFly) where possible, and keep cobs off the ground." },
      { heading: "Selling smart", body: "Prices crash at peak harvest and climb in the dry months. If storage is safe, holding 2–3 months after harvest often earns 30–60% more. Log your harvest in Wangari and the cost-per-bag calculator shows your true break-even before you sell." },
    ],
  },
  {
    slug: "beans",
    title: "Beans — the Fast Rotation Cash Crop",
    emoji: "🫘",
    category: "growing-guide",
    summary: "Varieties per season, intercropping with maize, rust management and harvest timing.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-10",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    sections: [
      { heading: "Why beans", body: "Beans mature in 65–90 days, fix nitrogen for the next crop, and sell steadily all year. For most smallholders they are the shortest cash cycle on the farm." },
      { heading: "Varieties that win", body: "list:Long rains: Rosecoco, Wairimu (Mwitemania) — higher yield, 75–90 days.\nShort rains: KK8, KK22, KAT B1 — 60–70 days, escape the rains' end.\nDry areas: KAT X56, KAT X69 — drought tolerant.\nCertified seed pays: beans from the open market carry rust and halo blight into your shamba." },
      { heading: "Planting", body: "45cm rows × 15cm, two seeds per hole, 2–5cm deep. In maize intercropping, plant beans in the same hole as maize or in alternate rows — the maize becomes a living trellis for climbing types." },
      { heading: "Disease watch", body: "list:Bean rust: orange-brown pustules under leaves — widest plant spacing and avoiding evening irrigation reduce it; spray a recommended fungicide at first sign.\nHalo blight: water-soaked spots — use certified seed, rotate out of beans for 2 seasons.\nAphids: vector viruses — scout young plants; neem-based sprays work early." },
      { heading: "Harvest before the shatter", body: "Harvest when 80% of pods are dry and yellow. Waiting for 100% loses seed to shattering — losses start fast at this stage. Dry on tarpaulins, never on bare soil, and thresh gently to avoid bruising (bruised beans discount at the market)." },
    ],
  },
  {
    slug: "tomatoes",
    title: "Tomatoes — High Value, High Attention",
    emoji: "🍅",
    category: "growing-guide",
    summary: "Staking, watering discipline, blight prevention and grading for the best prices.",
    memberOnly: false,
    readMinutes: 6,
    updatedAt: "2026-09-10",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The opportunity and the trap", body: "Tomatoes can return more per acre than almost any common crop — and lose everything to blight in one humid week. The winners are farmers who prevent, not react." },
      { heading: "Varieties", body: "list:Open field determinate: Anna F1, Rio Grande, Cal-J — 75–90 days.\nGreenhouse indeterminate: Tylka F1, Prostar — longer harvest window, staked training.\nCoastal/humid areas: choose late-blight tolerant lines (e.g. Kilele F1)." },
      { heading: "Planting & staking", body: "Nursery for 4–6 weeks, then transplant at 60cm × 60cm. Stake at transplanting — staking later breaks roots. Prune suckers weekly and remove the lowest leaves to keep airflow under the canopy." },
      { heading: "Watering discipline", body: "Consistent water 2–3× per week. Irregular watering cracks fruit and invites blossom-end rot. Drip with mulch is the single biggest quality upgrade you can make. Water the soil, never the leaves — wet leaves are how blight travels." },
      { heading: "Blight — prevent, don't react", body: "High humidity for 3+ days means late blight risk. Spray preventively before humid spells (not after symptoms). Check the live weather panel on this page — a humid week ahead is your spray signal. Remove and burn infected plants; never compost them." },
      { heading: "Grading and selling", body: "Grade into Fancy / Standard / Reject at harvest. Fancy-grade alone often earns 40–60% more than the mixed crate buyers expect to bargain down. Harvest in the early morning, keep crates in shade, and sell the same day if you can — tomatoes wait for no one." },
    ],
  },
  {
    slug: "kales",
    title: "Kales (Sukuma Wiki) — the Weekly Income Crop",
    emoji: "🥬",
    category: "growing-guide",
    summary: "Continuous picking, diamondback moth scouting and the nursery-to-bed system.",
    memberOnly: false,
    readMinutes: 4,
    updatedAt: "2026-09-10",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    sections: [
      { heading: "Why every farm grows them", body: "Sukuma wiki is Kenya's weekly-cash vegetable: first picking 60–75 days after transplant, then every week for 3+ months from the same plants. It smooths income between big-crop harvests." },
      { heading: "The nursery system", body: "Sow in a shaded nursery bed, water daily, and transplant at 4–6 weeks with 4–5 true leaves. Stagger a new nursery every month and you never run out of picking beds." },
      { heading: "Spacing & feeding", body: "45cm × 30cm in the bed. Feed with well-rotted manure at planting and top-dress with CAN every 3 weeks — kales are hungry, and pale leaves mean the market sees it too. Mulch heavily to hold moisture between watering." },
      { heading: "Pick low, pick few", body: "Pick only the 2–3 lowest leaves per plant per week, letting the crown keep producing. Ripping a plant bare gives you one good bunch and then nothing." },
      { heading: "The #1 pest", body: "Diamondback moth — scout the leaf undersides weekly for small green larvae and holes. Spraying works best early; rotate active ingredients so resistance doesn't build. A row of onions or coriander between beds helps confuse the moths." },
    ],
  },
  {
    slug: "potatoes",
    title: "Irish Potatoes — Highlands Gold",
    emoji: "🥔",
    category: "growing-guide",
    summary: "Certified seed, hilling, late blight prevention and storage that avoids greening.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-10",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    sections: [
      { heading: "Know your zones", body: "Potatoes thrive at altitude — Nyandarua, Elgeyo Marakwet, Meru highlands, Nandi. An acre of Shangi can produce 80–120 bags of 50kg under good management; a blight-hit crop can produce nothing." },
      { heading: "Certified seed or nothing", body: "Farm-saved seed degenerates with viruses every season. Certified seed (from KALRO-licensed multipliers) costs more and returns multiples. Plant whole egg-sized tubers — cut seed carries rot into wet soil." },
      { heading: "Planting & hilling", body: "75cm rows × 30cm, 10–15cm deep. Hill soil around plants twice: at 15cm height and again 3 weeks later — exposed tubers turn green and toxic, and hilled plants set more tubers." },
      { heading: "Late blight — the killer", body: "Cool, humid highland weather is exactly what late blight wants. Preventive fungicide before humid spells is the only reliable strategy; once lesions show, sprays only slow it. Never plant near tomatoes — they share the disease." },
      { heading: "Harvest & storage", body: "Harvest when vines yellow and die back, 90–120 days. Cure in a dark, ventilated shed for 10–14 days so skins harden. Store in darkness with airflow — light turns potatoes green (solanine) and warm stores sprout them. Never wash before storage." },
    ],
  },
  {
    slug: "green-grams",
    title: "Green Grams (Ndengu) — the Short-Rains Cash Crop",
    emoji: "🌱",
    category: "growing-guide",
    summary: "Drought-tolerant, low-input and priced at premium — the perfect second-season crop.",
    memberOnly: false,
    readMinutes: 4,
    updatedAt: "2026-09-10",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    sections: [
      { heading: "Built for the short rains", body: "Ndengu mature in 75–90 days on 300–400mm of rain — exactly what the October–December season offers. Low input, nitrogen-fixing, and selling at KES 120–200/kg, they are the smart short-rains bet in semi-arid areas." },
      { heading: "Varieties", body: "list:KAT N1, KAT N2 — early maturing, drought tolerant (the standard for Eastern/Kenya).\nK26/8 — traditional, aromatic, fetches a premium in local markets.\nN26 — larger seed, popular for export-grade produce." },
      { heading: "Planting & care", body: "45cm × 15cm, one to two seeds per hole. Minimal inputs: a light DAP dose at planting and one weeding at 3 weeks usually suffices. Over-fertilizing gives you leaves, not pods." },
      { heading: "Harvest & the premium trick", body: "Harvest when 80% of pods turn black — pick in two rounds rather than uprooting. The premium trick: clean, unbroken, single-variety lots graded free of stones sell to traders at the top of the range. Log your production cost in Wangari before selling — ndengu margins reward farmers who know their numbers." },
    ],
  },

  // ───────────────────────── FARM-TYPE HUBS ─────────────────────────
  {
    slug: "poultry",
    title: "Poultry Farming — Kienyeji & Layers",
    emoji: "🐔",
    category: "farm-type",
    summary: "Vaccination calendar, kienyeji economics, feed cost control and egg grading.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-12",
    source: "KALRO Non-Ruminant Institute & leading Kenyan practitioners",
    sections: [
      { heading: "Kienyeji vs layers — pick a lane", body: "Kienyeji (improved indigenous) sells at KES 500–900 per bird and eggs at KES 15–25 — slower growth, premium prices, lower input. Layers produce 280+ eggs per hen per year at industrial feed cost. Mixing the two models without a plan is the most common way beginners lose money." },
      { heading: "The vaccination calendar (copy this)", body: "list:Day 1: Marek's (hatchery).\nDay 7: Newcastle + IB (eye drop or water).\nDay 14: Gumboro (drinking water).\nDay 21: Gumboro booster.\nDay 28: Newcastle booster (LaSota, water).\nWeek 8: Fowl pox (wing web).\nWeek 16: Newcastle + IB + EDS booster before lay.\nNever vaccinate sick birds, and finish a vaccine course within 2 hours of mixing in water." },
      { heading: "Feed is 65–70% of your cost", body: "Chick mash (0–8 weeks), growers mash (9–18 weeks), layers mash (from lay). Mixing your own with a tested formulation can cut feed cost 20–30% — but only with correctly weighed ingredients; guessing formulation is worse than buying commercial. Log every feed purchase in Wangari and the cost-per-egg number tells you if your mix is actually saving money." },
      { heading: "Housing that pays", body: "list:3 birds per m² for layers, 4 for kienyeji.\nEast–west orientation, half-walls with wire mesh on the breeze side.\n1 nest box per 4 hens, 8cm of clean dry litter, turned weekly.\nWaterers on wire stands so litter stays dry — wet litter breeds coccidiosis." },
      { heading: "Egg economics", body: "Graded, clean eggs earn more: collect 3× daily, wipe (never wash) before storage, grade by weight if selling to shops. Track lay rate weekly — a drop below 70% in healthy-looking birds means feed, water or stress needs investigating. Wangari's production log graphs the lay rate automatically." },
    ],
  },
  {
    slug: "dairy",
    title: "Dairy Farming — Feeding for Yield",
    emoji: "🐄",
    category: "farm-type",
    summary: "Dry-matter feeding, calving management, mastitis prevention and milk recording.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-12",
    source: "KALRO Dairy Research Institute practices, Kenya",
    sections: [
      { heading: "The yield formula", body: "A cow gives milk from what you feed her, not from her breed alone. Rule of thumb: a 300kg Friesian cross producing 20L/day needs roughly 3% of bodyweight in dry matter, plus 1kg of dairy meal per 1.5–2L above 7L. Underfeeding dairy meal is why 'my cow is a good breed but gives 8L'." },
      { heading: "Feeding program", body: "list:Baseline: 50–70kg of quality forage per day (Napier, Boma Rhodes) — chop it, don't graze zero-grazed cows on long grass.\nConcentrate: scale with yield as above, split morning/evening.\nMineral block or lick available at all times — silent phosphorus deficiency wrecks fertility.\nClean water 60–80L/day; a milking cow drinking dirty water is a mastitis case waiting to happen." },
      { heading: "The calving calendar", body: "Gestation is ~283 days. Dry the cow off 60 days before calving — every day of missed dry period costs the next lactation. Log the insemination date in Wangari and the calving countdown and dry-off reminders generate themselves. Prepare the maternity pen 2 weeks early: clean bedding, iodine for the navel, colostrum within 6 hours of birth." },
      { heading: "Mastitis prevention", body: "list:Wash and dry the udder before milking — one cloth per cow, never shared.\nStrip into a cup to check for clots before full milking.\nTeat-dip after every milking.\nMilk withers first (young, clean cows), oldest cows last, mastitis cows separately and last.\nCull chronic cases — they cost more than they give." },
      { heading: "Records are the profit map", body: "Milk weights per cow per day reveal the truth: which cows pay for their feed and which coast. Log daily in Wangari, and the per-cow production trends identify your culls and your champions." },
    ],
  },
  {
    slug: "avocado-macadamia",
    title: "Avocado & Macadamia — Perennial Cash Trees",
    emoji: "🥑",
    category: "farm-type",
    summary: "Hass spacing, grafting, export-grade harvest rules and contract caution.",
    memberOnly: false,
    readMinutes: 6,
    updatedAt: "2026-09-12",
    source: "KALRO horticulture guides & export-industry practice",
    sections: [
      { heading: "Hass avocado — the export standard", body: "Hass bears from year 3–4, peaks from year 7, and exports pay multiples of local prices. Spacing 6m × 6m (about 100 trees per acre for Hass; Fuerte tolerates 7m × 7m). Buy grafted certified seedlings — never seedlings of unknown origin." },
      { heading: "Young tree care (years 1–3)", body: "list:Water 2–3× per week for the first two dry seasons — most young-tree deaths are drought deaths.\nMulch generously; avocado roots are shallow and hate exposure.\nTrain a single strong leader, remove branches below 1m.\nTop-dress with CAN from year 1 (light), increasing as canopy grows.\nRemove any fruit set in years 1–2 — let the tree build structure first." },
      { heading: "Harvest the export way", body: "Hass is ready when the fruit's stem-end skin turns yellowish and fruit reach 220g+ — maturity is dry-matter based, not color. Cut the stem with secateurs leaving a button; a fruit without its stem is rejected at the packhouse. Pick dry, deliver within 24 hours." },
      { heading: "Macadamia", body: "Spacing 8m × 8m, first nuts year 4–5, full bearing year 8–10. Kirinyaga and Embu lead production. Grafted varieties (Kirinyaga, Meru selections) out-yield ungrafted massively. Nuts are ready when husks split; dry to 10% moisture in-shell before selling." },
      { heading: "Contracts — read before you sign", body: "Exporters often offer contract buying. A fair contract states the price basis (per kg, minimum grade), the weighing method on-site, payment window, and who pays transport. Anything less leaves you exposed — read the 'Know your contract rights' document in this library before signing." },
    ],
  },
  {
    slug: "legumes",
    title: "Legumes & Pulses — Soil Builders That Pay",
    emoji: "🫘",
    category: "farm-type",
    summary: "Cowpeas, pigeon peas, soybeans: dryland options that fix nitrogen and sell.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-12",
    source: "KALRO & dryland farming practice, Kenya",
    sections: [
      { heading: "Why legumes belong in every rotation", body: "Legumes fix 30–100kg of nitrogen per hectare — free fertilizer for the maize that follows. They also open dryland markets: cowpeas and pigeon peas thrive where maize fails." },
      { heading: "Cowpeas", body: "list:Dual purpose: leaves (kunde) for the vegetable market, grain for dry sales.\n60cm × 20cm, thrives on 300mm of rain.\nFirst leaf picking 40 days, grain 70–90 days.\nAphids are the main enemy — scout seedlings weekly." },
      { heading: "Pigeon peas", body: "list:Deep-rooted — survives droughts that kill everything else.\nPlant with the long rains, harvest after 6–9 months (perennial varieties give a second season).\nIntercrops beautifully with maize and sorghum.\nMargins: low input, and market demand in Eastern Kenya is constant." },
      { heading: "Soybeans", body: "list:Needs the longer growing season — plant with the long rains.\nInoculate seed with rhizobium (cheap at agrovets) — uninoculated soybean on new land fixes little nitrogen.\nValue-add: processing into soya pieces/beans oil multiplies the price — a real agribusiness angle.\nRotates perfectly ahead of maize." },
    ],
  },

  // ───────────────────────── RIGHTS / CIVIC ─────────────────────────
  {
    slug: "contract-rights",
    title: "Know Your Contract Rights",
    emoji: "📜",
    category: "rights",
    summary: "What a fair produce contract must include — and what you can refuse.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-12",
    source: "Plain-language summary of Kenyan contract practice",
    sections: [
      { heading: "You already have rights", body: "Most smallholders sign produce contracts (avocado, macadamia, French beans, honey) without reading them, assuming the buyer's paper is standard and final. It is not. A contract is negotiable before you sign, and the law of contract protects you after." },
      { heading: "What a fair contract must state", body: "list:Price basis: per kg, per grade, and whether the price is fixed or pegged to a published reference.\nWeighing: weighed on-site, in your presence, with your right to witness the scale reading.\nGrading: objective, stated criteria — not 'quality acceptable to buyer'.\nPayment: a specific date or window (e.g. 7 days after delivery), not 'upon sale'.\nTransport: who provides and who pays.\nDeductions: every allowable deduction listed — anything else is an unlawful charge." },
      { heading: "What you can refuse", body: "You cannot legally be forced to sell at 'gate price' if your contract states otherwise. Vague oral promises about bonuses have no weight — get every promise written. If a buyer changes terms after delivery, that is a breach; keep your delivery notes (the Wangari documents vault works) and demand written confirmation of any change." },
      { heading: "Before you sign — the 5-point check", body: "list:1. Is the price or price formula written?\n2. Is the payment date written?\n3. Do you keep a signed copy?\n4. Is there a clause letting the buyer change terms unilaterally? Ask for it removed.\n5. Dispute resolution: county agriculture office or cooperative mediation is a legitimate, cheap first step." },
    ],
  },
  {
    slug: "subsidies",
    title: "Subsidies & Programs Checklist",
    emoji: "🏛️",
    category: "rights",
    summary: "E-voucher, KCEP-CRAL, NCPB and county programs — what you're entitled to and how to ask.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-12",
    source: "Public program information, Kenya",
    sections: [
      { heading: "These programs are free — they only reach farmers who ask", body: "Billions of shillings of agricultural support go unclaimed every season because farmers don't know the programs exist or where to walk in. This checklist is your starting script." },
      { heading: "National programs", body: "list:KCEP-CRAL (Kenya Cereal Enhancement Programme): free/subsidized certified seed and fertilizer for smallholders in target counties — ask at your county agriculture office before planting season.\nE-voucher input subsidy: register with your ward agricultural officer; redeemed at participating agrovets at reduced cost.\nNCPB: buys maize at set prices in declared seasons — registered farmers with proper records are prioritized.\nAFLATOxin / quality programs: free testing at some county depots before sale." },
      { heading: "County programs", body: "list:Free training days and field days — every county agriculture office runs them, word-of-mouth is the only advertising.\nSubsidized breeding services (AI), chick distribution and seedling programs in many counties.\nBursaries and agri-youth funds for young farmers.\nWalk in with your ID and farm records — counties prioritize farmers who can show production. Your Wangari records are exactly that proof." },
      { heading: "Cooperatives", body: "A registered co-op unlocks shared transport, better prices, credit and exporter access. Registration needs 10+ members through the County Co-operative Officer. See the 'Cooperatives' document in this library." },
    ],
  },
  {
    slug: "land-agreements",
    title: "Land & Written Agreements",
    emoji: "📝",
    category: "rights",
    summary: "Title vs lease, why a written shamba agreement protects both sides, succession basics.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-12",
    source: "Plain-language summary of Kenyan land practice",
    sections: [
      { heading: "Written or it didn't happen", body: "In Kenyan land practice, a verbal agreement is legal but nearly impossible to prove. Whether you lease out or lease in, a one-page written agreement signed by both sides (with a witness) prevents the disputes that destroy neighbor relationships and investment." },
      { heading: "What a shamba lease must say", body: "list:Parties: full names and ID numbers.\nThe land: parcel number (title deed or allotment number) and boundaries.\nRent and payment schedule.\nDuration: seasons or years, with renewal terms.\nWhat may be planted: perennial trees (avocado, macadamia) outlive leases — state who owns trees planted during the lease.\nNotice period for ending early.\nBoth signatures + one witness each." },
      { heading: "Title vs lease — know what you hold", body: "list:Title deed: absolute ownership — verify it at the lands registry before any purchase; fake titles exist.\nLeasehold: ownership for a term (state the expiry!).\nAllotment letters and customary holdings: weaker — get agreements in writing and keep every payment receipt.\nSuccession: land without a written will goes through succession courts — expensive and slow for your family. A simple written will costs little and saves years." },
    ],
  },
  {
    slug: "cooperatives",
    title: "Cooperatives — Strength in Numbers",
    emoji: "🤝",
    category: "rights",
    summary: "What a co-op gives you, how to register one, and how to avoid the bad ones.",
    memberOnly: false,
    readMinutes: 4,
    updatedAt: "2026-09-12",
    source: "Plain-language summary of Kenyan co-operative practice",
    sections: [
      { heading: "Why co-ops matter", body: "A registered co-op gives smallholders shared transport (costs split), collective bargaining (exporters and processors pay better for volume), credit access, and a voice in county decisions. The dairy and coffee success stories in Kenya are almost all co-op stories." },
      { heading: "How to register", body: "list:10+ members with a common interest (one crop, one area).\nDraft simple by-laws (the County Co-operative Officer has templates).\nRegister through the County Co-operative Office — costs are modest.\nFirst annual meeting elects a committee; minutes matter for compliance." },
      { heading: "Choosing an existing co-op — the warning signs", body: "list:Delayed payments with no written explanation.\nNo published accounts or annual meeting minutes.\nCommittee members who have been in office far beyond the by-law term.\nDeductions you can't see explained.\nA healthy co-op publishes its prices, pays on a stated schedule, and welcomes member questions." },
    ],
  },

  // ───────────────────────── FARM TYPE GUIDES (livestock additions) ─────────────────────────
  {
    slug: "goats-sheep",
    title: "Goats & Sheep — the Fast-Multiplying Herd",
    emoji: "🐐",
    category: "farm-type",
    summary: "Breeds that pay, housing, feeding, breeding cycles, and selling into meat festivals.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-30",
    source: "KALRO, Kenya Veterinary Board & market data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "Why small stock pays", body: "Goats and sheep multiply faster than cattle, eat less, tolerate poorer land, and sell year-round. A Boer goat kid sells at KES 4,000–8,000; a Galla wether during Eid or Christmas peaks can clear KES 10,000+. Start with 5–10 does and one quality buck — the buck decides the value of every kid." },
      { heading: "Breeds that win in Kenya", body: "list:Meat goats: Boer (fast growth, 80–130kg mature), Galla (hardy, ASAL-adapted), Small East African (low input).\nDairy goats: Saanen and Alpine (2–3L milk/day; milk sells at KES 80–120/L to processors like Limuru Dairy).\nSheep: Dorper (meat, hardy), Red Maasai (worm-resistant — gold in humid zones), Blackhead Persian.\nCross local females with a pure-breed buck: hardiness of the mother, market value of the sire." },
      { heading: "Housing & feeding", body: "Goats hate wet floors — build a raised, slatted-floor house (1.5–2m² per animal) and it will pay for itself in fewer disease losses. Feed: browse + hay base, 200–400g concentrate per head per day for meat animals, more for dairy goats. Clean water daily. Plant desmodium, calliandra or mulberry as protein banks." },
      { heading: "Health calendar", body: "list:Deworm every 3 months (rotate drugs — resistance is real).\nVaccinate: CCPP (yearly), PPR (yearly), anthrax/blackquarter per vet advice.\nTrim hooves at every deworming; foot rot is the silent herd-killer in wet seasons.\nIsolate every new animal for 3 weeks before mixing with the herd." },
      { heading: "Breeding for profit", body: "Does kid from 8–12 months; gestation is ~150 days (sheep ~147). With good management expect 3 kiddings in 2 years. Keep records of every kidding — Wangari's breeding module tracks dates, sires and kid weights so you cull the unproductive, not the familiar." },
      { heading: "Selling strategy", body: "Prices peak at religious and cultural festivals: Easter, Christmas, Eid (ram sales), and end-year ceremonies. Plan matings so kids mature 2–3 months before these windows. Sell through brokers at the gate for speed, but a market day 30km away can earn 20–40% more. Grade and weight your animals — buyers pay per kg for uniform lots, per glance for mixed ones." },
    ],
  },
  {
    slug: "pigs",
    title: "Pigs — the Fastest Feed-to-Money Conversion",
    emoji: "🐖",
    category: "farm-type",
    summary: "ASF biosecurity, feeding economics, farrowing management and slaughterhouse contracts.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-30",
    source: "KALRO, pork processors & vet data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The economics", body: "A sow farrows 8–14 piglets per litter, 2+ litters a year. Finishers reach 90–110kg in 6–7 months and sell at KES 380–500/kg live weight to processors (Farmers Choice, AAK contract buyers) or butcheries. The single biggest risk is African Swine Fever — no vaccine, no cure, ~100% mortality in an outbreak. Biosecurity is the whole business." },
      { heading: "Breeds", body: "list:Large White & Landrace: the commercial standard, 10–14 piglets/sow.\nDuroc: hardy, good in hotter zones, excellent terminal sire.\nCrossbreds (Large White × Landrace sows × Duroc boar): the smallholder sweet spot — hybrid vigour in growth and litter size." },
      { heading: "Feeding — where the profit lives", body: "Feed is 70%+ of pig costs. Commercial finisher feed is KES 3,800–4,500 per 50kg bag; a pig eats ~250–300kg to slaughter. Cut costs with formulated rations: maize bran, pollard, sunflower cake, fish meal and a premix — a formulation balanced on-farm can cost 25–35% less than bagged feed. Never feed swill/kitchen waste (illegal and the classic ASF pathway) unless it is boiled by law." },
      { heading: "Farrowing management", body: "Move the sow to a farrowing pen 1 week before due date (114 days gestation). Piglets need warmth (heat lamp or bedding), iron injection at day 3, and creep feed from week 2. Fostering (moving piglets between sows) evens out litters — more weaned piglets per sow per year is the whole game." },
      { heading: "Biosecurity — non-negotiable", body: "list:No visitors inside the pig unit; one set of boots per unit.\nQuarantine new stock 30 days.\nFence out wild pigs; control ticks (ASF vectors).\nDispose of dead pigs by deep burial or burning — never sell or eat.\nBuy feed from ASF-free suppliers; store it rodent-proof." },
      { heading: "Selling", body: "Contract to processors for stable prices and scheduled pickups; they weigh and grade (lean %, backfat). Local butcheries pay cash but haggle hard. Time finishing to December and Easter peaks. Keep every record — processors increasingly demand farm records for traceability, and Wangari gives you them for free." },
    ],
  },
  {
    slug: "rabbits",
    title: "Rabbits — the Pocket-Size Livestock",
    emoji: "🐇",
    category: "farm-type",
    summary: "Low-capital meat farming: breeds, hutches, feeding, and the hospital/canteen market.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-30",
    source: "KALRO & rabbit market data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "Why rabbits", body: "Start with 3 does + 1 buck for under KES 3,000. A doe can kindle 6–10 kits every 2–3 months; dressed meat sells at KES 450–700/kg to hospitals, canteens and health-food buyers (rabbit meat is lean and doctor-recommended). It's the lowest-risk livestock to learn record-keeping with." },
      { heading: "Breeds & housing", body: "New Zealand White and California White are the meat standards (4–5kg mature). Wire cages 60×60×45cm per adult, dry and shaded — rabbits die of heat stress faster than cold. Keep cages off the ground (no damp, no predators) and clean weekly." },
      { heading: "Feeding cheaply", body: "Pellets (50–100g/day per adult) + free greens: arrowroot leaves, sweet potato vines, kale waste, desmodium. Introduce any new green gradually — rabbits' guts are sensitive. Water always available. Never feed moldy anything." },
      { heading: "Breeding cycle", body: "Kindle (give birth) at 31 days' gestation. Mate the doe 3 weeks after kindling for ~5 litters/year. Wean at 6–8 weeks; slaughter weight (2.5–3kg) at 3–4 months. Don't over-breed — a worn-out doe produces weak litters." },
      { heading: "Health & selling", body: "Watch for coccidiosis (scouring in weaners — keep floors dry), mange (ears/feet — treat with ivermectin), and pasteurellosis (sneezing — cull chronic carriers). Sell live to individual buyers at KES 400–800, or aggregate with neighbours for canteen contracts. slaughter-ready weight is what buyers pay for — record growth weekly and sell at the peak, not a week late." },
    ],
  },
  {
    slug: "fish-farming",
    title: "Fish Farming — Ponds that Pay",
    emoji: "🐟",
    category: "farm-type",
    summary: "Tilapia and catfish in Kenya: pond setup, water quality, feeding, harvest and market.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-30",
    source: "KMFRI, KALRO & aquaculture market data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The economics", body: "A well-run 300m² pond can produce 500–900kg of tilapia per 6–8 month cycle at KES 300–500/kg — roughly KES 150,000–400,000 gross per cycle. The difference between profit and a muddy hole is water quality and feed discipline." },
      { heading: "Species", body: "list:Nile tilapia: the workhorse — fast growth, sells everywhere.\nCatfish: hardy, high-density tolerant, grows faster on cheap feed; sells well live.\nTrout: premium prices (KES 600–900/kg) but needs cold, clean, flowing water — highland rivers only.\nMono-sex (male) tilapia fingerlings grow faster and evenly — buy from a certified hatchery." },
      { heading: "Pond setup", body: "Site on a gentle slope with reliable water (spring, river or borehole — 10–15L/min for a medium pond). Size 200–500m², depth 0.9–1.2m. Inlet and outlet screens. Fill, fertilize (manure or DAP) to grow natural algae, then stock 3–5 fish/m² (more with aeration)." },
      { heading: "Water quality — the invisible profit factor", body: "list:Dissolved oxygen above 3mg/L — fish gasping at dawn means fertilize less, feed less, or aerate.\nChange 10–20% of water weekly in intensively fed ponds.\nSecchi disc clarity 30–40cm: too clear = little natural food; too murky = risk of collapse.\nAmmonia spikes after overfeeding — the #1 beginner killer. Feed what fish finish in 15–20 minutes, twice a day." },
      { heading: "Feeding & harvest", body: "Use floating pellets (28–32% protein for tilapia) — watching fish feed is your daily health check. From fingerling (10g) to 300–400g plate size takes 6–8 months in warm areas. Partial harvesting (selling bigger fish, restocking) smooths cash flow. Net at dawn when oxygen is high and temperatures cool." },
      { heading: "Selling", body: "Fresh tilapia sells to hotels, restaurants, lake-side traders and roadside fish joints; whole gutted fish is the standard form. Value addition multiplies margins: filleting, smoking, or filling. Keep harvest records per pond — feed conversion and survival rate tell you which ponds actually make money." },
    ],
  },
  {
    slug: "beekeeping",
    title: "Beekeeping — Honey Without Land",
    emoji: "🐝",
    category: "farm-type",
    summary: "Hives, siting, harvest seasons, honey grades and the KES 1,000/kg market.",
    memberOnly: false,
    readMinutes: 6,
    updatedAt: "2026-09-30",
    source: "National Beekeeping Station & honey market data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The economics", body: "A Langstroth hive costs KES 4,500–6,500; a Kenya Top Bar hive KES 2,500–3,500. Well-sited and managed, each hive yields 15–30kg of honey a year; raw honey sells at KES 600–1,200/kg retail and less in bulk to processors. Twenty hives can out-earn an acre of maize with almost no land and a few hours of work a month." },
      { heading: "Hive types", body: "list:Langstroth: removable frames, highest yields, easier inspections — the commercial choice.\nKenya Top Bar (KTBH): cheaper, simpler, yields slightly less; popular with smallholders.\nTraditional log hives: lowest yield and hardest to harvest cleanly — upgrade gradually.\nBees: the African honey bee (Apis mellifera scutellata) is aggressive but productive; never buy 'calm' imports that can't handle local conditions." },
      { heading: "Siting — 80% of success", body: "Place hives 1.5m off the ground, facing east, shaded from afternoon sun, near water and within 2–3km of forage (acacia, eucalyptus, cropland, wildflowers). Away from houses, paths, livestock and pesticide-sprayed fields — one careless flower spray can kill a colony. Put a apiary fence or brush screen so bees fly high over people." },
      { heading: "Management calendar", body: "list:Inspect every 2–3 weeks in the active season: colony strength, queen presence, brood pattern, stores.\nSwarm season (rainy transitions): add supers/frames before congestion — a crowded hive swarms and you lose half the workforce.\nDry seasons: provide water; consider feeding 1:1 sugar syrup only if the colony is starving.\nHarvest only capped honey — uncapped ferments." },
      { heading: "Harvesting & quality", body: "Harvest in the dry honey-flow seasons (often Feb–Mar and Jul–Sep depending on region), morning or evening when bees are calm. Use protective gear, a bee brush and a cool knife; never squeeze or overheat comb honey. Raw honey is graded by moisture (<19% is export grade) and clarity — Wangari's records let you log yield per hive per season and find your best sites." },
      { heading: "Selling", body: "Crystallize your identity: labelled 250g/500g jars of raw honey to health shops, chemists, schools and corporates earn 2–3× the bulk price. Honey refiners (e.g. local brands) buy in bulk but grade hard. Propolis, beeswax and pollination services (renting hives to orchards — including avocado farms) are three extra income streams most beekeepers ignore." },
    ],
  },

  // ───────────────────────── CROP GUIDES (additions) ─────────────────────────
  {
    slug: "onions",
    title: "Onions — the High-Turnover Bulb Cash Crop",
    emoji: "🧅",
    category: "growing-guide",
    summary: "Varieties, transplanting, disease control, curing and the storage-price game.",
    memberOnly: false,
    readMinutes: 6,
    updatedAt: "2026-09-30",
    source: "KALRO & Infonet-Biovision, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "Why onions", body: "Onions are Kenya's most consistent vegetable cash crop — every household, every day. A well-managed acre yields 8–15 tonnes; at KES 30–70/kg farm gate, gross revenue runs KES 240,000–700,000+ per acre in 4–5 months. Prices swing hard with supply: plant so your harvest misses the glut (everyone harvests Jan–Mar)." },
      { heading: "Varieties", body: "list:Red Creole & Red Pinoy: the market-standard red onions, 90–120 days, good storage.\nJambar F1 & Red Coach F1: hybrid vigour, larger bulbs, higher yield — worth the seed cost.\nWhite/sweet types (e.g. Texas Grano): niche premium but poor storage — sell fast.\nBuy certified seed, never seed from a previous bulb crop (disease carryover)." },
      { heading: "Nursery & transplanting", body: "Raise seedlings in a nursery for 6–8 weeks (1g seed per m² of nursery bed). Transplant at pencil thickness, 10cm × 20cm spacing (tighter = smaller bulbs but more of them). Onions are shallow-rooted: they need constant moisture and zero weed competition — weeds steal more onion yield than any pest." },
      { heading: "Feeding & water", body: "Basal: well-rotted manure + DAP at transplanting. Top-dress CAN at 3 and 6 weeks after transplanting. Stop nitrogen late — excess N late = thick necks that won't cure and rot in store. Drip or furrow irrigation; overhead watering in the evening invites purple blotch and downy mildew." },
      { heading: "Disease & pest watch", body: "list:Purple blotch: purple-centred lesions with yellow halo — preventative fungicide sprays in humid weeks, rotate actives.\nDowny mildew: exactly as the name says — avoid overhead irrigation, ensure airflow.\nThrips: silver streaks on leaves — blue sticky traps + spinosad sprays; they explode in dry spells.\nOnion flies: rotate away from alliums; never plant after un-composted manure." },
      { heading: "Curing & storage — the money multiplier", body: "Cure bulbs 10–14 days in the field (tops down, shaded, airflow) until necks are tight and skins papery. Properly cured Red Creole stores 3–5 months; storing until the price peak (Apr–Jun most years) can double your revenue versus selling at harvest. Store in a ventilated shed on slatted shelves — never in bags on a concrete floor." },
    ],
  },
  {
    slug: "watermelon",
    title: "Watermelon — the 90-Day Cash Explosion",
    emoji: "🍉",
    category: "growing-guide",
    summary: "Fast-cycle horticulture: varieties, spacing, pollination, and timing the market window.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-30",
    source: "KALRO & seed company data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The economics", body: "Watermelon: seed to cash in 80–95 days. An acre carries 2,500–3,000 plants; at 2 fruits per plant × KES 60–150 per fruit farm gate, an acre can gross KES 300,000–700,000 in a single cycle. The catch: everyone knows it, so harvest timing decides everything — hit the market when trucks are scarce." },
      { heading: "Varieties", body: "list:Sukari F1 (Asahi): the market favourite — sweet, 8–12kg, widely traded.\nCrimson Sweet: open-pollinated, cheaper seed, reliable.\nCharleston Grey: large, good for long transport.\nSeedless hybrids: premium price but need a pollinizer variety and more skill — start conventional." },
      { heading: "Planting", body: "Direct-seed or transplant after frost danger, when soil is 20°C+. Spacing 1.5–2m between rows × 60–90cm in-row (or 3m × 1m for vigorous hybrids). Make holes 30cm apart with compost; 2 seeds per hole, thin to 1. In hot lowlands (Kajiado, Machakos, coast) you can do 2–3 cycles a year with irrigation." },
      { heading: "Water — precision matters", body: "Water deeply but infrequently (1–2×/week) until fruit set, then cut back as fruits ripen: too much water late = watery, tasteless melons that split. Drip irrigation under mulch is ideal — it keeps leaves dry (powdery mildew) and fruit off wet soil (gummy stem blight)." },
      { heading: "Pollination & fruit set", body: "Watermelons need bees — one hive per 2 acres measurably improves fruit set. Hand-pollinate in screened/high-tunnel setups (male flower into female flower, morning only). Females have a small swelling behind the petals; males don't. Poor pollination = misshapen, hollow fruit." },
      { heading: "Harvest & selling", body: "Ripe when: the tendril nearest the fruit dries, the ground spot turns butter-yellow, and a thump sounds hollow — not greenish and ping-y. Cut with 5cm of stem; stem-rot tells buyers it's old. Sell on-farm to pick-up traders for speed or aggregate to market for 20–50% more. Grade by size (8–12kg is the sweet spot buyers want) and never stack more than 3 deep — internal bruising shows at the buyer's end, not yours." },
    ],
  },
  {
    slug: "mango",
    title: "Mango — the Long-Term Orchard Play",
    emoji: "🥭",
    category: "growing-guide",
    summary: "Varieties, orchard establishment, fruit fly control and export vs local markets.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-30",
    source: "KALRO & horticulture data, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The economics", body: "Grafted mangoes bear from year 3–4, peak at year 8–15 with 500–1,000+ fruit per tree. At KES 15–40 per fruit farm gate (export grade much more), a mature acre of 70–100 trees can gross KES 400,000–1,000,000 a year. It's a plant-once, harvest-for-decades asset — but only if you control fruit flies and pick at the right maturity." },
      { heading: "Varieties", body: "list:Apple (Ngowe): the coast favourite, export-grade, sweet, fibreless.\nTommy Atkins & Kent: the international trade standard — red-blush, ships well.\nKeitt: late-season (Nov–Feb) — fills the off-season price window.\nLocal/Kienyeji: fibrous, strong flavour, dominates local markets — lowest price but zero inputs.\nPlant 3–4 varieties (early/mid/late season) to spread both risk and labour." },
      { heading: "Establishing the orchard", body: "Buy certified grafted seedlings (KES 150–300). Spacing 8m × 8m (or 6m × 6m for high-density with pruning). Dig 60cm³ holes, mix topsoil with 20kg manure + 250g DSP. Plant at the onset of rains, graft union 15cm above soil. Water weekly for the first 2 years; intercrop with beans/kales while trees mature." },
      { heading: "Fruit fly — the export killer", body: "Fruit flies (Bactrocera dorsalis, Ceratitis) make fruit unmarketable and get consignments rejected. The proven programme: MAT (male annihilation) traps + protein-bait spot sprays + orchard sanitation (collect and bury fallen fruit weekly). Bagging individual fruits is the gold standard for export blocks. Start the programme 6–8 weeks before harvest — after the flies sting, it's too late." },
      { heading: "Canopy & nutrition", body: "Prune after harvest: open the centre, remove water shoots and low branches. Feed with manure + NPK twice a year; potassium and calcium matter most for fruit quality (leaf analysis if you can). Don't over-irrigate before flowering — a dry stress period helps induce bloom in dry zones." },
      { heading: "Harvesting & markets", body: "Harvest at half-mature (shoulders filled, lenticels dotted) for export, tree-ripe for local premium sales. Cut with 2–3cm stalk — sap burn from broken stalks downgrades fruit instantly (de-sap upside-down first). Local markets absorb any grade; export requires KEPHIS registration, packhouse grading, hot-water treatment for some markets and GlobalGAP for the EU. Value addition: dried mango (solar dryers pay back in one season) and juice processors buy rejected/outgrade fruit by the tonne." },
    ],
  },
  {
    slug: "passion-fruit",
    title: "Passion Fruit — the Premium Vine",
    emoji: "🟣",
    category: "growing-guide",
    summary: "High-value vines: varieties, trellising, woodiness virus management and processor markets.",
    memberOnly: false,
    readMinutes: 6,
    updatedAt: "2026-09-30",
    source: "KALRO & KEPHIS guidance, adapted for Kenya",
    live: ["weather"],
    sections: [
      { heading: "The economics", body: "Passion fruit is the most valuable common vine in Kenya: mature vines (year 2 onward) yield 8–15 tonnes/acre at KES 70–250/kg — a mature acre can gross KES 700,000–1,500,000. Processing plants (juice concentrate for export) buy by contract and grade. The vine's weakness: it's disease-prone, so site choice and certified clean seedlings are everything." },
      { heading: "Varieties", body: "list:Purple passion (KPF-4, KPF-11): the export/processing standard — aromatic, deep-purple, high juice.\nYellow passion (KPF-8): more vigorous, disease-tolerant, slightly lower juice quality; better in hot low-mid zones.\nSweet granadilla: niche, premium fresh-fruit price.\nAlways grafted onto yellow rootstock (fusarium & nematode resistance) — never plant on its own roots." },
      { heading: "Establishing", body: "Spacing 3m × 2m in rows, with a strong trellis (posts 2.5m, 2–3 wires). Dig 45cm³ holes with manure + TSP. Plant certified disease-free seedlings from KEPHIS-inspected nurseries (KES 80–150 each) at the onset of rains. Train a single leader up to the wire, then pinch and spread 4 arms along it." },
      { heading: "The woodiness problem", body: "Woodiness virus (thick, hard, deformed fruit) is spread by aphids and infected tools/seedlings — it has destroyed whole valleys' passion blocks. Defence: certified clean seedlings, weed control (alternate hosts), control aphids early, and rogue out infected plants immediately. Plan a vine replacement cycle (3–5 years) — an old vine is a virus reservoir." },
      { heading: "Feeding, watering & harvest", body: "Heavy feeder and heavy drinker: manure + CAN top-dressings every 2–3 months, drip or regular watering (irregular water = fruit drop). Fruit matures 70–90 days after pollination — harvest fallen fruit daily for processing grade, or pick at full colour for fresh market. Handle gently; bruised fruit rejects fast." },
      { heading: "Selling", body: "Juice processors (e.g. local concentrate plants) contract by the tonne and grade on brix and blemishes — a contract removes price gambling. Fresh market: Nairobi and upcountry greengrocers pay more for uniform purple fruit but volumes are small. Dried fruit slices and passion powder are emerging premium channels. Record your yields per vine — Wangari's crop records make it obvious which block pays and which vine is a passenger." },
    ],
  },

  // ───────────────────────── BUSINESS & MONEY (financing, selling, records) ─────────────────────────
  {
    slug: "farm-financing",
    title: "Farm Financing — SACCOs, Loans & Grants Explained",
    emoji: "💰",
    category: "business",
    summary: "Every funding route for Kenyan farmers: SACCO loans, bank products, AFC, grants — with realistic interest rates.",
    memberOnly: false,
    readMinutes: 9,
    updatedAt: "2026-09-30",
    source: "SASRA, CBK, KCB/Co-op/Absa product sheets & SACCO market data, adapted for Kenya",
    sections: [
      { heading: "The funding map", body: "Kenyan farmers finance their farms through five routes: SACCOs (member-owned, cheapest credit), commercial banks (fastest large sums), the Agricultural Finance Corporation (AFC, state-owned), microfinance institutions (M-Farm-style input credit), and grants/donor programmes (free but competitive). The cheapest money is almost always a SACCO you've saved with for 6+ months." },
      { heading: "SACCO loans — the farmer's first choice", body: "list:How they work: you save shares for ~6 months, then borrow up to 2–3× your savings against them.\nInterest: typically 10–14% per annum on a reducing balance (vs 14–18%+ at banks), plus small processing fees.\nExamples: Stima SACCO, Kenya Farmers Association SACCO, county crop SACCOs (dairy, coffee, tea).\nBonus: dividends on shares (often 8–12%/year) partly offset the interest you pay.\nWatch: borrowing against shares means a default eats your savings — never over-borrow." },
      { heading: "Bank products worth knowing", body: "list:KCB Agribusiness: dairy herd loans (up to 24 months repayment), dairy installation loans (36 months).\nCo-op Bank Agribusiness: dairy farm-input finance (feed, fertilizer, drugs, AI), crop finance.\nAbsa & Equity: seasonal input credit and asset finance for greenhouses, irrigation and boda-based collection.\nTypical bank agri rates 2025–2026: roughly 13–18% p.a. reducing balance after the CBK rate cuts; negotiate — collateral matters more than story." },
      { heading: "AFC & state-backed finance", body: "The Agricultural Finance Corporation lends for land development, machinery, livestock and seasonal inputs, historically at concessional rates. It now channels much of its book through SACCOs and aggregators (wholesale model) — so your co-op is often the door. County governments also run subsidized input and tractor programmes each season; visit the county agriculture office at budget time, not planting time." },
      { heading: "Grants & programmes actually open", body: "list:KCDF, Ford Foundation, One Acre Fund (input packages on credit), MESPT (green value chains).\nDevelopment lenders: Kenya Development Corporation (KDC) sector loans; AgDevCo for larger commercial farms.\nDonor challenges (aGRF, FAO-run calls) — competitive but real; they require a registered group and a bank/SACCO account.\nNever pay a 'facilitator' to access a grant — genuine programmes publish calls publicly." },
      { heading: "How to be loan-ready", body: "list:Keep 6+ months of written farm records (Wangari does this automatically) — lenders now ask for yield and income data.\nSave steadily in a SACCO even a small amount; track record matters more than amount.\nKnow your numbers: cost per bag/litre/tray and break-even price — the Credit Manager's first question.\nInsure what the loan buys (livestock, greenhouse, machinery) — premium is 4–7% of value and it's usually mandatory.\nBorrow against a season's cash flow, not against hope: milk pays monthly, crops pay once." },
      { heading: "The interest-rate reality check", body: "A KES 300,000 loan at 12% p.a. reducing balance over 12 months costs about KES 327,000 total (KES 27,250/month). At 18% it's about KES 334,000. The 6-point difference is KES 7,000 — real money, but smaller than the profit you lose missing a planting or stocking window. Borrow for productive assets (a cow, drip line, seed), never for consumption — that rule alone keeps most farmers solvent." },
    ],
  },
  {
    slug: "selling-strategy",
    title: "Selling Smart — Markets, Prices & Getting Paid",
    emoji: "📈",
    category: "business",
    summary: "Where to sell, how to grade, price timing, brokers vs contracts, and never getting cheated again.",
    memberOnly: false,
    readMinutes: 8,
    updatedAt: "2026-09-30",
    source: "KAMIS/Kilimo market data & trader practice, adapted for Kenya",
    sections: [
      { heading: "Know your true cost first", body: "Before any sale, know your break-even: total costs ÷ kg/litres/trays produced. Wangari's records give you this automatically. A farmer who knows his maize costs KES 38/bag-kg equivalent can walk away from a KES 35 offer without blinking — and hold for the KES 50 that's coming. A farmer who doesn't know, accepts anything. That difference is the whole business." },
      { heading: "The market channels ladder", body: "list:1. Farm gate to broker: zero effort, lowest price (10–40% below market). Use when you must move perishables fast.\n2. Local market day: better prices, transport cost, your labour — good for graded lots.\n3. Aggregators & processors: contracted tonnage, stable price, quality standards — the backbone for avocado, passion, milk.\n4. Cooperatives: collective bargaining + dividends + inputs on credit. The single best upgrade for most smallholders.\n5. Direct/digital: FMK-style platforms, WhatsApp groups, corporate buyers — highest margin, most hustle." },
      { heading: "Grading is free money", body: "Buyers pay for uniformity. Sort into 2–3 grades before you sell; the top grade alone often earns 30–60% more than the mixed crate, and the small grade still sells rather than dragging the whole lot down. Weigh in front of the buyer, in daylight, on your own scale if you can. Never sell produce you haven't counted — 'trust me' is a losing negotiating position." },
      { heading: "Price timing", body: "Prices crash at the main harvest glut and climb in the off/lean months (maize: plant-time highs; onions: Apr–Jun; eggs: festive peaks; milk: dry-season highs). Check the KAMIS (Kilimo) market price portal weekly — it publishes wholesale prices by market. Storage is a bet: only hold if you can store without loss (hermetic bags, cold room, curing) and you know your cost of waiting." },
      { heading: "Contracts & middlemen — reading the fine print", body: "A good contract names: price or price formula, grading standard, collection point and schedule, payment date and method, and what happens on rejection. Beware: verbal promises, 'free inputs' that lock you to a low price, deductions discovered at delivery. Get every agreement in writing, even on WhatsApp — a dated message is evidence. Co-ops spread risk: their contract is reviewed by many, not just you." },
      { heading: "Getting paid — protect the cash", body: "list:Prefer M-Pesa on delivery over 'end of week' promises — mobile payment is traceable and instant.\nFor bulk buyers, agree payment terms in writing and invoice every delivery (Wangari's invoice module).\nNever let a single buyer owe you more than you can lose — split deliveries across 2 buyers if possible.\nKeep receipts of everything you sell; tax compliance (and loan applications) start here.\nReinvest a fixed % of every sale into the next season's inputs before the money is 'eaten' — the farms that grow are the ones that pre-fund their next cycle." },
    ],
  },
  {
    slug: "record-keeping",
    title: "Record Keeping — the Farmer's Superpower",
    emoji: "📓",
    category: "business",
    summary: "Why the farmers who write things down earn more — and how Wangari does the work for you.",
    memberOnly: false,
    readMinutes: 5,
    updatedAt: "2026-09-30",
    source: "Wangari team, adapted from KALRO farm management guidance",
    sections: [
      { heading: "What records actually earn you", body: "list:Sell better: know your break-even before the broker names a price.\nBorrow easier: 6 months of records = a credit file lenders trust.\nLose less: spot a failing flock/block 3 weeks earlier than your neighbour.\nComply faster: KEPHIS, dairy quality payments, GlobalGAP — all are records-based.\nDecide smarter: which hen lays, which vine pays, which cow eats more than she produces." },
      { heading: "The five records that matter", body: "list:1. Production: eggs/day, litres/day, kg harvested (per group/block/pond/hive).\n2. Inputs: seed, feed, fertilizer, drugs — what, when, how much, cost.\n3. Sales: quantity, price, buyer, payment date.\n4. Health & treatments: vaccination dates, drug withdrawals (PHI!) before sale.\n5. Money in/out: the line between a farm and a hobby.\nWangari's modules capture all five as you work — no extra paperwork at day's end." },
      { heading: "The withdrawal-period discipline", body: "Record every drug or spray date. Milk and eggs have legal withholding periods after treatment; vegetables have a Pre-Harvest Interval (PHI) after spraying. Selling inside the window risks rejected consignments, sick customers and a banned farm. The system flags PHI automatically when you log treatments against a crop — trust the flag." },
      { heading: "From records to decisions", body: "Once 2–3 seasons are in the system, the questions answer themselves: Which group has the best feed conversion? Did the new feed actually raise yield per shilling of feed? Is the Jersey or the Friesian more profitable at your milk price? A farm that measures improves; a farm that guesses hopes. You already carry the tool — open the dashboard each evening for 3 minutes." },
    ],
  },
  {
    slug: "value-addition",
    title: "Value Addition — Turning Produce into Products",
    emoji: "🏭",
    category: "business",
    summary: "Processing that pays: milk→yoghurt, fruit→oil/juice, honey→jars, with licensing basics.",
    memberOnly: false,
    readMinutes: 7,
    updatedAt: "2026-09-30",
    source: "Kenya Dairy Board, AFA-HCD & processor case studies, adapted for Kenya",
    sections: [
      { heading: "Why process at all", body: "The price ladder is real: raw milk KES 40–50/L → yoghurt KES 120–180/L equivalent; raw avocado KES 30–60/kg → oil KES 1,500–2,500/L; bulk honey KES 400–600/kg → branded jar KES 1,000–1,500. Processing captures the margin that middlemen live on. But it adds cost, skill and licensing — start small, prove demand, then scale." },
      { heading: "Milk → yoghurt & cheese", body: "Yoghurt is the classic smallholder value-add: pasteurize (63°C/30min or 72°C/15sec), cool, inoculate with culture, incubate 6–8hrs, chill, package. A Laikipia farmer lifted his milk from KES 40 to KES 160/L equivalent this way. Cheese: 10L milk → 1kg wheel that sells at KES 700–1,000. You need a KDB mini-dairy licence, county health clearance and cold chain discipline — start with yoghurt, it's the most forgiving." },
      { heading: "Fruit → oil, juice & dried", body: "list:Avocado oil: 4–7kg fruit → 1L oil; cold-pressed oil sells to cosmetic and food buyers at premium prices; even one electric press (15–20L/hr) can anchor a group business.\nPassion/mango pulp: processors buy pulp by the tonne — a solar or LPG pulper plus deep-freeze buys you time to negotiate.\nDried mango/pineapple: solar dryers (KES 30,000–80,000) turn rejects into a product with months of shelf life.\nHoney: bulk → labelled jars is the simplest and most profitable first step in all of agri-processing." },
      { heading: "Licensing — the short version", body: "list:Milk handling/processing: Kenya Dairy Board (mini-dairy/processor licence) + county single business permit + public health.\nGeneral food processing: KEBS permits, county health inspection, food-handler medical certificates.\nSelling processed goods: KRA PIN, business registration (or run it through your co-op), labelling rules (ingredients, dates, your contacts).\nStart legal from day one — it's cheaper than being shut down with stock in the store." },
      { heading: "Group processing — the realistic model", body: "One farmer rarely has the volume for a processor; a group of 20–50 often does. Cooperatives or self-help groups can share a press, pasteurizer or cold room, employ one operator, and sell under one brand. The Vihiga avocado-oil group (300 farmers) and dozens of dairy co-ops prove the model. Wangari's multi-farm records make group accounting transparent — which is what keeps the group together." },
    ],
  },
];
export const CATEGORIES = [
  { id: "growing-guide", label: "Growing Guides", emoji: "🌱" },
  { id: "farm-type", label: "Farming Types", emoji: "🐔" },
  { id: "business", label: "Business & Money", emoji: "💰" },
  { id: "rights", label: "Your Rights", emoji: "📜" },
] as const;

export function getDoc(slug: string): LearnDoc | undefined {
  return LEARN_DOCS.find((d) => d.slug === slug);
}

export function docsByCategory(cat: string): LearnDoc[] {
  return LEARN_DOCS.filter((d) => d.category === cat);
}
