CREATE TABLE "candidate_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minutes_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"lease_token" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_generations_status_check" CHECK ("candidate_generations"."status" in ('processing', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "ticket_candidates" ALTER COLUMN "ai_model" SET DATA TYPE varchar(2048);--> statement-breakpoint
ALTER TABLE "ticket_candidates" ADD COLUMN "generation_id" uuid;--> statement-breakpoint
ALTER TABLE "candidate_generations" ADD CONSTRAINT "candidate_generations_minutes_id_meeting_minutes_id_fk" FOREIGN KEY ("minutes_id") REFERENCES "public"."meeting_minutes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidate_generation_request" ON "candidate_generations" USING btree ("minutes_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_candidate_generation_processing" ON "candidate_generations" USING btree ("minutes_id") WHERE "candidate_generations"."status" = 'processing';--> statement-breakpoint
ALTER TABLE "ticket_candidates" ADD CONSTRAINT "ticket_candidates_generation_id_candidate_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."candidate_generations"("id") ON DELETE restrict ON UPDATE no action;