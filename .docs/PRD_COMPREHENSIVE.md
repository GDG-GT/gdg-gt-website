# Product Requirements Document (PRD)
## GDG@GT Website - Complete Migration & Enhancement

**Project:** GDG@GT Website Redesign & Migration  
**Version:** 1.0  
**Date:** October 16, 2026  
**Status:** Pre-Development  
**Author:** AI Assistant + User  

---

## Executive Summary

Migration of GDG Penn State website codebase to GDG Georgia Tech with complete UI redesign using warm peach/coral aesthetic, preservation of ALL admin functionality (26 pages, 46 services), modernization with 2026 web standards, and addition of PWA features.

**Key Goals:**
1. Modern, playful UI (Image 2 design - warm gradient aesthetic)
2. Keep ALL admin features (finances, linktree, team tools, whiteboards, channels)
3. Remove blog/projects from public UI (keep databases)
4. Secret admin access (no login button - via newsletter field secret code)
5. Add 2026-era features (PWA, push notifications, enhanced performance)
6. Improve accessibility & performance (Lighthouse >90)

---

## 1. Project Context

### 1.1 Current State (GDG PSU Website)
**Codebase Analysis:**
- **Files:** 250+ files, 50,000+ lines of code
- **Framework:** React 18, TypeScript, Vite, Tailwind CSS
- **Backend:** Supabase (Postgres, Realtime, Auth, Storage)
- **Database:** 30+ tables, 79 migrations
- **Services:** 46 service files
- **Components:** 88+ React components
- **Age:** 2 years old (as of 2026)

**Current Features:**
- **Public Pages:** Home, Events, Blog, Projects, Team, Resources, Sponsors, Gallery, Contact
- **Admin Dashboard:** 26 admin pages with role-based access
- **Team System:** Hierarchical teams, permissions, messaging, whiteboards
- **Finances:** Expense tracking, budget management
- **Linktree:** Personal link pages for team members
- **Communications:** Email campaigns, newsletters, announcements
- **Media Management:** Photo/video uploads, gallery management
- **Blog System:** Multi-author blog with approval workflow, comments, reactions
- **Events:** RSVP system, attendance tracking, calendar
- **Projects:** Project showcase with stars/likes
- **Audit Log:** Complete activity tracking
- **Channels:** Organization-wide communication channels
- **Whiteboard:** Collaborative whiteboard for teams

### 1.2 Target State (GDG@GT Website)
**What Changes:**
- Complete UI redesign (warm peach/coral gradient aesthetic)
- Rebrand to Georgia Tech
- Remove Blog & Projects from public pages (databases intact)
- Add new 2026-era features (PWA, push notifications, enhanced analytics, admin panel improvements)
- Performance optimizations (Lighthouse >90 score)
- Improved accessibility (WCAG 2.1 AA minimum)

**What Stays:**
- ALL 26 admin pages
- ALL 46 services
- ALL database tables and migrations
- Team management system
- Permissions & role-based access
- Secret admin login (via newsletter field secret code, no public login button)

---

## 2. Tech Stack (2026 Standards)

### 2.1 Core Framework
- **React:** 19.x (latest with concurrent features, Suspense improvements)
- **TypeScript:** 5.x (strict mode, no `any` types)
- **Build Tool:** Vite 6.x (fast HMR, optimized bundling)
- **Routing:** React Router v7 (latest)

### 2.2 Styling & UI
- **CSS Framework:** Tailwind CSS 4.x (latest)
- **Component Library:** shadcn/ui (Radix UI primitives)
- **Animations:** Framer Motion 12.x (hardware-accelerated)
- **3D Elements:** @splinetool/react-spline 4.x
- **Icons:** Lucide React (tree-shakeable)

### 2.3 Backend & Database
- **BaaS:** Supabase (Postgres 16, Realtime, Auth, Storage)
- **Database:** Keep all 79 existing migrations + new ones
- **Auth:** Supabase Auth (email/password, magic links)
- **Storage:** Supabase Storage (images, videos, files)
- **Realtime:** Supabase Realtime (whiteboards, channels, notifications)

### 2.4 State Management
- **Server State:** TanStack Query v5 (React Query)
- **Form State:** React Hook Form + Zod validation
- **Global State:** React Context (AdminContext, ContentContext)

### 2.5 Performance & Monitoring
- **Analytics:** Google Analytics 4 (GA4)
- **Error Tracking:** Sentry (optional)
- **Performance:** Web Vitals monitoring
- **SEO:** React Helmet Async for meta tags

### 2.6 New 2026 Features
- **PWA:** Service Workers, offline support, installable
- **Push Notifications:** Web Push API for events/updates
- **Image Optimization:** WebP/AVIF formats, lazy loading
- **Edge Caching:** Aggressive caching strategies
- **Enhanced Admin Tools:** Realtime dashboards, advanced analytics, bulk actions

---

## 3. Design System

### 3.1 Color Palette
**Primary (Warm Gradient):**
```css
--peach-50: #FFF8F0;
--peach-100: #FFE5B3;    /* Light peach */
--peach-300: #FFC093;    /* Soft coral */
--peach-500: #FF9A76;    /* PRIMARY - Main brand */
--peach-600: #FF8366;    /* Coral */
--peach-700: #F88377;    /* Coral pink */
```

**Google Brand Colors:**
```css
--google-blue: #4285F4;
--google-red: #DB4437;
--google-yellow: #F4B400;
--google-green: #0F9D58;
```

**Neutrals:**
```css
--white: #FFFFFF;
--off-white: #FFF8F0;
--text-dark: #2D2D2D;
--text-gray: #666666;
```

### 3.2 Typography
**Font Family:** Inter or Google Sans  
**Loading Strategy:** `font-display: swap` for instant text visibility

**Scale:**
- Hero: 72-80px (desktop), 36-40px (mobile)
- H1: 48px (desktop), 32px (mobile)
- H2: 36px (desktop), 24px (mobile)
- Body: 16px (minimum for readability)

### 3.3 Effects
**Glassmorphism:**
```css
background: rgba(255, 255, 255, 0.15);
backdrop-filter: blur(12px);
border: 1px solid rgba(255, 255, 255, 0.18);
border-radius: 16px;
```

**Shadows:** Warm-toned, soft (not harsh black)
**Transitions:** 200-300ms ease-out

### 3.4 3D Elements
**Mix of Playful + Tech:**
- Small donut with sprinkles (~180px)
- Code brackets `</>`  (~120px)
- Geometric shapes with Google colors
- Jelly blobs (translucent, glossy)
- Confetti particles (decorative)
- Georgia Tech tower (background integration)

