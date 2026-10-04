-- Quotes: track quote-to-invoice conversion
CREATE TABLE IF NOT EXISTS "quotes" (
  "id" SERIAL PRIMARY KEY,
  "farm_id" INTEGER NOT NULL REFERENCES "farms"("id"),
  "customer_id" INTEGER REFERENCES "customers"("id"),
  "quote_number" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "total_amount" DECIMAL(12,2) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "valid_until" TIMESTAMP(3),
  "notes" TEXT,
  "sent_at" TIMESTAMP(3),
  "responded_at" TIMESTAMP(3),
  "converted_invoice_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "quotes_farm_id_status_idx" ON "quotes"("farm_id", "status");
