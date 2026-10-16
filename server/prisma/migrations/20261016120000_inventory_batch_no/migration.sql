-- Inventory batch number for vet drugs, vaccines, and any item with a
-- per-batch expiry. The Free Core tier surfaces an "expiring in 30 days"
-- dashboard tile; the tile reads `expiryDate` (already in the table) and
-- joins it with `batchNo` so the farmer knows which batch to use first.
--
-- The column is nullable on purpose: many inventory items are bulk stock
-- without a batch (feed, fuel) and forcing a value would be busy-work.
-- Vet drugs and vaccines are the items that genuinely need a batch.
ALTER TABLE "inventory" ADD COLUMN "batch_no" TEXT;
CREATE INDEX "inventory_batch_no_idx" ON "inventory"("batch_no");
