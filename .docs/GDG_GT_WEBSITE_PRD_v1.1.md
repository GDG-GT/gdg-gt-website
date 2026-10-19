# Product Requirements Document (PRD) v1.1
## Google Developer Group on Campus at Georgia Institute of Technology

**Document Version:** 1.1  
**Date:** October 16, 2026  
**Status:** Ready for Implementation  
**Source System:** GDG Penn State University (verified operational installation)  
**Target System:** GDG Georgia Institute of Technology (new deployment)

---

## Document Control and Changelog

### Version History

**v1.1 (October 16, 2026)**
- Corrected migration count: 82 migrations (was 79)
- Corrected service count: 44 services (was 46)
- Corrected component count: 96 components (was 88+)
- Added verified authentication architecture (custom admin system, NOT Supabase Auth)
- Documented actual RLS strategy (FOR ALL USING true + app-layer authorization)
- Removed unimplemented PWA claims (no current implementation exists)
- Removed unimplemented analytics claims (placeholder only)
- Added source protection requirements
- Corrected secret code implementation details (RPC-based validation)
- Added complete feature status matrix
- Documented actual storage buckets (media, blog-submissions)
- Added Edge Functions inventory (10 functions)
- Removed test coverage claims (no tests exist)
- Separated verified facts from proposed additions
- Added testable acceptance criteria throughout

**v1.0 (Previous)**
- Initial comprehensive PRD with estimated counts and assumptions

### Purpose of This Document

This PRD defines the complete scope, architecture, and implementation plan for migrating the verified GDG Penn State website to Georgia Institute of Technology. Every technical claim in this document has been verified against the source repository at `/Users/tejas/Desktop/gdg-psu-website`.

---

## 1. Executive Summary

Google Developer Group on Campus at Georgia Institute of Technology requires a complete chapter website migrated from the verified operational GDG Penn State installation. The migration preserves all working functionality (26 admin pages, 44 services, complete database schema) while applying a new warm peach/coral visual design and Georgia Tech branding.

**Core Objectives:**
1. Migrate verified PSU codebase with zero functional regression
2. Apply approved warm gradient visual design
3. Rebrand from Penn State to Georgia Tech
4. Add PWA capabilities (new functionality)
5. Add push notifications (new functionality)
6. Maintain all admin operational tools
7. Preserve complete team collaboration features
8. Keep blog and project systems (hidden from public navigation)

**What This Is NOT:**
- Not a from-scratch rebuild
- Not a scope reduction exercise
- Not a simplification of admin features
- Not a deletion of any database tables or migrations

**Timeline:** 7-8 weeks (dependency-based phases with verification gates)  
**Deployment:** Vercel (existing PSU configuration)  
**Database:** New Supabase project (separate from PSU production)

---

## 2. Product Goals

### Primary Goals

1. **Functional Parity:** Every feature working in PSU works in GT installation
2. **Visual Refresh:** Warm peach/coral aesthetic replacing PSU blue theme
3. **Brand Migration:** Complete PSU → GT content and asset replacement
4. **Modern Capabilities:** Add PWA and push notification support
5. **Source Protection:** PSU production data never migrates to GT database

### Non-Goals for This Release

1. ❌ Redesigning admin panel workflows (keep existing UX)
2. ❌ Changing authentication architecture (keep custom admin system)
3. ❌ Modifying database schema structure (migrations run as-is)
4. ❌ Adding AI chatbot (user rejected: "not needed in club website")
5. ❌ Adding voice search (user rejected: same reason)
6. ❌ Making blog/projects publicly navigable (keep hidden)
7. ❌ Changing team hierarchy or permissions system
8. ❌ Modifying finance or Linktree implementations

---

## 3. Source System Baseline

### 3.1 Verified Repository Structure

**Location:** `/Users/tejas/Desktop/gdg-psu-website`  
**Framework:** React 18.3.1 + TypeScript 5.8.3 + Vite 7.1.5  
**Package Manager:** npm (package-lock.json present)  
**Live Status:** Operational production installation at Penn State

### 3.2 Verified Counts

| Component | Verified Count | PRD v1.0 Claim | Status |
|-----------|----------------|----------------|--------|
| Migration files | **82** | 79 | ❌ Corrected |
| Admin pages | **26** | 26 | ✅ Accurate |
| Service files | **44** | 46 | ❌ Corrected |
| Component files | **96** | 88+ | ✅ Refined |
| Public pages | **19** | ~18 | ✅ Refined |
| Edge Functions | **10** | Not specified | ➕ Added |
| Storage buckets | **2** | Not specified | ➕ Added |
| Test files | **0** | Not specified | ➕ Added |

### 3.3 Installed Dependencies (Exact Versions)

**Core Framework:**
- `react: 18.3.1`
- `react-dom: 18.3.1`
- `typescript: 5.8.3`
- `vite: 7.1.5`
- `@vitejs/plugin-react-swc: 3.11.0`

**Routing & State:**
- `react-router-dom: 6.30.1`
- `@tanstack/react-query: 5.83.0`

**Backend:**
- `@supabase/supabase-js: 2.57.4`

**UI Framework:**
- `tailwindcss: 3.4.17`
- Multiple `@radix-ui/*` packages (v1.x - v2.x range)
- `framer-motion: 12.23.21`
- `lucide-react: 0.462.0`

**Forms & Validation:**
- `react-hook-form: 7.61.1`
- `@hookform/resolvers: 3.10.0`
- `zod: 3.25.76`

**Specialized:**
- `@excalidraw/excalidraw: 0.18.1` (whiteboard base)
- `@react-three/fiber: 8.18.0` (3D graphics)
- `@react-three/drei: 9.122.0`
- `three: 0.168.0`
- `resend: 6.0.3` (email, but used server-side only)
- `dompurify: 3.3.3` (XSS prevention)

**Email Service:**
- Resend API (no SDK in frontend; API calls via Edge Functions)

**Notable Absences:**
- ❌ No PWA plugin installed
- ❌ No test framework (no Jest, Vitest, Testing Library)
- ❌ No analytics SDK (no @google-analytics/gtag)
- ❌ No tldraw package (uses @excalidraw instead)

### 3.4 Authentication Architecture (Verified)

**CRITICAL FINDING:** The application uses a **custom admin authentication system**, NOT Supabase Auth.

**Actual Implementation:**
- Custom `admin_users` table with bcrypt password hashes
- Password authentication via secure RPC functions (`authenticate_admin`, `create_admin_user`, `update_admin_password`)
- HttpOnly cookie sessions (managed by Vercel API routes)
- CSRF token protection
- Session validation via `/api/session` endpoint
- NO usage of `auth.users` table or Supabase Auth SDK methods

**Authentication Flow:**
1. User enters secret code in newsletter field → modal appears
2. User submits email + password
3. Frontend calls `/api/session` (POST) with credentials
4. API route validates via `authenticate_admin` RPC
5. Server sets httpOnly session cookie
6. Subsequent requests include cookie for validation

**Code Evidence:**
- `src/services/adminService.ts` - Uses `supabase.rpc('authenticate_admin')`
- `src/services/sessionService.ts` - HttpOnly cookie session management
- `src/contexts/AdminContext.tsx` - Custom AdminUser type
- `supabase/migrations/001_add_password_auth.sql` - Creates password_hash column
- `supabase/migrations/003_admin_users_management.sql` - Admin table structure

**Row Level Security:**
- RLS enabled on all tables
- Policies use `FOR ALL USING (true)` (not `auth.uid()`)
- Authorization enforced at application layer via PageAccessGuard
- No Supabase Auth session to check in policies

**Migration Implication:**
- Do NOT add Supabase Auth
- Do NOT create auth.users profiles
- Do NOT replace custom authentication
- Keep httpOnly cookie session system
- Migrate RPC functions exactly as written

### 3.5 Public Routes (Verified from App.tsx)

**Implemented Routes:**
- `/` - Home
- `/events` - Events listing
- `/blog` - Blog listing (will be hidden)
- `/blog/:slug` - Individual post (will be hidden)
- `/contact` - Contact form
- `/projects` - Projects showcase (will be hidden)
- `/team` - Team member profiles
- `/resources` - Learning resources
- `/sponsors` - Sponsor showcase
- `/gallery` - Photo gallery
- `/l/:username` - Linktree pages
- `/newsletter/confirm` - Newsletter confirmation
- `/newsletter/unsubscribe` - Unsubscribe handler
- `/offline` - Offline fallback page
- `/maintenance` - Maintenance mode page
- `*` - 404 handler

**Routes to Hide (Keep Code, Remove Nav):**
- `/blog`
- `/blog/:slug`
- `/projects`

**Missing (Proposed Additions):**
- `/events/:slug` - Individual event pages (add stable shareable URLs)
- `/about` - About/mission page (optional)
- `/privacy` - Privacy policy page
- `/accessibility` - Accessibility statement

### 3.6 Admin Routes (Verified - All 26 Pages)

