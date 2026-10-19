-- Canonical GT structural baseline, derived from executed source catalog.
-- Source SHA256: c46f37c0a0ebb90e4cb14e05f82d69ef71314dc8208a8dab3169128d52f17df7
-- Deliberately excludes ALL source rows, policies, grants, functions, triggers,
-- views, authentication behavior, and storage bucket settings. Forward migrations
-- replace security/session/event contracts. Never replay legacy migrations on GT.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE public."admin_actions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid,
  "action" text NOT NULL,
  "target_email" text,
  "details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "target_id" uuid,
  "target_type" character varying(50),
  "ip_address" inet,
  "user_agent" text
);
ALTER TABLE public."admin_actions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."admin_sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid NOT NULL,
  "session_token" text NOT NULL,
  "refresh_token" text NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_activity" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true
);
ALTER TABLE public."admin_sessions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."admin_teams" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "slug" text NOT NULL,
  "team_lead_id" uuid,
  "color" text DEFAULT '#4285F4'::text,
  "icon" text DEFAULT 'users'::text,
  "is_active" boolean DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."admin_teams" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."admin_users" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text,
  "role" text DEFAULT 'admin'::text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "last_login" timestamp with time zone,
  "must_change_password" boolean DEFAULT false,
  "password_changed_at" timestamp with time zone DEFAULT now(),
  "temporary_password_expires_at" timestamp with time zone,
  "created_by" uuid,
  "display_name" text
);
ALTER TABLE public."admin_users" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."announcement_reads" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "announcement_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."announcement_reads" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."announcements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" character varying(255) NOT NULL,
  "message" text NOT NULL,
  "author_id" uuid NOT NULL,
  "priority" character varying(20) DEFAULT 'medium'::character varying,
  "is_pinned" boolean DEFAULT false,
  "is_archived" boolean DEFAULT false,
  "target_audience" jsonb DEFAULT '{"type": "all"}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."blog_categories" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "color" text DEFAULT '#3B82F6'::text,
  "is_active" boolean DEFAULT true,
  "order_index" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."blog_categories" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."blog_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "author_name" character varying(100) NOT NULL,
  "author_email" character varying(255) NOT NULL,
  "content" text NOT NULL,
  "is_approved" boolean DEFAULT false,
  "is_flagged" boolean DEFAULT false,
  "parent_comment_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."blog_comments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."blog_likes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "user_identifier" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."blog_likes" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."blog_posts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text,
  "content" text NOT NULL,
  "featured_image_url" text,
  "author_name" text NOT NULL,
  "author_email" text,
  "author_avatar_url" text,
  "category_id" uuid,
  "tags" text[] DEFAULT '{}'::text[],
  "status" text DEFAULT 'draft'::text,
  "is_featured" boolean DEFAULT false,
  "read_time_minutes" integer DEFAULT 5,
  "views_count" integer DEFAULT 0,
  "likes_count" integer DEFAULT 0,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "created_by" uuid,
  "updated_by" uuid,
  "requires_approval" boolean DEFAULT false,
  "approval_status" character varying(20) DEFAULT 'approved'::character varying,
  "pending_changes" jsonb,
  "change_summary" text,
  "rejection_reason" text,
  "comments_count" integer DEFAULT 0,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "rejected_by" uuid,
  "rejected_at" timestamp with time zone
);
ALTER TABLE public."blog_posts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."blog_submission_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "submission_id" uuid NOT NULL,
  "admin_id" uuid NOT NULL,
  "comment" text NOT NULL,
  "comment_type" text DEFAULT 'general'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."blog_submission_comments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."blog_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "file_path" text NOT NULL,
  "original_name" text NOT NULL,
  "submitter_name" text NOT NULL,
  "submitter_email" text NOT NULL,
  "file_size" bigint NOT NULL,
  "mime_type" text NOT NULL,
  "status" text DEFAULT 'pending'::text,
  "admin_notes" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."blog_submissions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."budget_allocations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "total_amount" numeric(12,2) NOT NULL,
  "spent_amount" numeric(12,2) DEFAULT 0,
  "team_id" uuid,
  "fiscal_year" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text DEFAULT 'active'::text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."budget_allocations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."channel_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "message" text NOT NULL,
  "message_type" text DEFAULT 'text'::text,
  "attachment_url" text,
  "reply_to_id" uuid,
  "is_pinned" boolean DEFAULT false,
  "read_by" uuid[] DEFAULT '{}'::uuid[],
  "is_deleted" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."channel_messages" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."channels" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "created_by" uuid,
  "is_archived" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."channels" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."communication_tasks" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" character varying(255) NOT NULL,
  "description" text,
  "assigned_to_id" uuid,
  "assigned_by_id" uuid NOT NULL,
  "due_date" date,
  "status" character varying(20) DEFAULT 'pending'::character varying,
  "priority" character varying(20) DEFAULT 'medium'::character varying,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."communication_tasks" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."csrf_tokens" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "token" text NOT NULL,
  "admin_id" uuid,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."csrf_tokens" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "date" timestamp with time zone NOT NULL,
  "location" text NOT NULL,
  "image_url" text,
  "registration_url" text,
  "is_featured" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "external_attendees" integer DEFAULT 0,
  "level" character varying(20) DEFAULT 'open_for_all'::character varying,
  "event_link" text,
  "type" character varying(50) DEFAULT 'Workshop'::character varying,
  "google_form_url" text,
  "google_event_url" text,
  "registration_type" text DEFAULT 'both'::text,
  "max_participants" integer,
  "registration_enabled" boolean DEFAULT true,
  "timezone" text DEFAULT 'America/New_York'::text,
  "time" text,
  "room" text,
  "prerequisites" text,
  "what_youll_learn" text,
  "what_to_bring" text,
  "schedule" text,
  "additional_info" text,
  "contact_info" text
);
ALTER TABLE public."events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."finance_attachments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "finance_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "file_type" text,
  "file_size" integer,
  "uploaded_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "storage_path" character varying(500)
);
ALTER TABLE public."finance_attachments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."finance_report_cache" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_type" character varying(50) NOT NULL,
  "team_id" uuid,
  "fiscal_year" character varying(10),
  "report_data" jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now(),
  "expires_at" timestamp with time zone DEFAULT (now() + '01:00:00'::interval)
);
ALTER TABLE public."finance_report_cache" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."finances" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "transaction_type" text NOT NULL,
  "category" text NOT NULL,
  "amount" numeric(12,2) NOT NULL,
  "currency" text DEFAULT 'USD'::text,
  "description" text NOT NULL,
  "vendor_name" text,
  "reference_number" text,
  "transaction_date" date NOT NULL,
  "team_id" uuid,
  "event_id" uuid,
  "project_id" uuid,
  "status" text DEFAULT 'pending'::text,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "notes" text,
  "is_recurring" boolean DEFAULT false,
  "recurring_frequency" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "submitted_by" uuid,
  "rejection_reason" text,
  "approval_level" text DEFAULT 'pending'::text
);
ALTER TABLE public."finances" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."footer_content" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "section_key" text NOT NULL,
  "content" jsonb NOT NULL,
  "is_active" boolean DEFAULT true,
  "order_index" integer DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" uuid
);
ALTER TABLE public."footer_content" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."internal_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "from_user_id" uuid NOT NULL,
  "to_user_id" uuid NOT NULL,
  "subject" character varying(255) NOT NULL,
  "message" text NOT NULL,
  "is_read" boolean DEFAULT false,
  "is_archived" boolean DEFAULT false,
  "reply_to_id" uuid,
  "attachments" jsonb DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "read_at" timestamp with time zone
);
ALTER TABLE public."internal_messages" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."linktree_analytics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid,
  "link_id" uuid,
  "visitor_ip" inet,
  "user_agent" text,
  "referrer" text,
  "country" character varying(2),
  "city" character varying(100),
  "clicked_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."linktree_analytics" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."linktree_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid,
  "title" character varying(100) NOT NULL,
  "url" text NOT NULL,
  "description" text,
  "icon_type" character varying(20) DEFAULT 'link'::character varying,
  "icon_value" text,
  "button_style" character varying(20) DEFAULT 'default'::character varying,
  "button_color" character varying(7) DEFAULT '#ffffff'::character varying,
  "text_color" character varying(7) DEFAULT '#000000'::character varying,
  "is_active" boolean DEFAULT true,
  "sort_order" integer DEFAULT 0,
  "click_count" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "embed_type" text DEFAULT 'none'::text,
  "show_click_count" boolean DEFAULT true
);
ALTER TABLE public."linktree_links" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."linktree_profiles" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "username" character varying(50) NOT NULL,
  "display_name" character varying(100) NOT NULL,
  "bio" text,
  "avatar_url" text,
  "background_type" character varying(20) DEFAULT 'color'::character varying,
  "background_value" text DEFAULT '#1a1a1a'::text,
  "theme" character varying(20) DEFAULT 'dark'::character varying,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."linktree_profiles" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."media_files" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" character varying(255) NOT NULL,
  "original_name" character varying(255) NOT NULL,
  "file_type" character varying(50) NOT NULL,
  "mime_type" character varying(100) NOT NULL,
  "file_size" bigint NOT NULL,
  "file_path" text NOT NULL,
  "thumbnail_path" text,
  "folder_id" uuid,
  "uploaded_by" uuid NOT NULL,
  "width" integer,
  "height" integer,
  "duration" integer,
  "is_starred" boolean DEFAULT false,
  "is_public" boolean DEFAULT false,
  "alt_text" text,
  "description" text,
  "tags" jsonb DEFAULT '[]'::jsonb,
  "seo_title" character varying(255),
  "seo_description" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "event_id" uuid
);
ALTER TABLE public."media_files" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."media_folders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" character varying(255) NOT NULL,
  "parent_id" uuid,
  "path" text NOT NULL,
  "description" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."media_folders" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."media_usage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "file_id" uuid NOT NULL,
  "usage_type" character varying(50) NOT NULL,
  "reference_id" uuid,
  "reference_table" character varying(50),
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."media_usage" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "year" text,
  "major" text,
  "category" text DEFAULT 'member'::text,
  "interests" text[] DEFAULT '{}'::text[],
  "join_date" timestamp with time zone DEFAULT now(),
  "last_active" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "team_section" text DEFAULT 'Active Members'::text
);
ALTER TABLE public."members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."navigation_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "label" text NOT NULL,
  "href" text NOT NULL,
  "icon" text,
  "order_index" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "parent_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" uuid
);
ALTER TABLE public."navigation_items" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."newsletter_campaigns" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "subject" text NOT NULL,
  "content" text NOT NULL,
  "html_content" text,
  "status" text DEFAULT 'draft'::text,
  "scheduled_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "recipient_count" integer DEFAULT 0,
  "open_count" integer DEFAULT 0,
  "click_count" integer DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."newsletter_campaigns" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."newsletter_subscribers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "subscribed_at" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true,
  "name" text,
  "confirmation_token" text,
  "confirmed_at" timestamp with time zone,
  "unsubscribe_token" text DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."newsletter_subscription_attempts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "attempt_count" integer DEFAULT 1 NOT NULL,
  "first_attempt_at" timestamp with time zone DEFAULT now(),
  "last_attempt_at" timestamp with time zone DEFAULT now(),
  "blocked_until" timestamp with time zone,
  "block_level" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."newsletter_subscription_attempts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."newsletter_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "content" text NOT NULL,
  "html_content" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."newsletter_templates" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" character varying(50) NOT NULL,
  "title" character varying(255) NOT NULL,
  "message" text NOT NULL,
  "link" character varying(500),
  "is_read" boolean DEFAULT false,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."notifications" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."page_content" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "page_slug" text NOT NULL,
  "section_key" text NOT NULL,
  "content" jsonb NOT NULL,
  "is_active" boolean DEFAULT true,
  "order_index" integer DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" uuid
);
ALTER TABLE public."page_content" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."project_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid,
  "member_id" uuid,
  "role" character varying(100) DEFAULT 'contributor'::character varying,
  "joined_at" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true
);
ALTER TABLE public."project_members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."project_stars" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid,
  "user_id" uuid,
  "user_identifier" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."project_stars" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."projects" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "tech_stack" text[] DEFAULT '{}'::text[] NOT NULL,
  "github_url" text,
  "demo_url" text,
  "image_url" text,
  "is_featured" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "stars_count" integer DEFAULT 0,
  "short_description" character varying(500),
  "category" character varying(100) DEFAULT 'web'::character varying,
  "status" character varying(50) DEFAULT 'active'::character varying,
  "difficulty_level" character varying(50) DEFAULT 'intermediate'::character varying,
  "team_size" integer DEFAULT 1,
  "start_date" date,
  "end_date" date,
  "is_open_source" boolean DEFAULT true,
  "tags" text[] DEFAULT '{}'::text[],
  "created_by" uuid
);
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."resources" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "type" text NOT NULL,
  "category" text,
  "url" text,
  "duration" text,
  "level" text,
  "status" text DEFAULT 'Available'::text,
  "provider" text,
  "amount" text,
  "requirements" text[],
  "materials" text[],
  "tags" text[],
  "speaker" text,
  "views" integer DEFAULT 0,
  "icon" text,
  "color" text,
  "metadata" jsonb,
  "is_active" boolean DEFAULT true,
  "order_index" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."resources" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."security_alerts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "alert_type" text NOT NULL,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "details" jsonb,
  "is_resolved" boolean DEFAULT false,
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."security_alerts" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."security_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_type" character varying(50) NOT NULL,
  "admin_id" uuid NOT NULL,
  "ip_address" inet,
  "user_agent" text,
  "details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."security_events" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."site_content" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "section" text NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."site_content" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."site_settings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" uuid
);
ALTER TABLE public."site_settings" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."site_status" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "is_live" boolean DEFAULT true NOT NULL,
  "redirect_url" text,
  "message" text,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public."site_status" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."social_links" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "platform" text NOT NULL,
  "url" text NOT NULL,
  "icon" text NOT NULL,
  "is_active" boolean DEFAULT true,
  "order_index" integer DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" uuid
);
ALTER TABLE public."social_links" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."sponsor_impact_stats" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "stat_label" text NOT NULL,
  "stat_value" text NOT NULL,
  "stat_description" text NOT NULL,
  "icon_name" text DEFAULT 'users'::text NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public."sponsor_impact_stats" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."sponsors" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "logo_url" text NOT NULL,
  "website_url" text,
  "tier" text NOT NULL,
  "order_index" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."sponsors" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."sponsorship_tiers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tier_name" text NOT NULL,
  "tier_level" text NOT NULL,
  "amount" text NOT NULL,
  "color_gradient" text NOT NULL,
  "benefits" text[] DEFAULT '{}'::text[] NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT timezone('utc'::text, now()),
  "updated_at" timestamp with time zone DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public."sponsorship_tiers" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."task_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "comment" text NOT NULL,
  "comment_type" character varying(20) DEFAULT 'comment'::character varying,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."task_comments" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_activity_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "actor_id" uuid NOT NULL,
  "action" text NOT NULL,
  "target_user_id" uuid,
  "details" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_activity_log" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_announcements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "priority" text DEFAULT 'normal'::text,
  "author_id" uuid NOT NULL,
  "is_pinned" boolean DEFAULT false,
  "expires_at" timestamp with time zone,
  "read_by" uuid[] DEFAULT '{}'::uuid[],
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "scheduled_for" timestamp with time zone,
  "is_published" boolean DEFAULT true
);
ALTER TABLE public."team_announcements" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_invites" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "email" text NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "invited_by" uuid NOT NULL,
  "token" text NOT NULL,
  "status" text DEFAULT 'pending'::text,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_invites" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_member_transfers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "membership_id" uuid NOT NULL,
  "from_team_id" uuid NOT NULL,
  "to_team_id" uuid NOT NULL,
  "transferred_by" uuid NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_member_transfers" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_members" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "bio" text,
  "image_url" text,
  "linkedin_url" text,
  "github_url" text,
  "order_index" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "email" text,
  "member_id" uuid,
  "team_section" text DEFAULT 'Active Members'::text
);
ALTER TABLE public."team_members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_memberships" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "joined_at" timestamp with time zone DEFAULT now(),
  "added_by" uuid,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_memberships" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "sender_id" uuid NOT NULL,
  "message" text NOT NULL,
  "message_type" text DEFAULT 'text'::text,
  "attachment_url" text,
  "reply_to_id" uuid,
  "is_pinned" boolean DEFAULT false,
  "read_by" uuid[] DEFAULT '{}'::uuid[],
  "is_deleted" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_messages" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_page_access" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "page_path" text NOT NULL,
  "can_access" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_page_access" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_permissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "permission" text NOT NULL,
  "resource_type" text NOT NULL,
  "can_create" boolean DEFAULT false,
  "can_read" boolean DEFAULT true,
  "can_update" boolean DEFAULT false,
  "can_delete" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_permissions" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."team_statistics" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL,
  "stat_type" text NOT NULL,
  "stat_period" text NOT NULL,
  "stat_date" date NOT NULL,
  "stat_value" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."team_statistics" ENABLE ROW LEVEL SECURITY;

