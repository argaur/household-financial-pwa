CREATE TABLE "ledgers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"ai_edits_used" integer DEFAULT 0 NOT NULL,
	"snapshot_of" uuid,
	"projection_horizon_years" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "ledger_id" uuid;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_snapshot_of_ledgers_id_fk" FOREIGN KEY ("snapshot_of") REFERENCES "public"."ledgers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledgers_household_id_idx" ON "ledgers" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledgers_household_baseline_idx" ON "ledgers" USING btree ("household_id") WHERE "ledgers"."is_baseline";--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holdings_ledger_id_idx" ON "holdings" USING btree ("ledger_id");