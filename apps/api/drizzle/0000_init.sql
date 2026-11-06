CREATE TYPE "public"."actor_kind" AS ENUM('HUMAN', 'AGENT');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('RESEARCH', 'ANALYSIS', 'TRADING', 'KNOWLEDGE');--> statement-breakpoint
CREATE TYPE "public"."evidence_stance" AS ENUM('SUPPORTS', 'CONTRADICTS', 'CONTEXT');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('ARTICLE', 'DATA', 'OFFICIAL', 'ACADEMIC', 'SOCIAL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('ONCHAIN_TESTNET', 'ONCHAIN_MAINNET', 'SIMULATED');--> statement-breakpoint
CREATE TYPE "public"."funding_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."inference_mode" AS ENUM('CONFIDENTIAL_TEE', 'SIMULATED');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('ACTIVE', 'PAUSED', 'RESOLUTION_PROPOSED', 'RESOLVED_YES', 'RESOLVED_NO', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('YES', 'NO');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'FETCHED', 'EXCERPT_VERIFIED', 'EXCERPT_NOT_FOUND', 'FETCH_FAILED');--> statement-breakpoint
CREATE TYPE "public"."wallet_kind" AS ENUM('NEAR_ACCOUNT', 'CHAIN_SIGNATURES_DERIVED', 'EXTERNAL');--> statement-breakpoint
CREATE TABLE "account_balances" (
	"trader_account" text NOT NULL,
	"execution_mode" "execution_mode" NOT NULL,
	"available" numeric(39,0) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"market_id" uuid,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"payload" jsonb,
	"inference_id" uuid,
	"trade_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"granted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"params" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"role" "agent_role" NOT NULL,
	"description" text NOT NULL,
	"near_account_id" text,
	"owner_user_id" uuid,
	"model" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug"),
	CONSTRAINT "agents_near_account_id_unique" UNIQUE("near_account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_inferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"mode" "inference_mode" NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"chat_id" text,
	"request_hash" text,
	"response_hash" text,
	"response_text" text,
	"status" text NOT NULL,
	"error" text,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"signature_text" text,
	"signature" text,
	"signing_address" text,
	"signing_algo" text,
	"signature_verified" boolean,
	"attestation_report" jsonb,
	"attestation_nonce" text,
	"attestation_binds_signer" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "article_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"price_yes_ppm" integer NOT NULL,
	"market_snapshot_id" uuid,
	"evidence_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"trigger_reason" text NOT NULL,
	"inference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"resolution_criteria" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encyclopedia_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"current_revision_id" uuid,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encyclopedia_pages_claim_id_unique" UNIQUE("claim_id")
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"title" text NOT NULL,
	"source_url" text NOT NULL,
	"source_name" text NOT NULL,
	"published_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone,
	"evidence_type" "evidence_type" NOT NULL,
	"stance" "evidence_stance" NOT NULL,
	"excerpt" text NOT NULL,
	"excerpt_hash" text NOT NULL,
	"content_hash" text,
	"http_status" integer,
	"final_url" text,
	"verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"verification_detail" text,
	"submitted_by_user_id" uuid,
	"submitted_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evidence_id" uuid NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funding_request_id" uuid NOT NULL,
	"status" "funding_status" NOT NULL,
	"provider_status" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'NEAR_INTENTS_1CLICK' NOT NULL,
	"origin_asset" text NOT NULL,
	"origin_chain" text NOT NULL,
	"destination_asset" text NOT NULL,
	"amount_in" numeric(39,0) NOT NULL,
	"amount_out_expected" numeric(39,0),
	"amount_out_min" numeric(39,0),
	"deposit_address" text,
	"deposit_memo" text,
	"refund_to" text NOT NULL,
	"quote" jsonb,
	"quote_signature" text,
	"deadline" timestamp with time zone,
	"status" "funding_status" DEFAULT 'PENDING' NOT NULL,
	"provider_status" text,
	"deposit_tx_hash" text,
	"settlement_tx_hash" text,
	"credit_transaction_id" uuid,
	"credited_amount" numeric(39,0),
	"signed_via_chain_signatures" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_requests_deposit_address_unique" UNIQUE("deposit_address")
);
--> statement-breakpoint
CREATE TABLE "indexer_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"block_height" numeric(39,0) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"price_yes_ppm" integer NOT NULL,
	"pool_yes" numeric(39,0) NOT NULL,
	"pool_no" numeric(39,0) NOT NULL,
	"volume" numeric(39,0) NOT NULL,
	"trade_count" integer NOT NULL,
	"cause" text NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"execution_mode" "execution_mode" NOT NULL,
	"contract_id" text,
	"onchain_id" integer,
	"status" "market_status" DEFAULT 'ACTIVE' NOT NULL,
	"pool_yes" numeric(39,0) NOT NULL,
	"pool_no" numeric(39,0) NOT NULL,
	"sets" numeric(39,0) NOT NULL,
	"fees" numeric(39,0) DEFAULT 0 NOT NULL,
	"fee_bps" integer NOT NULL,
	"volume" numeric(39,0) DEFAULT 0 NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"price_yes_ppm" integer NOT NULL,
	"lp_account" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_claim_id_unique" UNIQUE("claim_id"),
	CONSTRAINT "markets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"trader_account" text NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"yes_shares" numeric(39,0) DEFAULT 0 NOT NULL,
	"no_shares" numeric(39,0) DEFAULT 0 NOT NULL,
	"yes_cost" numeric(39,0) DEFAULT 0 NOT NULL,
	"no_cost" numeric(39,0) DEFAULT 0 NOT NULL,
	"realized_pnl" text DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"trader_account" text NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"user_id" uuid,
	"agent_id" uuid,
	"side" "trade_side" NOT NULL,
	"outcome" "outcome" NOT NULL,
	"collateral" numeric(39,0) NOT NULL,
	"shares" numeric(39,0) NOT NULL,
	"fee" numeric(39,0) NOT NULL,
	"price_before_ppm" integer NOT NULL,
	"price_after_ppm" integer NOT NULL,
	"avg_price_ppm" integer NOT NULL,
	"pool_yes_after" numeric(39,0) NOT NULL,
	"pool_no_after" numeric(39,0) NOT NULL,
	"execution_mode" "execution_mode" NOT NULL,
	"transaction_id" uuid,
	"event_index" integer,
	"client_order_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network" text NOT NULL,
	"tx_hash" text NOT NULL,
	"signer_id" text,
	"receiver_id" text,
	"kind" text NOT NULL,
	"status" "tx_status" DEFAULT 'PENDING' NOT NULL,
	"block_height" numeric(39,0),
	"logs" jsonb,
	"error" text,
	"execution_mode" "execution_mode" NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"near_account_id" text NOT NULL,
	"display_name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_near_account_id_unique" UNIQUE("near_account_id")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chain" text NOT NULL,
	"address" text NOT NULL,
	"kind" "wallet_kind" NOT NULL,
	"derivation_path" text,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_inference_id_ai_inferences_id_fk" FOREIGN KEY ("inference_id") REFERENCES "public"."ai_inferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_activities" ADD CONSTRAINT "agent_activities_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_strategies" ADD CONSTRAINT "agent_strategies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_page_id_encyclopedia_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."encyclopedia_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_market_snapshot_id_market_snapshots_id_fk" FOREIGN KEY ("market_snapshot_id") REFERENCES "public"."market_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_revisions" ADD CONSTRAINT "article_revisions_inference_id_ai_inferences_id_fk" FOREIGN KEY ("inference_id") REFERENCES "public"."ai_inferences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encyclopedia_pages" ADD CONSTRAINT "encyclopedia_pages_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_submitted_by_agent_id_agents_id_fk" FOREIGN KEY ("submitted_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_submissions" ADD CONSTRAINT "evidence_submissions_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_submissions" ADD CONSTRAINT "evidence_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_submissions" ADD CONSTRAINT "evidence_submissions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_funding_request_id_funding_requests_id_fk" FOREIGN KEY ("funding_request_id") REFERENCES "public"."funding_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_requests" ADD CONSTRAINT "funding_requests_credit_transaction_id_transactions_id_fk" FOREIGN KEY ("credit_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "balances_pk" ON "account_balances" USING btree ("trader_account","execution_mode");--> statement-breakpoint
CREATE INDEX "agent_activity_idx" ON "agent_activities" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_activity_market_idx" ON "agent_activities" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_permission_uq" ON "agent_permissions" USING btree ("agent_id","permission");--> statement-breakpoint
CREATE UNIQUE INDEX "revision_page_number_uq" ON "article_revisions" USING btree ("page_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_claim_url_excerpt_uq" ON "evidence" USING btree ("claim_id","source_url","excerpt_hash");--> statement-breakpoint
CREATE INDEX "evidence_claim_idx" ON "evidence" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "funding_user_idx" ON "funding_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "funding_status_idx" ON "funding_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "snapshots_market_time_idx" ON "market_snapshots" USING btree ("market_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "markets_contract_onchain_uq" ON "markets" USING btree ("contract_id","onchain_id");--> statement-breakpoint
CREATE INDEX "markets_status_idx" ON "markets" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_market_trader_uq" ON "positions" USING btree ("market_id","trader_account");--> statement-breakpoint
CREATE INDEX "positions_trader_idx" ON "positions" USING btree ("trader_account");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_client_order_uq" ON "trades" USING btree ("trader_account","client_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trades_tx_event_uq" ON "trades" USING btree ("transaction_id","event_index");--> statement-breakpoint
CREATE INDEX "trades_market_time_idx" ON "trades" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE INDEX "trades_trader_idx" ON "trades" USING btree ("trader_account","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_network_hash_uq" ON "transactions" USING btree ("network","tx_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_chain_address_uq" ON "wallets" USING btree ("chain","address");