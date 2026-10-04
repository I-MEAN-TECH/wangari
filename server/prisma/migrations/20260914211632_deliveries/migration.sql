-- CreateTable
CREATE TABLE "deliveries" (
    "id" SERIAL NOT NULL,
    "farm_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "commodity" TEXT NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'litres',
    "buyer" TEXT NOT NULL,
    "receipt_ref" TEXT,
    "unit_price" DECIMAL(12,2),
    "expected_pay" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paid_amount" DECIMAL(12,2),
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_deductions" (
    "id" SERIAL NOT NULL,
    "delivery_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "delivery_deductions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliveries_farm_id_date_idx" ON "deliveries"("farm_id", "date");
CREATE INDEX "deliveries_farm_id_commodity_idx" ON "deliveries"("farm_id", "commodity");

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_farm_id_fkey" FOREIGN KEY ("farm_id") REFERENCES "farms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_deductions" ADD CONSTRAINT "delivery_deductions_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
