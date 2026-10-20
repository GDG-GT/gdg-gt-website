import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiFailure } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import {
  taskCreate,
  taskDetails,
  taskMutation,
  taskComment,
} from "../../../shared/tasks.mjs";
import {
  ActionLink,
  Badge,
  Button,
  EmptyState,
  Field,
  SearchBox,
} from "../primitives";
type Task = {
  id: string;
  title: string;
  description: string;
  team_id: string | null;
  assigned_to_id: string | null;
  assigned_by_id: string;
  assigneeName: string | null;
  creatorName: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  tags: string[];
  revision: number;
  archived_at: string | null;
  updated_at: string;
  actions: string[];
  commentCount: number;
};
type Comment = {
  id: string;
  user_id: string;
  authorName: string | null;
  comment: string;
  comment_type: string;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  canEdit: boolean;
  canDelete: boolean;
  change?: { from: string | null; to: string | null } | null;
};
type Cursor = { before: string; beforeId: string };
type Comments = { items: Comment[]; nextCursor: Cursor | null };
type Listing = { items: Task[]; total: number; pageSize: number };
type Mode = "create" | "update" | "assign" | "archive" | "restore";
const defaults = {
  title: "",
  description: "",
  dueDate: "",
  priority: "medium",
  tags: "",
  teamId: "",
  assigneeEmail: "",
};
function dateLabel(date: string | null) {
  return date
    ? new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(date + "T12:00:00Z"))
    : "No due date";
}
const statusLabel = (value: string) =>
  ({
    pending: "Pending",
    "in-progress": "In progress",
    completed: "Completed",
    overdue: "Overdue",
  })[value] || value;
