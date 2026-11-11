# GDG Workspace for iPhone

The normal app uses native SwiftUI navigation, lists, editors, sheets and dialogs. It does not render the website in a WKWebView. It uses the existing website API, accounts, permissions and membership records. The retained WebKit cookie store shares the existing native sign-in session with the API client; passwords never go to JavaScript.

Native screens in build10:

- Home, events and registrations, event creation/editing and visibility controls.
- Continuous check-in for chapter activities, chapter events and connected events.
- Member search, member editing, card/Wallet issuance, NFC programming, revocation, member emails and point history.
- Forms, ordered responses and authorized attachment previews.
- Tasks, status updates and comments.
- Notifications, notification preferences, device registration and public profile editing.
- Newsletter campaigns, templates and subscriber invitations, custom audiences, draft editing, test sends and password-confirmed campaign delivery.

Finance, site publishing, whiteboard and other advanced website editors remain available through the explicitly labeled **Open full website** browser link. Native screens do not imply full feature parity with every desktop editor. Android remains a separate app implementation.

## Sign in and lock

Install GDG Workspace through the existing private **GDG Officers** TestFlight group. The Apple listing is GDG GT Scanner, app ID `6832381059`, bundle `dev.gdggt.scanner`, version `1.0.0`. Automatic group distribution is off; a new build must be assigned after Apple processing. Do not re-upload an already uploaded build merely because processing or group assignment is pending.

Use the existing chapter access code, officer email and password. **Remember with Face ID** stores credentials in this device's Keychain, protected by the current biometric enrollment. Changed biometric enrollment invalidates that saved secret. No password is stored in UserDefaults, the repository or logs.

The app pauses scanning and cancels API work when locked. A separate privacy window covers the root UI and presented editors. The navigation stacks and unsaved drafts stay in memory while locked; Face ID checks the account/session before reopening them. Nothing is saved as an offline check-in. Sign-out revokes the session, clears the saved credentials and local private temporary files, and unregisters native notifications. Switching accounts resets the previous account's screens and check-in state.

Native email/password fields use Apple's `webcredentials:gdggt.dev` association. The website publishes the matching app identity at `/.well-known/apple-app-site-association`. The chapter access code remains separate. There is no universal link handler that turns normal website links into app launches.

## Run the check-in line

1. Open **Check-in**, or choose **Start event check-in** from an event.
2. Select an activity, chapter event or connected event once. A chapter event can optionally award one selected points activity. A connected event uses its configured linked activity.
3. Choose physical NFC cards or Wallet QR and start scanning.
4. Each valid scan submits one operation. Attendance and applicable points are recorded without a per-person review/confirm step. The last person's name and outcome appear above the camera, with haptic feedback, counters and recent scans.

Chapter events require an existing registration matching the member's normalized email. A community member who did not register is shown as **Not registered for this event**; scanning does not create a registration. An activity awards that activity's points once per member. Repeat scans show **Already checked in**, without awarding again. Connected events check membership linking and registration through their existing adapter; unlinked, waitlisted and cancelled registrations are not admitted.

Interrupted results pause the line. **Retry same check-in** reuses the original operation key, preventing duplicate attendance or points. Resolve that result before scanning the next person. The reader pauses on background, explicit pause, account lock, closed check-in windows and relevant authorization failures. iOS limits NFC reader sessions: after a system timeout, use **Resume NFC**. QR scanning does not need a fresh camera dialog for each participant.

Server endpoint: `GET/POST /api/v1/admin/mobile/check-in`. It requires an active Super Admin session. Writes also require CSRF and idempotency. Activity and chapter-event writes use migration155's atomic `native_member_checkin` function. Connected events reuse their existing adapter receipt/recovery protocol with separate stable internal keys and one authenticated queue quota per scan. Adapter credentials stay on the server. Configuring an event still requires that event's registration adapter; installing this app does not configure a future DevFest database.

## Issue and program physical cards

