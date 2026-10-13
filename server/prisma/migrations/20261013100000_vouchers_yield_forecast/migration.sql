-- Farmer-requested gaps — B5 (fertiliser e-voucher redemption) and B6 (the
-- farmer's own expected yield). Additive: one nullable column on `crops` and one
-- new table. Nothing existing changes shape.

-- ── B6: what the farmer expects this crop to give ──────────────────────────
-- A number the FARMER states, never one we infer from a variety table. A
-- research station's "potential yield" is guidance for a district and a promise
-- to nobody; comparing it to a smallholder's actual harvest would be us marking
-- their homework. Null = they have not said, so the variance view says so
-- instead of inventing a denominator.
ALTER TABLE "crops" ADD COLUMN "expected_yield_kg" DECIMAL(10,2);

-- ── B5: the voucher redemption, as a distinct input-cost line ──────────────
-- The KIAMIS export already proves eligibility. This records what happened
-- after it, for one reason: a subsidy must never be counted as cash income. The
-- farmer pays `farmer_contribution`, the programme covers `voucher_value`, and
-- keeping both means the crop's real cost per kg is not quietly understated by a
-- government transfer.
CREATE TABLE "input_vouchers" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "program" TEXT NOT NULL DEFAULT 'nfsp',
    "dealer" TEXT,
    "voucher_value" DECIMAL(12,2) NOT NULL,
    "farmer_contribution" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "quantity_kg" DECIMAL(10,2),
    "input_name" TEXT,
    "redeemed_on" DATE NOT NULL,
    "crop_id" INTEGER,
    "plot_id" INTEGER,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_vouchers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "input_vouchers" ADD CONSTRAINT "input_vouchers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- crop_id and plot_id carry NO foreign key on purpose. A voucher is redeemed at
-- a dealer against an entitlement derived from declared acreage, and the record
-- has to survive the crop being deleted or the plot being renamed. A lookup at
-- read time is cheap; a ledger row removed by a cascade is data loss.
CREATE INDEX "input_vouchers_farm_id_redeemed_on_idx" ON "input_vouchers"("farm_id", "redeemed_on");
CREATE INDEX "input_vouchers_farm_id_crop_id_idx" ON "input_vouchers"("farm_id", "crop_id");
