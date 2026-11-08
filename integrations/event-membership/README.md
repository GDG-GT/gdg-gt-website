# Separate event sites and member cards

A chapter card stays the same across events. The chapter owns membership and points. Each event owns its registration status and attendance in its own Supabase project. Nothing here creates a new event website or copies its registrations into the chapter database.

## Connect an event

1. In the chapter workspace open **Points & cards → Event connections**. Enter the event's HTTPS origin and check-in window (maximum 31 days). An optional chapter activity allows a separate Super Admin points award after attendance is confirmed.
2. Copy the displayed event ID and server credential into that event backend's encrypted environment settings. Never use a `VITE_`, `NEXT_PUBLIC_` or other public variable for this credential or a Supabase service-role key. The credential is displayed after creation or rotation; use rotation if it is lost.
3. Apply `schema.sql` **only to the event's Supabase project**. It creates private registrations/check-ins and service-only RPCs with explicit grants. It is not part of the chapter migrations. This schema is for one event per project.
4. Keep `gdg_event_registrations` authoritative: create the row and update its `status` in the same event database transaction that accepts, waitlists or cancels a registration. `account_id` is the event project's `auth.users.id`. The event's existing registration RPC can insert/update this table; alternatively adapt `gdg_event_attendance` to the event's authoritative registration table. Do not cache a disconnected copy or update `member_ref` from browser input.
5. Copy this directory into the event's server code and expose the two handlers below. Use the event's own Supabase URL/service-role key, never the chapter's Supabase credentials.
6. Deploy the event site, enable the chapter connection, then click **Test event**. Test with fictional users in staging before an actual check-in.

The adapter uses only existing Node.js and Supabase client dependencies. No additional hosted service is required.

## Server wiring (Next.js App Router example)

Create a server-only module `lib/gdg-event.js`:

```js
import { createSupabaseEventIntegration } from './event-membership/supabase.mjs';
export const gdgEvent = createSupabaseEventIntegration({
  eventId: process.env.GDG_EVENT_ID,
  eventKey: process.env.GDG_EVENT_KEY,
  eventOrigin: process.env.EVENT_ORIGIN, // exact origin, no trailing slash
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
```

`app/api/gdg-membership/v1/route.js`:

```js
import { gdgEvent } from '../../../../lib/gdg-event';
export const runtime = 'nodejs';
export const POST = gdgEvent.verifyRequest;
```

`app/api/gdg-membership/link/route.js`:

```js
import { gdgEvent } from '../../../../lib/gdg-event';
export const runtime = 'nodejs';
export const POST = gdgEvent.linkRequest;
```

These are standard Web Request/Response handlers; other frameworks can mount them at the same paths. Do not put the machine callback behind a browser challenge, sign-in redirect or deployment protection. Its bearer credential is checked before any database access.

## Link a member once per event

After Georgia Tech sign-in on `https://leaderboards.gdggt.dev/member`, the member selects **Get link code** for the event. They paste that code into the event site's signed-in account. The event frontend sends:

```js
const { data: { session } } = await eventSupabase.auth.getSession();
const response = await fetch('/api/gdg-membership/link', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${session.access_token}`,
  },
  body: JSON.stringify({ code: enteredCode }),
});
```

Use the event's existing sign-in provider; this integration adds no Google login. The backend verifies the token with Supabase `auth.getUser(token)`, requires an event registration row, redeems the chapter code and binds the returned event-specific member reference. It never trusts an account ID supplied by the browser. Codes last 10 minutes, work once, and support same-account retries if a response is lost. A different account cannot reuse a redeemed code. Treat codes as private and omit them, bearer tokens and request bodies from logs and analytics.

Georgia Tech member SSO must be configured on the chapter first. No alternative member sign-in is enabled by this change.

## Combined NFC check-in

A Super Admin opens **Event connections**, selects the event and scans the existing member card. On iPhone the card's existing `/tap#…` URL handoff also has **External event** mode. Android Web NFC and QR/manual card payload entry share the same credential.

1. Chapter API checks the current directory member, active card and current event binding.
2. Event API reads its own live registration. Unlinked, not registered, waitlisted and cancelled have separate results. An outage never counts as admission.
3. Super Admin confirms the eligible member. Both databases retain stable attendance receipts. Duplicate taps and retries produce one event attendance record.
4. Chapter points remain a separate explicit Super Admin action, using the linked activity's existing immutable ledger and duplicate protection.

An interrupted write remains pending. Retry the same request. Expired reviews or a closed check-in window only reconcile existing remote attendance; they cannot start a fresh remote check-in. Scan again during the open window to start a fresh review. A changed connection revision requires a new scan. If a member/account binding or card has been revoked, reconcile the event's own attendance records with an officer rather than bypassing that revocation.

This does not make a static NFC tag unclonable, provide offline admission or add iPhone PWA raw NFC reading. Confirm the person being admitted. Phone-to-phone Wallet NFC still requires the separate Apple certificate/entitlement and compatible reader path.

## API contract

Chapter endpoints (server-to-server only):

- `POST https://gdggt.dev/api/v1/integrations/membership/redeem` — `{code, accountId}` → `{data:{memberRef,active}}`
- `POST https://gdggt.dev/api/v1/integrations/membership/verify` — `{memberRef}` → `{data:{memberRef,active}}`

Both require `Authorization: Bearer <eventId>.<secret>`, JSON, no cookies and no browser Origin/Sec-Fetch headers. Only references belonging to that event can be queried. No email, chapter member ID, directory enumeration or points mutation is exposed. A revoked/inactive member or link must be treated as ineligible even if the event registration is still valid. Keys expire for central calls seven days after the configured event close and can be revoked or rotated immediately in the workspace. Rate limits return 429; failures must fail closed and offer retry.

Event callback: `POST /api/gdg-membership/v1`, same bearer credential, with `{eventId,action}` for health, `{eventId,action:'lookup',memberRef}` or `{eventId,action:'checkin',memberRef,checkinId}`. Registration response: `{status:'registered'|'waitlisted'|'cancelled'|'not_registered',checkedIn:boolean,checkinId:string|null}`. `checkinId` in a request is the chapter's stable operation UUID; in a response it is the event's own receipt ID.

Only HTTPS public IPv4 destinations are supported. DNS addresses are checked and pinned; private addresses, custom ports, redirects, oversized responses and slow requests are rejected. Use a normal public event origin. Rotation must be copied to the event environment and deployed before checks can succeed again.

Membership inactivity, email changes and directory merges revoke event links and outstanding codes. A member can disconnect their link. Re-linking to the same event account is supported; moving a link to another account requires an officer to reconcile the event and chapter records. Deleting a user from the event project's Auth cascades to that project's integration registration and attendance rows. Chapter attendance, receipts and audit history remain available for reconciliation; no automatic event-data purge is claimed. Apply each event's retention/deletion policy to both projects.

## Verification and references

`node scripts/test-event-membership.mjs` tests the standalone schema in a disposable PostgreSQL database, including 50 concurrent duplicate taps. Chapter migration tests cover event isolation, sessions, revocation and recovery. API/UI tests exercise the adapter without sending real registrations or awarding real points.

Official references: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [server authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [explicit API grants](https://supabase.com/docs/guides/api/securing-your-api), [server-only keys and RLS](https://supabase.com/docs/guides/database/secure-data).
