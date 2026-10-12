-- Farmer-requested gaps (docs/farmer-requested-gaps.md §2 B1/B2) — the Plot.
--
-- A crop farm is not one record with an acreage — it is several distinct
-- plots with different soil, crops and pest pressure. This adds the "real
-- place": crops now hang off a Plot instead of only having a free-text
-- location, and the plot carries the geolocation an EU buyer can trace a
-- coffee delivery back to.
--
-- Strictly additive: every column here is nullable or defaulted, so no
-- existing row changes shape and no existing query breaks. A farmer who
-- never creates a plot sees nothing.

-- ── B1: the Plot table ─────────────────────────────────────────────────────
-- Geolocation follows the farm's both-or-neither rule: latitude and longitude
-- are captured as a pair or not at all (a lone coordinate is a point
-- somewhere in the Indian Ocean). Nothing here is asserted as a legal duty —
-- EUDR for a Kenyan smallholder is "when your buyer asks", and we collect the
-- data without overstating it.
CREATE TABLE "plots" (
    "id"         SERIAL NOT NULL,
    "farm_id"    INTEGER NOT NULL,
    "name"       TEXT NOT NULL,
    "area_value" DECIMAL(10,2),
    "area_unit"  TEXT,
    "latitude"   DECIMAL(10,7),
    "longitude"  DECIMAL(10,7),
    "soil_type"  TEXT,
    "notes"      TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plots_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "plots" ADD CONSTRAINT "plots_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plots" ADD CONSTRAINT "plots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "plots_farm_id_idx" ON "plots"("farm_id");

-- ── B1: crops point at a real place ────────────────────────────────────────
-- The existing free-text `location` stays — a plot is the structured upgrade
-- on top of it, not a replacement. A crop with no plot simply keeps its old
-- behaviour.
ALTER TABLE "crops" ADD COLUMN "plot_id" INTEGER;
ALTER TABLE "crops" ADD CONSTRAINT "crops_plot_id_fkey"
  FOREIGN KEY ("plot_id") REFERENCES "plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "crops_plot_id_idx" ON "crops"("plot_id");