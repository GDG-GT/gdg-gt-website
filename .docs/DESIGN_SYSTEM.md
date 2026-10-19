# GDG@GT Design System
**Complete Design Specification - Ready for Implementation**

*Date: October 17, 2026*  
*Status: APPROVED*

---

## 🎨 Design Direction

**Aesthetic:** Playful, warm, professional  
**Inspiration:** Original Image 2 mockups - warm peach/coral gradient with playful 3D elements  
**Target:** University tech community (students, professionals, approachable yet credible)

---

## 🌈 Color System

### Primary Colors
```css
--peach-50: #FFF8F0;      /* Lightest backgrounds */
--peach-100: #FFE5B3;     /* Light peach */
--peach-200: #FFD699;     /* */
--peach-300: #FFC093;     /* Soft peach */
--peach-400: #FFAA7A;     /* */
--peach-500: #FF9A76;     /* PRIMARY - Main brand color */
--peach-600: #FF8366;     /* Coral */
--peach-700: #F88377;     /* Coral pink */
--peach-800: #E6705F;     /* */
--peach-900: #CC5244;     /* Darkest */
```

### Google Brand Colors (for "Google" text)
```css
--google-blue: #4285F4;
--google-red: #DB4437;
--google-yellow: #F4B400;
--google-green: #0F9D58;
```

### Neutrals
```css
--white: #FFFFFF;
--off-white: #FFF8F0;
--warm-gray: #F5F0EB;
--text-dark: #2D2D2D;
--text-gray: #666666;
--text-light: #999999;
```

