-- Add document codes to deliveries and purchase transactions (unified Documents search)
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "doc_code" TEXT;
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "doc_code" TEXT;
