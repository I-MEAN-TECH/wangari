/**
 * WhatsApp Bot for Wangari.
 * Lets farmers manage their farm via WhatsApp messages.
 *
 * Flow: Farmer sends message → Meta webhook → parse command → execute → reply
 *
 * Supported commands:
 *   eggs [number]          — record egg production
 *   milk [number]          — record milk production
 *   mortality [number]     — record bird death
 *   stock                  — check inventory levels
 *   feed                   — check feed stock
 *   balance / money        — check finances
 *   summary / report       — daily farm summary
 *   help                   — show commands
 */

const WHATSAPP_API = "https://graph.facebook.com/v18.0";
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";

// ─── Send a WhatsApp message ──────────────────────────────
export async function sendWhatsAppMessage(to: string, text: string): Promise<boolean> {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    console.log(`[WhatsApp] Would send to ${to}: ${text.slice(0, 80)}...`);
    return false;
  }

  try {
    const res = await fetch(`${WHATSAPP_API}/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/\D/g, ""), // digits only
        type: "text",
        text: { body: text },
      }),
    });
    const data = await res.json();
    if (!data.messages) {
      console.error("[WhatsApp] Send failed:", data.error?.message || data);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[WhatsApp] Send error:", err);
    return false;
  }
}

// ─── Verify webhook (Meta challenge) ──────────────────────
export function verifyWebhook(mode: string, token: string, challenge: string): string | null {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "wangari-bot";
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}

// ─── Parse incoming message ────────────────────────────────
export interface ParsedCommand {
  action: string;
  value: number | null;
  raw: string;
}

export function parseMessage(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  // Help
  if (lower === "help" || lower === "commands" || lower === "?") {
    return { action: "help", value: null, raw: text };
  }

  // Summary / Report
  if (lower.startsWith("summary") || lower.startsWith("report") || lower === "status") {
    return { action: "summary", value: null, raw: text };
  }

  // Stock / Inventory
  if (lower === "stock" || lower === "inventory" || lower === "supplies") {
    return { action: "stock", value: null, raw: text };
  }

  // Feed
  if (lower === "feed" || lower === "feeds" || lower.startsWith("feed ")) {
    return { action: "feed", value: null, raw: text };
  }

  // Balance / Money
  if (lower === "balance" || lower === "money" || lower === "finances" || lower === "cash") {
    return { action: "balance", value: null, raw: text };
  }

  // Sales
  if (lower === "sales" || lower === "revenue") {
    return { action: "sales", value: null, raw: text };
  }

  // Mortality
  const mortMatch = lower.match(/(?:mortality|died|death|dead|lost)\s+(\d+)/);
  if (mortMatch) {
    return { action: "mortality", value: parseInt(mortMatch[1]), raw: text };
  }
  if (lower.startsWith("mortality")) {
    const num = lower.replace("mortality", "").trim();
    if (num && !isNaN(parseInt(num))) {
      return { action: "mortality", value: parseInt(num), raw: text };
    }
  }

  // Eggs
  const eggMatch = lower.match(/(?:eggs?|laid|collected|production)\s+(\d+)/);
  if (eggMatch) {
    return { action: "eggs", value: parseInt(eggMatch[1]), raw: text };
  }
  if (lower.startsWith("egg") || lower.startsWith("laid")) {
    const num = lower.replace(/^(?:eggs?|laid)\s*/, "").trim();
    if (num && !isNaN(parseInt(num))) {
      return { action: "eggs", value: parseInt(num), raw: text };
    }
  }

  // Milk
  const milkMatch = lower.match(/(?:milk)\s+(\d+)/);
  if (milkMatch) {
    return { action: "milk", value: parseInt(milkMatch[1]), raw: text };
  }

  // Generic bare number — too ambiguous to guess (eggs? milk? birds?).
  // Ask the farmer which animal the number belongs to instead of assuming eggs.
  const genericNum = lower.match(/^(\d+)$/);
  if (genericNum) {
    return { action: "unknown", value: null, raw: text };
  }

  // Unknown
  return { action: "unknown", value: null, raw: text };
}

// ─── Help text ─────────────────────────────────────────────
const HELP_TEXT = `🌿 *Wangari Farm Bot*

Here's what I can do:

📝 *Record Production*
  • "eggs 50" — log 50 eggs
  • "milk 10" — log 10 litres milk
  • "mortality 3" — record 3 animal deaths
  • "weight 250" — record average weight (kg)

📊 *Check Status*
  • "stock" — inventory levels
  • "feed" — feed availability
  • "balance" — money in/out
  • "sales" — recent sales
  • "summary" — today's farm summary

❓ *Help*
  • "help" — show this message

Just type a number (e.g. "50") to quickly log eggs!`;

// ─── Execute command against farm data ─────────────────────
export async function executeCommand(
  command: ParsedCommand,
  userId: number,
  farmId: number,
  prisma: any,
): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (command.action) {
    case "help":
      return HELP_TEXT;

    case "eggs": {
      if (!command.value) return "How many eggs? Send: eggs [number]";
      // Find first flock (poultry)
      const flock = await prisma.flock.findFirst({
        where: { farmId },
        orderBy: { createdAt: "desc" },
      });
      if (!flock) return "No livestock groups found. Add a group in the app first.";

      // Check if today's record exists
      const existing = await prisma.productionRecord.findFirst({
        where: { flockId: flock.id, date: { gte: todayStart } },
      });

      if (existing) {
        await prisma.productionRecord.update({
          where: { id: existing.id },
          data: { eggsCollected: (existing.eggsCollected || 0) + command.value },
        });
      } else {
        await prisma.productionRecord.create({
          data: { flockId: flock.id, farmId, date: now, eggsCollected: command.value, mortality: 0 },
        });
      }

      return `✅ *Eggs recorded!*\n${command.value} eggs logged for ${flock.name}.\nTotal today: ${(existing?.eggsCollected || 0) + command.value} eggs`;
    }

    case "milk": {
      if (!command.value) return "How many litres? Send: milk [number]";
      const flock = await prisma.flock.findFirst({
        where: { farmId, type: { contains: "dairy" } },
        orderBy: { createdAt: "desc" },
      });
      if (!flock) return "No dairy group found. Add one in the app first.";

      const existing = await prisma.productionRecord.findFirst({
        where: { flockId: flock.id, date: { gte: todayStart } },
      });

      if (existing) {
        await prisma.productionRecord.update({
          where: { id: existing.id },
          data: { milkCollected: (existing.milkCollected || 0) + command.value },
        });
      } else {
        await prisma.productionRecord.create({
          data: { flockId: flock.id, farmId, date: now, milkCollected: command.value, mortality: 0 },
        });
      }

      return `✅ *Milk recorded!*\n${command.value}L logged for ${flock.name}.\nTotal today: ${(existing?.milkCollected || 0) + command.value}L`;
    }

    case "mortality": {
      if (!command.value) return "How many died? Send: mortality [number]";
      const flock = await prisma.flock.findFirst({
        where: { farmId },
        orderBy: { createdAt: "desc" },
      });
      if (!flock) return "No livestock groups found.";

      const existing = await prisma.productionRecord.findFirst({
        where: { flockId: flock.id, date: { gte: todayStart } },
      });

      if (existing) {
        await prisma.productionRecord.update({
          where: { id: existing.id },
          data: { mortality: (existing.mortality || 0) + command.value },
        });
      } else {
        await prisma.productionRecord.create({
          data: { flockId: flock.id, farmId, date: now, mortality: command.value, eggsCollected: 0 },
        });
      }

      // Update flock count
      await prisma.flock.update({
        where: { id: flock.id },
        data: { currentCount: Math.max(0, (flock.currentCount || 0) - command.value) },
      });

      const warning = command.value >= 5 ? "\n⚠️ *High mortality! Check your flock.*" : "";

      return `📉 *Mortality recorded*\n${command.value} death(s) in ${flock.name}.\nRemaining: ${Math.max(0, (flock.currentCount || 0) - command.value)}${warning}`;
    }

    case "stock": {
      const items = await prisma.inventoryItem.findMany({
        where: { farmId },
        orderBy: { name: "asc" },
      });
      if (items.length === 0) return "No inventory items tracked yet.";

      const lines = items.slice(0, 10).map((item: any) => {
        const low = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
        return `${low ? "⚠️" : "•"} *${item.name}*: ${item.quantity} ${item.unit}${low ? " (LOW)" : ""}`;
      });

      return `📦 *Inventory*\n\n${lines.join("\n")}\n\n_Total: ${items.length} items_`;
    }

    case "feed": {
      const feeds = await prisma.inventoryItem.findMany({
        where: { farmId, category: { contains: "feed", mode: "insensitive" } },
      });
      if (feeds.length === 0) return "No feed items tracked. Add feed in Inventory.";

      const lines = feeds.map((f: any) => {
        const low = f.reorderLevel > 0 && f.quantity <= f.reorderLevel;
        return `${low ? "⚠️" : "•"} *${f.name}*: ${f.quantity} ${f.unit}${low ? " (REORDER)" : ""}`;
      });

      return `🌾 *Feed Stock*\n\n${lines.join("\n")}`;
    }

    case "balance": {
      const now2 = new Date();
      const monthStart = new Date(now2.getFullYear(), now2.getMonth(), 1);

      const txs = await prisma.transaction.findMany({
        where: { farmId, date: { gte: monthStart } },
      });

      const income = txs.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const expenses = txs.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const profit = income - expenses;

      return `💰 *This Month*\n\nIncome:    KES ${income.toLocaleString()}\nExpenses:  KES ${expenses.toLocaleString()}\n─────────\nProfit:    KES ${profit.toLocaleString()}${profit < 0 ? "\n⚠️ *Loss this month*" : ""}`;
    }

    case "sales": {
      const recentSales = await prisma.transaction.findMany({
        where: { farmId, type: "income" },
        orderBy: { date: "desc" },
        take: 5,
      });

      if (recentSales.length === 0) return "No sales recorded yet.";

      const lines = recentSales.map((s: any) =>
        `• ${s.description || "Sale"} — KES ${Number(s.amount).toLocaleString()} (${new Date(s.date).toLocaleDateString()})`
      );

      return `🛒 *Recent Sales*\n\n${lines.join("\n")}`;
    }

    case "summary": {
      // Today's production
      const prod = await prisma.productionRecord.findMany({
        where: { farmId, date: { gte: todayStart } },
        include: { flock: true },
      });

      const totalEggs = prod.reduce((s: number, p: any) => s + (p.eggsCollected || 0), 0);
      const totalMilk = prod.reduce((s: number, p: any) => s + (p.milkCollected || 0), 0);
      const totalMortality = prod.reduce((s: number, p: any) => s + (p.mortality || 0), 0);

      // Flock count
      const flocks = await prisma.flock.findMany({ where: { farmId } });
      const totalBirds = flocks.reduce((s: number, f: any) => s + (f.currentCount || 0), 0);

      // Low stock alerts
      const lowItems = await prisma.inventoryItem.findMany({
        where: { farmId, reorderLevel: { gt: 0 }, quantity: { lte: prisma.inventoryItem.fields?.quantity || 0 } },
      }).catch(() => []);

      const lines = [
        `🐔 *Birds:* ${totalBirds}`,
        `🥚 *Eggs:* ${totalEggs}`,
      ];
      if (totalMilk > 0) lines.push(`🥛 *Milk:* ${totalMilk}L`);
      if (totalMortality > 0) lines.push(`📉 *Mortality:* ${totalMortality}`);
      if (lowItems.length > 0) lines.push(`⚠️ *Low stock:* ${lowItems.length} items`);

      return `📊 *Today's Summary*\n\n${lines.join("\n")}\n\n_Good farming! 🌿_`;
    }

    case "unknown":
    default:
      return `🤔 I didn't understand that.\n\nSend *help* to see what I can do.`;
  }
}
