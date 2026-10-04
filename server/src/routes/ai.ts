import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { AI_PROVIDERS, getProvider, type AIProviderConfig } from "../ai-providers.js";import { searchWeb, searchConfigured, searchTierLabel } from "../lib/web-search.js";
import { nextRetryWait } from "../lib/rate-limit-window.js";

const router = Router();
router.use(authMiddleware, requireOwner);

// ─── Provider Configuration ───────────────────────────────
// UnoRouter by default: one OpenAI-compatible endpoint, one key, and a model
// that has passed the two-step agentic probe (see lib/agentic-probe.ts). The
// model is PINNED, never discovered - the free tier allows one request a
// minute, and a rotating roster would spend that on probes instead of on
// farmers. Before pointing AI_MODEL at anything else, probe it first.
const AI_PROVIDER = process.env.AI_PROVIDER || "unorouter";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_BASE_URL = process.env.AI_BASE_URL || "";
const AI_MODEL = process.env.AI_MODEL || "";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

// Hard ceiling on agent turns per request. An LLM asked to "do anything" will
// happily loop; this bounds wall-clock time, DB load and spend for one farmer.
const MAX_AGENT_STEPS = Number(process.env.AI_MAX_STEPS || 8);

/**
 * Waiting out a provider's per-minute rate limit.
 *
 * This exists for providers whose free tier meters REQUESTS rather than
 * tokens - UnoRouter allows one a minute, account-wide - where step 2 of an
 * ordinary farm job would otherwise fail while step 1 had already written the
 * record.
 *
 * It used to be a fixed [12s, 25s, 30s]. Measured live that cost 84 seconds
 * for a one-tool question, because 67 of them were spent firing into a
 * window the provider had already told us was shut. These four numbers say
 * what we actually know: how long the window is, how many times we will
 * retry, and the two ends of the sleep. The wait itself is computed in
 * lib/rate-limit-window.ts from when the last call was accepted.
 *
 * The ceiling is deliberately under nginx's 120s proxy_read_timeout on this
 * route. Past it the farmer watches a connection die with no word, which is
 * worse than being told the wait was too long.
 */
/**
 * Research calls allowed in ONE farmer turn.
 *
 * Two, not one, because a good lookup is usually a second one: the first
 * finds the price list, the second finds the date on it. Three was measured
 * costing 198 seconds, and the third added nothing the first two did not.
 */
const SEARCHES_PER_TURN = Number(process.env.AI_SEARCHES_PER_TURN || 2);
const RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_RETRIES = Number(process.env.AI_RATE_LIMIT_MAX_RETRIES || 2);
const RATE_LIMIT_MAX_WAIT_MS = Number(process.env.AI_RATE_LIMIT_MAX_WAIT_MS || 90_000);

/**
 * When this key last got a 200. Module-level on purpose: the limit is on the
 * KEY, not the request, so a second farmer asking at the same moment is
 * waiting on the same minute and must be told about the same minute.
 */
let lastAcceptedCallAt: number | null = null;

// An undo stack, keyed by farm, holding the last N reversible tool calls so a
// farmer can reverse a misheard instruction (see docs: "undo over confirm").
const UNDO_LIMIT = 20;
const undoStacks = new Map<number, Array<{ undoId: string; tool: string; args: any; snapshot: any; createdAt: string }>>();

function pushUndo(farmId: number, entry: { undoId: string; tool: string; args: any; snapshot: any }) {
  const stack = undoStacks.get(farmId) || [];
  stack.push({ ...entry, createdAt: new Date().toISOString() });
  while (stack.length > UNDO_LIMIT) stack.shift();
  undoStacks.set(farmId, stack);
}


function getProviderConfig(): AIProviderConfig & { model: string; baseUrl: string } {
  const provider = getProvider(AI_PROVIDER) || getProvider("gemini")!;
  return {
    ...provider,
    // The provider default, unless an operator pinned one. Pinned wins
    // deliberately: a roster that drifts is how a retired model answers 404
    // and takes the whole assistant down.
    model: AI_MODEL || provider.defaultModel,
    baseUrl: AI_BASE_URL || provider.baseUrl,
  };
}

/**
 * The model that actually passed an agentic probe, cached for the process.
 *
 * Discovery costs live requests and the free tier is 50 a day ACCOUNT-WIDE,
 * so this runs once and is reused. An explicit AI_MODEL still wins: an
 * operator who pinned a model meant it, and silently overriding that would
 * be worse than the failure it prevents.
 */

