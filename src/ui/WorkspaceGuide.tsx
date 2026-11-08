import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "./primitives";
import { localPreviewEnabled } from "./preview-data";
import { useState } from "react";
import { SearchBox, EmptyState } from "./primitives";

const sections = [
  {
    title: "Plan an event",
    href: "/admin/events",
    description:
      "Set a date, venue, audience level, and registration details. Check the public event page before sharing. Unknown times and venues should stay marked as to be announced. From Attendance, review the exact registered recipients and message before approving email with your current password and SEND plus the final count. Reviews expire after five minutes; recipient or event changes require another review. Queued is not delivered, and accepted mail cannot be recalled.",
  },
  {
    title: "Build a form",
    href: "/admin/forms",
    description:
      "Start from a template or an empty form. Add questions and sections, set required fields, and preview the experience. Publishing creates a versioned snapshot; later edits stay in your draft until you publish again. All new submissions require a name and email; entered details are unverified unless an existing access method verifies the email. Georgia Tech SSO is pending campus configuration. Respondents can opt in to email their exact questions and answers only to their entered address, without another confirmation step. Files are listed by name, not attached. Chapter notifications require a separate recipient review.",
  },
  {
    title: "Review responses",
    href: "/admin/forms",
    description:
      "Open a form’s Responses view to search and filter by published version. Individual responses include read-only revision history. Background CSV, XLSX and JSON exports use expiring private downloads; sensitive answers require a separate explicit permission and are excluded by default. Review published questions and compare versions from the builder’s history.",
  },
  {
    title: "Manage the community",
    href: "/admin/members",
    description:
      "Keep membership records separate from public team profiles. Use Teams & permissions to organize work and review access. Do not publish personal contact information without permission.",
  },
  {
    title: "Keep people informed",
    href: "/admin/communications",
    description:
      "Use announcements, tasks, messages, and channels for internal work. Newsletter drafts are a separate, subscriber-facing workflow. Verify recipients before a real send.",
  },
  {
    title: "Follow an event reminder",
    href: "/events",
    description:
      "An event reminder is a separate opt-in, not part of registration or installing the app. Officers use their current sign-in; other attendees verify their registration through a private emailed link. Only an explicit Enable action requests browser permission. On iPhone/iPad, use the Home Screen app. Turn off an individual reminder from its event page; browser settings can block all notifications. A generic reminder is scheduled around 24 hours before the event, but provider acceptance does not guarantee device display. Local testing keeps real push sending disabled.",
  },
  {
    title: "Review chapter inquiries",
    href: "/admin/communications?tab=contact",
    description:
      "Chapter administrators can review contact messages and private scanned attachments in the Contact inbox. Download links expire after one minute. Mark an inquiry resolved only when finished: its identity, message and files are removed after 180 days unless held. Adding or releasing a hold requires your current password and an explicit confirmation; releasing an overdue hold may allow cleanup immediately.",
  },
  {
    title: "Send a newsletter",
    href: "/admin/newsletter",
    description:
      "Choose a chapter or team scope. New subscribers must confirm their email. Save a campaign privately, preview it, then review its confirmed audience and approve with your current password and exact recipient count. Scheduling runs on the server; self-only tests do not contact subscribers. Accepted means handed to the provider, not inbox delivery. Cancel stops queued work but cannot recall accepted mail. Restoring archived subscribers leaves them unsubscribed.",
  },
  {
    title: "Manage approved content",
    href: "/admin/content",
    description:
      "Review site content, resources, sponsors, and public navigation. Public blog and project routes are intentionally disabled; the retained private tools are not public launch content.",
  },
  {
    title: "Organize media",
    href: "/admin/media",
    description:
      "Choose a scope in the media library, then upload privately. Wait for a clean scan before preview or download. Gallery images need meaningful alt text and a separate password-confirmed public approval; original files remain private. Revoke publication before changing approved metadata, moving or archiving. Archived files remain restorable for 30 days unless cleanup has begun. Resolve retained usage references before removal.",
  },
  {
    title: "Handle a person-data request",
    href: "/admin/privacy",
    description:
      "Super Admins must independently verify the requester before searching their exact email. Review the frozen record list, then re-enter your password and type the action and count. Sensitive Forms answers are masked in exports unless explicitly selected. Holds block erasure. Redaction removes the complete message/answer payload and linked history, not just name fields. Refresh cleanup status until private files and generated exports are gone. Finance, audit, officer accounts and private collaboration are retained; previously delivered or downloaded copies cannot be recalled.",
  },
  {
    title: "Check operations and retention",
    href: "/admin/operations",
    description:
      "Super Admins can review scheduled-job outcomes, monitor freshness, threshold alerts and retention policies. Refresh before drawing conclusions; stale or unavailable monitoring is not a healthy result. Cleanup runs through a separate authenticated scheduler, never by opening the page. Investigate alert counts without exporting participant data. Hosted operation also requires independent uptime monitoring and a reviewed on-call destination.",
  },
  {
    title: "Track chapter finances",
    href: "/admin/finances",
    description:
      "Record transactions, budgets, and approval status. Planning figures are not a live bank balance. Keep receipts and spending tied to their approved purpose.",
  },
];

