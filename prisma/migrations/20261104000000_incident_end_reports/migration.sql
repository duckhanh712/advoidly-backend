-- "This incident has ended" reports: one per user per incident (ADR-014).

-- CreateTable
CREATE TABLE "incidents"."incident_end_reports" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_end_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incident_end_reports_incident_id_reporter_id_key" ON "incidents"."incident_end_reports"("incident_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "incidents"."incident_end_reports" ADD CONSTRAINT "incident_end_reports_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"."incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

