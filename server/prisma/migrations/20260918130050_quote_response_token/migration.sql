-- Public, unguessable token for customer-facing quote accept/decline links.
ALTER TABLE "quotes" ADD COLUMN "response_token" TEXT;
CREATE UNIQUE INDEX "quotes_response_token_key" ON "quotes"("response_token");

-- Backfill tokens for all existing sent quotes so old WhatsApp threads work too.
UPDATE "quotes"
SET "response_token" = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 24)
WHERE "status" IN ('sent', 'accepted') AND "response_token" IS NULL;
