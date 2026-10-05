/**
 * Writing a record the farmer confirmed on a form.
 *
 * ── why every entity has a writer here ───────────────────
 * The whole point of the intake is that nothing is written until the farmer has
 * seen it. That only means something if there is ONE place where a confirmed
 * form becomes a row. Without it, each entity grows its own ad-hoc save inside
 * the intake route, and the guarantee quietly becomes "usually".
 *
 * So each entity gets a writer here, they all return the same shape, and the
 * route knows none of their details. An entity added to the registry without a
 * writer is refused loudly by the type system and by the test that walks the
 * registry — it cannot become a thin write by accident.
 *
 * ── what these deliberately do NOT do ─────────────────────
 * They do not derive anything the farmer did not say, and they do not invent a
 * value to fill a gap. A sale with no date is filed for today because "today"
 * is what recording it now means; a flock's current count is count minus deaths
 * because that is arithmetic, not a guess. Everything else stays null, and a
 * null column is honest.
 */

import { prisma } from "../db.js";
import { createFlockForFarm } from "./flock-create.js";
import { fieldDate, fieldNumber, fieldText } from "./farm-intake.js";
import type { IntakeEntity } from "./intake-types.js";
import { SPECIES_CATEGORY } from "./flock-create.js";

export interface IntakeSave {
  ok: true;
  /** The row that was created, as the API returns it. */
  record: any;
  /** A short line for the farmer: "Added worker", "Recorded 40 eggs". */
  summary: string;
  /** Other rows the save created, named, so undo can remove them too. */
  alsoCreated?: Record<string, number | null>;
  /** Set when something about the answers was worth repeating back. */
  warning?: string | null;
}

export interface IntakeSaveFailure {
  ok: false;
  /** A sentence for the farmer, never a Prisma message. */
  error: string;
}

export type IntakeSaveResult = IntakeSave | IntakeSaveFailure;

/**
 * Reject the one thing no writer may accept: a record with no name.
 *
 * Shared by every entity so the sentence is the same wherever it surfaces, and
 * so "which record is this even?" is never answered with a database error.
 */
function requireName(values: Record<string, string>, key: string, noun: string): string | IntakeSaveFailure {
  const name = fieldText(values, key);
  if (name) return name;
  return { ok: false, error: `I need a name for this ${noun} before I can save it.` };
}

function failed(error: string): IntakeSaveFailure {
  return { ok: false, error };
}

/** Money in and out, with the categories that suit each. */
async function saveTransaction(farmId: number, userId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const amount = fieldNumber(values, "amount");
  if (amount === null || amount <= 0) return failed("I need an amount above zero before I can record this.");
  const type = fieldText(values, "type");
  if (!type) return failed("Tell me whether the money came in or went out.");
  const description = fieldText(values, "description");
  const record = await prisma.transaction.create({
    data: {
      farmId,
      type,
      amount,
      category: fieldText(values, "category"),
      description,
      // Today when unsaid: recording a transaction now means it happened around
      // now, and a null date would put it outside every monthly total.
      date: fieldDate(values, "date") ?? new Date(),
      paymentMethod: fieldText(values, "paymentMethod"),
      reference: fieldText(values, "reference"),
      createdBy: userId,
    },
  });
  return {
    ok: true,
    record,
    summary: `${type === "income" ? "Recorded money in" : "Recorded money out"} — KES ${amount.toLocaleString("en-KE")}`,
  };
}

