-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "type" TEXT NOT NULL DEFAULT 'lead',
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "source" TEXT,
    "owner_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contact_notes" (
    "id" SERIAL NOT NULL,
    "contact_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_contact_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" SERIAL NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider" TEXT,
    "provider_id" TEXT,
    "error" TEXT,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_contacts_stage_idx" ON "crm_contacts"("stage");
CREATE INDEX "crm_contact_notes_contact_id_idx" ON "crm_contact_notes"("contact_id");
CREATE INDEX "email_logs_status_idx" ON "email_logs"("status");
