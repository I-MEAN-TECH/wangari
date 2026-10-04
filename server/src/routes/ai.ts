import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { requireOwner } from "../middleware/requireOwner.js";
import { authMiddleware } from "../middleware/auth.js";
import { AI_PROVIDERS, getProvider, type AIProviderConfig } from "../ai-providers.js";
import { pickBestFreeModel } from "../lib/free-models.js";

const router = Router();
router.use(authMiddleware, requireOwner);

// ─── Provider Configuration ───────────────────────────────
// Default to OpenRouter free models: no card, no billing, and the free-model
// roster is refreshed by OpenRouter rather than hard-coded here. This is for
// DEV AND DEMO ONLY — free quota is ~1 req/min and OpenRouter's terms bar
// reselling API access. Set AI_PROVIDER=gemini with a billing account before
// any real farmer pays (see docs/AI-PROVIDER-SETUP.md).
const AI_PROVIDER = process.env.AI_PROVIDER || "openrouter";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_BASE_URL = process.env.AI_BASE_URL || "";
const AI_MODEL = process.env.AI_MODEL || "";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

// Hard ceiling on agent turns per request. An LLM asked to "do anything" will
// happily loop; this bounds wall-clock time, DB load and spend for one farmer.
const MAX_AGENT_STEPS = Number(process.env.AI_MAX_STEPS || 8);

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

/**
 * A free model that passed an agentic probe, or null while unknown.
 *
 * Read SYNCHRONOUSLY by getProviderConfig, because the five provider
 * helpers all take a plain config object. An earlier attempt awaited here
 * and turned the model into a Promise, which typechecked loudly but would
 * have sent "[object Promise]" as the model name.
 *
 * Discovery is kicked off at module load (see the warm-up below) and the
 * value lands here whenever it resolves. A request that arrives first uses
 * the configured default; that is the correct trade — the alternative is
 * making every farmer wait on a network probe.
 */
let verifiedFreeModel: string | null = null;

/** Kick off discovery once at boot so the first farmer does not pay for it. */
function warmModelCache(): void {
  if (AI_MODEL || !AI_API_KEY || AI_PROVIDER !== "openrouter") return;
  pickBestFreeModel(AI_API_KEY, { baseUrl: AI_BASE_URL || undefined })
    .then((pick) => {
      if (pick?.model) {
        verifiedFreeModel = pick.model;
        if (!pick.verified) {
          // Loud on purpose: a fallback means the allowlist needs updating,
          // and that should be visible in the deploy logs, not discovered
          // by a farmer mid-demo.
          console.warn(
            `[ai] verified free model unavailable; using discovered fallback ` +
              `${pick.model} after ${pick.probed} probe(s). Update VERIFIED_MODELS.`,
          );
        }
      }
    })
    .catch(() => {
      /* keep the configured default; a failed probe must not block boot */
    });
}
warmModelCache();

