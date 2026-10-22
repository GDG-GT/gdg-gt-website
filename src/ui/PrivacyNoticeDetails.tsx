import { Link } from "react-router-dom";

// This describes implemented behavior, not an institutional approval or legal
// assurance. Chapter ownership, final contacts and hosted providers need review.
export default function PrivacyNoticeDetails() {
  return (
    <>
      <h2>What this installation collects</h2>
      <h3>Events, newsletter and contact</h3>
      <p>
        Event registration stores your name, email, consent, any optional notes
        and attendance status so the chapter can run the event and send related
        messages. Newsletter signup stores your address and consent state;
        subscription requires email confirmation, and each campaign includes an
        unsubscribe option. Contact requests store your name, address, selected
        inquiry type, message and any optional attachment for the chapter to
        respond.
      </p>
      <h3>Forms and private uploads</h3>
      <p>
        All new form responses require a name and email, plus the answers
        requested by that form. Entered details alone are not verified. A form
        may permit a private saved draft, edits or file uploads; its published
        questions and access settings govern your response. Authorized reviewers
        can access responses, with separate restrictions on sensitive answers.
        Uploads are private and must pass scanning before authorized access.
      </p>
      <p>
        If you request a response copy, your exact own questions and answers,
        including sensitive answers, are emailed only to the address entered for
        your response. No additional email confirmation is currently required.
        Check that address carefully. File names are included, but file contents
        and private download links are not. Delivered copies cannot be recalled.
      </p>
      <h3>Link pages, reminders and chapter administration</h3>
      <p>
        Link pages record daily view/click totals. Abuse-prevention keys are
        hashed and time-limited; the analytics records do not store individual
        browsing histories. Event device reminders require a separate explicit
        opt-in and verified registration or current officer sign-in. Encrypted
        browser notification endpoints and keys are used to deliver the
        reminder. Turn off an event reminder on its event page or block
        notifications in your browser.
      </p>
      <p>
        Officer workspaces store account/session information, access grants,
        protected chapter records, communications and audit evidence. Access is
        role- and team-scoped. Security logs use safe route names and
        identifiers, not submitted answers, passwords, private links or raw
        request bodies. This implementation includes no advertising trackers,
        third-party session replay or fingerprinting.
      </p>
      <h2>Storage, device data and sharing</h2>
      <p>
        Records can be stored in this installation’s database and private file
        storage. Configured hosting, database, storage, scanning, email and
        optional push services process the data needed for those workflows. A
        public page or approved gallery image is public; private submissions and
        original files are not made public by uploading them. External links and
        explicitly opened embeds use their own providers’ privacy practices.
      </p>
      <p>
        The installable app can cache public assets. If you explicitly queue an
        offline event registration or newsletter signup, that pending request is
        stored on your device for up to 48 hours, with retry and discard
        controls. Final form responses, protected workspace data and private
        downloads are not placed in the offline queue. Signing out clears queued
        public submissions on that device.
      </p>
      <h2>How long records remain</h2>
      <p>
        Resolved contact requests normally expire after 180 days unless held.
        Incomplete form drafts use the form’s configured period, at most 30
        days. Responses use the retention period captured with their published
        version, normally one year unless shorter; an authorized hold prevents
        automatic erasure. Generated form exports expire after 24 hours. Cleanup
        of file bytes is retried separately and is not complete until storage
        deletion succeeds.
      </p>
      <p>
        Expired/revoked officer sessions and CSRF records remain for 30 days,
        security events for one year, and audit evidence for at least two years.
        Financial evidence is retained until chapter leadership approves a
        financial retention policy. Newsletter attempts expire after 30 days,
        push delivery logs after 90 days, and failed email delivery detail after
        90 days. Consent, suppression and required audit/deduplication records
        may remain independently of delivery detail.
      </p>
      <h2>Your choices and requests</h2>
      <p>
        Use newsletter unsubscribe links, event reminder controls, and any
        enabled form edit/resume controls for those specific workflows. You can{" "}
        <Link to="/contact">contact the chapter</Link> about access, correction,
        export, redaction or deletion. Do not include sensitive documents or
        passwords in that first message. The chapter must independently verify
        identity and ownership before processing a person-data request.
      </p>
      <p>
        The Super Admin review process matches attributable public-workflow
        records, preserves holds and tracks file cleanup. It does not erase
        financial/audit evidence, officer accounts or unrelated private
        communications, and cannot recall previously downloaded or delivered
        copies. Historical responses without captured identity may require
        independently verified response identifiers.
      </p>
      <p>
        This is a development notice describing the current implementation.
        Final chapter contact details, approved institutional language, hosted
        provider configuration and review are required before collecting real
        participant data.
      </p>
    </>
  );
}
