import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
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
}: {
  teamId: string;
  canManage: boolean;
}) {
  const [data, setData] = useState<Listing>(),
    [page, setPage] = useState(1),
    [filter, setFilter] = useState("current"),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
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
  const heading = useRef<HTMLHeadingElement>(null),
    editorKey = editor
      ? editor.row?.id || "new"
      : pending
        ? pending.row.id + pending.action
        : null;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<Listing>(
      `/admin/teams/${teamId}/announcements?${new URLSearchParams({ page: String(page), state: filter })}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamId, page, filter, refresh]);
  useEffect(() => {
    if (editorKey) heading.current?.focus();
  }, [editorKey]);
  const editing = !!editor;
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
    setBusy(true);
    setError("");
    try {
      await api(`/admin/teams/${teamId}/announcements/${row.id}`, {
        method: "POST",
        protected: true,
        body:
          action === "read"
            ? { action }
            : {
                action,
                revision: row.revision,
                ...(action === "pin" ? { pinned: !row.is_pinned } : {}),
              },
      });
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
      setError(
        e instanceof Error
          ? e.message
          : "The announcement could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError("");
    try {
      await api(
        `/admin/teams/${teamId}/announcements` +
          (editor.row ? "/" + editor.row.id : ""),
        {
          method: editor.row ? "PATCH" : "POST",
          protected: true,
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
      setEditor(null);
      setNotice(
        "Announcement saved as a private draft. Publishing is a separate action.",
      );
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <header className="gt-admin-heading">
        <div>
          <h2>Team announcements</h2>
          <p>
            Ordinary members see only published posts within their visibility
            window.
          </p>
        </div>
        {canManage && (
          <Button
            disabled={busy || !!editor || !!pending}
            onClick={() => open()}
          >
            Write announcement
          </Button>
        )}
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}{" "}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            Reload announcements
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {editor && (
        <section className="gt-panel gt-event-editor gt-announcement-editor">
          <h3 ref={heading} tabIndex={-1}>
            {editor.row ? "Edit private draft" : "New private announcement"}
          </h3>
          <form className="gt-form" onSubmit={save}>
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
              notifications never include the post body. Publish deliberately
              when the revised message is ready.
            </p>
            <div className="gt-button-row">
              <Button disabled={busy} type="submit">
                {busy ? "Saving…" : "Save private draft"}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="secondary"
                onClick={() => setEditor(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
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
              disabled={busy}
              onClick={() => mutate(pending.row, pending.action)}
            >
              {busy ? "Saving…" : "Confirm"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}
      {canManage && (
        <Field label="Announcement view">
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            {["current", "drafts", "published", "archived"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      )}
      {loading ? (
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
                    disabled={busy}
                    onClick={() => mutate(post, "read")}
                  >
                    Mark as read
                  </Button>
                )}
                {canManage && (
                  <>
                    {post.readCount !== null && (
                      <span>{post.readCount} read acknowledgements</span>
                    )}
                    {!post.deleted_at ? (
                      <>
                        <Button
                          variant="ghost"
                          disabled={busy || !!editor || !!pending}
                          onClick={() => open(post)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
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
                            disabled={busy || !!editor || !!pending}
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
                        disabled={busy || !!editor || !!pending}
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
        !error && (
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
          disabled={loading || page <= 1}
          onClick={() => setPage((v) => v - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · {data?.total || 0} announcements
        </span>
        <Button
          variant="secondary"
          disabled={loading || !data || page * 20 >= data.total}
          onClick={() => setPage((v) => v + 1)}
        >
          Next
        </Button>
      </nav>
    </section>
  );
}
