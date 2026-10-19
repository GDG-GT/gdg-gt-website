# Local UI development

Run `npm ci`, then `npm run dev`. Open <http://127.0.0.1:8080>.

The ignored `.env.local` enables a development-only sample-data adapter. No real
Supabase project, provider credentials, email delivery, or production records are
used. Legacy admin records and media uploads live in memory and reset when the
development server restarts. Native forms, responses, saved response views,
contact examples, and event-registration examples live in browser localStorage.
Use fictional information only; this is not secure production storage.

Click **Login** or the **Local preview** badge to enter the workspace. After
sign-in, the button reads **Workspace**. The original hidden-entry UI can also be
tested by entering `local-preview` in the footer field, then using
`admin@example.test` / `local-preview`. These are public development fixtures,
not production credentials. A development-only HttpOnly cookie preserves the
preview session through server restarts. Production authentication has not been
implemented by this UI work.

## What to try

- `/`: animated Three.js hero with pointer/scroll movement. Mobile, reduced
  motion, data-saving devices, and WebGL failures use an image fallback.
- `/events`: filters, event details, local RSVP confirmation, calendar export.
- `/contact`: local sample submission and attachment-selection validation.
- `/admin`: shared workspace navigation and dashboard.
- `/admin/forms`: templates and a native builder, draft autosave, immutable local
  publication snapshots, respondent preview, and local response collection.
- A form's Responses page: summary, search, version/date/state filters, selected
  exports, pagination, saved views, column selection, masking, redaction, and
  CSV/XLSX/JSON downloads. Respondent uploads are selections only; their contents
  are not uploaded or scanned. Other media-library uploads are server-memory
  samples only, not production storage.

The user revised the palette to pale yellow with **no pure-white UI surfaces**.
The hero keeps its peach/coral atmosphere and real moving objects. Official marks
and photographs are not recolored.

## Checks

`npm run test:ui`, `npm run lint:ui`, `npm run typecheck`, `npm run build`.

See `.docs/UI_LOCAL_REVIEW.md` for review scope, observed checks, and remaining
PRD work. `npm run build` verifies compilation, not production readiness. The
local `.env.local` deliberately points to a loopback-only development adapter;
do not deploy that environment or expose this Vite server publicly.

The adapter is registered only by the Vite development server when
`VITE_LOCAL_UI=true`. It is not an authentication implementation and must never be
used for production. Existing server APIs and SQL remain unchanged.

## Original baseline

Git commit `d71dbfe` preserves the supplied application and PRD before setup or UI
changes. UI work lives on `feat/ui-local`.