// ─── Complete MCP Tool Definitions ────────────────────────
const mcpTools = [
  { type: "function", function: { name: "list_flocks", description: "List all flocks with bird count, breed, status, and mortality", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_flock", description: "Add a new flock to the farm", parameters: { type: "object", properties: { name: { type: "string", description: "Flock name" }, breed: { type: "string", description: "Bird breed" }, initialCount: { type: "number", description: "Number of birds" }, type: { type: "string", description: "layer, broiler, or breeder", enum: ["layer", "broiler", "breeder"] } }, required: ["name", "initialCount"] } } },
  { type: "function", function: { name: "delete_flock", description: "Remove a flock from the farm", parameters: { type: "object", properties: { id: { type: "number", description: "Flock ID" } }, required: ["id"] } } },
  { type: "function", function: { name: "list_production", description: "Get recent egg production data", parameters: { type: "object", properties: { days: { type: "number", description: "Days to retrieve (default 7)" } }, required: [] } } },
  { type: "function", function: { name: "record_production", description: "Record daily egg production for a flock", parameters: { type: "object", properties: { flockId: { type: "number", description: "Flock ID" }, eggsCollected: { type: "number", description: "Eggs collected" }, mortality: { type: "number", description: "Bird deaths" }, feedUsed: { type: "number", description: "Feed in kg" } }, required: ["flockId", "eggsCollected"] } } },
  { type: "function", function: { name: "list_transactions", description: "Get financial transactions", parameters: { type: "object", properties: { period: { type: "string", description: "week, month, or year", enum: ["week", "month", "year"] } }, required: [] } } },
  { type: "function", function: { name: "create_transaction", description: "Record a financial transaction", parameters: { type: "object", properties: { type: { type: "string", description: "income or expense", enum: ["income", "expense"] }, amount: { type: "number", description: "Amount in KES" }, category: { type: "string", description: "Category" }, description: { type: "string", description: "Description" } }, required: ["type", "amount", "category", "description"] } } },
  { type: "function", function: { name: "delete_transaction", description: "Delete a transaction", parameters: { type: "object", properties: { id: { type: "number", description: "Transaction ID" } }, required: ["id"] } } },
  { type: "function", function: { name: "list_sales", description: "Get sales records", parameters: { type: "object", properties: { days: { type: "number", description: "Days (default 30)" } }, required: [] } } },
  { type: "function", function: { name: "create_sale", description: "Record a new sale", parameters: { type: "object", properties: { totalAmount: { type: "number", description: "Total in KES" }, paymentStatus: { type: "string", description: "paid, pending, partial", enum: ["paid", "pending", "partial"] }, amountPaid: { type: "number", description: "Amount paid" }, notes: { type: "string", description: "Notes" } }, required: ["totalAmount"] } } },
  { type: "function", function: { name: "delete_sale", description: "Delete a sale", parameters: { type: "object", properties: { id: { type: "number", description: "Sale ID" } }, required: ["id"] } } },
  { type: "function", function: { name: "list_inventory", description: "Get inventory items", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_inventory_item", description: "Add inventory item", parameters: { type: "object", properties: { itemName: { type: "string", description: "Item name" }, category: { type: "string", description: "Category" }, quantity: { type: "number", description: "Quantity" }, unit: { type: "string", description: "Unit" }, unitCost: { type: "number", description: "Cost per unit" }, reorderLevel: { type: "number", description: "Min stock level" } }, required: ["itemName", "category", "quantity", "unit"] } } },
  { type: "function", function: { name: "delete_inventory_item", description: "Remove inventory item", parameters: { type: "object", properties: { id: { type: "number", description: "Item ID" } }, required: ["id"] } } },
  { type: "function", function: { name: "list_workers", description: "Get all workers", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_worker", description: "Add a worker", parameters: { type: "object", properties: { name: { type: "string", description: "Name" }, role: { type: "string", description: "Role" }, dailyWage: { type: "number", description: "Daily wage KES" }, phone: { type: "string", description: "Phone" } }, required: ["name", "role", "dailyWage"] } } },
  { type: "function", function: { name: "delete_worker", description: "Remove a worker", parameters: { type: "object", properties: { id: { type: "number", description: "Worker ID" } }, required: ["id"] } } },
  { type: "function", function: { name: "list_customers", description: "Get customers", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_customer", description: "Add a customer", parameters: { type: "object", properties: { name: { type: "string", description: "Name" }, phone: { type: "string", description: "Phone" }, email: { type: "string", description: "Email" }, address: { type: "string", description: "Address" } }, required: ["name"] } } },
  { type: "function", function: { name: "delete_customer", description: "Remove a customer", parameters: { type: "object", properties: { id: { type: "number", description: "Customer ID" } }, required: ["id"] } } },
  { type: "function", function: { name: "list_vaccinations", description: "Get vaccination records", parameters: { type: "object", properties: { flockId: { type: "number", description: "Filter by flock" } }, required: [] } } },
  { type: "function", function: { name: "create_vaccination", description: "Record a vaccination", parameters: { type: "object", properties: { flockId: { type: "number", description: "Flock ID" }, vaccineName: { type: "string", description: "Vaccine name" }, dosage: { type: "string", description: "Dosage" }, administeredBy: { type: "string", description: "Administered by" }, notes: { type: "string", description: "Notes" } }, required: ["flockId", "vaccineName"] } } },
  { type: "function", function: { name: "list_attendance", description: "Get attendance records", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "record_attendance", description: "Record attendance", parameters: { type: "object", properties: { workerId: { type: "number", description: "Worker ID" }, status: { type: "string", description: "Status", enum: ["present", "absent", "late", "half_day"] }, notes: { type: "string", description: "Notes" } }, required: ["workerId", "status"] } } },
  { type: "function", function: { name: "list_crops", description: "List all crops with type, area, and growth stage", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_crop", description: "Register a new crop field", parameters: { type: "object", properties: { fieldName: { type: "string", description: "Field name" }, cropType: { type: "string", description: "Crop type" }, variety: { type: "string", description: "Variety" }, areaAcres: { type: "number", description: "Area in ACRES (Kenyan farmers measure in acres; 1 hectare = 2.471 acres)" } }, required: ["fieldName", "cropType"] } } },
  { type: "function", function: { name: "list_invoices", description: "List invoices with customer, totals and payment status", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "create_invoice", description: "Generate an invoice for a customer. Use after recording a sale when the farmer needs a bill.", parameters: { type: "object", properties: { customerId: { type: "number", description: "Customer ID" }, saleId: { type: "number", description: "Optional related sale ID" }, totalAmount: { type: "number", description: "Total in KES" }, amountPaid: { type: "number", description: "Amount already paid" }, paymentStatus: { type: "string", description: "paid, pending, partial", enum: ["paid", "pending", "partial"] }, dueDate: { type: "string", description: "Due date YYYY-MM-DD" }, notes: { type: "string", description: "Notes" } }, required: ["totalAmount"] } } },
  { type: "function", function: { name: "undo_last_action", description: "Reverse the most recent destructive action if the farmer made a mistake", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_weather", description: "Get weather forecast", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "search_web", description: "Look something up on the internet. Free and always available - no setup, no key. Use for anything the farm records cannot answer: current market and input prices, weather, disease outbreaks, county regulations, feed formulations, veterinary guidance. Covers the open web and Wikipedia. Never answer those from memory - look them up. Say plainly if the search finds nothing.", parameters: { type: "object", properties: { query: { type: "string", description: "What to look up, in plain words" } }, required: ["query"] } } },  { type: "function", function: { name: "get_farm_status", description: "The state of EVERY part of the farm in ONE call: flocks and birds, workers, money in and out, egg production, crops, sales, invoices, stock and customers. Use this FIRST for any question about how the farm is doing, its status, an overview, or what is recorded - it answers all of it at once instead of making you call ten list tools.", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_dashboard", description: "Get dashboard summary", parameters: { type: "object", properties: {}, required: [] } } },
];

const SYSTEM_PROMPT = `You are Wangari AI, an intelligent farm management assistant for mixed farms (livestock and crops) in Kenya.

You have FULL ACCESS to the farmer's farm management system. You can read, create, update, and delete any data.

CAPABILITIES:
- View and manage flocks (add/remove birds)
- Track egg production daily
- Manage finances (income/expenses)
- Track sales and customers
- Manage inventory and stock
- Manage workers and attendance
- Track vaccination schedules
- Check weather conditions
- Generate reports

RULES:
- Use KES (Kenyan Shillings) for all monetary values
- Be specific with numbers and dates
- When creating/modifying data, always confirm with the user first
- When deleting data, warn about consequences
- Provide actionable advice based on the data
- If data is missing, suggest what to record
- Always be helpful, concise, and professional

FARM KNOWLEDGE:
- Layer chickens lay 250-300 eggs/year
- FCR of 1.8-2.2 is good for layers
- Mortality under 1%/week is acceptable
- Common vaccines: Marek's, NDV, IB, Gumboro
- Feed is the biggest expense (60-70% of costs)


HOW TO WORK (this is what makes you fast AND correct):
- Answer the whole question in ONE tool call when you can. "How is my farm?" is get_farm_status, not ten list_* calls. Each extra call is another round trip and another minute of the farmer's wait.
- Never call the same tool twice in one conversation. If you already read the flocks, you have the flocks.
- You are shown the ACTUAL ROWS behind every result. Read them before deciding you need more. If a tool says "1 flock", the flock's name, breed and bird count are in the data field - do not call again to find them.
- Read before you write. If the farmer names something that may already exist, look first, then act.
- Batch independent actions in a single turn rather than one at a time.

BEING HONEST:
- Say what the records show. If a number is missing, say it is missing - never estimate one and present it as recorded.
- When data is absent, name what is absent AND the single most useful next step. Do not pad with generic advice the farmer did not ask for.
- If you are unsure, say so plainly. A wrong confident number costs the farmer more than an honest gap.
- Do not repeat the farm's capabilities list. The farmer can read it; they asked a question.

REASONING ON FARM QUESTIONS:
- Start from what the records show, then say what it means: a lay rate below 80% points at feed, light or flock age - say which, and what to check first.
- Costs in Kenya: feed is 60-70% of a poultry farm. Point at feed first when margin is the question.
- Use acres, not hectares, and KES for money.
- Prefer the smallest number of records that answers the question over a full dump.
- Answer in the language the farmer wrote in. Match their words, not a register.

RESEARCH:
- Use search_web when a question needs facts you cannot get from the farm records: prices, market rates, weather, disease outbreaks, regulations, feed formulations.
- Every extra step costs the farmer another minute on the free plan, so make the FIRST search count: one well-chosen query, not three variations of it. You may search a second time only if the first clearly missed. A third is refused - answer from what you have and name what is still missing.
- Never state a price, a regulation or a disease status from memory. Look it up.
- Say when a search found nothing. A confident guess about a market price is the worst thing you can tell a farmer.
- Each hit carries where it came from. When sources disagree on a number, say they disagree and give both - do not average them and do not quietly pick the friendlier one.
- Prices move. Give the date the source shows and say if it is old, rather than presenting last month's rate as today's.
- Search covers the open web and Wikipedia. Wikipedia is right for facts that do not change (breed, laying age, feed ratios); the open web is right for current prices. If something is both, use both and prefer the current one for the number.

HONESTY ABOUT SPEED - the one thing you must not hide:
- Wangari runs on a free AI plan that allows ONE question a minute. A question needing two steps can take a minute to answer. That is a plan limit, not a fault, and the farmer is told on their screen when they are waiting.
- If the wait cost them real time, say so ONCE, in one short line, and only then. Something like "That took a minute because the free plan allows one question a minute - a Wangari Plus subscription removes the wait." Never apologise twice, never lead with it, and never use it instead of answering.
- Never invent a plan name, a price, or a benefit you were not told about. If you do not know what a subscription includes, say so plainly.
- A slow answer must not become a fast-sounding one. The free plan is the only excuse you may give.

When the user asks you to do something, DO IT. Use the tools to read data, create records, and manage the farm.`;

/** Ask the plan gate whether this user may use a module.
 *
 *  Deliberately the SAME function the screens are gated by. A second copy
 *  of the plan rules would drift, and the drift presents as "the AI can do
 *  it but I cannot see it" - the exact bug this replaces.
 */
async function moduleAllowedForUser(userId: number, module: string): Promise<boolean> {
  try {
    const { isModuleAllowed } = await import("../middleware/plan-gate.js");
    return await isModuleAllowed(userId, module);
  } catch {
    // If the gate cannot be consulted we must not block a farmer's work on a
    // technicality. Failing OPEN is the lesser evil: the screen is still
    // gated, so nothing becomes visible that should not be - the farmer
    // simply does not get an in-chat refusal. Failing closed would stop
    // Wangari working entirely whenever this import hiccuped.
    return true;
  }
}

/** Which module each farm tool writes into.
 *
 *  This is the join that was missing. The agent had no plan gate at all, so it
 *  would create a flock on a Starter account, and then the Animals module
 *  would answer 403 and show the farmer an empty screen. They were told the
 *  work was done, because from the agent's side it genuinely was.
 *
 *  An invisible write is worse than a refusal: a farmer who asks Wangari to
 *  record something and then cannot find it has learned that the app lies, and
 *  no later message from her will be believed.
 *
 *  Deliberately exhaustive: a tool missing from here is an UNGATED tool, so a
 *  test asserts every declared tool has an entry. */
const TOOL_MODULE: Record<string, string> = {
  create_flock: "flocks", delete_flock: "flocks", list_flocks: "flocks",
  record_production: "production", list_production: "production",
  create_transaction: "transactions", delete_transaction: "transactions",
  list_transactions: "transactions",
  create_sale: "sales", delete_sale: "sales", list_sales: "sales",
  create_invoice: "invoices", list_invoices: "invoices",
  create_customer: "customers", delete_customer: "customers",
  list_customers: "customers",
  create_inventory_item: "inventory", delete_inventory_item: "inventory",
  list_inventory: "inventory",
  create_worker: "workers", delete_worker: "workers", list_workers: "workers",
  create_vaccination: "vaccinations", list_vaccinations: "vaccinations",
  record_attendance: "attendance", list_attendance: "attendance",
  create_crop: "crops", list_crops: "crops",
  get_dashboard: "dashboard",  get_farm_status: "dashboard",  search_web: "dashboard",
  get_weather: "weather",
  undo_last_action: "dashboard",
};

/** Tools that change data.
 *
 *  Only these are worth a plan check. A refusal costs the farmer nothing,
 *  whereas an invisible WRITE costs them their trust in the app - so reads are
 *  always allowed, and the farmer is never blind to their own farm. */
const WRITE_TOOLS: ReadonlySet<string> = new Set([
  "create_flock", "delete_flock", "record_production", "create_transaction",
  "delete_transaction", "create_sale", "delete_sale", "create_invoice",
  "create_customer", "delete_customer", "create_inventory_item",
  "delete_inventory_item", "create_worker", "delete_worker",
  "create_vaccination", "record_attendance", "create_crop", "undo_last_action",
]);

/**
 * What the MODEL is shown for a tool result.
 *
 * The farmer sees one line; the model needs the rows. This is the boundary
 * between the two, and it was the reason Wangari answered "how many flocks
 * do I have?" by asking for ten tools: she had been handed the summary, not
 * the flock.
 *
 * Bounded on both axes. A farm with two years of transactions must not blow
 * the context, and a model reading 4,000 tokens of raw rows is slower, not
 * smarter - the cap is also the token saving.
 */
const MAX_ROWS_TO_MODEL = 25;
const MAX_CHARS_TO_MODEL = 6_000;

function rowsForModel(raw: any): unknown {
  if (raw === null || raw === undefined) return null;
  const slim = (v: any) => {
    if (Array.isArray(v)) return v.slice(0, MAX_ROWS_TO_MODEL).map(slim);
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (val === null || val === undefined) continue;
        if (typeof val === "function") continue;
        out[k] = slim(val);
      }
      return out;
    }
    return v;
  };
  const trimmed = slim(raw);
  let text = JSON.stringify(trimmed);
  if (text && text.length > MAX_CHARS_TO_MODEL) {
    text = text.slice(0, MAX_CHARS_TO_MODEL) + '"…truncated, ask for a narrower slice"}';
  }
  try { return JSON.parse(text); } catch { return null; }
}

// ─── Tool Executor ────────────────────────────────────────
/** Per-turn spend on tools that cost the farmer a minute each. */
export interface TurnBudget {
  /** Research calls already made in this turn. Mutated by executeTool. */
  searches: number;
}

async function executeTool(
  toolName: string,
  args: Record<string, any>,
  farmId: number,
  userId?: number,
  budget?: TurnBudget,
): Promise<any> {
  /* ── the same paywall the screens obey ──────────────────
     Asked to do something the farmer's plan does not include, Wangari says
     so instead of writing a record nobody will ever be shown. The wording is
     the farmer's, not a status code: the goal is that they understand what
     happened and can decide what to do about it. */
  if (WRITE_TOOLS.has(toolName) && userId != null) {
    const module = TOOL_MODULE[toolName];
    if (module) {
      const allowed = await moduleAllowedForUser(userId, module);
      if (!allowed) {
        return {
          error:
            "That part of the farm is not in your plan yet, so I have not saved it. " +
            "Ask for something in Money, Stock or the weather instead, or upgrade to unlock it.",
        };
      }
    }
  }

  switch (toolName) {
    case "list_flocks": return prisma.flock.findMany({ where: { farmId } });
    case "create_flock": return prisma.flock.create({ data: { name: args.name, breed: args.breed, currentCount: args.initialCount, initialCount: args.initialCount, type: args.type || "layer", farmId, status: "active" } });
    case "delete_flock": { const snap = await prisma.flock.findFirst({ where: { id: args.id, farmId } }); if (!snap) return { error: "Flock not found on this farm" }; await prisma.flock.deleteMany({ where: { id: args.id, farmId } }); pushUndo(farmId, { undoId: "undo_flock", tool: "create_flock", args: { name: snap.name, breed: snap.breed, initialCount: snap.initialCount, type: (snap as any).type }, snapshot: snap }); return { deleted: true, undoId: "undo_flock", restored: snap.name }; }
    case "list_production": { const d = (args.days as number) || 7; const s = new Date(); s.setDate(s.getDate() - d); return prisma.dailyProduction.findMany({ where: { farmId, date: { gte: s } }, orderBy: { date: "desc" } }); }
    case "record_production": return prisma.dailyProduction.create({ data: { flockId: args.flockId, date: new Date(), eggsCollected: args.eggsCollected || 0, mortality: args.mortality || 0, feedUsed: args.feedUsed || 0, farmId } });
    case "list_transactions": { const now = new Date(); let s = new Date(); const p = (args.period as string) || "month"; if (p === "week") s.setDate(now.getDate() - 7); else if (p === "month") s.setMonth(now.getMonth() - 1); else s.setFullYear(now.getFullYear() - 1); return prisma.transaction.findMany({ where: { farmId, date: { gte: s } }, orderBy: { date: "desc" } }); }
    case "create_transaction": return prisma.transaction.create({ data: { type: args.type, amount: args.amount, category: args.category, description: args.description, date: new Date(), farmId } });
    case "delete_transaction": { const snap = await prisma.transaction.findFirst({ where: { id: args.id, farmId } }); if (!snap) return { error: "Transaction not found on this farm" }; await prisma.transaction.deleteMany({ where: { id: args.id, farmId } }); pushUndo(farmId, { undoId: "undo_transaction", tool: "create_transaction", args: { type: snap.type, amount: Number(snap.amount), category: snap.category, description: snap.description }, snapshot: snap }); return { deleted: true, undoId: "undo_transaction" }; }
    case "list_sales": { const d = (args.days as number) || 30; const s = new Date(); s.setDate(s.getDate() - d); return prisma.sale.findMany({ where: { farmId, saleDate: { gte: s } }, orderBy: { saleDate: "desc" } }); }
    case "create_sale": return prisma.sale.create({ data: { totalAmount: args.totalAmount, paymentStatus: args.paymentStatus || "paid", amountPaid: args.amountPaid || args.totalAmount || 0, customerId: args.customerId ? Number(args.customerId) : null, items: Array.isArray(args.items) ? args.items : [], farmId } });
    case "delete_sale": return prisma.sale.deleteMany({ where: { id: args.id, farmId } });
    case "list_inventory": return prisma.inventory.findMany({ where: { farmId } });
    case "create_inventory_item": return prisma.inventory.create({ data: { itemName: args.itemName, category: args.category, quantity: args.quantity, unit: args.unit, unitCost: args.unitCost, reorderLevel: args.reorderLevel, farmId } });
    case "delete_inventory_item": return prisma.inventory.deleteMany({ where: { id: args.id, farmId } });
    case "list_workers": return prisma.worker.findMany({ where: { farmId } });
    case "create_worker": return prisma.worker.create({ data: { name: args.name, role: args.role, dailyWage: args.dailyWage, phone: args.phone, farmId } });
    case "delete_worker": return prisma.worker.deleteMany({ where: { id: args.id, farmId } });
    case "list_customers": return prisma.customer.findMany({ where: { farmId } });
    case "create_customer": return prisma.customer.create({ data: { name: args.name, phone: args.phone, email: args.email, address: args.address, farmId } });
    case "delete_customer": return prisma.customer.deleteMany({ where: { id: args.id, farmId } });
    case "list_vaccinations": { const w: any = { flock: { farmId } }; if (args.flockId) w.flockId = args.flockId; return prisma.vaccination.findMany({ where: w, orderBy: { scheduledDate: "desc" } }); }
    case "create_vaccination": return prisma.vaccination.create({ data: { flockId: args.flockId, vaccineName: args.vaccineName, scheduledDate: new Date().toISOString(), notes: args.notes || null } });
    case "list_attendance": return prisma.attendance.findMany({ where: { farmId }, orderBy: { date: "desc" } });
    case "record_attendance": return prisma.attendance.create({ data: { workerId: args.workerId, date: new Date(), status: args.status, notes: args.notes || null, farmId } });
    case "list_crops": return prisma.crop.findMany({ where: { farmId }, include: { harvests: true } });
    case "create_crop": { const raw = args.areaAcres !== undefined && args.areaAcres !== null ? Number(args.areaAcres) : null; if (raw !== null && (!Number.isFinite(raw) || raw <= 0)) return { error: "areaAcres must be a positive number of acres" }; return prisma.crop.create({ data: { name: args.fieldName || args.name, cropType: args.cropType, variety: args.variety, areaAcres: raw, farmId } }); }
    case "get_weather": return { note: "Weather available via /api/weather" };
    /* One call for the whole farm.

       "Tell me the status of my farm" is the most natural question a farmer
       can ask and the model answered it by calling list_flocks, then
       list_production, then list_crops, and so on - eleven round trips. The
       provider meters whole requests, so eleven calls is eleven minutes.
       This answers all of it in one, and the model reaches a sentence after
       a single exchange. */
    case "get_farm_status": {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [flocks, production, txs, sales, invoices, inventory, customers, workers, crops] = await Promise.all([
        prisma.flock.findMany({ where: { farmId }, orderBy: { createdAt: "desc" } }),
        prisma.dailyProduction.findMany({ where: { farmId, date: { gte: since } }, orderBy: { date: "desc" }, take: 30 }),
        prisma.transaction.findMany({ where: { farmId, date: { gte: since } }, orderBy: { date: "desc" } }),
        prisma.sale.findMany({ where: { farmId, saleDate: { gte: since } }, orderBy: { saleDate: "desc" } }),
        prisma.invoice.findMany({ where: { farmId }, orderBy: { createdAt: "desc" }, take: 25, include: { customer: { select: { name: true } } } }),
        prisma.inventory.findMany({ where: { farmId } }),
        prisma.customer.findMany({ where: { farmId }, orderBy: { createdAt: "desc" }, take: 25 }),
        prisma.worker.findMany({ where: { farmId } }),
        prisma.crop.findMany({ where: { farmId } }),
      ]);
      const income = txs.filter((t: any) => t.type === "income").reduce((a: number, t: any) => a + Number(t.amount), 0);
      const expense = txs.filter((t: any) => t.type === "expense").reduce((a: number, t: any) => a + Number(t.amount), 0);
      const eggs = production.reduce((a: number, p: any) => a + (p.eggsCollected || 0), 0);
      const deaths = production.reduce((a: number, p: any) => a + (p.mortality || 0), 0);
      const empty: string[] = [];
      if (!production.length) empty.push("egg production");
      if (!crops.length) empty.push("crops");
      if (!sales.length) empty.push("sales");
      if (!invoices.length) empty.push("invoices");
      if (!inventory.length) empty.push("stock");
      if (!customers.length) empty.push("customers");
      return {
        period: "last 30 days",
        flocks,
        workers,
        totals: {
          flocks: flocks.length,
          birds: flocks.reduce((a: number, f: any) => a + (f.currentCount || 0), 0),
          eggsCollected: eggs,
          mortality: deaths,
          layRatePercent: flocks.reduce((a: number, f: any) => a + (f.currentCount || 0), 0) > 0 && eggs > 0
            ? Math.round((eggs / flocks.reduce((a: number, f: any) => a + (f.currentCount || 0), 0)) * 100)
            : null,
          income,
          expense,
          profit: income - expense,
          salesTotal: sales.reduce((a: number, x: any) => a + Number(x.totalAmount), 0),
        },
        production,
        transactions: txs,
        sales,
        invoices,
        inventory,
        customers,
        crops,
        notRecorded: empty,
      };
    }
    /* Research. A read, so it is never plan-gated: a farmer who cannot
       check a price cannot be helped, and blocking the lookup would only
       send them back to guessing. */
    case "search_web": {
      const query = String(args.query || "").trim();
      if (!query) return { error: "Tell me what to look up." };
      if (budget && budget.searches >= SEARCHES_PER_TURN) {
        return {
          error:
            "I have already looked twice for this question, and every search costs the farmer another minute. Answer from what you have, and name what is still missing.",
        };
      }
      if (budget) budget.searches++;
      // `tier` travels with the hits so the model can be specific about where
      // a number came from. A farmer comparing two prices has no way to tell
      // a paid index from a free one otherwise, and "I looked it up" covers
      // both equally well - which is exactly the overconfidence to avoid.
      const outcome = await searchWeb(query);
      if (!outcome.hits.length) return { error: outcome.note || "The search found nothing on that." };
      return { query, hits: outcome.hits, source: outcome.tier };
    }
    case "get_dashboard": {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [flocks, production, txs, sales, inventory] = await Promise.all([
        prisma.flock.findMany({ where: { farmId } }),
        prisma.dailyProduction.findMany({ where: { farmId, date: { gte: since } }, orderBy: { date: "desc" }, take: 30 }),
        prisma.transaction.findMany({ where: { farmId, date: { gte: since } } }),
        prisma.sale.findMany({ where: { farmId, saleDate: { gte: since } } }),
        prisma.inventory.findMany({ where: { farmId } }),
      ]);
      const income = txs.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const expense = txs.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const lowStock = inventory
        .filter((i: any) => i.reorderLevel != null && Number(i.quantity) <= Number(i.reorderLevel))
        .map((i: any) => ({ item: i.itemName, quantity: Number(i.quantity), unit: i.unit, reorderLevel: Number(i.reorderLevel) }));
      return {
        period: "last 30 days",
        flockCount: flocks.length,
        birds: flocks.reduce((s: number, f: any) => s + (f.currentCount || 0), 0),
        eggsCollected: production.reduce((s: number, p: any) => s + (p.eggsCollected || 0), 0),
        mortality: production.reduce((s: number, p: any) => s + (p.mortality || 0), 0),
        income,
        expense,
        profit: income - expense,
        salesCount: sales.length,
        salesTotal: sales.reduce((s: number, x: any) => s + Number(x.totalAmount), 0),
        lowStock,
      };
    }
    case "list_invoices": return prisma.invoice.findMany({ where: { farmId }, orderBy: { createdAt: "desc" }, take: 25, include: { customer: { select: { name: true } } } });
    case "create_invoice": { const { nextDocCode } = await import("../lib/doc-codes.js"); const invoiceNumber = await prisma.$transaction((tx: any) => nextDocCode(tx, farmId, "invoice")); return prisma.invoice.create({ data: { farmId, invoiceNumber, customerId: args.customerId ? Number(args.customerId) : null, saleId: args.saleId ? Number(args.saleId) : null, totalAmount: Number(args.totalAmount), amountPaid: Number(args.amountPaid || 0), paymentStatus: args.paymentStatus || "pending", dueDate: args.dueDate ? new Date(args.dueDate) : null, notes: args.notes || null, items: [] } }); }
    case "undo_last_action": { const stack = undoStacks.get(farmId) || []; const last = stack[stack.length - 1]; if (!last) return { error: "Nothing to undo" }; stack.pop(); undoStacks.set(farmId, stack); if (last.undoId === "undo_flock") { const s = last.snapshot as any; const restored = await prisma.flock.create({ data: { name: s.name, breed: s.breed, initialCount: s.initialCount, currentCount: s.currentCount, type: (s as any).type || "layer", status: "active", farmId } }); return { undone: "flock_deletion", restored: restored.name }; } if (last.undoId === "undo_transaction") { const restored = await prisma.transaction.create({ data: { farmId, type: last.args.type, amount: last.args.amount, category: last.args.category, description: last.args.description, date: new Date() } }); return { undone: "transaction_deletion", id: restored.id }; } return { error: `Cannot undo ${last.tool}` }; }
    default: return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Streaming chat (SSE) ────────────────────────────────
// POST /api/ai/stream — same agentic loop as /chat, but each step is pushed to
// the browser as it happens so the farmer can SEE the AI working on their farm.
router.post("/stream", async (req: Request, res: Response) => {
  if (!AI_API_KEY && AI_PROVIDER !== "ollama") {
    return res.status(503).json({ error: "AI not configured", provider: AI_PROVIDER });
  }

  let farmId: number;
  try {
    farmId = req.user!.farmId!;
  } catch {
    return res.status(400).json({ error: "No farm associated with account" });
  }
  if (!farmId) return res.status(400).json({ error: "No farm associated with account" });

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Messages array required" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // If the browser closes mid-run, stop burning tokens on an invisible task.
  let aborted = false;
  req.on("close", () => { aborted = true; });

  try {
    send("start", { provider: AI_PROVIDER, model: getProviderConfig().model });
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    let steps = 0;
    let text = "";
    let truncatedByBudget = false;
    // Did the farmer ever get an actual sentence? Tracked explicitly because
    // "the tools scrolled past and then nothing happened" is indistinguishable
    // from a frozen app, and a farmer who cannot tell will not try again.
    let answered = false;
    const actions: { tool: string; ok: boolean; summary: string }[] = [];
    /* Research is metered twice over, and only one of the two is ours to fix.
       The provider allows one request a minute, so a turn that searches three
       times costs three minutes before Wangari can answer. Measured live on
       the layer-mash question: 198,128ms and three search_web calls, against
       a single 2.8s first result that was already enough to answer from.
       Capping at two keeps the worst case at about three minutes and leaves
       room for the follow-up refinement that genuinely helps. */
    const budget: TurnBudget = { searches: 0 };

    while (steps < MAX_AGENT_STEPS) {
      if (aborted) break;
      steps++;
      const response = await callAI(convo, mcpTools, (waitMs, opensAt) => {
        send("waiting", { seconds: Math.round(waitMs / 1000), opensAt: opensAt ?? null });
      });
      text = response.content || text;

      if (response.tool_calls.length === 0) {
        send("message", { content: text });
        answered = true;
        break;
      }

      const toolResults: any[] = [];
      /* Announce every call up front, then run them together.

         Tools in one assistant turn are independent reads, and the provider
         meters whole REQUESTS: doing four of them one after another spends
         four minutes of the farmer's one-per-minute budget before Wangari can
         say anything. They now overlap. */
      const calls = response.tool_calls.map((tc: any) => {
        let args: any = {};
        try {
          args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          args = {};
        }
        return { tc, toolName: tc.function.name as string, args };
      });
      for (const c of calls) send("tool_start", { tool: c.toolName, args: c.args, step: steps });

      const settled = await Promise.all(
        calls.map(async ({ tc, toolName, args }) => {
          let ok = true;
          let payload: any;
          let raw: any;
          try {
            raw = await executeTool(toolName, args, farmId, req.user!.userId, budget);
            if (raw && typeof raw === "object" && (raw as any).error) {
              ok = false;
              payload = { error: (raw as any).error };
            } else {
              payload = { result: summariseToolResult(toolName, raw) };
            }
          } catch (e: any) {
            ok = false;
            payload = { error: e.message };
          }
          return { tc, toolName, ok, payload, raw };
        }),
      );

      for (const { tc, toolName, ok, payload, raw } of settled) {
        send("tool_end", { tool: toolName, ok, ...payload });
        actions.push({
          tool: toolName,
          ok,
          summary: String(payload.result || payload.error || "").slice(0, 120),
        });
        /* ── the model gets the DATA, the farmer gets the summary ──
           These used to be the same string, and it was the single biggest
           source of slowness in the product: Wangari was handed
           "Read flocks — 1 flock" instead of the flock, so she could not
           answer "tell me the status of my farm" and instead asked for ten
           more tools to reconstruct what she had already been told existed.

           The one-line form is right for a farmer scrolling past it and
           useless for the only reader who has to reason about it. */
        toolResults.push({
          tool_call_id: tc.id,
          name: toolName,
          content: JSON.stringify(
            ok ? { ...payload, ok, data: rowsForModel(raw) } : { ...payload, ok },
          ),
        });
      }

      convo.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
      convo.push({ role: "user", content: `Tool results:\n${toolResults.map((t) => `- ${t.name}: ${t.content}`).join("\n")}` });

      if (toolResults.some((t) => String(t.content).includes('"ok":false'))) {
        send("message", { content: text || "I could not finish that action. Please check the details above." });
        answered = true;
        break;
      }
      if (steps >= MAX_AGENT_STEPS) truncatedByBudget = true;
    }

    if (aborted) {
      res.end();
      return;
    }

    /* ── the farmer must never be left with tools and no answer ──
       Both ways out of the loop above can end without a sentence: the step
       budget ran out mid-job, or the provider failed between tool calls. In
       both cases the tool feed is already on their screen, so silence reads
       as a crash - and a farmer watching an app freeze will not try again.

       So the answer is composed from what actually happened, which is also
       the only honest thing to say: these steps really were run. */
    if (!answered) {
      if (!text && actions.length === 0) {
        send("message", {
          content: "I could not reach my thinking service just then. Please try again in a few minutes.",
        });
      } else if (actions.length === 0) {
        send("message", { content: text });
      } else {
        const done = actions.filter((a) => a.ok).map((a) => a.summary).filter(Boolean);
        const failed = actions.filter((a) => !a.ok).map((a) => a.summary).filter(Boolean);
        const lines: string[] = [];
        if (done.length) lines.push(`I did this:\n${done.map((s) => `- ${s}`).join("\n")}`);
        if (failed.length) lines.push(`This did not go through:\n${failed.map((s) => `- ${s}`).join("\n")}`);
        if (text) lines.push(text);
        lines.push(
          truncatedByBudget
            ? "I stopped there because that was as far as I could get in one go. Tell me what to do next and I will carry on."
            : "Tell me what you would like next and I will carry on from there.",
        );
        send("message", { content: lines.join("\n\n") });
      }
    }

    send("done", { steps, truncatedByBudget });
  } catch (error) {
    send("error", { message: error instanceof Error ? error.message : "Unknown error" });
  } finally {
    res.end();
  }
});

// ─── Tool Result Summary ──────────────────────────────────
// The model gets the full JSON, but the farmer-facing UI shows a short
// human line per step ("Recorded sale KES 4,500"). Keep it Swahili-friendly
// and short — the farmer cannot read long strings.
function summariseToolResult(tool: string, result: any): string {
  // Plural nouns for "N of them", and the singular for the one-row case.
  // A trailing-s strip cannot reach "money record", and "Read money records —
  // 1 records" is the kind of detail a farmer notices and stops trusting.
  const COUNT_NOUN: Record<string, string> = {
    list_flocks: "flocks",
    list_production: "records",
    list_transactions: "money records",
    list_sales: "sales",
    list_inventory: "items",
    list_workers: "workers",
    list_customers: "customers",
    list_vaccinations: "vaccinations",
    list_attendance: "attendance records",
    list_crops: "crop fields",
    list_invoices: "invoices",
  };
  const SINGULAR_NOUN: Record<string, string> = {
    list_flocks: "flock",
    list_production: "record",
    list_transactions: "money record",
    list_sales: "sale",
    list_inventory: "item",
    list_workers: "worker",
    list_customers: "customer",
    list_vaccinations: "vaccination",
    list_attendance: "attendance record",
    list_crops: "crop field",
    list_invoices: "invoice",
  };
  const labels: Record<string, string> = {
    create_flock: "Added flock",
    delete_flock: "Removed flock",
    record_production: "Recorded production",
    create_transaction: "Recorded transaction",
    delete_transaction: "Deleted transaction",
    create_sale: "Recorded sale",
    delete_sale: "Deleted sale",
    create_inventory_item: "Added inventory item",
    delete_inventory_item: "Removed inventory item",
    create_worker: "Added worker",
    delete_worker: "Removed worker",
    create_customer: "Added customer",
    delete_customer: "Removed customer",
    create_vaccination: "Recorded vaccination",
    record_attendance: "Recorded attendance",
    create_crop: "Registered crop field",
    create_invoice: "Created invoice",
    list_invoices: "Read invoices",
    list_flocks: "Read flocks",
    list_production: "Read production",
    list_transactions: "Read money records",
    list_sales: "Read sales",
    list_inventory: "Read stock",
    list_workers: "Read workers",
    list_customers: "Read customers",
    list_vaccinations: "Read vaccinations",
    list_attendance: "Read attendance",
    list_crops: "Read crop fields",
    undo_last_action: "Undid last action",
    get_weather: "Checked weather",
    get_dashboard: "Read farm summary",    get_farm_status: "Read the whole farm",    search_web: "Looked it up",
  };
  const verb = labels[tool] || tool;
  try {
    // A bare label tells the farmer nothing about whether Wangari found
    // anything. The count is the answer they actually asked for, and it is
    // also what stops the model describing an empty list as if it had data.
    if (Array.isArray(result)) {
      const noun = COUNT_NOUN[tool];
      if (noun) {
        if (result.length === 0) return `${verb} — none yet`;
        const one = SINGULAR_NOUN[tool] || noun.replace(/s$/, "");
        return `${verb} — ${result.length} ${result.length === 1 ? one : noun}`;
      }
    }
    if (tool === "create_transaction" || tool === "create_sale" || tool === "create_invoice") {
      const amount = Number(result?.amount ?? result?.totalAmount ?? 0);
      if (amount) return `${verb} — KES ${amount.toLocaleString("en-KE")}`;
    }
    if (tool === "create_invoice" && result?.invoiceNumber) return `${verb} ${result.invoiceNumber}`;
    if (tool === "record_production") return `${verb} — ${result?.eggsCollected ?? 0} eggs, ${result?.mortality ?? 0} deaths`;
  } catch { /* fall through to the generic label */ }
  return verb;
}

// ─── Unified AI Caller ────────────────────────────────────
async function callAI(
  messages: any[],
  tools: any[],
  onWait?: (waitMs: number, opensAt: number | null) => void,
): Promise<{ content: string; tool_calls: any[] }> {
  const config = getProviderConfig();

  // Special handling for non-OpenAI-compatible providers
  if (config.id === "gemini") return callGemini(messages, tools, config);
  if (config.id === "anthropic") return callAnthropic(messages, tools, config);
  if (config.id === "cohere") return callCohere(messages, tools, config);
  if (config.id === "cloudflare") return callCloudflare(messages, tools, config);
  if (config.id === "ollama") return callOllama(messages, tools, config);

  // All OpenAI-compatible providers (UnoRouter, Groq, Cerebras, Mistral, GitHub, NVIDIA, DeepSeek, OpenAI)
  return callOpenAICompatible(messages, tools, config, onWait);
}

// ─── OpenAI-Compatible (most providers) ───────────────────
async function callOpenAICompatible(
  messages: any[],
  tools: any[],
  config: ReturnType<typeof getProviderConfig>,
  onWait?: (waitMs: number, opensAt: number | null) => void,
): Promise<{ content: string; tool_calls: any[] }> {
  const body = JSON.stringify({ model: config.model, messages, tools, temperature: 0.7, max_tokens: 4096 });
  // `Response` alone means Express's Response in this file, not fetch's.
  let res: Awaited<ReturnType<typeof fetch>> | null = null;
  let err = "";

  // UnoRouter's free tier allows ONE request a minute, account-wide, and a
  // farm task needs several: one call per tool, then one for the sentence.
  // Without this, step 2 of every multi-step job fails with 429 and the
  // farmer is told the work could not be done when in fact the first half of
  // it already succeeded.
  //
  // The wait is computed from when this key was last accepted, not guessed -
  // see lib/rate-limit-window.ts. Past RATE_LIMIT_MAX_RETRIES the caller's own
  // error handling takes over and says so in the farmer's words rather than
  // as a status code.
  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
      body,
    });
    if (res.ok) lastAcceptedCallAt = Date.now();
    if (res.status !== 429) break;
    err = await res.text().catch(() => "");
    if (attempt >= RATE_LIMIT_MAX_RETRIES) break;
    const { waitMs, reason, opensAt } = nextRetryWait({
      lastAcceptedAt: lastAcceptedCallAt,
      now: Date.now(),
      windowMs: RATE_LIMIT_WINDOW_MS,
      maxWaitMs: RATE_LIMIT_MAX_WAIT_MS,
    });
    console.warn(`${config.name}: 429 on ${config.model}, waiting ${waitMs}ms (${reason}, attempt ${attempt + 1})`);
    // A minute of silence is indistinguishable from a frozen app, and a
    // farmer who cannot tell will not ask a second time.
    onWait?.(waitMs, opensAt);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (!res) throw new Error(`${config.name}: no response`);
  if (!res.ok) {
    if (!err) err = await res.text().catch(() => "");
    console.error(`${config.name}:`, err);
    throw new Error(`${config.name}: ${res.status}`);
  }
  const data: any = await res.json();
  return { content: data.choices?.[0]?.message?.content || "", tool_calls: data.choices?.[0]?.message?.tool_calls || [] };
}

// ─── Gemini ───────────────────────────────────────────────
async function callGemini(messages: any[], tools: any[], config: ReturnType<typeof getProviderConfig>): Promise<{ content: string; tool_calls: any[] }> {
  const sys = messages.find((m: any) => m.role === "system");
  const contents = messages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const geminiTools = [{ function_declarations: tools.map((t: any) => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }];
  const res = await fetch(`${config.baseUrl}/models/${config.model}:generateContent?key=${AI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, systemInstruction: sys ? { parts: [{ text: sys.content }] } : undefined, tools: geminiTools, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } }),
  });
  if (!res.ok) { const err = await res.text(); console.error("Gemini:", err); throw new Error(`Gemini: ${res.status}`); }
  const data: any = await res.json();
  const c = data.candidates?.[0];
  const content = c?.content?.parts?.find((p: any) => p.text)?.text || "";
  const toolCalls = c?.content?.parts?.filter((p: any) => p.functionCall)?.map((p: any, i: number) => ({ id: `call_${Date.now()}_${i}`, type: "function", function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) } })) || [];
  return { content, tool_calls: toolCalls };
}

// ─── Anthropic ────────────────────────────────────────────
async function callAnthropic(messages: any[], tools: any[], config: ReturnType<typeof getProviderConfig>): Promise<{ content: string; tool_calls: any[] }> {
  const sys = messages.find((m: any) => m.role === "system");
  const chatMsgs = messages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role, content: m.content }));
  const res = await fetch(`${config.baseUrl}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": AI_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: config.model, max_tokens: 4096, system: sys?.content, messages: chatMsgs, tools: tools.map((t: any) => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters })) }),
  });
  if (!res.ok) { const err = await res.text(); console.error("Anthropic:", err); throw new Error(`Anthropic: ${res.status}`); }
  const data: any = await res.json();
  const content = data.content?.find((b: any) => b.type === "text")?.text || "";
  const toolCalls = data.content?.filter((b: any) => b.type === "tool_use")?.map((b: any, i: number) => ({ id: b.id || `call_${Date.now()}_${i}`, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input) } })) || [];
  return { content, tool_calls: toolCalls };
}

// ─── Cohere ───────────────────────────────────────────────
async function callCohere(messages: any[], tools: any[], config: ReturnType<typeof getProviderConfig>): Promise<{ content: string; tool_calls: any[] }> {
  const sys = messages.find((m: any) => m.role === "system");
  const chatMsgs = messages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role === "assistant" ? "CHATBOT" : "USER", message: m.content }));
  const cohereTools = tools.map((t: any) => ({ name: t.function.name, description: t.function.description, parameter_definitions: t.function.parameters.properties }));
  const res = await fetch(`${config.baseUrl}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({ model: config.model, messages: chatMsgs, preamble: sys?.content, tools: cohereTools }),
  });
  if (!res.ok) { const err = await res.text(); console.error("Cohere:", err); throw new Error(`Cohere: ${res.status}`); }
  const data: any = await res.json();
  const content = data.message?.content?.[0]?.text || "";
  const toolCalls = data.message?.tool_calls?.map((tc: any, i: number) => ({ id: `call_${Date.now()}_${i}`, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.parameters) } })) || [];
  return { content, tool_calls: toolCalls };
}

// ─── Cloudflare Workers AI ────────────────────────────────
async function callCloudflare(messages: any[], tools: any[], config: ReturnType<typeof getProviderConfig>): Promise<{ content: string; tool_calls: any[] }> {
  // Cloudflare doesn't support tool calling, so we just do chat
  const sys = messages.find((m: any) => m.role === "system");
  const userMsg = messages.filter((m: any) => m.role !== "system").map((m: any) => m.content).join("\n");
  const input = sys ? `${sys.content}\n\n${userMsg}` : userMsg;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "";
  const res = await fetch(`${config.baseUrl.replace("{account_id}", accountId)}/${config.model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: input }] }),
  });
  if (!res.ok) { const err = await res.text(); console.error("Cloudflare:", err); throw new Error(`Cloudflare: ${res.status}`); }
  const data: any = await res.json();
  return { content: data.result?.response || "", tool_calls: [] };
}

