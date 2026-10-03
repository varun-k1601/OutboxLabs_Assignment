CREATE TYPE "public"."email_status" AS ENUM('scheduled', 'rate_limited', 'sending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"delay_between_ms" integer NOT NULL,
	"hourly_limit" integer NOT NULL,
	"total_recipients" integer NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"status" "email_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"original_scheduled_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"message_id" text,
	"preview_url" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "senders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"provider" text DEFAULT 'ethereal' NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_secure" boolean DEFAULT false NOT NULL,
	"smtp_user" text NOT NULL,
	"smtp_pass" text NOT NULL,
	"hourly_limit" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text,
	"channel_id" text,
	"channel_name" text,
	"webhook_url" text NOT NULL,
	"configuration_url" text,
	"access_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."senders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_sender_id_senders_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."senders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "senders" ADD CONSTRAINT "senders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_connections" ADD CONSTRAINT "slack_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_user_idx" ON "campaigns" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaigns_user_idempotency_uq" ON "campaigns" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "emails_campaign_recipient_uq" ON "emails" USING btree ("campaign_id","recipient");--> statement-breakpoint
CREATE INDEX "emails_user_status_scheduled_idx" ON "emails" USING btree ("user_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "emails_status_scheduled_idx" ON "emails" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "emails_campaign_status_idx" ON "emails" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "senders_user_idx" ON "senders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_connections_user_uq" ON "slack_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_id_uq" ON "users" USING btree ("google_id");