-- One report per user per incident (original report or one later confirmation).
-- The unique index also serves lookups by incident_id, so the old single-column index is dropped.

-- DropIndex
DROP INDEX "incidents"."incident_reports_incident_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "incident_reports_incident_id_reporter_id_key" ON "incidents"."incident_reports"("incident_id", "reporter_id");