**Mobile:** Static images (no interactive 3D for performance)

---

## 4. Public Pages (8 pages total)

### 4.1 Homepage (`/`)
**Navigation Bar:**
- **Glassmorphic floating navbar** with frosted glass effect
- Semi-transparent background: `rgba(255, 255, 255, 0.15)`
- Backdrop filter blur: `blur(12px)`
- Subtle border: `1px solid rgba(255, 255, 255, 0.18)`
- GDG diamond logo + "GDG@GT" text on left
- Center navigation: Home, Events, Team, Gallery, Resources, Sponsors, Contact
- Warm accent colors on hover
- Slight shadow for depth
- Mobile: glassmorphic hamburger menu

**Hero Section:**
- Warm peach-to-coral gradient background
- Glassmorphic card (center-left) containing:
  - "Google Developer Groups" headline (multi-color Google, coral gradient)
  - "Building the future together at Georgia Tech" subheading
  - Two CTAs: "Upcoming Events" + "Join Us"
- 3D elements positioned around edges (donut ~180px, code brackets, jelly blob, GT tower)
- Scroll indicator at bottom

**Stats Section:**
- 4 glassmorphic cards: Members, Events, Projects, Years
- Icon + Number + Label
- Fade-in animation on scroll

**Upcoming Events:**
- 3 event cards with photos, date badges, register buttons
- "View All Events" link

**Footer:**
- Dark background with warm overlay
- 3 columns: About (logo, social), Quick Links, Newsletter signup

### 4.2 Events Page (`/events`)
**Features:**
- Filter pills (All, Upcoming, Past, Workshops, Talks)
- Event cards grid (3 columns desktop, 1 mobile)
- Each card: Image, date badge, title, date/time, location, tags, Register button
- Load more / infinite scroll
- Calendar view option (toggle)

**Integrations:**
- Supabase `events` table
- RSVP system with attendance tracking
- Email reminders (Resend API)
- iCal export for calendar apps

### 4.3 Team Page (`/team`)
**Features:**
- Role filter tabs (All, Leads, Core Team, Members)
- Team member cards with avatars, names, roles, bios, social links
- Grid layout (4 columns desktop, 2 mobile)
- Search/filter by name
- Stagger fade-in animation

**Data Source:** `team_members` table

### 4.4 Gallery Page (`/gallery`)
**Features:**
- Masonry photo grid (Pinterest-style)
- Filter by event
- Lightbox viewer with navigation
- Lazy loading (IntersectionObserver)
- WebP/AVIF image formats
- Infinite scroll

**Storage:** Supabase Storage (`gallery` bucket)

### 4.5 Resources Page (`/resources`)
**Features:**
- Category tabs (Learning Paths, Tools, Documentation, Templates)
- Resource cards with icons, titles, descriptions, links
- Search functionality
- External links to docs, guides, tools

**Data Source:** `resources` table

### 4.6 Sponsors Page (`/sponsors`)
**Features:**
- Sponsor tiers (Platinum, Gold, Silver, Bronze)
- Company logos in glassmorphic cards
- Grayscale → Color on hover
- Links to sponsor websites
- "Become a Sponsor" CTA

**Data Source:** `sponsors` table

### 4.7 Contact Page (`/contact`)
**Features:**
- Contact form (Name, Email, Subject, Message)
- Form validation (Zod + React Hook Form)
- Supabase integration (stores in `messages` table)
- Email notification to admins (Resend API)
- Success confetti animation
- Social links (Discord, Instagram, LinkedIn, Twitter, GitHub)
- Optional embedded map (Google Maps)

### 4.8 About Page (`/about`) (Optional)
**Features:**
- Mission statement
- History timeline
- Values section
- Team stats

---

## 5. Admin Panel (26 pages - ALL PRESERVED)

### 5.1 Access & Authentication
**SECRET CODE System (Like GDG PSU):**
- **No public login button**
- **No obvious `/admin` route**
- **Secret Access Method:**
  1. User goes to homepage footer
  2. Newsletter signup field
  3. Instead of email, enter **secret code** (e.g., `gdg-admin-gt-2026`)
  4. Modal pops up with admin login form
  5. Enter email + password (Supabase Auth)
  6. Redirected to `/admin` dashboard

**Secret Code Management:**
- Stored in `page_content` table (encrypted)
- Only Super Admins can change secret code
- Changed regularly for security
- Admin settings page has secret code update UI

**Role-Based Access (4 roles):**
  - **Super Admin:** Full access, can change secret code
  - **Admin:** Most pages (except user management)
  - **Team Member:** Team-specific pages
  - **Blog Editor:** Blog pages only

**Fallback:**
- `/admin` route still exists but requires authentication
- Typing `/admin` directly → redirect to login modal if not logged in
- Once authenticated, `/admin` works normally

### 5.2 Dashboard Pages

#### Core Dashboard
1. **Dashboard (`/admin`)** - Stats overview, recent activity, quick actions
2. **Profile (`/admin/profile`)** - User profile, password change
3. **Guide (`/admin/guide`)** - Admin documentation

#### Content Management
4. **Events (`/admin/events`)** - Create, edit, delete events, RSVPs
5. **Team (`/admin/team`)** - Manage team members, roles
6. **Members (`/admin/members`)** - Community member management
7. **Resources (`/admin/resources`)** - Add/edit learning resources
8. **Sponsors (`/admin/sponsors`)** - Manage sponsor relationships
9. **Gallery (`/admin/gallery`)** - Upload/organize photos
10. **Media (`/admin/media`)** - File uploads, media library

#### Blog System (Hidden from Public)
11. **Blog (`/admin/blog`)** - Manage blog posts, comments, submissions
12. **Blog Editor Dashboard (`/admin/blog-editor`)** - Simplified editor view
13. **Blog Media (`/admin/blog-media`)** - Blog-specific media uploads

#### Projects System (Hidden from Public)
14. **Projects (`/admin/projects`)** - Manage project showcase

#### Communications
15. **Newsletter (`/admin/newsletter`)** - Email campaigns, subscribers
16. **Communications (`/admin/communications`)** - Announcements, messages
17. **Channels (`/admin/channels`)** - Org-wide communication channels

#### Team Collaboration
18. **Teams (`/admin/teams`)** - Team hierarchy, permissions
19. **Team Dashboard (`/admin/team/:teamId`)** - Individual team workspaces
20. **Whiteboard (`/admin/whiteboard`)** - Collaborative whiteboard
21. **Linktree (`/admin/linktree`)** - Personal link pages

