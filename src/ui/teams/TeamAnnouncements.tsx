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
    setDenied(true);
  }, [cancel, clearRead]);
  useEffect(() => {
    if (read.denied) clear();
  }, [read.denied, clear]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  useEffect(() => {
    if (!canManage || readCanManage === false) {
      setEditor(null);
      setPending(null);
      cancel();
    }
  }, [canManage, readCanManage, cancel]);
  const discard = (action: () => void) => {
    if (mutation.pending.current) return;
    if ((editor || pending) && safety) safety.request(action);
    else action();
  };
  useEffect(() => {
    if (editorKey) heading.current?.focus();
  }, [editorKey]);
  const editing = !!editor;
  useDraftGuard(editing || !!pending, {
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
    if (!ready || !manager || mutation.pending.current) return;
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
  async function mutate(row: Post, action: Action | "pin" | "read") {
    if (!ready || (action !== "read" && (!manager || stale))) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    try {
      await api(`/admin/teams/${teamId}/announcements/${row.id}`, {
        method: "POST",
        protected: true,
        signal: controller.signal,
        body:
          action === "read"
            ? { action }
            : {
                action,
                revision: row.revision,
                ...(action === "pin" ? { pinned: !row.is_pinned } : {}),
              },
      });
      if (!mutation.current(controller)) return;
      setNotice(
        action === "read"
          ? "Marked as read."
          : action === "publish"
            ? "Publication saved. Notifications are scheduled for eligible team members."
            : "Announcement change saved.",
      );
      setPending(null);
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
    } finally {
      mutation.finish(controller);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!ready || !manager || stale) return;
    if (!editor) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    try {
      await api(
        `/admin/teams/${teamId}/announcements` +
          (editor.row ? "/" + editor.row.id : ""),
        {
          method: editor.row ? "PATCH" : "POST",
          protected: true,
          signal: controller.signal,
          body: {
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
        },
      );
      if (!mutation.current(controller)) return;
      setEditor(null);
      setNotice(
        "Announcement saved as a private draft. Publishing is a separate action.",
      );
      setRefresh((v) => v + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clear();
        return;
      }
      setError(
        e instanceof Error ? e.message : "The draft could not be saved.",
      );
    } finally {
      mutation.finish(controller);
    }
  }
  if (blocked)
    return (
      <EmptyState title="Announcement access unavailable">
        Private posts and unsaved input have been cleared.
        <Button
          type="button"
          disabled={!isOnline}
          onClick={() => {
            setDenied(false);
            setRefresh((v) => v + 1);
          }}
        >
          Recheck announcement access
        </Button>
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
              disabled={busy || !ready || !!editor || !!pending}
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
        {error && (
          <p role="alert" className="gt-form-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {stale && (
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
                disabled={!ready || busy || stale}
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
                <div className="gt-button-row">
                  <Button disabled={busy || !ready || stale} type="submit">
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
              </fieldset>
            </form>
          </section>
        )}
        {stale && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              discard(() => {
                setEditor(null);
                setPending(null);
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
            <p>{pending.row.title}</p>
            <p>
              {pending.action === "publish"
                ? "This commits the post for its scheduled publication time, snapshots the current team audience, and queues metadata-only notifications. Former members are excluded again at delivery time."
                : pending.action === "archive"
                  ? "This hides the announcement and preserves its content, audit history and read receipts. It can be restored as a private draft."
                  : "This post remains private until an authorized team manager explicitly publishes it."}
            </p>
            <div className="gt-button-row">
              <Button
                disabled={busy || !ready || stale || !manager}
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
                      disabled={busy || !ready}
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
                            disabled={busy || !ready || !!editor || !!pending}
                            onClick={() => open(post)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy || !ready || !!editor || !!pending}
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
                              disabled={busy || !ready || !!editor || !!pending}
                              onClick={() => {
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
                          disabled={busy || !ready || !!editor || !!pending}
                          onClick={() =>
                            setPending({ row: post, action: "restore" })
                          }
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
