-- CreateTable
CREATE TABLE "site_content" (
    "page" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("page")
);
