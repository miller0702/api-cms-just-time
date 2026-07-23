-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin', 'editor', 'viewer');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "role" "AdminRole" NOT NULL DEFAULT 'admin';