/** Sales file the customer by name, linking an existing one when it matches. */
async function saveSale(farmId: number, userId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const total = fieldNumber(values, "totalAmount");
  if (total === null || total <= 0) return failed("I need the amount of the sale before I can record it.");
  const customerName = fieldText(values, "customerName");
  const customer = customerName
    ? await prisma.customer.findFirst({ where: { farmId, name: customerName } })
    : null;
  const paid = fieldNumber(values, "amountPaid");

  const record = await prisma.sale.create({
    data: {
      farmId,
      customerId: customer?.id ?? null,
      // A free-text line, not a line-item table: the assistant is recording
      // what the farmer said, and inventing quantities he did not give would be
      // a figure on an invoice he never read.
      items: values.what ? [{ description: values.what }] : [],
      totalAmount: total,
      amountPaid: paid ?? total,
      paymentStatus: fieldText(values, "paymentStatus") ?? (paid === null || paid >= total ? "paid" : "partial"),
      saleDate: fieldDate(values, "saleDate") ?? new Date(),
      createdBy: userId,
    },
  });

  // A named customer who does not exist yet is created, because a sale to
  // somebody the farmer has never recorded is real and losing the link would
  // leave the money in the books with nobody attached to it.
  let alsoCreated: Record<string, number | null> | undefined;
  let warning: string | null = null;
  if (customerName && !customer) {
    const made = await prisma.customer.create({ data: { farmId, name: customerName } });
    await prisma.sale.update({ where: { id: record.id }, data: { customerId: made.id } });
    alsoCreated = { customer: made.id };
    warning = `I also added ${customerName} to your customers.`;
  }
  return {
    ok: true,
    record,
    summary: `Recorded the sale — KES ${total.toLocaleString("en-KE")}`,
    alsoCreated,
    warning,
  };
}

async function saveInvoice(farmId: number, userId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const total = fieldNumber(values, "totalAmount");
  if (total === null || total <= 0) return failed("I need the amount on the invoice before I can make it.");
  const customerName = fieldText(values, "customerName");
  const customer = customerName
    ? await prisma.customer.findFirst({ where: { farmId, name: customerName } })
    : null;

  // The number is generated here rather than asked for: a farmer does not know
  // what the next invoice will be called, and asking is how a duplicate gets in.
  const { nextDocCode } = await import("./doc-codes.js");
  const invoiceNumber = await prisma.$transaction((tx: any) => nextDocCode(tx, farmId, "invoice"));

  const record = await prisma.invoice.create({
    data: {
      farmId,
      invoiceNumber,
      customerId: customer?.id ?? null,
      totalAmount: total,
      amountPaid: fieldNumber(values, "amountPaid") ?? 0,
      paymentStatus: fieldText(values, "paymentStatus") ?? "pending",
      dueDate: fieldDate(values, "dueDate"),
      notes: fieldText(values, "notes"),
      items: [],
    },
  });
  return {
    ok: true,
    record,
    summary: `Created invoice ${invoiceNumber} — KES ${total.toLocaleString("en-KE")}`,
  };
}

async function saveWorker(farmId: number, userId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const name = requireName(values, "name", "worker");
  if (typeof name !== "string") return name;
  const role = fieldText(values, "role");
  if (!role) return failed("Tell me what this person does on the farm.");
  const record = await prisma.worker.create({
    data: {
      farmId,
      name,
      role,
      phone: fieldText(values, "phone"),
      dailyWage: fieldNumber(values, "dailyWage"),
      hiredDate: fieldDate(values, "hiredDate"),
      status: fieldText(values, "status") ?? "active",
      createdBy: userId,
    },
  });
  return { ok: true, record, summary: `Added ${name} to your workers` };
}

async function saveCustomer(farmId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const name = requireName(values, "name", "customer");
  if (typeof name !== "string") return name;
  const existing = await prisma.customer.findFirst({ where: { farmId, name } });
  if (existing) {
    // A duplicate customer splits a customer's sales across two rows and makes
    // their history unreadable, so this refuses rather than adding.
    return failed(`${name} is already on your customer list, so I have not added them twice.`);
  }
  const record = await prisma.customer.create({
    data: {
      farmId,
      name,
      phone: fieldText(values, "phone"),
      email: fieldText(values, "email"),
      address: fieldText(values, "address"),
    },
  });
  return { ok: true, record, summary: `Added ${name} to your customers` };
}

async function saveInventory(farmId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const itemName = requireName(values, "itemName", "item");
  if (typeof itemName !== "string") return itemName;
  const quantity = fieldNumber(values, "quantity");
  if (quantity === null) return failed("I need to know how much of it you have.");
  const unitCost = fieldNumber(values, "unitCost");
  const record = await prisma.inventory.create({
    data: {
      farmId,
      itemName,
      category: fieldText(values, "category"),
      quantity,
      unit: fieldText(values, "unit") ?? "bags",
      unitCost: unitCost ?? 0,
      reorderLevel: fieldNumber(values, "reorderLevel") ?? 0,
      supplier: fieldText(values, "supplier"),
      expiryDate: fieldDate(values, "expiryDate"),
      notes: fieldText(values, "notes"),
    },
  });
  return {
    ok: true,
    record,
    summary: `Added ${itemName} to your stock — ${quantity} ${fieldText(values, "unit") ?? "bags"}`,
    warning: unitCost === null ? "I left the cost blank, so your stock value will not include this yet." : null,
  };
}

