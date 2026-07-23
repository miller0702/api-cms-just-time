-- CreateTable
CREATE TABLE "cms"."admin_roles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "permissions" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_slug_key" ON "cms"."admin_roles"("slug");

-- Seed system roles (fixed ids for migration of existing users)
INSERT INTO "cms"."admin_roles" ("id", "slug", "name", "description", "is_system", "permissions", "created_at", "updated_at")
VALUES
(
  '11111111-1111-1111-1111-111111111001',
  'superadmin',
  'Superadmin',
  'Control total del sistema, incluido gestionar administradores.',
  true,
  ARRAY[
    'dashboard.view','news.read','news.write','pills.read','pills.write',
    'pages.read','pages.write','services.read','services.write',
    'projects.read','projects.write','media.read','media.write',
    'leads.read','leads.write','comments.read','comments.moderate',
    'settings.write','users.manage'
  ]::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '11111111-1111-1111-1111-111111111002',
  'admin',
  'Administrador',
  'Operación del sitio, ajustes y gestión de usuarios.',
  true,
  ARRAY[
    'dashboard.view','news.read','news.write','pills.read','pills.write',
    'pages.read','pages.write','services.read','services.write',
    'projects.read','projects.write','media.read','media.write',
    'leads.read','leads.write','comments.read','comments.moderate',
    'settings.write','users.manage'
  ]::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '11111111-1111-1111-1111-111111111003',
  'editor',
  'Editor',
  'Crear y editar contenido, media, cotizaciones y comentarios.',
  true,
  ARRAY[
    'dashboard.view','news.read','news.write','pills.read','pills.write',
    'pages.read','pages.write','services.read','services.write',
    'projects.read','projects.write','media.read','media.write',
    'leads.read','leads.write','comments.read','comments.moderate'
  ]::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
),
(
  '11111111-1111-1111-1111-111111111004',
  'viewer',
  'Solo lectura',
  'Solo consultar el panel, sin cambios.',
  true,
  ARRAY[
    'dashboard.view','news.read','pills.read','pages.read',
    'services.read','projects.read','media.read','leads.read','comments.read'
  ]::TEXT[],
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Add role_id and backfill from legacy enum
ALTER TABLE "cms"."admin_users" ADD COLUMN "role_id" TEXT;

UPDATE "cms"."admin_users" u
SET "role_id" = CASE u."role"::text
  WHEN 'superadmin' THEN '11111111-1111-1111-1111-111111111001'
  WHEN 'admin' THEN '11111111-1111-1111-1111-111111111002'
  WHEN 'editor' THEN '11111111-1111-1111-1111-111111111003'
  WHEN 'viewer' THEN '11111111-1111-1111-1111-111111111004'
  ELSE '11111111-1111-1111-1111-111111111002'
END;

ALTER TABLE "cms"."admin_users" ALTER COLUMN "role_id" SET NOT NULL;

-- Drop legacy enum column
ALTER TABLE "cms"."admin_users" DROP COLUMN "role";

DROP TYPE IF EXISTS "cms"."AdminRole";
DROP TYPE IF EXISTS "AdminRole";

-- AddForeignKey
ALTER TABLE "cms"."admin_users"
  ADD CONSTRAINT "admin_users_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "cms"."admin_roles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "admin_users_role_id_idx" ON "cms"."admin_users"("role_id");
