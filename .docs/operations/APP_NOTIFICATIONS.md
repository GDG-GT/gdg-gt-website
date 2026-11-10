# App notifications

Build8 adds direct Apple Push Notification service delivery to GDG Workspace. No Firebase project or paid push provider is used. Browser/Home Screen push reuses the existing VAPID key pair and service worker.

## Enable and test

1. Install build8 or later through the existing GDG Officers TestFlight group.
2. Sign in, open Notifications from More or the workspace sidebar, and choose **Enable on this device**. Allow the OS prompt. iPhone browser notifications require a supported Home Screen installation.
3. Submit a disposable test response to a form you own. Check the protected inbox, foreground banner and background alert, then tap it while the app is locked. The inbox should open after Face ID.
4. Turn off Form responses and verify a subsequent response still appears in the inbox without an OS alert. Re-enable it, then turn off the device and verify silent token refresh does not re-enroll it.
5. Sign out, switch account, revoke a session and deactivate an account; previous registrations must stop receiving updates. Never use real applicants' answers in a test alert.

Device acceptance has not yet been performed. Compilation, signed distribution entitlements, provider connectivity with an intentionally invalid token, browser checks, queue behavior and access tests pass. Provider acceptance is not proof of a physical-device alert.

## What is sent

Every committed form response creates one inbox item for the form owner and current authorized reviewed-policy notification users, independently of the email-per-response toggle. Access is checked again before sending. Existing workspace notices (tasks, messages and announcements) reuse their existing inbox rows. The mail workers mirror relevant provider-accepted emails to the matching active workspace account; the configured chapter inbox mirrors to Super Admins. No account is created for a member email. Historical emails and notifications are not replayed.

OS payloads contain generic category text, notification UUID and unread badge count. Answers, uploaded files, email bodies and subjects do not appear on the lock screen. Taps open `/admin/notifications`; existing account authorization controls access to details. Email continues to work for people without an enrolled app/device.

Delivery uses the existing delivery scheduler, normally within its next one-minute run. This is background push rather than a real-time delivery guarantee. Device permission, network, Focus mode and Apple delivery affect when an alert appears.

## Server and credentials

Migration `202611100153_app_notifications.sql` adds encrypted device registrations, seven category preferences, per-device durable delivery jobs and lease-fenced prepare/finish RPCs. RLS and explicit grants restrict these to the service role. Requests derive account/session identity from the current authenticated cookie and require CSRF for mutations. Addresses are encrypted with the existing application encryption key and never returned by settings APIs.

The APNs key already supplied by the owner is encrypted outside Git under the private `Library/Application Support/GDG GT/App Notifications` directory. Production configuration uses encrypted Vercel variables `APP_NOTIFICATIONS_ENABLED`, `APNS_PUSH_ENABLED`, `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_TOPIC`, `APNS_SIGNING_KEY` and `APNS_KEY_PASSPHRASE`. Topic is `dev.gdggt.scanner`. Keep the existing VAPID keys. Do not regenerate them or upload a key to the phone. The signed distribution build has `aps-environment=production`; the ordinary scanner remains TAG-only. Wallet NFC entitlements remain disabled.

Registrations require explicit enrollment, are limited to20 recent active devices per account and expire for sending after90 days without refresh. Rotation replaces the installation token; account switch cannot keep the previous owner's binding. Sign-out, account/password revocation and expired provider tokens revoke registrations and erase their encrypted address. Turning off a device remains off until explicitly enabled. Removing an expired auth session does not block normal session cleanup.

Jobs deduplicate by inbox item and device, retry transient errors with backoff and stop after8 attempts. Expired tokens are disabled. Current preferences, account state, unread state and form access are rechecked just before sending. Logs contain result classes rather than device tokens or message content. Turn off `APP_NOTIFICATIONS_ENABLED` to stop native/device processing without affecting ordinary email or the inbox.

## Roster import and profile validation

Members import accepts the original Organization Roster export with its metadata header. It maps visible name, campus email and phone fields; it ignores hidden values, usernames, card numbers and position metadata. Roles and permissions are never inferred from positions. Repeated position rows collapse only when identity details agree. Conflicts remain explicit review errors. The supplied export contains49 position rows,43 unique members and6 collapsed duplicates. Format support does not import any production records; review the preview before committing.

Profile links accept ordinary pasted public hostnames by adding `https://`. Unsafe/invalid addresses still fail. Field messages appear next to the actual input with red borders and accessible descriptions. The shared admin validation fallback maps server field errors within the submitting form, clears feedback on edits and preserves existing hints. Profile uses explicit field paths and specific errors. Labels retain a stable accessible name when error text appears.