#### Finance & Operations
22. **Finances (`/admin/finances`)** - Budget tracking, expenses, reports
23. **Audit Log (`/admin/audit-log`)** - Activity history, security logs

#### System & Settings
24. **Users (`/admin/users`)** - Admin user management (Super Admin only)
25. **Site Status (`/admin/site-status`)** - Maintenance mode, status pages
26. **Invite Management (`/admin/invite/:token`)** - Accept team invites

### 5.3 Admin Theme
**Design:**
- Dark sidebar (#1F1F1F) with warm gradient overlay
- Glassmorphic elements matching public site
- Coral gradient for primary actions
- Warm-toned charts and visualizations
- Dark mode support (toggle)

**Navigation:**
- Collapsible sidebar with icons + labels
- Active page indicator (coral left border)
- Grouped sections:
  - Dashboard
  - Content Management
  - Communications
  - Team Collaboration
  - Finance & Operations
  - System & Settings

---

## 6. Database Schema (Preserved + New)

### 6.1 Complete Database Schema (From 79 Migrations - ALL PRESERVED)

#### Core Authentication & Users
**`admin_users`** - Admin authentication and roles
- `id` (UUID, PK), `email` (TEXT, UNIQUE), `password_hash` (TEXT)
- `role` (TEXT: 'super_admin' | 'admin' | 'team_member' | 'blog_editor')
- `first_name`, `last_name`, `profile_picture_url`
- `is_active` (BOOLEAN), `last_login_at` (TIMESTAMPTZ)
- `created_at`, `updated_at`, `created_by` (UUID FK)

**`session_tokens`** - User session management
- `id` (UUID, PK), `user_id` (UUID FK → admin_users)
- `token` (TEXT, UNIQUE), `expires_at` (TIMESTAMPTZ)
- `created_at`

#### Events System
**`events`** - Event listings
- `id` (UUID, PK), `title` (TEXT), `description` (TEXT)
- `event_date` (TIMESTAMPTZ), `end_date` (TIMESTAMPTZ)
- `location` (TEXT), `event_type` (TEXT), `max_attendees` (INTEGER)
- `registration_deadline` (TIMESTAMPTZ), `is_published` (BOOLEAN)
- `featured_image_url` (TEXT), `tags` (TEXT[])
- `created_by` (UUID FK), `created_at`, `updated_at`

**`event_registrations`** - RSVP tracking
- `id` (UUID, PK), `event_id` (UUID FK → events)
- `user_email` (TEXT), `user_name` (TEXT)
- `attended` (BOOLEAN), `registered_at` (TIMESTAMPTZ)

#### Team & Members
**`team_members`** - Official GDG team roster
- `id` (UUID, PK), `user_id` (UUID FK → admin_users, nullable)
- `name` (TEXT), `role` (TEXT), `bio` (TEXT)
- `profile_picture_url` (TEXT), `linkedin_url`, `github_url`, `twitter_url`
- `email`, `is_active` (BOOLEAN), `join_date` (DATE)
- `display_order` (INTEGER), `created_at`, `updated_at`

**`members`** - Community member directory
- `id` (UUID, PK), `email` (TEXT, UNIQUE), `name` (TEXT)
- `graduation_year` (INTEGER), `major` (TEXT)
- `interests` (TEXT[]), `skills` (TEXT[])
- `joined_at` (TIMESTAMPTZ), `is_active` (BOOLEAN)

#### Blog System (Hidden from Public, Kept for Future)
**`blog_posts`** - Blog content
- `id` (UUID, PK), `title` (TEXT), `slug` (TEXT, UNIQUE)
- `content` (TEXT), `excerpt` (TEXT), `featured_image_url` (TEXT)
- `author_id` (UUID FK → admin_users)
- `status` (TEXT: 'draft' | 'pending' | 'published' | 'archived')
- `tags` (TEXT[]), `category` (TEXT)
- `published_at` (TIMESTAMPTZ), `views` (INTEGER DEFAULT 0)
- `created_at`, `updated_at`

**`blog_comments`** - Comment system
- `id` (UUID, PK), `post_id` (UUID FK → blog_posts)
- `author_name` (TEXT), `author_email` (TEXT), `content` (TEXT)
- `is_approved` (BOOLEAN DEFAULT false)
- `parent_comment_id` (UUID FK → blog_comments, nullable, for threading)
- `created_at`

**`blog_reactions`** - Post reactions (likes, hearts, etc.)
- `id` (UUID, PK), `post_id` (UUID FK → blog_posts)
- `user_id` (UUID FK → admin_users, nullable)
- `reaction_type` (TEXT: 'like' | 'heart' | 'insightful')
- `created_at`

**`blog_submissions`** - User-submitted blog posts
- `id` (UUID, PK), `title` (TEXT), `content` (TEXT)
- `author_name` (TEXT), `author_email` (TEXT)
- `status` (TEXT: 'pending' | 'approved' | 'rejected')
- `submitted_at` (TIMESTAMPTZ), `reviewed_by` (UUID FK → admin_users)

#### Projects System (Hidden from Public, Kept for Future)
**`projects`** - Project showcase
- `id` (UUID, PK), `title` (TEXT), `slug` (TEXT, UNIQUE)
- `description` (TEXT), `long_description` (TEXT)
- `thumbnail_url` (TEXT), `github_url`, `demo_url`
- `tech_stack` (TEXT[]), `status` (TEXT: 'active' | 'completed' | 'archived')
- `is_featured` (BOOLEAN), `stars_count` (INTEGER DEFAULT 0)
- `created_by` (UUID FK → admin_users), `created_at`, `updated_at`

**`project_stars`** - Project likes/stars
- `id` (UUID, PK), `project_id` (UUID FK → projects)
- `user_id` (UUID FK → admin_users, nullable)
- `user_email` (TEXT), `created_at`

**`project_members`** - Project team members
- `id` (UUID, PK), `project_id` (UUID FK → projects)
- `user_id` (UUID FK → admin_users)
- `role` (TEXT: 'owner' | 'contributor')

#### Resources
**`resources`** - Learning resources
- `id` (UUID, PK), `title` (TEXT), `description` (TEXT)
- `url` (TEXT), `resource_type` (TEXT: 'article' | 'video' | 'course' | 'tool')
- `category` (TEXT), `tags` (TEXT[])
- `thumbnail_url` (TEXT), `is_featured` (BOOLEAN)
- `created_at`, `updated_at`

#### Sponsors
**`sponsors`** - Sponsorship management
- `id` (UUID, PK), `name` (TEXT), `logo_url` (TEXT)
- `website_url` (TEXT), `tier` (TEXT: 'platinum' | 'gold' | 'silver' | 'bronze')
- `description` (TEXT), `is_active` (BOOLEAN)
- `start_date` (DATE), `end_date` (DATE)
- `display_order` (INTEGER), `created_at`, `updated_at`

#### Media & Gallery
**`gallery_photos`** - Photo gallery
- `id` (UUID, PK), `title` (TEXT), `description` (TEXT)
- `image_url` (TEXT), `thumbnail_url` (TEXT)
- `event_id` (UUID FK → events, nullable)
- `uploaded_by` (UUID FK → admin_users)
- `display_order` (INTEGER), `is_featured` (BOOLEAN)
- `uploaded_at`

**`media_files`** - General media library
- `id` (UUID, PK), `filename` (TEXT), `file_url` (TEXT)
- `file_type` (TEXT: 'image' | 'video' | 'document')
- `file_size` (BIGINT), `mime_type` (TEXT)
- `uploaded_by` (UUID FK → admin_users)
- `uploaded_at`

#### Communications
**`newsletter_subscribers`** - Email list
- `id` (UUID, PK), `email` (TEXT, UNIQUE)
- `name` (TEXT), `is_active` (BOOLEAN DEFAULT true)
- `subscribed_at` (TIMESTAMPTZ), `unsubscribed_at` (TIMESTAMPTZ)
- `source` (TEXT: 'website' | 'event' | 'import')

**`newsletter_campaigns`** - Email campaigns
- `id` (UUID, PK), `name` (TEXT), `subject` (TEXT)
- `content` (TEXT), `status` (TEXT: 'draft' | 'scheduled' | 'sent')
- `scheduled_at` (TIMESTAMPTZ), `sent_at` (TIMESTAMPTZ)
- `recipient_count` (INTEGER), `open_rate` (DECIMAL), `click_rate` (DECIMAL)
- `created_by` (UUID FK → admin_users), `created_at`

**`communications`** - General messages/announcements
- `id` (UUID, PK), `title` (TEXT), `message` (TEXT)
- `type` (TEXT: 'announcement' | 'alert' | 'info')
- `target_audience` (TEXT: 'all' | 'members' | 'admins')
- `is_published` (BOOLEAN), `published_at` (TIMESTAMPTZ)
- `created_by` (UUID FK → admin_users), `created_at`

**`announcements`** - Site-wide announcements
- `id` (UUID, PK), `title` (TEXT), `content` (TEXT)
- `priority` (TEXT: 'low' | 'medium' | 'high')
- `is_active` (BOOLEAN), `start_date` (TIMESTAMPTZ), `end_date` (TIMESTAMPTZ)
- `created_by` (UUID FK → admin_users), `created_at`

#### Hierarchical Teams System (Advanced Collaboration)
**`admin_teams`** - Team hierarchy
- `id` (UUID, PK), `name` (TEXT), `slug` (TEXT, UNIQUE)
- `description` (TEXT), `team_type` (TEXT: 'core' | 'project' | 'committee')
- `parent_team_id` (UUID FK → admin_teams, nullable, for nested teams)
- `settings` (JSONB: custom team configuration)
- `is_active` (BOOLEAN), `created_at`, `updated_at`

**`team_memberships`** - User-to-team assignments
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `user_id` (UUID FK → admin_users)
- `role` (TEXT: 'leader' | 'member' | 'viewer')
- `joined_at` (TIMESTAMPTZ)

**`team_permissions`** - Granular permissions
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `permission_key` (TEXT: e.g., 'can_edit_events', 'can_manage_budget')
- `is_granted` (BOOLEAN)

**`team_messages`** - Team chat/messaging
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `user_id` (UUID FK → admin_users)
- `content` (TEXT), `attachments` (JSONB)
- `is_pinned` (BOOLEAN), `created_at`

**`team_announcements`** - Team-specific announcements
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `title` (TEXT), `content` (TEXT)
- `posted_by` (UUID FK → admin_users)
- `is_pinned` (BOOLEAN), `created_at`

**`team_activity_log`** - Team activity tracking
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `user_id` (UUID FK → admin_users)
- `action_type` (TEXT: 'joined' | 'left' | 'posted' | 'edited')
- `metadata` (JSONB), `created_at`

**`team_invites`** - Team invitation system
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `email` (TEXT), `token` (TEXT, UNIQUE)
- `invited_by` (UUID FK → admin_users)
- `status` (TEXT: 'pending' | 'accepted' | 'expired')
- `expires_at` (TIMESTAMPTZ), `created_at`

**`team_statistics`** - Team metrics
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `metric_name` (TEXT: 'active_members' | 'tasks_completed' | 'messages_sent')
- `value` (DECIMAL), `period` (TEXT: 'daily' | 'weekly' | 'monthly')
- `recorded_at` (TIMESTAMPTZ)

**`team_page_access`** - Admin page access control per team
- `id` (UUID, PK), `team_id` (UUID FK → admin_teams)
- `page_route` (TEXT: e.g., '/admin/events')
- `can_view` (BOOLEAN), `can_edit` (BOOLEAN)

#### Finance System
**`finances`** - Expense tracking
- `id` (UUID, PK), `title` (TEXT), `description` (TEXT)
- `amount` (DECIMAL), `category` (TEXT: 'event' | 'equipment' | 'marketing' | 'misc')
- `transaction_date` (DATE), `status` (TEXT: 'pending' | 'approved' | 'rejected')
- `receipt_url` (TEXT), `notes` (TEXT)
- `submitted_by` (UUID FK → admin_users)
- `approved_by` (UUID FK → admin_users, nullable)
- `created_at`, `updated_at`

**`finance_attachments`** - Receipt/document uploads
- `id` (UUID, PK), `finance_id` (UUID FK → finances)
- `file_url` (TEXT), `filename` (TEXT), `file_type` (TEXT)
- `uploaded_at`

**`budget_allocations`** - Budget planning
- `id` (UUID, PK), `category` (TEXT), `allocated_amount` (DECIMAL)
- `spent_amount` (DECIMAL DEFAULT 0)
- `fiscal_year` (INTEGER), `quarter` (INTEGER)
- `notes` (TEXT), `created_at`, `updated_at`

#### Linktree System
**`linktree_users`** - Personal link pages
- `id` (UUID, PK), `user_id` (UUID FK → admin_users)
- `username` (TEXT, UNIQUE), `display_name` (TEXT)
- `bio` (TEXT), `profile_picture_url` (TEXT)
- `theme` (JSONB: colors, fonts, layout settings)
- `is_active` (BOOLEAN), `view_count` (INTEGER DEFAULT 0)
- `created_at`, `updated_at`

**`linktree_links`** - Individual links on linktree
- `id` (UUID, PK), `linktree_user_id` (UUID FK → linktree_users)
- `title` (TEXT), `url` (TEXT), `icon` (TEXT)
- `display_order` (INTEGER), `click_count` (INTEGER DEFAULT 0)
- `is_active` (BOOLEAN), `created_at`

#### Channels System (Org-Wide Communication, NOT Team-Specific)
**`channels`** - Organization-wide channels (Realtime-enabled)
- `id` (UUID, PK), `name` (TEXT), `slug` (TEXT, UNIQUE)
- `description` (TEXT), `type` (TEXT: 'public' | 'private' | 'announcement')
- `is_active` (BOOLEAN), `created_by` (UUID FK → admin_users)
- `created_at`, `updated_at`
- **Realtime subscriptions enabled** for live message updates

**`channel_messages`** - Channel messages (Realtime-enabled)
- `id` (UUID, PK), `channel_id` (UUID FK → channels)
- `user_id` (UUID FK → admin_users)
- `content` (TEXT), `attachments` (JSONB)
- `is_pinned` (BOOLEAN), `is_edited` (BOOLEAN)
- `created_at`, `updated_at`
- **Realtime subscriptions enabled** for instant message delivery

#### Whiteboard System (Collaborative Canvas)
**`whiteboards`** - Collaborative infinite canvas (Realtime-enabled)
- `id` (UUID, PK), `name` (TEXT), `slug` (TEXT, UNIQUE)
- `description` (TEXT)
- `team_id` (UUID FK → admin_teams, nullable)
- `document` (JSONB: complete tldraw document structure)
- `thumbnail_url` (TEXT), `is_public` (BOOLEAN)
- `created_by` (UUID FK → admin_users)
- `created_at`, `updated_at`
- **Realtime subscriptions enabled** for collaborative editing
- **Storage:** Full tldraw document stored in JSONB (shapes, assets, bindings, records)

#### System & Audit
**`audit_log`** - Complete activity tracking
- `id` (UUID, PK), `user_id` (UUID FK → admin_users)
- `action` (TEXT: 'created' | 'updated' | 'deleted')
- `resource_type` (TEXT: 'event' | 'user' | 'blog_post', etc.)
- `resource_id` (UUID), `details` (JSONB)
- `ip_address` (TEXT), `user_agent` (TEXT)
- `created_at`

**`site_status`** - Maintenance mode
- `id` (UUID, PK), `is_maintenance_mode` (BOOLEAN)
- `maintenance_message` (TEXT)
- `updated_at`, `updated_by` (UUID FK → admin_users)

#### Content Management
**`site_settings`** - Global site configuration
- `id` (UUID, PK), `key` (TEXT, UNIQUE)
- `value` (JSONB), `updated_at`

**`page_content`** - Dynamic page content (including secret admin codes)
- `id` (UUID, PK), `page_slug` (TEXT, UNIQUE)
- `content` (JSONB), `meta_title` (TEXT), `meta_description` (TEXT)
- `updated_at`, `updated_by` (UUID FK → admin_users)

**`navigation_items`** - Dynamic navigation
- `id` (UUID, PK), `label` (TEXT), `url` (TEXT)
- `display_order` (INTEGER), `parent_id` (UUID FK → navigation_items, nullable)
- `is_active` (BOOLEAN)

**`social_links`** - Social media links
- `id` (UUID, PK), `platform` (TEXT), `url` (TEXT)
- `icon` (TEXT), `display_order` (INTEGER)

**`footer_content`** - Footer sections
- `id` (UUID, PK), `column` (INTEGER), `title` (TEXT)
- `content` (JSONB), `display_order` (INTEGER)

### 6.2 New Tables (2026 Features - PWA Only)

**PWA Push Notifications:**
```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);
```

**PWA Offline Queue:**
```sql
CREATE TABLE offline_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ
);

CREATE INDEX idx_offline_queue_user_synced ON offline_queue(user_id, synced);
```

**Enhanced Analytics:**
```sql
CREATE TABLE page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page_path TEXT NOT NULL,
  user_agent TEXT,
  referrer TEXT,
  session_id TEXT,
  user_id UUID REFERENCES admin_users(id),
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_page_views_timestamp ON page_views(timestamp DESC);
CREATE INDEX idx_page_views_page_path ON page_views(page_path);

CREATE TABLE feature_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_name TEXT NOT NULL,
  user_id UUID REFERENCES admin_users(id),
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_usage_feature ON feature_usage(feature_name);
CREATE INDEX idx_feature_usage_user ON feature_usage(user_id);
```

---

## 7. New Features (2026 Enhancements - PWA & Performance Focus)

### 7.1 Progressive Web App (PWA)
**Features:**
- **Installable:** Add to home screen (iOS, Android, Desktop)
- **Offline Support:** Service Worker caches static assets
- **Background Sync:** Queue actions when offline, sync when online
- **App-like Experience:** Full-screen, no browser chrome

**Implementation:**
```javascript
// vite-plugin-pwa configuration
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      },
      manifest: {
        name: 'GDG@GT - Georgia Tech',
        short_name: 'GDG@GT',
        description: 'Google Developer Groups at Georgia Tech',
        theme_color: '#FF9A76',
        background_color: '#FFFFFF',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
};
```

**Offline Pages:**
- Home page (cached)
- Events list (last synced data)
- Contact form (queue submissions)
- Offline indicator UI

### 7.2 Admin Panel Enhancements (2026 Features)
**New Admin Dashboard Improvements:**

1. **Realtime Activity Dashboard:**
   - Live feed of all admin activities
   - Real-time member count, event registrations
   - Active channels/whiteboards indicator
   - Recent finance submissions
   - Supabase Realtime integration

2. **Enhanced Team Statistics:**
   - Team performance metrics dashboard
   - Message activity graphs (per team)
   - Whiteboard usage analytics
   - Member engagement scores
   - Export reports (CSV/PDF)

3. **Advanced Finance Reports:**
   - Visual budget vs. spending charts
   - Category breakdown (pie/bar charts)
   - Quarterly/yearly comparisons
   - Spending trends over time
   - Budget forecast alerts

4. **Improved Whiteboard Management:**
   - Thumbnail previews in list view
   - Version history (snapshots)
   - Export whiteboard as PNG/SVG
   - Template library (common diagrams)
   - Search whiteboard content

5. **Channel Moderation Tools:**
   - Message pinning/unpinning
   - User mute/ban controls
   - Spam detection
   - Message search
   - Export conversation history

6. **Secret Code Manager (Enhanced Security):**
   - QR code generation for secret code
   - Expiration dates for codes
   - Multiple active codes (for different teams)
   - Usage analytics (who used which code)
   - Automatic code rotation

7. **Admin Notifications Center:**
   - In-app notification badge
   - Filter by type (finance, events, teams, etc.)
   - Mark as read/unread
   - Notification preferences
   - Email digest option

8. **Bulk Actions:**
   - Bulk email to members
   - Bulk event registration
   - Bulk team invite
   - Bulk resource import (CSV)
   - Bulk photo upload with metadata

### 7.3 Push Notifications
**Use Cases:**
- New event published
- Event starting soon (1 hour before)
- Team message in channel
- Admin: New contact form submission
- Admin: Budget alert (expenses over threshold)

**Implementation:**
- Web Push API (browser notifications)
- Supabase trigger functions → send push
- Opt-in UI during onboarding
- Notification preferences in settings

### 7.4 Smart Image Optimization
**Features:**
- **Formats:** WebP with JPEG fallback, AVIF optional
- **Responsive:** `<picture>` with multiple sizes
- **Lazy Loading:** Native `loading="lazy"` + IntersectionObserver
- **Compression:** Squoosh.app or Sharp during upload
- **CDN:** Supabase Storage with edge caching

**Example:**
```jsx
<picture>
  <source srcSet="/images/event.avif" type="image/avif" />
  <source srcSet="/images/event.webp" type="image/webp" />
  <img src="/images/event.jpg" alt="Event" loading="lazy" />
</picture>
```

### 7.5 Analytics & Monitoring
**Metrics Tracked:**
- Page views, bounce rate, session duration
- Event registrations (conversion funnel)
- Form submissions
- Admin feature usage
- Error rates, performance (Core Web Vitals)

**Tools:**
- Google Analytics 4 (GA4)
- Custom analytics table in Supabase
- Real-time dashboard for admins

### 7.6 Accessibility Enhancements
**WCAG 2.1 Level AA Compliance:**
- Keyboard navigation (Tab, Enter, Esc)
- Focus indicators (visible, high contrast)
- ARIA labels on all interactive elements
- Screen reader support (semantic HTML)
- Color contrast checker (automated tests)
- `prefers-reduced-motion` support
- Alt text on all images
- Form labels properly associated

**Testing:**
- Lighthouse Accessibility audit (score >95)
- Axe DevTools automated tests
- Manual testing with screen reader (NVDA/JAWS)

### 7.7 Performance Optimization
**Targets:**
- **Lighthouse Performance:** >90
- **FCP (First Contentful Paint):** <1.5s
- **LCP (Largest Contentful Paint):** <2.5s
- **CLS (Cumulative Layout Shift):** <0.1
- **TTI (Time to Interactive):** <3.5s

**Techniques:**
- Code splitting by route (React.lazy)
- Tree-shaking (Vite automatic)
- Minification (Vite production build)
- Image optimization (WebP, lazy load)
- Font optimization (`font-display: swap`)
- CSS purging (Tailwind built-in)
- Bundle size monitoring (<300KB gzipped)
- Preconnect to external domains
- Resource hints (`<link rel="preload">`)

---

## 8. Migration Plan (What to Remove/Keep)

### 8.1 Remove from Public UI
**Blog Pages:**
- `/blog` - Blog listing page
- `/blog/:slug` - Individual post page

**Projects Pages:**
- `/projects` - Projects showcase page

**Note:** Keep ALL database tables, admin pages, services. Only remove React components for public routes.

### 8.2 Keep Everything Else
- ✅ All admin dashboard pages (26 pages)
- ✅ All database tables (30+ tables)
- ✅ All services (46 service files)
- ✅ All migrations (79 existing)
- ✅ Team system (teams, permissions, messaging)
- ✅ Finance system (expenses, budgets)
- ✅ Linktree system
- ✅ Communications (newsletters, campaigns)
- ✅ Channels & Whiteboards
- ✅ Audit log
- ✅ Media management
- ✅ Authentication & permissions

### 8.3 Rebrand Components
**Replace All Mentions:**
- "GDG PSU" → "GDG@GT"
- "Penn State" → "Georgia Tech"
- "PSU" → "GT"
- Penn State colors → Georgia Tech colors
- Penn State logo → Georgia Tech logo

**Files to Update:**
- Logo files (`/public/logo.png`, `/public/favicon.ico`)
- Footer copyright text
- Navigation branding
- Email templates
- Meta tags (title, description, OG tags)
- Manifest.json (PWA name)

---

## 9. Development Phases

### Phase 1: Setup & Foundation (Week 1)
**Tasks:**
- Clone GDG PSU codebase to gdg-gt-website ✅ (Done)
- Update branding (name, colors, logo)
- Configure Tailwind with warm palette
- Set up Google Fonts (Inter with `font-display: swap`)
- Update meta tags, manifest.json
- Test existing functionality (ensure nothing broke)

**Deliverable:** Working clone with GT branding

### Phase 2: UI Redesign - Public Pages (Week 2-3)
**Tasks:**
- Homepage hero section (glassmorphic card, 3D elements)
- Homepage stats & events sections
- Events page redesign
- Team page redesign
- Gallery page (masonry layout)
- Resources page redesign
- Sponsors page redesign
- Contact page redesign
- Footer redesign
- Navigation redesign

**Deliverable:** All public pages redesigned with warm aesthetic

### Phase 3: Admin Panel Theme (Week 3)
**Tasks:**
- Admin sidebar redesign (dark + warm overlay)
- Admin dashboard cards with warm accents
- Update all 26 admin pages with new theme
- Ensure all functionality works
- Test permissions & role-based access

**Deliverable:** Admin panel matches public site aesthetic

### Phase 4: Performance & Optimization (Week 4)
**Tasks:**
- Image optimization (WebP conversion, lazy loading)
- Code splitting & bundle optimization
- Font optimization
- Lighthouse audits (fix issues)
- Core Web Vitals monitoring
- Accessibility audit (Axe DevTools)
- Cross-browser testing

**Deliverable:** Lighthouse score >90, WCAG AA compliant

### Phase 5: PWA Implementation (Week 5)
**Tasks:**
- Install vite-plugin-pwa
- Configure service worker
- Add offline support
- Test install flow (iOS, Android, Desktop)
- Background sync for forms
- Push notification setup
- Test offline functionality

**Deliverable:** Installable PWA with offline support

### Phase 6: Admin Panel Enhancements (Week 5-6)
**Tasks:**
- Implement realtime activity dashboard
- Build enhanced team statistics page
- Create advanced finance reports with charts
- Add whiteboard management features (thumbnails, export)
- Build channel moderation tools
- Enhance secret code manager (QR codes, analytics)
- Implement admin notifications center
- Add bulk actions UI

**Deliverable:** Enhanced admin panel with 8 new features

### Phase 7: Testing & QA (Week 6)
**Tasks:**
- Manual testing (all pages, all features)
- Cross-browser testing (Chrome, Firefox, Safari, Edge)
- Mobile testing (iOS, Android)
- Accessibility testing (screen reader)
- Performance testing (Lighthouse, WebPageTest)
- Security audit (SQL injection, XSS, CSRF)
- Load testing (Supabase limits)

**Deliverable:** Bug-free, production-ready site

### Phase 8: Deployment & Launch (Week 7)
**Tasks:**
- Deploy to production (Vercel/Netlify)
- Configure custom domain (gdggt.com or gdg.gatech.edu)
- Set up SSL certificate
- Configure environment variables
- Database migration (if needed)
- DNS configuration
- Launch checklist
- Monitor errors (Sentry)
- Analytics setup (GA4)

**Deliverable:** Live website at custom domain

### Phase 9: Post-Launch (Ongoing)
**Tasks:**
- Monitor performance (Lighthouse CI)
- Fix bugs reported by users
- Add new features based on feedback
- Content updates (events, team, sponsors)
- SEO optimization
- Marketing (social media, email)

---

## 10. Success Metrics

### 10.1 Performance
- ✅ Lighthouse Performance Score: >90
- ✅ FCP: <1.5 seconds
- ✅ LCP: <2.5 seconds
- ✅ CLS: <0.1
- ✅ Bundle Size: <300KB gzipped

### 10.2 Accessibility
- ✅ Lighthouse Accessibility Score: >95
- ✅ WCAG 2.1 Level AA compliance
- ✅ Keyboard navigable
- ✅ Screen reader compatible

### 10.3 User Engagement
- Event registration rate: >30% (of visitors)
- Newsletter signup rate: >10%
- PWA install rate: >5%
- Bounce rate: <40%
- Average session duration: >2 minutes

### 10.4 Admin Efficiency
- Admin task completion time: -30% (vs old site)
- Bug reports: <5 per month
- Admin satisfaction: >8/10

---

## 11. Technical Specifications

### 11.1 Browser Support
**Target:**
- Chrome 120+ (latest)
- Firefox 120+ (latest)
- Safari 17+ (latest)
- Edge 120+ (latest)

**Mobile:**
- iOS Safari 16+
- Chrome Android 120+

**Progressive Enhancement:**
- Core functionality works in older browsers
- Advanced features (PWA, Push, Voice) degrade gracefully

### 11.2 Performance Budget
| Resource | Budget | Current (GDG PSU) | Target (GDG GT) |
|----------|--------|-------------------|-----------------|
| Total JS | <400KB | 580KB | <300KB |
| Total CSS | <100KB | 45KB | <60KB |
| Images (above fold) | <300KB | Unknown | <200KB |
| Fonts | <150KB | Unknown | <100KB |
| **Total (Initial Load)** | **<1MB** | **Unknown** | **<700KB** |

### 11.3 SEO Requirements
**Meta Tags:**
- Title (50-60 characters)
- Description (150-160 characters)
- OG tags (Open Graph for social sharing)
- Twitter Card tags
- Canonical URLs
- Structured data (JSON-LD):
  - Organization schema
  - Event schema (for events page)
  - BreadcrumbList schema

**Sitemap:**
- Generate `/sitemap.xml` with all public pages
- Submit to Google Search Console
- Update robots.txt

**Page Speed:**
- Mobile-friendly (responsive design)
- Fast loading (Lighthouse >90)
- HTTPS only (SSL certificate)

---

## 12. Security & Compliance

### 12.1 Authentication
**Admin Login:**
- Email + password (Supabase Auth)
- Magic link option (passwordless)
- Session tokens (secure, httpOnly cookies)
- CSRF protection (csrfService.ts)
- Rate limiting (max 5 attempts per 15 min)
- Password requirements (min 8 chars, complexity)

**Secret Access Method:**
- **No public login button anywhere on site**
- **Secret code in newsletter field** triggers admin login modal
- Secret code stored encrypted in database
- Only Super Admins can view/change secret code
- Secret code changed regularly (recommended: monthly)
- Example secret codes: `gdg-admin-gt-2026`, `admin-secret@example.com`

**Security Layers:**
1. **Discovery barrier:** User must know secret code exists
2. **Secret code:** Must know the current code
3. **Authentication:** Must have valid admin email + password
4. **Authorization:** Role-based access to pages (PageAccessGuard)

### 12.2 Data Protection
**Privacy:**
- GDPR compliant (EU users)
- Privacy policy page
- Cookie consent banner (if using analytics)
- Data retention policy
- User data export/deletion (GDPR right)

**Encryption:**
- HTTPS (SSL certificate)
- Database encryption at rest (Supabase default)
- Password hashing (bcrypt, Supabase handled)

### 12.3 Security Best Practices
**Input Validation:**
- Zod schemas for all forms
- SQL injection prevention (Supabase parameterized queries)
- XSS prevention (React auto-escaping + DOMPurify for rich text)
- File upload validation (type, size, malware scan)

**Rate Limiting:**
- Contact form: 5 submissions per hour per IP
- Newsletter signup: 3 per hour per IP
- API requests: Supabase built-in limits

**Monitoring:**
- Audit log for all admin actions
- Security events table (failed logins, suspicious activity)
- Alerts for critical errors (Sentry)

---

## 13. Content Strategy

### 13.1 Initial Content
**Homepage:**
- Hero: "Google Developer Groups" + GT subheading
- Stats: 500+ members, 100+ events, 50+ projects, 3 years
- Upcoming events: 3 featured events
- Footer: About, links, social, newsletter

**Events:**
- Populate with 5-10 upcoming events
- Include past events for history

**Team:**
- Add current GDG@GT team members
- Roles: President, VP, Leads, Core, Members

**Gallery:**
- Upload 20-30 photos from past events

**Resources:**
- Curated learning paths (Web Dev, Android, Cloud, AI/ML)
- Links to official Google docs
- GDG resources (Bevy, DevLibrary)

**Sponsors:**
- Current sponsor logos and tiers

### 13.2 Content Management
**Who Manages:**
- **Events:** Events team lead (admin role)
- **Team:** President/VP (super admin)
- **Gallery:** Marketing/Design team
- **Resources:** Technical lead
- **Sponsors:** Sponsorship lead

**Workflow:**
- Create content in admin panel
- Approve/publish (role-dependent)
- Schedule posts (future events)
- Archive old content (keep in database)

---

## 14. Deployment & Infrastructure

### 14.1 Hosting
**Recommended:** Vercel or Netlify  
**Why:** Free tier, auto-deployment, edge network, zero-config

**Vercel Setup:**
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Environment variables (set in dashboard):
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_GA_TRACKING_ID=xxx (Google Analytics)
VITE_WEB_PUSH_PUBLIC_KEY=xxx (for push notifications)
```

**Custom Domain:**
- `gdggt.com` or `gdg.gatech.edu`
- Configure DNS (CNAME to Vercel)
- SSL auto-provisioned

### 14.2 Database
**Supabase:**
- Keep existing Supabase project OR
- Create new project for GDG@GT
- Run all 79 migrations + new ones
- Configure RLS policies (already in place)
- Set up backups (Supabase automatic)

### 14.3 CI/CD Pipeline
**GitHub Actions:**
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npm run test
      - run: npx lighthouse-ci autorun
      - uses: vercel/action@v20
```

**Checks:**
- TypeScript compilation
- ESLint (no errors)
- Unit tests (Vitest)
- Build successful
- Lighthouse CI (performance >90)

### 14.4 Monitoring
**Tools:**
- Vercel Analytics (built-in)
- Google Analytics 4
- Sentry (error tracking)
- Supabase dashboard (database metrics)
- Uptime monitoring (UptimeRobot)

**Alerts:**
- Server errors (>10 per hour)
- Performance degradation (Lighthouse <80)
- Database connection issues
- High memory usage

---

## 15. Risks & Mitigation

### 15.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Migration breaks existing features** | High | Medium | Thorough testing, keep all code, feature flags |
| **Performance issues with 3D/animations** | Medium | Low | Mobile fallbacks (static images), lazy loading |
| **Supabase rate limits** | Medium | Low | Connection pooling, caching, upgrade plan if needed |
| **Browser incompatibility** | Low | Low | Progressive enhancement, polyfills |
| **PWA not installable** | Low | Medium | Test on multiple devices, fallback to web app |
| **Realtime features overload** | Medium | Low | Implement connection throttling, fallback to polling |

### 15.2 Timeline Risks

| Risk | Mitigation |
|------|------------|
| **Scope creep** | Stick to PRD, create backlog for future features |
| **Underestimated tasks** | Add 20% buffer to estimates, prioritize MVP |
| **Dependency delays** | Use existing libraries, avoid custom implementations |
| **Testing takes longer** | Automated tests, parallel testing |

### 15.3 User Adoption Risks

| Risk | Mitigation |
|------|------------|
| **Admins dislike new UI** | User testing before launch, feedback loop |
| **Features are confusing** | In-app guide, documentation, tooltips |
| **Slow adoption of PWA** | Educate users on benefits, in-app prompts |
| **Secret code system confusing** | Clear instructions for admins, fallback documentation |

---

## 16. Future Enhancements (Post-Launch)

### 16.1 Phase 2 Features (3-6 months)
**Re-enable Blog:**
- Public blog page with warm design
- SEO optimized blog posts
- Social sharing

**Re-enable Projects:**
- Public project showcase
- Project detail pages
- Star/like functionality

**Advanced Analytics:**
- Custom dashboards for admins
- Event attendance trends
- Member engagement metrics

### 16.2 Phase 3 Features (6-12 months)
**Mobile App:**
- React Native app (iOS/Android)
- Push notifications (native)
- Offline-first architecture

**Advanced Admin Features:**
- AI-powered event recommendations
- Automated budget forecasting
- Predictive analytics for member engagement
- Smart resource suggestions

**Community Features:**
- Member profiles (public)
- Discussion forums
- Mentorship matching

### 16.3 Nice-to-Have Features
- Integration with Bevy (GDG's official platform)
- Integration with DevLibrary (Google's developer resources)
- Gamification (badges, points, leaderboards)
- Live streaming for events (YouTube/Twitch embeds)
- Merchandise store integration
- Job board for members
- Alumni network

---

## 17. Conclusion

This PRD defines a comprehensive migration and enhancement plan for the GDG@GT website. The project preserves all existing admin functionality (26 pages, 46 services, 30+ tables) while delivering a modern, playful public interface with 2026-era features (PWA, push notifications, enhanced admin tools, superior performance).

**Key Success Factors:**
1. ✅ Keep ALL admin features (no loss of functionality)
2. ✅ Modern UI (warm peach/coral aesthetic, glassmorphic navbar)
3. ✅ High performance (Lighthouse >90)
4. ✅ Accessible (WCAG 2.1 AA)
5. ✅ Future-proof (PWA, offline-first, realtime features)
6. ✅ Enhanced admin panel (8 new productivity features)

**Timeline:** 7-8 weeks from start to launch  
**Budget:** Mostly time (development), minimal costs (hosting free tier, Supabase free/pro tier)  
**Team:** 1-2 developers (AI-assisted) + 1 designer (for 3D assets)

**Features Summary:**
- **Public:** 8 pages, warm gradient design, 3D elements, PWA installable
- **Admin:** 26 preserved pages + 8 new enhancements (realtime dashboard, advanced reports, bulk actions)
- **Database:** 30+ existing tables + 3 new (push subscriptions, offline queue, analytics)
- **Performance:** Lighthouse >90, WCAG AA, <700KB initial load
- **Security:** Secret code access, role-based permissions, audit logging

**Approval Required Before Starting:**
- ✅ Design mockups (generate all 4 from prompts)
- ✅ Technical feasibility (already confirmed)
- ✅ Feature list (this PRD)
- ✅ Timeline (7-8 weeks acceptable)

---

**Document Status:** ✅ Complete and ready for approval  
**Next Steps:**
1. Generate final design mockups (4 prompts in FINAL_DESIGN_PROMPTS.md)
2. User approval of mockups
3. Begin Phase 1 (Setup & Foundation)

**Contact:** Ready to start building! 🚀