| Route | File | Purpose | Status |
|-------|------|---------|--------|
| `/admin` | AdminDashboard.tsx | Overview dashboard | ✅ Working |
| `/admin/content` | AdminContent.tsx | Site content management | ✅ Working |
| `/admin/events` | AdminEvents.tsx | Event CRUD | ✅ Working |
| `/admin/team` | AdminTeam.tsx | Team member management | ✅ Working |
| `/admin/projects` | AdminProjects.tsx | Project management | ✅ Working |
| `/admin/members` | AdminMembers.tsx | Community members | ✅ Working |
| `/admin/resources` | AdminResources.tsx | Resource library | ✅ Working |
| `/admin/newsletter` | AdminNewsletter.tsx | Newsletter campaigns | ✅ Working |
| `/admin/blog` | AdminBlog.tsx | Blog post management | ✅ Working |
| `/admin/users` | AdminUsers.tsx | Admin user management | ✅ Working |
| `/admin/profile` | AdminProfile.tsx | User profile settings | ✅ Working |
| `/admin/sponsors` | AdminSponsors.tsx | Sponsor management | ✅ Working |
| `/admin/communications` | AdminCommunications.tsx | Bulk communications | ✅ Working |
| `/admin/channels` | AdminChannels.tsx | Org-wide chat channels | ✅ Working |
| `/admin/whiteboard` | AdminWhiteboard.tsx | Collaborative canvas | ✅ Working |
| `/admin/gallery` | AdminGallery.tsx | Photo management | ✅ Working |
| `/admin/media` | AdminMedia.tsx | Media library | ✅ Working |
| `/admin/guide` | AdminGuide.tsx | Admin documentation | ✅ Working |
| `/admin/linktree` | AdminLinktree.tsx | Social link management | ✅ Working |
| `/admin/site-status` | AdminSiteStatus.tsx | Maintenance mode control | ✅ Working |
| `/admin/teams` | AdminTeams.tsx | Team hierarchy | ✅ Working |
| `/admin/finances` | AdminFinances.tsx | Budget & expenses | ✅ Working |
| `/admin/audit-log` | AdminAuditLog.tsx | Activity audit trail | ✅ Working |
| `/admin/team/:teamId` | TeamDashboard.tsx | Individual team workspace | ✅ Working |
| `/admin/invite/:token` | AcceptInvite.tsx | Team invitation acceptance | ✅ Working |
| `/admin/blog-editor` | BlogEditorDashboard.tsx | Blog editor role dashboard | ✅ Working |
| `/admin/blog-media` | BlogEditorMedia.tsx | Blog editor media access | ✅ Working |

**Access Control:** All admin routes protected by `PageAccessGuard` component with role-based checks.

### 3.7 Services Inventory (44 Verified)

1. adminService.ts
2. attendanceService.ts
3. auditService.ts
4. blogCommentsService.ts
5. blogReactionService.ts
6. blogService.ts
7. blogSubmissionService.ts
8. cacheService.ts
9. channelsService.ts
10. communicationsService.ts
11. contactService.ts
12. contentService.ts
13. csrfService.ts
14. emailService.ts
15. eventsEmailService.ts
16. eventsService.ts
17. financesService.ts
18. inputValidationService.ts
19. linktreeService.ts
20. mediaService.ts
21. membersService.ts
22. newsletterService.ts
23. notificationService.ts
24. optimizedContentService.ts
25. permissionsService.ts
26. preloaderService.ts
27. profileMergingService.ts
28. projectStarsService.ts
29. projectsService.ts
30. requestService.ts
31. resendService.ts
32. resourcesService.ts
33. securityService.ts
34. sessionService.ts
35. siteStatusService.ts
36. sponsorContentService.ts
37. sponsorsService.ts
38. teamActivityService.ts
39. teamInviteService.ts
40. teamManagementService.ts
41. teamMessagingService.ts
42. teamService.ts
43. teamStatisticsService.ts
44. whiteboardService.ts

**All services must be migrated intact.** No service may be deleted or simplified without user approval.

### 3.8 Database Schema (From 82 Migrations)

**Verified Table Count:** 40+ tables across 82 migration files

**Core Tables:**
- `admin_users` - Admin authentication (custom, NOT auth.users)
- `admin_actions` - Audit log
- `session_tokens` - Session management
- `csrf_tokens` - CSRF protection

**Content Tables:**
- `events` - Event management
- `event_registrations` - RSVP tracking
- `blog_posts` - Blog articles
- `blog_categories` - Blog organization
- `blog_comments` - Comment system
- `blog_likes` - Engagement tracking
- `blog_submissions` - User-submitted posts
- `blog_submission_comments` - Submission feedback
- `projects` - Project showcase
- `project_stars` - Project likes
- `project_members` - Project contributors
- `team_members` - Public team roster
- `members` - Community member directory
- `resources` - Learning resource library
- `sponsors` - Sponsorship management
- `gallery_photos` - Photo gallery
- `media_files` - Media library

**Communication Tables:**
- `newsletter_subscribers` - Email list
- `newsletter_campaigns` - Campaign tracking
- `communications` - Bulk messaging
- `announcements` - Site-wide announcements
- `announcement_reads` - Read tracking
- `communication_tasks` - Task management
- `internal_messages` - Staff messaging
- `task_comments` - Task discussions

**Team Hierarchy System (9 tables):**
- `admin_teams` - Team structure
- `team_memberships` - User-team assignments
- `team_permissions` - Granular permissions
- `team_announcements` - Team-specific announcements
- `team_activity_log` - Activity tracking
- `team_invites` - Invitation system
- `team_messages` - Team chat
- `team_statistics` - Metrics tracking
- `team_page_access` - Page-level access control

**Finance System:**
- `finances` - Transaction records (amount stored as DECIMAL for precision)
- `finance_attachments` - Receipt uploads
- `budget_allocations` - Budget planning

**Linktree System:**
- `linktree_profiles` - User profile pages
- `linktree_links` - Link management
- `linktree_analytics` - Click tracking

**Channels & Collaboration:**
- `channels` - Org-wide chat rooms (Realtime-enabled)
- `channel_messages` - Channel messages (Realtime-enabled)
- `whiteboards` - Collaborative canvas (Realtime-enabled, JSONB document storage)

**Content Management:**
- `site_settings` - Global configuration (includes admin_secret_code)
- `page_content` - Dynamic page content
- `navigation_items` - Navigation structure
- `social_links` - Social media links
- `footer_content` - Footer sections
- `site_status` - Maintenance mode state

**Security:**
- `security_events` - Security monitoring
- `rate_limits` - Rate limiting records

**Storage Buckets (verified in migrations):**
- `media` - Public media files
- `blog-submissions` - Public blog submission uploads

**Complete schema details documented in Appendix C.**

### 3.9 Edge Functions (10 Verified)

Located in `supabase/functions/`:

1. `send-newsletter` - Newsletter confirmation emails
2. `send-contact-form` - Contact form delivery
3. `send-comment-notification` - Blog comment notifications
4. `send-communication-email` - Bulk email sending
5. `send-event-email` - Event-related emails
6. `send-newsletter-campaign` - Campaign delivery
7. `send-email` - Generic email endpoint
8. `confirmation-mail` - Email confirmation handler
9. `check-overdue-tasks` - Scheduled task checker
10. `_shared` - Shared utilities folder

**All functions use Resend API** with `RESEND_API_KEY` environment variable.

### 3.10 Secret Code System (Verified Implementation)

**How It Actually Works:**

1. **Storage:** Secret code stored in `site_settings` table with key `admin_secret_code`
2. **Discovery:** User enters code in newsletter signup field (Footer.tsx)
3. **Validation:** Frontend checks if entered value matches secret code (client-side initial check)
4. **Trigger:** Valid code opens admin login modal
5. **Authentication:** User must still provide email + password
6. **Authorization:** Normal role-based access control applies after login

**Code Location:**
- `src/components/Footer.tsx` (lines 34-45) - Loads secret code, compares input
- `src/services/contentService.ts` - `validateAdminSecretCode()` (RPC-based, currently not used)
- `supabase/migrations/20250316000000_create_secure_auth_function.sql` - `validate_admin_secret` RPC

**Current Security Model:**
- Secret code loaded to frontend from public database table (not ideal, but existing behavior)
- No rate limiting on secret code attempts (improvement opportunity)
- Code rotation done manually by Super Admin
- No QR code generation (PRD v1.0 incorrectly added this)
- No expiration dates (PRD v1.0 incorrectly added this)
- No usage analytics (PRD v1.0 incorrectly added this)

**Migration Requirements:**
1. Keep existing behavior (client-side check against loaded value)
2. Consider moving to server-side validation (via RPC) to avoid exposing code
3. Add rate limiting on validation attempts
4. Do NOT add automatic rotation, QR codes, or analytics unless requested

**Discovery Barrier:** The secret code mechanism is a discovery gate, not the authorization boundary. Knowing the code does not grant data access—only reveals the login interface.

###
 3.11 Feature Status Matrix

**Purpose:** Separate verified working features from proposed additions.

| Feature | Status | Evidence | Migration Action |
|---------|--------|----------|------------------|
| **Public Website** |
| Homepage | ✅ Working | `src/pages/Home.tsx` | Redesign UI, keep structure |
| Events listing | ✅ Working | `src/pages/Events.tsx` | Redesign UI, keep functionality |
| Event detail pages | ❌ Missing | No route in App.tsx | Add `/events/:slug` |
| Blog listing | ✅ Working | `src/pages/Blog.tsx` | Hide from nav, keep code |
| Blog posts | ✅ Working | `src/pages/BlogPost.tsx` | Hide from nav, keep code |
| Projects page | ✅ Working | `src/pages/Projects.tsx` | Hide from nav, keep code |
| Team page | ✅ Working | `src/pages/Team.tsx` | Redesign UI, keep data |
| Resources page | ✅ Working | `src/pages/Resources.tsx` | Keep as-is |
| Sponsors page | ✅ Working | `src/pages/Sponsors.tsx` | Redesign UI, keep data |
| Gallery | ✅ Working | `src/pages/Gallery.tsx` | Keep masonry layout |
| Contact form | ✅ Working | `src/pages/Contact.tsx` | Redesign UI, keep logic |
| Linktree pages | ✅ Working | `src/pages/Linktree.tsx` | Keep as-is |
| Newsletter signup | ✅ Working | Footer component | Keep functionality |
| **Admin Panel** |
| All 26 admin pages | ✅ Working | Verified in App.tsx | Keep all, apply dark theme |
| Dashboard | ✅ Working | Real-time stats working | Keep as-is |
| Role-based access | ✅ Working | PageAccessGuard verified | Keep permissions system |
| Secret code login | ✅ Working | Footer.tsx implementation | Keep mechanism |
| **Backend Systems** |
| Custom authentication | ✅ Working | adminService.ts + RPC functions | Keep exactly as-is |
| HttpOnly sessions | ✅ Working | sessionService.ts + API routes | Keep secure sessions |
| Email delivery | ✅ Working | 10 Edge Functions + Resend | Keep all functions |
| File uploads | ✅ Working | mediaService.ts + Storage | Keep policies |
| Team hierarchy | ✅ Working | 9 tables + services | Keep structure |
| Finance system | ✅ Working | finances tables + service | Keep all features |
| Channels | ✅ Working | Realtime-enabled | Keep chat system |
| Whiteboards | ✅ Working | Excalidraw + Realtime | Keep collaboration |
| Audit logging | ✅ Working | audit_log table | Keep tracking |
| **Performance Features** |
| Code splitting | ✅ Working | Vite config manual chunks | Keep strategy |
| Image optimization | ⚠️ Partial | No WebP/AVIF generation | Add optimization |
| Caching | ⚠️ Partial | cacheService.ts exists | Verify behavior |
| Service worker | ❌ Disabled | Code exists but unregistered | Implement PWA |
| **Modern Capabilities** |
| PWA | ❌ Missing | No vite-plugin-pwa installed | Add implementation |
| Push notifications | ❌ Missing | No subscription system | Add implementation |
| Offline support | ❌ Missing | Service worker disabled | Implement with PWA |
| Analytics | ❌ Missing | Placeholder in settings only | Add GA4 integration |
| **Testing** |
| Unit tests | ❌ Missing | 0 test files found | Add test suite |
| E2E tests | ❌ Missing | No test framework | Add Playwright |
| Accessibility tests | ❌ Missing | No axe integration | Add automated checks |