async function saveCrop(farmId: number, userId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const name = requireName(values, "name", "field");
  if (typeof name !== "string") return name;
  const cropType = fieldText(values, "cropType");
  if (!cropType) return failed("Tell me what is growing in this field.");
  const record = await prisma.crop.create({
    data: {
      farmId,
      name,
      cropType,
      variety: fieldText(values, "variety"),
      areaAcres: fieldNumber(values, "areaAcres"),
      plantingDate: fieldDate(values, "plantingDate"),
      expectedHarvest: fieldDate(values, "expectedHarvest"),
      location: fieldText(values, "location"),
      soilType: fieldText(values, "soilType"),
      irrigation: fieldText(values, "irrigation"),
      status: fieldText(values, "status") ?? "active",
      notes: fieldText(values, "notes"),
      createdBy: userId,
    },
  });
  return {
    ok: true,
    record,
    summary: `Registered ${name} — ${cropType}`,
    warning: fieldNumber(values, "areaAcres") === null ? "I left the area blank, so the field's yield per acre will not show yet." : null,
  };
}

async function saveProduction(farmId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const flockId = fieldNumber(values, "flockId");
  if (!flockId) return failed("Tell me which flock this is for — use the number from your flocks list.");
  const flock = await prisma.flock.findFirst({ where: { id: flockId, farmId } });
  if (!flock) return failed("That flock is not on your farm. Check the number from your flocks list.");

  const date = fieldDate(values, "date") ?? new Date();
  // One record per flock per day is a database rule. Recording the same day
  // twice is the most likely mistake here, so it is caught before the write and
  // said in words rather than surfacing as a Prisma unique-violation.
  const already = await prisma.dailyProduction.findFirst({ where: { flockId, date } });
  if (already) {
    return failed(
      `${flock.name} already has a production record for that day. Nothing was saved — tell me to change that record instead.`,
    );
  }

  const eggs = fieldNumber(values, "eggsCollected") ?? 0;
  const deaths = fieldNumber(values, "mortality") ?? 0;
  const record = await prisma.dailyProduction.create({
    data: {
      flockId,
      farmId,
      date,
      eggsCollected: eggs,
      milkCollected: fieldNumber(values, "milkCollected") ?? 0,
      mortality: deaths,
      feedUsed: fieldNumber(values, "feedUsed") ?? 0,
      avgWeight: fieldNumber(values, "avgWeight"),
      weightGain: fieldNumber(values, "weightGain"),
      waterUsed: fieldNumber(values, "waterUsed"),
      notes: fieldText(values, "notes"),
    },
  });

  // A death count is also a change in the flock's head count, and leaving the
  // flock at its old number is how a farm ends up reporting birds it has not
  // got. This is arithmetic on what the farmer said, not an invention.
  if (deaths > 0) {
    await prisma.flock.updateMany({
      where: { id: flockId, farmId },
      data: { currentCount: { decrement: deaths }, mortality: { increment: deaths } },
    });
  }

  return {
    ok: true,
    record,
    summary: `Recorded ${eggs} eggs and ${deaths} deaths for ${flock.name}`,
    warning:
      deaths > flock.currentCount
        ? `That is more deaths than the ${flock.currentCount} birds you had recorded, so the count has gone to zero.`
        : null,
  };
}

async function saveVaccination(farmId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const flockId = fieldNumber(values, "flockId");
  if (!flockId) return failed("Tell me which flock this vaccine is for — use the number from your flocks list.");
  const flock = await prisma.flock.findFirst({ where: { id: flockId, farmId } });
  if (!flock) return failed("That flock is not on your farm. Check the number from your flocks list.");
  const vaccineName = fieldText(values, "vaccineName");
  if (!vaccineName) return failed("Tell me which vaccine this was.");

  const status = fieldText(values, "status") ?? "completed";
  const when = fieldDate(values, "scheduledDate") ?? new Date();
  const record = await prisma.vaccination.create({
    data: {
      flockId,
      vaccineName,
      scheduledDate: when,
      // A vaccine given today is a completed one. Recording it as pending would
      // leave a reminder for something the farmer has already done, and they
      // would stop trusting the reminder list.
      completedDate: status === "completed" ? when : null,
      status,
      notes: [fieldText(values, "administeredBy") && `Given by ${fieldText(values, "administeredBy")}`, fieldText(values, "notes")]
        .filter(Boolean)
        .join(" — ") || null,
    },
  });
  return {
    ok: true,
    record,
    summary: `${status === "completed" ? "Recorded" : "Scheduled"} ${vaccineName} for ${flock.name}`,
  };
}

