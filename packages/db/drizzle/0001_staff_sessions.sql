-- POS-025 additive migration. NEVER run against production or Neon without owner review.
-- Only 256-bit CSPRNG session token digests are persisted; no plaintext.
CREATE TABLE "staff_sessions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "store_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "issued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  CONSTRAINT "staff_sessions_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "staff_sessions_token_hash_format" CHECK ("staff_sessions"."token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "staff_sessions_short_lived" CHECK ("staff_sessions"."expires_at" > "staff_sessions"."issued_at" AND "staff_sessions"."expires_at" <= "staff_sessions"."issued_at" + interval '15 minutes')
);
--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_membership_fk" FOREIGN KEY ("store_id","user_id") REFERENCES "public"."store_memberships"("store_id","user_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "staff_sessions_store_user_idx" ON "staff_sessions" USING btree ("store_id","user_id");
