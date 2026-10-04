-- AlterTable: token revocation support
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "workers" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
