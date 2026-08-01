CREATE TABLE "household_keys" (
	"household_id" uuid PRIMARY KEY NOT NULL,
	"kdf_alg" text NOT NULL,
	"kdf_iterations" integer NOT NULL,
	"passphrase_salt" text NOT NULL,
	"wrapped_dek_passphrase" text NOT NULL,
	"passphrase_wrap_iv" text NOT NULL,
	"recovery_salt" text NOT NULL,
	"wrapped_dek_recovery" text NOT NULL,
	"recovery_wrap_iv" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "ciphertext" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "iv" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "ciphertext" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "iv" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "holdings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "ciphertext" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "iv" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "protection" ADD COLUMN "ciphertext" text;--> statement-breakpoint
ALTER TABLE "protection" ADD COLUMN "iv" text;--> statement-breakpoint
ALTER TABLE "protection" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "protection" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "household_keys" ADD CONSTRAINT "household_keys_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;