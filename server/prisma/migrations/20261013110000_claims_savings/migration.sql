-- Farmer-requested gaps — C5 (the payout actually received) and C7 (the chama /
-- table-banking ledger). Two new tables, both strictly additive.

-- ── C5: what the insurer paid, which is not what the farmer lost ───────────
-- Index cover pays on a trigger, not on this farm. `measured_loss_units` and
-- `expected_amount`/`received_amount` sit side by side and are never derived
-- from each other, because the gap between them is the thing that destroys
-- trust: a farmer told "you are covered" who receives a third of the loss they
-- counted themselves stops believing any of it.
CREATE TABLE "insurance_claims" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "policy_id" INTEGER,
    "claim_ref" TEXT,
    "incident_on" DATE NOT NULL,
    "event_type" TEXT NOT NULL,
    "measured_loss_units" INTEGER,
    "expected_amount" DECIMAL(12,2),
    "received_amount" DECIMAL(12,2),
    "received_on" DATE,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_claims_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not cascade: deleting a lapsed policy must never erase the record of
-- a claim that was filed and paid under it. The claim outlives the policy.
ALTER TABLE "insurance_claims" ADD CONSTRAINT "insurance_claims_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "insurance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "insurance_claims_farm_id_incident_on_idx" ON "insurance_claims"("farm_id", "incident_on");

-- ── C7: the chama / table-banking ledger ──────────────────────────────────
-- `coop_groups` covers membership and join codes, not money. A chama is a
-- different institution: members contribute on a fixed day, borrow from the pot,
-- and repay with interest, and what a member wants is "what have I put in and
-- what do I still owe". One flat table of typed movements rather than three,
-- because a chama book has every one of them on the same page in date order and
-- a position is a single running sum.
CREATE TABLE "savings_entries" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "coop_group_id" INTEGER,
    "group_name" TEXT NOT NULL,
    "member_name" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "occurred_on" DATE NOT NULL,
    "counterparty" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "savings_entries" ADD CONSTRAINT "savings_entries_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- coop_group_id is a plain integer with no foreign key: most chamas are not in
-- the app at all, and the ones that are must not lose their money history when a
-- group record is cleaned up.
CREATE INDEX "savings_entries_farm_id_occurred_on_idx" ON "savings_entries"("farm_id", "occurred_on");
CREATE INDEX "savings_entries_farm_id_group_name_idx" ON "savings_entries"("farm_id", "group_name");
