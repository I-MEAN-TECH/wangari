-- Farm-scoped in-app notifications: announcements can now target one farm.
ALTER TABLE "announcements" ADD COLUMN "farm_id" INTEGER;
CREATE INDEX "announcements_farm_id_active_idx" ON "announcements"("farm_id", "active");
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