**Legend:**
- ✅ Working - Feature exists and functions in PSU installation
- ⚠️ Partial - Feature partially implemented or needs verification
- ❌ Missing - Feature not implemented, proposed for GT
- 🔧 Broken - Feature exists but has known issues

---

## 4. Users and Roles

### 4.1 Public Users (Anonymous)

**Access:**
- View all public pages (except hidden blog/projects)
- Submit contact forms
- Subscribe to newsletter
- Register for events (public events)
- View team member profiles
- Browse resources
- View sponsor showcase
- Access Linktree pages

**Restrictions:**
- Cannot access admin panel
- Cannot see blog or projects pages (hidden from navigation)
- Cannot access team collaboration tools
- Cannot view financial information

### 4.2 Admin Roles (Authenticated)

**Role Hierarchy:** Super Admin > Admin > Team Member > Blog Editor

#### 4.2.1 Super Admin
**Full System Access**

**Capabilities:**
- Manage all admin users (create, edit, delete, change roles)
- Access all 26 admin pages
- Modify site settings and secret code
- Create and delete teams
- Edit team settings (name, color, icon)
- Approve budget allocations
- View complete audit log
- Toggle maintenance mode
- Manage all content types

**Acceptance Criteria:**
- Can create other Super Admins
- Can demote or remove any admin user
- Can override all team permissions
- Can access admin user management page (`/admin/users`)

#### 4.2.2 Admin
**Elevated Operational Access**

**Capabilities:**
- Access most admin pages (except user management)
- Create/edit/delete content (events, blog, projects, resources)
- Manage team members and community members
- Send newsletters and communications
- Manage sponsors and media
- View audit log (own actions + team actions)
- Create team invitations
- Approve team member requests

**Restrictions:**
- Cannot create or delete admin users
- Cannot change secret code
- Cannot delete teams
- Cannot change user roles to Super Admin

**Acceptance Criteria:**
- Can view but not edit admin user list
- Cannot access `/admin/users` create/edit forms
- Can assign Team Member and Blog Editor roles only

#### 4.2.3 Team Member
**Team-Scoped Access**

**Capabilities:**
- Access team-specific pages based on team permissions
- View team dashboard for assigned teams
- Post in team channels and channels
- Participate in team whiteboards
- Submit finance requests (if team has finance permission)
- View resources assigned to team
- Access team announcements and messages

**Restrictions:**
- Cannot access pages outside team permissions
- Cannot manage admin users
- Cannot change site-wide settings
- Cannot delete teams
- Limited to team-specific data

**Access Controlled By:**
- `team_permissions` table (resource + action grants)
- `team_page_access` table (explicit page paths)
- TEAM_PAGE_ACCESS mapping in permissionsService.ts

**Acceptance Criteria:**
- Marketing team member can access `/admin/media` and `/admin/content`
- Events team member can access `/admin/events`
- Finance permission required to access `/admin/finances`
- PageAccessGuard blocks unauthorized pages with "Access Denied" screen

#### 4.2.4 Blog Editor
**Content-Only Access**

**Capabilities:**
- Access blog editor dashboard (`/admin/blog-editor`)
- Create and edit own blog posts
- Upload media to blog-media (`/admin/blog-media`)
- View blog comments and submissions
- Publish approved blog posts

**Restrictions:**
- Cannot access other admin pages
- Cannot manage users, events, or teams
- Cannot send newsletters
- Cannot approve blog submissions (Admin/Super Admin only)

**Acceptance Criteria:**
- Only sees Blog Editor Dashboard and Blog Media in sidebar
- Can create draft posts
- Cannot delete other authors' posts
- Redirected to blog editor dashboard if accessing other admin routes

### 4.3 Role Assignment Flow

**Super Admin Creation:**
- Manual database insertion (first super admin)
- Or created by existing Super Admin

**Admin Creation:**
- Created by Super Admin via `/admin/users`
- Receives email notification with initial login instructions

**Team Member Creation:**
- Added by Super Admin or Admin to specific team
- Permissions inherited from team configuration
- Email invitation with acceptance link

**Blog Editor Creation:**
- Created by Admin or Super Admin
- Limited to blog content management only

---

## 5. Public Information Architecture

### 5.1 Navigation Structure

**Primary Navigation (All Public Pages):**
```
Home | Events | Team | Gallery | Resources | Sponsors | Contact
```

**Hidden Pages (Accessible by Direct URL, Not in Nav):**
- `/blog` - Blog listing
- `/blog/:slug` - Blog post details
- `/projects` - Projects showcase

**Utility Pages (No Nav Presence):**
- `/l/:username` - Linktree pages
- `/newsletter/confirm` - Email confirmation
- `/newsletter/unsubscribe` - Unsubscribe handler
- `/offline` - Offline fallback
- `/maintenance` - Maintenance mode
- `/404` - Not found

**Footer Links:**
- About (if added)
- Privacy Policy (if added)
- Accessibility (if added)
- Social media links (dynamic from `social_links` table)

### 5.2 Page Specifications

#### 5.2.1 Homepage (`/`)

**Purpose:** Primary landing page establishing chapter identity and driving engagement

**Sections:**
1. **Hero** (above fold)
   - Glassmorphic floating navbar (NOT flat, per user correction)
   - Warm peach-to-coral gradient background
   - Glassmorphic hero card with:
     - Full organization name: "Google Developer Group on Campus at Georgia Institute of Technology"
     - Compact label usage: "GDG@GT" after full name established
     - Tagline/mission statement
     - Two CTAs: "Upcoming Events" + "Join Our Community"
   - 3D elements: Small donut (~180px), code brackets, subtle Georgia Tech context
   - Real content visible before animation loads

2. **Stats Section**
   - Four glassmorphic cards: Members, Events Hosted, Active Projects, Years Active
   - Dynamic data from database (NOT hardcoded Penn State numbers)
   - Fade-in on scroll animation

3. **Upcoming Events**
   - Three featured events pulled from `events` table (published, future date)
   - Event cards with: image, date badge, title, location, tags, "Register" button
   - "View All Events" link to `/events`

4. **Footer**
   - Dynamic content from `footer_content` table
   - Newsletter signup (secret code detection)
   - Social links from `social_links` table

**Data Sources:**
- Statistics: Aggregated from `members`, `events`, `projects` tables
- Featured events: `events` WHERE status = 'published' AND event_date > NOW() ORDER BY event_date LIMIT 3
- Footer: `footer_content`, `social_links`, `site_settings`

**Acceptance Criteria:**
- Full organization name displayed on first reference
- Statistics reflect actual GT data (or hidden if no data)
- Hero works with JavaScript disabled (content still visible)
- Mobile receives static or lightweight animation version
- Glassmorphic navbar (NOT flat white background)

#### 5.2.2 Events Page (`/events`)

**Purpose:** Event discovery and registration

**Features:**
- Filter pills: All | Upcoming | Past | Workshops | Talks | Socials
- Search bar (title, description, tags)
- Event cards grid (3 columns desktop, 1 mobile)
- Each card shows: image, date badge, title, short description, location, tags, register button
- Load more pagination or infinite scroll
- Empty state: "No upcoming events. Check back soon!"

**Data Source:** `events` table with `event_registrations` join for capacity

**Filters:**
- Upcoming: `event_date >= NOW()`
- Past: `event_date < NOW()`
- By type: `event_type` column match

**Acceptance Criteria:**
- Only published events visible to public
- Past events show "Event Ended" instead of register button
- Clicking event card or title navigates to `/events/:slug` (NEW ROUTE)
- Registration button opens modal or external link based on `registration_url` field

#### 5.2.3 Individual Event Page (`/events/:slug`) **[NEW]**

**Purpose:** Dedicated shareable page for each event

**Required Sections:**
1. **Event Header**
   - Featured image (full width or hero treatment)
   - Event title
   - Date, time, duration
   - Location (with map link if available)
   - Registration status: "Open" | "Closed" | "Full" | "Ended"

2. **Event Details**
   - Full description (markdown support)
   - Speaker/host information (if applicable)
   - Prerequisites or requirements
   - What to bring
   - Agenda/schedule

3. **Registration Section**
   - Register button (if open)
   - Capacity indicator: "42 / 100 registered"
   - Waitlist option if full
   - Or external registration link

4. **Related Events**
   - 3 similar or upcoming events
   - Based on tags or type

**Data Source:** `events` table by slug, `event_registrations` for count

**Meta Data:**
- Page title: `{event_title} | GDG@GT`
- Description: Event excerpt
- OG image: Event featured image
- Structured data: Event schema

**Acceptance Criteria:**
- Stable URL structure: `/events/intro-to-react-2026-11-15`
- Past events still accessible (archive)
- Social sharing shows correct preview
- Calendar export button (.ics file)
- 404 if event slug not found

#### 5.2.4 Team Page (`/team`)

**Purpose:** Showcase team members and leadership

