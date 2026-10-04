-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password" TEXT,
    "google_id" TEXT,
    "avatar" TEXT,
    "role" TEXT NOT NULL DEFAULT 'farm_owner',
    "profile_complete" BOOLEAN NOT NULL DEFAULT false,
    "email_verified" TIMESTAMP(3),
    "trial_starts_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "selected_hubs" TEXT,
    "reset_token" TEXT,
    "reset_token_expiry" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'email_verification',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "plan" TEXT NOT NULL,
    "plan_name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reference" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "renewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farms" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "location" TEXT,
    "county" TEXT,
    "farm_type" TEXT,
    "owner_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_members" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "farm_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flocks" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "breed" TEXT,
    "initial_count" INTEGER NOT NULL,
    "current_count" INTEGER NOT NULL,
    "mortality" INTEGER NOT NULL DEFAULT 0,
    "hatch_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "type" TEXT DEFAULT 'layers',
    "category" TEXT DEFAULT 'poultry',
    "purpose" TEXT,
    "gender" TEXT,
    "gender_ratio" TEXT,
    "location" TEXT,
    "source" TEXT,
    "supplier_contact" TEXT,
    "cost_per_animal" DECIMAL(10,2),
    "total_investment" DECIMAL(12,2),
    "target_market" TEXT,
    "feed_type" TEXT,
    "feed_supplier" TEXT,
    "feed_cost_per_month" DECIMAL(10,2),
    "vet_name" TEXT,
    "vet_phone" TEXT,
    "health_on_arrival" TEXT,
    "insurance_policy" TEXT,
    "photo_url" TEXT,
    "expected_yield" TEXT,
    "expected_revenue" DECIMAL(12,2),
    "expected_weight" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_production" (
    "id" SERIAL NOT NULL,
    "flock_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "eggs_collected" INTEGER NOT NULL DEFAULT 0,
    "milk_collected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "mortality" INTEGER NOT NULL DEFAULT 0,
    "feed_used" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_weight" DECIMAL(10,2),
    "weight_gain" DECIMAL(10,2),
    "water_used" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_records" (
    "id" SERIAL NOT NULL,
    "flock_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "sire_name" TEXT,
    "sire_breed" TEXT,
    "dam_name" TEXT,
    "dam_breed" TEXT,
    "mating_date" TIMESTAMP(3) NOT NULL,
    "expected_birth" TIMESTAMP(3),
    "actual_birth" TIMESTAMP(3),
    "offspring_count" INTEGER,
    "offspring_alive" INTEGER,
    "method" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breeding_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crops" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "crop_type" TEXT NOT NULL,
    "variety" TEXT,
    "area_acres" DECIMAL(10,2),
    "planting_date" TIMESTAMP(3),
    "expected_harvest" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "location" TEXT,
    "soil_type" TEXT,
    "irrigation" TEXT,
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_harvests" (
    "id" SERIAL NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "quantity_kg" DECIMAL(10,2) NOT NULL,
    "quality" TEXT,
    "sold_quantity" DECIMAL(10,2),
    "sale_price" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_harvests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_health" (
    "id" SERIAL NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "issue_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'low',
    "treatment" TEXT,
    "treated_date" TIMESTAMP(3),
    "outcome" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crop_applications" (
    "id" SERIAL NOT NULL,
    "crop_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "cost" DECIMAL(12,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crop_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" SERIAL NOT NULL,
    "flock_id" INTEGER NOT NULL,
    "vaccine_name" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "completed_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "date" DATE NOT NULL,
    "payment_method" TEXT,
    "reference" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'bags',
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "expiry_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_logs" (
    "id" SERIAL NOT NULL,
    "inventory_id" INTEGER NOT NULL,
    "change_type" TEXT NOT NULL,
    "quantity_change" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "total_credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "items" JSONB NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'paid',
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sale_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credits" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER,
    "customer_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "amount_owed" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "sale_id" INTEGER,
    "customer_id" INTEGER,
    "invoice_number" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "payment_status" TEXT NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "pin" TEXT,
    "daily_wage" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'active',
    "hired_date" TIMESTAMP(3),
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_tasks" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "worker_id" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "due_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_logs" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "worker_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" SERIAL NOT NULL,
    "worker_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "check_in" TEXT,
    "check_out" TEXT,
    "status" TEXT NOT NULL DEFAULT 'present',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_recipes" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "ingredients" JSONB,
    "cost_per_bag" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feed_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_cache" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER,
    "location" TEXT NOT NULL DEFAULT 'default',
    "date" DATE NOT NULL,
    "temperature_max" DECIMAL(5,2),
    "temperature_min" DECIMAL(5,2),
    "rainfall_mm" DECIMAL(5,2),
    "weather_code" TEXT,
    "forecast_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "farm_settings" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "setting_key" TEXT NOT NULL,
    "setting_value" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "farm_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zkteco_devices" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "serial_number" TEXT NOT NULL,
    "device_secret" TEXT NOT NULL,
    "name" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zkteco_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zkteco_logs" (
    "id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "device_user_id" TEXT NOT NULL,
    "worker_id" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "verify_type" TEXT,
    "attendance_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zkteco_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "farm_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "verification_codes_user_id_purpose_idx" ON "verification_codes"("user_id", "purpose");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "farms_code_key" ON "farms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "farm_members_user_id_farm_id_key" ON "farm_members"("user_id", "farm_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_production_flock_id_date_key" ON "daily_production"("flock_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "weather_cache_location_date_key" ON "weather_cache"("location", "date");

-- CreateIndex
CREATE UNIQUE INDEX "farm_settings_farm_id_setting_key_key" ON "farm_settings"("farm_id", "setting_key");

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_devices_farm_id_serial_number_key" ON "zkteco_devices"("farm_id", "serial_number");

-- CreateIndex
CREATE UNIQUE INDEX "zkteco_logs_device_id_attendance_id_key" ON "zkteco_logs"("device_id", "attendance_id");

-- AddForeignKey
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farms" ADD CONSTRAINT "farms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flocks" ADD CONSTRAINT "flocks_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flocks" ADD CONSTRAINT "flocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production" ADD CONSTRAINT "daily_production_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_production" ADD CONSTRAINT "daily_production_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_records" ADD CONSTRAINT "breeding_records_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crops" ADD CONSTRAINT "crops_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crops" ADD CONSTRAINT "crops_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_harvests" ADD CONSTRAINT "crop_harvests_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_harvests" ADD CONSTRAINT "crop_harvests_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_health" ADD CONSTRAINT "crop_health_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_health" ADD CONSTRAINT "crop_health_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_applications" ADD CONSTRAINT "crop_applications_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "crops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crop_applications" ADD CONSTRAINT "crop_applications_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_flock_id_fkey" FOREIGN KEY ("flock_id") REFERENCES "flocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_logs" ADD CONSTRAINT "inventory_logs_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credits" ADD CONSTRAINT "credits_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workers" ADD CONSTRAINT "workers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_tasks" ADD CONSTRAINT "worker_tasks_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_tasks" ADD CONSTRAINT "worker_tasks_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_logs" ADD CONSTRAINT "worker_logs_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_logs" ADD CONSTRAINT "worker_logs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_recipes" ADD CONSTRAINT "feed_recipes_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather_cache" ADD CONSTRAINT "weather_cache_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "farm_settings" ADD CONSTRAINT "farm_settings_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_devices" ADD CONSTRAINT "zkteco_devices_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_logs" ADD CONSTRAINT "zkteco_logs_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "zkteco_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_logs" ADD CONSTRAINT "zkteco_logs_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zkteco_logs" ADD CONSTRAINT "zkteco_logs_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

