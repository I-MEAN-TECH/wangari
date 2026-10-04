-- AlterTable: admin TOTP MFA
ALTER TABLE "users" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "recovery_codes" TEXT;
