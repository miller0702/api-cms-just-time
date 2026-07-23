-- AlterTable
ALTER TABLE "cms"."services" ADD COLUMN IF NOT EXISTS "gallery" JSONB NOT NULL DEFAULT '[]';