// ─── Ollama (local) ──────────────────────────────────────
async function callOllama(messages: any[], tools: any[], _config: ReturnType<typeof getProviderConfig>): Promise<{ content: string; tool_calls: any[] }> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL || "qwen2.5:1.5b", messages, tools, stream: false, options: { temperature: 0.7, num_ctx: 8192 } }),
  });
  if (!res.ok) { const err = await res.text(); console.error("Ollama:", err); throw new Error(`Ollama: ${res.status}`); }
  const data: any = await res.json();
  return { content: data.message?.content || "", tool_calls: data.message?.tool_calls || [] };
}

// ─── Chat Endpoint ────────────────────────────────────────
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "Messages array required" });
    if (!AI_API_KEY && AI_PROVIDER !== "ollama") {
      // 503 + a generic message: the old 500 leaked the provider name and an
      // internal setup URL to any authenticated caller.
      return res.status(503).json({ error: "AI assistant is not configured yet. Please try again soon." });
    }

    // farmId comes from the verified token — never trust the request body.
    const farmId = req.user!.farmId;
    if (!farmId) return res.status(400).json({ error: "No farm associated with account" });

    const fullMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    // ─── Agentic loop ──────────────────────────────────────
    // The canonical tool-use loop: call model, execute tools, feed results
    // back, repeat while the model keeps asking for tools. Bounded by
    // MAX_AGENT_STEPS so a confused model can never spin indefinitely.
    const allSteps: any[] = [];
    let steps = 0;
    let message = "";
    let truncatedByBudget = false;

    while (steps < MAX_AGENT_STEPS) {
      steps++;
      const response = await callAI(fullMessages, mcpTools);
      message = response.content || message;

      if (response.tool_calls.length === 0) break;

      const toolResults: any[] = [];
      for (const tc of response.tool_calls) {
        const step: any = { tool: tc.function.name, args: null, ok: true, result: null };
        try {
          const args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          step.args = args;
          const result = await executeTool(tc.function.name, args, farmId, req.user!.userId);
          if (result && typeof result === "object" && (result as any).error) {
            step.ok = false;
            step.result = (result as any).error;
          } else {
            step.result = summariseToolResult(tc.function.name, result);
          }
        } catch (e: any) {
          step.ok = false;
          step.result = e.message;
        }
        allSteps.push(step);
        toolResults.push({ tool_call_id: tc.id, name: tc.function.name, content: JSON.stringify({ result: step.result, ok: step.ok }) });
      }

      fullMessages.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
      fullMessages.push({ role: "user", content: `Tool results:\n${toolResults.map((t) => `- ${t.name}: ${t.content}`).join("\n")}` });

      // A failed step means the model should stop and explain rather than
      // compounding the mistake with more writes.
      if (allSteps.some((s) => !s.ok)) break;
    }

    if (steps >= MAX_AGENT_STEPS) truncatedByBudget = true;

    return res.json({
      message: { role: "assistant", content: message },
      steps: allSteps,
      truncatedByBudget,
    });
  } catch (error) {
    console.error("AI chat error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ─── Providers List ───────────────────────────────────────
router.get("/providers", (_req: Request, res: Response) => {
  const providers = Object.values(AI_PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    freeModels: p.freeModels,
    rateLimit: p.rateLimit,
    creditCard: p.creditCard,
    website: p.website,
    setupUrl: p.setupUrl,
    configured: p.id === AI_PROVIDER && !!AI_API_KEY,
  }));
  res.json(providers);
});

router.get("/health", (_req: Request, res: Response) => {
  const config = getProviderConfig();
  res.json({
    status: AI_API_KEY || AI_PROVIDER === "ollama" ? "configured" : "needs_api_key",
    provider: config.id,
    providerName: config.name,
    model: config.model,
    hasApiKey: !!AI_API_KEY,
    webSearch: searchConfigured(),
    webSearchTier: searchTierLabel(),
    setupUrl: config.setupUrl,
  });
});

export default router;