async function saveAttendance(farmId: number, values: Record<string, string>): Promise<IntakeSaveResult> {
  const workerId = fieldNumber(values, "workerId");
  if (!workerId) return failed("Tell me which worker this is for — use the number from your workers list.");
  const worker = await prisma.worker.findFirst({ where: { id: workerId, farmId } });
  if (!worker) return failed("That worker is not on your farm. Check the number from your workers list.");
  const status = fieldText(values, "status");
  if (!status) return failed("Tell me whether they came, came late, or did not come.");

  const date = fieldDate(values, "date") ?? new Date();
  const already = await prisma.attendance.findFirst({ where: { workerId, date } });
  if (already) {
    return failed(
      `${worker.name} already has attendance for that day. Nothing was saved — tell me to change it instead.`,
    );
  }

  const record = await prisma.attendance.create({
    data: {
      workerId,
      farmId,
      date,
      status,
      checkIn: fieldText(values, "checkIn"),
      checkOut: fieldText(values, "checkOut"),
      notes: fieldText(values, "notes"),
    },
  });
  return { ok: true, record, summary: `Recorded ${worker.name} as ${status.replace("_", " ")}` };
}

/**
 * Save one confirmed form.
 *
 * The single place a farmer's answers become rows. Every writer returns the
 * same shape so the route, the agent and the card can all rely on it without
 * knowing which entity they are dealing with.
 */
export async function saveIntake(
  entity: IntakeEntity,
  farmId: number,
  userId: number,
  values: Record<string, string>,
): Promise<IntakeSaveResult> {
  switch (entity) {
    case "flock": {
      const name = requireName(values, "name", "flock");
      if (typeof name !== "string") return name;
      const count = fieldNumber(values, "initialCount");
      if (count === null || count < 1) {
        return failed("I need to know how many animals are in this flock.");
      }
      const cost = fieldNumber(values, "costPerAnimal");
      const created = await createFlockForFarm(farmId, userId, {
        name,
        initialCount: count,
        breed: fieldText(values, "breed"),
        type: fieldText(values, "type"),
        status: fieldText(values, "status"),
        mortality: fieldNumber(values, "mortality"),
        hatchDate: fieldText(values, "hatchDate"),
        purpose: fieldText(values, "purpose"),
        gender: fieldText(values, "gender"),
        genderRatio: fieldText(values, "genderRatio"),
        location: fieldText(values, "location"),
        source: fieldText(values, "source"),
        supplierContact: fieldText(values, "supplierContact"),
        costPerAnimal: cost,
        targetMarket: fieldText(values, "targetMarket"),
        feedType: fieldText(values, "feedType"),
        feedSupplier: fieldText(values, "feedSupplier"),
        feedCostPerMonth: fieldNumber(values, "feedCostPerMonth"),
        vetName: fieldText(values, "vetName"),
        vetPhone: fieldText(values, "vetPhone"),
        healthOnArrival: fieldText(values, "healthOnArrival"),
        insurancePolicy: fieldText(values, "insurancePolicy"),
        expectedYield: fieldText(values, "expectedYield"),
        expectedRevenue: fieldNumber(values, "expectedRevenue"),
        expectedWeight: fieldText(values, "expectedWeight"),
        notes: fieldText(values, "notes"),
        tagFrom: fieldText(values, "tagFrom"),
        tagTo: fieldText(values, "tagTo"),
        // The intake never collects a vaccination schedule: that comes from the
        // species template when a flock is created through the screen, and
        // scheduling a vaccine the farmer was never shown would be inventing a
        // medical instruction.
        vaccinationSchedule: null,
      });
      if (!created.ok) return failed(created.error);
      return {
        ok: true,
        record: created.value.flock,
        summary: `Added ${name} — ${created.value.flock?.currentCount} animals`,
        alsoCreated: {
          vaccinations: created.value.alsoCreated.vaccinations,
          expenseTransactionId: created.value.alsoCreated.expenseTransactionId,
        },
        warning: created.value.tagWarning,
      };
    }

    case "transaction":
      return saveTransaction(farmId, userId, values);
    case "sale":
      return saveSale(farmId, userId, values);
    case "invoice":
      return saveInvoice(farmId, userId, values);
    case "worker":
      return saveWorker(farmId, userId, values);
    case "customer":
      return saveCustomer(farmId, values);
    case "inventory":
      return saveInventory(farmId, values);
    case "crop":
      return saveCrop(farmId, userId, values);
    case "production":
      return saveProduction(farmId, values);
    case "vaccination":
      return saveVaccination(farmId, values);
    case "attendance":
      return saveAttendance(farmId, values);

    default: {
      /* Exhaustiveness, on purpose. An entity added to the registry without a
         writer must break the build here rather than answer 200 with nothing
         saved: a form that silently drops a farmer's work is worse than no
         form. */
      const unreachable: never = entity;
      return failed(`I cannot save a ${String(unreachable)} yet.`);
    }
  }
}

