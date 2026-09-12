CREATE TABLE "ai_call_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"ledger_id" uuid,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"cap_type" text NOT NULL,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_global_usage" (
	"period" text PRIMARY KEY NOT NULL,
	"calls_used" integer DEFAULT 0 NOT NULL,
	"cap_calls" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_call_reservations" ADD CONSTRAINT "ai_call_reservations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_reservations" ADD CONSTRAINT "ai_call_reservations_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_call_reservations_household_idempotency_idx" ON "ai_call_reservations" USING btree ("household_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_call_reservations_household_id_idx" ON "ai_call_reservations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "ai_call_reservations_ledger_id_idx" ON "ai_call_reservations" USING btree ("ledger_id");