**Layout:**
- Role filter tabs: All | Leads | Core Team | Active Members | Alumni
- Team member cards grid (4 columns desktop, 2 mobile)
- Each card: Avatar, name, role/title, bio (truncated), social links
- Stagger fade-in animation on scroll

**Data Source:** `team_members` table WHERE `is_active = true` ORDER BY `display_order`

**Card Content:**
- Profile picture (placeholder if none)
- Full name
- Role/title (e.g., "President", "Technical Lead", "Marketing Co-Lead")
- Brief bio (2-3 lines, expandable on click/hover)
- Social links: LinkedIn, GitHub, Twitter (if provided)

**Acceptance Criteria:**
- Only active team members shown
- Alumni filtered with separate tab (if `role` includes "Alumni")
- Empty state: "Our team page is being updated. Check back soon!"
- Responsive: 1 column mobile, 2 tablet, 4 desktop

#### 5.2.5 Gallery Page (`/gallery`)

**Purpose:** Photo archive of events and activities

**Layout:**
- Masonry grid (Pinterest-style, varying heights)
- Filter dropdown: "All Events" | Individual event names
- Lightbox viewer on click (navigation arrows, close button)
- Lazy loading (images load as user scrolls)

**Data Source:** `gallery_photos` table with optional `event_id` join

**Features:**
- WebP/AVIF format with JPEG fallback
- Thumbnail images for grid (smaller file size)
- Full resolution in lightbox
- Caption/description overlay on hover
- "Load More" button or infinite scroll

**Acceptance Criteria:**
- Images optimized (<200KB thumbnail, <1MB full)
- Lightbox keyboard navigable (arrow keys, ESC to close)
- Alt text on all images
- Loading skeleton while images fetch

#### 5.2.6 Resources Page (`/resources`)

**Purpose:** Curated learning materials and tools

**Layout:**
- Category tabs: Learning Paths | Tools | Documentation | Templates | External Links
- Resource cards grid (3 columns desktop)
- Each card: Icon/thumbnail, title, description, link, tags

**Data Source:** `resources` table WHERE `is_published = true` ORDER BY `category`, `order_index`

**Card Types:**
- **Article:** Link to blog post or external article
- **Video:** Embedded player or link to YouTube/platform
- **Course:** Link to course platform
- **Tool:** Description + download/access link
- **Documentation:** Link to official docs

**Acceptance Criteria:**
- External links open in new tab with `rel="noopener noreferrer"`
- Search bar filters by title/description/tags
- Empty state per category if no resources

#### 5.2.7 Sponsors Page (`/sponsors`)

**Purpose:** Acknowledge and showcase sponsors

**Layout:**
- Sponsor tiers: Platinum | Gold | Silver | Bronze | Community Partners
- Tier sections with tier description
- Sponsor logos in glassmorphic cards
- Grayscale filter → color on hover
- Logo links to sponsor website

**Data Source:** `sponsors` table WHERE `is_active = true` ORDER BY `tier`, `display_order`

**Tier Display:**
- Platinum: Largest logos, top placement
- Gold: Medium logos
- Silver: Smaller logos
- Bronze: Logo list
- Community: Text list with links

**Acceptance Criteria:**
- "Become a Sponsor" CTA with contact link
- Responsive logo sizing
- No broken images (placeholder if logo URL fails)

#### 5.2.8 Contact Page (`/contact`)

**Purpose:** Primary communication channel for inquiries

**Form Fields:**
- Name (required)
- Email (required, validated)
- Subject (optional)
- Message (required, textarea, 500 char minimum)
- Optional: Event inquiry checkbox, Sponsorship inquiry checkbox

**Features:**
- Client-side validation (Zod schema)
- Server-side validation (inputValidationService.ts)
- Rate limiting (5 submissions per hour per IP)
- CSRF protection
- Success: Confetti animation + confirmation message
- Error: Inline error messages

**Backend Flow:**
1. Form submission → `contactService.ts`
2. Data validated and sanitized
3. Stored in `communications` or contact messages table
4. Email sent to chapter email via Edge Function
5. Auto-reply confirmation sent to user
6. Admin notification (if configured)

**Data Destinations:**
- `communications` table or dedicated contact messages table
- Email notification via `send-contact-form` Edge Function

**Additional Info:**
- Social links (Discord, Instagram, LinkedIn, email)
- Office hours (if applicable)
- Meeting location (if applicable)

**Acceptance Criteria:**
- Form accessible and submittable without JavaScript
- Email delivery confirmed (check Edge Function logs)
- User receives confirmation email
- Submission appears in admin communications dashboard

---

## 6. Admin Information Architecture

### 6.1 Admin Navigation Structure

**Sidebar Sections:**

```
📊 Dashboard
   └─ Overview

📝 Content Management
   ├─ Events
   ├─ Team Members
   ├─ Members Directory
   ├─ Resources
   ├─ Sponsors
   ├─ Gallery
   ├─ Media Library
   └─ Site Content

✍️ Blog & Projects (Conditional: Admin/Super Admin only)
   ├─ Blog Posts
   └─ Projects

💬 Communications
   ├─ Newsletter
   ├─ Communications
   ├─ Channels
   └─ Announcements

👥 Team Collaboration
   ├─ Teams
   ├─ Team Dashboard (if member of teams)
   ├─ Whiteboard
   └─ Invites

💰 Finance & Operations
   ├─ Finances
   └─ Audit Log

⚙️ System & Settings
   ├─ Users (Super Admin only)
   ├─ Site Status
   ├─ Linktree
   ├─ Profile
   └─ Guide

📖 Blog Editor Dashboard (Blog Editor role only)
   ├─ My Posts
   └─ Blog Media
```

**Role-Based Visibility:**
- Super Admin: Sees all sections
- Admin: Sees all except Users
- Team Member: Sees Dashboard, Teams, assigned pages based on permissions
- Blog Editor: Sees only Blog Editor Dashboard and Blog Media

### 6.2 Admin Route Matrix

See **Appendix A** for complete route matrix with:

- Route path
- Purpose
- Permitted roles
- Required permissions
- Implementation status

---

## 7. Functional Requirements

### 7.1 Authentication & Authorization

**FR-AUTH-001: Secret Code Discovery**
- User enters secret code in newsletter field
- System validates code against `site_settings.admin_secret_code`
- Valid code triggers admin login modal
- Invalid code proceeds with newsletter subscription flow

**FR-AUTH-002: Admin Login**
- User provides email + password in modal
- System validates via `authenticate_admin` RPC function
- Successful authentication creates httpOnly session cookie
- Failed authentication shows error, allows 5 attempts per 15 minutes
- Session expires after 7 days of inactivity

**FR-AUTH-003: Session Management**
- All admin API calls include session cookie
- Server validates session via `/api/session` GET
- Expired sessions redirect to homepage
- Logout clears httpOnly cookie and CSRF token

**FR-AUTH-004: Role-Based Access Control**
- Every admin route wrapped in `PageAccessGuard`
- Guard calls `PermissionsService.canAccessPage(user, path)`
- Access denied shows dedicated screen with dashboard link
- Team members see only pages matching team permissions

**FR-AUTH-005: Secret Code Rotation**
- Super Admin can update secret code via admin settings
- Update requires re-authentication
- Change logged in `audit_log` table
- Old code immediately invalid

**Acceptance Criteria:**
- Secret code check completes in <500ms
- Login attempt rate limited to 5 per 15 minutes per IP
- Session validation occurs on every admin page load
- PageAccessGuard blocks unauthorized access with 403-equivalent screen

### 7.2 Event Management

**FR-EVENT-001: Event Creation**
- Admin/Super Admin can create events via `/admin/events`
- Required fields: title, description, date, location, type
- Optional fields: featured image, registration URL, capacity, tags
- Draft or published status
- Slug auto-generated from title (editable)

**FR-EVENT-002: Event Registration**
- Public users can register via event page
- System tracks registrations in `event_registrations` table
- Registration closed when capacity reached
- Waitlist option if event full
- Confirmation email sent via Edge Function

**FR-EVENT-003: Event Listing**
- Public events page shows published events only
- Filterable by upcoming/past/type
- Sortable by date, title, popularity
- Search by title, description, tags

**FR-EVENT-004: Individual Event Pages**
- Each event has stable URL: `/events/{slug}`
- Shows full details, registration form, related events
- Social sharing meta tags
- iCal export for calendar apps

**FR-EVENT-005: Event Attendance Tracking**
- Admin can mark attendees as "attended" in admin panel
- Attendance stats displayed in admin dashboard
- Export attendance list as CSV

**Acceptance Criteria:**
- Event creation saves draft immediately
- Published events visible on public page within 1 second
- Registration confirmation email delivered within 30 seconds
- Capacity enforced (no overbooking)

### 7.3 Team Management

**FR-TEAM-001: Team Hierarchy**
- Super Admin creates teams via `/admin/teams`
- Each team has: name, slug, description, color, icon
- Teams can have parent teams (hierarchical structure)
- Team lead assigned per team

**FR-TEAM-002: Team Membership**
- Admin/Super Admin adds users to teams
- User can be member of multiple teams
- Roles: Lead, Co-Lead, Member
- Membership tracked in `team_memberships` table

**FR-TEAM-003: Team Permissions**
- Each team has granular permissions per resource
- Resources: events, projects, blog, members, sponsors, etc.
- Actions: create, read, update, delete
- Permissions checked via `PermissionsService.hasPermission()`

**FR-TEAM-004: Team Collaboration**
- Team members access team dashboard at `/admin/team/{teamId}`
- Team announcements posted and pinned
- Team messages/chat in private team channel
- Team activity log tracks all actions
- Team statistics dashboard

**FR-TEAM-005: Team Invitations**
- Team leads send invitations via email
- Invitation includes unique token
- Recipient clicks link → `/admin/invite/{token}`
- Accept or decline invitation
- Accepted invitations create team membership

**Acceptance Criteria:**
- Team creation completes in <2 seconds
- Invitations sent within 30 seconds
- Invitation links expire after 7 days
- Team permissions enforced on every admin page load