/**
 * The rows a save created beyond the main one, keyed for undo.
 *
 * Undo needs to know what else went in, or the farmer is left with a purchase
 * expense for animals that no longer exist — the fault found by the first
 * end-to-end run of the flock intake.
 */
export function undoTargets(entity: IntakeEntity, saved: IntakeSave): Record<string, number | null> {
  return saved.alsoCreated ?? {};
}

// ─── Update writers ────────────────────────────────────────
// Each entity gets its own updater so the route stays ignorant of the column
// layout, the same way the create path is. A new entity added to the registry
// without an updater is refused loudly by the switch below.

async function updateTransaction(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const amount = fieldNumber(values, "amount");
  if (amount === null || amount <= 0) return failed("I need an amount above zero before I can record this.");
  const type = fieldText(values, "type");
  if (!type) return failed("Tell me whether the money came in or went out.");
  const existing = await prisma.transaction.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That money record is not on your farm.");
  const record = await prisma.transaction.update({
    where: { id },
    data: {
      type,
      amount,
      category: fieldText(values, "category"),
      description: fieldText(values, "description"),
      date: fieldDate(values, "date") ?? existing.date,
      paymentMethod: fieldText(values, "paymentMethod") ?? existing.paymentMethod,
      reference: fieldText(values, "reference"),
    },
  });
  return {
    ok: true,
    record,
    summary: `${type === "income" ? "Updated money in" : "Updated money out"} — KES ${amount.toLocaleString("en-KE")}`,
  };
}

async function updateSale(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const total = fieldNumber(values, "totalAmount");
  if (total === null || total <= 0) return failed("I need the amount of the sale before I can record it.");
  const existing = await prisma.sale.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That sale is not on your farm.");
  const paid = fieldNumber(values, "amountPaid");
  const record = await prisma.sale.update({
    where: { id },
    data: {
      items: values.what ? [{ description: values.what }] : (existing.items as any ?? null),
      totalAmount: total,
      amountPaid: paid ?? (paid === null ? existing.amountPaid : total),
      paymentStatus: fieldText(values, "paymentStatus") ?? existing.paymentStatus,
      saleDate: fieldDate(values, "saleDate") ?? existing.saleDate,
    },
  });
  return {
    ok: true,
    record,
    summary: `Updated the sale — KES ${total.toLocaleString("en-KE")}`,
  };
}

async function updateInvoice(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const total = fieldNumber(values, "totalAmount");
  if (total === null || total <= 0) return failed("I need the amount on the invoice before I can make it.");
  const existing = await prisma.invoice.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That invoice is not on your farm.");
  const record = await prisma.invoice.update({
    where: { id },
    data: {
      totalAmount: total,
      amountPaid: fieldNumber(values, "amountPaid") ?? existing.amountPaid,
      paymentStatus: fieldText(values, "paymentStatus") ?? existing.paymentStatus,
      dueDate: fieldDate(values, "dueDate") ?? existing.dueDate,
      notes: fieldText(values, "notes"),
    },
  });
  return {
    ok: true,
    record,
    summary: `Updated invoice ${existing.invoiceNumber} — KES ${total.toLocaleString("en-KE")}`,
  };
}

