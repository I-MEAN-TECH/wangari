-- Reverse-engineered from ERPNext stock/buying patterns:
-- 1. Delivery quality grading (eggs/produce) + buyer (Customer) linkage + payment date
ALTER TABLE "deliveries" ADD COLUMN "cracked_count" INTEGER;
ALTER TABLE "deliveries" ADD COLUMN "dirty_count" INTEGER;
ALTER TABLE "deliveries" ADD COLUMN "graded_count" INTEGER;
ALTER TABLE "deliveries" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN "customer_id" INTEGER;

CREATE INDEX "deliveries_farm_id_customer_id_idx" ON "deliveries"("farm_id", "customer_id");
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Landed unit-costs on transactions for feed/fertilizer inputs
ALTER TABLE "transactions" ADD COLUMN "quantity" DECIMAL(12,2);
ALTER TABLE "transactions" ADD COLUMN "unit_cost" DECIMAL(12,2);
ALTER TABLE "transactions" ADD COLUMN "supplier_name" TEXT;
