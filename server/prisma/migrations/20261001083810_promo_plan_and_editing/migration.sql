-- Promo codes can now be restricted to one specific plan (plan_id), and are
-- fully editable from the admin panel (no delete/recreate needed).
ALTER TABLE "promo_codes" ADD COLUMN "plan_id" TEXT;

CREATE INDEX "promo_codes_plan_id_idx" ON "promo_codes"("plan_id");

ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
