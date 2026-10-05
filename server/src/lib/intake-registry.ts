/**
 * Every question Wangari has to ask before she writes anything.
 *
 * ── why one file, and not one list per tool ──────────────
 * "Add a livestock" used to write a row with a name and a number and leave
 * twenty-six columns blank. The same was true of the other nine things the
 * assistant could create: a worker with no wage, a stock item with no reorder
 * level, a sale with no date. Each of those is a question the farmer was never
 * asked, and an unasked question becomes a permanently blank column.
 *
 * So the questions are DATA, in one registry, and every caller — the chat card,
 * the validation, the writers, the plan gate — reads them from here. An entity
 * added to this file gets a form, a validation, a writer and a gate, or the
 * build fails; there is no way to add a thin write by accident.
 *
 * ── which fields are in here, and why not the others ─────
 * The rule: everything the app's own screen can store for that record, minus
 * the fields the app derives itself. Current count is derived from count and
 * deaths; an invoice number is generated; total investment is count × unit
 * cost; a worker's login PIN is not something an assistant should be collecting
 * at all, so it is not here and never will be.
 *
 * Required fields are few on purpose. A form that demands a vet's phone number
 * before it will save is a form that gets abandoned, and a half-entered worker
 * is better than a worker the app refuses to create.
 */

import type { IntakeEntity, IntakeField, IntakeOption, IntakeSource } from "./intake-types.js";

/** Shared option lists, so a value is spelled the same way everywhere. */
const SPECIES: readonly IntakeOption[] = [
  { value: "layers", label: "Layers (eggs)" },
  { value: "broilers", label: "Broilers (meat)" },
  { value: "kienyeji", label: "Kienyeji (indigenous chicken)" },
  { value: "cattle_dairy", label: "Dairy cattle" },
  { value: "cattle_beef", label: "Beef cattle" },
  { value: "goats", label: "Goats" },
  { value: "sheep", label: "Sheep" },
  { value: "pigs", label: "Pigs" },
  { value: "rabbits", label: "Rabbits" },
  { value: "fish", label: "Fish (aquaculture)" },
  { value: "bees", label: "Bees (apiculture)" },
];

const ACTIVE_STATUS: readonly IntakeOption[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "sold", label: "Sold" },
  { value: "deceased", label: "Deceased" },
];

const PAYMENT_STATUS: readonly IntakeOption[] = [
  { value: "paid", label: "Paid in full" },
  { value: "partial", label: "Part paid" },
  { value: "pending", label: "Not yet paid" },
];

const PAYMENT_METHOD: readonly IntakeOption[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "bank", label: "Bank" },
  { value: "credit", label: "On credit" },
];

const INCOME_CATEGORIES: readonly IntakeOption[] = [
  { value: "crop_sale", label: "Crop sale" },
  { value: "animal_sale", label: "Animal sale" },
  { value: "egg_sale", label: "Egg sale" },
  { value: "milk_sale", label: "Milk sale" },
  { value: "other_income", label: "Other income" },
];

const EXPENSE_CATEGORIES: readonly IntakeOption[] = [
  { value: "animal_feed", label: "Animal feed" },
  { value: "seed", label: "Seeds" },
  { value: "fertiliser", label: "Fertiliser" },
  { value: "labour", label: "Labour" },
  { value: "transport", label: "Transport" },
  { value: "veterinary", label: "Veterinary" },
  { value: "utilities", label: "Water and electricity" },
  { value: "other_expense", label: "Other expense" },
];

const UNITS: readonly IntakeOption[] = [
  { value: "bags", label: "Bags" },
  { value: "kg", label: "Kg" },
  { value: "litres", label: "Litres" },
  { value: "units", label: "Units" },
  { value: "crates", label: "Crates" },
  { value: "boxes", label: "Boxes" },
];

const ATTENDANCE_STATUS: readonly IntakeOption[] = [
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "half_day", label: "Half day" },
];

const IRRIGATION: readonly IntakeOption[] = [
  { value: "rainfed", label: "Rain-fed" },
  { value: "drip", label: "Drip" },
  { value: "sprinkler", label: "Sprinkler" },
  { value: "flood", label: "Flood / furrow" },
];

