import { useWorkspaceReadiness } from "@/contexts/WorkspaceReadinessContext";
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
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ContactInboxLink from "./ContactInboxLink";
import { validationMessage } from "@/lib/validationMessage";
import { useScopedRealtime } from "@/hooks/useScopedRealtime";
import { chapterAnnouncementRecord } from "../../../shared/announcements.mjs";
import {
  ActionLink,
  Badge,
  Button,
  EmptyState,
  Field,
  SearchBox,
} from "../primitives";
type Audience = {
  type: "all" | "roles" | "teams" | "users";
  roles?: string[];
  teamIds?: string[];
  emails?: string[];
};
type Announcement = {
  id: string;
  title: string;
  message: string;
  priority: string;
  pinned: boolean;
  state: string;
  revision: number;
  audience: Audience | null;
  scheduledFor: string | null;
  expiresAt: string | null;
  emailEnabled: boolean;
  publicationVersion: number;
  canManage: boolean;
  canAcknowledge: boolean;
  isRead: boolean;
  authorName: string | null;
  updated_at: string;
  readCount: number | null;
  recipientCount: number | null;
  delivery: {
    queued: number;
    processed: number;
    failed: number;
    emailSent: number;
  } | null;
};
type Listing = {
  items: Announcement[];
  total: number;
  pageSize: number;
  canManage: boolean;
};
type Capabilities = {
  canManage: boolean;
  teams: { id: string; name: string }[];
};
type Preview = {
  id: string;
  count: number;
  expiresAt: string;
  sample: (string | null)[];
  revision: number;
};
type Action = "archive" | "restore" | "unpublish" | "cancel_schedule";
const base = "/admin/communications/announcements",
  roles = ["super_admin", "admin", "team_member", "blog_editor"];
const roleName = (value: string) =>
  ({
    super_admin: "Super Admins",
    admin: "Admins",
    team_member: "Team Members",
    blog_editor: "Blog Editors",
  })[value] || value;
