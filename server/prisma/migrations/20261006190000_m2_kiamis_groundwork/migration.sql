-- M2 groundwork — the compliance fields that need NO Animal rows.
--
-- Serves three obligations at once (PHASED-PRODUCT-PLAN M2 item 1):
--   * ANITRAC Cap 364 §18 — establishments/holdings must be registered, so a
--     premises registration number on the holding;
--   * KIAMIS — the national register derives subsidy quantities from declared
--     acreage (area_value/area_unit already exist from M1) and geo-maps farms;
--   * EUDR coffee — plot GPS coordinates for deforestation-free due diligence.
--
-- All columns are nullable: a farm that has none of this keeps working
-- exactly as before, and the KIAMIS export reports what is still missing
-- rather than pretending the registration is complete.
ALTER TABLE "farms" ADD COLUMN "premises_reg_no" TEXT;
ALTER TABLE "farms" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "farms" ADD COLUMN "longitude" DECIMAL(10,7);

-- The farmer's national ID (KIAMIS: "name, ID number, size of farm,
-- commodities, annual income"). Stored on the owner; returned in full only by
-- the owner's own KIAMIS export, masked everywhere else.
ALTER TABLE "users" ADD COLUMN "national_id" TEXT;
