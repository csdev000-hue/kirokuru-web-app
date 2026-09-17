ALTER TABLE "meeting_minutes" ALTER COLUMN "ai_model" SET DATA TYPE varchar(2048);--> statement-breakpoint
ALTER TABLE "meeting_minutes" ADD COLUMN "generation_key" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "minutes_generation_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "minutes_generation_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_minutes_generation_key" ON "meeting_minutes" USING btree ("meeting_id","generation_key") WHERE "meeting_minutes"."generation_key" is not null;