-- Kenya Data Protection Act 2019 (KDPA) & user consent compliance
-- Adds explicit consent tracking (terms_accepted_at), soft-delete erasure (deleted_at),
-- and WhatsApp opt-in/opt-out status to users.

ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "whatsapp_opted_out" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "whatsapp_opted_in_at" TIMESTAMP(3);

CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
