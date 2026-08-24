ALTER TABLE "ledgers" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "ciphertext" text;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "iv" text;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "ledgers" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;