/** Shorthand: a plain text field. */
const text = (key: string, label: string, extra: Partial<IntakeField> = {}): IntakeField => ({
  key,
  label,
  type: "text",
  ...extra,
});

const FLOCK: IntakeSource = {
  entity: "flock",
  title: "Add your livestock",
  formNoun: "livestock",
  module: "flocks",
  intro:
    "I need a few details before I save this. I have already filled in what you " +
    "told me — check it, fill the gaps, and leave anything you do not know yet.",
  sections: [
    {
      id: "basic",
      title: "Basic Info",
      blurb: "Who these animals are and what the group is for.",
      fields: [
        { key: "name", label: "Flock Name", type: "text", required: true, placeholder: "e.g. Sasso Kenya", hint: "The name you call this group." },
        { key: "initialCount", label: "How many animals", type: "number", required: true, integer: true, min: 1, placeholder: "e.g. 200" },
        { key: "type", label: "Species", type: "select", options: SPECIES, hint: "Decides how the app works out feed, space and vaccines." },
        { key: "status", label: "Status", type: "select", options: ACTIVE_STATUS },
        text("breed", "Breed", { placeholder: "e.g. Sasso, Kienyeji, Friesian" }),
        { key: "mortality", label: "Deaths (Mortality)", type: "number", integer: true, min: 0, placeholder: "0", hint: "Deaths since you got them." },
        {
          key: "purpose",
          label: "Purpose",
          type: "select",
          options: [
            { value: "production", label: "Production" },
            { value: "breeding", label: "Breeding" },
            { value: "dual_purpose", label: "Dual Purpose" },
          ],
        },
        {
          key: "gender",
          label: "Gender",
          type: "select",
          options: [
            { value: "female", label: "All Female" },
            { value: "male", label: "All Male" },
            { value: "mixed", label: "Mixed" },
          ],
        },
        text("genderRatio", "Male : Female ratio", { placeholder: "e.g. 1:9" }),
        { key: "hatchDate", label: "Date you got them", type: "date", hint: "Used to work out the age and the vaccination dates." },
      ],
    },
    {
      id: "location",
      title: "Location & Housing",
      blurb: "Where they are kept.",
      fields: [text("location", "Location / Pen", { placeholder: "e.g. Pen A, Barn 2" })],
    },
    {
      id: "supply",
      title: "Source & Cost",
      blurb: "Where they came from and what they cost. This is what the profit page compares against.",
      fields: [
        text("source", "Source / Supplier", { placeholder: "e.g. Mamboeo market" }),
        text("supplierContact", "Supplier Phone", { placeholder: "07…" }),
        { key: "costPerAnimal", label: "Cost per Animal (KES)", type: "money", min: 0, placeholder: "e.g. 500", hint: "One animal, not the whole group. The total is worked out for you." },
        text("targetMarket", "Target Market", { placeholder: "e.g. Nairobi, local market" }),
      ],
    },
    {
      id: "feed",
      title: "Feed Plan",
      blurb: "Feed is 60–70% of a poultry farm's costs, so it is worth recording.",
      fields: [
        text("feedType", "Feed Type", { placeholder: "e.g. layers mash, hay" }),
        text("feedSupplier", "Feed Supplier", { placeholder: "e.g. Unga Farm Care" }),
        { key: "feedCostPerMonth", label: "Feed Cost/Month (KES)", type: "money", min: 0, placeholder: "e.g. 24000" },
      ],
    },
    {
      id: "vet",
      title: "Veterinarian & Health",
      blurb: "Who to call when something is wrong.",
      fields: [
        text("vetName", "Veterinarian", { placeholder: "Name" }),
        text("vetPhone", "Vet Phone", { placeholder: "07…" }),
        text("healthOnArrival", "Health on Arrival", { placeholder: "e.g. all healthy, vaccinated against Newcastle" }),
      ],
    },
    {
      id: "target",
      title: "Production Target",
      blurb: "What this group is expected to produce. Blank is fine — do not guess a number for me.",
      fields: [
        text("expectedYield", "Expected Yield", { placeholder: "e.g. 250 eggs/bird/year" }),
        text("expectedWeight", "Expected Weight", { placeholder: "e.g. 1.8 kg at 8 weeks" }),
        { key: "expectedRevenue", label: "Expected Revenue (KES)", type: "money", min: 0, placeholder: "e.g. 600000" },
      ],
    },
    {
      id: "insurance",
      title: "Insurance & Notes",
      fields: [
        text("insurancePolicy", "Insurance Policy", { placeholder: "e.g. Kenya National Insurance, policy NHIF-2231" }),
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Anything else worth remembering." },
      ],
    },
    {
      id: "tags",
      title: "ANITRAC Tags",
      blurb: "First and last tag number for the whole group. Leave empty if they are not tagged.",
      fields: [
        text("tagFrom", "First tag number", { placeholder: "e.g. 1410001" }),
        text("tagTo", "Last tag number", { placeholder: "e.g. 1410200" }),
      ],
    },
  ],
  aliases: {
    count: "initialCount",
    number: "initialCount",
    quantity: "initialCount",
    head: "initialCount",
    flockName: "name",
    groupName: "name",
    deaths: "mortality",
    mortalityCount: "mortality",
    species: "type",
    pen: "location",
    house: "location",
    barn: "location",
    supplier: "source",
    supplierName: "source",
    phone: "supplierContact",
    supplierPhone: "supplierContact",
    cost: "costPerAnimal",
    pricePerAnimal: "costPerAnimal",
    market: "targetMarket",
    feed: "feedType",
    feedCost: "feedCostPerMonth",
    vet: "vetName",
    veterinarian: "vetName",
    arrivedOn: "hatchDate",
    dateAcquired: "hatchDate",
    healthStatus: "healthOnArrival",
    insurance: "insurancePolicy",
    yield: "expectedYield",
    revenue: "expectedRevenue",
    weight: "expectedWeight",
    note: "notes",
    firstTag: "tagFrom",
    lastTag: "tagTo",
  },
};

