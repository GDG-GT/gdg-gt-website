# Pages Transformation Plan
**GDG@GT Website Redesign - Section-by-Section Breakdown**

*Date: October 16, 2026*

---

## Overview

This document maps how **each existing page from GDG PSU** will be transformed with the **Image 2 (Playful Warm) design aesthetic**. All pages are kept, all admin functionality preserved, only blog/projects UI removed.

---

## Public Pages (8 pages)

### 1. Home Page (`/`)

**Current State (GDG PSU):**
- Hero with gradient background
- Animated shapes
- CTA buttons
- Stats section
- Upcoming events preview
- Partners/sponsors grid
- Newsletter signup

**New Design (Image 2 Aesthetic):**

**Hero Section:**
- **Background**: Warm peach-to-coral gradient (`#FFE5B3 → #FF8366`)
- **3D Elements**: Spline scene with:
  - Floating donut with sprinkles (top right)
  - Jelly blob (bottom left)
  - Small crystal (mid-right)
  - Subtle confetti particles (static, decorative)
- **Title**: "Google Developer Groups" with multi-color gradient per letter:
  - "Google" = Blue/Red/Yellow/Green (official colors)
  - "Developer Groups" = Warm coral gradient
- **Glassmorphic card** overlaying 3D scene containing:
  - Headline: "Building the future together at Georgia Tech"
  - Subtext
  - Two CTAs: "Upcoming Events" (solid coral gradient) + "Join Us" (outline)
- **Scroll indicator**: Animated arrow with gentle bounce

**Stats Section:**
- Four glassmorphic cards (hover lift effect)
- Icons with warm gradient fills
- Animated counters on scroll-in
- Metrics: Members, Events, Projects, Years

**Upcoming Events Preview:**
- Horizontal scroll carousel (mobile) / Grid (desktop)
- Event cards with:
  - Background: White with subtle peach glow on hover
  - Image lazy-loaded with WebP
  - Glassmorphic date badge (top-left corner)
  - Hover: Lift + shadow increase + slight scale
- "View All Events" CTA button

**Partners Section:**
- Glassmorphic container
- Partner logos in grid
- Grayscale default → Color on hover
- Smooth transition

**Newsletter Signup:**
- Inline form with glassmorphic input
- Submit button with gradient fill
- Success state triggers confetti burst

---

### 2. Events Page (`/events`)

**Current State:**
- Filter bar (upcoming/past)
- Event cards grid
- Calendar view option
- Event detail modal

**New Design:**

**Hero Section:**
- Warm gradient background (lighter than home)
- Title: "Events" with gradient underline animation
- Filter pills: Glassmorphic toggles (All / Upcoming / Past / Workshops / Talks)

