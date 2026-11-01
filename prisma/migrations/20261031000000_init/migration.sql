-- Initial schema for Urban Alert Platform.
--
-- Generated with `prisma migrate diff --from-empty --to-schema-datamodel` and then edited by
-- hand for what Prisma cannot express:
--   1. the PostGIS extension;
--   2. triggers that keep each `location` column in sync with latitude/longitude (Prisma
--      models `location` as Unsupported("geography(Point,4326)") and never writes it);
--   3. CHECK constraints on coordinates and radii.
-- Prisma does not diff triggers, functions or CHECK constraints, and the `location` columns
-- themselves are exactly what Prisma generates, so these edits do not cause schema drift.
-- (Do NOT use GENERATED columns here: Prisma reads the generation expression as a DEFAULT
-- and keeps producing a failing `ALTER COLUMN "location" DROP DEFAULT` migration.)

CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "incidents";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "moderation";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "users";

-- CreateEnum
CREATE TYPE "auth"."UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "incidents"."IncidentType" AS ENUM ('ACCIDENT', 'TRAFFIC_JAM', 'FLOODING', 'ROAD_CLOSURE', 'CONSTRUCTION', 'OTHER');

-- CreateEnum
CREATE TYPE "incidents"."IncidentStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "incidents"."IncidentReportStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "incidents"."MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "incidents"."IncidentHistoryAction" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED');

-- CreateEnum
CREATE TYPE "moderation"."ModerationCaseStatus" AS ENUM ('OPEN', 'INFO_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "moderation"."ModerationActionType" AS ENUM ('APPROVE', 'REJECT', 'REQUEST_INFO');

-- CreateEnum
CREATE TYPE "notifications"."NotificationType" AS ENUM ('INCIDENT_NEARBY', 'REPORT_VERIFIED', 'REPORT_REJECTED', 'REPORT_RESOLVED', 'MODERATION_INFO_REQUESTED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "notifications"."NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "auth"."users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "auth"."UserRole" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."profiles" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(2048),
    "locale" VARCHAR(10) NOT NULL DEFAULT 'vi',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."saved_areas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "radius_meters" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."notification_preferences" (
    "user_id" UUID NOT NULL,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "incident_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quiet_hours_start" SMALLINT,
    "quiet_hours_end" SMALLINT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "users"."processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "incidents"."incidents" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "type" "incidents"."IncidentType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "status" "incidents"."IncidentStatus" NOT NULL DEFAULT 'PENDING',
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents"."incident_reports" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "description" TEXT,
    "status" "incidents"."IncidentReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "incident_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents"."incident_media" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "media_url" VARCHAR(2048) NOT NULL,
    "media_type" "incidents"."MediaType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents"."incident_history" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "incidents"."IncidentHistoryAction" NOT NULL,
    "previous_status" "incidents"."IncidentStatus",
    "new_status" "incidents"."IncidentStatus",
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation"."cases" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "incident_type" VARCHAR(32) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "location" geography(Point,4326),
    "status" "moderation"."ModerationCaseStatus" NOT NULL DEFAULT 'OPEN',
    "possible_duplicate_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation"."actions" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "action" "moderation"."ModerationActionType" NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation"."processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "notifications"."notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notifications"."NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "notifications"."NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "dedupe_key" VARCHAR(200),
    "read_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" VARCHAR(512) NOT NULL,
    "platform" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."processed_events" (
    "event_id" UUID NOT NULL,
    "event_type" VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "auth"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "auth"."refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "auth"."refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "saved_areas_user_id_idx" ON "users"."saved_areas"("user_id");

-- CreateIndex
CREATE INDEX "saved_areas_location_idx" ON "users"."saved_areas" USING GIST ("location");

-- CreateIndex
CREATE INDEX "incidents_status_occurred_at_idx" ON "incidents"."incidents"("status", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_reporter_id_created_at_idx" ON "incidents"."incidents"("reporter_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_location_idx" ON "incidents"."incidents" USING GIST ("location");

-- CreateIndex
CREATE INDEX "incident_reports_incident_id_idx" ON "incidents"."incident_reports"("incident_id");

-- CreateIndex
CREATE INDEX "incident_reports_reporter_id_idx" ON "incidents"."incident_reports"("reporter_id");

-- CreateIndex
CREATE INDEX "incident_media_incident_id_idx" ON "incidents"."incident_media"("incident_id");

-- CreateIndex
CREATE INDEX "incident_history_incident_id_created_at_idx" ON "incidents"."incident_history"("incident_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cases_incident_id_key" ON "moderation"."cases"("incident_id");

-- CreateIndex
CREATE INDEX "cases_status_created_at_idx" ON "moderation"."cases"("status", "created_at");

-- CreateIndex
CREATE INDEX "cases_incident_type_occurred_at_idx" ON "moderation"."cases"("incident_type", "occurred_at");

-- CreateIndex
CREATE INDEX "cases_location_idx" ON "moderation"."cases" USING GIST ("location");

-- CreateIndex
CREATE INDEX "actions_case_id_created_at_idx" ON "moderation"."actions"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"."notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"."notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "notifications"."device_tokens"("token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "notifications"."device_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "auth"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."saved_areas" ADD CONSTRAINT "saved_areas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"."profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents"."incident_reports" ADD CONSTRAINT "incident_reports_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"."incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents"."incident_media" ADD CONSTRAINT "incident_media_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"."incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents"."incident_history" ADD CONSTRAINT "incident_history_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"."incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation"."actions" ADD CONSTRAINT "actions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "moderation"."cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: coordinate and radius sanity checks.
ALTER TABLE "users"."saved_areas"
    ADD CONSTRAINT "saved_areas_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "saved_areas_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
    ADD CONSTRAINT "saved_areas_radius_check" CHECK ("radius_meters" BETWEEN 50 AND 50000);

ALTER TABLE "incidents"."incidents"
    ADD CONSTRAINT "incidents_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "incidents_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "moderation"."cases"
    ADD CONSTRAINT "cases_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    ADD CONSTRAINT "cases_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180);

ALTER TABLE "users"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_quiet_hours_check"
    CHECK (("quiet_hours_start" IS NULL) = ("quiet_hours_end" IS NULL)
       AND ("quiet_hours_start" IS NULL OR "quiet_hours_start" BETWEEN 0 AND 23)
       AND ("quiet_hours_end" IS NULL OR "quiet_hours_end" BETWEEN 0 AND 23));

-- Hand-written: keep `location` in sync with latitude/longitude on every write.
-- One function per schema so no service schema depends on another.
CREATE FUNCTION "users"."sync_location"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."location" := public.ST_SetSRID(public.ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::public.geography;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "saved_areas_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "users"."saved_areas"
    FOR EACH ROW EXECUTE FUNCTION "users"."sync_location"();

CREATE FUNCTION "incidents"."sync_location"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."location" := public.ST_SetSRID(public.ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::public.geography;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "incidents_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "incidents"."incidents"
    FOR EACH ROW EXECUTE FUNCTION "incidents"."sync_location"();

CREATE FUNCTION "moderation"."sync_location"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW."location" := public.ST_SetSRID(public.ST_MakePoint(NEW."longitude", NEW."latitude"), 4326)::public.geography;
    RETURN NEW;
END;
$$;
CREATE TRIGGER "cases_sync_location"
    BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "moderation"."cases"
    FOR EACH ROW EXECUTE FUNCTION "moderation"."sync_location"();