Use unlocked NDEF-capable NTAG213/215/216 cards with a seven-byte identifier. The iPhone is the writer and reader.

1. Open **Members**, select the member and issue a **Physical NFC card** with a useful label. It starts unprogrammed and cannot check in yet; its card email is not sent at this step.
2. Choose **Write and register card**. The native writer checks the chip, writes and reads back the NDEF records, then registers the chip on the server.
3. The first record opens `https://leaderboards.gdggt.dev/` for a normal phone tap. The second is MIME `application/vnd.gdggt.card` with an opaque credential. No member name, email or points are written to the card.
4. Registration binds the credential to that chip identifier and queues the member email with an independent Wallet QR and Apple/Google Wallet options. An active Wallet credential is reused when available. Digital and physical credentials share the member/balance, not the credential secret.
5. If registration's response is interrupted, use **Retry card registration**. This does not rewrite the chip. Do not hand the card out before registration is confirmed.

The writer refuses unrelated contents, incompatible, undersized and locked cards. It never sets passwords, locks a card or attempts to unlock one. A correctly formatted read-only card can be read and registered; a permanently locked legacy card cannot be rewritten to the new format.

A physical credential copied to an ordinary second card fails the chip binding check. Pasting that physical token or showing it as a QR cannot check in. Use the independent Wallet QR for camera scanning. This is ordinary-copy resistance, **not cryptographic chip authentication**: a sophisticated device can emulate identifiers, and a trusted Super Admin can already award points manually. Never treat these cards as administrative login keys. Revoke a lost physical card before replacing it; an independent Wallet pass remains active.

See [physical card testing](PHYSICAL_CARD_TESTING.md) and [event adapters](EVENT_MEMBERSHIP_INTEGRATION.md).

## Wallets, files and notifications

Apple and Google Wallet QR remain separate from phone-to-phone Wallet NFC. The owner tested adding the existing Apple Wallet pass and scanning its QR. Wallet NFC still needs provider approval, entitlements/configuration and device acceptance; the normal app stays TAG-only. Do not enable the optional Wallet build on the strength of a successful normal archive.

Form attachments use the authenticated file-authorization endpoint and a short-lived signed download without app cookies. Quick Look previews supported documents natively. Downloaded files are private, protected, bounded to64MiB and cleaned up after preview/share completion or sign-out. Native notification registration uses the existing APNs configuration. No Firebase project or new paid scanner provider is required.

Admin-added newsletter subscribers receive a chapter invitation with **Join the newsletter**. Public self-subscriptions keep the ordinary **Confirm subscription** email. The same confirmation endpoint and expiry rules apply. No existing members are mailed again by deploying this change.

## Build and verification

```sh
xcodegen generate --spec native/Scanner/project.yml
swift test --package-path native/Scanner
xcodebuild -project native/Scanner/GDGScanner.xcodeproj -scheme GDGScanner -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_ID' test
```

`native/Scanner/Tests` includes credential-policy and native queue race/retry tests. `UITests` uses fictional in-memory data behind a Debug-only launch argument, exercises native screens, confirms no webviews, checks duplicate feedback and preserves an open draft across background/foreground. That transport and its launch argument are absent from Release binaries. Simulator tests do not certify the real camera, Face ID, APNs or physical NFC behavior.

The disposable PostgreSQL suite applies all migrations under canonical and legacy Supabase grant defaults. It exercises100 distinct queue participants and100 simultaneous scans of one credential, requiring101 one-time awards across the two scenarios. API tests cover authorization, CSRF, binding proof, queue quota and connected-event recovery steps.

Build10 artifacts are ignored under `native/Scanner/build/`: `GDGWorkspace-Build10-Final.xcarchive`, `Distribution10` and the signing-verification JSON. Preserve the archive/dSYMs for the distributed build. Validation evidence is recorded in `.docs/phase0/native-workspace-10.json`; check App Store Connect for the current processing and officer-group assignment. The normal signed export must have production APNs, Associated Domains, TAG-only NFC and `get-task-allow=false`.