const CROP: IntakeSource = {
  entity: "crop",
  title: "Add a crop field",
  formNoun: "crop",
  module: "crops",
  intro: "Tell me about the field and I will record it. Anything you are not sure about can stay blank.",
  sections: [
    {
      id: "basic",
      title: "The Crop",
      fields: [
        text("name", "Field Name", { required: true, placeholder: "e.g. Maize Field A" }),
        text("cropType", "What is growing?", { required: true, placeholder: "e.g. maize, beans, tomatoes, kale" }),
        text("variety", "Variety", { placeholder: "e.g. H614" }),
        { key: "areaAcres", label: "Area (acres)", type: "number", min: 0, placeholder: "e.g. 2.5", hint: "Acres, not hectares. 1 hectare is 2.471 acres." },
      ],
    },
    {
      id: "timing",
      title: "Timing",
      fields: [
        { key: "plantingDate", label: "Date planted", type: "date" },
        { key: "expectedHarvest", label: "Expected harvest", type: "date" },
      ],
    },
    {
      id: "field",
      title: "The Field",
      fields: [
        text("location", "Location / plot", { placeholder: "e.g. Upper plot, behind the house" }),
        text("soilType", "Soil type", { placeholder: "e.g. red clay, loam" }),
        { key: "irrigation", label: "How is it watered?", type: "select", options: IRRIGATION },
      ],
    },
    {
      id: "status",
      title: "Status & Notes",
      fields: [
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "active", label: "Growing" },
            { value: "harvested", label: "Harvested" },
            { value: "failed", label: "Failed / abandoned" },
          ],
        },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    },
  ],
  aliases: {
    fieldName: "name",
    field: "name",
    crop: "cropType",
    cropName: "cropType",
    type: "cropType",
    area: "areaAcres",
    acres: "areaAcres",
    plantedOn: "plantingDate",
    harvestDate: "expectedHarvest",
    plot: "location",
    soil: "soilType",
    water: "irrigation",
    note: "notes",
  },
};

