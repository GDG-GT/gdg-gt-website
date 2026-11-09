import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { confirmAction } from "@/lib/app-dialogs";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useScopedRealtime } from "@/hooks/useScopedRealtime";
import {
  useApprovedSearchParams as useSearchParams,
  useDraftGuard,
} from "@/hooks/useDraftGuard";
import { mergeMessageChanges, mergeMessageHistory } from "./message-sync";
import {
  ActionLink,
  Badge,
  Button,
  EmptyState,
  Field,
  SearchBox,
} from "../primitives";
type Channel = {
  id: string;
  name: string;
  description: string;
  visibility: string;
  team_id: string | null;
  is_archived: boolean;
  is_team_chat: boolean;
  revision: number;
  unreadCount?: number;
};
type Room = {
  record: Channel;
  actions: {
    manage: boolean;
    moderate: boolean;
    send: boolean;
    manageMembers: boolean;
  };
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
  creation_sequence: number;
  change_sequence: number;
  created_at: string;
  updated_at: string;
  canEdit: boolean;
  canDelete: boolean;
  reply: { id: string; message: string; is_deleted: boolean } | null;
};
type Cursor = { before: string; beforeId: string };
type Thread = {
  items: Message[];
  nextCursor: Cursor | null;
  highWaterMark: number;
};
type Changes = { items: Message[]; cursor: number; hasMore: boolean };
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
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <ChannelWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function ChannelWorkspaceContent() {
  const { isOnline } = useOnlineStatus();
  const [searchParams, setSearchParams] = useSearchParams(),
    selected = searchParams.get("room") || "";
  const setSelected = (id: string) => setSearchParams(id ? { room: id } : {});
  const [list, setList] = useState<Listing>(),
    [capabilities, setCapabilities] = useState<{
      globalCreate: boolean;
      teams: { id: string; name: string }[];
    }>(),
    [q, setQ] = useState(""),
    [archived, setArchived] = useState(false),
    [page, setPage] = useState(1),
    [roomSnapshot, setRoom] = useState<Room>(),
    [messages, setMessages] = useState<Message[]>([]),
    [cursor, setCursor] = useState<Cursor | null>(null),
    [pinned, setPinned] = useState(false),
    [tick, setTick] = useState(0),
    [loading, setLoading] = useState(true),
    [capabilityVersion, setCapabilityVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [readErrors, setReadErrors] = useState({
      list: "",
      capabilities: "",
      room: "",
      members: "",
    }),
    [roomLoading, setRoomLoading] = useState(false),
    [roomReadAt, setRoomReadAt] = useState<string>(),
    [listReadAt, setListReadAt] = useState<string>(),
    [capabilityLoading, setCapabilityLoading] = useState(true),
    [memberLoading, setMemberLoading] = useState(false);
  const room = roomSnapshot?.record.id === selected ? roomSnapshot : undefined;
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
    modeRevision = useRef<number>(),
    bottom = useRef<HTMLDivElement>(null),
    scrollAfterSend = useRef(false),
    sendKey = useRef<string | null>(null),
    changeCursor = useRef<{
      key: string;
      after: number;
      baseline: number;
    } | null>(null),
    selectedRef = useRef(selected),
    mounted = useRef(true),
    operation = useRef<AbortController>(),
    operationRoom = useRef(""),
    busyRef = useRef(false),
    memberRequest = useRef<AbortController>(),
    roomEpoch = useRef(0),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    editFocus = useRef<HTMLTextAreaElement>(null);
  const [memberPage, setMemberPage] = useState(1),
    [memberTotal, setMemberTotal] = useState(0);
  selectedRef.current = selected;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      memberRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (editing) editFocus.current?.focus();
  }, [editing]);
  const roomWritable = !!room && !roomLoading && !readErrors.room && isOnline;
  function begin(needsRoom = true) {
    if (busyRef.current || !isOnline || (needsRoom && !roomWritable)) return;
    const controller = new AbortController();
    operation.current = controller;
    operationRoom.current = selected;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    return controller;
  }
  const current = (controller: AbortController) =>
    mounted.current &&
    operation.current === controller &&
    !controller.signal.aborted &&
    selectedRef.current === operationRoom.current;
  function finish(controller: AbortController) {
    if (mounted.current && operation.current === controller) {
      operation.current = undefined;
      busyRef.current = false;
      setBusy(false);
    }
  }
  const retry = () => {
    if (busyRef.current || !isOnline) return;
    setTick((value) => value + 1);
    setCapabilityVersion((value) => value + 1);
    document.getElementById("workspace-content")?.focus();
  };
  useEffect(() => {
    setList(undefined);
    setListReadAt(undefined);
  }, [q, page, archived]);
  useEffect(() => {
    memberRequest.current?.abort();
    setMemberLoading(false);
    setReadErrors((previous) => ({ ...previous, room: "", members: "" }));
    setRoom(undefined);
    setMessages([]);
    setMembers(null);
    setCursor(null);
    changeCursor.current = null;
    setReplyTo(null);
    setEditing(null);
    setMode(null);
    setPassword("");
    setConfirmation("");
    setDraft("");
    sendKey.current = null;
  }, [selected]);
  function clearRoomAccess() {
    roomEpoch.current++;
    operation.current?.abort();
    operation.current = undefined;
    busyRef.current = false;
    setBusy(false);
    memberRequest.current?.abort();
    setRoom(undefined);
    setMessages([]);
    setMembers(null);
    setMode(null);
    setValues({});
    setPassword("");
    setConfirmation("");
    setDraft("");
    setReplyTo(null);
    setEditing(null);
    setEditText("");
    setDeleteMessage(null);
    changeCursor.current = null;
    sendKey.current = null;
    setRoomReadAt(undefined);
    setRoomLoading(false);
    setMemberLoading(false);
    setNotice("");
  }
  const liveStatus = useScopedRealtime(
    selected ? { kind: "channel", id: selected } : null,
    () => {
      if (!busyRef.current) setTick((v) => v + 1);
    },
    () => {
      clearRoomAccess();
      setTick((v) => v + 1);
    },
  );
  async function loadMembers(page: number) {
    memberRequest.current?.abort();
    const controller = new AbortController();
    memberRequest.current = controller;
    setMemberLoading(true);
    setReadErrors((previous) => ({ ...previous, members: "" }));
    try {
      const r = await api<{ items: Member[]; total: number }>(
        `/admin/channels/${selected}/members?page=${page}`,
        { signal: controller.signal },
      );
      if (
        !mounted.current ||
        controller.signal.aborted ||
        selectedRef.current !== selected
      )
        return;
      setMembers(r.items);
      setMemberTotal(r.total);
      setMemberPage(page);
    } catch (e) {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        selectedRef.current === selected
      )
        setReadErrors((previous) => ({
          ...previous,
          members:
            e instanceof Error ? e.message : "Room memberships could not load.",
        }));
    } finally {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        selectedRef.current === selected
      )
        setMemberLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setReadErrors((previous) => ({ ...previous, list: "" }));
    api<Listing>(
      `/admin/channels?${new URLSearchParams({ q, page: String(page), archived: archived ? "1" : "0" })}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setList(r);
          setListReadAt(new Date().toISOString());
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setReadErrors((previous) => ({ ...previous, list: e.message }));
          if (e instanceof ApiFailure && [401, 403].includes(e.status)) {
            setList(undefined);
            clearRoomAccess();
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, page, archived, tick]);
  useEffect(() => {
    const controller = new AbortController();
    setReadErrors((previous) => ({ ...previous, capabilities: "" }));
    setCapabilityLoading(true);
    api<typeof capabilities>("/admin/channels/capabilities", {
      signal: controller.signal,
    })
      .then((r) => {
        if (!controller.signal.aborted) setCapabilities(r);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setCapabilities(undefined);
          setReadErrors((previous) => ({
            ...previous,
            capabilities: e.message,
          }));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCapabilityLoading(false);
      });
    return () => controller.abort();
  }, [capabilityVersion]);
  useEffect(() => {
    const timer = window.setInterval(
      () => {
        if (!document.hidden && !busyRef.current && navigator.onLine)
          setTick((v) => v + 1);
      },
      liveStatus === "live" ? 30000 : 5000,
    );
    return () => clearInterval(timer);
  }, [liveStatus]);
  useEffect(() => {
    const refresh = () => {
      if (!busyRef.current) setTick((v) => v + 1);
    };
    const access = () => {
      setCapabilities(undefined);
      setCapabilityVersion((v) => v + 1);
      setTick((v) => v + 1);
    };
    window.addEventListener("gdg:notifications-updated", refresh);
    window.addEventListener("gdg:access-changed", access);
    return () => {
      window.removeEventListener("gdg:access-changed", access);
      window.removeEventListener("gdg:notifications-updated", refresh);
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setRoomLoading(true);
    setReadErrors((previous) => ({ ...previous, room: "" }));
    const key = `${selected}:${pinned}`;
    const readEpoch = roomEpoch.current;
    const current = () =>
      !controller.signal.aborted &&
      selectedRef.current === selected &&
      roomEpoch.current === readEpoch;
    let moreTimer: number | undefined;
    (async () => {
      const r = await api<Room>(`/admin/channels/${selected}`, {
        signal: controller.signal,
      });
      if (!current()) return;
      setRoom(r);
      if (changeCursor.current?.key !== key) {
        const t = await api<Thread>(
          `/admin/channels/${selected}/messages?pinned=${pinned ? "1" : "0"}`,
          { signal: controller.signal },
        );
        if (!current()) return;
        setMessages(mergeMessageHistory([], t.items, pinned));
        setCursor(t.nextCursor);
        changeCursor.current = {
          key,
          after: t.highWaterMark,
          baseline: t.highWaterMark,
        };
      }
      // Each bounded page is acknowledged only after applying it. Broadcast loss,
      // token renewal, or >50 new messages cannot skip the middle of a reconnect.
      for (let page = 0; page < 10; page++) {
        const { after, baseline }: { after: number; baseline: number } =
          changeCursor.current;
        const delta: Changes = await api<Changes>(
          `/admin/channels/${selected}/updates?after=${after}`,
          { signal: controller.signal },
        );
        if (!current()) return;
        setMessages((previous) =>
          mergeMessageChanges(previous, delta.items, baseline, pinned),
        );
        changeCursor.current = { key, after: delta.cursor, baseline };
        if (!delta.hasMore) {
          setRoomReadAt(new Date().toISOString());
          return;
        }
      }
      moreTimer = window.setTimeout(() => setTick((v) => v + 1), 100);
    })()
      .catch((e) => {
        if (!controller.signal.aborted && selectedRef.current === selected) {
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            clearRoomAccess();
          }
          setReadErrors((previous) => ({ ...previous, room: e.message }));
        }
      })
      .finally(() => {
        if (current()) setRoomLoading(false);
      });
    return () => {
      controller.abort();
      window.clearTimeout(moreTimer);
    };
  }, [selected, pinned, tick, liveStatus]);
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
  const modeStale =
    !!mode &&
    mode !== "create" &&
    !!room &&
    modeRevision.current !== room.record.revision;
  const modeAccessLost =
    !!mode &&
    mode !== "create" &&
    (!room ||
      (mode === "restore"
        ? !room.canRestore
        : mode.startsWith("member_")
          ? !room.actions.manageMembers
          : !room.actions.manage));
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useDraftGuard(dirty, { busy, label: "Room message or room settings" });
  async function choose(id: string) {
    if (busyRef.current) return;
    if (dirty && !(await confirmAction("Discard your unsent room changes?")))
      return;
    setSelected(id);
    selectedRef.current = id;
    setRoom(undefined);
    setMessages([]);
    setCursor(null);
    changeCursor.current = null;
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
  async function open(next: Mode, m?: Member) {
    if (busyRef.current) return;
    if (
      dirty &&
      !(await confirmAction("Discard your unsaved room or message changes?"))
    )
      return;
    setDraft("");
    setReplyTo(null);
    setEditing(null);
    setEditText("");
    sendKey.current = null;
    modeRevision.current = room?.record.revision;
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
    if (!mode || modeStale || modeAccessLost) return;
    if (
      !password ||
      (["archive", "restore"].includes(mode) &&
        confirmation !== room?.record.name)
    )
      return;
    if (
      mode === "create" &&
      (capabilityLoading ||
        !(values.visibility === "team"
          ? capabilities?.teams.some((team) => team.id === values.teamId)
          : capabilities?.globalCreate))
    )
      return;
    const controller = begin(mode !== "create");
    if (!controller) return;
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
          revision: modeRevision.current,
          record: { name: values.name, description: values.description },
        };
      else
        body = {
          ...body,
          revision: modeRevision.current,
          action: mode,
          ...(["archive", "restore"].includes(mode)
            ? { confirmation }
            : { email: values.email, role: values.role }),
        };
      const r = await api<{ record: Channel }>(
        "/admin/channels" + (mode === "create" ? "" : "/" + room!.record.id),
        {
          method: mode === "update" ? "PATCH" : "POST",
          protected: true,
          body,
          signal: controller.signal,
        },
      );
      if (!current(controller)) return;
      setMode(null);
      if (r.record.id !== selected) {
        setRoom(undefined);
        setMessages([]);
        setCursor(null);
        changeCursor.current = null;
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
      if (!current(controller)) return;
      setError(
        e instanceof Error ? e.message : "The room change could not be saved.",
      );
    } finally {
      finish(controller);
    }
  }
  async function messageAction(
    message: Message,
    action: "edit" | "delete" | "pin" | "read",
  ) {
    const controller = begin();
    if (!controller) return;
    try {
      await api(`/admin/channels/${selected}/messages/${message.id}`, {
        method: "POST",
        protected: true,
        signal: controller.signal,
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
      if (!current(controller)) return;
      if (action === "edit") {
        setEditing(null);
        setEditText("");
      }
      if (action === "delete") setDeleteMessage(null);
      setTick((v) => v + 1);
      setNotice(
        action === "read"
          ? "Room marked as read through the selected message."
          : "Message change saved.",
      );
    } catch (e) {
      if (!current(controller)) return;
      setError(
        e instanceof Error ? e.message : "The message could not be changed.",
      );
    } finally {
      finish(controller);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (editing || mode || !room?.actions.send || room.record.is_archived)
      return;
    const controller = begin();
    if (!controller) return;
    try {
      sendKey.current ??= crypto.randomUUID();
      await api(`/admin/channels/${selected}/messages`, {
        method: "POST",
        protected: true,
        signal: controller.signal,
        idempotencyKey: sendKey.current,
        body: { message: draft, replyToId: replyTo?.id || null },
      });
      if (!current(controller)) return;
      setDraft("");
      setReplyTo(null);
      sendKey.current = null;
      scrollAfterSend.current = true;
      setNotice("Message sent to this room.");
      setTick((v) => v + 1);
    } catch (e) {
      if (!current(controller)) return;
      setError(
        e instanceof Error
          ? e.message
          : "The message was not sent. Your draft is preserved.",
      );
    } finally {
      finish(controller);
    }
  }
  const field = (name: string) => ({
    disabled: busy,
    value: values[name] || "",
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  const visibleMessages =
    changeCursor.current?.key === `${selected}:${pinned}` ? messages : [];
  const initialHistoryLoading =
    changeCursor.current?.key !== `${selected}:${pinned}` && !readErrors.room;
  const messageNotice =
    notice === "Message sent to this room." ||
    notice === "Message change saved." ||
    notice === "Room marked as read through the selected message.";
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Channels</h1>
          <p>
            Private chapter conversations, with live updates and deliberately
            scoped room access.
          </p>
        </div>
        {(capabilities?.globalCreate || !!capabilities?.teams.length) && (
          <Button
            disabled={busy || !isOnline || capabilityLoading || !!mode}
            onClick={() => open("create")}
          >
            Create room
          </Button>
        )}
      </header>
      {!isOnline && (
        <p role="status" className="gt-data-note">
          You are offline. Unsent room text stays only in this open tab.
          Reconnect and refresh before saving; nothing is sent automatically.
        </p>
      )}
      {capabilityLoading && (
        <div role="status" aria-label="Loading room creation permissions">
          <div className="gt-skeleton gt-loading-heading" />
          <span className="sr-only">Loading room creation permissions…</span>
        </div>
      )}
      {memberLoading && (
        <div role="status" aria-label="Loading room memberships">
          <div className="gt-skeleton gt-loading-heading" />
        </div>
      )}
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          className="gt-form-error"
          role="alert"
        >
          {error}{" "}
          <button type="button" disabled={busy || !isOnline} onClick={retry}>
            Refresh current data
          </button>
        </p>
      )}
      {Object.entries(readErrors)
        .filter(([, value]) => value)
        .map(([name, value]) => (
          <p key={name} className="gt-form-error" role="alert">
            {name}: {value}{" "}
            <button
              disabled={busy || !isOnline}
              onClick={() =>
                name === "members" ? void loadMembers(memberPage) : retry()
              }
            >
              Retry {name}
            </button>
          </p>
        ))}
      {list && (readErrors.list || !isOnline) && (
        <p role="status" className="gt-data-note">
          Room list may be out of date. Last loaded{" "}
          {listReadAt ? new Date(listReadAt).toLocaleString() : "earlier"}.
        </p>
      )}
      {room && (readErrors.room || !isOnline) && (
        <p role="status" className="gt-data-note">
          Room history may be out of date. Last loaded{" "}
          {roomReadAt ? new Date(roomReadAt).toLocaleString() : "earlier"}.
          Refresh before acting on these messages.
        </p>
      )}
      {notice && !messageNotice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {modeStale && (
        <p className="gt-form-error" role="alert">
          This room changed. Your staged settings are preserved. Cancel to load
          the latest version before saving.
        </p>
      )}
      {modeAccessLost && (
        <p className="gt-form-error" role="alert">
          Your room permissions changed. This action can no longer be saved;
          cancel it to continue with your current access.
        </p>
      )}
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
                    disabled={busy}
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
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="gt-button-row">
              <Button
                type="submit"
                disabled={
                  busy ||
                  !isOnline ||
                  !password ||
                  modeStale ||
                  (mode !== "create" && !roomWritable) ||
                  modeAccessLost ||
                  (["archive", "restore"].includes(mode) &&
                    confirmation !== room?.record.name) ||
                  (mode === "create" &&
                    (capabilityLoading ||
                      !(values.visibility === "team"
                        ? capabilities?.teams.some(
                            (team) => team.id === values.teamId,
                          )
                        : capabilities?.globalCreate)))
                }
              >
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
          {(q || archived || page > 1) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ("");
                setArchived(false);
                setPage(1);
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Reset room filters
            </Button>
          )}
          {loading && !list ? (
            <div role="status" aria-label="Loading rooms">
              <div className="gt-skeleton gt-loading-heading" />
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading rooms…</span>
            </div>
          ) : readErrors.list && !list ? (
            <p>Rooms are unavailable. Use Retry list to load your rooms.</p>
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
              {readErrors.room ? (
                <p>
                  This room is unavailable. Use Retry room to check your access.
                </p>
              ) : (
                <div role="status" aria-label="Loading selected room">
                  <div className="gt-skeleton gt-detail-skeleton" />
                  <span className="sr-only">Loading the room…</span>
                </div>
              )}
            </>
          ) : (
            <>
              <header className="gt-admin-heading">
                <div>
                  <h2># {room.record.name}</h2>
                  <p>{room.record.description}</p>
                  {room.record.is_team_chat && (
                    <p className="gt-help">
                      Access follows current team membership. Chapter
                      administrators retain oversight access.
                    </p>
                  )}
                  <Badge>
                    {room.record.visibility}
                    {room.record.is_archived ? " · read-only archive" : ""}
                  </Badge>
                  <span role="status" className="gt-field-hint">
                    {liveStatus === "live"
                      ? "Live updates connected"
                      : liveStatus === "denied"
                        ? "Live access ended — checking room access"
                        : liveStatus === "connecting"
                          ? "Connecting live updates…"
                          : "Live connection unavailable — checking every five seconds"}
                  </span>
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
                  disabled={busy || !!editing || !!mode}
                  onClick={() => {
                    setPinned((v) => !v);
                    setMessages([]);
                    setCursor(null);
                    changeCursor.current = null;
                  }}
                >
                  {pinned ? "Show conversation" : "Pinned messages"}
                </Button>
                {!room.record.is_team_chat && (
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
                )}
                {room.record.is_team_chat && (
                  <ActionLink
                    to={`/admin/team/${room.record.team_id}?section=members`}
                    variant="ghost"
                  >
                    Team memberships
                  </ActionLink>
                )}
                {room.actions.manage && (
                  <>
                    <Button
                      variant="ghost"
                      disabled={!!mode || busy}
                      onClick={() => open("update")}
                    >
                      Edit room
                    </Button>
                    {room.actions.manageMembers && (
                      <Button
                        variant="ghost"
                        disabled={!!mode || busy}
                        onClick={() => open("member_add")}
                      >
                        Add membership
                      </Button>
                    )}
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
                        {room.actions.manageMembers && (
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
                    const controller = begin();
                    if (!controller) return;
                    try {
                      const r = await api<Thread>(
                        `/admin/channels/${selected}/messages?${new URLSearchParams({ ...cursor, pinned: pinned ? "1" : "0" })}`,
                        { signal: controller.signal },
                      );
                      if (!current(controller)) return;
                      setMessages((v) =>
                        mergeMessageHistory(v, r.items, pinned),
                      );
                      setCursor(r.nextCursor);
                    } catch (e) {
                      if (!current(controller)) return;
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Older messages could not load.",
                      );
                    } finally {
                      finish(controller);
                    }
                  }}
                >
                  Load older messages
                </Button>
              )}
              {initialHistoryLoading && (
                <div role="status" aria-label="Loading room messages">
                  <div className="gt-skeleton gt-detail-skeleton" />
                </div>
              )}
              <div
                role="log"
                aria-label="Room messages"
                aria-live="polite"
                aria-relevant="additions"
              >
                <ol className="gt-channel-messages">
                  {visibleMessages.map((m) => (
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
                      {editing?.id === m.id ? (
                        <form
                          className="gt-form"
                          onSubmit={(e) => {
                            e.preventDefault();
                            messageAction(editing, "edit");
                          }}
                        >
                          <Field label="Edit your message" required>
                            <textarea
                              ref={editFocus}
                              required
                              maxLength={10000}
                              disabled={busy}
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                            />
                          </Field>
                          {(editing.revision !== m.revision ||
                            m.is_deleted) && (
                            <p className="gt-form-error" role="alert">
                              This message changed or was removed. Your edit
                              draft is preserved. Cancel to load its current
                              version.
                            </p>
                          )}
                          <div className="gt-button-row">
                            <Button
                              type="submit"
                              disabled={
                                busy ||
                                !roomWritable ||
                                !room.actions.send ||
                                editing.revision !== m.revision ||
                                m.is_deleted
                              }
                            >
                              Save edit
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                setEditing(null);
                                setEditText("");
                              }}
                            >
                              Cancel edit
                            </Button>
                          </div>
                        </form>
                      ) : m.is_deleted ? (
                        <p className="gt-helper">Message removed.</p>
                      ) : (
                        <p className="gt-message-body">{m.message}</p>
                      )}
                      {!m.is_deleted && (
                        <div className="gt-button-row">
                          {room.actions.send && (
                            <Button
                              variant="ghost"
                              disabled={
                                busy || !roomWritable || !!editing || !!mode
                              }
                              onClick={() => {
                                setReplyTo(m);
                                sendKey.current = null;
                              }}
                            >
                              Reply
                            </Button>
                          )}
                          {room.actions.send &&
                            m.sender_id === room.actorId && (
                              <Button
                                variant="ghost"
                                disabled={
                                  busy || !!editing || !!mode || !!draft
                                }
                                onClick={() => {
                                  setEditing(m);
                                  setEditText(m.message);
                                }}
                              >
                                Edit
                              </Button>
                            )}
                          {room.actions.send &&
                            (m.sender_id === room.actorId ||
                              room.actions.moderate) && (
                              <Button
                                variant="ghost"
                                disabled={
                                  busy || !roomWritable || !!editing || !!mode
                                }
                                onClick={() => setDeleteMessage(m)}
                              >
                                Remove
                              </Button>
                            )}
                          {room.actions.moderate && (
                            <Button
                              variant="ghost"
                              disabled={
                                busy || !roomWritable || !!editing || !!mode
                              }
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
              </div>
              {visibleMessages.length > 0 && (
                <Button
                  variant="secondary"
                  disabled={busy || !roomWritable || !!editing || !!mode}
                  onClick={() =>
                    messageAction(
                      visibleMessages[visibleMessages.length - 1],
                      "read",
                    )
                  }
                >
                  Mark loaded messages read
                </Button>
              )}
              {!visibleMessages.length &&
                !initialHistoryLoading &&
                !readErrors.room && (
                  <p className="gt-helper">
                    {pinned
                      ? "No pinned messages in this room."
                      : "No messages yet. Start a useful, chapter-focused conversation."}
                  </p>
                )}
              {deleteMessage && (
                <Dialog
                  open
                  onOpenChange={(open) => {
                    if (!open && !busy) setDeleteMessage(null);
                  }}
                >
                  <DialogContent>
                    <DialogTitle>Remove this message?</DialogTitle>
                    <DialogDescription>
                      The conversation keeps a tombstone and audit entry. The
                      original text is no longer shown in messages or reply
                      previews.
                    </DialogDescription>
                    {error && <p role="alert">{error}</p>}
                    <div className="gt-button-row">
                      <Button
                        variant="danger"
                        disabled={busy || !roomWritable}
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
                  </DialogContent>
                </Dialog>
              )}
              {notice && messageNotice && (
                <p ref={noticeFocus} tabIndex={-1} role="status">
                  {notice}
                </p>
              )}
              {room.actions.send && !editing && !mode && (
                <form className="gt-form gt-channel-composer" onSubmit={send}>
                  {replyTo && (
                    <div className="gt-button-row">
                      <span>
                        Replying to {replyTo.senderName || "a teammate"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
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
                    hint="Plain text only; file attachments are not available yet. Never share passwords or private access links."
                  >
                    <textarea
                      required
                      rows={3}
                      maxLength={10000}
                      disabled={busy}
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        sendKey.current = null;
                      }}
                    />
                  </Field>
                  <Button
                    disabled={busy || !roomWritable || !draft.trim()}
                    type="submit"
                  >
                    {busy ? "Working…" : "Send message"}
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