export default function TaskWorkspace() {
  const [params, setParams] = useSearchParams(),
    selected = params.get("task") || "";
  const [listing, setListing] = useState<Listing>(),
    [record, setRecord] = useState<Task>(),
    [capabilities, setCapabilities] = useState<{
      personalCreate: boolean;
      globalCreate: boolean;
      actorId: string;
      teams: { id: string; name: string }[];
    }>();
  const [q, setQ] = useState(""),
    [scope, setScope] = useState("assigned"),
    [status, setStatus] = useState("all"),
    [priority, setPriority] = useState("all"),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [capabilityRetry, setCapabilityRetry] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null),
    [values, setValues] = useState({ ...defaults }),
    [confirmation, setConfirmation] = useState(""),
    [password, setPassword] = useState(""),
    [conflict, setConflict] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]),
    [cursor, setCursor] = useState<Cursor | null>(null),
    [historyStarted, setHistoryStarted] = useState(false),
    [comment, setComment] = useState(""),
    [editingComment, setEditingComment] = useState<Comment | null>(null),
    [deleting, setDeleting] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState("");
  const recordRef = useRef(record),
    selectedRef = useRef(selected),
    modeRef = useRef(mode),
    heading = useRef<HTMLHeadingElement>(null),
    commentKey = useRef<string>(),
    editRevision = useRef<number>();
  recordRef.current = record;
  const [capabilityError, setCapabilityError] = useState("");
  const [allowedLinks, setAllowedLinks] = useState<string[]>([]);
  useEffect(() => {
    api<{ accessibleRoutes: string[] }>("/admin/access")
      .then((r) => setAllowedLinks(r.accessibleRoutes))
      .catch(() => setAllowedLinks([]));
  }, [capabilityRetry]);
  selectedRef.current = selected;
  modeRef.current = mode;
  useEffect(() => {
    const controller = new AbortController();
    api<Listing>(
      `/admin/communications/tasks?${new URLSearchParams({ q, scope, status, priority, page: String(page), archived: archived ? "1" : "0" })}`,
      { signal: controller.signal },
    )
      .then((value) => {
        setListing(value);
        if (!selectedRef.current) setLoadError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setLoadError(e.message);
      });
    return () => controller.abort();
  }, [q, scope, status, priority, page, archived, tick]);
  useEffect(() => {
    api<typeof capabilities>("/admin/communications/tasks/capabilities")
      .then((value) => {
        setCapabilities(value);
        setCapabilityError("");
      })
      .catch((e) => setCapabilityError(e.message));
  }, [capabilityRetry]);
  useEffect(() => {
    const refresh = () => setTick((v) => v + 1),
      access = () => {
        setCapabilityRetry((v) => v + 1);
        refresh();
      },
      timer = setInterval(() => {
        if (!document.hidden) refresh();
      }, 5000);
    window.addEventListener("gdg:notifications-updated", refresh);
    window.addEventListener("gdg:access-changed", access);
    return () => {
      clearInterval(timer);
      window.removeEventListener("gdg:notifications-updated", refresh);
      window.removeEventListener("gdg:access-changed", access);
    };
  }, []);
  useEffect(() => {
    setRecord(undefined);
    setComments([]);
    setCursor(null);
    setHistoryStarted(false);
    setMode(null);
    setComment("");
    setEditingComment(null);
    setDeleting(null);
    setPassword("");
    setConflict(false);
    setError("");
    setLoadError("");
    commentKey.current = undefined;
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    Promise.all([
      api<{ record: Task }>(`/admin/communications/tasks/${selected}`, {
        signal: controller.signal,
      }),
      api<Comments>(`/admin/communications/tasks/${selected}/comments`, {
        signal: controller.signal,
      }),
    ])
      .then(([r, c]) => {
        if (controller.signal.aborted) return;
        setLoadError("");
        if (
          modeRef.current &&
          modeRef.current !== "create" &&
          recordRef.current &&
          r.record.revision !== recordRef.current.revision
        )
          setConflict(true);
        else setRecord(r.record);
        setComments((old) => {
          const map = new Map(old.map((item) => [item.id, item]));
          for (const item of c.items) map.set(item.id, item);
          return [...map.values()].sort(
            (a, b) =>
              a.created_at.localeCompare(b.created_at) ||
              a.id.localeCompare(b.id),
          );
        });
        if (!historyStarted) {
          setCursor(c.nextCursor);
          setHistoryStarted(true);
        }
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          setRecord(undefined);
          recordRef.current = undefined;
          setComments([]);
          setComment("");
          setMode(null);
          setPassword("");
        }
        setLoadError(e.message);
      });
    return () => controller.abort();
  }, [selected, tick, historyStarted]);
  const dirty = !!mode || !!comment.trim() || !!editingComment;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (mode) heading.current?.focus();
  }, [mode]);
  function choose(id: string, committed = false) {
    if (busy) return;
    if (
      !committed &&
      dirty &&
      !confirm("Discard your unsaved task or comment changes?")
    )
      return;
    const next = new URLSearchParams(params);
    next.set("tab", "tasks");
    if (id) next.set("task", id);
    else next.delete("task");
    setParams(next);
    setNotice("");
  }
  function start(next: Mode) {
    if (
      dirty &&
      !confirm("Discard the current unsaved task or comment changes?")
    )
      return;
    setMode(next);
    setValues(
      next === "create"
        ? { ...defaults }
        : {
            ...defaults,
            title: record?.title || "",
            description: record?.description || "",
            dueDate: record?.due_date || "",
            priority: record?.priority || "medium",
            tags: record?.tags?.join(", ") || "",
          },
    );
    setComment("");
    setEditingComment(null);
    editRevision.current = record?.revision;
    setPassword("");
    setConfirmation("");
    setConflict(false);
    setError("");
  }
  const field = (key: keyof typeof defaults) => ({
    value: values[key],
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setValues((v) => ({ ...v, [key]: e.target.value })),
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const detail = {
        title: values.title,
        description: values.description,
        dueDate: values.dueDate || null,
        priority: values.priority,
        tags: [
          ...new Set(
            values.tags
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          ),
        ],
      };
      const body =
        mode === "create"
          ? taskCreate.parse({
              ...detail,
              teamId: values.teamId || null,
              ...(values.assigneeEmail
                ? { assigneeEmail: values.assigneeEmail }
                : {}),
            })
          : taskMutation.parse({
              action: mode,
              revision: editRevision.current,
              ...(mode === "update"
                ? { record: taskDetails.parse(detail) }
                : mode === "assign"
                  ? {
                      assigneeEmail: values.assigneeEmail,
                      currentPassword: password,
                      confirmation,
                    }
                  : { confirmation }),
            });
      const r = await api<{ id: string }>(
        "/admin/communications/tasks" +
          (mode === "create" ? "" : "/" + selected),
        {
          method: "POST",
          protected: true,
          idempotencyKey: crypto.randomUUID(),
          body,
        },
      );
      const wasCreate = mode === "create";
      setMode(null);
      setConflict(false);
      setNotice("Task changes saved.");
      setTick((v) => v + 1);
      if (wasCreate) {
        const next = new URLSearchParams(params);
        next.set("tab", "tasks");
        next.set("task", r.id);
        setParams(next);
      }
    } catch (e) {
      setError(
        validationMessage(e, "The task could not save.", {
          title: "Task title",
          "record.title": "Task title",
          description: "Task description",
          dueDate: "Due date",
          tags: "Tags",
          assigneeEmail: "Assignee email",
          currentPassword: "Current password",
          confirmation: "Confirmation",
        }),
      );
      if (e instanceof ApiFailure && e.status === 409) setConflict(true);
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  async function changeStatus(next: string) {
    if (!record || busy || mode) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/communications/tasks/${selected}`, {
        method: "POST",
        protected: true,
        idempotencyKey: crypto.randomUUID(),
        body: { action: "status", revision: record.revision, status: next },
      });
      setTick((v) => v + 1);
      setNotice("Task status saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function sendComment(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const id = selected;
    commentKey.current ??= crypto.randomUUID();
    try {
      const body = editingComment
        ? {
            action: "edit",
            revision: editingComment.revision,
            ...taskComment.parse({ comment }),
          }
        : taskComment.parse({ comment });
      const r = await api<{ id: string; revision: number }>(
        `/admin/communications/tasks/${id}/comments` +
          (editingComment ? "/" + editingComment.id : ""),
        {
          method: "POST",
          protected: true,
          idempotencyKey: commentKey.current,
          body,
        },
      );
      if (id !== selectedRef.current) return;
      if (editingComment)
        setComments((items) =>
          items.map((item) =>
            item.id === editingComment.id
              ? { ...item, comment, revision: r.revision }
              : item,
          ),
        );
      setComment("");
      setEditingComment(null);
      commentKey.current = undefined;
      setTick((v) => v + 1);
    } catch (e) {
      if (id === selectedRef.current) setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeComment() {
    if (!deleting || busy) return;
    setBusy(true);
    const id = selected,
      item = deleting;
    try {
      const r = await api<{ revision: number }>(
        `/admin/communications/tasks/${id}/comments/${item.id}`,
        {
          method: "POST",
          protected: true,
          idempotencyKey: crypto.randomUUID(),
          body: { action: "delete", revision: item.revision },
        },
      );
      if (id !== selectedRef.current) return;
      setComments((items) =>
        items.map((c) =>
          c.id === item.id
            ? {
                ...c,
                comment: "",
                deleted_at: new Date().toISOString(),
                revision: r.revision,
                canEdit: false,
                canDelete: false,
              }
            : c,
        ),
      );
      setDeleting(null);
      setTick((v) => v + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function older() {
    if (!cursor || busy) return;
    setBusy(true);
    const id = selected;
    try {
      const r = await api<Comments>(
        `/admin/communications/tasks/${id}/comments?${new URLSearchParams(cursor)}`,
      );
      if (id !== selectedRef.current) return;
      setComments((items) => {
        const map = new Map(items.map((c) => [c.id, c]));
        for (const c of r.items) map.set(c.id, c);
        return [...map.values()].sort(
          (a, b) =>
            a.created_at.localeCompare(b.created_at) ||
            a.id.localeCompare(b.id),
        );
      });
      setCursor(r.nextCursor);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Communications</h1>
          <p>
            Keep chapter work moving with clear ownership, protected
            conversations and reliable deadlines.
          </p>
        </div>
        {(capabilities?.personalCreate || !!capabilities?.teams.length) && (
          <Button disabled={busy || !!mode} onClick={() => start("create")}>
            New task
          </Button>
        )}
      </header>
      <nav
        className="gt-button-row gt-team-tabs"
        aria-label="Communications workspaces"
      >
        <span className="gt-button" aria-current="page">
          Tasks
        </span>
        <ActionLink to="/admin/communications?tab=messages" variant="ghost">
          Messages
        </ActionLink>
        {allowedLinks.includes("/admin/teams") && (
          <ActionLink to="/admin/teams" variant="ghost">
            Team announcements
          </ActionLink>
        )}
        {allowedLinks.includes("/admin/channels") && (
          <ActionLink to="/admin/channels" variant="ghost">
            Channels
          </ActionLink>
        )}
      </nav>
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {loadError && (
        <p className="gt-form-error" role="alert">
          {loadError}{" "}
          <button
            onClick={() => {
              setTick((v) => v + 1);
              setCapabilityRetry((v) => v + 1);
            }}
          >
            Retry loading
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {capabilityError && (
        <p className="gt-form-error" role="alert">
          Task-creation permissions could not load.{" "}
          <button onClick={() => setCapabilityRetry((v) => v + 1)}>
            Retry permissions
          </button>
        </p>
      )}
      {mode && (
        <form className="gt-event-editor" onSubmit={submit}>
          <h2 ref={heading} tabIndex={-1}>
            {
              {
                create: "Create a task",
                update: "Edit task details",
                assign: "Reassign task",
                archive: "Archive task",
                restore: "Restore task",
              }[mode]
            }
          </h2>
          {(mode === "create" || mode === "update") && (
            <>
              <Field label="Task title" required>
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  {...field("title")}
                />
              </Field>
              <Field
                label="Task description"
                hint="Plain text. Include enough context to make the next step clear."
              >
                <textarea
                  rows={5}
                  maxLength={10000}
                  {...field("description")}
                />
              </Field>
              <div className="gt-form-grid">
                <Field
                  label="Due date"
                  hint="Date-only deadline; overdue checks use UTC and run every 15 minutes."
                >
                  <input type="date" {...field("dueDate")} />
                </Field>
                <Field label="Priority">
                  <select {...field("priority")}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </Field>
              </div>
              <Field label="Tags" hint="Up to 12 tags, separated by commas.">
                <input maxLength={500} {...field("tags")} />
              </Field>
            </>
          )}
          {mode === "create" && (
            <>
              <Field
                label="Task scope"
                hint="Scope cannot change after creation."
              >
                <select {...field("teamId")}>
                  <option value="">Private — creator and assignee</option>
                  {capabilities?.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </Field>
              {(capabilities?.globalCreate || !!values.teamId) && (
                <Field
                  label="Assignee’s exact chapter email"
                  hint="Leave empty to assign to yourself. A team task requires an active member of that team."
                >
                  <input type="email" {...field("assigneeEmail")} />
                </Field>
              )}
            </>
          )}
          {mode === "assign" && (
            <>
              <p>
                Reassignment removes the previous assignee’s private access
                unless they have independent creator or team access. The new
                assignee can read this task and its comments.
              </p>
              <Field label="New assignee’s exact chapter email" required>
                <input required type="email" {...field("assigneeEmail")} />
              </Field>
              <Field label="Your current password" required>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            </>
          )}
          {["assign", "archive", "restore"].includes(mode) && (
            <Field
              label={`Type “${record?.title}” to confirm`}
              required
              hint={
                mode === "archive"
                  ? "The task and its comments are retained in the archive."
                  : undefined
              }
            >
              <input
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
          )}
          {conflict && (
            <p className="gt-form-error" role="alert">
              This task changed while you were editing. Your fields are
              preserved. Cancel, reload the task and review the newer version
              before submitting.
            </p>
          )}
          <div className="gt-button-row">
            <Button disabled={busy || conflict}>
              {busy ? "Saving…" : "Save task changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setPassword("");
                setConflict(false);
                setTick((v) => v + 1);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!selected ? (
        <section aria-label="Task inventory">
          <div className="gt-task-filters">
            <SearchBox
              label="Search task titles"
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(1);
              }}
            />
            <Field label="Task audience">
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setPage(1);
                }}
              >
                <option value="assigned">Assigned to me</option>
                <option value="created">Created by me</option>
                <option value="all">All tasks I can access</option>
              </select>
            </Field>
            <Field label="Task status">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All statuses</option>
                {["pending", "in-progress", "completed", "overdue"].map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority filter">
              <select
                value={priority}
                onChange={(e) => {
                  setPriority(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Task state">
              <select
                value={archived ? "1" : "0"}
                onChange={(e) => {
                  setArchived(e.target.value === "1");
                  setPage(1);
                }}
              >
                <option value="0">Current tasks</option>
                <option value="1">Archived tasks</option>
              </select>
            </Field>
          </div>
          {!listing ? (
            <p role="status">Loading authorized tasks…</p>
          ) : !listing.items.length ? (
            <EmptyState title="No tasks in this view">
              Your assignments will appear here. Create a personal task or
              adjust the filters to review other authorized work.
            </EmptyState>
          ) : (
            <div className="gt-team-directory">
              {listing.items.map((task) => (
                <article key={task.id}>
                  <div>
                    <h2>{task.title}</h2>
                    <p>
                      {task.assigneeName || "Unassigned"} ·{" "}
                      {dateLabel(task.due_date)} ·{" "}
                      {task.team_id ? "Team scope" : "Private"}
                    </p>
                    <Badge>{statusLabel(task.status)}</Badge>{" "}
                    <Badge>{task.priority} priority</Badge>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => choose(task.id)}
                  >
                    Open task<span className="sr-only"> {task.title}</span>
                  </Button>
                </article>
              ))}
            </div>
          )}
          <nav className="gt-button-row" aria-label="Task pages">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>{page}</span>
            <Button
              variant="secondary"
              disabled={!listing || page * 30 >= listing.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </nav>
        </section>
      ) : !record ? (
        <>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => choose("")}
          >
            Back to tasks
          </Button>
          {!loadError && <p role="status">Loading the task…</p>}
        </>
      ) : (
        <section aria-label="Selected task" className="gt-task-detail">
          <header className="gt-admin-heading">
            <div>
              <h2>{record.title}</h2>
              <p>
                {record.team_id ? "Team-scoped task" : "Private task"} · Created
                by {record.creatorName || "a chapter account"}
              </p>
              <Badge>
                {record.archived_at ? "Archived" : statusLabel(record.status)}
              </Badge>{" "}
              <Badge>{record.priority} priority</Badge>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => choose("")}
            >
              Back to tasks
            </Button>
          </header>
          <dl className="gt-task-facts">
            <div>
              <dt>Assigned to</dt>
              <dd>{record.assigneeName || "Unassigned"}</dd>
            </div>
            <div>
              <dt>Due date · UTC</dt>
              <dd>{dateLabel(record.due_date)}</dd>
            </div>
            <div>
              <dt>Saved version</dt>
              <dd>{record.revision}</dd>
            </div>
          </dl>
          <p className="gt-announcement-body">
            {record.description || "No extra description."}
          </p>
          {!!record.tags?.length && (
            <div className="gt-button-row">
              {record.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
          )}
          <div className="gt-button-row">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setTick((v) => v + 1)}
            >
              Check for updates
            </Button>
            {record.actions.includes("update") && !record.archived_at && (
              <Button
                variant="secondary"
                disabled={busy || !!mode}
                onClick={() => start("update")}
              >
                Edit task
              </Button>
            )}
            {record.actions.includes("assign") && !record.archived_at && (
              <Button
                variant="ghost"
                disabled={busy || !!mode}
                onClick={() => start("assign")}
              >
                Reassign
              </Button>
            )}
            {record.actions.includes("delete") && !record.archived_at && (
              <Button
                variant="ghost"
                disabled={busy || !!mode}
                onClick={() => start("archive")}
              >
                Archive
              </Button>
            )}
            {record.actions.includes("restore") && record.archived_at && (
              <Button
                variant="secondary"
                disabled={busy || !!mode}
                onClick={() => start("restore")}
              >
                Restore
              </Button>
            )}
          </div>
          {record.actions.includes("status") && !record.archived_at && (
            <Field label="Update task status">
              <select
                disabled={busy || !!mode}
                value={record.status}
                onChange={(e) => void changeStatus(e.target.value)}
              >
                {record.status === "overdue" && (
                  <option value="overdue" disabled>
                    Overdue — set by scheduler
                  </option>
                )}
                <option value="pending">Pending</option>
                <option value="in-progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
          )}
          <section
            className="gt-task-comments"
            aria-label="Task comments and history"
          >
            <h3>Comments & history</h3>
            {cursor && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void older()}
              >
                Load earlier comments
              </Button>
            )}
            <ol className="gt-channel-messages">
              {comments.map((item) => (
                <li key={item.id}>
                  <header>
                    <strong>{item.authorName || "Chapter account"}</strong>
                    <time dateTime={item.created_at}>
                      {new Date(item.created_at).toLocaleString()}
                    </time>
                    {item.comment_type !== "comment" && <Badge>Activity</Badge>}
                  </header>
                  <p className="gt-message-body">
                    {item.deleted_at
                      ? "Comment removed."
                      : item.change && item.comment_type === "status_change"
                        ? `Status: ${statusLabel(item.change.from || "Unknown")} → ${statusLabel(item.change.to || "Unknown")}`
                        : item.change &&
                            item.comment_type === "assignment_change"
                          ? `Assigned: ${item.change.from || "Unassigned"} → ${item.change.to || "Unassigned"}`
                          : item.comment}
                  </p>
                  {item.comment_type === "comment" && (
                    <div className="gt-button-row">
                      {item.canEdit && (
                        <Button
                          variant="ghost"
                          disabled={busy || !!mode}
                          onClick={() => {
                            if (
                              comment &&
                              !confirm("Discard your unsent comment?")
                            )
                              return;
                            setEditingComment(item);
                            setComment(item.comment);
                            commentKey.current = undefined;
                          }}
                        >
                          Edit comment
                        </Button>
                      )}
                      {item.canDelete && (
                        <Button
                          variant="ghost"
                          disabled={busy || !!mode}
                          onClick={() => setDeleting(item)}
                        >
                          Remove comment
                        </Button>
                      )}
                    </div>
                  )}
                  {deleting?.id === item.id && (
                    <div className="gt-operational-confirm">
                      <p>
                        Remove this comment from the conversation? Its audit
                        trail is retained.
                      </p>
                      <div className="gt-button-row">
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => void removeComment()}
                        >
                          Confirm removal
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => setDeleting(null)}
                        >
                          Keep comment
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {!comments.length && (
              <p>
                No comments yet. Add context, a progress update or a useful next
                step.
              </p>
            )}
            {record.actions.includes("comment") && !record.archived_at && (
              <form onSubmit={sendComment}>
                <Field
                  label={editingComment ? "Edit your comment" : "Add a comment"}
                  required
                  hint="Plain text only. Private file attachments are not connected yet."
                >
                  <textarea
                    required
                    rows={4}
                    maxLength={5000}
                    disabled={busy || !!mode}
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      commentKey.current = undefined;
                    }}
                  />
                </Field>
                <div className="gt-button-row">
                  <Button disabled={busy || !!mode || !comment.trim()}>
                    {busy
                      ? "Saving…"
                      : editingComment
                        ? "Save comment"
                        : "Post comment"}
                  </Button>
                  {editingComment && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingComment(null);
                        setComment("");
                        commentKey.current = undefined;
                      }}
                    >
                      Cancel edit
                    </Button>
                  )}
                </div>
              </form>
            )}
          </section>
        </section>
      )}
    </div>
  );
}
