ALTER TABLE "meeting_recordings" ADD COLUMN "upload_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD COLUMN "uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "meeting_recordings" ADD COLUMN "deleted_at" timestamp with time zone;