function getProviderConfig(): AIProviderConfig & { model: string; baseUrl: string } {
  const provider = getProvider(AI_PROVIDER) || getProvider("gemini")!;
  return {
    ...provider,
    // A verified working model overrides the hard-coded default, so a model
    // OpenRouter retires overnight does not take the assistant down. An
    // explicit AI_MODEL still wins: an operator who pinned a model meant it.
    model: AI_MODEL || verifiedFreeModel || provider.defaultModel,
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

When the user asks you to do something, DO IT. Use the tools to read data, create records, and manage the farm.`;

// ─── Tool Executor ────────────────────────────────────────
async function executeTool(toolName: string, args: Record<string, any>, farmId: number): Promise<any> {
  switch (toolName) {
    case "list_flocks": return prisma.flock.findMany({ where: { farmId } });
    case "create_flock": return prisma.flock.create({ data: { name: args.name, breed: args.breed, currentCount: args.initialCount, initialCount: args.initialCount, type: args.type || "layer", farmId, status: "active" } });
    case "delete_flock": { const snap = await prisma.flock.findFirst({ where: { id: args.id, farmId } }); if (!snap) return { error: "Flock not found on this farm" }; await prisma.flock.deleteMany({ where: { id: args.id, farmId } }); pushUndo(farmId, { undoId: "undo_flock", tool: "create_flock", args: { name: snap.name, breed: snap.breed, initialCount: snap.initialCount, type: (snap as any).type }, snapshot: snap }); return { deleted: true, undoId: "undo_flock", restored: snap.name }; }
    case "list_production": { const d = (args.days as number) || 7; const s = new Date(); s.setDate(s.getDate() - d); return prisma.dailyProduction.findMany({ where: { farmId, date: { gte: s } }, orderBy: { date: "desc" } }); }
    case "record_production": return prisma.dailyProduction.create({ data: { flockId: args.flockId, date: new Date().toISOString().split("T")[0], eggsCollected: args.eggsCollected || 0, mortality: args.mortality || 0, feedUsed: args.feedUsed || 0, farmId } });
    case "list_transactions": { const now = new Date(); let s = new Date(); const p = (args.period as string) || "month"; if (p === "week") s.setDate(now.getDate() - 7); else if (p === "month") s.setMonth(now.getMonth() - 1); else s.setFullYear(now.getFullYear() - 1); return prisma.transaction.findMany({ where: { farmId, date: { gte: s } }, orderBy: { date: "desc" } }); }
    case "create_transaction": return prisma.transaction.create({ data: { type: args.type, amount: args.amount, category: args.category, description: args.description, date: new Date().toISOString().split("T")[0], farmId } });
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
    case "record_attendance": return prisma.attendance.create({ data: { workerId: args.workerId, date: new Date().toISOString().split("T")[0], status: args.status, notes: args.notes || null, farmId } });
    case "list_crops": return prisma.crop.findMany({ where: { farmId }, include: { harvests: true } });
    case "create_crop": { const raw = args.areaAcres !== undefined && args.areaAcres !== null ? Number(args.areaAcres) : null; if (raw !== null && (!Number.isFinite(raw) || raw <= 0)) return { error: "areaAcres must be a positive number of acres" }; return prisma.crop.create({ data: { name: args.fieldName || args.name, cropType: args.cropType, variety: args.variety, areaAcres: raw, farmId } }); }
    case "get_weather": return { note: "Weather available via /api/weather" };
    case "get_dashboard": {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceDay = since.toISOString().split("T")[0];
      const [flocks, production, txs, sales, inventory] = await Promise.all([
        prisma.flock.findMany({ where: { farmId } }),
        prisma.dailyProduction.findMany({ where: { farmId, date: { gte: sinceDay } }, orderBy: { date: "desc" }, take: 30 }),
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
    case "undo_last_action": { const stack = undoStacks.get(farmId) || []; const last = stack[stack.length - 1]; if (!last) return { error: "Nothing to undo" }; stack.pop(); undoStacks.set(farmId, stack); if (last.undoId === "undo_flock") { const s = last.snapshot as any; const restored = await prisma.flock.create({ data: { name: s.name, breed: s.breed, initialCount: s.initialCount, currentCount: s.currentCount, type: (s as any).type || "layer", status: "active", farmId } }); return { undone: "flock_deletion", restored: restored.name }; } if (last.undoId === "undo_transaction") { const restored = await prisma.transaction.create({ data: { farmId, type: last.args.type, amount: last.args.amount, category: last.args.category, description: last.args.description, date: new Date().toISOString().split("T")[0] } }); return { undone: "transaction_deletion", id: restored.id }; } return { error: `Cannot undo ${last.tool}` }; }
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

    while (steps < MAX_AGENT_STEPS) {
      if (aborted) break;
      steps++;
      const response = await callAI(convo, mcpTools);
      text = response.content || text;

      if (response.tool_calls.length === 0) {
        send("message", { content: text });
        break;
      }

      const toolResults: any[] = [];
      for (const tc of response.tool_calls) {
        if (aborted) break;
        const toolName = tc.function.name;
        let args: any = {};
        try {
          args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        } catch {
          args = {};
        }
        send("tool_start", { tool: toolName, args, step: steps });

        let payload: any;
        let ok = true;
        try {
          const result = await executeTool(toolName, args, farmId);
          if (result && typeof result === "object" && (result as any).error) {
            ok = false;
            payload = { error: (result as any).error };
          } else {
            payload = { result: summariseToolResult(toolName, result) };
          }
        } catch (e: any) {
          ok = false;
          payload = { error: e.message };
        }

        send("tool_end", { tool: toolName, ok, ...payload });
        toolResults.push({ tool_call_id: tc.id, name: toolName, content: JSON.stringify({ ...payload, ok }) });
      }

      convo.push({ role: "assistant", content: response.content, tool_calls: response.tool_calls });
      convo.push({ role: "user", content: `Tool results:\n${toolResults.map((t) => `- ${t.name}: ${t.content}`).join("\n")}` });

      if (toolResults.some((t) => String(t.content).includes('"ok":false'))) {
        send("message", { content: text || "I could not finish that action. Please check the details above." });
        break;
      }
      if (steps >= MAX_AGENT_STEPS) truncatedByBudget = true;
    }

    if (aborted) {
      res.end();
      return;
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
    undo_last_action: "Undid last action",
    get_weather: "Checked weather",
    get_dashboard: "Read farm summary",
  };
  const verb = labels[tool] || tool;
  try {
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
async function callAI(messages: any[], tools: any[]): Promise<{ content: string; tool_calls: any[] }> {
  const config = getProviderConfig();

  // Special handling for non-OpenAI-compatible providers
  if (config.id === "gemini") return callGemini(messages, tools, config);
  if (config.id === "anthropic") return callAnthropic(messages, tools, config);
  if (config.id === "cohere") return callCohere(messages, tools, config);
  if (config.id === "cloudflare") return callCloudflare(messages, tools, config);
  if (config.id === "ollama") return callOllama(messages, tools, config);

  // All OpenAI-compatible providers (OpenRouter, Groq, Cerebras, Mistral, GitHub, NVIDIA, DeepSeek, OpenAI)
  return callOpenAICompatible(messages, tools, config);
}

// ─── OpenAI-Compatible (most providers) ───────────────────
async function callOpenAICompatible(messages: any[], tools: any[], config: ReturnType<typeof getProviderConfig>): Promise<{ content: string; tool_calls: any[] }> {
  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({ model: config.model, messages, tools, temperature: 0.7, max_tokens: 4096 }),
  });
  if (!res.ok) { const err = await res.text(); console.error(`${config.name}:`, err); throw new Error(`${config.name}: ${res.status}`); }
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
          const result = await executeTool(tc.function.name, args, farmId);
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
    setupUrl: config.setupUrl,
  });
});

export default router;
