-- Farmer-requested gaps — C3 (M-Pesa/cash reconciliation against deliveries),
-- C8 (asset register and depreciation) and C4 (budget/cash-flow). Additive.

-- ── C3: matching a receipt to the delivery it settled ─────────────────────
-- An unmatched M-Pesa receipt is the single most common reason a farmer
-- believes they were not paid. The payment already lands in `transactions`; what
-- was missing is the link back to what it paid for.
ALTER TABLE "transactions" ADD COLUMN "delivery_id" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "matched_at" TIMESTAMP(3);
-- How the match was made: manual (the farmer confirmed), reference (receipt
-- numbers agreed) or proposed (we suggested it, nobody confirmed). A confirmed
-- match is never silently overwritten by a later proposal.
ALTER TABLE "transactions" ADD COLUMN "matched_by" TEXT;

-- delivery_id carries NO foreign key: deleting a delivery must not delete the
-- money record that settled it. The ledger is the audit trail; it outlives the
-- thing it describes.
CREATE INDEX "transactions_farm_id_delivery_id_idx" ON "transactions"("farm_id", "delivery_id");

-- ── C8: the herd as capital ───────────────────────────────────────────────
-- `cost_per_animal` and `total_investment` already record what the herd cost.
-- These three make a book value computable without inventing anything: the
-- clock, the farmer's own expectation of useful life for that class of stock,
-- and what it is worth at the end. All optional — with none set, the register
-- states cost and says book value is not computable rather than depreciating on
-- a default we made up.
ALTER TABLE "flocks" ADD COLUMN "acquired_on" DATE;
ALTER TABLE "flocks" ADD COLUMN "useful_life_years" INTEGER;
ALTER TABLE "flocks" ADD COLUMN "salvage_value" DECIMAL(12,2);

-- ── C4: the plan the forward view projects from ───────────────────────────
-- Not a ledger: no row here is ever counted as spent or received. It exists so
-- the cash-flow view has something to look forward to — school fees in December,
-- a bag of fertiliser in March.
CREATE TABLE "budget_items" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'outflow',
    "amount" DECIMAL(12,2) NOT NULL,
    "due_on" DATE NOT NULL,
    "category" TEXT,
    "recurring" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "budget_items_farm_id_due_on_idx" ON "budget_items"("farm_id", "due_on");