const WORKER: IntakeSource = {
  entity: "worker",
  title: "Add a worker",
  formNoun: "worker",
  module: "workers",
  intro: "I need their name and what they do. The rest can wait until you know it.",
  sections: [
    {
      id: "basic",
      title: "Basic Info",
      fields: [
        text("name", "Name", { required: true, placeholder: "e.g. Mary Wanjiku" }),
        text("role", "Role", { required: true, placeholder: "e.g. farm hand, driver, milker" }),
        text("phone", "Phone", { placeholder: "07…" }),
      ],
    },
    {
      id: "work",
      title: "Work & Pay",
      fields: [
        { key: "dailyWage", label: "Daily wage (KES)", type: "money", min: 0, placeholder: "e.g. 1500", hint: "Per day. Leave blank if it is monthly or agreed differently." },
        { key: "hiredDate", label: "Started on", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "active", label: "Working now" },
            { value: "inactive", label: "Not working" },
          ],
        },
      ],
    },
  ],
  aliases: {
    workerName: "name",
    wage: "dailyWage",
    pay: "dailyWage",
    salary: "dailyWage",
    job: "role",
    position: "role",
    number: "phone",
    startedOn: "hiredDate",
    startDate: "hiredDate",
  },
};

const CUSTOMER: IntakeSource = {
  entity: "customer",
  title: "Add a customer",
  formNoun: "customer",
  module: "customers",
  intro: "Their name is enough to start. Add a number so you can reach them later.",
  sections: [
    {
      id: "basic",
      title: "Customer Details",
      fields: [
        text("name", "Name", { required: true, placeholder: "e.g. Peter Mwangi" }),
        text("phone", "Phone", { placeholder: "07…" }),
        text("email", "Email", { type: "text" } as Partial<IntakeField>),
        text("address", "Address / area", { placeholder: "e.g. Kiambu, Kijani market" }),
      ],
    },
  ],
  aliases: {
    customerName: "name",
    contact: "phone",
    number: "phone",
    location: "address",
  },
};

const INVENTORY: IntakeSource = {
  entity: "inventory",
  title: "Add stock",
  formNoun: "stock",
  module: "inventory",
  intro: "What did you buy or store, how much, and when should you reorder?",
  sections: [
    {
      id: "basic",
      title: "The Item",
      fields: [
        text("itemName", "Item", { required: true, placeholder: "e.g. Layers mash" }),
        text("category", "Category", { placeholder: "e.g. feed, seed, tools" }),
        { key: "quantity", label: "How much", type: "number", required: true, min: 0, placeholder: "e.g. 10" },
        { key: "unit", label: "Unit", type: "select", options: UNITS },
      ],
    },
    {
      id: "money",
      title: "Cost & Supply",
      fields: [
        { key: "unitCost", label: "Cost per unit (KES)", type: "money", min: 0, placeholder: "e.g. 3200" },
        { key: "reorderLevel", label: "Warn me when stock falls to", type: "number", integer: true, min: 0, placeholder: "e.g. 2", hint: "Wangari will tell you to restock at this level." },
        text("supplier", "Supplier", { placeholder: "e.g. Unga Farm Care" }),
        { key: "expiryDate", label: "Use before", type: "date" },
      ],
    },
    {
      id: "notes",
      title: "Notes",
      fields: [{ key: "notes", label: "Notes", type: "textarea" }],
    },
  ],
  aliases: {
    name: "itemName",
    item: "itemName",
    product: "itemName",
    stock: "itemName",
    amount: "quantity",
    qty: "quantity",
    count: "quantity",
    price: "unitCost",
    cost: "unitCost",
    restockLevel: "reorderLevel",
    minimum: "reorderLevel",
    expiresOn: "expiryDate",
    note: "notes",
  },
};

const TRANSACTION: IntakeSource = {
  entity: "transaction",
  title: "Record money in or out",
  formNoun: "money record",
  module: "transactions",
  intro: "Money in or money out, how much, and what it was for.",
  sections: [
    {
      id: "basic",
      title: "The Amount",
      fields: [
        {
          key: "type",
          label: "Money in or out?",
          type: "select",
          required: true,
          options: [
            { value: "income", label: "Money IN (I received)" },
            { value: "expense", label: "Money OUT (I paid)" },
          ],
        },
        { key: "amount", label: "Amount (KES)", type: "money", required: true, min: 0, placeholder: "e.g. 4500" },
      ],
    },
    {
      id: "detail",
      title: "What For",
      fields: [
        text("category", "Category", { placeholder: "e.g. feed, transport, sale of eggs" }),
        text("description", "Description", { placeholder: "e.g. Bought 5 bags of layers mash" }),
        { key: "date", label: "Date", type: "date" },
        { key: "paymentMethod", label: "How was it paid?", type: "select", options: PAYMENT_METHOD },
        text("reference", "Reference / receipt no.", { placeholder: "e.g. M-Pesa code ABC123" }),
      ],
    },
  ],
  aliases: {
    money: "amount",
    value: "amount",
    total: "amount",
    reason: "description",
    note: "description",
    kind: "type",
    for: "description",
    receipt: "reference",
  },
};

