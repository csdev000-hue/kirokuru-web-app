CREATE TABLE "rate_limits" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"hits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_rate_limits_expiry" ON "rate_limits" USING btree ("expires_at");