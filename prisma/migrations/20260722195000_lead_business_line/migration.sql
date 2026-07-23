-- AlterTable
ALTER TABLE "cms"."leads" ADD COLUMN IF NOT EXISTS "company" TEXT;
ALTER TABLE "cms"."leads" ADD COLUMN IF NOT EXISTS "business_line" TEXT;
ALTER TABLE "cms"."leads" ADD COLUMN IF NOT EXISTS "service_slug" TEXT;
