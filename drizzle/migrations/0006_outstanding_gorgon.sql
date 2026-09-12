CREATE TABLE "ledger_projection_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ledger_id" uuid NOT NULL,
	"asset_class" text NOT NULL,
	"annual_rate_pct" numeric(5, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "assumed_annual_rate_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "rate_source" text;--> statement-breakpoint
ALTER TABLE "instruments" ADD COLUMN "assumed_rate_as_of" date;--> statement-breakpoint
ALTER TABLE "ledger_projection_settings" ADD CONSTRAINT "ledger_projection_settings_ledger_id_ledgers_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."ledgers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_projection_settings_ledger_id_idx" ON "ledger_projection_settings" USING btree ("ledger_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_projection_settings_ledger_asset_class_idx" ON "ledger_projection_settings" USING btree ("ledger_id","asset_class");