**Event Cards Grid:**
- **Card Design** (Glassmorphic elevated):
  - White background with subtle peach tint
  - Top: Event banner image (16:9 ratio, lazy-loaded)
  - Glassmorphic date badge (positioned over image, top-left)
  - Title (bold, #2D2D2D)
  - Date/time with clock icon (coral gradient)
  - Location with pin icon (coral gradient)
  - Tag pills (glassmorphic, color-coded by category)
  - "Register" button (gradient fill, hover scale)
  
- **Grid Layout:**
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: 1 column

- **Scroll Animation:**
  - Cards fade-in from bottom (stagger 100ms)
  - Only animate once (viewport: { once: true })

**Empty State:**
- Illustration with warm colors
- "No events found" message
- CTA: "Suggest an event idea"

---

### 3. Team Page (`/team`)

**Current State:**
- Team member cards
- Filter by role (Leads, Core, Members)
- Social links

**New Design:**

**Hero:**
- Warm gradient background
- Title: "Our Team" (gradient text)
- Subtext: "The amazing people behind GDG@GT"

**Role Sections:**
- **Navigation Tabs**: Glassmorphic pills (All / Leads / Core Team / Members)
- Smooth transition between sections

**Team Member Cards:**
- **Design:**
  - Circular avatar with coral gradient border (2px)
  - Name (bold)
  - Role/title (coral color)
  - Bio snippet (2 lines max)
  - Social icons (GitHub, LinkedIn, Twitter) - glassmorphic circles
  - Hover: Card lifts, avatar scales slightly

- **Layout:**
  - Desktop: 4 columns
  - Tablet: 3 columns
  - Mobile: 2 columns

- **Animation:**
  - Stagger fade-in on scroll
  - Hover: Smooth lift with shadow

**Search/Filter:**
- Search bar (glassmorphic input)
- Real-time filtering
- No results state

---

### 4. Gallery Page (`/gallery`)

**Current State:**
- Photo grid
- Lightbox viewer
- Filter by event

**New Design:**

**Hero:**
- Warm gradient background
- Title: "Gallery" (gradient text)
- Filter dropdown (glassmorphic)

**Photo Grid:**
- **Masonry layout** (Pinterest-style, dynamic heights)
- **Photo Card:**
  - Image (lazy-loaded, WebP format)
  - Glassmorphic overlay on hover with:
    - Event name
    - Date
    - View icon
  - Hover: Image zooms (scale 1.1), overlay fades in

- **Lightbox Modal:**
  - Full-screen overlay (dark with backdrop-blur)
  - Image centered
  - Navigation arrows (left/right)
  - Close button (top-right)
  - ESC key support
  - Swipe gestures on mobile

**Load More:**
- Infinite scroll OR
- "Load More" button (coral gradient)
- Skeleton loaders while fetching

---

### 5. Resources Page (`/resources`)

**Current State:**
- Resource cards (links, guides, tools)
- Categories

**New Design:**

**Hero:**
- Warm gradient
- Title: "Resources" (gradient text)
- Subtext: "Curated learning materials and tools"

**Category Sections:**
- **Tabs**: Learning Paths / Tools / Documentation / Templates
- Each section has its own grid

**Resource Cards:**
- **Design:**
  - Icon/thumbnail (top)
  - Title (bold)
  - Description (2-3 lines)
  - Category tag (glassmorphic pill)
  - "View" CTA button or external link icon
  - Hover: Lift + shadow

- **Layout:**
  - Desktop: 3 columns
  - Tablet: 2 columns
  - Mobile: 1 column

**Search:**
- Glassmorphic search bar
- Real-time filtering
- Fuzzy search support

---

### 6. Sponsors Page (`/sponsors`)

**Current State:**
- Sponsor tiers (Platinum, Gold, Silver, Bronze)
- Logos with links

**New Design:**

**Hero:**
- Warm gradient
- Title: "Our Sponsors" (gradient text)
- Subtext: "Thank you to our amazing partners"

**Sponsor Tiers:**
- **Tier Cards** (glassmorphic sections):
  - Tier badge (Platinum = large, shiny effect)
  - Company logos in grid
  - Each logo in glassmorphic card
  - Grayscale → Color on hover
  - Click to external website

- **Layout:**
  - Platinum: 2 columns (largest size)
  - Gold: 3 columns
  - Silver: 4 columns
  - Bronze: 5 columns

**CTA Section:**
- "Become a Sponsor" glassmorphic card
- Gradient button → Opens contact form/email

---

### 7. Contact Page (`/contact`)

**Current State:**
- Contact form
- Social links
- Email/location info

**New Design:**

**Hero:**
- Warm gradient background
- Title: "Get in Touch" (gradient text)

**Two-Column Layout:**

**Left: Contact Form (Glassmorphic card)**
- Fields:
  - Name (glassmorphic input)
  - Email (glassmorphic input)
  - Subject (glassmorphic input)
  - Message (glassmorphic textarea)
  - Submit button (coral gradient)
- Validation states (inline errors)
- Success state: Confetti burst + Success message

**Right: Contact Info**
- **Glassmorphic card** with:
  - Email (coral icon + link)
  - Social links (glassmorphic icon circles)
    - Discord
    - Instagram
    - LinkedIn
    - Twitter/X
    - GitHub
  - Location (if applicable)
  - Office hours (if applicable)

**Map Section** (Optional):
- Embedded Google Maps with custom styling (warm theme)
- Glassmorphic overlay with pin info

---

### 8. About Page (`/about`) (If exists)

**New Design:**

**Hero:**
- Warm gradient
- Title: "About GDG@GT" (gradient text)

**Mission Section:**
- Large glassmorphic card
- Mission statement (large text)
- Supporting paragraph

**History Timeline:**
- Vertical timeline with glassmorphic cards
- Year markers (coral gradient circles)
- Key milestones
- Scroll-triggered fade-in

**Values Section:**
- Grid of value cards (3 columns)
- Icon + Title + Description
- Glassmorphic design
- Hover lift

---

## Admin Panel (26 pages - ALL PRESERVED)

### Overview
**Design Strategy:**
- Keep ALL existing functionality (finances, linktree, team tools, whiteboards, channels, audit logs)
- Update visual theme to match warm aesthetic
- Glassmorphic sidebars and cards
- Maintain dark mode option (existing feature)

### Admin Theme Updates

**Sidebar:**
- Background: Dark with warm accent
- Active item: Coral gradient left border
- Icons: Coral on hover
- Glassmorphic effect on hover

**Dashboard Cards:**
- White background (light mode) / Dark gray (dark mode)
- Subtle peach glow on hover
- Coral gradient for primary actions
- Stats use gradient fills

**Tables:**
- Glassmorphic row hover
- Coral gradient for action buttons
- Striped rows with warm tint

**Forms:**
- Glassmorphic inputs (same as public pages)
- Coral gradient submit buttons
- Inline validation with warm colors

**Charts/Graphs:**
- Warm color palette for data visualization
- Peach/coral gradient fills
- Accessible color contrast

### Specific Admin Pages (No structural changes, theme only)

1. **Dashboard** - Stats cards with warm gradients
2. **Finances** - Table with coral accents, glassmorphic cards
3. **Linktree** - Drag-drop interface with warm theme
4. **Team Management** - Member cards match public team page style
5. **Whiteboards** - Canvas with warm UI controls
6. **Channels** - Chat interface with glassmorphic message bubbles
7. **Audit Logs** - Table with warm accents
8. **Event Management** - Form with glassmorphic inputs
9. **Gallery Upload** - Drag-drop with warm progress bars
10. **Resources Management** - CRUD interface with warm theme
11. **Sponsors Management** - Tier cards with warm accents
12. **User Management** - Table with glassmorphic filters
13. **Settings** - Form sections with warm theme
14. **Analytics** - Charts with warm color palette
15. **Notifications** - Toast notifications with glassmorphic design
16. **Calendar** - Calendar grid with coral highlights
17. **Tasks** - Kanban board with glassmorphic cards
18. **Projects** - Keep database, remove public UI
19. **Blog** - Keep database, remove public UI
20. **Email Templates** - Editor with warm UI
21. **Permissions** - Table with warm accents
22. **Integrations** - Card grid with warm theme
23. **Backup/Restore** - Interface with coral CTAs
24. **API Keys** - List with glassmorphic cards
25. **Webhooks** - Table with warm accents
26. **System Logs** - Filtered logs with warm UI

---

## Pages to Remove (UI Only)

### 1. Blog Page (`/blog`)
- **Action**: Remove public-facing UI
- **Database**: Keep `posts`, `post_categories`, `post_tags` tables intact
- **Reason**: Can be re-enabled later if needed
- **Admin**: Keep admin blog management panel

### 2. Projects Page (`/projects`)
- **Action**: Remove public-facing UI
- **Database**: Keep `projects`, `project_members` tables intact
- **Reason**: Can be re-enabled later if needed
- **Admin**: Keep admin projects panel

### 3. Projects Detail Page (`/projects/:id`)
- **Action**: Remove (part of projects removal)

---

## New Page Ideas (Optional, Future)

### 1. Careers/Opportunities Page
- Internship listings
- Project opportunities
- Partnership opportunities

### 2. Merch Store (if applicable)
- GDG@GT branded merchandise
- Integration with external store

### 3. Podcast/Media Page (if content exists)
- Video recordings
- Podcast episodes
- YouTube embeds

---

## Navigation Structure

### Public Navigation (Top Nav)
```
Logo (left) | Home | Events | Team | Gallery | Resources | Sponsors | Contact | [Login] (right)
```

**Mobile:**
- Hamburger menu (glassmorphic overlay)
- Smooth slide-in animation

### Admin Navigation (Sidebar)
```
Dashboard
---
Events
Team
Gallery
Resources
Sponsors
Messages
---
Finances
Linktree
Tools
---
Settings
```

---

## Footer (All Pages)

**Design:**
- Dark background with warm gradient overlay
- Three-column layout (desktop) / Stacked (mobile)

**Columns:**
1. **About**
   - Logo + short description
   - Social icons (glassmorphic circles)

2. **Quick Links**
   - Events
   - Team
   - Resources
   - Contact

3. **Connect**
   - Newsletter signup (inline form)
   - Contact email
   - Location (if applicable)

**Bottom Bar:**
- Copyright © 2026 GDG@GT
- Privacy Policy | Terms of Service
- "Made with ❤️ by GDG@GT Team"

---

## Responsive Breakpoints

```css
/* Tailwind default breakpoints */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

**Design Adjustments:**
- **Mobile (<768px):**
  - Single column layouts
  - Simplified 3D (static images)
  - No parallax effects
  - Larger touch targets (min 44x44px)

- **Tablet (768px-1024px):**
  - 2-column grids
  - Reduced 3D complexity
  - Simplified animations

- **Desktop (>1024px):**
  - Full 3D scenes
  - Parallax effects
  - Multi-column layouts
  - Advanced animations

---

## Animation Inventory (Per Page)

### Home Page
- ✅ Hero 3D scene (Spline)
- ✅ Confetti on newsletter signup
- ✅ Scroll-triggered fade-ins (stats, events, partners)
- ✅ Parallax background (hero)
- ✅ Hover lifts (event cards, partner logos)
- ✅ Gradient text animation (hero title)

### Events Page
- ✅ Stagger fade-in (event cards)
- ✅ Hover lift (cards)
- ✅ Filter transition (smooth swap)
- ✅ Skeleton loaders

### Team Page
- ✅ Stagger fade-in (member cards)
- ✅ Hover lift + avatar scale
- ✅ Tab transition (role filter)

### Gallery Page
- ✅ Image zoom on hover
- ✅ Lightbox fade-in
- ✅ Infinite scroll loading

### Resources Page
- ✅ Card hover lift
- ✅ Search filter animation

### Sponsors Page
- ✅ Logo grayscale → color
- ✅ Tier section fade-in

### Contact Page
- ✅ Form validation animations
- ✅ Success confetti
- ✅ Input focus states

### Admin Panel
- ✅ Sidebar collapse/expand
- ✅ Table row hover
- ✅ Toast notifications
- ✅ Chart animations (on load)

---

## Performance Budget (Per Page)

| Page | JS Bundle | Images | Total Load | Target FCP |
|------|-----------|--------|------------|------------|
| **Home** | <150KB | <500KB | <800KB | <1.5s |
| **Events** | <100KB | <300KB | <500KB | <1.2s |
| **Team** | <80KB | <400KB | <550KB | <1.2s |
| **Gallery** | <100KB | <1MB* | <1.2MB | <2s |
| **Resources** | <70KB | <200KB | <350KB | <1s |
| **Sponsors** | <60KB | <300KB | <400KB | <1s |
| **Contact** | <80KB | <100KB | <200KB | <1s |
| **Admin** | <200KB | <200KB | <500KB | <2s |

*Gallery uses infinite scroll, loads in batches

---

## Accessibility Checklist (All Pages)

- ✅ Keyboard navigation (Tab, Enter, Esc)
- ✅ Focus indicators (visible, high contrast)
- ✅ Screen reader support (semantic HTML, ARIA labels)
- ✅ Color contrast (WCAG AA minimum, AAA target)
- ✅ `prefers-reduced-motion` respected
- ✅ Skip to main content link
- ✅ Alt text for all images
- ✅ Form labels properly associated
- ✅ Error messages descriptive and accessible
- ✅ Responsive text (min 16px body, scalable)

---

## SEO Strategy (Public Pages)

### Meta Tags (All Pages)
```html
<title>Page Title | GDG@GT - Georgia Tech</title>
<meta name="description" content="Page description (150-160 chars)" />
<meta property="og:title" content="Page Title" />
<meta property="og:description" content="Description" />
<meta property="og:image" content="https://gdggt.com/og-image.png" />
<meta property="og:url" content="https://gdggt.com/page" />
<meta name="twitter:card" content="summary_large_image" />
```

### Structured Data (JSON-LD)

**Organization Schema:**
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Google Developer Groups at Georgia Tech",
  "url": "https://gdggt.com",
  "logo": "https://gdggt.com/logo.png",
  "sameAs": [
    "https://twitter.com/gdggt",
    "https://instagram.com/gdggt",
    "https://linkedin.com/company/gdggt"
  ]
}
```

**Event Schema (Events Page):**
```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Event Name",
  "startDate": "2026-11-01T18:00",
  "location": {
    "@type": "Place",
    "name": "Georgia Tech",
    "address": "Atlanta, GA"
  }
}
```

---

## Conclusion

**Summary:**
- ✅ **8 public pages** redesigned with Image 2 aesthetic
- ✅ **26 admin pages** preserved with theme updates
- ✅ **2 pages** removed from public (blog, projects) - databases kept
- ✅ All animations, colors, and interactions mapped
- ✅ Performance budgets defined
- ✅ Accessibility and SEO strategies outlined

**Ready for:** Component-level design and implementation planning.