const when = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Immediately";
function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
const defaults = {
  title: "",
  message: "",
  priority: "medium",
  pinned: false,
  audienceType: "all",
  selectedRoles: [] as string[],
  teamIds: [] as string[],
  emails: "",
  scheduledFor: "",
  expiresAt: "",
  emailEnabled: false,
};
export default function AnnouncementWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <AnnouncementWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function AnnouncementWorkspaceContent() {
  const { isOnline } = useOnlineStatus();
  const [params, setParams] = useSearchParams(),
    selected = params.get("announcement") || "";
  const [listing, setListing] = useState<Listing>(),
    [recordSnapshot, setRecord] = useState<Announcement>(),
    [capabilities, setCapabilities] = useState<Capabilities>();
  const [q, setQ] = useState(""),
    [state, setState] = useState("feed"),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<"create" | "edit">(),
    [values, setValues] = useState({ ...defaults }),
    [editRevision, setEditRevision] = useState<number>();
  const [preview, setPreview] = useState<Preview>(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [operation, setOperation] = useState<{
      action: Action;
      revision: number;
    }>();
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [listError, setListError] = useState(""),
    [detailError, setDetailError] = useState(""),
    [capabilityError, setCapabilityError] = useState(""),
    [notice, setNotice] = useState(""),
    [detailLoading, setDetailLoading] = useState(false),
    [listReadAt, setListReadAt] = useState<string>(),
    [detailReadAt, setDetailReadAt] = useState<string>(),
    [clock, setClock] = useState(Date.now());
  useWorkspaceReadiness(loading || (!capabilities && !capabilityError));
  const record = recordSnapshot?.id === selected ? recordSnapshot : undefined;
  const selectedRef = useRef(selected),
    listSeq = useRef(0),
    detailSeq = useRef(0),
    mounted = useRef(true),
    listRequest = useRef<AbortController>(),
    detailRequest = useRef<AbortController>(),
    capabilityRequest = useRef<AbortController>(),
    operationRequest = useRef<AbortController>(),
    operationSelection = useRef(""),
    busyRef = useRef(false),
    pendingKey = useRef<{ signature: string; key: string }>(),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null);
  selectedRef.current = selected;
  const dirty = !!mode || !!password || !!confirmation;
  useDraftGuard(dirty, {
    busy,
    label: "Announcement draft or publication confirmation",
  });
  useEffect(() => {
    if (mode) editorHeading.current?.focus();
  }, [mode]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (preview || operation) confirmationHeading.current?.focus();
  }, [preview, operation]);
  useEffect(() => {
    if (!preview) return;
    setClock(Date.now());
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [preview]);
  function begin() {
    if (busyRef.current || !isOnline) return;
    const controller = new AbortController();
    operationRequest.current = controller;
    operationSelection.current = selected;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    return controller;
  }
  const current = (controller: AbortController) =>
    mounted.current &&
    operationRequest.current === controller &&
    !controller.signal.aborted &&
    selectedRef.current === operationSelection.current;
  function finish(controller: AbortController) {
    if (mounted.current && operationRequest.current === controller) {
      operationRequest.current = undefined;
      busyRef.current = false;
      setBusy(false);
    }
  }
  const clearPrivate = useCallback(() => {
    listSeq.current++;
    detailSeq.current++;
    listRequest.current?.abort();
    detailRequest.current?.abort();
    capabilityRequest.current?.abort();
    operationRequest.current?.abort();
    operationRequest.current = undefined;
    busyRef.current = false;
    setBusy(false);
    setListing(undefined);
    setRecord(undefined);
    setCapabilities(undefined);
    setLoading(false);
    setDetailLoading(false);
    setValues({ ...defaults });
    setPreview(undefined);
    setPassword("");
    setConfirmation("");
    setMode(undefined);
    setOperation(undefined);
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      listRequest.current?.abort();
      detailRequest.current?.abort();
      operationRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [dirty]);
  useEffect(() => {
    const controller = new AbortController();
    capabilityRequest.current = controller;
    api<Capabilities>(base + "/capabilities", { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) {
          setCapabilities(r);
          setCapabilityError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          if (e instanceof ApiFailure && [401, 403].includes(e.status))
            clearPrivate();
          setCapabilities(undefined);
          setCapabilityError(e.message);
        }
      });
    return () => controller.abort();
  }, [retry, clearPrivate]);
  const readList = useCallback(async () => {
    if (busyRef.current) return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    const seq = ++listSeq.current;
    try {
      const r = await api<Listing>(
        base + "?" + new URLSearchParams({ q, state, page: String(page) }),
        { signal: controller.signal },
      );
      if (
        mounted.current &&
        !controller.signal.aborted &&
        seq === listSeq.current
      ) {
        setListing(r);
        setListReadAt(new Date().toISOString());
        setListError("");
      }
    } catch (e) {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        seq === listSeq.current
      ) {
        setListError(
          e instanceof Error
            ? e.message
            : "This action could not be completed.",
        );
        if (e instanceof ApiFailure && [401, 403].includes(e.status))
          clearPrivate();
      }
    } finally {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        seq === listSeq.current
      )
        setLoading(false);
    }
  }, [q, state, page, clearPrivate]);
  const readDetail = useCallback(async () => {
    const id = selectedRef.current;
    if (!id || busyRef.current) return;
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailLoading(true);
    const seq = ++detailSeq.current;
    try {
      const r = await api<{ record: Announcement }>(base + "/" + id, {
        signal: controller.signal,
      });
      if (
        mounted.current &&
        !controller.signal.aborted &&
        seq === detailSeq.current &&
        id === selectedRef.current
      ) {
        setRecord(r.record);
        setDetailReadAt(new Date().toISOString());
        setDetailError("");
      }
    } catch (e) {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        seq === detailSeq.current &&
        id === selectedRef.current
      ) {
        setDetailError(
          e instanceof Error
            ? e.message
            : "This action could not be completed.",
        );
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          clearPrivate();
        }
      }
    } finally {
      if (
        mounted.current &&
        !controller.signal.aborted &&
        seq === detailSeq.current
      )
        setDetailLoading(false);
    }
  }, [clearPrivate]);
  const refresh = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (busyRef.current) return;
      void readList();
      void readDetail();
    }, 200);
  }, [readList, readDetail]);
  const live = useScopedRealtime({ kind: "notifications" }, refresh, () => {
    clearPrivate();
    setListError(
      "Announcement access changed. Retry to check your current scope.",
    );
    if (selectedRef.current)
      setDetailError(
        "Announcement access changed. Retry to check your current scope.",
      );
  });
  useEffect(() => {
    setLoading(true);
    setListing(undefined);
    setListError("");
    const t = setTimeout(() => void readList(), 200);
    return () => {
      clearTimeout(t);
      listRequest.current?.abort();
    };
  }, [readList]);
  useEffect(() => {
    detailSeq.current++;
    operationRequest.current?.abort();
    operationRequest.current = undefined;
    busyRef.current = false;
    setBusy(false);
    setRecord(undefined);
    setMode(undefined);
    setValues({ ...defaults });
    setPassword("");
    setConfirmation("");
    setDetailError("");
    setDetailReadAt(undefined);
    setPreview(undefined);
    setOperation(undefined);
    void readDetail();
    return () => detailRequest.current?.abort();
  }, [selected, readDetail]);
  useEffect(() => {
    const t = setInterval(
      () => {
        if (!document.hidden && navigator.onLine && !busyRef.current) refresh();
      },
      live === "live" ? 30000 : 5000,
    );
    return () => clearInterval(t);
  }, [refresh, live]);
  useEffect(() => {
    const access = () => {
      setRetry((v) => v + 1);
      refresh();
    };
    window.addEventListener("gdg:access-changed", access);
    return () => window.removeEventListener("gdg:access-changed", access);
  }, [refresh]);
  function choose(id = "") {
    if (
      busyRef.current ||
      (dirty && !confirm("Discard unsaved announcement changes?"))
    )
      return;
    setMode(undefined);
    setValues({ ...defaults });
    setPreview(undefined);
    setOperation(undefined);
    setPassword("");
    setConfirmation("");
    setError("");
    setNotice("");
    const next = new URLSearchParams({ tab: "announcements" });
    if (id) next.set("announcement", id);
    setParams(next);
  }
  function start(create = false) {
    if (!create && (!record || !record.audience)) return;
    if (
      create
        ? !capabilities?.canManage
        : !record?.canManage ||
          record.state !== "Draft" ||
          detailLoading ||
          !!detailError
    )
      return;
    if (
      busyRef.current ||
      (dirty && !confirm("Discard unsaved announcement changes?"))
    )
      return;
    setMode(create ? "create" : "edit");
    setEditRevision(create ? undefined : record?.revision);
    setPreview(undefined);
    setOperation(undefined);
    setPassword("");
    setConfirmation("");
    setError("");
    setValues(
      !create && record && record.audience
        ? {
            title: record.title,
            message: record.message,
            priority: record.priority,
            pinned: record.pinned,
            audienceType: record.audience.type,
            selectedRoles: record.audience.roles || [],
            teamIds: record.audience.teamIds || [],
            emails: (record.audience.emails || []).join("\n"),
            scheduledFor: localInput(record.scheduledFor),
            expiresAt: localInput(record.expiresAt),
            emailEnabled: record.emailEnabled,
          }
        : { ...defaults },
    );
  }
  async function mutate(
    path: string,
    document: Record<string, unknown>,
    controller: AbortController,
  ) {
    const intent = { ...document };
    delete intent.currentPassword;
    const signature = path + JSON.stringify(intent);
    if (pendingKey.current?.signature !== signature)
      pendingKey.current = { signature, key: crypto.randomUUID() };
    const r = await api<{ id: string; state?: string }>(path, {
      method: "POST",
      protected: true,
      body: document,
      idempotencyKey: pendingKey.current.key,
      signal: controller.signal,
    });
    if (current(controller)) pendingKey.current = undefined;
    return r;
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!mode || stale || !modeAllowed) return;
    const controller = begin();
    if (!controller) return;
    try {
      const audience =
        values.audienceType === "all"
          ? { type: "all" }
          : values.audienceType === "roles"
            ? { type: "roles", roles: values.selectedRoles }
            : values.audienceType === "teams"
              ? { type: "teams", teamIds: values.teamIds }
              : {
                  type: "users",
                  emails: values.emails
                    .split(/[\n,]+/)
                    .map((v) => v.trim())
                    .filter(Boolean),
                };
      const document = chapterAnnouncementRecord.parse({
        title: values.title,
        message: values.message,
        priority: values.priority,
        pinned: values.pinned,
        audience,
        scheduledFor: values.scheduledFor
          ? new Date(values.scheduledFor).toISOString()
          : null,
        expiresAt: values.expiresAt
          ? new Date(values.expiresAt).toISOString()
          : null,
        emailEnabled: values.emailEnabled,
      });
      const r = await mutate(
        mode === "create" ? base : base + "/" + selected,
        mode === "create"
          ? { record: document }
          : { action: "update", revision: editRevision, record: document },
        controller,
      );
      if (!current(controller)) return;
      setMode(undefined);
      setValues({ ...defaults });
      setState("Draft");
      setPage(1);
      setParams(
        new URLSearchParams({ tab: "announcements", announcement: r.id }),
      );
      setNotice(
        "Draft saved. Preview its audience before publishing or scheduling.",
      );
      refresh();
    } catch (e) {
      if (!current(controller)) return;
      setError(
        validationMessage(e, "Check the announcement fields.", {
          title: "Title",
          message: "Message",
          audience: "Audience",
          scheduledFor: "Publication time",
          expiresAt: "Expiry time",
        }),
      );
    } finally {
      finish(controller);
    }
  }
  async function audiencePreview() {
    if (
      !record?.canManage ||
      record.state !== "Draft" ||
      detailLoading ||
      detailError ||
      mode ||
      operation
    )
      return;
    const controller = begin();
    if (!controller) return;
    setPreview(undefined);
    setPassword("");
    setConfirmation("");
    try {
      const r = await api<Omit<Preview, "revision">>(
        base + "/" + record.id + "/preview",
        {
          method: "POST",
          protected: true,
          body: { revision: record.revision },
          signal: controller.signal,
        },
      );
      if (!current(controller)) return;
      setPreview({ ...r, revision: record.revision });
      setPassword("");
      setConfirmation("");
    } catch (e) {
      if (!current(controller)) return;
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      finish(controller);
    }
  }
  async function publish(e: FormEvent) {
    e.preventDefault();
    if (
      !record?.canManage ||
      record.state !== "Draft" ||
      detailLoading ||
      detailError ||
      !preview ||
      stale ||
      mode ||
      confirmation !== record.title ||
      !password
    )
      return;
    if (Date.parse(preview.expiresAt) <= Date.now()) {
      setPassword("");
      setError(
        "This audience preview expired. Cancel publication and request a new preview.",
      );
      return;
    }
    const controller = begin();
    if (!controller) return;
    const secret = password;
    setPassword("");
    try {
      const r = await mutate(
        base + "/" + record.id + "/confirm",
        {
          revision: preview.revision,
          previewId: preview.id,
          currentPassword: secret,
          confirmation,
        },
        controller,
      );
      if (!current(controller)) return;
      setPreview(undefined);
      setConfirmation("");
      setState(r.state || "Published");
      setNotice(
        r.state === "Scheduled"
          ? "Announcement scheduled with a frozen notification audience."
          : "Announcement published. Protected notifications are queued.",
      );
      refresh();
    } catch (e) {
      if (!current(controller)) return;
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
      if (
        e instanceof ApiFailure &&
        ["AUDIENCE_CHANGED", "PREVIEW_REQUIRED", "CONFLICT"].includes(e.code)
      )
        setPreview(undefined);
    } finally {
      finish(controller);
    }
  }
  async function change(action: string) {
    if (!record || detailLoading || detailError || mode || stale) return;
    if (
      action === "read"
        ? !record.canAcknowledge || record.isRead
        : !record.canManage
    )
      return;
    if (
      action === "pin" &&
      (record.state === "Archived" || operation || preview)
    )
      return;
    if (
      !["read", "pin"].includes(action) &&
      (!operation ||
        operation.action !== action ||
        confirmation !== record.title)
    )
      return;
    const controller = begin();
    if (!controller) return;
    try {
      await mutate(
        base + "/" + record.id,
        action === "read"
          ? { action, publicationVersion: record.publicationVersion }
          : action === "pin"
            ? { action, revision: record.revision, pinned: !record.pinned }
            : { action, revision: operation?.revision, confirmation },
        controller,
      );
      if (!current(controller)) return;
      setOperation(undefined);
      setConfirmation("");
      setPreview(undefined);
      setNotice(
        action === "read"
          ? "Announcement marked as read."
          : "Announcement updated.",
      );
      refresh();
    } catch (e) {
      if (!current(controller)) return;
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      finish(controller);
    }
  }
  function toggle(key: "selectedRoles" | "teamIds", value: string) {
    setValues((v) => ({
      ...v,
      [key]: v[key].includes(value)
        ? v[key].filter((x) => x !== value)
        : [...v[key], value],
    }));
  }
  const stale =
    !!record &&
    ((mode === "edit" && record.revision !== editRevision) ||
      (!!preview && record.revision !== preview.revision) ||
      (!!operation && record.revision !== operation.revision));
  const modeAllowed =
    !!capabilities?.canManage &&
    (mode === "create" ||
      (!!record?.canManage &&
        record.state === "Draft" &&
        !detailLoading &&
        !detailError));
  const unavailable = busy || !isOnline || detailLoading || !!detailError;
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Communications</h1>
          <p>
            Chapter updates, shared with a clear audience and a reliable
            publication plan.
          </p>
        </div>
        {capabilities?.canManage && (
          <Button disabled={busy} onClick={() => start(true)}>
            New announcement
          </Button>
        )}
      </header>
      <nav
        className="gt-button-row gt-team-tabs"
        aria-label="Communications workspaces"
      >
        <span className="gt-button" aria-current="page">
          Announcements
        </span>
        <ActionLink to="/admin/communications?tab=tasks" variant="ghost">
          Tasks
        </ActionLink>
        <ActionLink to="/admin/communications?tab=messages" variant="ghost">
          Messages
        </ActionLink>
        <ContactInboxLink />
      </nav>
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          className="gt-form-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {!isOnline && (
        <p role="status" className="gt-data-note">
          You are offline. Unsaved announcement text stays only in this open
          tab. Reconnect and refresh before continuing; nothing submits
          automatically.
        </p>
      )}
      {[
        { name: "Announcement inventory", error: listError },
        { name: "Announcement details", error: detailError },
      ]
        .filter((read) => read.error)
        .map((read) => (
          <p key={read.name} className="gt-form-error" role="alert">
            {read.name}: {read.error}{" "}
            <button
              disabled={busy || !isOnline}
              onClick={() => {
                refresh();
                setRetry((v) => v + 1);
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Retry {read.name.toLowerCase()}
            </button>
          </p>
        ))}
      {((record && (detailError || !isOnline)) ||
        (!selected && listing && (listError || !isOnline))) && (
        <p role="status" className="gt-data-note">
          {selected ? "Announcement details" : "Announcement inventory"} may be
          out of date. Last loaded{" "}
          {when((selected ? detailReadAt : listReadAt) || null)}. Refresh before
          acting on this snapshot.
        </p>
      )}
      {capabilityError && (
        <p className="gt-form-error" role="alert">
          Permissions could not load.{" "}
          <button
            disabled={busy || !isOnline}
            onClick={() => {
              setRetry((v) => v + 1);
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry permissions
          </button>
        </p>
      )}
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {mode && !modeAllowed && !detailLoading && (
        <p role="alert" className="gt-form-error">
          Saving is unavailable with the current permissions or read state. Your
          fields are preserved; refresh before continuing.
        </p>
      )}
      {stale && (
        <p className="gt-form-error" role="alert">
          This announcement changed. Your staged changes are preserved, but
          cannot overwrite the current version. Cancel this action to load the
          latest record.
        </p>
      )}
      {mode && (
        <form
          className="gt-event-editor gt-announcement-editor"
          onSubmit={save}
        >
          <h2 ref={editorHeading} tabIndex={-1}>
            {mode === "create" ? "New chapter announcement" : "Edit draft"}
          </h2>
          <p>
            Chapter publishing is restricted to Admins and Super Admins. Team
            announcements remain in the Teams workspace.
          </p>
          <Field label="Title" required>
            <input
              required
              minLength={2}
              maxLength={200}
              disabled={busy}
              value={values.title}
              onChange={(e) =>
                setValues((v) => ({ ...v, title: e.target.value }))
              }
            />
          </Field>
          <Field
            label="Announcement message"
            required
            hint="Plain text. Notification emails include a secure link, not this content."
          >
            <textarea
              required
              minLength={2}
              maxLength={10000}
              rows={7}
              disabled={busy}
              value={values.message}
              onChange={(e) =>
                setValues((v) => ({ ...v, message: e.target.value }))
              }
            />
          </Field>
          <div className="gt-form-grid">
            <Field label="Priority">
              <select
                disabled={busy}
                value={values.priority}
                onChange={(e) =>
                  setValues((v) => ({ ...v, priority: e.target.value }))
                }
              >
                {["low", "medium", "high"].map((p) => (
                  <option key={p} value={p}>
                    {p[0].toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Audience">
              <select
                disabled={busy}
                value={values.audienceType}
                onChange={(e) =>
                  setValues((v) => ({ ...v, audienceType: e.target.value }))
                }
              >
                <option value="all">All active chapter accounts</option>
                <option value="roles">Selected chapter roles</option>
                <option value="teams">Selected active teams</option>
                <option value="users">Exact account emails</option>
              </select>
            </Field>
          </div>
          {values.audienceType === "roles" && (
            <fieldset className="gt-announcement-choices" disabled={busy}>
              <legend>Chapter roles</legend>
              {roles.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={values.selectedRoles.includes(role)}
                    onChange={() => toggle("selectedRoles", role)}
                  />
                  {roleName(role)}
                </label>
              ))}
            </fieldset>
          )}
          {values.audienceType === "teams" && (
            <fieldset className="gt-announcement-choices" disabled={busy}>
              <legend>Active teams</legend>
              {capabilities?.teams.length ? (
                capabilities.teams.map((team) => (
                  <label key={team.id}>
                    <input
                      type="checkbox"
                      checked={values.teamIds.includes(team.id)}
                      onChange={() => toggle("teamIds", team.id)}
                    />
                    {team.name}
                  </label>
                ))
              ) : (
                <p>No eligible teams are available. Choose another audience.</p>
              )}
            </fieldset>
          )}
          {values.audienceType === "users" && (
            <Field
              label="Recipient account emails"
              hint="One per line; at most 100 exact active accounts. Explicit audiences bind to account identities, not reusable email addresses."
              required
            >
              <textarea
                required
                rows={4}
                disabled={busy}
                value={values.emails}
                onChange={(e) =>
                  setValues((v) => ({ ...v, emails: e.target.value }))
                }
              />
            </Field>
          )}
          <div className="gt-form-grid">
            <Field
              label="Schedule publication"
              hint={`Optional. Your local time (${Intl.DateTimeFormat().resolvedOptions().timeZone}); blank means publish immediately after confirmation.`}
            >
              <input
                type="datetime-local"
                disabled={busy}
                value={values.scheduledFor}
                onChange={(e) =>
                  setValues((v) => ({ ...v, scheduledFor: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Announcement expiry"
              hint="Optional. Readers lose access when this time is reached."
            >
              <input
                type="datetime-local"
                disabled={busy}
                value={values.expiresAt}
                onChange={(e) =>
                  setValues((v) => ({ ...v, expiresAt: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="gt-announcement-choices">
            <label>
              <input
                type="checkbox"
                disabled={busy}
                checked={values.pinned}
                onChange={(e) =>
                  setValues((v) => ({ ...v, pinned: e.target.checked }))
                }
              />
              Pin in the announcement feed
            </label>
            <label>
              <input
                type="checkbox"
                disabled={busy}
                checked={values.emailEnabled}
                onChange={(e) =>
                  setValues((v) => ({ ...v, emailEnabled: e.target.checked }))
                }
              />
              Also send a generic email notice to the confirmed audience
            </label>
          </div>
          <div className="gt-button-row">
            <Button disabled={busy || !isOnline || stale || !modeAllowed}>
              {busy ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMode(undefined);
                setValues({ ...defaults });
                setError("");
                void readDetail();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!mode && record && (
        <section className="gt-announcement-detail">
          <div className="gt-button-row">
            <Button variant="ghost" disabled={busy} onClick={() => choose()}>
              Back to announcements
            </Button>
            <Badge>{record.state}</Badge>
            {record.pinned && <Badge tone="coral">Pinned</Badge>}
            <Badge>{record.priority} priority</Badge>
          </div>
          <h2>{record.title}</h2>
          <p className="gt-help">
            {record.authorName || "Chapter account"} · Updated{" "}
            {when(record.updated_at)}
          </p>
          <p className="gt-announcement-body">{record.message}</p>
          {record.canManage && (
            <dl className="gt-task-facts">
              <div>
                <dt>Publication</dt>
                <dd>{when(record.scheduledFor)}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>
                  {record.expiresAt ? when(record.expiresAt) : "No expiry"}
                </dd>
              </div>
              <div>
                <dt>Notification snapshot</dt>
                <dd>
                  {record.publicationVersion
                    ? `${record.recipientCount} notification recipients · ${record.readCount} read this version`
                    : "Not confirmed yet"}
                </dd>
              </div>
              {record.delivery && (
                <div>
                  <dt>Delivery</dt>
                  <dd>
                    {record.delivery.queued} queued ·{" "}
                    {record.delivery.processed} processed ·{" "}
                    {record.delivery.emailSent} emails sent ·{" "}
                    {record.delivery.failed} failed
                  </dd>
                </div>
              )}
            </dl>
          )}
          <div className="gt-button-row">
            {record.canAcknowledge && !record.isRead && (
              <Button
                variant="secondary"
                disabled={unavailable}
                onClick={() => void change("read")}
              >
                Mark as read
              </Button>
            )}
            {record.isRead && <Badge tone="success">Read</Badge>}
            {record.canManage && (
              <>
                {record.state === "Draft" && (
                  <>
                    <Button
                      disabled={unavailable || !!operation || !!preview}
                      onClick={() => start(false)}
                    >
                      Edit draft
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={unavailable || !!operation || !!preview}
                      onClick={() => void audiencePreview()}
                    >
                      Preview publication audience
                    </Button>
                  </>
                )}
                {record.state !== "Archived" && (
                  <Button
                    variant="ghost"
                    disabled={unavailable || !!operation || !!preview}
                    onClick={() => void change("pin")}
                  >
                    {record.pinned ? "Unpin" : "Pin"}
                  </Button>
                )}
                {(record.state === "Published" ||
                  record.state === "Expired") && (
                  <Button
                    variant="ghost"
                    disabled={unavailable || !!preview || !!operation}
                    onClick={() => {
                      setOperation({
                        action: "unpublish",
                        revision: record.revision,
                      });
                      setConfirmation("");
                    }}
                  >
                    Unpublish to draft
                  </Button>
                )}
                {record.state === "Scheduled" && (
                  <Button
                    variant="ghost"
                    disabled={unavailable || !!preview || !!operation}
                    onClick={() => {
                      setOperation({
                        action: "cancel_schedule",
                        revision: record.revision,
                      });
                      setConfirmation("");
                    }}
                  >
                    Cancel schedule
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={unavailable || !!preview || !!operation}
                  onClick={() => {
                    setOperation({
                      action:
                        record.state === "Archived" ? "restore" : "archive",
                      revision: record.revision,
                    });
                    setConfirmation("");
                  }}
                >
                  {record.state === "Archived" ? "Restore as draft" : "Archive"}
                </Button>
              </>
            )}
          </div>
          {preview && (
            <form className="gt-announcement-confirm" onSubmit={publish}>
              <h3 ref={confirmationHeading} tabIndex={-1}>
                Confirm{" "}
                {record.scheduledFor ? "scheduled publication" : "publication"}
              </h3>
              <p>
                <strong>
                  {preview.count} active account{preview.count === 1 ? "" : "s"}
                </strong>{" "}
                will enter this notification snapshot. Maximum 1,000. Newly
                eligible people can read the published announcement, but are not
                added to this delivery batch.
              </p>
              <p>
                Publication: {when(record.scheduledFor)}.{" "}
                {record.emailEnabled
                  ? "Generic email and in-app notices enabled."
                  : "In-app notices only; no email fan-out."}
              </p>
              <p className="gt-help">
                Preview expires {when(preview.expiresAt)}. Audience changes
                require another preview.
              </p>
              {Date.parse(preview.expiresAt) <= clock && (
                <p role="alert" className="gt-form-error">
                  This audience preview expired. Cancel publication and request
                  a new preview.
                </p>
              )}
              {!record.canManage && (
                <p role="alert">
                  Publication is no longer permitted. Cancel this review.
                </p>
              )}
              <ul className="gt-announcement-sample">
                {preview.sample.map((name, i) => (
                  <li key={i}>{name || "Chapter account"}</li>
                ))}
              </ul>
              {preview.count > 20 && (
                <p>
                  First 20 names shown; all {preview.count} recipients are
                  included.
                </p>
              )}
              <Field label="Type announcement title to confirm" required>
                <input
                  required
                  disabled={busy}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Current password" required>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  disabled={busy}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <div className="gt-button-row">
                <Button
                  disabled={
                    unavailable ||
                    !record.canManage ||
                    record.state !== "Draft" ||
                    stale ||
                    confirmation !== record.title ||
                    !password ||
                    Date.parse(preview.expiresAt) <= clock
                  }
                >
                  {busy
                    ? "Confirming…"
                    : record.scheduledFor
                      ? "Confirm schedule"
                      : "Publish to confirmed audience"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setPreview(undefined);
                    setPassword("");
                    setConfirmation("");
                  }}
                >
                  Cancel publication
                </Button>
              </div>
            </form>
          )}
          {operation && (
            <form
              className="gt-announcement-confirm"
              onSubmit={(e) => {
                e.preventDefault();
                void change(operation.action);
              }}
            >
              <h3 ref={confirmationHeading} tabIndex={-1}>
                {operation.action === "archive"
                  ? "Archive announcement"
                  : operation.action === "restore"
                    ? "Restore as unpublished draft"
                    : operation.action === "cancel_schedule"
                      ? "Cancel scheduled publication"
                      : "Unpublish announcement"}
              </h3>
              <p>
                {operation.action === "restore"
                  ? "Restoring does not publish or send any notices."
                  : "Readers will no longer see this announcement. Retained history and audit records remain."}
              </p>
              <Field label="Type announcement title to confirm" required>
                <input
                  required
                  disabled={busy}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <div className="gt-button-row">
                <Button
                  variant="secondary"
                  disabled={
                    unavailable ||
                    !record.canManage ||
                    stale ||
                    confirmation !== record.title
                  }
                >
                  Confirm change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setOperation(undefined);
                    setConfirmation("");
                    void readDetail();
                  }}
                >
                  Keep current state
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
      {!mode && !selected && (
        <>
          <div className="gt-task-filters">
            <SearchBox
              label="Search announcements"
              placeholder="Search announcement titles"
              value={q}
              onChange={(v) => {
                setQ(v);
                setPage(1);
              }}
            />
            {capabilities?.canManage && (
              <Field label="Announcement state">
                <select
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setPage(1);
                  }}
                >
                  {[
                    "feed",
                    "all",
                    "Draft",
                    "Scheduled",
                    "Published",
                    "Expired",
                    "Archived",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v === "feed"
                        ? "Current feed"
                        : v === "all"
                          ? "All unarchived"
                          : v}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {(q || state !== "feed" || page > 1) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQ("");
                setState("feed");
                setPage(1);
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Reset announcement filters
            </Button>
          )}
          {loading && !listing ? (
            <div role="status" aria-label="Loading announcements">
              <div className="gt-skeleton gt-loading-heading" />
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading announcements…</span>
            </div>
          ) : listError && !listing ? (
            <p>
              Announcement inventory is unavailable. Retry loading to check your
              access.
            </p>
          ) : listing?.items.length ? (
            <div className="gt-team-directory">
              {listing.items.map((n) => (
                <article key={n.id}>
                  <div>
                    <div className="gt-button-row">
                      <Badge>{n.state}</Badge>
                      {n.pinned && <Badge tone="coral">Pinned</Badge>}
                      {n.isRead && <Badge tone="success">Read</Badge>}
                    </div>
                    <h2>{n.title}</h2>
                    <p>
                      {n.message.slice(0, 180)}
                      {n.message.length > 180 ? "…" : ""}
                    </p>
                    <small>
                      {n.authorName || "Chapter account"} · {when(n.updated_at)}
                    </small>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={`Open announcement ${n.title}`}
                    disabled={busy}
                    onClick={() => choose(n.id)}
                  >
                    Open announcement
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              headingLevel={2}
              title={
                q
                  ? "No matching announcements"
                  : "No announcements in this view"
              }
            >
              {capabilities?.canManage
                ? "Create a draft, then preview and confirm its audience before publishing."
                : "Published chapter announcements for your current role, team or account appear here."}
            </EmptyState>
          )}
          <div className="gt-button-row">
            <Button
              variant="ghost"
              disabled={busy || page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </Button>
            <span>
              {listing?.total || 0} announcements · Page {page}
            </span>
            <Button
              variant="ghost"
              disabled={
                busy || !listing || page * listing.pageSize >= listing.total
              }
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {!mode && selected && !record && (
        <>
          <Button variant="ghost" disabled={busy} onClick={() => choose()}>
            Back to announcements
          </Button>
          {detailLoading ? (
            <div role="status" aria-label="Loading selected announcement">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading announcement…</span>
            </div>
          ) : (
            <p>This announcement is currently unavailable.</p>
          )}
        </>
      )}
    </div>
  );
}