export default function WorkspaceGuide() {
  const [query, setQuery] = useState("");
  const results = sections.filter((section) =>
    `${section.title} ${section.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="gt-admin-page">
      <div className="gt-admin-page-heading">
        <div>
          <p className="gt-breadcrumb">A useful place to start</p>
          <h1>Chapter operating guide</h1>
          <p>The essentials for working in the GDG@GT workspace.</p>
        </div>
        <BookOpen size={30} />
      </div>
      {localPreviewEnabled && (
        <section className="gt-panel gt-guide-notice">
          <Badge tone="warning">Local UI preview</Badge>
          <h2>Explore with sample data.</h2>
          <p>
            This environment does not send real emails, verify identities,
            process payments, or provide production file scanning. Forms and
            responses are saved in this browser. Other sample records and
            uploaded files reset when the development server restarts.
          </p>
          <p>
            Use fictional information only. The full production requirements
            remain in the PRD; this guide does not certify those integrations.
          </p>
        </section>
      )}
      <div className="gt-toolbar">
        <SearchBox
          value={query}
          onChange={setQuery}
          label="Search the operating guide"
          placeholder="Search workflows…"
        />
        <Badge>Guide v0.1 · PRD 1.5 reference</Badge>
      </div>
      <div className="gt-guide-grid">
        {results.map((section) => (
          <section className="gt-panel" key={section.href + section.title}>
            <h2>{section.title}</h2>
            <p>{section.description}</p>
            <Link to={section.href} className="gt-text-button">
              Open workspace <ArrowUpRight size={15} />
            </Link>
          </section>
        ))}
      </div>
      {!results.length && (
        <EmptyState title="No matching workflows">
          Try another term, such as forms, media, or events.
        </EmptyState>
      )}
      <div className="gt-guide-grid">
        <section className="gt-panel">
          <ShieldCheck size={24} />
          <h2>Before sharing publicly</h2>
          <p>
            Review dates, venues, links, consent, and imagery. Confirm access
            controls and backend integrations are ready. Keep credentials and
            sensitive records out of public content and exports.
          </p>
        </section>
        <section className="gt-panel">
          <ClipboardList size={24} />
          <h2>Useful controls</h2>
          <p>
            Press ⌘K or Ctrl+K to search the workspace. Use Tab to move between
            controls, Enter to activate, and Escape to close dialogs. The
            sidebar becomes a menu on smaller screens.
          </p>
          <Link to="/accessibility" className="gt-text-button">
            Accessibility information <ArrowUpRight size={15} />
          </Link>
        </section>
      </div>
    </div>
  );
}
