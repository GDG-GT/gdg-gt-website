import { confirmAction } from "@/lib/app-dialogs";
import { useEffect, useRef, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useLiveSearch } from "@/hooks/useLiveSearch";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ScrollableTable from "../ScrollableTable";
import InquiryWriteRecovery from "./InquiryWriteRecovery";
import {
  inquiryIntent,
  submitInquiryWrite,
  type InquiryWriteIntent,
} from "./inquiry-write";
import { authorizedPrivateDownload } from "../forms/private-download";
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
  assignment?: { taskId: string; name: string; userId: string } | null;
  replies?: { id: string; body: string; createdAt: string; senderName: string; state: string }[];
  attachment: {
    id: string;
    filename: string;
    state: string;
    bytes: number;
    canDownload: boolean;
  } | null;
};
type Listing = { items: Inquiry[]; total: number; page: number };
function validInquiry(value: Inquiry) {
  return (
    !!value &&
    typeof value.id === "string" &&
    [
      value.name,
      value.email,
      value.type,
      value.message,
      value.status,
      value.createdAt,
    ].every((v) => typeof v === "string") &&
    Array.isArray(value.interests) &&
    value.interests.every((v) => typeof v === "string") &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    (value.assignment == null || (typeof value.assignment.taskId === "string" && typeof value.assignment.userId === "string" && typeof value.assignment.name === "string")) &&
    (value.replies === undefined || (Array.isArray(value.replies) && value.replies.every(reply=>!!reply && [reply.id,reply.body,reply.createdAt,reply.senderName].every(v=>typeof v==="string") && ["queued","sent","failed","cancelled"].includes(reply.state)))) &&
    typeof value.hold === "boolean" &&
    [value.resolvedAt, value.redactedAt, value.holdReason].every(
      (v) => v === null || typeof v === "string",
    ) &&
    (value.attachment === null ||
      (!!value.attachment &&
        typeof value.attachment.id === "string" &&
        typeof value.attachment.filename === "string" &&
        typeof value.attachment.state === "string" &&
        Number.isFinite(value.attachment.bytes) &&
        value.attachment.bytes >= 0 &&
        typeof value.attachment.canDownload === "boolean"))
  );
}
const inquiryStatus = (value:string) => ({new:"New",in_progress:"In progress",resolved:"Resolved",redacted:"Redacted"}[value] || value);
const date = (v?: string) => (v ? new Date(v).toLocaleString() : "—");
function InquiryReview({
  record: currentRecord,
  paused,
  onReload,
  onBusy,
  onDenied,
  onSaved,
  onClose,
  focusOnLoad,
}: {
  record: Inquiry;
  paused: boolean;
  onReload: () => void;
  onBusy: (busy: boolean) => void;
  onDenied: () => void;
  onSaved: () => void;
  onClose: () => void;
  focusOnLoad: boolean;
}) {
  const record = useRef(currentRecord).current,
    stale = currentRecord.revision !== record.revision,
    attachmentEpoch = useRef(0);
  const panel = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusOnLoad) return;
    // Recovery replaces the focused status panel. Return focus to the verified
    // record and align its entire panel below the persistent workspace toolbar.
    panel.current?.scrollIntoView?.({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [focusOnLoad]);
  const [status, setStatus] = useState(record.status),
    [hold, setHold] = useState(false),
    [reason, setReason] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [capability, setCapability] = useState<{
      url: string;
      filename: string;
      expiresAt: number;
    }>();
  const [composing, setComposing] = useState(false), [replyBody, setReplyBody] = useState("");
  function savedAction(action:string) {
    setReplyBody("");setComposing(false);onSaved();
    if(action === "reply") void confirmAction("Your reply is queued for email delivery.", {title:"Reply queued",confirmLabel:"OK",cancelLabel:"Close"});
  }
  const { busy: fileBusy, error: fileError, work } = usePrivateOperation(),
    safety = useNavigationSafety(),
    [writeBusy, setWriteBusy] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [writeError, setWriteError] = useState(""),
    [uncertain, setUncertain] = useState<InquiryWriteIntent>(),
    [writeConflict, setWriteConflict] = useState(false),
    activeWrite = useRef<{
      intent: InquiryWriteIntent;
      controller: AbortController;
    }>(),
    mounted = useRef(true),
    busy = fileBusy || writeBusy || recoveryBusy,
    error = writeError || fileError,
    locked = busy || paused || stale || !!uncertain || writeConflict;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeWrite.current?.controller.abort();
    };
  }, []);
  useEffect(() => {
    const offline = () => {
      if (activeWrite.current) {
        activeWrite.current.controller.abort();
        setUncertain(activeWrite.current.intent);
        activeWrite.current = undefined;
        setWriteBusy(false);
      }
    };
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);
  async function saveOriginal(
    document: Record<string, unknown>,
    proof?: string,
  ) {
    if (locked || activeWrite.current || !navigator.onLine) return;
    const intent = inquiryIntent(path, String(document.action), document),
      controller = new AbortController();
    activeWrite.current = { intent, controller };
    setWriteBusy(true);
    setWriteError("");
    setPassword("");
    setCapability(undefined);
    try {
      await submitInquiryWrite(intent, controller.signal, proof);
      if (mounted.current && !controller.signal.aborted) savedAction(String(document.action));
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      if (
        e instanceof ApiFailure &&
        (e.status === 401 ||
          e.status === 404 ||
          (e.status === 403 && e.code !== "PASSWORD_REQUIRED"))
      ) {
        onDenied();
        return;
      }
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(intent);
        return;
      }
      if (e.status === 409) setWriteConflict(true);
      setWriteError(e.message);
    } finally {
      if (activeWrite.current?.intent === intent)
        activeWrite.current = undefined;
      if (mounted.current && !controller.signal.aborted) setWriteBusy(false);
    }
  }
  useEffect(() => {
    onBusy(busy || !!uncertain);
  }, [busy, uncertain, onBusy]);
  useEffect(() => {
    if (paused || stale) {
      attachmentEpoch.current++;
      setCapability(undefined);
    }
  }, [paused, stale]);
  useDraftGuard(hold || status !== record.status || !!uncertain || !!replyBody.trim(), {
    busy: busy || !!uncertain,
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
    const timer = setTimeout(
      () => setCapability(undefined),
      Math.max(0, capability.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [capability]);
  const path = "/admin/contact-submissions/" + record.id,
    expected = record.hold ? "RELEASE HOLD" : "HOLD CONTACT";
  const saveHold = () =>
    saveOriginal(
      {
        action: "hold",
        revision: record.revision,
        enabled: !record.hold,
        reason,
        confirmation,
      },
      password,
    );
  return (
    <section
      ref={panel}
      className="gt-panel gt-contact-inbox-review"
      aria-label="Contact inquiry review"
    >
      <header className="gt-inline-actions">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {record.name}
          </h2>
          <p className="gt-helper">
            {record.type} · received {date(record.createdAt)} · revision{" "}
            {record.revision}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy || !!uncertain}
          onClick={() => navigate(onClose)}
        >
          Back to inbox
        </Button>
      </header>
      {(paused || stale) && (
        <div role="status" className="gt-form-error">
          <p>
            {stale
              ? "This inquiry changed. Your proposed fields are preserved; review the current saved inquiry before continuing."
              : "Inquiry actions are paused until a current private read is verified."}
          </p>
          {stale && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy || paused || !!uncertain}
              onClick={() => navigate(onReload)}
            >
              Review loading current inquiry
            </Button>
          )}
        </div>
      )}
      {uncertain && (
        <InquiryWriteRecovery
          key={uncertain.key}
          intent={uncertain}
          onConfirmed={(receipt) => savedAction(receipt.action)}
          onDenied={onDenied}
          onBusy={setRecoveryBusy}
          onStop={() => {
            setUncertain(undefined);
            setPassword("");
            setConfirmation("");
            setReason("");
            setHold(false);
            setStatus(record.status);
            setWriteConflict(true);
            setWriteError(
              "Inquiry recovery stopped. The original outcome is unconfirmed. Refresh the inquiry before reviewing another change.",
            );
          }}
        />
      )}
      {writeConflict && !stale && (
        <div role="status">
          <p>
            Inspect the current saved inquiry before making another change.
            Loading it clears proposed fields.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || paused || !!uncertain}
            onClick={() => navigate(onReload)}
          >
            Review loading current inquiry
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      <div className="gt-inline-actions">
        <Badge>{inquiryStatus(record.status)}</Badge>
        {record.hold && <Badge tone="warning">Retention hold</Badge>}
      </div>
      {record.email && (
        <p>
          <strong>Reply address:</strong> {record.email}
        </p>
      )}
      {record.assignment ? <p><strong>Assigned to:</strong> {record.assignment.name} <ActionLink to={`/admin/communications?tab=tasks&task=${record.assignment.taskId}`} variant="ghost">Open follow-up task</ActionLink></p> : !record.redactedAt && <div className="gt-inline-actions"><span className="gt-helper">No follow-up owner assigned.</span>{["new","in_progress"].includes(record.status) && <Button type="button" variant="secondary" disabled={locked} onClick={()=>void saveOriginal({action:"assign",revision:record.revision})}>Assign follow-up</Button>}</div>}
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
              disabled={locked}
              onClick={() => {
                if (locked) return;
                const expectedEpoch = attachmentEpoch.current;
                const startedAt = Date.now();
                void work(
                  async (signal) => {
                    try {
                      const value = await api<{
                        url: string;
                        filename: string;
                        expiresIn: number;
                      }>(path + "/attachment", { signal });
                      if (
                        typeof value?.filename !== "string" ||
                        !value.filename.length
                      )
                        throw Error(
                          "The private download filename could not be verified. Prepare a new authorized link.",
                        );
                      return {
                        ...authorizedPrivateDownload(value, startedAt),
                        filename: value.filename,
                      };
                    } catch (error) {
                      if (
                        error instanceof ApiFailure &&
                        [401, 403, 404].includes(error.status)
                      )
                        onDenied();
                      throw error;
                    }
                  },
                  (value) => {
                    if (attachmentEpoch.current === expectedEpoch)
                      setCapability(value);
                  },
                );
              }}
            >
              Prepare private download
            </Button>
          )}
          {capability && !locked && (
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
      {!record.redactedAt && record.email && <section aria-label="Reply to inquiry" className="gt-contact-reply">
        {!composing ? <Button type="button" disabled={locked} onClick={()=>setComposing(true)}>Reply to {record.name}</Button> : <form className="gt-form" aria-label="Email reply" onSubmit={e=>{e.preventDefault();if(!replyBody.trim() || locked)return;void saveOriginal({action:"reply",revision:record.revision,body:replyBody.trim()})}}>
          <h3>Reply by email</h3>
          <p>To: {record.email}<br/>From: contact@gdggt.dev</p>
          <Field label="Your reply" required><textarea autoFocus value={replyBody} maxLength={5000} rows={7} disabled={locked} onChange={e=>setReplyBody(e.target.value)}/></Field>
          <div className="gt-inline-actions"><Button disabled={locked || !replyBody.trim()}>Send reply</Button><Button type="button" variant="secondary" disabled={busy || !!uncertain} onClick={()=>navigate(()=>{setComposing(false);setReplyBody("")})}>Cancel reply</Button></div>
        </form>}
      </section>}
      {!!record.replies?.length && <section aria-label="Email replies"><h3>Email replies</h3><div className="gt-contact-replies">{record.replies.map(reply=><article key={reply.id}><div className="gt-inline-actions"><strong>{reply.senderName}</strong><Badge>{reply.state === "sent" ? "Sent" : reply.state === "failed" ? "Failed" : reply.state === "cancelled" ? "Cancelled" : "Queued"}</Badge><time dateTime={reply.createdAt}>{date(reply.createdAt)}</time></div><p className="gt-contact-inbox-message">{reply.body}</p></article>)}</div></section>}
      {!record.redactedAt && (
        <>
          <form
            className="gt-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (locked) return;
              void saveOriginal({
                action: "status",
                revision: record.revision,
                status,
              });
            }}
          >
            <Field label="Inquiry status">
              <select
                value={status}
                disabled={locked || hold}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="new">New</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
              </select>
            </Field>
            <p className="gt-helper">
              Resolved inquiries, replies and attachments are redacted after 365
              days unless an operational/legal hold applies. Reopening removes
              the resolution deadline; it does not remove a hold.
            </p>
            <Button disabled={locked || status === record.status || hold}>
              {busy ? "Working…" : "Save inquiry status"}
            </Button>
          </form>
          {!hold ? (
            <Button
              variant="secondary"
              disabled={locked || status !== record.status}
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
                  ? "If resolution was more than 365 days ago, releasing this hold allows the next scheduled cleanup to erase message identity and private attachment bytes. That cleanup cannot be undone."
                  : "Use holds for a genuine operational/legal need. A hold prevents scheduled identity and attachment cleanup."}
              </p>
              {!record.hold && (
                <Field label="Reason for retention hold" required>
                  <textarea
                    minLength={10}
                    maxLength={1000}
                    rows={3}
                    value={reason}
                    disabled={locked}
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
                  disabled={locked}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label={`Type ${expected} to confirm`} required>
                <input
                  value={confirmation}
                  maxLength={30}
                  autoComplete="off"
                  disabled={locked}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
              <div className="gt-inline-actions">
                <Button
                  disabled={
                    locked ||
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
                  disabled={locked}
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
  const { currentAdmin } = useAdmin(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <Inbox
      key={JSON.stringify([currentAdmin?.id, currentAdmin?.role, epoch])}
    />
  );
}
function Inbox() {
  const [params, setParams] = useApprovedSearchParams(),
    id = params.get("contact"),
    [query, setQuery] = useState(""),
    [q, setQ] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [denied, setDenied] = useState(false),
    [needsRecheck, setNeedsRecheck] = useState(!navigator.onLine),
    [reviewEpoch, setReviewEpoch] = useState(0),
    [detailBusy, setDetailBusy] = useState(false);
  const safety = useNavigationSafety(),
    { isOnline } = useOnlineStatus();
  useLiveSearch(query, q, (value) => { setQ(value); setPage(1); }, !id && !denied && !detailBusy && isOnline && !needsRecheck);
  const path =
    "/admin/contact-submissions" +
    (id
      ? "/" + encodeURIComponent(id)
      : "?" +
        new URLSearchParams({
          q,
          ...(status ? { status } : {}),
          page: String(page),
        }));
  const read = usePrivateRead<Listing>(denied ? undefined : path, tick),
    clear = read.clear;
  const malformed =
      read.data !== undefined &&
      (!read.data ||
        !Array.isArray(read.data.items) ||
        !read.data.items.every(validInquiry) ||
        !Number.isInteger(read.data.total) ||
        read.data.total < 0 ||
        (!!id &&
          (read.data.items.length !== 1 || read.data.items[0]?.id !== id))),
    list = malformed ? undefined : read.data,
    error = malformed
      ? "The current inquiry reply could not be verified. Refresh this view to retry."
      : read.error,
    paused = !isOnline || needsRecheck || denied || read.loading || !!error;
  useEffect(() => {
    if (read.denied) {
      clear();
      setDenied(true);
      setDetailBusy(false);
    }
  }, [read.denied, clear]);
  useEffect(() => {
    if (!isOnline) setNeedsRecheck(true);
  }, [isOnline]);
  const refresh = () => {
    if (!navigator.onLine || detailBusy) return;
    setDenied(false);
    setNeedsRecheck(false);
    setTick((n) => n + 1);
  };
  const navigate = (contact?: string) => {
    const run = () => {
      setDetailBusy(false);
      setParams({ tab: "contact", ...(contact ? { contact } : {}) });
    };
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
          disabled={detailBusy || !isOnline}
          onClick={refresh}
        >
          {id ? "Refresh inquiry" : "Refresh inbox"}
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
      {!id && !denied && (
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
      )}
      {!isOnline || needsRecheck ? (
        <p role="status">
          Contact actions are paused.{" "}
          {!isOnline ? "You’re offline." : "Connection restored."} Refresh this
          private view before continuing.
        </p>
      ) : null}
      {denied ? (
        <p role="alert" className="gt-form-error">
          Contact inbox access could not be verified. Private records and
          reviews have been cleared. Refresh current access to continue.
        </p>
      ) : (
        <>
          {read.loading && !list && (
            <div
              role="status"
              aria-label={
                id ? "Loading selected inquiry" : "Loading contact inbox"
              }
            >
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading protected inquiries…</span>
            </div>
          )}
          {(error || (!isOnline && read.at)) && (
            <div role={error ? "alert" : "status"} className="gt-form-error">
              {error && <p>{error}</p>}
              {read.at && (
                <p>
                  Showing inquiries from{" "}
                  <time dateTime={read.at}>
                    {new Date(read.at).toLocaleString()}
                  </time>
                  . This snapshot may be out of date.
                </p>
              )}
              {error && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={detailBusy || !isOnline || read.loading}
                  onClick={refresh}
                >
                  {id ? "Retry selected inquiry" : "Retry contact inbox"}
                </Button>
              )}
            </div>
          )}
        </>
      )}
      {id && !list && (
        <Button
          type="button"
          variant="secondary"
          disabled={detailBusy}
          onClick={() => navigate()}
        >
          Back to inbox
        </Button>
      )}
      {!id && (q || status || page > 1) && (
        <Button
          type="button"
          variant="secondary"
          disabled={detailBusy || !isOnline}
          onClick={() => {
            setQ("");
            setQuery("");
            setStatus("");
            setPage(1);
          }}
        >
          Reset inquiry filters
        </Button>
      )}
      {!id && !list && page > 1 && (
        <Button
          type="button"
          variant="secondary"
          disabled={detailBusy || !isOnline || read.loading}
          onClick={() => setPage((n) => Math.max(1, n - 1))}
        >
          Previous
        </Button>
      )}
      {!list ? (
        !read.loading && !denied ? (
          <EmptyState title="Contact inbox unavailable">
            Refresh current access to load these inquiries. Saved records have
            not been changed.
          </EmptyState>
        ) : null
      ) : id ? (
        <InquiryReview
          key={JSON.stringify([id, reviewEpoch, list.items[0].redactedAt])}
          record={list.items[0]}
          focusOnLoad={reviewEpoch > 0}
          paused={paused}
          onBusy={setDetailBusy}
          onDenied={() => {
            clear();
            setDenied(true);
            setDetailBusy(false);
          }}
          onReload={() => {
            clear();
            setReviewEpoch((n) => n + 1);
            setTick((n) => n + 1);
          }}
          onClose={() => navigate()}
          onSaved={() => {
            setDetailBusy(false);
            clear();
            setReviewEpoch((n) => n + 1);
            setTick((n) => n + 1);
          }}
        />
      ) : (
        <>
          {!list.items.length ? (
            <EmptyState title="No matching inquiries">
              New messages submitted through the contact page appear here.
              Attachments remain private.
            </EmptyState>
          ) : (
            <ScrollableTable
              className="gt-table-wrap"
              label="Protected contact inquiries"
            >
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
                        <Button
                          variant="ghost"
                          disabled={paused}
                          onClick={() => navigate(r.id)}
                        >
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
                        <Badge>{inquiryStatus(r.status)}</Badge>
                        {r.hold && <small>Retention hold</small>}
                        {r.assignment && <small>Assigned to {r.assignment.name}</small>}
                      </td>
                      <td>{date(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
          <div className="gt-inline-actions">
            <span>
              {list.total} matching inquiries · page {page}
            </span>
            <Button
              variant="secondary"
              disabled={!isOnline || read.loading || page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={!isOnline || read.loading || page * 50 >= list.total}
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
