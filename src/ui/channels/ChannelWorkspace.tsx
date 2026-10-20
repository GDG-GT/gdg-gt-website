import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
type Channel = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  team_id: string | null;
  is_archived: boolean;
  revision: number;
  unreadCount?: number;
};
type Room = {
  record: Channel;
  actions: { manage: boolean; moderate: boolean; send: boolean };
  actorId: string;
  canRestore: boolean;
};
type Message = {
  id: string;
  sender_id: string;
  senderName: string | null;
  message: string;
  is_deleted: boolean;
  is_pinned: boolean;
  revision: number;
  created_at: string;
  updated_at: string;
  canEdit: boolean;
  canDelete: boolean;
  reply: { id: string; message: string; is_deleted: boolean } | null;
};
type Cursor = { before: string; beforeId: string };
type Thread = { items: Message[]; nextCursor: Cursor | null };
type Listing = { items: Channel[]; total: number; pageSize: number };
type Member = {
  admin_user_id: string;
  role: string;
  user?: { display_name: string; email?: string };
};
type Mode =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "member_add"
  | "member_role"
  | "member_remove";
const modeName: Record<Mode, string> = {
  create: "Create a room",
  update: "Edit room details",
  archive: "Archive room",
  restore: "Restore room",
  member_add: "Add explicit room membership",
  member_role: "Change room membership",
  member_remove: "Remove explicit room membership",
};
export default function ChannelWorkspace() {
  const [list, setList] = useState<Listing>(),
    [capabilities, setCapabilities] = useState<{
      globalCreate: boolean;
      teams: { id: string; name: string }[];
    }>(),
    [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(""),
    [room, setRoom] = useState<Room>(),
    [messages, setMessages] = useState<Message[]>([]),
    [cursor, setCursor] = useState<Cursor | null>(null),
    [pinned, setPinned] = useState(false),
    [tick, setTick] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState(""),
    [replyTo, setReplyTo] = useState<Message | null>(null),
    [editing, setEditing] = useState<Message | null>(null),
    [editText, setEditText] = useState(""),
    [deleteMessage, setDeleteMessage] = useState<Message | null>(null),
    [members, setMembers] = useState<Member[] | null>(null);
  const [mode, setMode] = useState<Mode | null>(null),
    [values, setValues] = useState<Record<string, string>>({}),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const heading = useRef<HTMLHeadingElement>(null),
    bottom = useRef<HTMLDivElement>(null),
    scrollAfterSend = useRef(false),
    sendKey = useRef<string | null>(null),
    historyStarted = useRef(false),
    selectedRef = useRef(selected);
  const [memberPage, setMemberPage] = useState(1),
    [memberTotal, setMemberTotal] = useState(0);
  async function loadMembers(page: number) {
    try {
      const r = await api<{ items: Member[]; total: number }>(
        `/admin/channels/${selected}/members?page=${page}`,
      );
      if (selectedRef.current !== selected) return;
      setMembers(r.items);
      setMemberTotal(r.total);
      setMemberPage(page);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Room memberships could not load.",
      );
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<Listing>(
      `/admin/channels?${new URLSearchParams({ q, page: String(page), archived: archived ? "1" : "0" })}`,
      { signal: controller.signal },
    )
      .then(setList)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, page, archived, tick]);
  useEffect(() => {
    api<typeof capabilities>("/admin/channels/capabilities")
      .then(setCapabilities)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!document.hidden) setTick((v) => v + 1);
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    Promise.all([
      api<Room>(`/admin/channels/${selected}`, { signal: controller.signal }),
      api<Thread>(
        `/admin/channels/${selected}/messages?pinned=${pinned ? "1" : "0"}`,
        { signal: controller.signal },
      ),
    ])
      .then(([r, t]) => {
        if (controller.signal.aborted) return;
        setRoom(r);
        setMessages((previous) => {
          const combined = new Map(previous.map((m) => [m.id, m]));
          for (const m of t.items) combined.set(m.id, m);
          return [...combined.values()]
            .filter((m) => !pinned || (m.is_pinned && !m.is_deleted))
            .sort(
              (a, b) =>
                a.created_at.localeCompare(b.created_at) ||
                a.id.localeCompare(b.id),
            );
        });
        if (!historyStarted.current) {
          setCursor(t.nextCursor);
          historyStarted.current = true;
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            setRoom(undefined);
            setMessages([]);
            setMembers(null);
          }
          setError(e.message);
        }
      });
    return () => controller.abort();
  }, [selected, pinned, tick]);
  useEffect(() => {
    if (scrollAfterSend.current) {
      bottom.current?.scrollIntoView({ block: "end" });
      scrollAfterSend.current = false;
    }
  }, [messages]);
  useEffect(() => {
    if (mode) heading.current?.focus();
  }, [mode]);
  const dirty = !!draft || !!editing || !!mode;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function choose(id: string) {
    if (dirty && !window.confirm("Discard your unsent room changes?")) return;
    setSelected(id);
    selectedRef.current = id;
    setRoom(undefined);
    setMessages([]);
    setCursor(null);
    historyStarted.current = false;
    setMembers(null);
    setDraft("");
    setReplyTo(null);
    setEditing(null);
    setMode(null);
    setPassword("");
    setPinned(false);
    setError("");
    setNotice("");
    sendKey.current = null;
  }
  function open(next: Mode, m?: Member) {
    if (
      next === "create" &&
      (draft || editing) &&
      !window.confirm(
        "Discard your unsent message changes before creating another room?",
      )
    )
      return;
    if (next === "create") {
      setDraft("");
      setReplyTo(null);
      setEditing(null);
      sendKey.current = null;
    }
    setMode(next);
    setPassword("");
    setConfirmation("");
    setValues({
      name: next === "create" ? "" : room?.record.name || "",
      description: next === "create" ? "" : room?.record.description || "",
      visibility: capabilities?.globalCreate ? "private" : "team",
      teamId: capabilities?.teams[0]?.id || "",
      email: m?.user?.email || "",
      role: m?.role || "member",
    });
  }
  async function saveRoom(event: FormEvent) {
    event.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError("");
    const secret = password;
    setPassword("");
    try {
      let body: Record<string, unknown> = { currentPassword: secret };
      if (mode === "create")
        body.record = {
          name: values.name,
          description: values.description,
          visibility: values.visibility,
          teamId: values.visibility === "team" ? values.teamId : null,
        };
      else if (mode === "update")
        body = {
          ...body,
          revision: room!.record.revision,
          record: { name: values.name, description: values.description },
        };
      else
        body = {
          ...body,
          revision: room!.record.revision,
          action: mode,
          ...(["archive", "restore"].includes(mode)
            ? { confirmation }
            : { email: values.email, role: values.role }),
        };
      const r = await api<{ record: Channel }>(
        "/admin/channels" + (mode === "create" ? "" : "/" + room!.record.id),
        { method: mode === "update" ? "PATCH" : "POST", protected: true, body },
      );
      setMode(null);
      if (r.record.id !== selected) {
        setRoom(undefined);
        setMessages([]);
        setCursor(null);
        historyStarted.current = false;
        setReplyTo(null);
        setDraft("");
        setEditing(null);
        sendKey.current = null;
      }
      selectedRef.current = r.record.id;
      setSelected(r.record.id);
      setMembers(null);
      setTick((v) => v + 1);
      setNotice(
        "Room change saved with an audit entry. Visibility and owning team cannot be widened through an ordinary edit.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The room change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function messageAction(
    message: Message,
    action: "edit" | "delete" | "pin" | "read",
  ) {
    setBusy(true);
    setError("");
    try {
      await api(`/admin/channels/${selected}/messages/${message.id}`, {
        method: "POST",
        protected: true,
        body:
          action === "read"
            ? { action }
            : {
                action,
                revision: message.revision,
                ...(action === "pin"
                  ? { pinned: !message.is_pinned }
                  : action === "edit"
                    ? { message: editText }
                    : {}),
              },
      });
      setEditing(null);
      setDeleteMessage(null);
      setTick((v) => v + 1);
      setNotice(
        action === "read"
          ? "Room marked as read through the selected message."
          : "Message change saved.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The message could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      sendKey.current ??= crypto.randomUUID();
      await api(`/admin/channels/${selected}/messages`, {
        method: "POST",
        protected: true,
        idempotencyKey: sendKey.current,
        body: { message: draft, replyToId: replyTo?.id || null },
      });
      setDraft("");
      setReplyTo(null);
      sendKey.current = null;
      scrollAfterSend.current = true;
      setTick((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The message was not sent. Your draft is preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  const field = (name: string) => ({
    value: values[name] || "",
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Channels</h1>
          <p>
            Internal conversations with deliberate room scope. This version
            refreshes through the protected API every five seconds; Realtime
            transport is still being completed.
          </p>
        </div>
        {(capabilities?.globalCreate || !!capabilities?.teams.length) && (
          <Button disabled={busy || !!mode} onClick={() => open("create")}>
            Create room
          </Button>
        )}
      </header>
      {error && (
        <p className="gt-form-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setTick((v) => v + 1)}>
            Retry
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {mode && (
        <section className="gt-panel gt-event-editor">
          <h2 ref={heading} tabIndex={-1}>
            {modeName[mode]}
          </h2>
          <form className="gt-form" onSubmit={saveRoom}>
            {["create", "update"].includes(mode) && (
              <>
                <Field label="Room name" required>
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    {...field("name")}
                  />
                </Field>
                <Field label="Room description">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    {...field("description")}
                  />
                </Field>
                {mode === "create" && (
                  <>
                    <Field label="Room audience">
                      <select {...field("visibility")}>
                        {(capabilities?.globalCreate
                          ? ["private", "internal", "team"]
                          : ["team"]
                        ).map((v) => (
                          <option key={v} value={v}>
                            {v === "private"
                              ? "Private · explicit members only"
                              : v === "internal"
                                ? "Internal · active chapter accounts"
                                : "Team · active members of one team"}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {values.visibility === "team" && (
                      <Field label="Owning team" required>
                        <select required {...field("teamId")}>
                          <option value="">Choose an eligible team</option>
                          {capabilities?.teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                  </>
                )}
              </>
            )}
            {mode.startsWith("member_") && (
              <>
                <Field label="Existing account email" required>
                  <input
                    type="email"
                    required
                    maxLength={255}
                    {...field("email")}
                  />
                </Field>
                <Field label="Room role">
                  <select {...field("role")}>
                    {["member", "moderator", "owner"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <p className="gt-helper">
                  Explicit membership controls access to private rooms and
                  moderation roles. Internal rooms remain open to their
                  audience; team rooms still require current team membership.
                </p>
              </>
            )}
            {["archive", "restore"].includes(mode) && (
              <>
                <p>
                  Archiving preserves messages and memberships as read-only.
                  Restoration does not widen the room's audience.
                </p>
                <Field label="Type the complete room name to confirm" required>
                  <input
                    required
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field label="Confirm your own password" required>
              <input
                type="password"
                required
                autoComplete="current-password"
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="gt-button-row">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save room change"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setMode(null);
                  setPassword("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}
      <div
        className={`gt-channel-layout ${selected ? "gt-channel-selected" : ""}`}
      >
        <aside className="gt-room-directory" aria-label="Channel directory">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            label="Search rooms"
            placeholder="Search rooms"
          />
          <Field label="Room state">
            <select
              value={archived ? "archived" : "current"}
              onChange={(e) => {
                setArchived(e.target.value === "archived");
                setPage(1);
              }}
            >
              <option value="current">Current rooms</option>
              <option value="archived">Archived rooms</option>
            </select>
          </Field>
          {loading && !list ? (
            <p role="status">Loading rooms…</p>
          ) : list?.items.length ? (
            <ul>
              {list.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={selected === c.id ? "page" : undefined}
                    onClick={() => choose(c.id)}
                  >
                    <strong># {c.name}</strong>
                    <small>
                      {c.visibility} ·{" "}
                      {c.is_archived
                        ? "archived"
                        : (c.unreadCount || 0) + " unread"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gt-helper">No authorized rooms match this view.</p>
          )}
          <nav className="gt-button-row" aria-label="Room pages">
            <Button
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </Button>
            <span>{page}</span>
            <Button
              variant="ghost"
              disabled={!list || page * list.pageSize >= list.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </Button>
          </nav>
        </aside>
        <section className="gt-channel-thread" aria-label="Selected room">
          {!selected ? (
            <EmptyState title="Choose a conversation">
              Private rooms appear only when you have explicit access. Team
              rooms also require active team membership.
            </EmptyState>
          ) : !room ? (
            <>
              <Button variant="secondary" onClick={() => choose("")}>
                Back to rooms
              </Button>
              {!error && <p role="status">Loading the room…</p>}
            </>
          ) : (
            <>
              <header className="gt-admin-heading">
                <div>
                  <h2># {room.record.name}</h2>
                  <p>{room.record.description}</p>
                  <Badge>
                    {room.record.visibility}
                    {room.record.is_archived ? " · read-only archive" : ""}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => choose("")}
                >
                  Back to rooms
                </Button>
              </header>
              <div className="gt-button-row">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPinned((v) => !v);
                    setMessages([]);
                    setCursor(null);
                    historyStarted.current = false;
                  }}
                >
                  {pinned ? "Show conversation" : "Pinned messages"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    if (members) {
                      setMembers(null);
                      return;
                    }
                    await loadMembers(1);
                  }}
                >
                  Room memberships
                </Button>
                {room.actions.manage && (
                  <>
                    <Button
                      variant="ghost"
                      disabled={!!mode || busy}
                      onClick={() => open("update")}
                    >
                      Edit room
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!!mode || busy}
                      onClick={() => open("member_add")}
                    >
                      Add membership
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!!mode || busy}
                      onClick={() => open("archive")}
                    >
                      Archive
                    </Button>
                  </>
                )}
                {room.canRestore && (
                  <Button
                    variant="secondary"
                    disabled={!!mode || busy}
                    onClick={() => open("restore")}
                  >
                    Restore room
                  </Button>
                )}
              </div>
              {members && (
                <section className="gt-room-members">
                  <h3>Explicit room memberships</h3>
                  <p className="gt-helper">
                    Internal and team audiences also apply. These are explicit
                    room memberships only.
                  </p>
                  <ul>
                    {members.map((m) => (
                      <li key={m.admin_user_id}>
                        <span>
                          {m.user?.display_name || "Chapter teammate"}
                          {m.user?.email && " · " + m.user.email} · {m.role}
                        </span>
                        {room.actions.manage && (
                          <div className="gt-button-row">
                            <Button
                              variant="ghost"
                              onClick={() => open("member_role", m)}
                            >
                              Change role
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => open("member_remove", m)}
                            >
                              Remove explicit membership
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <nav
                    className="gt-button-row"
                    aria-label="Room membership pages"
                  >
                    <Button
                      variant="secondary"
                      disabled={memberPage <= 1}
                      onClick={() => loadMembers(memberPage - 1)}
                    >
                      Previous memberships
                    </Button>
                    <span>
                      Page {memberPage} · {memberTotal} memberships
                    </span>
                    <Button
                      variant="secondary"
                      disabled={memberPage * 30 >= memberTotal}
                      onClick={() => loadMembers(memberPage + 1)}
                    >
                      Next memberships
                    </Button>
                  </nav>
                </section>
              )}
              {cursor && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await api<Thread>(
                        `/admin/channels/${selected}/messages?${new URLSearchParams({ ...cursor, pinned: pinned ? "1" : "0" })}`,
                      );
                      setMessages((v) => [
                        ...r.items,
                        ...v.filter((m) => !r.items.some((n) => n.id === m.id)),
                      ]);
                      setCursor(r.nextCursor);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Older messages could not load.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Load older messages
                </Button>
              )}
              <ol
                className="gt-channel-messages"
                role="log"
                aria-label="Room messages"
                aria-live="polite"
                aria-relevant="additions"
              >
                {messages.map((m) => (
                  <li key={m.id}>
                    <header>
                      <strong>{m.senderName || "Chapter teammate"}</strong>
                      <time dateTime={m.created_at}>
                        {new Date(m.created_at).toLocaleString()}
                      </time>
                      {m.is_pinned && <Badge>Pinned</Badge>}
                    </header>
                    {m.reply && (
                      <blockquote>
                        {m.reply.is_deleted
                          ? "Original message was removed"
                          : m.reply.message}
                      </blockquote>
                    )}
                    {m.is_deleted ? (
                      <p className="gt-helper">Message removed.</p>
                    ) : editing?.id === m.id ? (
                      <form
                        className="gt-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          messageAction(m, "edit");
                        }}
                      >
                        <Field label="Edit your message" required>
                          <textarea
                            required
                            maxLength={10000}
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                          />
                        </Field>
                        <div className="gt-button-row">
                          <Button type="submit" disabled={busy}>
                            Save edit
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setEditing(null)}
                          >
                            Cancel edit
                          </Button>
                        </div>
                      </form>
                    ) : (
                      <p className="gt-message-body">{m.message}</p>
                    )}
                    {!m.is_deleted && (
                      <div className="gt-button-row">
                        {room.actions.send && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setReplyTo(m);
                              sendKey.current = null;
                            }}
                          >
                            Reply
                          </Button>
                        )}
                        {m.canEdit && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              setEditing(m);
                              setEditText(m.message);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {m.canDelete && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => setDeleteMessage(m)}
                          >
                            Remove
                          </Button>
                        )}
                        {room.actions.moderate && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => messageAction(m, "pin")}
                          >
                            {m.is_pinned ? "Unpin" : "Pin"}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {messages.length > 0 && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    messageAction(messages[messages.length - 1], "read")
                  }
                >
                  Mark room read through latest loaded message
                </Button>
              )}
              {!messages.length && (
                <p className="gt-helper">
                  {pinned
                    ? "No pinned messages in this room."
                    : "No messages yet. Start a useful, chapter-focused conversation."}
                </p>
              )}
              {deleteMessage && (
                <section className="gt-operational-confirm">
                  <h3>Remove this message?</h3>
                  <p>
                    The conversation keeps a tombstone and audit entry. The
                    original text is no longer shown in messages or reply
                    previews.
                  </p>
                  <div className="gt-button-row">
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => messageAction(deleteMessage, "delete")}
                    >
                      Confirm removal
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setDeleteMessage(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </section>
              )}
              {room.actions.send && (
                <form className="gt-form gt-channel-composer" onSubmit={send}>
                  {replyTo && (
                    <div className="gt-button-row">
                      <span>
                        Replying to {replyTo.senderName || "a teammate"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setReplyTo(null);
                          sendKey.current = null;
                        }}
                      >
                        Cancel reply
                      </Button>
                    </div>
                  )}
                  <Field
                    label="Message this room"
                    required
                    hint="Plain text only. Files and Realtime are not yet connected; never share passwords or private access links."
                  >
                    <textarea
                      required
                      rows={3}
                      maxLength={10000}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        sendKey.current = null;
                      }}
                    />
                  </Field>
                  <Button disabled={busy || !draft.trim()} type="submit">
                    {busy ? "Sending…" : "Send message"}
                  </Button>
                </form>
              )}
              <div ref={bottom} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
