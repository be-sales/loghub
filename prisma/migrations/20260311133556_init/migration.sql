-- CreateEnum
CREATE TYPE "log_level" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "api_key_hash" VARCHAR(64) NOT NULL,
    "api_key_last4" VARCHAR(4) NOT NULL,
    "topic_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "level" "log_level" NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "stack_trace" TEXT,
    "metadata" JSONB,
    "fingerprint" VARCHAR(64) NOT NULL,
    "telegram_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_api_key_hash_key" ON "services"("api_key_hash");

-- CreateIndex
CREATE INDEX "idx_errorlog_service_created" ON "error_logs"("service_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_errorlog_fingerprint_created" ON "error_logs"("fingerprint", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_errorlog_level_created" ON "error_logs"("level", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_errorlog_created" ON "error_logs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "error_logs" ADD CONSTRAINT "error_logs_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
