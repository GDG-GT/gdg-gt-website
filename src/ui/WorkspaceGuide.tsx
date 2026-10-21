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
      "Set a date, venue, audience level, and registration details. Check the public event page before sharing. Unknown times and venues should stay marked as to be announced.",
  },
  {
    title: "Build a form",
    href: "/admin/forms",
    description:
      "Start from a template or an empty form. Add questions and sections, set required fields, and preview the experience. Publishing creates a versioned snapshot; later edits stay in your draft until you publish again.",
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
    title: "Manage approved content",
    href: "/admin/content",
    description:
      "Review site content, resources, sponsors, and public navigation. Public blog and project routes are intentionally disabled; the retained private tools are not public launch content.",
  },
  {
    title: "Organize media",
    href: "/admin/media",
    description:
      "Use the media library for files and folders. Gallery uploads are public-facing: use approved photos with clear captions and appropriate consent. Never treat a preview upload as a security-scanned production file.",
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
