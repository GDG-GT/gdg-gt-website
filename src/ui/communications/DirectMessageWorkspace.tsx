import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  useApprovedSearchParams as useSearchParams,
  useDraftGuard,
} from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import ContactInboxLink from "./ContactInboxLink";
import { validationMessage } from "@/lib/validationMessage";
import { useScopedRealtime } from "@/hooks/useScopedRealtime";
import { useAdmin } from "@/contexts/AdminContext";
import {
  directCreate,
  directReply,
  directEdit,
  directReview,
} from "../../../shared/direct-messages.mjs";
import {
  ActionLink,
  Badge,
  Button,
  EmptyState,
  Field,
  SearchBox,
} from "../primitives";
type Cursor = { before: string; beforeId: string };
type Thread = {
  id: string;
  subject: string;
  revision: number;
  created_at: string;
  updated_at: string;
  participant: boolean;
  participantA: string;
  participantB: string;
  nameA: string | null;
  nameB: string | null;
  archived: boolean;
  stateRevision: number;
  unread: number;
  canReply: boolean;
};
type Message = {
  id: string;
  from_user_id: string;
  authorName: string | null;
  message: string;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  replyToId: string | null;
  replyPreview: string | null;
  own: boolean;
};
type Listing = {
  items: Thread[];
  nextCursor: Cursor | null;
  total: number;
  unread: number;
  actorId: string;
  canReview: boolean;
};
type History = { items: Message[]; nextCursor: Cursor | null };
type Review = { active: boolean; expiresAt: string | null };
const base = "/admin/communications/messages";
const stamp = (v: string) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
export default function DirectMessageWorkspace({
  personal = false,
}: {
  personal?: boolean;
}) {
  const { currentAdmin } = useAdmin();
  const [params, setParams] = useSearchParams(),
    selected = params.get("thread") || "";
  const [listing, setListing] = useState<Listing>(),
    [record, setRecord] = useState<Thread>(),
    [history, setHistory] = useState<History>();
  const [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [scope, setScope] = useState("own"),
    [listCursor, setListCursor] = useState<Cursor>();
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [listError, setListError] = useState(""),
    [threadError, setThreadError] = useState(""),
    [notice, setNotice] = useState("");
  const [compose, setCompose] = useState(false),
    [recipient, setRecipient] = useState(""),
    [subject, setSubject] = useState(""),
    [body, setBody] = useState("");
  const [editing, setEditing] = useState<Message>(),
    [editBody, setEditBody] = useState(""),
    [replyTo, setReplyTo] = useState<Message>(),
    [removing, setRemoving] = useState<Message>();
  const [review, setReview] = useState<Review>({
      active: false,
      expiresAt: null,
    }),
    [reviewForm, setReviewForm] = useState(false),
    [reason, setReason] = useState(""),
    [password, setPassword] = useState("");
  const selectedRef = useRef(selected),
    seq = useRef(0),
    listSeq = useRef(0),
    mounted = useRef(true),
    mutationKey = useRef<{ signature: string; key: string }>();
  const reviewDeadline = useRef(0),
    refreshTimer = useRef<ReturnType<typeof setTimeout>>(),
    historyBefore = useRef<Cursor>();
  reviewDeadline.current =
    review.active && review.expiresAt ? Date.parse(review.expiresAt) : 0;
  selectedRef.current = selected;
  const dirty = !!(
    body ||
    recipient ||
    subject ||
    editBody ||
    reason ||
    password
  );
  const reviewExpiry = useRef<ReturnType<typeof setTimeout>>();
  useDraftGuard(dirty, { busy, label: "Private message or review input" });
  const fail = useCallback(
    (e: unknown) =>
      setError(
        e instanceof Error
          ? e.message
          : "This conversation could not load. Try again.",
      ),
    [],
  );
  const clearPrivate = useCallback(() => {
    seq.current++;
    listSeq.current++;
    setListing(undefined);
    setRecord(undefined);
    setHistory(undefined);
    setBody("");
    setEditBody("");
    setEditing(undefined);
    setRemoving(undefined);
    setReplyTo(undefined);
    setRecipient("");
    setSubject("");
    setCompose(false);
    setReason("");
    setPassword("");
    setReview({ active: false, expiresAt: null });
  }, []);
  useEffect(() => {
    mounted.current = true;
    window.addEventListener("gdg:session-cleared", clearPrivate);
    return () => {
      mounted.current = false;
      window.removeEventListener("gdg:session-cleared", clearPrivate);
    };
  }, [clearPrivate]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  const readList = useCallback(async () => {
    const request = ++listSeq.current;
    try {
      const q = new URLSearchParams({
        q: query,
        archived: archived ? "1" : "0",
        scope,
        ...listCursor,
      });
      const result = await api<Listing>(base + "?" + q);
      if (
        request === listSeq.current &&
        mounted.current &&
        (scope !== "review" || reviewDeadline.current > Date.now())
      ) {
        setListing(result);
        setListError("");
      }
    } catch (e) {
      if (request === listSeq.current && mounted.current) {
        setListing(undefined);
        if (
          scope === "review" &&
          e instanceof ApiFailure &&
          [401, 403].includes(e.status)
        ) {
          reviewDeadline.current = 0;
          seq.current++;
          setReview({ active: false, expiresAt: null });
          setScope("own");
          setListCursor(undefined);
          setRecord((r) => (r?.participant ? r : undefined));
          setHistory(undefined);
        }
        setListError(
          e instanceof Error ? e.message : "The inbox could not refresh.",
        );
      }
    } finally {
      if (request === listSeq.current && mounted.current) setLoading(false);
    }
  }, [query, archived, scope, listCursor]);
  const readThread = useCallback(async () => {
    const id = selectedRef.current;
    if (!id) return;
    const request = ++seq.current;
    try {
      const windowQuery = historyBefore.current
        ? "?" + new URLSearchParams(historyBefore.current)
        : "";
      const [detail, messages] = await Promise.all([
        api<{ record: Thread }>(base + "/" + id),
        api<History>(base + "/" + id + "/history" + windowQuery),
      ]);
      if (
        request === seq.current &&
        selectedRef.current === id &&
        mounted.current
      ) {
        if (!detail.record.participant && reviewDeadline.current <= Date.now())
          return;
        setRecord(detail.record);
        setHistory(messages);
        setThreadError("");
      }
    } catch (e) {
      if (
        request === seq.current &&
        selectedRef.current === id &&
        mounted.current
      ) {
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          setRecord(undefined);
          setHistory(undefined);
          setEditing(undefined);
          setEditBody("");
          setBody("");
          setReplyTo(undefined);
          setRemoving(undefined);
        }
        setThreadError(
          e instanceof Error
            ? e.message
            : "This conversation could not refresh.",
        );
      }
    }
  }, []);
  const refresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      void readList();
      void readThread();
    }, 200);
  }, [readList, readThread]);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);
  const live = useScopedRealtime(
    selected ? { kind: "direct-thread", id: selected } : null,
    refresh,
    () => {
      setRecord(undefined);
      setHistory(undefined);
      void readThread();
    },
  );
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => void readList(), 200);
    return () => clearTimeout(t);
  }, [readList]);
  useEffect(() => {
    seq.current++;
    historyBefore.current = undefined;
    setRecord(undefined);
    setHistory(undefined);
    void readThread();
  }, [selected, readThread]);
  useEffect(() => {
    if (!replyTo || !history) return;
    const latest = history.items.find((m) => m.id === replyTo.id);
    if (latest?.deleted_at) {
      setReplyTo(undefined);
      setNotice(
        "The referenced message was removed. Your reply draft is preserved.",
      );
    } else if (latest && latest.revision !== replyTo.revision)
      setReplyTo(latest);
  }, [history, replyTo]);
  useEffect(() => {
    const t = setInterval(
      () => {
        if (!document.hidden) refresh();
      },
      live === "live" ? 30000 : 5000,
    );
    return () => clearInterval(t);
  }, [refresh, live]);
  useEffect(() => {
    if (!listing?.canReview) return;
    let stopped = false;
    api<Review>(base + "/review")
      .then((r) => {
        if (!stopped) setReview(r);
      })
      .catch(fail);
    return () => {
      stopped = true;
    };
  }, [listing?.canReview, fail]);
  useEffect(() => {
    if (reviewExpiry.current) clearTimeout(reviewExpiry.current);
    if (!review.active || !review.expiresAt) return;
    reviewExpiry.current = setTimeout(
      () => {
        reviewDeadline.current = 0;
        seq.current++;
        listSeq.current++;
        setReview({ active: false, expiresAt: null });
        setScope("own");
        setListCursor(undefined);
        setListing(undefined);
        // Do not leave an expired oversight body rendered while HTTP is pending.
        if (record && !record.participant) {
          seq.current++;
          setRecord(undefined);
          setHistory(undefined);
        }
        setNotice(
          "Message review expired. Your own conversations remain available.",
        );
        window.dispatchEvent(new Event("gdg:access-changed"));
      },
      Math.max(0, new Date(review.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(reviewExpiry.current);
  }, [review, record]);
  function canLeave() {
    return !dirty || confirm("Discard the unsaved message changes?");
  }
  function choose(id = "", newMessage = false) {
    if (busy || !canLeave()) return;
    setBody("");
    setRecipient("");
    setSubject("");
    setEditing(undefined);
    setEditBody("");
    setReplyTo(undefined);
    setRemoving(undefined);
    setCompose(newMessage);
    setError("");
    setNotice("");
    const next = new URLSearchParams(params);
    next.set("tab", "messages");
    if (id) next.set("thread", id);
    else next.delete("thread");
    setParams(next);
  }
  async function mutate(path: string, document: unknown) {
    const signature = path + JSON.stringify(document);
    if (mutationKey.current?.signature !== signature)
      mutationKey.current = { signature, key: crypto.randomUUID() };
    const result = await api<{ id: string }>(path, {
      method: "POST",
      protected: true,
      body: document,
      idempotencyKey: mutationKey.current.key,
    });
    mutationKey.current = undefined;
    return result;
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const id = selected;
    try {
      const document = compose
        ? directCreate.parse({
            recipientEmail: recipient,
            subject,
            message: body,
          })
        : directReply.parse({ message: body, replyToId: replyTo?.id || null });
      const result = await mutate(
        compose ? base : base + "/" + id + "/items",
        document,
      );
      if (!mounted.current || id !== selectedRef.current) return;
      historyBefore.current = undefined;
      setBody("");
      setRecipient("");
      setSubject("");
      setReplyTo(undefined);
      setCompose(false);
      setNotice("Message sent.");
      if (result.id !== selected) {
        const next = new URLSearchParams(params);
        next.set("tab", "messages");
        next.set("thread", result.id);
        setParams(next);
      }
      refresh();
    } catch (e) {
      setError(
        validationMessage(e, "Check the message fields.", {
          recipientEmail: "Recipient email",
          subject: "Subject",
          message: "Message",
        }),
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function editMessage(e: FormEvent) {
    e.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate(
        base + "/" + selected + "/items/" + editing.id,
        directEdit.parse({
          action: "edit",
          revision: editing.revision,
          message: editBody,
        }),
      );
      setEditing(undefined);
      setEditBody("");
      setNotice("Message updated.");
      refresh();
    } catch (e) {
      setError(
        e instanceof ApiFailure && e.code === "CONFLICT"
          ? "This message changed. Your draft is preserved below. Cancel the edit to load its current version."
          : validationMessage(e, "Check the message.", { message: "Message" }),
      );
    } finally {
      setBusy(false);
    }
  }
  async function messageState(item: Message, action: "delete" | "restore") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate(base + "/" + selected + "/items/" + item.id, {
        action,
        revision: item.revision,
      });
      setRemoving(undefined);
      setNotice(
        action === "delete"
          ? "Message removed. You can restore it from its retained placeholder."
          : "Message restored.",
      );
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function threadState(action: "archive" | "restore" | "read") {
    if (!record || !history || busy) return;
    setBusy(true);
    setError("");
    try {
      await mutate(
        base + "/" + selected,
        action === "read"
          ? { action, throughId: history.items.at(-1)?.id }
          : { action, revision: record.stateRevision },
      );
      setNotice(
        action === "read"
          ? "Loaded messages marked as read."
          : action === "archive"
            ? "Archived for you. The other participant’s inbox is unchanged."
            : "Conversation restored to your inbox.",
      );
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    if (!history?.nextCursor || busy) return;
    setBusy(true);
    const id = selected;
    const cursor = history.nextCursor;
    seq.current++;
    try {
      const r = await api<History>(
        base + "/" + id + "/history?" + new URLSearchParams(cursor),
      );
      if (id === selectedRef.current) {
        historyBefore.current = cursor;
        setHistory(r);
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function reviewAction(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const document = directReview.parse(
        review.active
          ? { action: "stop" }
          : { action: "start", reason, currentPassword: password },
      );
      const result = await api<Review>(base + "/review", {
        method: "POST",
        protected: true,
        body: document,
      });
      reviewDeadline.current = result.active
        ? Date.parse(result.expiresAt!)
        : 0;
      seq.current++;
      listSeq.current++;
      setReview(result);
      setReviewForm(false);
      setReason("");
      setScope(result.active ? "review" : "own");
      setListCursor(undefined);
      setListing(undefined);
      if (!result.active && record && !record.participant) {
        seq.current++;
        setRecord(undefined);
        setHistory(undefined);
        const next = new URLSearchParams(params);
        next.set("tab", "messages");
        next.delete("thread");
        setParams(next);
      }
      window.dispatchEvent(new Event("gdg:access-changed"));
      setNotice(
        result.active
          ? "Read-only review is active for five minutes. Reads are audited."
          : "Message review ended.",
      );
    } catch (e) {
      setError(
        validationMessage(e, "Check the review request.", {
          reason: "Review reason",
          currentPassword: "Current password",
        }),
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  const peerName = (t: Thread) =>
    currentAdmin?.id === t.participantA
      ? t.nameB
      : t.participant
        ? t.nameA
        : `${t.nameA || "Chapter account"} · ${t.nameB || "Chapter account"}`;
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Communications</h1>
          <p>
            Private chapter conversations, with clear context and room to follow
            through.
          </p>
        </div>
        <Button disabled={busy} onClick={() => choose("", true)}>
          New message
        </Button>
      </header>
      {!personal && (
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
          <span className="gt-button" aria-current="page">
            Messages
          </span>
          <ContactInboxLink />
        </nav>
      )}
      {error && (
        <p className="gt-form-error" role="alert">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              refresh();
            }}
          >
            Check again
          </button>
        </p>
      )}
      {(listError || threadError) && (
        <p className="gt-form-error" role="alert">
          {threadError || listError}{" "}
          <button onClick={refresh}>Retry loading</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {listing?.canReview && (
        <details
          className="gt-direct-review"
          open={review.active || reviewForm || undefined}
        >
          <summary>
            {review.active ? "Read-only review active" : "Super Admin review"}
          </summary>
          <p>
            {review.active
              ? `Expires ${stamp(review.expiresAt!)}. Conversation reads are recorded in the audit log.`
              : "Your inbox shows only your conversations. Exceptional Super Admin review requires your password and a recorded reason."}
          </p>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              review.active ? void reviewAction() : setReviewForm((v) => !v)
            }
          >
            {review.active
              ? "End review"
              : reviewForm
                ? "Close review request"
                : "Request review"}
          </Button>
        </details>
      )}
      {reviewForm && !review.active && (
        <form className="gt-event-editor" onSubmit={reviewAction}>
          <h2>Request five-minute review</h2>
          <p>
            Read-only access to chapter conversations. You cannot send as
            another person, change their messages, or mark their inbox read.
          </p>
          <Field label="Review reason" required>
            <textarea
              required
              minLength={10}
              maxLength={500}
              rows={3}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <Field label="Current password" required>
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button disabled={busy}>
            {busy ? "Confirming…" : "Start audited review"}
          </Button>
        </form>
      )}
      {compose && (
        <form className="gt-event-editor" onSubmit={send}>
          <h2>New private conversation</h2>
          <p>
            Only you and the recipient receive this conversation. Authorized
            Super Admins may read it through audited review. Email notices
            contain no message text.
          </p>
          <Field
            label="Recipient email"
            hint="Exact email of an active chapter account. There is no public account directory."
            required
          >
            <input
              type="email"
              required
              autoComplete="off"
              maxLength={255}
              disabled={busy}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </Field>
          <Field label="Subject" required>
            <input
              required
              maxLength={200}
              disabled={busy}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field label="Message" required>
            <textarea
              rows={7}
              disabled={busy}
              required
              maxLength={10000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <p className="gt-help">
            Plain text, up to 10,000 characters. Attachments are not available
            in this workflow yet.
          </p>
          <div className="gt-button-row">
            <Button disabled={busy}>
              {busy ? "Sending…" : "Send message"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => choose()}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!compose && (
        <div
          className={`gt-direct-layout ${selected ? "gt-direct-selected" : ""}`}
        >
          <section className="gt-direct-inbox" aria-label="Conversation inbox">
            <div className="gt-panel-heading">
              <h2>
                {scope === "review"
                  ? "Chapter review"
                  : archived
                    ? "Archived conversations"
                    : "Your inbox"}
              </h2>
              {listing && (
                <span>
                  {listing.total} conversation{listing.total === 1 ? "" : "s"} ·{" "}
                  {listing.unread} unread
                </span>
              )}
            </div>
            <SearchBox
              label="Search conversation subjects"
              placeholder="Search subjects"
              value={query}
              onChange={(v) => {
                setQuery(v);
                setListCursor(undefined);
              }}
            />
            <div className="gt-button-row gt-direct-filters">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setArchived((v) => !v);
                  setListCursor(undefined);
                }}
              >
                {archived ? "Show inbox" : "Show archived"}
              </Button>
              {review.active && (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setScope((v) => (v === "own" ? "review" : "own"));
                    setListCursor(undefined);
                  }}
                >
                  {scope === "own" ? "Show chapter review" : "Show own inbox"}
                </Button>
              )}
            </div>
            {loading && !listing ? (
              <p role="status">Loading conversations…</p>
            ) : listing?.items.length ? (
              <ul className="gt-direct-list">
                {listing.items.map((t) => (
                  <li key={t.id}>
                    <button
                      className={t.id === selected ? "is-selected" : ""}
                      aria-current={t.id === selected ? "page" : undefined}
                      onClick={() => choose(t.id)}
                      disabled={busy}
                    >
                      <span>
                        <strong>{t.subject}</strong>
                        {!!t.unread && (
                          <Badge tone="coral">{t.unread} unread</Badge>
                        )}
                      </span>
                      <span>{peerName(t) || "Chapter account"}</span>
                      <time dateTime={t.updated_at}>{stamp(t.updated_at)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title={
                  query
                    ? "No matching conversations"
                    : archived
                      ? "No archived conversations"
                      : "You’re all caught up"
                }
              >
                {query
                  ? "Try a different subject."
                  : "Start a private conversation using an exact chapter-account email."}
              </EmptyState>
            )}
            <div className="gt-button-row">
              <Button
                variant="ghost"
                disabled={!listCursor || busy}
                onClick={() => setListCursor(undefined)}
              >
                Latest
              </Button>
              <Button
                variant="ghost"
                disabled={!listing?.nextCursor || busy}
                onClick={() => setListCursor(listing?.nextCursor || undefined)}
              >
                Older conversations
              </Button>
            </div>
          </section>
          <section
            className="gt-direct-thread"
            aria-label="Selected conversation"
          >
            {selected && (
              <Button variant="ghost" disabled={busy} onClick={() => choose()}>
                Back to inbox
              </Button>
            )}
            {!selected ? (
              <EmptyState title="A little context goes a long way">
                Choose a conversation to read its history or send a follow-up.
              </EmptyState>
            ) : !record || !history ? (
              <p role="status">
                {error
                  ? "This conversation is currently unavailable."
                  : "Loading conversation…"}
              </p>
            ) : (
              <>
                <header className="gt-direct-heading">
                  <div>
                    <h2>{record.subject}</h2>
                    <p>{peerName(record) || "Chapter account"}</p>
                  </div>
                  <Badge tone={live === "live" ? "success" : "neutral"}>
                    {live === "live" ? "Live updates" : "Protected refresh"}
                  </Badge>
                </header>
                {!record.participant && (
                  <p className="gt-help">
                    Read-only administrative review. Opening this conversation
                    is audited.
                  </p>
                )}
                {record.participant && (
                  <div className="gt-button-row">
                    <Button
                      variant="ghost"
                      disabled={busy || !!editing || !!body}
                      onClick={() =>
                        void threadState(
                          record.archived ? "restore" : "archive",
                        )
                      }
                    >
                      {record.archived ? "Restore to inbox" : "Archive for me"}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || !record.unread || !history.items.length}
                      onClick={() => void threadState("read")}
                    >
                      Mark loaded messages read
                    </Button>
                  </div>
                )}
                {(history.nextCursor || historyBefore.current) && (
                  <div className="gt-button-row">
                    {historyBefore.current && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          historyBefore.current = undefined;
                          void readThread();
                        }}
                      >
                        Latest messages
                      </Button>
                    )}
                    {history.nextCursor && (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void older()}
                      >
                        Earlier 50 messages
                      </Button>
                    )}
                  </div>
                )}
                <ol className="gt-direct-history">
                  {history.items.map((m) => (
                    <li key={m.id} className={m.own ? "is-own" : ""}>
                      <header>
                        <strong>{m.authorName || "Chapter account"}</strong>
                        <time dateTime={m.created_at}>
                          {stamp(m.created_at)}
                        </time>
                        {m.updated_at > m.created_at && !m.deleted_at && (
                          <small>Edited</small>
                        )}
                      </header>
                      {editing?.id === m.id ? (
                        <form onSubmit={editMessage}>
                          <Field label="Edit message" required>
                            <textarea
                              required
                              rows={5}
                              disabled={busy}
                              maxLength={10000}
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                            />
                          </Field>
                          {editing.revision !== m.revision && (
                            <p className="gt-form-error" role="alert">
                              This message changed. Your unsaved text is
                              preserved. Cancel to use its current version.
                            </p>
                          )}
                          <div className="gt-button-row">
                            <Button
                              disabled={busy || editing.revision !== m.revision}
                            >
                              Save edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                setEditing(undefined);
                                setEditBody("");
                              }}
                            >
                              Cancel edit
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <>
                          {m.replyPreview && (
                            <blockquote>{m.replyPreview}</blockquote>
                          )}
                          <p className="gt-direct-body">
                            {m.deleted_at
                              ? "Message removed by its author."
                              : m.message}
                          </p>
                          <footer>
                            {m.own && !m.deleted_at && (
                              <small>
                                {m.read_at
                                  ? `Read ${stamp(m.read_at)}`
                                  : "Not read yet"}
                              </small>
                            )}
                            {record.participant && !editing && (
                              <div className="gt-button-row">
                                {!m.deleted_at && record.canReply && (
                                  <Button
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => setReplyTo(m)}
                                  >
                                    Reply to this
                                  </Button>
                                )}
                                {m.own && !m.deleted_at && (
                                  <Button
                                    variant="ghost"
                                    disabled={busy || !!body}
                                    onClick={() => {
                                      setEditing(m);
                                      setEditBody(m.message);
                                      setRemoving(undefined);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                )}
                                {m.own && (
                                  <Button
                                    variant="ghost"
                                    disabled={busy || !!body}
                                    onClick={() =>
                                      m.deleted_at
                                        ? void messageState(m, "restore")
                                        : setRemoving(m)
                                    }
                                  >
                                    {m.deleted_at
                                      ? "Restore message"
                                      : "Remove"}
                                  </Button>
                                )}
                              </div>
                            )}
                          </footer>
                          {removing?.id === m.id && (
                            <div className="gt-direct-confirm">
                              <p>
                                Remove this message from the visible
                                conversation? A retained placeholder remains,
                                and you can restore it.
                              </p>
                              <div className="gt-button-row">
                                <Button
                                  variant="danger"
                                  disabled={busy}
                                  onClick={() => void messageState(m, "delete")}
                                >
                                  Remove message
                                </Button>
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => setRemoving(undefined)}
                                >
                                  Keep message
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ol>
                {record.participant &&
                  !editing &&
                  (record.canReply || body) && (
                    <form className="gt-channel-composer" onSubmit={send}>
                      {replyTo && (
                        <div className="gt-direct-reply">
                          <p>
                            Replying to{" "}
                            {replyTo.authorName || "chapter account"}:{" "}
                            {replyTo.message.slice(0, 160)}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setReplyTo(undefined)}
                          >
                            Clear reply reference
                          </Button>
                        </div>
                      )}
                      <Field label="Your reply" required>
                        <textarea
                          rows={5}
                          required
                          disabled={busy}
                          readOnly={!record.canReply}
                          maxLength={10000}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                        />
                      </Field>
                      <Button
                        disabled={busy || !body.trim() || !record.canReply}
                      >
                        {busy ? "Working…" : "Send reply"}
                      </Button>
                    </form>
                  )}
                {record.participant && !record.canReply && (
                  <p className="gt-help">
                    The other account is currently unavailable. This history
                    remains readable, but new replies are disabled.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
