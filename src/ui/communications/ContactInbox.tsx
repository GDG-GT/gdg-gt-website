import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateOperation } from "@/hooks/usePrivateOperation";
import {
  useApprovedSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import {
  ActionLink,
  Badge,
  Button,
  EmptyState,
  Field,
  SearchBox,
} from "../primitives";
type Inquiry = {
  id: string;
  name: string;
  email: string;
  type: string;
  message: string;
  interests: string[];
  status: string;
  revision: number;
  createdAt: string;
  resolvedAt: string | null;
  redactedAt: string | null;
  hold: boolean;
  holdReason: string | null;
  attachment: {
    id: string;
    filename: string;
    state: string;
    bytes: number;
    canDownload: boolean;
  } | null;
};
type Listing = { items: Inquiry[]; total: number; page: number };
const date = (v?: string) => (v ? new Date(v).toLocaleString() : "—");
function InquiryReview({
  record,
  onSaved,
  onClose,
}: {
  record: Inquiry;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState(record.status),
    [hold, setHold] = useState(false),
    [reason, setReason] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [capability, setCapability] = useState<{ url: string; filename: string }>();
  const { busy, error, work } = usePrivateOperation(),
    safety = useNavigationSafety();
  useDraftGuard(hold || status !== record.status, {
    busy,
    label: "Contact inquiry review",
  });
  const navigate = (run: () => void) => {
    if (!busy) {
      if (safety) safety.request(run);
      else run();
    }
  };
  useEffect(() => {
    if (!capability) return;
    const timer = setTimeout(() => setCapability(undefined), 60000);
    return () => clearTimeout(timer);
  }, [capability]);
  const path = "/admin/contact-submissions/" + record.id,
    expected = record.hold ? "RELEASE HOLD" : "HOLD CONTACT";
  const saveHold = () => {
    const currentPassword = password;
    setPassword("");
    return work(
      (signal) =>
        api(path, {
          method: "POST",
          signal,
          body: {
            action: "hold",
            revision: record.revision,
            enabled: !record.hold,
            reason,
            currentPassword,
            confirmation,
          },
        }),
      onSaved,
    );
  };
  return (
    <section
      className="gt-panel gt-contact-inbox-review"
      aria-label="Contact inquiry review"
    >
      <header className="gt-inline-actions">
        <div>
          <h2>{record.name}</h2>
          <p className="gt-helper">
            {record.type} · received {date(record.createdAt)} · revision{" "}
            {record.revision}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => navigate(onClose)}
        >
          Back to inbox
        </Button>
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      <div className="gt-inline-actions">
        <Badge>{record.status}</Badge>
        {record.hold && <Badge tone="warning">Retention hold</Badge>}
      </div>
      {record.email && (
        <p>
          <strong>Reply address:</strong> {record.email}
        </p>
      )}
      <div className="gt-contact-inbox-message">{record.message}</div>
      {record.interests.length > 0 && (
        <p>
          <strong>Interests:</strong> {record.interests.join(", ")}
        </p>
      )}
      {record.hold && (
        <p>
          <strong>Hold reason:</strong> {record.holdReason}
        </p>
      )}
      {record.attachment && (
        <section aria-label="Private inquiry attachment">
          <h3>Private attachment</h3>
          <p>
            {record.attachment.filename} ·{" "}
            {(record.attachment.bytes / 1024).toFixed(1)} KiB ·{" "}
            {record.attachment.state}
          </p>
          {record.attachment.canDownload && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void work(
                  (signal) =>
                    api<{ url: string; filename: string }>(
                      path + "/attachment",
                      { signal },
                    ),
                  setCapability,
                )
              }
            >
              Prepare private download
            </Button>
          )}
          {capability && (
            <p>
              <a
                href={capability.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
              >
                Download {capability.filename}
              </a>{" "}
              · expires in one minute
            </p>
          )}
          <p className="gt-helper">
            Original files are never public. Downloads are audited and use
            expiring attachment-only links.
          </p>
        </section>
      )}
      {!record.redactedAt && (
        <>
          <form
            className="gt-form"
            onSubmit={(e) => {
              e.preventDefault();
              void work(
                (signal) =>
                  api(path, {
                    method: "POST",
                    signal,
                    body: {
                      action: "status",
                      revision: record.revision,
                      status,
                    },
                  }),
                onSaved,
              );
            }}
          >
            <Field label="Inquiry status">
              <select
                value={status}
                disabled={busy || hold}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="new">New</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </Field>
            <p className="gt-helper">
              Resolved inquiries and their attachments are redacted after 180
              days unless an operational/legal hold applies. Reopening removes
              the resolution deadline; it does not remove a hold.
            </p>
            <Button disabled={busy || status === record.status || hold}>
              {busy ? "Working…" : "Save inquiry status"}
            </Button>
          </form>
          {!hold ? (
            <Button
              variant="secondary"
              disabled={busy || status !== record.status}
              onClick={() => setHold(true)}
            >
              {record.hold
                ? "Review retention-hold release"
                : "Review retention hold"}
            </Button>
          ) : (
            <section
              className="gt-form"
              aria-label="Review contact retention hold"
            >
              <h3>
                {record.hold
                  ? "Release this retention hold?"
                  : "Keep this inquiry under a hold?"}
              </h3>
              <p>
                {record.hold
                  ? "If resolution was more than 180 days ago, releasing this hold allows the next scheduled cleanup to erase message identity and private attachment bytes. That cleanup cannot be undone."
                  : "Use holds for a genuine operational/legal need. A hold prevents scheduled identity and attachment cleanup."}
              </p>
              {!record.hold && (
                <Field label="Reason for retention hold" required>
                  <textarea
                    minLength={10}
                    maxLength={1000}
                    rows={3}
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Current password" required>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  maxLength={1024}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label={`Type ${expected} to confirm`} required>
                <input
                  value={confirmation}
                  maxLength={30}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
              <div className="gt-inline-actions">
                <Button
                  disabled={
                    busy ||
                    !password ||
                    confirmation !== expected ||
                    (!record.hold && reason.trim().length < 10)
                  }
                  onClick={() => void saveHold()}
                >
                  Confirm hold change
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    navigate(() => {
                      setHold(false);
                      setPassword("");
                      setReason("");
                      setConfirmation("");
                    })
                  }
                >
                  Keep unchanged
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
export default function ContactInbox() {
  const [params, setParams] = useApprovedSearchParams(),
    id = params.get("contact"),
    [query, setQuery] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [response, setResponse] = useState<{ key: string; result: Listing }>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const safety = useNavigationSafety(),
    epoch = useRef(0),
    key = JSON.stringify([id, q, status, page]),
    list = response?.key === key ? response.result : undefined;
  useEffect(() => {
    const invalidate = () => {
        epoch.current++;
      },
      clear = () => {
        invalidate();
        setResponse(undefined);
        setError("");
      };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      current = epoch.current;
    setLoading(true);
    setError("");
    setResponse(undefined);
    api<Listing>(
      "/admin/contact-submissions" +
        (id
          ? "/" + encodeURIComponent(id)
          : "?" +
            new URLSearchParams({
              q,
              ...(status ? { status } : {}),
              page: String(page),
            })),
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted && current === epoch.current)
          setResponse({ key, result });
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted && current === epoch.current) {
          setError(
            e instanceof ApiFailure && e.status === 404
              ? "This inbox is available only to current chapter administrators."
              : e.message,
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current === epoch.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [id, q, status, page, tick, key]);
  const navigate = (contact?: string) => {
    const run = () =>
      setParams({ tab: "contact", ...(contact ? { contact } : {}) });
    if (safety) safety.request(run);
    else run();
  };
  return (
    <div className="gt-admin-page gt-contact-inbox">
      <header className="gt-admin-page-heading">
        <div>
          <h1>Contact inbox</h1>
          <p>Review chapter inquiries and private scanned attachments.</p>
        </div>
        <Button
          variant="secondary"
          disabled={!!id}
          onClick={() => setTick((n) => n + 1)}
        >
          Refresh inbox
        </Button>
      </header>
      <nav
        className="gt-button-row gt-team-tabs"
        aria-label="Communications workspaces"
      >
        <ActionLink
          to="/admin/communications?tab=announcements"
          variant="ghost"
        >
          Announcements
        </ActionLink>
        <ActionLink to="/admin/communications?tab=tasks" variant="ghost">
          Tasks
        </ActionLink>
        <ActionLink to="/admin/communications?tab=messages" variant="ghost">
          Messages
        </ActionLink>
        <span className="gt-button" aria-current="page">
          Contact inbox
        </span>
      </nav>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {loading || (!list && !error) ? (
        <p role="status">Loading protected inquiries…</p>
      ) : !list ? (
        <EmptyState title="Contact inbox unavailable">{error}</EmptyState>
      ) : id ? (
        <InquiryReview
          key={list.items[0].id + ":" + list.items[0].revision}
          record={list.items[0]}
          onClose={() => navigate()}
          onSaved={() => setTick((n) => n + 1)}
        />
      ) : (
        <>
          <form
            className="gt-toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(query);
              setPage(1);
            }}
          >
            <SearchBox
              label="Search contact inquiries"
              value={query}
              onChange={(v) => setQuery(v.slice(0, 100))}
              placeholder="Find a name, email or message"
            />
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                <option value="new">New</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="redacted">Redacted by retention</option>
              </select>
            </Field>
            <Button variant="secondary">Search inquiries</Button>
          </form>
          {!list.items.length ? (
            <EmptyState title="No matching inquiries">
              New messages submitted through the contact page appear here.
              Attachments remain private.
            </EmptyState>
          ) : (
            <div className="gt-table-wrap">
              <table className="gt-table">
                <caption className="sr-only">
                  Protected chapter inquiries
                </caption>
                <thead>
                  <tr>
                    <th scope="col">From</th>
                    <th scope="col">Inquiry</th>
                    <th scope="col">Status</th>
                    <th scope="col">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        <Button variant="ghost" onClick={() => navigate(r.id)}>
                          {r.name}
                        </Button>
                        <small>{r.email}</small>
                      </th>
                      <td>
                        {r.type}
                        {r.attachment && (
                          <small>
                            Private attachment · {r.attachment.state}
                          </small>
                        )}
                      </td>
                      <td>
                        <Badge>{r.status}</Badge>
                        {r.hold && <small>Retention hold</small>}
                      </td>
                      <td>{date(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="gt-inline-actions">
            <span>
              {list.total} matching inquiries · page {page}
            </span>
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={page * 50 >= list.total}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
