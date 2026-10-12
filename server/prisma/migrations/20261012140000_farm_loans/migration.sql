-- Farmer-requested gaps (docs/farmer-requested-gaps.md §3 C2) — the farmer's OWN debt.
--
-- `Credit` already models money owed TO the farm by its customers. Nothing
-- modelled the farmer's own debt — SACCO loans, AFC advances, input credit from
-- an agrovet, a chama. This adds `farm_loans` (the debt) and `loan_repayments`
-- (every payment against it), and lets a co-op delivery deduction be tagged as
-- a loan repayment collected at source.
--
-- Wangari records the loan and every repayment; it never makes a credit
-- decision — the lender does. Strictly additive.

-- ── C2: the FarmLoan table ──────────────────────────────────────────────────
CREATE TABLE "farm_loans" (
    "id"                   SERIAL NOT NULL,
    "farm_id"              INTEGER NOT NULL,
    "lender"               TEXT NOT NULL,
    "loan_type"            TEXT,
    "principal"            DECIMAL(12,2) NOT NULL,
    "interest_rate_pct"    DECIMAL(5,2),
    "disbursed_at"         DATE,
    "first_instalment_due" DATE,
    "instalment_count"     INTEGER,
    "instalment_amount"    DECIMAL(12,2),
    "amount_paid"          DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status"               TEXT NOT NULL DEFAULT 'active',
    "notes"                TEXT,
    "created_by"           INTEGER,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_loans_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "farm_loans" ADD CONSTRAINT "farm_loans_farm_id_fkey"
  FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_loans" ADD CONSTRAINT "farm_loans_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "farm_loans_farm_id_status_idx" ON "farm_loans"("farm_id", "status");

-- ── C2: the LoanRepayment table ─────────────────────────────────────────────
-- One row per payment. `delivery_deduction_id` links it to a co-op deduction
-- collected at source; NULL means the farmer paid cash/M-Pesa directly.
CREATE TABLE "loan_repayments" (
    "id"                   SERIAL NOT NULL,
    "farm_loan_id"         INTEGER NOT NULL,
    "farm_id"              INTEGER NOT NULL,
    "amount"               DECIMAL(12,2) NOT NULL,
    "paid_at"              DATE NOT NULL,
    "source"               TEXT NOT NULL DEFAULT 'cash',
    "delivery_deduction_id" INTEGER,
    "notes"                TEXT,
    "created_by"           INTEGER,
    "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_repayments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_farm_loan_id_fkey"
  FOREIGN KEY ("farm_loan_id") REFERENCES "farm_loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_farm_id_fkey"
  FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_delivery_deduction_id_fkey"
  FOREIGN KEY ("delivery_deduction_id") REFERENCES "delivery_deductions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "loan_repayments_farm_loan_id_paid_at_idx" ON "loan_repayments"("farm_loan_id", "paid_at");

-- ── C1/C2 link: a delivery deduction can repay a loan ───────────────────────
ALTER TABLE "delivery_deductions" ADD COLUMN "farm_loan_id" INTEGER;
ALTER TABLE "delivery_deductions" ADD CONSTRAINT "delivery_deductions_farm_loan_id_fkey"
  FOREIGN KEY ("farm_loan_id") REFERENCES "farm_loans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "delivery_deductions_farm_loan_id_idx" ON "delivery_deductions"("farm_loan_id");
