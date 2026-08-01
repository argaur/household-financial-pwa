ALTER TABLE "family_members" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ALTER COLUMN "relationship" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "family_members" ALTER COLUMN "date_of_birth" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "instrument_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "asset_class" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "invested_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "holdings" ALTER COLUMN "current_value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "protection" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "protection" ALTER COLUMN "cover_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "protection" ALTER COLUMN "status" DROP NOT NULL;