### Usage
- **Hero backgrounds:** Linear gradient from peach-100 → peach-300 → peach-600
- **Buttons (primary):** Gradient from peach-500 to peach-700
- **Hover states:** peach-600
- **Text on light:** text-dark (#2D2D2D)
- **Text on dark:** white

---

## 📝 Typography

### Font Family
```css
font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
```

**Alternative:** Google Sans (more playful, closer to Google branding)

### Type Scale (Desktop)
```css
--text-xs: 12px;      /* Small labels */
--text-sm: 14px;      /* Secondary text */
--text-base: 16px;    /* Body text */
--text-lg: 18px;      /* Large body */
--text-xl: 20px;      /* Small headings */
--text-2xl: 24px;     /* Subheadings */
--text-3xl: 30px;     /* H3 */
--text-4xl: 36px;     /* H2 */
--text-5xl: 48px;     /* H1 */
--text-6xl: 60px;     /* Display large */
--text-7xl: 72px;     /* Hero headline */
```

### Type Scale (Mobile)
```css
--text-xs: 12px;
--text-sm: 14px;
--text-base: 16px;    /* Minimum readable size */
--text-lg: 18px;
--text-xl: 20px;
--text-2xl: 22px;
--text-3xl: 24px;
--text-4xl: 28px;
--text-5xl: 32px;
--text-6xl: 36px;
--text-7xl: 40px;     /* Hero headline mobile */
```

### Font Weights
```css
--font-regular: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

### Line Heights
```css
--leading-tight: 1.2;    /* Headlines */
--leading-normal: 1.5;   /* Body text */
--leading-relaxed: 1.75; /* Long-form content */
```

---

## 🎭 Effects & Styling

### Glassmorphism
```css
.glass-light {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.glass-white {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.glass-card {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
}
```

### Shadows
```css
--shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.04);
--shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
--shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
--shadow-xl: 0 12px 32px rgba(0, 0, 0, 0.16);

/* Warm-toned shadows for cards on peach backgrounds */
--shadow-warm: 0 8px 24px rgba(255, 154, 118, 0.15);
```

### Border Radius
```css
--radius-sm: 8px;      /* Buttons, inputs */
--radius-md: 12px;     /* Small cards */
--radius-lg: 16px;     /* Large cards */
--radius-xl: 24px;     /* Hero cards, modals */
--radius-full: 9999px; /* Pills, circular elements */
```

### Transitions
```css
--transition-fast: 150ms ease-out;
--transition-base: 250ms ease-out;
--transition-slow: 400ms ease-out;
```

---

## 📐 Spacing System

### Base Unit: 4px

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;    /* Base spacing */
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
--space-20: 80px;
--space-24: 96px;
```

### Usage
- **Card padding:** space-6 (24px) desktop, space-4 (16px) mobile
- **Section spacing:** space-20 (80px) desktop, space-12 (48px) mobile
- **Element gaps:** space-4 (16px)
- **Button padding:** space-4 space-8 (16px 32px)

---

## 🧩 Components

### Navigation Bar

**Desktop:**
```
Height: 70px
Width: min(1240px, calc(100% - 48px))
Background: Translucent frosted white with 12px blur
Border: 1px solid rgba(255,255,255,0.45)
Border radius: 18px
Logo: Left (GDG@GT - multi-color)
Navigation: Center (Home, Events, Team, Gallery, Resources, Sponsors, Contact)
CTA: Right (Login button - coral gradient)
Shadow: Soft warm shadow
```

**Mobile:**
```
Height: 60px
Background: Frosted white
Logo: Left
Hamburger: Right (coral color)
```

### Buttons

**Primary (Coral Gradient):**
```css
background: linear-gradient(135deg, #FF9A76, #F88377);
color: white;
padding: 16px 32px;
border-radius: 8px;
font-weight: 600;
transition: transform 200ms, box-shadow 200ms;

&:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(255, 154, 118, 0.3);
}

&:active {
  transform: translateY(0);
}
```

**Secondary (Outline):**
```css
background: transparent;
border: 2px solid;
border-image: linear-gradient(135deg, #FF9A76, #F88377) 1;
color: #F88377;
/* Same padding, radius, hover as primary */
```

### Cards

**Event Card:**
```
Background: White
Border radius: 16px
Shadow: 0 4px 16px rgba(0,0,0,0.08)
Padding: 0 (image full-width) + 24px on content
Hover: translateY(-8px), shadow increases

Structure:
- Image (16:9 ratio, lazy-loaded)
- Date badge (glassmorphic, top-left corner)
- Title (font-semibold, text-xl)
- Date/time + icon
- Location + icon
- Category tags (pills)
- Register button (full-width)
```

**Stats Card:**
```
Background: White
Border radius: 16px
Shadow: 0 4px 16px rgba(0,0,0,0.08)
Padding: 32px
Text-align: center

Structure:
- Icon (coral gradient, 48x48px)
- Number (text-6xl, font-bold)
- Label (text-lg, text-gray)
```

### Forms

**Input:**
```css
background: #FFFFFF;
border: 1px solid #D8D2CC;
border-radius: 8px;
padding: 12px 16px;
font-size: 16px;
color: #2D2D2D;

&:focus {
  outline: none;
  border-color: #FF9A76;
  box-shadow: 0 0 0 3px rgba(255, 154, 118, 0.1);
}
```

### Native Forms Product

The native Forms product uses the admin product register for building and reviewing responses, and the public brand register for respondent pages. It must not copy Google Forms purple or Microsoft Forms green.

**Admin library:**
- Standard admin shell with Forms selected in the charcoal sidebar.
- One wide, dense table is the primary form inventory. Cards are reserved for templates and empty states.
- Status colors are semantic: coral for active selection and primary action, green for open or successful, amber for scheduled or attention, red for closed by error or destructive action, neutral gray for draft and archived.
- Unknown totals display an em dash or `No data yet`, never invented values.

**Builder:**
- Three-column desktop layout: 260px field palette, flexible 680-820px canvas, 320-360px inspector.
- Field palette and inspector remain sticky within the viewport while the canvas scrolls.
- Selected fields use a 2px coral outline and visible label. Drag handles always have keyboard Add, Move Up, and Move Down equivalents.
- The canvas uses an opaque white form page on the pale admin workspace. It does not use glass inputs.
- Autosave state is always visible and uses `Saving`, `Saved`, or `Could not save` with an action.
- Conditional logic uses readable sentence rules, not a node graph. Invalid cycles and unreachable required fields are shown before publish.
- Publish is the only emphasized header action. Preview, version history, undo, and redo remain secondary.

**Public respondent form:**
- Centered opaque white panel, 720-820px desktop width, 24px radius, 32-40px padding.
- Warm peach atmospheric background and restrained brand decoration stay outside the form panel.
- Labels remain visible above fields. Placeholder text is supplementary and never acts as the label.
- Inputs use white or warm-white surfaces, neutral 1px borders, 8px radius, dark text, and coral focus rings.
- Sections show explicit progress. Back and Next are predictable. Submit appears only on the final step.
- Error summary appears above the section and links to invalid fields. Focus moves to the first invalid field.
- Save and resume, file scanning, submission, and edit availability each have explicit text state.

**Responses workspace:**
- Summary, Responses, and Individual tabs.
- Responses default to a paginated table with fixed identity columns, column chooser, saved views, filters, and horizontal overflow.
- Charts use the correct representation for the question type and always expose a tabular alternative.
- Individual response view shows the published version, edit history, and file scan state.
- Destructive actions such as delete and identity redaction are visually separated and confirmed.

**Forms-specific sizing:**
```css
--form-public-width: 800px;
--form-builder-palette: 260px;
--form-builder-inspector: 340px;
--form-field-gap: 24px;
--form-section-gap: 40px;
--form-control-min-height: 44px;
```

**Forms responsive behavior:**
- Below 1024px, the builder palette and inspector become drawers while the canvas remains primary.
- Below 768px, the public respondent form uses one column, 16px page gutters, 16px panel padding, full-width primary actions, and horizontally scrollable grid questions with persistent row labels.
- Response tables provide horizontal scrolling plus an accessible single-response detail view. They do not collapse every row into an unreadable card stack.

---

## 📱 Responsive Breakpoints

```css
/* Tailwind defaults */
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Design Adjustments

**Mobile (<768px):**
- Single column layouts
- Stacked buttons
- Larger touch targets (min 44x44px)
- Reduced 3D complexity (static images)
- No parallax effects
- Font sizes: 70% of desktop

**Tablet (768-1024px):**
- 2-column grids
- Simplified 3D
- Reduced animations

**Desktop (>1024px):**
- Multi-column layouts
- Full 3D scenes
- All animations
- Parallax effects

---

## 🎯 Page Templates

### Homepage Hero

**Desktop:**
```
Navigation bar (70px height)
Hero section (100vh - 70px)
  - Background: Warm gradient (peach-100 → peach-600, diagonal 135deg)
  - Centered content:
    - Headline: "Google Developer Groups" (text-7xl, centered)
      - "Google" = multi-color (blue, red, yellow, blue, red, yellow)
      - "Developer Groups" = coral gradient
    - Subheading: "Building the future..." (text-2xl, text-dark)
    - Buttons: "Upcoming Events" (primary) + "Join Us" (secondary)
  - 3D elements (positioned around edges):
    - Top right: Small donut (~180px)
    - Top left: Code brackets "</>  " (~120px)
    - Bottom left: Google-color cube (~100px)
    - Bottom right: Crystal/geometric shape (~80px)
    - Confetti scattered (10-15 small particles)
  - Background: GT tower silhouette (right side, low opacity)
  - Scroll indicator (bottom center)
```

**After Scroll:**
```
Stats section:
  - 4 cards in row (glassmorphic white)
  - Icon + Number + Label
  - Fade in on scroll

Events preview:
  - 3 event cards
  - "View All Events" button

Footer:
  - Dark background with warm overlay
  - 3 columns
  - Social icons
```

### Events Page

```
Navigation bar
Hero section (40vh):
  - Light warm gradient
  - Title: "Events" with coral underline
  - Filter pills
  
Event grid:
  - 3 columns (desktop)
  - 1 column (mobile)
  - Event cards (as specified above)
  - Load more button
```

### Admin Dashboard

```
Sidebar (250px, dark #1F1F1F):
  - Logo at top
  - Navigation items, including Forms as a first-class admin destination
  - Active item: coral left border
  - Warm gradient overlay at bottom

Top bar:
  - Search (glassmorphic)
  - Notifications
  - Profile

Main content:
  - Stats cards (4 across)
  - Charts (coral/peach gradients)
  - Recent activity feed
  - FAB (floating action button, bottom-right, coral)
```

---

## ♿ Accessibility

### Motion
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Color Contrast (WCAG AA)
- Text-dark (#2D2D2D) on white: ✅ 14.7:1
- Text-gray (#666666) on white: ✅ 5.7:1
- White text on coral (#F88377): ⚠️ 2.9:1 (use for large text only)
- White text on peach-900 (#CC5244): ✅ 4.5:1

### Focus States
```css
:focus-visible {
  outline: 2px solid #FF9A76;
  outline-offset: 2px;
}
```

---

## 🚀 Animation Guidelines

### Hover Effects
- **Duration:** 200-300ms
- **Easing:** ease-out
- **Transform:** translateY(-4px to -8px) + scale(1.02)
- **Shadow:** Increase by one level

### Scroll Animations
- **Fade in:** opacity 0 → 1, translateY(30px) → 0
- **Duration:** 400-600ms
- **Stagger:** 100ms between items
- **Trigger:** viewport intersection (once)

### Loading States
- **Skeleton:** Pulsing gray rectangles
- **Spinner:** Coral gradient rotating circle
- **Progress:** Coral gradient bar

---

## 📦 Implementation Checklist

- [ ] Set up Tailwind with custom color palette
- [ ] Configure Google Fonts (Inter with font-display: swap)
- [ ] Create glassmorphism utility classes
- [ ] Build navigation component
- [ ] Build button components (primary, secondary)
- [ ] Build card components (event, stats, team)
- [ ] Set up Framer Motion
- [ ] Implement prefers-reduced-motion
- [ ] Add Spline 3D integration
- [ ] Configure Confetti library
- [ ] Set up image lazy loading
- [ ] Create admin theme (dark sidebar variant)

---

**This design system is production-ready and approved for implementation.** 🎨✨