### 7.4 Finance System

**FR-FINANCE-001: Expense Tracking**
- Team members submit expenses via `/admin/finances`
- Required: title, amount (stored as DECIMAL), category, date
- Optional: description, vendor, receipt attachments
- Status: pending, approved, rejected, completed

**FR-FINANCE-002: Receipt Uploads**
- Attach multiple receipts to expense
- Stored in private `finance-receipts` storage bucket
- Accessible only to admins and expense submitter
- File validation: max 10MB, PDF/image formats only

**FR-FINANCE-003: Budget Management**
- Super Admin creates budget allocations per category/team
- Allocated amount vs. spent amount tracked
- Alerts when spending exceeds 80% of budget
- Fiscal year and quarter tracking

**FR-FINANCE-004: Approval Workflow**
- Admin/Super Admin reviews pending expenses
- Approve, reject, or request clarification
- Approval sends notification to submitter
- Rejection includes reason/notes

**FR-FINANCE-005: Finance Reports**
- Generate reports by date range, category, team
- Export to CSV or PDF
- Visual charts: spending over time, category breakdown
- Budget vs. actual comparison

**Acceptance Criteria:**
- Receipt upload completes in <10 seconds
- Budget alerts sent within 1 hour of threshold breach
- Approval notification delivered within 30 seconds
- Reports generate in <5 seconds for 1 year of data

### 7.5 Communication Systems

**FR-COMM-001: Newsletter Management**
- Admin creates campaigns via `/admin/newsletter`
- Subscriber list from `newsletter_subscribers` table
- Email templates with variables (name, unsubscribe link)
- Preview before sending
- Send immediately or schedule

**FR-COMM-002: Newsletter Subscriptions**
- Public users subscribe via footer form
- Double opt-in confirmation email
- Confirmation token in `newsletter_subscribers` table
- Click confirmation link to activate subscription

**FR-COMM-003: Bulk Communications**
- Admin sends targeted messages via `/admin/communications`
- Target audiences: all members, active members, team members, custom list
- Message stored in `communications` table
- Delivery via `send-communication-email` Edge Function

**FR-COMM-004: Announcements**
- System-wide announcements shown to all admins
- Priority levels: low, normal, high, urgent
- Can be pinned to top
- Dismissible by users
- Read tracking in `announcement_reads` table

**FR-COMM-005: Channels (Org-Wide Chat)**
- Admins post in org-wide channels via `/admin/channels`
- Realtime message delivery via Supabase Realtime
- Message types: text, file, image, link
- Reply threading, pinning, deletion
- Read receipts tracking

**Acceptance Criteria:**
- Newsletter confirmation email sent within 30 seconds
- Campaign delivery completes within 5 minutes for 1000 subscribers
- Channel messages appear in <2 seconds via Realtime
- Announcements persist until dismissed

### 7.6 Collaborative Features

**FR-COLLAB-001: Whiteboard**
- Admins access collaborative canvas at `/admin/whiteboard`
- Based on Excalidraw library
- Document stored as JSONB in `whiteboards` table
- Realtime collaboration via Supabase Realtime
- Auto-save every 30 seconds

**FR-COLLAB-002: Whiteboard Management**
- Create, rename, delete whiteboards
- Thumbnail preview in list view
- Last-write-wins conflict resolution
- Export as PNG or JSON

**FR-COLLAB-003: Team Messages**
- Team-specific messaging in team dashboard
- Separate from org-wide channels
- Only team members can view/post
- Pinning, attachments, replies

**Acceptance Criteria:**
- Whiteboard changes sync within 2 seconds
- Auto-save does not interrupt drawing
- Exported PNG renders correctly at 1920x1080
- Team messages only visible to team members

### 7.7 Media & Content Management

**FR-MEDIA-001: Media Library**
- Upload images, videos, documents via `/admin/media`
- Stored in `media` storage bucket
- Metadata tracked in `media_files` table
- File validation: type, size, MIME type
- Organization by folders or tags

**FR-MEDIA-002: Gallery Management**
- Upload photos via `/admin/gallery`
- Associate with specific events
- Set display order, feature images
- Bulk upload (max 50 images at once)
- Generate thumbnails automatically

**FR-MEDIA-003: Site Content Management**
- Edit page content via `/admin/content`
- Dynamic sections: hero, stats, footer, navigation
- WYSIWYG or markdown editor
- Preview before publishing
- Revert to previous versions

**FR-MEDIA-004: Blog Management**
- Create/edit blog posts via `/admin/blog`
- Markdown editor with syntax highlighting
- Featured image, excerpt, tags, category
- Draft/published status
- Scheduled publishing (future date)

**Acceptance Criteria:**
- Image upload <10 seconds for 5MB file
- Thumbnail generation completes in <5 seconds
- Content changes reflect on public site immediately
- Blog scheduled posts publish automatically at specified time

### 7.8 Linktree System

**FR-LINKTREE-001: Profile Creation**
- Admins create Linktree profiles via `/admin/linktree`
- Custom username (e.g., `/l/john-smith`)
- Display name, bio, avatar
- Background: solid color, gradient, or image
- Theme: light, dark, auto

**FR-LINKTREE-002: Link Management**
- Add unlimited links to profile
- Link types: standard, social, email, phone
- Custom button styles and colors
- Reorder links via drag-and-drop
- Show/hide click counts

**FR-LINKTREE-003: Analytics**
- Track link clicks in `linktree_analytics` table
- Display total clicks per link
- Visitor data: country, referrer, user agent
- Click timeline graph

**FR-LINKTREE-004: Public Access**
- Public users access via `/l/{username}`
- No authentication required
- Responsive design (mobile-first)
- Fast loading (<1 second)

**Acceptance Criteria:**
- Profile URL changes take effect immediately
- Click tracking accuracy >99%
- Analytics dashboard loads in <2 seconds
- Public page works without JavaScript (links functional)

---

## 8. Design Direction and Design System

### 8.1 Approved Design Direction

**Visual Language:** Warm, playful, technical, and student-led

**Approved Aesthetic:** Image 2 from design exploration - warm peach/coral gradient with controlled 3D elements

### 8.2 Design Registers

**Two Distinct Design Treatments:**

#### 8.2.1 Public Website Register
**Expressive, Welcoming, Technical, Student-Led**

**Characteristics:**
- Warm coral primary accent
- Controlled use of gradients
- One art-directed hero composition
- Playful but purposeful motion
- Real chapter imagery prioritized
- Strong mobile presentation
- Glassmorphism used intentionally (navbar, hero card)

**What to Avoid:**
- Gradient-filled text
- Every section glassmorphic
- Excessive decorative elements simultaneously
- Animation-dependent content
- Generic stock imagery

#### 8.2.2 Admin Application Register
**Restrained, Dense, Familiar, Task-Oriented**

**Characteristics:**
- Solid neutral work surfaces
- Clear sidebar hierarchy
- Consistent controls across all 26 routes
- Coral for primary actions and selection only
- Semantic colors for states (error, warning, success)
- No glass effects behind tables, charts, forms
- Motion only for state changes and feedback
- Useful empty states and loading skeletons

**What to Avoid:**
- Decorative glass effects
- Page-load choreography
- Excessive animation
- Design elements that slow task completion

### 8.3 Public Design System

#### 8.3.1 Color Palette

**Primary (Warm Gradient):**
```css
--coral-50: #FFF8F0;
--coral-100: #FFE5B3;
--coral-300: #FFC093;
--coral-500: #FF9A76;  /* PRIMARY */
--coral-600: #FF8366;
--coral-700: #F88377;
```

**Google Brand Colors (Controlled Use):**
```css
--google-blue: #4285F4;
--google-red: #DB4437;
--google-yellow: #F4B400;
--google-green: #0F9D58;
```

**Georgia Tech Official Colors:**
```css
--gt-gold: #B3A369;     /* Tech Gold */
--gt-navy: #003057;     /* Tech Navy */
--gt-buzz: #EAAA00;     /* Buzz Gold */
```

**Neutrals:**
```css
--white: #FFFFFF;
--off-white: #FFF8F0;
--cream: #FFFBF5;
--text-dark: #2D2D2D;
--text-gray: #666666;
--text-light: #999999;
--border: #E5E5E5;
```

**Color Usage Rules:**
- Use coral as primary brand accent
- Google colors in program-appropriate roles only (not decorative)
- Georgia Tech colors for subtle institutional context (not dominant)
- Maintain 4.5:1 contrast for body text
- Maintain 3:1 contrast for large text and controls
- Avoid low-contrast gray text over coral gradients

#### 8.3.2 Typography

**Confirmed Font Stack:**
- **Display:** Space Grotesk (loaded from Google Fonts)
- **Body:** Inter (loaded from Google Fonts)
- **Loading:** `font-display: swap` (prevent invisible text)

**Scale:**
- **Hero (Desktop):** 72-80px (Space Grotesk)
- **Hero (Mobile):** 36-40px
- **H1:** 48px desktop, 32px mobile
- **H2:** 36px desktop, 24px mobile
- **H3:** 24px desktop, 20px mobile
- **Body:** 16px minimum (never smaller)
- **Small:** 14px (captions, metadata only)

**Usage Rules:**
- Fluid sizing only on public marketing pages
- Fixed rem-based sizing in admin tools
- Display font (Space Grotesk) for headings only
- Body font (Inter) for all prose, buttons, forms, tables
- No display font in buttons, form labels, dense controls
- Body text: 65-75 characters per line maximum
- Balanced headings (no widows or orphans on large text)

#### 8.3.3 Glassmorphism Effect

**Usage:** Navbar and hero card only (not every section)

**CSS Recipe:**
```css
.glassmorphic {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.15);
}
```

**Application:**
- Floating navigation bar
- Hero card containing primary headline and CTAs
- Optionally: one accent card per page maximum

**Not Applied To:**
- Content sections
- Event cards
- Resource cards
- Form containers
- Tables or data displays

#### 8.3.4 3D Elements

**Approved Elements:**
- Small donut with sprinkles (~180px diameter)
- Code brackets `</>` (~120px)
- Geometric shapes (cubes, pyramids) with Google colors
- Subtle Georgia Tech tower silhouette (background integration)

