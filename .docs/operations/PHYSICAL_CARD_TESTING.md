# Physical card testing and audit — 2026-11-11

The owner confirmed that physical reads/writes and NFC Tools work on the current sample cards, and that one test card is read-only/protected. That validates the previous URL-only format. The revised build9 protocol still needs the following physical acceptance checks; desktop mocks and compilation do not establish hardware behavior.

## Three-card experiment

1. Install GDG Workspace build9 from the existing GDG Officers TestFlight group. Use a disposable test member through the admin UI.
2. Issue a card credential and write/register blank card A. Expect successful native read-back, Registered chip in the member record and one queued email. An ordinary tap must open the public leaderboard without a member credential in its URL.
3. Scan A in our app. Confirm the intended member. Check manual review and an explicitly started automatic activity. Duplicate attendance for the same activity remains prevented by the database.
4. With NFC Tools, copy A’s complete two-record NDEF message onto blank card B. Our scanner must reject B with a chip mismatch while A keeps working. B’s normal browser tap may still open the public leaderboard; that action proves no identity.
5. Choose Program card for A’s existing credential and present B. The native app should refuse it before writing because the expected chip differs. Simultaneous first enrollment is also fenced by server row/advisory locks and the unique active-chip index; a losing write must not be handed out as registered.
6. Use the read-only/protected card C. Expect a clear read/write refusal where reformatting is required. No password removal, permanent lock or erase occurs. Testing stock can be sacrificed, but the app does not silently perform irreversible operations.
7. Interrupt connectivity immediately after write/read-back. Restore it and retry registration. The same enrollment must recover without a second write, pass or automatic email.
8. Confirm the member email’s QR and Wallet options still work. They use a separate digital credential. Pasting A’s physical token or presenting it as a QR must fail in chapter and external-event lookup.
9. Revoke A; its scans must fail. The independent Wallet pass remains usable. Inactivate the member and verify both are rejected. Reuse a chip only after revocation and an explicit erasure of the test data if it belongs to another credential.
10. Background/lock the app during automatic check-in. It must pause. Closing the activity window also pauses; server checks remain authoritative even if the phone clock is inaccurate.

## Implementation limits

Standard NTAG213/215/216 memory is readable and copyable. The UID is read through Core NFC’s tag session and compared with the enrolled SHA-256 hash of the lowercase hex identifier. This stops copying ordinary NDEF contents onto another ordinary card. It is not an attestation of genuine hardware and does not stop sophisticated UID emulation or a trusted officer forging scan input. NTAG424 DNA or another properly provisioned cryptographic tag is the separate upgrade for stronger clone resistance. No security-tag purchase, subscription or new entitlement is required for this test phase.

The writer never locks, passwords or erases cards. Password protection and permanent lock bits have different recovery behavior; do not infer which applies from a generic read-only message. Use NFC Tools’ tag status to inspect the test card. No physical test from the owner has yet verified build9’s revised packet format or UID enrollment.

## Broader audit coverage

Reviewed the complete physical credential path, Wallet/emailed pass generation, member selection, revocation, duplicate check-in, external event lookup/review, interrupted writes and retries, app backgrounding, form submission push preparation, field-level feedback, roster import, profile identity and existing email rendering. The full unit and database suites cover the other website workflows; the audit is not a claim of exhaustive manual testing of every page.

Changes from this review: separate public navigation from card identity; bind physical chips; delay registration mail until programming; keep Wallet QR independent; remove exposed physical QR/programming URL controls; recover same-card registration without rewriting; pause automatic check-in on background/expiry; suppress pushes for withdrawn responses; preserve existing accessible field descriptions. Existing consent, permission, mail sender and daily digest behavior is retained. No production member import, point change, card revocation or mail blast was performed for the audit.

Apple primary references: [background NFC URL reading](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading), [tag reader sessions](https://developer.apple.com/documentation/corenfc/nfctagreadersession), [MIFARE tag identifiers](https://developer.apple.com/documentation/corenfc/nfcmifaretag). NXP: [NTAG213/215/216 features](https://www.nxp.com/products/NTAG213_215_216), [NTAG424 DNA cryptographic features](https://www.nxp.com/docs/en/data-sheet/NT4H2421Gx.pdf).
