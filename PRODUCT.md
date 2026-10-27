# Product

## Register

brand

## Users

The public website serves Georgia Tech students, prospective members, event attendees, sponsors, collaborators, and campus stakeholders. They need to understand the chapter quickly, find and register for events, discover resources, and contact the organization.

The authenticated admin application serves chapter officers, team leads, team members, and blog editors. They need a dependable operating workspace for content, events, native forms and response data, communications, teams, finances, media, and chapter administration.

Public form respondents need to complete accessible chapter forms, upload permitted files, save and resume when enabled, and receive a trustworthy completion state without leaving the website.

Public copy must not reveal the hidden officer entrance, its footer location or
access-code instructions. This includes maintenance messages, fallback pages,
newsletter feedback and offline help (Tejas, 2026-10-27).

Public pages use the brand register. Authenticated admin pages use the product register even though the project default is brand.

## Product Purpose

Create the public identity and operating system for Google Developer Group on Campus at Georgia Institute of Technology. The site must make the chapter feel credible, energetic, technical, and specific to Georgia Tech while giving the chapter a secure way to run its work without direct database administration.

Success means visitors can understand and engage with the chapter immediately, respondents can complete chapter forms entirely on the site, and authorized officers can complete every operational workflow safely and efficiently.

## Brand Personality

Playful, warm, glossy, energetic, and technically credible.

The public experience uses a peach and coral world with floating glossy 3D objects, Google color details, Georgia Tech architecture, soft glass surfaces, and large friendly sans-serif typography. It should feel celebratory and imaginative while still functioning as a real student organization website.

The admin experience carries coral accents into a controlled workspace: dark architectural sidebar, soft neutral off-white content canvas, rounded metric panels, clear charts, and dense operational information. Avoid a yellow cast.

The visual source of truth is `.docs/FINAL_DESIGN_PROMPTS.md`, followed by `.docs/DESIGN_SYSTEM.md`, `.docs/GDG_GT_UI_IMAGE_PROMPTS.md`, and the approved reference images. Do not reinterpret this direction from general Georgia Tech branding.

## Anti-references

- Generic AI-generated SaaS landing pages.
- Navy-and-gold editorial or newspaper-style layouts.
- Corporate photography-led hero sections.
- Minimal white websites with small restrained brand accents.
- Dark cyberpunk developer dashboards with neon everywhere.
- Georgia Tech athletics styling copied without purpose.
- Interfaces that use visual novelty at the cost of reading, navigation, or task completion.

## Design Principles

1. Make peach, coral, glossy 3D objects, and Georgia Tech architecture the unmistakable public identity.
2. Use the Google four-color mark and GT imagery only from approved supplied assets.
3. Keep the expressive hero separate from clean, usable content sections.
4. Give every public section one clear reason to exist and one clear next action.
5. Carry the brand into admin through color, shape, and architecture without sacrificing information density.
6. Treat security, accessibility, responsive behavior, and failure states as visible product quality.
7. Make native Forms feel familiar and task-focused: dense admin tools for builders, calm readable pages for respondents, immutable published versions, and no provider-branded imitation.

## Approved Design Tokens

Latest user correction (2026-10-19): remove the yellow cast across all pages,
especially admin. Use low-chroma neutral off-whites for page/workspace backgrounds,
cards, inputs, menus, and dialogs, without pure-white backgrounds. Restore the
homepage's peach atmosphere and translucent peach glass rather than yellow-tinted
glass. Preserve coral accents, Google colors, moving 3D objects, and the charcoal
sidebar/footer. This supersedes the earlier pale-yellow interpretation.
Photographic content and official marks are not recolored.

- Font: Inter, with Google Sans or SF Pro Display styling where an approved licensed asset exists.
- Peach scale: `#FFF8F0`, `#FFE5B3`, `#FFD699`, `#FFC093`, `#FFAA7A`, `#FF9A76`.
- Coral scale: `#FF8366`, `#F88377`, `#E6705F`, `#CC5244`.
- Text: `#2D2D2D`, secondary `#666666`.
- Google accents: `#4285F4`, `#DB4437`, `#F4B400`, `#0F9D58`.

## Accessibility & Inclusion

Meet WCAG 2.1 AA. Support keyboard-only use, visible focus, 200 percent zoom, reduced motion, high-contrast text, descriptive image alternatives, screen-reader announcements, and touch targets suitable for mobile use. No information may depend on color, animation, hover, or pointer precision alone.