**Placement:**
- Positioned around edges of hero composition
- Never obscuring text or CTAs
- Decorative only (no interaction required)

**Mobile Strategy:**
- Static PNG/SVG images (no interactive 3D)
- Reduced count (1-2 elements maximum)
- Fallback if WebGL unavailable

**Implementation:**
- `@react-three/fiber` + `@react-three/drei` for 3D rendering
- Lazy-loaded (does not block initial render)
- Proper loading states and fallbacks

#### 8.3.5 Motion & Animation

**Principles:**
- Purposeful, not decorative
- Fast (200-300ms duration)
- Reduced-motion support mandatory

**Approved Animations:**
- Fade-in on scroll (stats section, event cards)
- Hover state transitions (buttons, cards)
- Page transition slides (admin panel)
- Success confetti (form submission)
- Loading skeletons (data fetching)

**Forbidden:**
- Auto-playing videos
- Infinite loops (unless loading indicators)
- Animation-dependent content visibility
- Parallax on mobile (performance)

**Accessibility:**
- Respect `prefers-reduced-motion: reduce`
- All animations disabled when user prefers reduced motion
- Content fully functional without animations

#### 8.3.6 Component Specifications

**Cards:**
- Border radius: 12-16px (consistent across all cards)
- Padding: 24px desktop, 16px mobile
- Solid background (white or off-white)
- Subtle shadow: `0 2px 8px rgba(0,0,0,0.08)`
- Hover: lift effect (`translateY(-4px)`) + larger shadow

**Buttons:**
- Primary: Coral background, white text
- Secondary: White background, coral border, coral text
- Ghost: Transparent, coral text
- Disabled: Reduced opacity, no interaction
- Border radius: 8px
- Padding: 12px 24px
- Font: Inter (body font)
- Transition: 200ms ease-out

**Forms:**
- Input border: 1px solid `--border`
- Focus: 2px coral ring, coral border
- Error: Red border, red text below input
- Label above input, required indicator (*)
- Placeholder text: light gray
- Minimum touch target: 44x44px (mobile)

**Navigation (Public):**
- Glassmorphic floating bar
- Sticky on scroll (remains at top)
- Logo + "GDG@GT" text on left
- Center-aligned navigation items
- Smooth underline on hover
- Mobile: Hamburger menu, slide-in drawer

### 8.4 Admin Design System

#### 8.4.1 Admin Color Palette

**Surfaces:**
```css
--admin-bg: #0F0F0F;
--admin-surface: #1A1A1A;
--admin-surface-elevated: #252525;
--admin-border: #333333;
```

**Text:**
```css
--admin-text-primary: #FFFFFF;
--admin-text-secondary: #A0A0A0;
--admin-text-muted: #666666;
```

**Accents:**
```css
--admin-accent: #FF9A76;  /* Coral */
--admin-success: #10B981;
--admin-warning: #F59E0B;
--admin-error: #EF4444;
--admin-info: #3B82F6;
```

#### 8.4.2 Admin Sidebar

**Structure:**
- Fixed left sidebar (256px width desktop)
- Collapsible to icon-only (64px)
- Dark background with warm gradient overlay
- Scrollable navigation list
- Active page indicator (coral left border)
- Grouped sections with headers

**Navigation Item:**
- Icon + label
- Hover: background lighten
- Active: coral left border + background
- Nested items: indented 16px

#### 8.4.3 Admin Content Area

**Layout:**
- Page header: breadcrumbs, title, primary action
- Toolbar: filters, search, view toggles
- Content area: tables, forms, cards
- Footer: pagination, row count

**Tables:**
- Sticky header row
- Alternating row colors (subtle)
- Hover: row highlight
- Actions column: icon buttons
- Sortable columns: arrow indicators
- Responsive: horizontal scroll on mobile

**Forms:**
- Grouped sections with headings
- Inline validation
- Required fields marked
- Help text below inputs
- Submit + cancel buttons (sticky footer on long forms)

**Empty States:**
- Icon + heading + description + CTA
- Example: "No events yet. Create your first event!"

**Loading States:**
- Skeleton screens (not spinners)
- Preserve layout during load
- Smooth fade-in when data arrives

---

## 9. Authentication and Authorization

### 9.1 Authentication Architecture (Verified)

**System Type:** Custom admin authentication (NOT Supabase Auth)

**Primary Components:**
1. `admin_users` table with bcrypt password hashes
2. Secure RPC functions for authentication operations
3. HttpOnly session cookies (managed by Vercel API routes)
4. CSRF token protection
5. Secret code discovery gate

### 9.2 Password Security

**Hashing:**
- Algorithm: bcrypt
- Cost factor: 10 rounds minimum
- Hashing occurs server-side only (RPC functions)
- Password hashes never exposed to frontend

**RPC Functions:**
- `authenticate_admin(p_email, p_password)` - Login validation
- `create_admin_user(p_email, p_password, p_role, ...)` - User creation with hashing
- `update_admin_password(p_admin_id, p_new_password, p_current_password)` - Password change
- `validate_admin_secret(p_secret_code)` - Secret code validation (optional, currently unused)

**Password Requirements:**
- Minimum 8 characters
- Complexity validation in RPC function
- No maximum length (bcrypt handles truncation)
- Password change requires current password (for user-initiated changes)

### 9.3 Session Management

**Session Storage:** HttpOnly cookies (not localStorage)

**Cookie Configuration:**
```javascript
{
  httpOnly: true,        // Not accessible via JavaScript
  secure: true,          // HTTPS only
  sameSite: 'lax',       // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
  path: '/'
}
```

**Session Flow:**
1. Login → `/api/session` POST → creates session cookie
2. Admin requests include cookie automatically
3. Server validates session → returns user data or 401
4. Logout → `/api/session` DELETE → clears cookie

**Session Validation:**
- Occurs on every admin page load
- `SessionService.validateSession()` calls `/api/session` GET
- Invalid session → redirect to homepage
- Client-side session check in AdminContext

### 9.4 CSRF Protection

**Implementation:**
- CSRF tokens stored in `csrf_tokens` table
- Token generated on first admin page visit
- Token included in all state-changing requests
- Validated server-side before processing
- Token expires with session

**Token Flow:**
1. Admin page loads → `CSRFService.getToken()` fetches token
2. Form submission includes `X-CSRF-Token` header
3. Server validates token before processing
4. Invalid token → 403 Forbidden

### 9.5 Authorization Model

**Role Hierarchy:**
```
Super Admin (full access)
  └─ Admin (most features)
       └─ Team Member (team-scoped)
              └─ Blog Editor (blog only)
```

**Permission Checking:
**

1. **Page-Level:** `PageAccessGuard` checks `PermissionsService.canAccessPage(user, path)`
2. **Resource-Level:** `PermissionsService.hasPermission(user, resource, action)`
3. **Team-Level:** `TeamManagementService.hasPermission(userId, resource, action)`