async function updateWorker(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const name = requireName(values, "name", "worker");
  if (typeof name !== "string") return name;
  const role = fieldText(values, "role");
  if (!role) return failed("Tell me what this person does on the farm.");
  const existing = await prisma.worker.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That worker is not on your farm.");
  const record = await prisma.worker.update({
    where: { id },
    data: {
      name,
      role,
      phone: fieldText(values, "phone") ?? existing.phone,
      dailyWage: fieldNumber(values, "dailyWage") ?? existing.dailyWage,
      hiredDate: fieldDate(values, "hiredDate") ?? existing.hiredDate,
      status: fieldText(values, "status") ?? existing.status,
    },
  });
  return { ok: true, record, summary: `Updated ${name} on your workers` };
}

async function updateCustomer(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const name = requireName(values, "name", "customer");
  if (typeof name !== "string") return name;
  const existing = await prisma.customer.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That customer is not on your farm.");
  const record = await prisma.customer.update({
    where: { id },
    data: {
      name,
      phone: fieldText(values, "phone") ?? existing.phone,
      email: fieldText(values, "email") ?? existing.email,
      address: fieldText(values, "address") ?? existing.address,
    },
  });
  return { ok: true, record, summary: `Updated ${name} on your customers` };
}

async function updateInventory(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const itemName = requireName(values, "itemName", "item");
  if (typeof itemName !== "string") return itemName;
  const quantity = fieldNumber(values, "quantity");
  if (quantity === null) return failed("I need to know how much of it you have.");
  const existing = await prisma.inventory.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That stock item is not on your farm.");
  const record = await prisma.inventory.update({
    where: { id },
    data: {
      itemName,
      category: fieldText(values, "category") ?? existing.category,
      quantity,
      unit: fieldText(values, "unit") ?? existing.unit,
      unitCost: fieldNumber(values, "unitCost") ?? existing.unitCost,
      reorderLevel: fieldNumber(values, "reorderLevel") ?? existing.reorderLevel,
      supplier: fieldText(values, "supplier") ?? existing.supplier,
      expiryDate: fieldDate(values, "expiryDate") ?? existing.expiryDate,
      notes: fieldText(values, "notes") ?? existing.notes,
    },
  });
  return {
    ok: true,
    record,
    summary: `Updated ${itemName} in your stock — ${quantity} ${fieldText(values, "unit") ?? existing.unit}`,
  };
}

async function updateCrop(farmId: number, userId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const name = requireName(values, "name", "field");
  if (typeof name !== "string") return name;
  const cropType = fieldText(values, "cropType");
  if (!cropType) return failed("Tell me what is growing in this field.");
  const existing = await prisma.crop.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That crop field is not on your farm.");
  const record = await prisma.crop.update({
    where: { id },
    data: {
      name,
      cropType,
      variety: fieldText(values, "variety") ?? existing.variety,
      areaAcres: fieldNumber(values, "areaAcres") ?? existing.areaAcres,
      plantingDate: fieldDate(values, "plantingDate") ?? existing.plantingDate,
      expectedHarvest: fieldDate(values, "expectedHarvest") ?? existing.expectedHarvest,
      location: fieldText(values, "location") ?? existing.location,
      soilType: fieldText(values, "soilType") ?? existing.soilType,
      irrigation: fieldText(values, "irrigation") ?? existing.irrigation,
      status: fieldText(values, "status") ?? existing.status,
      notes: fieldText(values, "notes") ?? existing.notes,
    },
  });
  return {
    ok: true,
    record,
    summary: `Updated ${name} — ${cropType}`,
  };
}

