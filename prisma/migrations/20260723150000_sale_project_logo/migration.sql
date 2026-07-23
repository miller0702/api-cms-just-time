-- AlterTable
ALTER TABLE "cms"."sale_projects" ADD COLUMN IF NOT EXISTS "logo_media_id" TEXT;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_projects_logo_media_id_fkey'
  ) THEN
    ALTER TABLE "cms"."sale_projects"
      ADD CONSTRAINT "sale_projects_logo_media_id_fkey"
      FOREIGN KEY ("logo_media_id") REFERENCES "cms"."media_assets"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
