# Local UI development

Run `npm ci`, then `npm run dev`. Open <http://127.0.0.1:8080>.

The ignored `.env.local` enables a development-only sample-data adapter. No real
Supabase project, provider credentials, email delivery, or production records are
used. Demo changes are held in memory and reset when the development server stops.

To enter the original admin interface, enter `local-preview` in the footer's
newsletter field. Then use `admin@example.test` and password `local-preview`.
These are public development fixtures, not application credentials.

The adapter is registered only by the Vite development server when
`VITE_LOCAL_UI=true`. It is not an authentication implementation and must never be
used for production. Existing server APIs and SQL remain unchanged.

## Original baseline

Git commit `d71dbfe` preserves the supplied application and PRD before setup or UI
changes. UI work lives on `feat/ui-local`.
