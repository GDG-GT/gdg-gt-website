# Public navigation, partners and image recovery

Local checkpoint, 2026-10-26. The mobile menu retains the requested top dropdown
layout. While open, Tab and Shift+Tab cycle within its navigation; Escape closes
it and restores the trigger. ArrowDown enters its first link. Outside clicks,
route selection and the desktop breakpoint close it. It does not lock body
scroll or create a modal dialog.

The homepage now acknowledges the active sponsor selection already returned by
its public aggregate, after the team invitation and before the footer. No
section appears when that selection is empty. Logos preserve aspect ratio and
use sponsor names as accessible descriptions. Both selected team and sponsor
queries explicitly exclude archived rows and use stable ordering. The maximum
homepage selection remains 12; the complete sponsor inventory remains paginated.

Managed event cards, public portraits and sponsor logos now have bounded image
failure recovery. Event photos try their safe local fallback once. Failed
portraits use initials, and failed logos use the sponsor name. A second image
failure becomes a text placeholder, avoiding request loops; changed sources get
a new attempt. Responsive source sets do not override the fallback image.

Verification: 644 tests/110 files pass, strict types pass, lint is 0 errors/25
warnings. Overall unit coverage is 28.41% lines/27.00% branches and still fails
the unchanged 70% gate; all 17 critical-file branch gates pass. Thirteen actual
public HTTP/database checks pass. The invocation's fictional records were
recoverably archived and public exclusion was checked afterward.

CUA verified native Chrome scrolling and real keyboard boundary wrapping/Escape
at 200% zoom. Browser zoom and the temporary viewport override were restored;
only the agent-created native tab was closed. At a 375px DOM viewport the menu
was a 326px-high navigation panel beginning at 84px, with no horizontal overflow
or body scroll lock. These targeted checks do not establish a complete manual
accessibility, visual-baseline, real-device or screen-reader pass.

Evidence images: `../ui-review/top-menu-200-percent.png` and
`../ui-review/homepage-partners-fixture.png`. The latter uses clearly fictional
local read-path fixtures and illustrative placeholder photographs as test logos;
it is not approved chapter sponsor content or a production visual baseline.

Local operational restart: database, API, Vite, native scanner, private upload,
media/publication, form-export, local mail, newsletter and scheduler processes
are running. ClamAV refreshed its databases and passes clean-text/EICAR checks.
Scheduled recovery completed with no reported retries or lease failures in its
first pass. Mail is confined to local capture and external push delivery remains
disabled. Configured expiry/cleanup jobs ran; database volumes and credentials
were not reset. This is local operation, not a hosted scheduler or release proof.

Fresh dependency audits have zero high/critical findings in both the complete
and production trees. Remaining totals: production two moderate/four low;
complete tree six moderate/five low. The earlier development high findings are
absent from this audit.
