-- CreateEnum
CREATE TYPE "ConnectionProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_hash";

-- CreateTable
CREATE TABLE "connections" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" "ConnectionProvider" NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "scopes" TEXT[],
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connections_provider_provider_account_id_key" ON "connections"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "connections_user_id_provider_key" ON "connections"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

