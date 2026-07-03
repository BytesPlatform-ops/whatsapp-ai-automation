CREATE TYPE "ServiceStatus" AS ENUM ('locked', 'trial', 'active');

CREATE TABLE "workspace_services" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "service_key" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'locked',
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "activated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_services_workspace_id_idx" ON "workspace_services"("workspace_id");
CREATE UNIQUE INDEX "workspace_services_workspace_id_service_key_key" ON "workspace_services"("workspace_id", "service_key");

ALTER TABLE "workspace_services" ADD CONSTRAINT "workspace_services_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
