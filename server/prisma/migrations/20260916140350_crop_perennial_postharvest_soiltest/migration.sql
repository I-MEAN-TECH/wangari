-- AlterTable: perennial crop lifecycle fields
ALTER TABLE "crops" ADD COLUMN "is_perennial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "crops" ADD COLUMN "maturity_years" INTEGER;
ALTER TABLE "crops" ADD COLUMN "years_in_production" INTEGER;
ALTER TABLE "crops" ADD COLUMN "harvest_season" TEXT;

-- AlterTable: pre-harvest interval on input applications (export compliance)
ALTER TABLE "crop_applications" ADD COLUMN "phi_days" INTEGER;

-- CreateTable: post-harvest handling chain (avocado/mango/macadamia export grade)
CREATE TABLE "post_harvest_batches" (
    "id" SERIAL NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "batch_code" TEXT NOT NULL,
    "harvest_date" TIMESTAMP(3) NOT NULL,
    "quantity_kg" DECIMAL(10,2) NOT NULL,
    "grade" TEXT,
    "dry_matter_pct" DECIMAL(5,2),
    "treatment" TEXT,
    "treatment_date" TIMESTAMP(3),
    "cooled_at" TIMESTAMP(3),
    "storage_temp_c" DECIMAL(5,2),
    "storage_exited_at" TIMESTAMP(3),
    "packed_qty_kg" DECIMAL(10,2),
    "cartons" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'harvested',
    "destination" TEXT,
    "phyto_cert_no" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_harvest_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable: soil tests (KALRO guidance: test before planting & fertilising)
CREATE TABLE "soil_tests" (
    "id" SERIAL NOT NULL,
    "crop_id" INTEGER,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "lab_name" TEXT,
    "ph" DECIMAL(4,2),
    "nitrogen" TEXT,
    "phosphorus" TEXT,
    "potassium" TEXT,
    "organic_matter_pct" DECIMAL(5,2),
    "recommendation" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "soil_tests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "post_harvest_batches" ADD CONSTRAINT "post_harvest_batches_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_harvest_batches" ADD CONSTRAINT "post_harvest_batches_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soil_tests" ADD CONSTRAINT "soil_tests_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soil_tests" ADD CONSTRAINT "soil_tests_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
