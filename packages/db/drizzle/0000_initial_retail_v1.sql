CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"actor_id" uuid,
	"device_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "brands_store_id_id_unique" UNIQUE("store_id","id")
);
--> statement-breakpoint
CREATE TABLE "catalog_change_log" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "catalog_change_log_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"store_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_store_id_id_unique" UNIQUE("store_id","id")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"name" text NOT NULL,
	"offline_checkout_enabled" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_store_id_id_unique" UNIQUE("store_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" bigint NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_balances_pk" PRIMARY KEY("store_id","variant_id"),
	CONSTRAINT "balances_revision_nonnegative" CHECK ("inventory_balances"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sale_id" uuid,
	"qty_delta" bigint NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movements_kind_not_empty" CHECK (length(trim("inventory_movements"."kind")) > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"method" text NOT NULL,
	"due_vnd" bigint NOT NULL,
	"tendered_vnd" bigint NOT NULL,
	"change_vnd" bigint NOT NULL,
	CONSTRAINT "payments_one_per_sale_unique" UNIQUE("sale_id"),
	CONSTRAINT "payments_cash_only" CHECK ("payments"."method" = 'CASH'),
	CONSTRAINT "payments_cash_amounts_valid" CHECK ("payments"."due_vnd" >= 0 AND "payments"."tendered_vnd" >= "payments"."due_vnd" AND "payments"."change_vnd" = "payments"."tendered_vnd" - "payments"."due_vnd")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"attributes_key" text NOT NULL,
	"price_vnd" bigint NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "variants_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "variants_store_sku_unique" UNIQUE("store_id","sku"),
	CONSTRAINT "variants_product_attributes_unique" UNIQUE("product_id","attributes_key"),
	CONSTRAINT "variants_price_nonnegative" CHECK ("product_variants"."price_vnd" >= 0),
	CONSTRAINT "variants_revision_nonnegative" CHECK ("product_variants"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_store_id_id_unique" UNIQUE("store_id","id")
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sale_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku_snapshot" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"attributes_snapshot" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_vnd" bigint NOT NULL,
	"discount_vnd" bigint NOT NULL,
	"line_total_vnd" bigint NOT NULL,
	CONSTRAINT "sale_items_sale_id_id_unique" UNIQUE("sale_id","id"),
	CONSTRAINT "sale_items_quantity_positive" CHECK ("sale_items"."quantity" > 0),
	CONSTRAINT "sale_items_amounts_nonnegative" CHECK ("sale_items"."unit_price_vnd" >= 0 AND "sale_items"."discount_vnd" >= 0 AND "sale_items"."line_total_vnd" >= 0),
	CONSTRAINT "sale_items_line_total_consistent" CHECK ("sale_items"."line_total_vnd"::numeric = "sale_items"."quantity"::numeric * "sale_items"."unit_price_vnd"::numeric - "sale_items"."discount_vnd"::numeric),
	CONSTRAINT "sale_items_snapshots_not_empty" CHECK (length(trim("sale_items"."sku_snapshot")) > 0 AND length(trim("sale_items"."name_snapshot")) > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"cashier_id" uuid NOT NULL,
	"client_created_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_vnd" bigint NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "sales_store_id_id_unique" UNIQUE("store_id","id"),
	CONSTRAINT "sales_total_nonnegative" CHECK ("sales"."total_vnd" >= 0),
	CONSTRAINT "sales_status_not_empty" CHECK (length(trim("sales"."status")) > 0)
);
--> statement-breakpoint
CREATE TABLE "store_memberships" (
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "store_memberships_pk" PRIMARY KEY("store_id","user_id"),
	CONSTRAINT "store_memberships_role_not_empty" CHECK (length(trim("store_memberships"."role")) > 0)
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"details" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_receipts" (
	"event_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"result_code" text NOT NULL,
	"ack_json" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_receipts_device_event_pk" PRIMARY KEY("device_id","event_id"),
	CONSTRAINT "sync_receipts_sale_id_unique" UNIQUE("sale_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_change_log" ADD CONSTRAINT "catalog_change_log_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "balances_variant_same_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "movements_variant_same_store_fk" FOREIGN KEY ("store_id","variant_id") REFERENCES "public"."product_variants"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "variants_product_same_store_fk" FOREIGN KEY ("store_id","product_id") REFERENCES "public"."products"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_same_store_fk" FOREIGN KEY ("store_id","category_id") REFERENCES "public"."categories"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_same_store_fk" FOREIGN KEY ("store_id","brand_id") REFERENCES "public"."brands"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_device_same_store_fk" FOREIGN KEY ("store_id","device_id") REFERENCES "public"."devices"("store_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_cashier_membership_fk" FOREIGN KEY ("store_id","cashier_id") REFERENCES "public"."store_memberships"("store_id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_receipts" ADD CONSTRAINT "sync_receipts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_receipts" ADD CONSTRAINT "sync_receipts_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_store_created_idx" ON "audit_logs" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "catalog_change_log_store_seq_idx" ON "catalog_change_log" USING btree ("store_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_one_active_offline_pos_per_store" ON "devices" USING btree ("store_id") WHERE "devices"."offline_checkout_enabled" = true AND "devices"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "movements_variant_created_idx" ON "inventory_movements" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "movements_sale_variant_kind_unique" ON "inventory_movements" USING btree ("sale_id","variant_id","kind") WHERE "inventory_movements"."sale_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "sales_store_client_created_idx" ON "sales" USING btree ("store_id","client_created_at");--> statement-breakpoint
CREATE INDEX "sync_conflicts_status_created_idx" ON "sync_conflicts" USING btree ("status","created_at");

--> statement-breakpoint
-- POS-012 manual extension: keep posted cash sales and their existing children immutable.
CREATE FUNCTION smartpos_prevent_posted_sale_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'POSTED sale history is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sales_posted_immutable BEFORE UPDATE OR DELETE ON sales
FOR EACH ROW EXECUTE FUNCTION smartpos_prevent_posted_sale_mutation();
--> statement-breakpoint
CREATE FUNCTION smartpos_prevent_posted_sale_child_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales WHERE id = OLD.sale_id AND status = 'POSTED') THEN
    RAISE EXCEPTION 'POSTED sale item/payment is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER sale_items_posted_immutable BEFORE UPDATE OR DELETE ON sale_items
FOR EACH ROW EXECUTE FUNCTION smartpos_prevent_posted_sale_child_mutation();
--> statement-breakpoint
CREATE TRIGGER payments_posted_immutable BEFORE UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION smartpos_prevent_posted_sale_child_mutation();
--> statement-breakpoint
CREATE FUNCTION smartpos_prevent_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Append-only financial/audit history cannot be changed';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movements_append_only BEFORE UPDATE OR DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION smartpos_prevent_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER receipts_append_only BEFORE UPDATE OR DELETE ON sync_receipts
FOR EACH ROW EXECUTE FUNCTION smartpos_prevent_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION smartpos_prevent_append_only_mutation();