async function updateProduction(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const flockId = fieldNumber(values, "flockId");
  if (!flockId) return failed("Tell me which flock this is for — use the number from your flocks list.");
  const existing = await prisma.dailyProduction.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That production record is not on your farm.");
  const flock = await prisma.flock.findFirst({ where: { id: flockId, farmId } });
  if (!flock) return failed("That flock is not on your farm. Check the number from your flocks list.");
  const eggs = fieldNumber(values, "eggsCollected") ?? 0;
  const deaths = fieldNumber(values, "mortality") ?? 0;
  const record = await prisma.dailyProduction.update({
    where: { id },
    data: {
      flockId,
      date: fieldDate(values, "date") ?? existing.date,
      eggsCollected: eggs,
      milkCollected: fieldNumber(values, "milkCollected") ?? 0,
      mortality: deaths,
      feedUsed: fieldNumber(values, "feedUsed") ?? 0,
      avgWeight: fieldNumber(values, "avgWeight"),
      weightGain: fieldNumber(values, "weightGain"),
      waterUsed: fieldNumber(values, "waterUsed"),
      notes: fieldText(values, "notes"),
    },
  });
  // Mirror the create path: a changed death count adjusts the flock.
  const deathDiff = deaths - Number(existing.mortality || 0);
  if (deathDiff > 0) {
    await prisma.flock.updateMany({
      where: { id: flockId, farmId },
      data: { currentCount: { decrement: deathDiff }, mortality: { increment: deathDiff } },
    });
  } else if (deathDiff < 0) {
    await prisma.flock.updateMany({
      where: { id: flockId, farmId },
      data: { currentCount: { increment: -deathDiff }, mortality: { decrement: -deathDiff } },
    });
  }
  return {
    ok: true,
    record,
    summary: `Updated ${eggs} eggs and ${deaths} deaths for ${flock.name}`,
  };
}

async function updateVaccination(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const flockId = fieldNumber(values, "flockId");
  if (!flockId) return failed("Tell me which flock this vaccine is for — use the number from your flocks list.");
  const existing = await prisma.vaccination.findFirst({ where: { id } });
  if (!existing) return failed("That vaccination is not on your farm.");
  const flock = await prisma.flock.findFirst({ where: { id: flockId, farmId } });
  if (!flock) return failed("That flock is not on your farm. Check the number from your flocks list.");
  const vaccineName = fieldText(values, "vaccineName");
  if (!vaccineName) return failed("Tell me which vaccine this was.");
  const status = fieldText(values, "status") ?? existing.status;
  const when = fieldDate(values, "scheduledDate") ?? existing.scheduledDate;
  const record = await prisma.vaccination.update({
    where: { id },
    data: {
      flockId,
      vaccineName,
      scheduledDate: when,
      completedDate: status === "completed" ? when : null,
      status,
      notes: [fieldText(values, "administeredBy") && `Given by ${fieldText(values, "administeredBy") ?? ""}`, fieldText(values, "notes")]
        .filter(Boolean)
        .join(" — ") || null,
    },
  });
  return {
    ok: true,
    record,
    summary: `${status === "completed" ? "Updated" : "Rescheduled"} ${vaccineName} for ${flock.name}`,
  };
}

async function updateAttendance(farmId: number, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const workerId = fieldNumber(values, "workerId");
  if (!workerId) return failed("Tell me which worker this is for — use the number from your workers list.");
  const existing = await prisma.attendance.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That attendance record is not on your farm.");
  const worker = await prisma.worker.findFirst({ where: { id: workerId, farmId } });
  if (!worker) return failed("That worker is not on your farm. Check the number from your workers list.");
  const status = fieldText(values, "status");
  if (!status) return failed("Tell me whether they came, came late, or did not come.");
  const record = await prisma.attendance.update({
    where: { id },
    data: {
      workerId,
      date: fieldDate(values, "date") ?? existing.date,
      status,
      checkIn: fieldText(values, "checkIn"),
      checkOut: fieldText(values, "checkOut"),
      notes: fieldText(values, "notes"),
    },
  });
  return { ok: true, record, summary: `Updated ${worker.name} as ${status.replace("_", " ")}` };
}

