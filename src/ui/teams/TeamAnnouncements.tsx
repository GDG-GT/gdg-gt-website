import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import TeamReadFeedback from "./TeamReadFeedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge, Button, EmptyState, Field } from "../primitives";
type Post = {
  id: string;
  title: string;
  message: string;
  priority: string;
  is_pinned: boolean;
  is_published: boolean;
  scheduled_for: string | null;
  expires_at: string | null;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  authorName: string | null;
  isRead: boolean;
  readCount: number | null;
};
type Listing = { items: Post[]; total: number; canManage: boolean };
type Action = "publish" | "unpublish" | "archive" | "restore";
type Intent = {
  action: Action | "pin" | "read" | "create" | "update";
  id?: string;
  title: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  key: string;
  createdAt: number;
};
const actionLabel: Record<Action, string> = {
  publish: "Publish announcement",
  unpublish: "Return to draft",
  archive: "Archive announcement",
  restore: "Restore private draft",
};
function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function stateLabel(post: Post) {
  return post.deleted_at
    ? "Archived"
    : !post.is_published
      ? "Draft"
      : post.expires_at && new Date(post.expires_at) <= new Date()
        ? "Expired"
        : post.scheduled_for && new Date(post.scheduled_for) > new Date()
          ? "Scheduled"
          : "Published";
}
export default function TeamAnnouncements({
  teamId,
  canManage,
  disabled = false,
}: {
  teamId: string;
  canManage: boolean;
  disabled?: boolean;
}) {
  return (
    <TeamAnnouncementsContent
      key={teamId}
      teamId={teamId}
      canManage={canManage}
      disabled={disabled}
    />
  );
}
function TeamAnnouncementsContent({
  teamId,
  canManage,
  disabled,
}: {
  teamId: string;
  canManage: boolean;
  disabled: boolean;
}) {
  const [page, setPage] = useState(1),
    [filter, setFilter] = useState("current"),
    [refresh, setRefresh] = useState(0),
    [denied, setDenied] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState<Intent>(),
    [saveReview, setSaveReview] = useState<Intent>(),
    [checked, setChecked] = useState<{
      at: string;
      rows: Post[];
      total: number;
    }>(),
    [conflict, setConflict] = useState(false),
    [abandon, setAbandon] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const [editor, setEditor] = useState<{
      row?: Post;
      title: string;
      message: string;
      priority: string;
      pinned: boolean;
      scheduledFor: string;
      expiresAt: string;
    } | null>(null),
    [pending, setPending] = useState<{ row: Post; action: Action } | null>(
      null,
    );
  const panel = useRef<HTMLElement>(null),
    access = useRef<HTMLButtonElement>(null),
    receipt = useRef<HTMLParagraphElement>(null),
    opener = useRef<HTMLElement>(),
    retrying = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    editorKey = editor
      ? editor.row?.id || "new"
      : pending
        ? pending.row.id + pending.action
        : null;
  const safety = useNavigationSafety(),
    { isOnline } = useOnlineStatus(),
    mutation = usePrivateMutation(teamId),
    { busy } = mutation,
    read = usePrivateRead<Listing>(
      denied
        ? undefined
        : `/admin/teams/${teamId}/announcements?${new URLSearchParams({ page: String(page), state: filter })}`,
      refresh,
    ),
    { data, loading } = read,
    blocked = denied || read.denied,
    ready =
      !disabled && isOnline && !!data && !loading && !read.error && !blocked,
    manager = canManage && !!data?.canManage,
    stale =
      !!(editor?.row || pending?.row) &&
      !data?.items.some(
        (row) =>
          row.id === (editor?.row || pending?.row)!.id &&
          row.revision === (editor?.row || pending?.row)!.revision,
      );
  const reload = () => {
    retrying.current = true;
    setRefresh((v) => v + 1);
  };
  useEffect(() => {
    if (!loading && retrying.current) {
      retrying.current = false;
      panel.current?.focus();
    }
  }, [loading]);
  const held = !!uncertain || conflict || !!saveReview;
  const { cancel } = mutation,
    { clear: clearRead } = read,
    readCanManage = data?.canManage;
  const clear = useCallback(() => {
    cancel();
    clearRead();
    setEditor(null);
    setPending(null);
    setError("");
    setNotice("");
    setUncertain(undefined);
    setSaveReview(undefined);
    setChecked(undefined);
    setConflict(false);
    setAbandon(false);
    setConfirmation("");
    setDenied(true);
  }, [cancel, clearRead]);
  useEffect(() => {
    if (read.denied) clear();
  }, [read.denied, clear]);
  useEffect(() => {
    if (blocked) access.current?.focus();
  }, [blocked]);
  useEffect(() => {
    if (notice) receipt.current?.focus();
  }, [notice]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  useEffect(() => {
    if (!canManage || readCanManage === false) {
      setEditor(null);
      setPending(null);
      setSaveReview(undefined);
      setUncertain((intent) =>
        intent?.action === "read" ? intent : undefined,
      );
      setChecked(undefined);
      setConfirmation("");
      cancel();
    }
  }, [canManage, readCanManage, cancel]);
  const discard = (action: () => void) => {
    if (mutation.pending.current) return;
    if (uncertain) {
      setAbandon(true);
      return;
    }
    if ((editor || pending || saveReview || conflict) && safety)
      safety.request(action);
    else action();
  };
  useEffect(() => {
    if (editorKey) heading.current?.focus();
  }, [editorKey]);
  const editing = !!editor;
  useDraftGuard(editing || !!pending || !!uncertain || !!saveReview, {
    busy,
    label: "Team announcement or confirmation",
  });
  useEffect(() => {
    if (!editing) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editing]);
  function open(row?: Post) {
    if (!ready || !manager || held || mutation.pending.current) return;
    setPending(null);
    setEditor({
      row,
      title: row?.title || "",
      message: row?.message || "",
      priority: row?.priority || "normal",
      pinned: row?.is_pinned || false,
      scheduledFor: localDate(row?.scheduled_for || null),
      expiresAt: localDate(row?.expires_at || null),
    });
  }
  function intent(
    action: Intent["action"],
    title: string,
    body: Record<string, unknown>,
    id?: string,
    method = "POST",
  ): Intent {
    return {
      action,
      title,
      body,
      id,
      method,
      path: `/admin/teams/${teamId}/announcements` + (id ? "/" + id : ""),
      key: crypto.randomUUID(),
      createdAt: Date.now(),
    };
  }
  async function perform(operation: Intent, replay = false) {
    if (
      replay
        ? !isOnline || disabled || !checked
        : !ready ||
          !!uncertain ||
          conflict ||
          (operation.action !== "read" && (!manager || stale))
    )
      return;
    if (Date.now() - operation.createdAt >= 47 * 60 * 60 * 1000) {
      setError(
        "The safe retry window ended. Review abandoning recovery, inspect saved posts and start a current action if needed.",
      );
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setNotice("");
    try {
      await api(operation.path, {
        method: operation.method,
        protected: true,
        signal: controller.signal,
        idempotencyKey: operation.key,
        body: operation.body,
      });
      if (!mutation.current(controller)) return;
      setNotice(
        `Announcement ${operation.action} confirmed by the server for “${operation.title}”.` +
          (["create", "update", "restore"].includes(operation.action)
            ? " Saved as a private draft; publishing is separate."
            : operation.action === "publish"
              ? " Eligible members’ metadata-only notifications are scheduled once."
              : ""),
      );
      if (["create", "update"].includes(operation.action)) setEditor(null);
      setPending(null);
      setSaveReview(undefined);
      setUncertain(undefined);
      setChecked(undefined);
      setConflict(false);
      setConfirmation("");
      setRefresh((v) => v + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clear();
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "The announcement could not be changed.",
      );
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(operation);
        setChecked(undefined);
      } else if (e.status === 409) {
        setConflict(true);
        setSaveReview(undefined);
        setChecked(undefined);
      }
    } finally {
      mutation.finish(controller);
    }
  }
  function mutate(row: Post, action: Action | "pin" | "read") {
    if (
      !ready ||
      held ||
      mutation.pending.current ||
      (action !== "read" && (!manager || stale))
    )
      return;
    if (!["pin", "read"].includes(action) && confirmation !== row.title) return;
    return perform(
      intent(
        action,
        row.title,
        action === "read"
          ? { action }
          : {
              action,
              revision: row.revision,
              ...(action === "pin"
                ? { pinned: !row.is_pinned }
                : { confirmation }),
            },
        row.id,
      ),
    );
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || !manager || stale || held || mutation.pending.current) return;
    if (!editor) return;
    const operation = intent(
      editor.row ? "update" : "create",
      editor.row?.title || editor.title,
      {
        ...(editor.row ? { revision: editor.row.revision } : {}),
        record: {
          title: editor.title,
          message: editor.message,
          priority: editor.priority,
          pinned: editor.pinned,
          scheduledFor: editor.scheduledFor
            ? new Date(editor.scheduledFor).toISOString()
            : null,
          expiresAt: editor.expiresAt
            ? new Date(editor.expiresAt).toISOString()
            : null,
        },
      },
      editor.row?.id,
      editor.row ? "PATCH" : "POST",
    );
    if (editor.row?.is_published) {
      opener.current =
        ((event.nativeEvent as SubmitEvent).submitter as HTMLElement) ||
        undefined;
      setConfirmation("");
      setError("");
      setSaveReview(operation);
    } else perform(operation);
  }
  async function recheck() {
    if (!uncertain || !isOnline || disabled) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setChecked(undefined);
    try {
      const result = await api<Listing | { record: Post; canManage: boolean }>(
        `/admin/teams/${teamId}/announcements` +
          (uncertain.id
            ? "/" + uncertain.id
            : "?state=drafts&title=" + encodeURIComponent(uncertain.title)),
        { signal: controller.signal },
      );
      if (!mutation.current(controller)) return;
      if (uncertain.action !== "read" && !result.canManage) {
        clear();
        return;
      }
      setChecked({
        at: new Date().toISOString(),
        rows: "record" in result ? [result.record] : result.items,
        total: "record" in result ? 1 : result.total,
      });
      setRefresh((value) => value + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clear();
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Saved announcements could not be rechecked.",
      );
    } finally {
      mutation.finish(controller);
    }
  }
  const recovery = () => (
    <section
      className="gt-form [overflow-wrap:anywhere]"
      aria-label="Unconfirmed announcement recovery"
    >
      <p>
        “{uncertain?.title}”: the original {uncertain?.action} may already have
        completed. Recheck current saved values, then explicitly retry the
        identical operation. Rechecking never changes a post or queues
        notifications.
      </p>
      <Button
        type="button"
        disabled={busy || !isOnline || disabled}
        onClick={recheck}
      >
        Recheck saved announcement values
      </Button>
      {checked && (
        <details>
          <summary>Inspect current saved announcement values</summary>
          <p>
            Read at{" "}
            <time dateTime={checked.at}>
              {new Date(checked.at).toLocaleString()}
            </time>{" "}
            · {checked.total} matching posts; showing up to 20.
          </p>
          {checked.rows.length ? (
            <ul>
              {checked.rows.map((row) => (
                <li key={row.id}>
                  <strong>{row.title}</strong> · {stateLabel(row)} · revision{" "}
                  {row.revision}
                  <p className="gt-announcement-body">{row.message}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No matching post was returned by this current authorized read.
            </p>
          )}
        </details>
      )}
      <Button
        type="button"
        disabled={busy || !isOnline || disabled || !checked}
        onClick={() => uncertain && perform(uncertain, true)}
      >
        Retry original announcement operation
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={(event) => {
          opener.current = event.currentTarget;
          setAbandon(true);
        }}
      >
        Review abandoning announcement recovery
      </Button>
    </section>
  );
  if (blocked)
    return (
      <EmptyState title="Announcement access unavailable">
        Private posts and unsaved input have been cleared.
        <button
          ref={access}
          className="gt-button gt-button-primary"
          type="button"
          disabled={!isOnline}
          onClick={() => {
            retrying.current = true;
            setDenied(false);
            setRefresh((v) => v + 1);
          }}
        >
          Recheck announcement access
        </button>
      </EmptyState>
    );
  return (
    <fieldset disabled={disabled} className="gt-team-fields">
      <section ref={panel} tabIndex={-1} aria-label="Team announcements">
        <header className="gt-admin-heading">
          <div>
            <h2>Team announcements</h2>
            <p>
              Ordinary members see only published posts within their visibility
              window.
            </p>
          </div>
          {manager && (
            <Button
              disabled={busy || !ready || held || !!editor || !!pending}
              onClick={() => open()}
            >
              Write announcement
            </Button>
          )}
        </header>
        <TeamReadFeedback
          name="announcements"
          read={read}
          offline={!isOnline}
          busy={busy}
          retry={reload}
        />
        {error && !saveReview && !abandon && (
          <p role="alert" className="gt-form-error">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            ref={receipt}
            tabIndex={-1}
            className="[overflow-wrap:anywhere]"
          >
            {notice}
          </p>
        )}
        {!saveReview && uncertain && recovery()}
        {conflict && (
          <p role="alert">
            The saved announcement changed before this operation was accepted.
            Reload posts, review closing this stale action, then choose current
            values.
          </p>
        )}
        <Dialog
          open={!!saveReview || abandon}
          onOpenChange={(open) => {
            if (!open && !mutation.pending.current) {
              if (abandon) setAbandon(false);
              else setSaveReview(undefined);
            }
          }}
        >
          <DialogContent
            className={`max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere] ${busy ? "[&>button]:hidden" : ""}`}
            onEscapeKeyDown={(event) => {
              if (mutation.pending.current) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (mutation.pending.current) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (notice) receipt.current?.focus();
              else if (
                opener.current?.isConnected &&
                !opener.current.matches(":disabled")
              )
                opener.current.focus();
              else panel.current?.focus();
            }}
          >
            <DialogTitle>
              {abandon
                ? "Abandon unconfirmed announcement recovery?"
                : "Review changes to published announcement"}
            </DialogTitle>
            <DialogDescription>
              {abandon
                ? `“${uncertain?.title}”: the original operation may already have completed. Discard retained input and retry identity, then inspect current posts before starting another action. No accepted change or queued notification is recalled.`
                : `Saving “${saveReview?.title}” returns the published post to a private draft. Current members will stop seeing it until an authorized manager explicitly publishes again. Existing notifications and read history remain.`}
            </DialogDescription>
            {error && <p role="alert">{error}</p>}
            {abandon ? (
              <div className="gt-inline-actions">
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setEditor(null);
                    setPending(null);
                    setSaveReview(undefined);
                    setUncertain(undefined);
                    setChecked(undefined);
                    setConflict(false);
                    setAbandon(false);
                    setConfirmation("");
                    setError("");
                    setRefresh((v) => v + 1);
                  }}
                >
                  Abandon announcement recovery
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setAbandon(false)}
                >
                  Keep recovery
                </Button>
              </div>
            ) : uncertain ? (
              recovery()
            ) : (
              <>
                <p>Current title: {editor?.row?.title}</p>
                <p className="gt-announcement-body">{editor?.row?.message}</p>
                <p className="gt-helper">
                  Current settings: {editor?.row?.priority} priority · pinned{" "}
                  {editor?.row?.is_pinned ? "Yes" : "No"} · scheduled{" "}
                  {editor?.row?.scheduled_for
                    ? new Date(editor.row.scheduled_for).toLocaleString()
                    : "None"}{" "}
                  · expires{" "}
                  {editor?.row?.expires_at
                    ? new Date(editor.row.expires_at).toLocaleString()
                    : "None"}
                  . Times use your local timezone.
                </p>
                <h3>Proposed private draft</h3>
                <dl className="grid gap-3">
                  {Object.entries(
                    (saveReview?.body.record || {}) as Record<string, unknown>,
                  ).map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-semibold">
                        {(
                          {
                            title: "Title",
                            message: "Message",
                            priority: "Priority",
                            pinned: "Pinned",
                            scheduledFor:
                              "Scheduled publication · your local time",
                            expiresAt: "Expiry · your local time",
                          } as Record<string, string>
                        )[key] || key}
                      </dt>
                      <dd
                        className={
                          key === "message"
                            ? "gt-announcement-body !m-0"
                            : "m-0 break-words"
                        }
                      >
                        {key === "pinned"
                          ? value
                            ? "Yes"
                            : "No"
                          : ["scheduledFor", "expiresAt"].includes(key)
                            ? value
                              ? new Date(String(value)).toLocaleString()
                              : "None"
                            : String(value ?? "None")}
                      </dd>
                    </div>
                  ))}
                </dl>
                {stale && (
                  <p role="alert">
                    This saved post changed. Close this review and inspect
                    current values before saving.
                  </p>
                )}
                <Field label="Type announcement title to confirm" required>
                  <input
                    value={confirmation}
                    maxLength={200}
                    disabled={busy}
                    onChange={(event) => {
                      if (!mutation.pending.current)
                        setConfirmation(event.target.value);
                    }}
                  />
                </Field>
                <Button
                  disabled={
                    busy ||
                    !ready ||
                    !manager ||
                    stale ||
                    confirmation !== saveReview?.title
                  }
                  onClick={() => {
                    if (saveReview && confirmation === saveReview.title)
                      perform({
                        ...saveReview,
                        body: { ...saveReview.body, confirmation },
                      });
                  }}
                >
                  Confirm published-post changes
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setSaveReview(undefined)}
                >
                  Keep editing
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>
        {stale && !uncertain && (
          <p role="alert">
            This announcement changed. Review closing the stale editor, then
            choose a current post. Unsaved input is retained.
          </p>
        )}
        {editor && manager && (
          <section className="gt-panel gt-event-editor gt-announcement-editor">
            <h3 ref={heading} tabIndex={-1}>
              {editor.row ? "Edit private draft" : "New private announcement"}
            </h3>
            <form className="gt-form" onSubmit={save}>
              <fieldset
                className="gt-form gt-team-fields"
                disabled={!ready || busy || stale || held}
              >
                <Field label="Announcement title" required>
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={editor.title}
                    onChange={(e) =>
                      setEditor({ ...editor, title: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Message"
                  required
                  hint="Plain text only. Do not include passwords, private access links or unnecessary personal information."
                >
                  <textarea
                    required
                    rows={7}
                    minLength={2}
                    maxLength={10000}
                    value={editor.message}
                    onChange={(e) =>
                      setEditor({ ...editor, message: e.target.value })
                    }
                  />
                </Field>
                <div className="gt-form-grid">
                  <Field label="Priority">
                    <select
                      value={editor.priority}
                      onChange={(e) =>
                        setEditor({ ...editor, priority: e.target.value })
                      }
                    >
                      {["low", "normal", "high", "urgent"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Publish no earlier than · your local time"
                    hint="Leave blank to make the post visible when you publish it."
                  >
                    <input
                      type="datetime-local"
                      value={editor.scheduledFor}
                      onChange={(e) =>
                        setEditor({ ...editor, scheduledFor: e.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="Expiry · your local time"
                    hint="Expired announcements are hidden from ordinary members."
                  >
                    <input
                      type="datetime-local"
                      value={editor.expiresAt}
                      onChange={(e) =>
                        setEditor({ ...editor, expiresAt: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <label className="gt-check">
                  <input
                    type="checkbox"
                    checked={editor.pinned}
                    onChange={(e) =>
                      setEditor({ ...editor, pinned: e.target.checked })
                    }
                  />{" "}
                  Pin above other posts
                </label>
                <p className="gt-helper">
                  Editing a published post returns it to draft. Existing
                  notifications never include the post body. Publish
                  deliberately when the revised message is ready.
                </p>
              </fieldset>
              <div className="gt-button-row">
                <Button
                  disabled={busy || !ready || stale || held}
                  type="submit"
                >
                  {busy ? "Saving…" : "Save private draft"}
                </Button>
                <Button
                  disabled={busy}
                  type="button"
                  variant="secondary"
                  onClick={() => discard(() => setEditor(null))}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        )}
        {(stale || conflict) && !uncertain && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              discard(() => {
                setEditor(null);
                setPending(null);
                setConflict(false);
                setConfirmation("");
              })
            }
          >
            Review closing stale announcement action
          </Button>
        )}
        {pending && (
          <section className="gt-panel gt-operational-confirm">
            <h3 ref={heading} tabIndex={-1}>
              {actionLabel[pending.action]}
            </h3>
            <p className="gt-announcement-body !m-0">{pending.row.title}</p>
            <p>
              {pending.action === "publish"
                ? "This commits the post for its scheduled publication time, snapshots the current team audience, and queues metadata-only notifications. Former members are excluded again at delivery time."
                : pending.action === "archive"
                  ? "This hides the announcement and preserves its content, audit history and read receipts. It can be restored as a private draft."
                  : "This post remains private until an authorized team manager explicitly publishes it."}
            </p>
            <Field label="Type announcement title to confirm" required>
              <input
                value={confirmation}
                maxLength={200}
                disabled={busy || !ready || held || stale}
                onChange={(event) => {
                  if (!mutation.pending.current)
                    setConfirmation(event.target.value);
                }}
              />
            </Field>
            <div className="gt-button-row">
              <Button
                disabled={
                  busy ||
                  !ready ||
                  stale ||
                  !manager ||
                  held ||
                  confirmation !== pending.row.title
                }
                onClick={() => mutate(pending.row, pending.action)}
              >
                {busy ? "Saving…" : "Confirm"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => discard(() => setPending(null))}
              >
                Cancel
              </Button>
            </div>
          </section>
        )}
        {manager && (
          <Field label="Announcement view">
            <select
              value={filter}
              disabled={!ready || busy}
              onChange={(e) => {
                const value = e.target.value;
                discard(() => {
                  setEditor(null);
                  setPending(null);
                  setFilter(value);
                  setPage(1);
                });
              }}
            >
              {["current", "drafts", "published", "archived"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        )}
        {loading && !data ? (
          <div
            className="gt-skeleton gt-detail-skeleton"
            role="status"
            aria-label="Loading announcements"
          />
        ) : data?.items.length ? (
          <div className="gt-announcement-list">
            {data.items.map((post) => (
              <article key={post.id}>
                <div className="gt-button-row">
                  <Badge
                    tone={post.priority === "urgent" ? "warning" : "neutral"}
                  >
                    {post.priority} priority
                  </Badge>
                  {canManage && <Badge>{stateLabel(post)}</Badge>}
                  {post.is_pinned && <Badge>Pinned</Badge>}
                  {post.isRead && <Badge tone="success">Read</Badge>}
                </div>
                <h3>{post.title}</h3>
                <p className="gt-helper">
                  {post.authorName || "Chapter teammate"} ·{" "}
                  {new Date(post.created_at).toLocaleString()}
                  {post.scheduled_for &&
                    " · Scheduled " +
                      new Date(post.scheduled_for).toLocaleString()}
                  {post.expires_at &&
                    " · Expires " + new Date(post.expires_at).toLocaleString()}
                </p>
                <p className="gt-announcement-body">{post.message}</p>
                <div className="gt-button-row">
                  {!post.isRead && !post.deleted_at && (
                    <Button
                      variant="secondary"
                      disabled={busy || !ready || held || !!editor || !!pending}
                      onClick={() => mutate(post, "read")}
                    >
                      Mark as read
                    </Button>
                  )}
                  {manager && (
                    <>
                      {post.readCount !== null && (
                        <span>{post.readCount} read acknowledgements</span>
                      )}
                      {!post.deleted_at ? (
                        <>
                          <Button
                            variant="ghost"
                            disabled={
                              busy || !ready || held || !!editor || !!pending
                            }
                            onClick={() => open(post)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={
                              busy || !ready || held || !!editor || !!pending
                            }
                            onClick={() => mutate(post, "pin")}
                          >
                            {post.is_pinned ? "Unpin" : "Pin"}
                          </Button>
                          {(
                            [
                              post.is_published ? "unpublish" : "publish",
                              "archive",
                            ] as Action[]
                          ).map((action) => (
                            <Button
                              key={action}
                              variant="ghost"
                              disabled={
                                busy || !ready || held || !!editor || !!pending
                              }
                              onClick={() => {
                                if (mutation.pending.current || held) return;
                                setConfirmation("");
                                setError("");
                                setNotice("");
                                setEditor(null);
                                setPending({ row: post, action });
                              }}
                            >
                              {actionLabel[action]}
                            </Button>
                          ))}
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          disabled={
                            busy || !ready || held || !!editor || !!pending
                          }
                          onClick={() => {
                            if (!mutation.pending.current && !held) {
                              setConfirmation("");
                              setError("");
                              setNotice("");
                              setPending({ row: post, action: "restore" });
                            }
                          }}
                        >
                          Restore private draft
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          !read.error &&
          !error &&
          data && (
            <EmptyState title="No announcements in this view">
              {canManage
                ? "Write a private draft, then publish it when ready."
                : "Published team updates will appear here. Scheduled and draft posts stay private."}
              {(filter !== "current" || page > 1) && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !ready}
                  onClick={() =>
                    discard(() => {
                      setFilter("current");
                      setPage(1);
                      setEditor(null);
                      setPending(null);
                      setConflict(false);
                      setConfirmation("");
                    })
                  }
                >
                  Reset announcement view
                </Button>
              )}
            </EmptyState>
          )
        )}
        <nav className="gt-button-row" aria-label="Announcement pages">
          <Button
            variant="secondary"
            disabled={!ready || busy || page <= 1}
            onClick={() =>
              discard(() => {
                setEditor(null);
                setPending(null);
                setPage((v) => v - 1);
              })
            }
          >
            Previous
          </Button>
          <span>
            Page {page}
            {data ? ` · ${data.total} announcements` : " · count unavailable"}
          </span>
          <Button
            variant="secondary"
            disabled={!ready || busy || !data || page * 20 >= data.total}
            onClick={() =>
              discard(() => {
                setEditor(null);
                setPending(null);
                setPage((v) => v + 1);
              })
            }
          >
            Next
          </Button>
        </nav>
      </section>
    </fieldset>
  );
}