const SALE: IntakeSource = {
  entity: "sale",
  title: "Record a sale",
  formNoun: "sale",
  module: "sales",
  intro: "What did you sell, to whom, and how much did they pay?",
  sections: [
    {
      id: "basic",
      title: "The Sale",
      fields: [
        { key: "totalAmount", label: "Total (KES)", type: "money", required: true, min: 0, placeholder: "e.g. 9000" },
        text("what", "What did you sell?", { placeholder: "e.g. 2 crates of tomatoes" }),
        text("customerName", "Who bought it?", { placeholder: "e.g. Peter Mwangi" }),
      ],
    },
    {
      id: "payment",
      title: "Payment",
      fields: [
        { key: "amountPaid", label: "Paid so far (KES)", type: "money", min: 0, placeholder: "e.g. 4500" },
        { key: "paymentStatus", label: "Payment status", type: "select", options: PAYMENT_STATUS },
        { key: "saleDate", label: "Date of sale", type: "date" },
      ],
    },
  ],
  aliases: {
    amount: "totalAmount",
    total: "totalAmount",
    price: "totalAmount",
    items: "what",
    sold: "what",
    customer: "customerName",
    buyer: "customerName",
    paid: "amountPaid",
    date: "saleDate",
  },
};

const INVOICE: IntakeSource = {
  entity: "invoice",
  title: "Make an invoice",
  formNoun: "invoice",
  module: "invoices",
  intro: "Who is it for, how much, and when is it due?",
  sections: [
    {
      id: "basic",
      title: "The Invoice",
      fields: [
        text("customerName", "Who is it for?", { required: true, placeholder: "e.g. Peter Mwangi" }),
        { key: "totalAmount", label: "Total (KES)", type: "money", required: true, min: 0, placeholder: "e.g. 9000" },
        { key: "amountPaid", label: "Already paid (KES)", type: "money", min: 0, placeholder: "0" },
      ],
    },
    {
      id: "payment",
      title: "Payment",
      fields: [
        { key: "paymentStatus", label: "Payment status", type: "select", options: PAYMENT_STATUS },
        { key: "dueDate", label: "Due date", type: "date" },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    },
  ],
  aliases: {
    customer: "customerName",
    amount: "totalAmount",
    total: "totalAmount",
    price: "totalAmount",
    paid: "amountPaid",
    due: "dueDate",
    note: "notes",
  },
};

const PRODUCTION: IntakeSource = {
  entity: "production",
  title: "Record today's production",
  formNoun: "production record",
  module: "production",
  intro: "Which flock, and what came out of it today. Blank answers count as zero.",
  sections: [
    {
      id: "basic",
      title: "Which Flock",
      fields: [
        {
          key: "flockId",
          label: "Flock",
          type: "number",
          required: true,
          integer: true,
          min: 1,
          placeholder: "Flock id",
          hint: "Use the number from your flocks list.",
        },
        { key: "date", label: "Date", type: "date" },
      ],
    },
    {
      id: "output",
      title: "What Came Out",
      fields: [
        { key: "eggsCollected", label: "Eggs collected", type: "number", integer: true, min: 0, placeholder: "0" },
        { key: "milkCollected", label: "Milk (litres)", type: "number", min: 0, placeholder: "0" },
        { key: "mortality", label: "Deaths today", type: "number", integer: true, min: 0, placeholder: "0" },
        { key: "avgWeight", label: "Average weight (kg)", type: "number", min: 0, placeholder: "e.g. 1.8" },
        { key: "weightGain", label: "Weight gained (kg)", type: "number", min: 0, placeholder: "e.g. 0.2" },
      ],
    },
    {
      id: "inputs",
      title: "What Went In",
      fields: [
        { key: "feedUsed", label: "Feed used (kg)", type: "number", min: 0, placeholder: "e.g. 25" },
        { key: "waterUsed", label: "Water used (litres)", type: "number", min: 0, placeholder: "e.g. 40" },
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    },
  ],
  aliases: {
    flock: "flockId",
    eggs: "eggsCollected",
    milk: "milkCollected",
    deaths: "mortality",
    feed: "feedUsed",
    weight: "avgWeight",
    water: "waterUsed",
    note: "notes",
  },
};

const VACCINATION: IntakeSource = {
  entity: "vaccination",
  title: "Record a vaccination",
  formNoun: "vaccination",
  module: "vaccinations",
  intro: "Which flock, which vaccine, and when. A vaccine given today is the one to record.",
  sections: [
    {
      id: "basic",
      title: "The Vaccine",
      fields: [
        { key: "flockId", label: "Flock", type: "number", required: true, integer: true, min: 1, placeholder: "Flock id", hint: "Use the number from your flocks list." },
        text("vaccineName", "Vaccine", { required: true, placeholder: "e.g. Newcastle (La Sota)" }),
        { key: "scheduledDate", label: "Date given or due", type: "date" },
        {
          key: "status",
          label: "Status",
          type: "select",
          options: [
            { value: "completed", label: "Already given" },
            { value: "pending", label: "Due later" },
          ],
        },
      ],
    },
    {
      id: "detail",
      title: "Details",
      fields: [
        text("administeredBy", "Given by", { placeholder: "e.g. Dr Ochieng, or me" }),{ key: "notes", label: "Notes", type: "textarea" },
      ],
    },
  ],
  aliases: {
    vaccine: "vaccineName",
    flock: "flockId",
    date: "scheduledDate",
    givenBy: "administeredBy",
    vet: "administeredBy",
    note: "notes",
  },
};

const ATTENDANCE: IntakeSource = {
  entity: "attendance",
  title: "Record attendance",
  formNoun: "attendance record",
  module: "attendance",
  intro: "Who, which day, and were they there.",
  sections: [
    {
      id: "basic",
      title: "The Day",
      fields: [
        { key: "workerId", label: "Worker", type: "number", required: true, integer: true, min: 1, placeholder: "Worker id", hint: "Use the number from your workers list." },
        { key: "date", label: "Date", type: "date" },
        { key: "status", label: "Did they come?", type: "select", required: true, options: ATTENDANCE_STATUS },
      ],
    },
    {
      id: "detail",
      title: "Detail",
      fields: [
        text("checkIn", "Came in at", { placeholder: "e.g. 06:30" }),
        text("checkOut", "Left at", { placeholder: "e.g. 17:00" }),
        { key: "notes", label: "Notes", type: "textarea" },
      ],
    },
  ],
  aliases: {
    worker: "workerId",
    employee: "workerId",
    present: "status",
    in: "checkIn",
    out: "checkOut",
    note: "notes",
  },
};

const SOURCES: Record<IntakeEntity, IntakeSource> = {
  flock: FLOCK,
  crop: CROP,
  worker: WORKER,
  customer: CUSTOMER,
  inventory: INVENTORY,
  transaction: TRANSACTION,
  sale: SALE,
  invoice: INVOICE,
  production: PRODUCTION,
  vaccination: VACCINATION,
  attendance: ATTENDANCE,
};

export function intakeSource(entity: IntakeEntity): IntakeSource {
  return SOURCES[entity];
}

export function isIntakeEntity(value: unknown): value is IntakeEntity {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SOURCES, value);
}

export function intakeEntities(): IntakeEntity[] {
  return Object.keys(SOURCES) as IntakeEntity[];
}

/** Which plan module gates an entity — the same rule the screens obey. */
export function intakeModule(entity: IntakeEntity): string {
  return SOURCES[entity].module;
}

/**
 * Where the income and expense categories in the money form came from.
 *
 * The two lists are deliberately kept apart: a farmer who says "feed" on money
 * OUT is buying animal feed, and the same word on money IN is selling eggs. One
 * merged list would file both under whichever came first, and the profit page
 * is computed from these rows.
 */
export const CATEGORY_OPTIONS = {
  income: INCOME_CATEGORIES,
  expense: EXPENSE_CATEGORIES,
};