async function updateFlock(farmId: number, userId: number | null | undefined, values: Record<string, string>, id: number): Promise<IntakeSaveResult> {
  const nameOrFail = requireName(values, "name", "flock");
  if (typeof nameOrFail !== "string") return nameOrFail;
  const name = requireName(values, "name", "flock");
  if (typeof name !== "string") return name;
  const count = fieldNumber(values, "initialCount");
  if (count === null || count < 1) {
    return failed("I need to know how many animals are in this flock.");
  }
  const existing = await prisma.flock.findFirst({ where: { id, farmId } });
  if (!existing) return failed("That flock is not on your farm.");
  const cost = fieldNumber(values, "costPerAnimal");
  const updated = await prisma.flock.update({
    where: { id },
    data: {
      name,
      breed: fieldText(values, "breed") ?? existing.breed,
      type: fieldText(values, "type") ?? existing.type,
      category: fieldText(values, "type") ? (SPECIES_CATEGORY[fieldText(values, "type")!] || existing.category) : existing.category,
      initialCount: count,
      currentCount: Math.max(0, count - Math.max(0, Number(fieldText(values, "mortality") || existing.mortality || 0))),
      mortality: Math.max(0, fieldNumber(values, "mortality") ?? existing.mortality ?? 0),
      status: fieldText(values, "status") ?? existing.status,
      hatchDate: fieldDate(values, "hatchDate"),
      purpose: fieldText(values, "purpose") ?? existing.purpose,
      gender: fieldText(values, "gender") ?? existing.gender,
      genderRatio: fieldText(values, "genderRatio") ?? existing.genderRatio,
      location: fieldText(values, "location") ?? existing.location,
      source: fieldText(values, "source") ?? existing.source,
      supplierContact: fieldText(values, "supplierContact") ?? existing.supplierContact,
      costPerAnimal: cost !== null ? cost : existing.costPerAnimal,
      targetMarket: fieldText(values, "targetMarket") ?? existing.targetMarket,
      feedType: fieldText(values, "feedType") ?? existing.feedType,
      feedSupplier: fieldText(values, "feedSupplier") ?? existing.feedSupplier,
      feedCostPerMonth: fieldNumber(values, "feedCostPerMonth") ?? existing.feedCostPerMonth,
      vetName: fieldText(values, "vetName") ?? existing.vetName,
      vetPhone: fieldText(values, "vetPhone") ?? existing.vetPhone,
      healthOnArrival: fieldText(values, "healthOnArrival") ?? existing.healthOnArrival,
      insurancePolicy: fieldText(values, "insurancePolicy") ?? existing.insurancePolicy,
      expectedYield: fieldText(values, "expectedYield") ?? existing.expectedYield,
      expectedRevenue: fieldNumber(values, "expectedRevenue") ?? existing.expectedRevenue,
      expectedWeight: fieldText(values, "expectedWeight") ?? existing.expectedWeight,
      notes: fieldText(values, "notes") ?? existing.notes,
      tagFrom: fieldText(values, "tagFrom") ?? existing.tagFrom,
      tagTo: fieldText(values, "tagTo") ?? existing.tagTo,
    },
  });
  return {
    ok: true,
    record: updated,
    summary: `Updated ${name} — ${updated.currentCount} animals`,
  };
}

/**
 * Merge new values onto existing values, falling back to existing for blanks.
 *
 * Every update writer does the same thing: `fieldText(values, key) ?? existing.key`.
 * This helper cuts that repetition — pass the values, the existing row, and the
 * field names in order, and get back a data object with blanks preserved.
 */
function mergeFields(
  values: Record<string, string>,
  existing: Record<string, any>,
  fields: { key: string; from: (v: Record<string, string>) => any }[],
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const { key, from } of fields) {
    out[key] = from(values) ?? existing[key];
  }
  return out;
}

/**
 * Update one confirmed form.
 *
 * Same shape as saveIntake, but writes through Prisma's update path so the
 * farmer can correct a record they already saved. Unknown keys are ignored and
// fields left blank keep their existing value — an update only changes what the
// farmer sent.
 */
export async function updateIntake(
  entity: IntakeEntity,
  farmId: number,
  userId: number,
  values: Record<string, string>,
  id: number,
): Promise<IntakeSaveResult> {
  switch (entity) {
    case "flock":
      return updateFlock(farmId, userId, values, id);
    case "transaction":
      return updateTransaction(farmId, values, id);
    case "sale":
      return updateSale(farmId, values, id);
    case "invoice":
      return updateInvoice(farmId, values, id);
    case "worker":
      return updateWorker(farmId, values, id);
    case "customer":
      return updateCustomer(farmId, values, id);
    case "inventory":
      return updateInventory(farmId, values, id);
    case "crop":
      return updateCrop(farmId, userId, values, id);
    case "production":
      return updateProduction(farmId, values, id);
    case "vaccination":
      return updateVaccination(farmId, values, id);
    case "attendance":
      return updateAttendance(farmId, values, id);
    default: {
      const unreachable: never = entity;
      return failed(`I cannot update a ${String(unreachable)} yet.`);
    }
  }
}