CREATE TABLE public."whiteboards" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text DEFAULT 'Untitled board'::text NOT NULL,
  "document" jsonb,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);
ALTER TABLE public."whiteboards" ENABLE ROW LEVEL SECURITY;

ALTER TABLE public."admin_actions" ADD CONSTRAINT "admin_actions_action_check" CHECK ((action = ANY (ARRAY['login'::text, 'logout'::text, 'create_admin'::text, 'update_admin'::text, 'delete_admin'::text, 'reset_password'::text, 'promote_team_member'::text, 'create_event'::text, 'update_event'::text, 'delete_event'::text, 'publish_event'::text, 'unpublish_event'::text, 'create_team_member'::text, 'update_team_member'::text, 'delete_team_member'::text, 'create_sponsor'::text, 'update_sponsor'::text, 'delete_sponsor'::text, 'create_project'::text, 'update_project'::text, 'delete_project'::text, 'create_member'::text, 'update_member'::text, 'delete_member'::text, 'create_newsletter_campaign'::text, 'send_newsletter'::text, 'schedule_newsletter'::text, 'delete_newsletter'::text, 'export_subscribers'::text, 'import_subscribers'::text, 'update_subscriber'::text, 'create_announcement'::text, 'update_announcement'::text, 'delete_announcement'::text, 'create_task'::text, 'update_task'::text, 'delete_task'::text, 'send_message'::text, 'view_communications'::text, 'view_media_library'::text, 'create_media_folder'::text, 'update_media_folder'::text, 'delete_media_folder'::text, 'upload_media_file'::text, 'update_media_file'::text, 'delete_media_file'::text, 'bulk_delete_media_files'::text, 'bulk_update_media_tags'::text, 'update_site_settings'::text, 'update_page_content'::text, 'update_footer_content'::text, 'update_navigation'::text, 'update_social_links'::text, 'update_admin_secret_code'::text, 'change_password'::text, 'update_security_settings'::text, 'view_audit_log'::text, 'export_audit_log'::text, 'backup_database'::text, 'restore_database'::text, 'clear_cache'::text, 'update_system_settings'::text])));
ALTER TABLE public."admin_actions" ADD CONSTRAINT "admin_actions_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_sessions" ADD CONSTRAINT "admin_sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_sessions" ADD CONSTRAINT "admin_sessions_refresh_token_key" UNIQUE (refresh_token);
ALTER TABLE public."admin_sessions" ADD CONSTRAINT "admin_sessions_session_token_key" UNIQUE (session_token);
ALTER TABLE public."admin_teams" ADD CONSTRAINT "admin_teams_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_teams" ADD CONSTRAINT "admin_teams_slug_key" UNIQUE (slug);
ALTER TABLE public."admin_users" ADD CONSTRAINT "admin_users_email_key" UNIQUE (email);
ALTER TABLE public."admin_users" ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_users" ADD CONSTRAINT "admin_users_role_check" CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'team_member'::text, 'blog_editor'::text])));
ALTER TABLE public."announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_user_id_key" UNIQUE (announcement_id, user_id);
ALTER TABLE public."announcement_reads" ADD CONSTRAINT "announcement_reads_pkey" PRIMARY KEY (id);
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_priority_check" CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[])));
ALTER TABLE public."blog_categories" ADD CONSTRAINT "blog_categories_name_key" UNIQUE (name);
ALTER TABLE public."blog_categories" ADD CONSTRAINT "blog_categories_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_categories" ADD CONSTRAINT "blog_categories_slug_key" UNIQUE (slug);
ALTER TABLE public."blog_comments" ADD CONSTRAINT "blog_comments_author_email_format" CHECK (((author_email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text));
ALTER TABLE public."blog_comments" ADD CONSTRAINT "blog_comments_author_name_length" CHECK (((char_length((author_name)::text) >= 1) AND (char_length((author_name)::text) <= 100)));
ALTER TABLE public."blog_comments" ADD CONSTRAINT "blog_comments_content_length" CHECK (((char_length(content) >= 1) AND (char_length(content) <= 2000)));
ALTER TABLE public."blog_comments" ADD CONSTRAINT "blog_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_likes" ADD CONSTRAINT "blog_likes_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_likes" ADD CONSTRAINT "blog_likes_post_id_user_identifier_key" UNIQUE (post_id, user_identifier);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_approval_status_check" CHECK (((approval_status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])));
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_slug_key" UNIQUE (slug);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE public."blog_submission_comments" ADD CONSTRAINT "blog_submission_comments_comment_type_check" CHECK ((comment_type = ANY (ARRAY['general'::text, 'feedback'::text, 'status_change'::text, 'internal'::text])));
ALTER TABLE public."blog_submission_comments" ADD CONSTRAINT "blog_submission_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_submissions" ADD CONSTRAINT "blog_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE public."blog_submissions" ADD CONSTRAINT "blog_submissions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE public."budget_allocations" ADD CONSTRAINT "budget_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE public."budget_allocations" ADD CONSTRAINT "budget_allocations_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text, 'exceeded'::text])));
ALTER TABLE public."channel_messages" ADD CONSTRAINT "channel_messages_message_type_check" CHECK ((message_type = ANY (ARRAY['text'::text, 'file'::text, 'image'::text, 'link'::text])));
ALTER TABLE public."channel_messages" ADD CONSTRAINT "channel_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."channels" ADD CONSTRAINT "channels_pkey" PRIMARY KEY (id);
ALTER TABLE public."communication_tasks" ADD CONSTRAINT "communication_tasks_pkey" PRIMARY KEY (id);
ALTER TABLE public."communication_tasks" ADD CONSTRAINT "communication_tasks_priority_check" CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying])::text[])));
ALTER TABLE public."communication_tasks" ADD CONSTRAINT "communication_tasks_status_check" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in-progress'::character varying, 'completed'::character varying, 'overdue'::character varying])::text[])));
ALTER TABLE public."csrf_tokens" ADD CONSTRAINT "csrf_tokens_pkey" PRIMARY KEY (id);
ALTER TABLE public."csrf_tokens" ADD CONSTRAINT "csrf_tokens_token_key" UNIQUE (token);
ALTER TABLE public."events" ADD CONSTRAINT "events_level_check" CHECK (((level)::text = ANY ((ARRAY['beginner'::character varying, 'intermediate'::character varying, 'advanced'::character varying, 'open_for_all'::character varying])::text[])));
ALTER TABLE public."events" ADD CONSTRAINT "events_pkey" PRIMARY KEY (id);
ALTER TABLE public."finance_attachments" ADD CONSTRAINT "finance_attachments_pkey" PRIMARY KEY (id);
ALTER TABLE public."finance_report_cache" ADD CONSTRAINT "finance_report_cache_pkey" PRIMARY KEY (id);
ALTER TABLE public."finances" ADD CONSTRAINT "finances_approval_level_check" CHECK ((approval_level = ANY (ARRAY['pending'::text, 'team_lead_approved'::text, 'admin_approved'::text, 'super_admin_approved'::text, 'rejected'::text])));
ALTER TABLE public."finances" ADD CONSTRAINT "finances_pkey" PRIMARY KEY (id);
ALTER TABLE public."finances" ADD CONSTRAINT "finances_recurring_frequency_check" CHECK ((recurring_frequency = ANY (ARRAY['weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text])));
ALTER TABLE public."finances" ADD CONSTRAINT "finances_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE public."finances" ADD CONSTRAINT "finances_transaction_type_check" CHECK ((transaction_type = ANY (ARRAY['income'::text, 'expense'::text, 'transfer'::text, 'reimbursement'::text])));
ALTER TABLE public."footer_content" ADD CONSTRAINT "footer_content_pkey" PRIMARY KEY (id);
ALTER TABLE public."footer_content" ADD CONSTRAINT "footer_content_section_key_key" UNIQUE (section_key);
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."linktree_analytics" ADD CONSTRAINT "linktree_analytics_pkey" PRIMARY KEY (id);
ALTER TABLE public."linktree_links" ADD CONSTRAINT "linktree_links_button_style_check" CHECK (((button_style)::text = ANY ((ARRAY['default'::character varying, 'outline'::character varying, 'filled'::character varying, 'minimal'::character varying])::text[])));
ALTER TABLE public."linktree_links" ADD CONSTRAINT "linktree_links_embed_type_check" CHECK ((embed_type = ANY (ARRAY['none'::text, 'google_form'::text, 'iframe'::text])));
ALTER TABLE public."linktree_links" ADD CONSTRAINT "linktree_links_icon_type_check" CHECK (((icon_type)::text = ANY ((ARRAY['link'::character varying, 'social'::character varying, 'custom'::character varying])::text[])));
ALTER TABLE public."linktree_links" ADD CONSTRAINT "linktree_links_pkey" PRIMARY KEY (id);
ALTER TABLE public."linktree_profiles" ADD CONSTRAINT "linktree_profiles_background_type_check" CHECK (((background_type)::text = ANY ((ARRAY['color'::character varying, 'gradient'::character varying, 'image'::character varying])::text[])));
ALTER TABLE public."linktree_profiles" ADD CONSTRAINT "linktree_profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."linktree_profiles" ADD CONSTRAINT "linktree_profiles_theme_check" CHECK (((theme)::text = ANY ((ARRAY['light'::character varying, 'dark'::character varying, 'auto'::character varying])::text[])));
ALTER TABLE public."linktree_profiles" ADD CONSTRAINT "linktree_profiles_username_key" UNIQUE (username);
ALTER TABLE public."media_files" ADD CONSTRAINT "media_files_pkey" PRIMARY KEY (id);
ALTER TABLE public."media_folders" ADD CONSTRAINT "media_folders_pkey" PRIMARY KEY (id);
ALTER TABLE public."media_usage" ADD CONSTRAINT "media_usage_pkey" PRIMARY KEY (id);
ALTER TABLE public."members" ADD CONSTRAINT "members_category_check" CHECK ((category = ANY (ARRAY['founder'::text, 'organizer'::text, 'lead'::text, 'active'::text, 'member'::text, 'alumni'::text])));
ALTER TABLE public."members" ADD CONSTRAINT "members_email_key" UNIQUE (email);
ALTER TABLE public."members" ADD CONSTRAINT "members_pkey" PRIMARY KEY (id);
ALTER TABLE public."navigation_items" ADD CONSTRAINT "navigation_items_pkey" PRIMARY KEY (id);
ALTER TABLE public."newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_pkey" PRIMARY KEY (id);
ALTER TABLE public."newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'sent'::text, 'failed'::text])));
ALTER TABLE public."newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_email_key" UNIQUE (email);
ALTER TABLE public."newsletter_subscribers" ADD CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY (id);
ALTER TABLE public."newsletter_subscription_attempts" ADD CONSTRAINT "newsletter_subscription_attempts_pkey" PRIMARY KEY (id);
ALTER TABLE public."newsletter_templates" ADD CONSTRAINT "newsletter_templates_pkey" PRIMARY KEY (id);
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_pkey" PRIMARY KEY (id);
ALTER TABLE public."page_content" ADD CONSTRAINT "page_content_page_slug_section_key_key" UNIQUE (page_slug, section_key);
ALTER TABLE public."page_content" ADD CONSTRAINT "page_content_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_project_id_member_id_key" UNIQUE (project_id, member_id);
ALTER TABLE public."projects" ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_stars" ADD CONSTRAINT "project_stars_pkey" PRIMARY KEY (id);
ALTER TABLE public."project_stars" ADD CONSTRAINT "project_stars_project_id_user_id_key" UNIQUE (project_id, user_id);
ALTER TABLE public."project_stars" ADD CONSTRAINT "project_stars_project_id_user_identifier_key" UNIQUE (project_id, user_identifier);
ALTER TABLE public."resources" ADD CONSTRAINT "resources_level_check" CHECK ((level = ANY (ARRAY['Beginner'::text, 'Intermediate'::text, 'Advanced'::text])));
ALTER TABLE public."resources" ADD CONSTRAINT "resources_pkey" PRIMARY KEY (id);
ALTER TABLE public."resources" ADD CONSTRAINT "resources_status_check" CHECK ((status = ANY (ARRAY['Available'::text, 'Coming Soon'::text, 'Archived'::text])));
ALTER TABLE public."resources" ADD CONSTRAINT "resources_type_check" CHECK ((type = ANY (ARRAY['study_jam'::text, 'cloud_credit'::text, 'documentation'::text, 'recording'::text])));
ALTER TABLE public."security_alerts" ADD CONSTRAINT "security_alerts_pkey" PRIMARY KEY (id);
ALTER TABLE public."security_alerts" ADD CONSTRAINT "security_alerts_severity_check" CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])));
ALTER TABLE public."security_events" ADD CONSTRAINT "security_events_event_type_check" CHECK (((event_type)::text = ANY ((ARRAY['login_success'::character varying, 'login_failed'::character varying, 'password_change'::character varying, 'account_locked'::character varying, 'suspicious_activity'::character varying])::text[])));
ALTER TABLE public."security_events" ADD CONSTRAINT "security_events_pkey" PRIMARY KEY (id);
ALTER TABLE public."site_content" ADD CONSTRAINT "site_content_pkey" PRIMARY KEY (id);
ALTER TABLE public."site_content" ADD CONSTRAINT "site_content_section_key_key" UNIQUE (section, key);
ALTER TABLE public."site_settings" ADD CONSTRAINT "site_settings_key_key" UNIQUE (key);
ALTER TABLE public."site_settings" ADD CONSTRAINT "site_settings_pkey" PRIMARY KEY (id);
ALTER TABLE public."site_status" ADD CONSTRAINT "site_status_pkey" PRIMARY KEY (id);
ALTER TABLE public."social_links" ADD CONSTRAINT "social_links_pkey" PRIMARY KEY (id);
ALTER TABLE public."sponsor_impact_stats" ADD CONSTRAINT "sponsor_impact_stats_pkey" PRIMARY KEY (id);
ALTER TABLE public."sponsors" ADD CONSTRAINT "sponsors_pkey" PRIMARY KEY (id);
ALTER TABLE public."sponsors" ADD CONSTRAINT "sponsors_tier_check" CHECK ((tier = ANY (ARRAY['platinum'::text, 'gold'::text, 'silver'::text, 'bronze'::text])));
ALTER TABLE public."sponsorship_tiers" ADD CONSTRAINT "sponsorship_tiers_pkey" PRIMARY KEY (id);
ALTER TABLE public."sponsorship_tiers" ADD CONSTRAINT "sponsorship_tiers_tier_level_key" UNIQUE (tier_level);
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_comment_type_check" CHECK (((comment_type)::text = ANY ((ARRAY['comment'::character varying, 'status_change'::character varying, 'assignment_change'::character varying])::text[])));
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_activity_log" ADD CONSTRAINT "team_activity_log_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_announcements" ADD CONSTRAINT "team_announcements_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_announcements" ADD CONSTRAINT "team_announcements_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public."team_invites" ADD CONSTRAINT "team_invites_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_invites" ADD CONSTRAINT "team_invites_role_check" CHECK ((role = ANY (ARRAY['lead'::text, 'co_lead'::text, 'member'::text])));
ALTER TABLE public."team_invites" ADD CONSTRAINT "team_invites_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'cancelled'::text])));
ALTER TABLE public."team_invites" ADD CONSTRAINT "team_invites_token_key" UNIQUE (token);
ALTER TABLE public."team_members" ADD CONSTRAINT "team_members_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_memberships" ADD CONSTRAINT "team_memberships_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_memberships" ADD CONSTRAINT "team_memberships_role_check" CHECK ((role = ANY (ARRAY['lead'::text, 'co_lead'::text, 'member'::text])));
ALTER TABLE public."team_memberships" ADD CONSTRAINT "team_memberships_team_id_admin_user_id_key" UNIQUE (team_id, admin_user_id);
ALTER TABLE public."team_member_transfers" ADD CONSTRAINT "team_member_transfers_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_messages" ADD CONSTRAINT "team_messages_message_type_check" CHECK ((message_type = ANY (ARRAY['text'::text, 'file'::text, 'image'::text, 'link'::text])));
ALTER TABLE public."team_messages" ADD CONSTRAINT "team_messages_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_page_access" ADD CONSTRAINT "team_page_access_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_page_access" ADD CONSTRAINT "team_page_access_team_id_page_path_key" UNIQUE (team_id, page_path);
ALTER TABLE public."team_permissions" ADD CONSTRAINT "team_permissions_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_permissions" ADD CONSTRAINT "team_permissions_team_id_permission_resource_type_key" UNIQUE (team_id, permission, resource_type);
ALTER TABLE public."team_statistics" ADD CONSTRAINT "team_statistics_pkey" PRIMARY KEY (id);
ALTER TABLE public."team_statistics" ADD CONSTRAINT "team_statistics_team_id_stat_type_stat_period_stat_date_key" UNIQUE (team_id, stat_type, stat_period, stat_date);
ALTER TABLE public."whiteboards" ADD CONSTRAINT "whiteboards_pkey" PRIMARY KEY (id);
ALTER TABLE public."admin_actions" ADD CONSTRAINT "admin_actions_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."admin_teams" ADD CONSTRAINT "admin_teams_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."admin_teams" ADD CONSTRAINT "admin_teams_team_lead_id_fkey" FOREIGN KEY (team_lead_id) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."admin_users" ADD CONSTRAINT "admin_users_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_fkey" FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE public."announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."announcements" ADD CONSTRAINT "announcements_author_id_fkey" FOREIGN KEY (author_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."blog_comments" ADD CONSTRAINT "blog_comments_parent_comment_id_fkey" FOREIGN KEY (parent_comment_id) REFERENCES blog_comments(id) ON DELETE CASCADE;
ALTER TABLE public."blog_comments" ADD CONSTRAINT "fk_blog_comments_post_id" FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE;
ALTER TABLE public."blog_likes" ADD CONSTRAINT "blog_likes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE;
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES admin_users(id);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_category_id_fkey" FOREIGN KEY (category_id) REFERENCES blog_categories(id) ON DELETE SET NULL;
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_rejected_by_fkey" FOREIGN KEY (rejected_by) REFERENCES admin_users(id);
ALTER TABLE public."blog_posts" ADD CONSTRAINT "blog_posts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."blog_submission_comments" ADD CONSTRAINT "blog_submission_comments_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."blog_submission_comments" ADD CONSTRAINT "blog_submission_comments_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES blog_submissions(id) ON DELETE CASCADE;
ALTER TABLE public."budget_allocations" ADD CONSTRAINT "budget_allocations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."budget_allocations" ADD CONSTRAINT "budget_allocations_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE SET NULL;
ALTER TABLE public."channel_messages" ADD CONSTRAINT "channel_messages_channel_id_fkey" FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
ALTER TABLE public."channel_messages" ADD CONSTRAINT "channel_messages_reply_to_id_fkey" FOREIGN KEY (reply_to_id) REFERENCES channel_messages(id) ON DELETE SET NULL;
ALTER TABLE public."channel_messages" ADD CONSTRAINT "channel_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."channels" ADD CONSTRAINT "channels_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."communication_tasks" ADD CONSTRAINT "communication_tasks_assigned_by_id_fkey" FOREIGN KEY (assigned_by_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."communication_tasks" ADD CONSTRAINT "communication_tasks_assigned_to_id_fkey" FOREIGN KEY (assigned_to_id) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."csrf_tokens" ADD CONSTRAINT "csrf_tokens_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."finance_attachments" ADD CONSTRAINT "finance_attachments_finance_id_fkey" FOREIGN KEY (finance_id) REFERENCES finances(id) ON DELETE CASCADE;
ALTER TABLE public."finance_attachments" ADD CONSTRAINT "finance_attachments_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."finance_report_cache" ADD CONSTRAINT "finance_report_cache_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id);
ALTER TABLE public."finances" ADD CONSTRAINT "finances_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."finances" ADD CONSTRAINT "finances_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."finances" ADD CONSTRAINT "finances_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE public."finances" ADD CONSTRAINT "finances_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE public."finances" ADD CONSTRAINT "finances_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."finances" ADD CONSTRAINT "finances_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE SET NULL;
ALTER TABLE public."footer_content" ADD CONSTRAINT "footer_content_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id);
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_from_user_id_fkey" FOREIGN KEY (from_user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_reply_to_id_fkey" FOREIGN KEY (reply_to_id) REFERENCES internal_messages(id) ON DELETE SET NULL;
ALTER TABLE public."internal_messages" ADD CONSTRAINT "internal_messages_to_user_id_fkey" FOREIGN KEY (to_user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."linktree_analytics" ADD CONSTRAINT "linktree_analytics_link_id_fkey" FOREIGN KEY (link_id) REFERENCES linktree_links(id) ON DELETE CASCADE;
ALTER TABLE public."linktree_analytics" ADD CONSTRAINT "linktree_analytics_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES linktree_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."linktree_links" ADD CONSTRAINT "linktree_links_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES linktree_profiles(id) ON DELETE CASCADE;
ALTER TABLE public."media_files" ADD CONSTRAINT "media_files_event_id_fkey" FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE public."media_files" ADD CONSTRAINT "media_files_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES media_folders(id) ON DELETE SET NULL;
ALTER TABLE public."media_files" ADD CONSTRAINT "media_files_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."media_folders" ADD CONSTRAINT "media_folders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."media_folders" ADD CONSTRAINT "media_folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES media_folders(id) ON DELETE CASCADE;
ALTER TABLE public."media_usage" ADD CONSTRAINT "media_usage_file_id_fkey" FOREIGN KEY (file_id) REFERENCES media_files(id) ON DELETE CASCADE;
ALTER TABLE public."navigation_items" ADD CONSTRAINT "navigation_items_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES navigation_items(id);
ALTER TABLE public."navigation_items" ADD CONSTRAINT "navigation_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id);
ALTER TABLE public."newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."page_content" ADD CONSTRAINT "page_content_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id);
ALTER TABLE public."project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."project_stars" ADD CONSTRAINT "project_stars_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public."security_alerts" ADD CONSTRAINT "security_alerts_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES admin_users(id);
ALTER TABLE public."security_events" ADD CONSTRAINT "security_events_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."site_settings" ADD CONSTRAINT "site_settings_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id);
ALTER TABLE public."social_links" ADD CONSTRAINT "social_links_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id);
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY (task_id) REFERENCES communication_tasks(id) ON DELETE CASCADE;
ALTER TABLE public."task_comments" ADD CONSTRAINT "task_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."team_activity_log" ADD CONSTRAINT "team_activity_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."team_activity_log" ADD CONSTRAINT "team_activity_log_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."team_activity_log" ADD CONSTRAINT "team_activity_log_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_announcements" ADD CONSTRAINT "team_announcements_author_id_fkey" FOREIGN KEY (author_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."team_announcements" ADD CONSTRAINT "team_announcements_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_invites" ADD CONSTRAINT "team_invites_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."team_invites" ADD CONSTRAINT "team_invites_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_members" ADD CONSTRAINT "team_members_member_id_fkey" FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE public."team_memberships" ADD CONSTRAINT "team_memberships_added_by_fkey" FOREIGN KEY (added_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."team_memberships" ADD CONSTRAINT "team_memberships_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."team_memberships" ADD CONSTRAINT "team_memberships_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_member_transfers" ADD CONSTRAINT "team_member_transfers_from_team_id_fkey" FOREIGN KEY (from_team_id) REFERENCES admin_teams(id);
ALTER TABLE public."team_member_transfers" ADD CONSTRAINT "team_member_transfers_to_team_id_fkey" FOREIGN KEY (to_team_id) REFERENCES admin_teams(id);
ALTER TABLE public."team_member_transfers" ADD CONSTRAINT "team_member_transfers_transferred_by_fkey" FOREIGN KEY (transferred_by) REFERENCES admin_users(id);
ALTER TABLE public."team_messages" ADD CONSTRAINT "team_messages_reply_to_id_fkey" FOREIGN KEY (reply_to_id) REFERENCES team_messages(id) ON DELETE SET NULL;
ALTER TABLE public."team_messages" ADD CONSTRAINT "team_messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES admin_users(id) ON DELETE CASCADE;
ALTER TABLE public."team_messages" ADD CONSTRAINT "team_messages_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_page_access" ADD CONSTRAINT "team_page_access_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_permissions" ADD CONSTRAINT "team_permissions_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."team_statistics" ADD CONSTRAINT "team_statistics_team_id_fkey" FOREIGN KEY (team_id) REFERENCES admin_teams(id) ON DELETE CASCADE;
ALTER TABLE public."whiteboards" ADD CONSTRAINT "whiteboards_created_by_fkey" FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL;
ALTER TABLE public."whiteboards" ADD CONSTRAINT "whiteboards_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL;
CREATE INDEX idx_admin_actions_action ON public.admin_actions USING btree (action);
CREATE INDEX idx_admin_actions_admin_id ON public.admin_actions USING btree (admin_id);
CREATE INDEX idx_admin_actions_created_at ON public.admin_actions USING btree (created_at);
CREATE INDEX idx_admin_actions_ip_address ON public.admin_actions USING btree (ip_address);
CREATE INDEX idx_admin_actions_target_id ON public.admin_actions USING btree (target_id);
CREATE INDEX idx_admin_actions_target_type ON public.admin_actions USING btree (target_type);
CREATE INDEX idx_admin_sessions_active ON public.admin_sessions USING btree (is_active);
CREATE INDEX idx_admin_sessions_admin_id ON public.admin_sessions USING btree (admin_id);
CREATE INDEX idx_admin_sessions_expires ON public.admin_sessions USING btree (expires_at);
CREATE INDEX idx_admin_sessions_token ON public.admin_sessions USING btree (session_token);
CREATE INDEX idx_admin_teams_active ON public.admin_teams USING btree (is_active);
CREATE INDEX idx_admin_teams_slug ON public.admin_teams USING btree (slug);
CREATE INDEX idx_admin_teams_team_lead ON public.admin_teams USING btree (team_lead_id);
CREATE INDEX idx_admin_users_email ON public.admin_users USING btree (email);
CREATE INDEX idx_admin_users_is_active ON public.admin_users USING btree (is_active);
CREATE INDEX idx_admin_users_role ON public.admin_users USING btree (role);
CREATE INDEX idx_announcement_reads_announcement_id ON public.announcement_reads USING btree (announcement_id);
CREATE INDEX idx_announcement_reads_user_id ON public.announcement_reads USING btree (user_id);
CREATE INDEX idx_announcements_author_id ON public.announcements USING btree (author_id);
CREATE INDEX idx_announcements_created_at ON public.announcements USING btree (created_at DESC);
CREATE INDEX idx_announcements_pinned ON public.announcements USING btree (is_pinned);
CREATE INDEX idx_announcements_priority ON public.announcements USING btree (priority);
CREATE INDEX idx_blog_categories_slug ON public.blog_categories USING btree (slug);
CREATE INDEX idx_blog_comments_approved ON public.blog_comments USING btree (is_approved);
CREATE INDEX idx_blog_comments_created_at ON public.blog_comments USING btree (created_at DESC);
CREATE INDEX idx_blog_comments_parent ON public.blog_comments USING btree (parent_comment_id);
CREATE INDEX idx_blog_comments_post_id ON public.blog_comments USING btree (post_id);
CREATE INDEX idx_blog_likes_created_at ON public.blog_likes USING btree (created_at);
CREATE INDEX idx_blog_likes_post_id ON public.blog_likes USING btree (post_id);
CREATE INDEX idx_blog_likes_user_identifier ON public.blog_likes USING btree (user_identifier);
CREATE INDEX idx_blog_posts_approval_status ON public.blog_posts USING btree (approval_status);
CREATE INDEX idx_blog_posts_category ON public.blog_posts USING btree (category_id);
CREATE INDEX idx_blog_posts_featured ON public.blog_posts USING btree (is_featured);
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts USING btree (published_at);
CREATE INDEX idx_blog_posts_requires_approval ON public.blog_posts USING btree (requires_approval);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts USING btree (slug);
CREATE INDEX idx_blog_posts_status ON public.blog_posts USING btree (status);
CREATE INDEX idx_blog_submission_comments_admin_id ON public.blog_submission_comments USING btree (admin_id);
CREATE INDEX idx_blog_submission_comments_created_at ON public.blog_submission_comments USING btree (created_at DESC);
CREATE INDEX idx_blog_submission_comments_submission_id ON public.blog_submission_comments USING btree (submission_id);
CREATE INDEX idx_blog_submissions_created_at ON public.blog_submissions USING btree (created_at DESC);
CREATE INDEX idx_blog_submissions_email ON public.blog_submissions USING btree (submitter_email);
CREATE INDEX idx_blog_submissions_status ON public.blog_submissions USING btree (status);
CREATE INDEX idx_budget_allocations_team ON public.budget_allocations USING btree (team_id);
CREATE INDEX idx_budget_allocations_year ON public.budget_allocations USING btree (fiscal_year);
CREATE INDEX idx_channel_messages_channel ON public.channel_messages USING btree (channel_id);
CREATE INDEX idx_channel_messages_created ON public.channel_messages USING btree (created_at DESC);
CREATE INDEX idx_channel_messages_pinned ON public.channel_messages USING btree (is_pinned) WHERE (is_pinned = true);
CREATE INDEX idx_channel_messages_sender ON public.channel_messages USING btree (sender_id);
CREATE INDEX idx_channels_archived ON public.channels USING btree (is_archived);
CREATE INDEX idx_tasks_assigned_by ON public.communication_tasks USING btree (assigned_by_id);
CREATE INDEX idx_tasks_assigned_to ON public.communication_tasks USING btree (assigned_to_id);
CREATE INDEX idx_tasks_created_at ON public.communication_tasks USING btree (created_at DESC);
CREATE INDEX idx_tasks_due_date ON public.communication_tasks USING btree (due_date);
CREATE INDEX idx_tasks_status ON public.communication_tasks USING btree (status);
CREATE INDEX idx_csrf_tokens_admin ON public.csrf_tokens USING btree (admin_id);
CREATE INDEX idx_csrf_tokens_expires ON public.csrf_tokens USING btree (expires_at);
CREATE INDEX idx_csrf_tokens_token ON public.csrf_tokens USING btree (token);
CREATE INDEX idx_events_date ON public.events USING btree (date);
CREATE INDEX idx_events_featured ON public.events USING btree (is_featured);
CREATE INDEX idx_events_level ON public.events USING btree (level);
CREATE INDEX idx_finance_attachments_finance ON public.finance_attachments USING btree (finance_id);
CREATE INDEX idx_finance_report_cache_expires ON public.finance_report_cache USING btree (expires_at);
CREATE INDEX idx_finance_report_cache_team ON public.finance_report_cache USING btree (team_id);
CREATE INDEX idx_finance_report_cache_type ON public.finance_report_cache USING btree (report_type);
CREATE INDEX idx_finances_created_by ON public.finances USING btree (created_by);
CREATE INDEX idx_finances_date ON public.finances USING btree (transaction_date);
CREATE INDEX idx_finances_status ON public.finances USING btree (status);
CREATE INDEX idx_finances_team ON public.finances USING btree (team_id);
CREATE INDEX idx_finances_type ON public.finances USING btree (transaction_type);
CREATE INDEX idx_footer_content_section ON public.footer_content USING btree (section_key);
CREATE INDEX idx_messages_created_at ON public.internal_messages USING btree (created_at DESC);
CREATE INDEX idx_messages_from_user ON public.internal_messages USING btree (from_user_id);
CREATE INDEX idx_messages_is_read ON public.internal_messages USING btree (is_read);
CREATE INDEX idx_messages_to_user ON public.internal_messages USING btree (to_user_id);
CREATE INDEX idx_linktree_analytics_clicked_at ON public.linktree_analytics USING btree (clicked_at);
CREATE INDEX idx_linktree_analytics_link_id ON public.linktree_analytics USING btree (link_id);
CREATE INDEX idx_linktree_analytics_profile_id ON public.linktree_analytics USING btree (profile_id);
CREATE INDEX idx_linktree_links_profile_id ON public.linktree_links USING btree (profile_id);
CREATE INDEX idx_linktree_links_sort_order ON public.linktree_links USING btree (profile_id, sort_order);
CREATE INDEX idx_linktree_profiles_username ON public.linktree_profiles USING btree (username);
CREATE INDEX idx_media_files_created_at ON public.media_files USING btree (created_at DESC);
CREATE INDEX idx_media_files_event ON public.media_files USING btree (event_id);
CREATE INDEX idx_media_files_file_type ON public.media_files USING btree (file_type);
CREATE INDEX idx_media_files_folder_id ON public.media_files USING btree (folder_id);
CREATE INDEX idx_media_files_is_public ON public.media_files USING btree (is_public);
CREATE INDEX idx_media_files_is_starred ON public.media_files USING btree (is_starred);
CREATE INDEX idx_media_files_public ON public.media_files USING btree (is_public) WHERE (is_public = true);
CREATE INDEX idx_media_files_tags ON public.media_files USING gin (tags);
CREATE INDEX idx_media_files_uploaded_by ON public.media_files USING btree (uploaded_by);
CREATE INDEX idx_media_folders_created_by ON public.media_folders USING btree (created_by);
CREATE INDEX idx_media_folders_parent_id ON public.media_folders USING btree (parent_id);
CREATE INDEX idx_media_folders_path ON public.media_folders USING btree (path);
CREATE INDEX idx_media_usage_file_id ON public.media_usage USING btree (file_id);
CREATE INDEX idx_media_usage_reference ON public.media_usage USING btree (reference_table, reference_id);
CREATE INDEX idx_members_category ON public.members USING btree (category);
CREATE INDEX idx_members_email ON public.members USING btree (email);
CREATE INDEX idx_members_is_active ON public.members USING btree (is_active);
CREATE INDEX idx_members_join_date ON public.members USING btree (join_date);
CREATE INDEX idx_members_last_active ON public.members USING btree (last_active);
CREATE INDEX idx_members_team_section ON public.members USING btree (team_section);
CREATE INDEX idx_navigation_items_active ON public.navigation_items USING btree (is_active);
CREATE INDEX idx_navigation_items_order ON public.navigation_items USING btree (order_index);
CREATE INDEX idx_newsletter_campaigns_created_at ON public.newsletter_campaigns USING btree (created_at);
CREATE INDEX idx_newsletter_campaigns_sent_at ON public.newsletter_campaigns USING btree (sent_at);
CREATE INDEX idx_newsletter_campaigns_status ON public.newsletter_campaigns USING btree (status);
CREATE INDEX idx_newsletter_subscribers_confirmation_token ON public.newsletter_subscribers USING btree (confirmation_token);
CREATE INDEX idx_newsletter_subscribers_confirmed_at ON public.newsletter_subscribers USING btree (confirmed_at);
CREATE INDEX idx_newsletter_subscribers_email ON public.newsletter_subscribers USING btree (email);
CREATE INDEX idx_newsletter_subscribers_is_active ON public.newsletter_subscribers USING btree (is_active);
CREATE INDEX idx_newsletter_subscribers_subscribed_at ON public.newsletter_subscribers USING btree (subscribed_at);
CREATE INDEX idx_newsletter_subscribers_unsubscribe_token ON public.newsletter_subscribers USING btree (unsubscribe_token);
CREATE INDEX idx_newsletter_attempts_blocked ON public.newsletter_subscription_attempts USING btree (blocked_until);
CREATE INDEX idx_newsletter_attempts_email ON public.newsletter_subscription_attempts USING btree (email);
CREATE INDEX idx_newsletter_templates_created_at ON public.newsletter_templates USING btree (created_at);
CREATE INDEX idx_newsletter_templates_is_active ON public.newsletter_templates USING btree (is_active);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (user_id, is_read);
CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);
CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);
CREATE INDEX idx_page_content_page_slug ON public.page_content USING btree (page_slug);
CREATE INDEX idx_page_content_section_key ON public.page_content USING btree (section_key);
CREATE INDEX idx_project_members_member_id ON public.project_members USING btree (member_id);
CREATE INDEX idx_project_members_project_id ON public.project_members USING btree (project_id);
CREATE INDEX idx_project_stars_project_id ON public.project_stars USING btree (project_id);
CREATE INDEX idx_project_stars_user_id ON public.project_stars USING btree (user_id);
CREATE INDEX idx_project_stars_user_identifier ON public.project_stars USING btree (user_identifier);
CREATE INDEX idx_projects_category ON public.projects USING btree (category);
CREATE INDEX idx_projects_created_at ON public.projects USING btree (created_at);
CREATE INDEX idx_projects_featured ON public.projects USING btree (is_featured);
CREATE INDEX idx_projects_is_featured ON public.projects USING btree (is_featured);
CREATE INDEX idx_projects_status ON public.projects USING btree (status);
CREATE INDEX idx_resources_category ON public.resources USING btree (category);
CREATE INDEX idx_resources_is_active ON public.resources USING btree (is_active);
CREATE INDEX idx_resources_order ON public.resources USING btree (order_index);
CREATE INDEX idx_resources_status ON public.resources USING btree (status);
CREATE INDEX idx_resources_type ON public.resources USING btree (type);
CREATE INDEX idx_security_alerts_created ON public.security_alerts USING btree (created_at DESC);
CREATE INDEX idx_security_alerts_resolved ON public.security_alerts USING btree (is_resolved);
CREATE INDEX idx_security_alerts_severity ON public.security_alerts USING btree (severity);
CREATE INDEX idx_security_alerts_type ON public.security_alerts USING btree (alert_type);
CREATE INDEX idx_security_events_admin_event_time ON public.security_events USING btree (admin_id, event_type, created_at);
CREATE INDEX idx_security_events_admin_id ON public.security_events USING btree (admin_id);
CREATE INDEX idx_security_events_created_at ON public.security_events USING btree (created_at);
CREATE INDEX idx_security_events_event_type ON public.security_events USING btree (event_type);
CREATE INDEX idx_site_content_section ON public.site_content USING btree (section);
CREATE INDEX idx_site_settings_key ON public.site_settings USING btree (key);
CREATE INDEX idx_site_status_created_at ON public.site_status USING btree (created_at DESC);
CREATE INDEX idx_social_links_active ON public.social_links USING btree (is_active);
CREATE INDEX idx_social_links_order ON public.social_links USING btree (order_index);
CREATE INDEX idx_sponsor_impact_stats_active ON public.sponsor_impact_stats USING btree (is_active);
CREATE INDEX idx_sponsor_impact_stats_order ON public.sponsor_impact_stats USING btree (order_index);
CREATE INDEX idx_sponsors_order ON public.sponsors USING btree (order_index);
CREATE INDEX idx_sponsors_tier ON public.sponsors USING btree (tier);
CREATE INDEX idx_sponsorship_tiers_active ON public.sponsorship_tiers USING btree (is_active);
CREATE INDEX idx_sponsorship_tiers_order ON public.sponsorship_tiers USING btree (order_index);
CREATE INDEX idx_task_comments_task_id ON public.task_comments USING btree (task_id);
CREATE INDEX idx_task_comments_user_id ON public.task_comments USING btree (user_id);
CREATE INDEX idx_team_activity_actor ON public.team_activity_log USING btree (actor_id);
CREATE INDEX idx_team_activity_created ON public.team_activity_log USING btree (created_at DESC);
CREATE INDEX idx_team_activity_team ON public.team_activity_log USING btree (team_id);
CREATE INDEX idx_team_announcements_active ON public.team_announcements USING btree (is_active);
CREATE INDEX idx_team_announcements_author ON public.team_announcements USING btree (author_id);
CREATE INDEX idx_team_announcements_published ON public.team_announcements USING btree (is_published);
CREATE INDEX idx_team_announcements_scheduled ON public.team_announcements USING btree (scheduled_for) WHERE (scheduled_for IS NOT NULL);
CREATE INDEX idx_team_announcements_team ON public.team_announcements USING btree (team_id);
CREATE INDEX idx_team_invites_email ON public.team_invites USING btree (email);
CREATE INDEX idx_team_invites_status ON public.team_invites USING btree (status);
CREATE INDEX idx_team_invites_team ON public.team_invites USING btree (team_id);
CREATE INDEX idx_team_invites_token ON public.team_invites USING btree (token);
CREATE INDEX idx_team_transfers_from_team ON public.team_member_transfers USING btree (from_team_id);
CREATE INDEX idx_team_transfers_membership ON public.team_member_transfers USING btree (membership_id);
CREATE INDEX idx_team_transfers_to_team ON public.team_member_transfers USING btree (to_team_id);
CREATE INDEX idx_team_members_active ON public.team_members USING btree (is_active);
CREATE INDEX idx_team_members_email ON public.team_members USING btree (email);
CREATE INDEX idx_team_members_member_id ON public.team_members USING btree (member_id);
CREATE INDEX idx_team_members_order ON public.team_members USING btree (order_index);
CREATE INDEX idx_team_members_team_section ON public.team_members USING btree (team_section);
CREATE INDEX idx_team_memberships_active ON public.team_memberships USING btree (is_active);
CREATE INDEX idx_team_memberships_team ON public.team_memberships USING btree (team_id);
CREATE INDEX idx_team_memberships_user ON public.team_memberships USING btree (admin_user_id);
CREATE INDEX idx_team_messages_created ON public.team_messages USING btree (created_at DESC);
CREATE INDEX idx_team_messages_pinned ON public.team_messages USING btree (is_pinned) WHERE (is_pinned = true);
CREATE INDEX idx_team_messages_sender ON public.team_messages USING btree (sender_id);
CREATE INDEX idx_team_messages_team ON public.team_messages USING btree (team_id);
CREATE INDEX idx_team_page_access_path ON public.team_page_access USING btree (page_path);
CREATE INDEX idx_team_page_access_team ON public.team_page_access USING btree (team_id);
CREATE INDEX idx_team_permissions_resource ON public.team_permissions USING btree (resource_type);
CREATE INDEX idx_team_permissions_team ON public.team_permissions USING btree (team_id);
CREATE INDEX idx_team_statistics_date ON public.team_statistics USING btree (stat_date);
CREATE INDEX idx_team_statistics_team ON public.team_statistics USING btree (team_id);
CREATE INDEX idx_team_statistics_type ON public.team_statistics USING btree (stat_type);
CREATE INDEX idx_whiteboards_updated ON public.whiteboards USING btree (updated_at DESC);
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
COMMIT;