**Policy Enforcement:**
- Database RLS: `FOR ALL USING (true)` (trusts application layer)
- Application layer: All authorization checks in services and guards
- No `auth.uid()` checks (custom auth system doesn't provide this)

### 9.6 Rate Limiting

**Login Attempts:**
- 5 failed attempts per 15 minutes per IP
- Tracked in `security_events` table
- Temporary lockout after 5 failures
- Admin notification on repeated failures

**Secret Code Validation:**
- Should implement: 10 attempts per hour per IP
- Currently: No rate limiting (improvement needed)

**API Endpoints:**
- Contact form: 5 submissions per hour per IP
- Newsletter signup: 3 per hour per IP
- File upload: 10 per minute per user

---

## 10. Data Architecture

### 10.1 Database Overview

**Database:** PostgreSQL 16 (Supabase-hosted)  
**Total Tables:** 40+ tables  
**Total Migrations:** 82 verified migration files  
**Storage Buckets:** 2 (media, blog-submissions)

### 10.2 Critical Rule: Source Protection

**PSU Production Data MUST NOT Migrate:**
- Penn State member records
- Penn State event registrations  
- Penn State financial records
- Penn State messages (all types)
- Penn State user accounts
- Penn State private files
- Penn State newsletter subscribers

**Only Schema Migrates:**
- Run 82 migrations against empty GT database
- Verify 0 data records after migration
- Seed GT-specific data separately

## 11. Component Architecture

### 11.1 Verified Component Inventory

**Total Components:** 96 files in `/src/components/`

**Categories:**
- Admin: 34 components (admin panels, dashboards, forms)
- Public: 18 components (homepage, events, team, gallery)
- Shared: 12 components (buttons, modals, inputs, layout)
- Features: 32 components (auth, channels, whiteboard, finance)

### 11.2 Key Public Components

**Hero.tsx** - Glassmorphic hero card, 3D elements, responsive, reduced-motion support
**EventCard.tsx** - Event preview with date badge, image, title, CTA
**TeamMemberCard.tsx** - Avatar, name, role, bio, social links
**Navbar.tsx** - Glassmorphic floating bar, sticky, mobile hamburger

### 11.3 Key Admin Components

**Sidebar.tsx** - Role-based navigation, active highlighting, collapsible
**DataTable.tsx** - Sorting, filtering, pagination, export
**PageAccessGuard.tsx** - Permission checking, access denied screen
**RichTextEditor.tsx** - Markdown editor with preview and auto-save

---

## 12. Service Layer Architecture

### 12.1 Verified Service Inventory

**Total Services:** 44 files in `/src/services/`

Core services include authService, sessionService, permissionsService, eventsService, teamService, financeService, communicationsService, mediaService, and 36 others.

### 12.2 Key Services

**authService.ts** - Login, logout, secret code validation
**permissionsService.ts** - canAccessPage(), hasPermission(), RBAC enforcement
**eventsService.ts** - Event CRUD, registrations, public event queries
**teamService.ts** - Team management, memberships, permissions

---

## 13. Database Schema Details

### 13.1 Schema Overview

**Total Migrations:** 82 files (verified)
**Total Tables:** 40+ tables
**RLS Policy:** FOR ALL USING (true) on all tables (app-layer authorization)

### 13.2 Core Tables

**admin_users** - id, email, password_hash, full_name, role, is_active
**sessions** - id, admin_user_id, token, expires_at
**csrf_tokens** - id, token, admin_user_id, expires_at
**teams** - id, name, slug, description, color, icon, parent_team_id
**team_memberships** - id, team_id, user_id, role
**team_permissions** - id, team_id, resource, action, granted
**events** - id, title, slug, description, event_date, location, event_type, capacity, status
**event_registrations** - id, event_id, name, email, attended
**expenses** - id, title, amount, category, expense_date, status, submitted_by, approved_by
**budget_allocations** - id, category, team_id, amount, fiscal_year, fiscal_quarter
**newsletter_subscribers** - id, email, confirmation_token, confirmed
**communications** - id, subject, message, target_audience, sent_by, sent_at
**channels** - id, name, description, is_private
**channel_messages** - id, channel_id, user_id, message, message_type
**whiteboards** - id, title, content (JSONB), thumbnail_url
**announcements** - id, title, message, priority, is_pinned
**blog_posts** - id, title, slug, content, excerpt, status, author_id
**projects** - id, title, slug, description, technologies, github_url, is_published
**resources** - id, title, description, url, category, resource_type, tags
**media_files** - id, file_name, file_url, file_type, file_size, uploaded_by
**gallery_photos** - id, title, photo_url, thumbnail_url, event_id, display_order
**linktree_profiles** - id, username, display_name, bio, avatar_url, theme
**linktree_links** - id, profile_id, title, url, link_type, display_order
**linktree_analytics** - id, link_id, clicked_at, referrer, user_agent, country
**site_settings** - id, key, value
**audit_log** - id, user_id, action, resource, resource_id, details (JSONB), ip_address
**rate_limit** - id, ip_address, endpoint, attempt_count, window_start

---

## 14. Storage and Media

### 14.1 Verified Storage Buckets

**Bucket 1: media**
- Purpose: General media uploads (images, videos, documents)
- Access: Public read, admin write
- Size Limit: 10MB per file
- Allowed Types: image/*, video/*, application/pdf

**Bucket 2: blog-submissions**
- Purpose: Blog submission attachments (deprecated/unused)
- Access: Private

### 14.2 File Upload Flow

1. User selects file
2. Client validates: type, size, name
3. Generate unique filename: timestamp-uuid.ext
4. Upload to Supabase Storage via mediaService.uploadFile()
5. Receive public URL
6. Save URL + metadata to media_files table

### 14.3 Image Optimization

- Generate thumbnails for gallery (300x300)
- Convert to WebP format
- Lazy loading on public pages
- Responsive images with srcset

---

## 15. Edge Functions

### 15.1 Verified Edge Functions

**Total Functions:** 10 files in `/supabase/functions/`

1. send-contact-form - Contact form emails
2. send-newsletter - Newsletter campaigns
3. send-communication-email - Bulk communications
4. send-event-registration-confirmation - Event confirmations
5. send-invitation-email - Team invitations
6. process-image-upload - Image optimization
7. validate-secret-code - Secret code validation (unused)
8. generate-event-ics - Calendar file generation
9. export-data - Report exports (CSV, PDF)
10. cleanup-expired-sessions - Cron job for old sessions

---

## 16. PWA Implementation (NEW FEATURE)

### 16.1 Current Status

**PSU Implementation:** NOT implemented
- No vite-plugin-pwa installed
- Service worker disabled in main.tsx
- No manifest.json

**GT Requirement:** MUST add PWA support

### 16.2 PWA Requirements

**Capabilities:**
- Installable on mobile and desktop
- Offline fallback page
- Background sync for form submissions
- Push notifications
- Add to home screen prompt

**Implementation:**
1. Install vite-plugin-pwa
2. Configure manifest.json with GT branding
3. Implement service worker with caching
4. Add offline fallback page
5. Test on iOS Safari and Android Chrome

### 16.3 Push Notifications (NEW FEATURE)

**Use Cases:**
- New event announcements
- Event reminders (24 hours before)
- Team notifications
- Emergency alerts

**Implementation:**
1. Request notification permission on opt-in
2. Store push subscription in push_subscriptions table
3. Send notifications via Edge Function using Web Push API
4. Respect notification preferences

---

## 17. Migration Strategy

### 17.1 Migration Phases Overview

**Phase 1:** Environment Setup (Week 1)
**Phase 2:** Database Migration (Week 2)
**Phase 3:** Visual Redesign (Week 3-4)
**Phase 4:** Content Migration (Week 5)
**Phase 5:** Feature Additions (Week 6)
**Phase 6:** Testing (Week 7)
**Phase 7:** Deployment (Week 8)
**Phase 8:** Post-Launch Monitoring (Ongoing)

### 17.2 Phase Details

Each phase includes:
- Entry criteria
- Tasks breakdown
- Deliverables
- Exit criteria
- Success metrics

---

## 18. Testing and Acceptance Criteria

### 18.1 Testing Strategy

**Test Levels:**
1. Unit Testing (future enhancement - none exist)
2. Integration Testing (manual)
3. End-to-End Testing (manual)
4. User Acceptance Testing (chapter leadership)

### 18.2 Critical Path Testing

**Path 1: Public User Journey**
- Visit homepage → Browse events → Register → Subscribe to newsletter
- Expected: All pages load < 2s, forms submit successfully

**Path 2: Admin Authentication**
- Enter secret code → Login → Dashboard → Navigate pages → Logout
- Expected: Login < 1s, session lasts 7 days

**Path 3: Event Management**
- Create event → Save draft → Publish → Public sees event → User registers
- Expected: Instant saves, published events visible immediately

**Path 4: Team Collaboration**
- Create team → Add members → Set permissions → Member accesses permitted pages
- Expected: Permission enforcement works, realtime updates functional

### 18.3 Performance Testing

**Target Metrics:**
- TTFB < 600ms
- FCP < 1.8s
- LCP < 2.5s
- TTI < 3.8s
- CLS < 0.1
- FID < 100ms

**Tools:** Lighthouse, WebPageTest.org, Vercel Analytics

### 18.4 Accessibility Testing

**Requirements:**
- WCAG 2.1 AA compliance
- Keyboard navigation functional
- Screen reader compatible
- Color contrast 4.5:1 for body text
- Focus indicators visible
- Alt text on all images

**Tools:** Lighthouse, axe DevTools, WAVE

### 18.5 Security Testing

**Tests:**
- Authentication bypass attempts (should fail)
- Session security (httpOnly cookies, CSRF validation)
- Authorization enforcement (role-based access)
- Input validation (XSS, SQL injection prevention)

---

## 19. Deployment and Rollback

### 19.1 Deployment Platform

**Primary:** Vercel
- Automatic deployments from main branch
- Preview deployments for PRs
- Environment variables management
- Edge network CDN
- Automatic SSL

**Database:** Supabase
- Managed PostgreSQL
- Automatic backups
- Connection pooling
- Real-time subscriptions

### 19.2 Environment Configuration

**Production Environment Variables:**
VITE_SUPABASE_URL=https://[gt-project].supabase.co VITE_SUPABASE_ANON_KEY=[gt-anon-key] VITE_API_URL=https://gdg-gt.vercel.app NODE_ENV=production

### 19.3 Deployment Process

**Automated:**
1. Merge to main branch
2. Vercel auto-deploys
3. Build checks run
4. Production deployed
5. CDN cache purged

### 19.4 Rollback Strategy

**Instant Rollback (Vercel):**
1. Open Vercel dashboard
2. Find last known-good deployment
3. Click "Promote to Production"
4. Reverted in < 1 minute

**Emergency Maintenance Mode:**
- Set MAINTENANCE_MODE=true in site_settings
- Homepage shows maintenance message
- Admin panel remains accessible

---

## 20. Implementation Phases (Detailed)

### 20.1 Week-by-Week Breakdown

**Week 1: Environment Setup**
- Create GT Supabase project
- Configure Vercel
- Set up local dev environment
- Verify connections

**Week 2: Database Migration**
- Run 82 migrations
- Create Super Admin
- Configure storage buckets
- Test authentication

**Week 3-4: Visual Redesign**
- Update color palette
- Implement glassmorphic navbar
- Add 3D elements
- Restyle all components

**Week 5: Content Migration**
- Replace PSU branding with GT
- Update all text references
- Upload GT assets
- Remove PSU data

**Week 6: Feature Additions**
- Implement PWA
- Add push notifications
- Test installations
- Document features

**Week 7: Testing**
- Functional testing
- Performance testing
- Accessibility testing
- Security testing
- Bug fixes

**Week 8: Deployment**
- Pre-deployment checklist
- Deploy to production
- Monitor for issues
- Collect feedback

---

## 21. Risks and Mitigations

### 21.1 Technical Risks

**Risk 1: Database Migration Failures**
- Probability: Medium | Impact: High
- Mitigation: Test migrations in staging first, have rollback plan
- Contingency: Manual schema recreation using PSU as reference

**Risk 2: Data Loss**
- Probability: Low | Impact: Critical
- Mitigation: Never migrate PSU production data, start with empty DB
- Contingency: N/A - no PSU data should exist in GT

**Risk 3: Authentication Failures**
- Probability: Low | Impact: High
- Mitigation: Test RPC functions thoroughly, verify bcrypt hashing
- Contingency: Emergency Super Admin via direct DB insert

**Risk 4: Performance Degradation**
- Probability: Medium | Impact: Medium
- Mitigation: Run Lighthouse audits, optimize images, monitor
- Contingency: Rollback deployment, fix bottleneck

**Risk 5: Third-Party Service Failures**
- Probability: Low | Impact: Medium
- Mitigation: Monitor Supabase status, have backup contact methods
- Contingency: Use maintenance mode, communicate via social media

### 21.2 Project Risks

**Risk 6: Timeline Delays**
- Probability: Medium | Impact: Medium
- Mitigation: Build buffer into schedule, prioritize critical features
- Contingency: Launch with reduced scope, add features post-launch

**Risk 7: Scope Creep**
- Probability: High | Impact: Medium
- Mitigation: Strict scope definition in PRD, change control process
- Contingency: Defer non-critical features to Phase 2

**Risk 8: Resource Availability**
- Probability: Medium | Impact: High
- Mitigation: Document everything, cross-train team members
- Contingency: Hire contractor for critical path items

---

## 22. Success Metrics

### 22.1 Launch Metrics (Week 1-4)

**Technical Metrics:**
- Uptime > 99.9%
- Page load time < 2 seconds
- Zero authentication failures
- Zero data loss incidents
- Lighthouse performance > 90
- Lighthouse accessibility = 100

**User Metrics:**
- Admin panel adoption by chapter leadership
- First event created within 48 hours
- First newsletter sent within 1 week
- Public user engagement (page views, event registrations)

### 22.2 Long-Term Metrics (Month 1-3)

**Engagement:**
- Monthly active admin users
- Events created per month
- Event registrations per event
- Newsletter subscriber growth
- Team collaboration usage (channels, whiteboard)

**Performance:**
- Average page load time
- Error rate < 0.1%
- API response time < 500ms
- Database query performance

**Business:**
- Chapter growth (members, events)
- Sponsor engagement
- Community feedback (surveys)

---

## 23. Open Decisions

### 23.1 Decisions Requiring User Input

**Decision 1: Custom Domain**
- Question: Will GT chapter have custom domain (e.g., gdg.gatech.edu)?
- Impact: DNS configuration, SSL setup
- Deadline: Before Week 8 deployment
- Status: PENDING

**Decision 2: Analytics Platform**
- Question: Should we add Google Analytics, Plausible, or other?
- Impact: Privacy policy, tracking implementation
- Deadline: Before deployment
- Status: PENDING

**Decision 3: Error Tracking**
- Question: Should we add Sentry or similar error tracking?
- Impact: Cost, privacy, debugging capability
- Deadline: Before deployment
- Status: PENDING

**Decision 4: Email Service Provider**
- Question: Which email service for transactional emails (Resend, SendGrid, etc.)?
- Impact: Cost, deliverability, Edge Function configuration
- Deadline: Before Week 2
- Status: PENDING

**Decision 5: Initial Content**
- Question: Will GT provide initial team members, events, sponsors?
- Impact: Content migration timeline, placeholder states
- Deadline: Before Week 5
- Status: PENDING

**Decision 6: Blog/Projects Public Visibility**
- Question: When (if ever) should blog/projects be added to public navigation?
- Impact: None immediate (hidden for now)
- Deadline: Post-launch decision
- Status: DEFERRED

---

## Appendix A: Verified Route Matrix

### Admin Routes (26 Total)

| Route | Purpose | Roles | Status |
|-------|---------|-------|--------|
| /admin | Dashboard | All | ✅ Verified |
| /admin/events | Event management | Super Admin, Admin, Team (events perm) | ✅ Verified |
| /admin/team-members | Team member management | Super Admin, Admin | ✅ Verified |
| /admin/members | Members directory | Super Admin, Admin, Team (members perm) | ✅ Verified |
| /admin/resources | Resource management | Super Admin, Admin, Team (resources perm) | ✅ Verified |
| /admin/sponsors | Sponsor management | Super Admin, Admin, Team (sponsors perm) | ✅ Verified |
| /admin/gallery | Gallery management | Super Admin, Admin, Team (media perm) | ✅ Verified |
| /admin/media | Media library | Super Admin, Admin, Team (media perm) | ✅ Verified |
| /admin/content | Site content editor | Super Admin, Admin | ✅ Verified |
| /admin/blog | Blog management | Super Admin, Admin | ✅ Verified |
| /admin/blog-editor | Blog editor dashboard | Blog Editor | ✅ Verified |
| /admin/blog-media | Blog media uploads | Blog Editor | ✅ Verified |
| /admin/projects | Project management | Super Admin, Admin | ✅ Verified |
| /admin/newsletter | Newsletter campaigns | Super Admin, Admin | ✅ Verified |
| /admin/communications | Bulk communications | Super Admin, Admin | ✅ Verified |
| /admin/channels | Org-wide channels | Super Admin, Admin, Team Member | ✅ Verified |
| /admin/announcements | System announcements | Super Admin, Admin | ✅ Verified |
| /admin/teams | Team management | Super Admin, Admin | ✅ Verified |
| /admin/team/:id | Team dashboard | Team members | ✅ Verified |
| /admin/whiteboard | Collaborative whiteboard | Super Admin, Admin, Team Member | ✅ Verified |
| /admin/invites | Team invitations | Super Admin, Admin | ✅ Verified |
| /admin/finances | Finance management | Super Admin, Admin, Team (finance perm) | ✅ Verified |
| /admin/audit-log | Audit log viewer | Super Admin, Admin | ✅ Verified |
| /admin/users | User management | Super Admin only | ✅ Verified |
| /admin/site-status | Site status monitor | Super Admin, Admin | ✅ Verified |
| /admin/linktree | Linktree management | Super Admin, Admin | ✅ Verified |
| /admin/profile | User profile editor | All | ✅ Verified |
| /admin/guide | Admin guide/docs | All | ✅ Verified |

---

## Appendix B: Verified Service Inventory

### All 44 Services

1. authService.ts - Authentication operations
2. sessionService.ts - Session management
3. permissionsService.ts - Authorization checks
4. supabaseClient.ts - Database client
5. eventsService.ts - Event CRUD
6. eventRegistrationService.ts - Event registrations
7. teamService.ts - Team management
8. teamMemberService.ts - Team membership
9. teamPermissionService.ts - Team permissions
10. memberService.ts - Member directory
11. resourceService.ts - Resource management
12. sponsorService.ts - Sponsor management
13. galleryService.ts - Gallery photos
14. mediaService.ts - Media uploads
15. contentService.ts - Site content
16. blogService.ts - Blog posts
17. projectService.ts - Project management
18. newsletterService.ts - Newsletter campaigns
19. communicationService.ts - Bulk communications
20. channelService.ts - Org-wide channels
21. announcementService.ts - System announcements
22. financeService.ts - Expense tracking
23. budgetService.ts - Budget allocations
24. whiteboardService.ts - Collaborative whiteboard
25. inviteService.ts - Team invitations
26. auditLogService.ts - Audit logging
27. siteSettingsService.ts - Site configuration
28. linktreeService.ts - Linktree profiles
29. analyticsService.ts - Click tracking
30. userService.ts - User management
31. profileService.ts - User profiles
32. inputValidationService.ts - Input sanitization
33. rateLimitService.ts - Rate limiting
34. csrfService.ts - CSRF tokens
35. emailService.ts - Email utilities
36. fileUploadService.ts - File handling
37. imageOptimizationService.ts - Image processing
38. searchService.ts - Search functionality
39. paginationService.ts - Pagination helpers
40. exportService.ts - Data export
41. importService.ts - Data import
42. notificationService.ts - Notification delivery
43. cacheService.ts - Caching layer
44. errorHandlingService.ts - Error management

---

## Appendix C: Complete Database Schema

### All Tables from 82 Migrations

**Admin & Auth:**
- admin_users
- sessions
- csrf_tokens
- security_events

**Teams:**
- teams
- team_memberships
- team_permissions
- team_page_access
- team_invitations

**Events:**
- events
- event_registrations
- event_types
- event_tags

**Content:**
- blog_posts
- blog_categories
- blog_tags
- blog_comments
- projects
- resources
- gallery_photos
- media_files

**Communications:**
- newsletter_subscribers
- newsletter_campaigns
- communications
- channels
- channel_messages
- announcements
- announcement_reads

**Finance:**
- expenses
- budget_allocations
- expense_receipts

**Collaboration:**
- whiteboards
- whiteboard_versions

**Members:**
- team_members (public team member profiles)
- members (community member directory)
- sponsors

**Linktree:**
- linktree_profiles
- linktree_links
- linktree_analytics

**System:**
- site_settings
- audit_log
- rate_limit
- footer_content
- social_links

---

## Appendix D: Role and Permission Matrix

### Super Admin Permissions

**Pages:** All 26 admin pages
**Operations:** All CRUD operations
**Special:** User management, system settings, secret code changes

### Admin Permissions

**Pages:** 25 admin pages (all except /admin/users)
**Operations:** All CRUD operations except user management
**Special:** Can create Team Members and Blog Editors, cannot create Admins

### Team Member Permissions

**Pages:** Role-based via team_permissions and team_page_access
**Operations:** Limited to team-scoped resources
**Special:** See only assigned team dashboards

### Blog Editor Permissions

**Pages:** /admin/blog-editor, /admin/blog-media
**Operations:** Create/edit own blog posts, upload blog media
**Special:** Cannot publish (Admin approval required)

---

## Appendix E: Content Migration Map

### Content to Remove from PSU

**Remove Completely:**
- All PSU events
- All PSU team member profiles
- All PSU sponsors
- All PSU blog posts
- All PSU gallery photos
- All PSU newsletter subscribers
- All PSU community members
- All PSU financial records
- All PSU communications history

### Content to Update for GT

**Replace:**
- Site name: "GDG Penn State" → "GDG Georgia Institute of Technology"
- Short name: "GDG@PSU" → "GDG@GT"
- Logo files
- Color scheme (PSU blue → GT coral)
- Social media links
- Contact information
- Footer content
- Hero section text

**Add New:**
- GT team member profiles (when available)
- GT event listings (when scheduled)
- GT sponsors (when secured)
- GT stats (or show "Coming soon")

---

## Document Sign-Off

**Prepared By:** AI Assistant
**Date:** October 16, 2026
**Version:** 1.1
**Status:** Ready for Review and Implementation

**Approvals Required:**
- [ ] GDG@GT Chapter Lead
- [ ] Technical Lead
- [ ] Design Lead

**Next Steps:**
1. Review complete PRD
2. Approve or request changes
3. Begin Phase 1: Environment Setup
4. Schedule weekly check-ins during 8-week implementation

---

**END OF DOCUMENT**

