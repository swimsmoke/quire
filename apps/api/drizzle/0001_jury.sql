CREATE TABLE "rulings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"requested_by" text,
	"verdict" text NOT NULL,
	"outcome" text NOT NULL,
	"votes" jsonb NOT NULL,
	"evidence_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer NOT NULL,
	"proposal_tx" text,
	"proposal_error" text,
	"challenge_ends_at" timestamp with time zone,
	"disputed_by" text,
	"disputed_at" timestamp with time zone,
	"dispute_tx" text,
	"bond_settled" boolean DEFAULT false NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalize_tx" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rulings" ADD CONSTRAINT "rulings_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rulings_market_idx" ON "rulings" USING btree ("market_id","created_at");