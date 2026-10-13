-- Payment terms & expected payout date (ERPNext gap #6)
ALTER TABLE "deliveries" ADD COLUMN "payment_terms" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "expected_payment_date" DATE;
