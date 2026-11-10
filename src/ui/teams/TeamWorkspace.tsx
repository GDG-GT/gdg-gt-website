import RecordPanel from "@/ui/RecordPanel";
import ScrollableTable from "@/ui/ScrollableTable";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  cloneElement,
  type ReactElement,
} from "react";
import { useParams, Link } from "react-router-dom";
import {
  useApprovedSearchParams as useSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import { useAdmin } from "@/contexts/AdminContext";
import { api, ApiFailure } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import TeamInvitations from "./TeamInvitations";
import TeamAnnouncements from "./TeamAnnouncements";
import TeamChat from "./TeamChat";
import FormIntegrations from "../forms/FormIntegrations";
import { teamGrantOptions, type TeamGrant } from "../../../shared/teams";
type Team = {
  id: string;
  name: string;
  description: string;
  slug: string;
  color: string;
  icon: string;
  revision: number;
  is_active: boolean;
  deleted_at: string | null;
};
type Member = {
  id: string;
  admin_user_id: string;
  role: "lead" | "co_lead" | "member";
  revision: number;
  is_active: boolean;
  joined_at: string;
  user: {
    display_name: string;
    email: string | null;
    role: string;
    is_active: boolean;
  };
};
type Workspace = {
  team: Team;
  members: Member[];
  actions: { settings: boolean; manage: boolean; permissions: boolean };
  actorRole: string;
  permissions: {
    resource_type: string;
    permission: string;
    can_create: boolean;
    can_read: boolean;
    can_update: boolean;
    can_delete: boolean;
  }[];
  pages: { page_path: string; can_access: boolean }[];
  statistics: {
    activeMembers: number;
    activeLeads: number;
    membershipChanges: number;
  };
};
type Listing = {
  items: Team[];
  total: number;
  pageSize: number;
  canCreate: boolean;
};
type Mode =
  | "create"
  | "update"
  | "archive"
  | "restore"
  | "member_add"
  | "member_role"
  | "member_remove"
  | "member_transfer"
  | "permissions";
type Intent = {
  mode: Mode;
  path: string;
  method: string;
  body: Record<string, unknown>;
  key: string;
  createdAt: number;
  teamId?: string;
  revision?: number;
  title: string;
  consequence: string;
  lines: string[];
};
type Review = { kind: "save"; intent: Intent } | { kind: "abandon" };
function TeamField({
  name,
  errors,
  children,
  ...props
}: {
  name: string;
  errors: Record<string, string>;
  children: ReactElement;
  label: string;
  required?: boolean;
  hint?: string;
}) {
  const id = "team-field-" + name,
    error = errors[name];
  return (
    <Field {...props}>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? id + "-error" : undefined,
      } as Record<string, unknown>)}
      {error && <small id={id + "-error"}>{error}</small>}
    </Field>
  );
}
const names: Record<Mode, string> = {
  create: "Create a chapter team",
  update: "Edit team details",
  archive: "Archive team",
  restore: "Restore team",
  member_add: "Add an existing member",
  member_role: "Change team role",
  member_remove: "Remove team membership",
  member_transfer: "Transfer membership",
  permissions: "Edit page & action grants",
};
const colors = ["#4285F4", "#E6705F", "#0F9D58", "#F4B400", "#666666"];
const icons = [
  "users",
  "calendar",
  "code",
  "palette",
  "megaphone",
  "heart",
  "star",
  "briefcase",
];
const readable = (value: string) =>
  value === "co_lead"
    ? "Co-lead"
    : value.replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase());
function grantsFor(w: Workspace): TeamGrant[] {
  return teamGrantOptions
    .filter((o) => w.pages.some((p) => p.page_path === o.path && p.can_access))
    .map((o) => {
      const permissions = w.permissions.filter(
        (p) => p.resource_type === o.resource,
      );
      return {
        path: o.path,
        resource: o.resource,
        create: permissions.some((p) => p.can_create),
        read: permissions.some((p) => p.can_read),
        update: permissions.some((p) => p.can_update),
        delete: permissions.some((p) => p.can_delete),
        extras: o.extras.filter((e) =>
          permissions.some((p) => p.permission === e),
        ),
      };
    });
}
function ReadFeedback({
  name,
  read,
  retry,
  disabled,
  offline,
}: {
  name: string;
  read: { loading: boolean; data?: unknown; error: string; at?: string };
  retry: () => void;
  disabled: boolean;
  offline: boolean;
}) {
  return (
    <>
      {read.loading && !read.data && (
        <div role="status" aria-label={`Loading ${name}`}>
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading {name}…</span>
        </div>
      )}
      {offline && read.at && (
        <p role="status">
          {name} snapshot from{" "}
          <time dateTime={read.at}>{new Date(read.at).toLocaleString()}</time>;
          offline information may be out of date.
        </p>
      )}
      {read.error && (
        <div role="alert" className="gt-form-error">
          <p>
            {name} could not {read.at ? "refresh" : "load"}. {read.error}
          </p>
          {read.at && (
            <p>
              Last successful read:{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              .
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || read.loading}
            onClick={() => {
              retry();
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry {name}
          </Button>
        </div>
      )}
    </>
  );
}
export default function TeamWorkspace() {
  const { teamId } = useParams(),
    { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <TeamWorkspaceContent
      key={`${currentAdmin.id}:${currentAdmin.role}:${teamId || "directory"}:${epoch}`}
    />
  );
}
function TeamWorkspaceContent() {
  const [searchParams, setSearchParams] = useSearchParams(),
    section = searchParams.get("section");
  const { teamId } = useParams(),
    { currentAdmin, refreshTeams } = useAdmin();
  const [selected, setSelected] = useState(teamId || ""),
    [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [blocked, setBlocked] = useState(false),
    [showCreate, setShowCreate] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [mode, setMode] = useState<Mode | null>(null),
    [member, setMember] = useState<Member>(),
    [values, setValues] = useState<Record<string, string>>({}),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [grants, setGrants] = useState<TeamGrant[]>([]),
    [modeRevision, setModeRevision] = useState<number>(),
    [tab, setTab] = useState(
      section === "announcements"
        ? "announcements"
        : section === "chat"
          ? "chat"
          : "members",
    ),
    [historyPage, setHistoryPage] = useState(1),
    [listRefresh, setListRefresh] = useState(0),
    [detailRefresh, setDetailRefresh] = useState(0),
    [historyRefresh, setHistoryRefresh] = useState(0),
    [destinationRefresh, setDestinationRefresh] = useState(0),
    [review, setReview] = useState<Review>(),
    [uncertain, setUncertain] = useState<Intent>(),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [checkedUncertain, setCheckedUncertain] = useState(false),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [checkedWorkspace, setCheckedWorkspace] = useState<{
      at: string;
      record: Workspace;
    }>();
  const mutation = usePrivateMutation(selected || "directory"),
    busy = mutation.busy,
    cancelMutation = mutation.cancel;
  const heading = useRef<HTMLHeadingElement>(null),
    feedback = useRef<HTMLDivElement>(null),
    reviewOpener = useRef<HTMLElement>();
  const openReview = (next: Review, opener?: HTMLElement) => {
    if (opener && !opener.closest('[role="dialog"]'))
      reviewOpener.current = opener;
    else if (
      document.activeElement instanceof HTMLElement &&
      !document.activeElement.closest('[role="dialog"]')
    )
      reviewOpener.current = document.activeElement;
    setReview(next);
  };
  const navigationSafety = useNavigationSafety();
  useDraftGuard(!!mode || !!password || !!confirmation || !!uncertain, {
    busy,
    label: "Team or permission changes",
  });
  const [destinationQuery, setDestinationQuery] = useState("");
  const inventory = usePrivateRead<Listing>(
      `/admin/teams?${new URLSearchParams({ q, state, page: String(page) })}`,
      refresh + listRefresh,
    ),
    detail = usePrivateRead<Workspace>(
      selected ? "/admin/teams/" + selected : undefined,
      refresh + detailRefresh,
    ),
    activity = usePrivateRead<{
      items: Record<string, unknown>[];
      total: number;
    }>(
      selected && ["activity", "transfers"].includes(tab)
        ? `/admin/teams/${selected}/${tab}?page=${historyPage}`
        : undefined,
      refresh + historyRefresh,
    ),
    destinationRead = usePrivateRead<Listing>(
      mode === "member_transfer"
        ? `/admin/teams?${new URLSearchParams({ q: destinationQuery, pageSize: "100" })}`
        : undefined,
      refresh + destinationRefresh,
    ),
    list = inventory.data,
    workspace = detail.data,
    history = activity.data,
    historyLoading = activity.loading,
    destinations = (destinationRead.data?.items || []).filter(
      (team) => team.id !== selected && team.is_active && !team.deleted_at,
    ),
    { isOnline } = useOnlineStatus(),
    listReady = !!list && !inventory.loading && !inventory.error && isOnline,
    teamReady = !!workspace && !detail.loading && !detail.error && isOnline,
    destinationReady =
      !!destinationRead.data &&
      !destinationRead.loading &&
      !destinationRead.error &&
      isOnline,
    draftStale =
      !!mode &&
      mode !== "create" &&
      !!workspace &&
      (modeRevision !== workspace.team.revision ||
        (!!member &&
          workspace.members.find((value) => value.id === member.id)
            ?.revision !== member.revision)),
    modeAllowed =
      mode === "create"
        ? !!list?.canCreate
        : mode === "update" || mode === "archive" || mode === "restore"
          ? workspace?.actions.settings
          : mode === "permissions"
            ? workspace?.actions.permissions
            : workspace?.actions.manage &&
              (!["member_role", "member_transfer"].includes(mode || "") ||
                workspace.actorRole !== "team_member") &&
              (mode !== "member_remove" ||
                workspace.actorRole !== "team_member" ||
                member?.role === "member"),
    canSave =
      !busy &&
      !uncertain &&
      !needsRecheck &&
      !!modeAllowed &&
      (mode === "create" ? listReady : teamReady && !draftStale) &&
      (mode !== "member_transfer" ||
        (destinationReady &&
          destinations.some((team) => team.id === values.destinationId))),
    clearInventory = inventory.clear,
    clearDetail = detail.clear,
    clearActivity = activity.clear,
    clearDestination = destinationRead.clear,
    denied =
      inventory.denied ||
      detail.denied ||
      activity.denied ||
      destinationRead.denied;
  // Keep the disabled header action in place during a filter read. Permission
  // and mutation guards still require the current successful inventory.
  useEffect(() => {
    if (list) setShowCreate(list.canCreate);
  }, [list]);
  const clearPrivate = useCallback(() => {
    cancelMutation();
    setBlocked(true);
    setShowCreate(false);
    clearInventory();
    clearDetail();
    clearActivity();
    clearDestination();
    setSelected("");
    setMode(null);
    setMember(undefined);
    setModeRevision(undefined);
    setValues({});
    setPassword("");
    setConfirmation("");
    setGrants([]);
    setError("");
    setNotice("");
    setDestinationQuery("");
    setReview(undefined);
    setUncertain(undefined);
    setNeedsRecheck(false);
    setCheckedUncertain(false);
    setFieldErrors({});
    setCheckedWorkspace(undefined);
    reviewOpener.current = undefined;
    setTab("members");
    setHistoryPage(1);
  }, [
    cancelMutation,
    clearInventory,
    clearDetail,
    clearActivity,
    clearDestination,
  ]);
  useEffect(() => {
    if (denied) clearPrivate();
  }, [denied, clearPrivate]);
  useEffect(() => {
    if (
      section &&
      [
        "members",
        "announcements",
        "chat",
        "invitations",
        "permissions",
        "activity",
        "transfers",
      ].includes(section)
    )
      setTab(section);
  }, [section, teamId]);
  useEffect(() => {
    if (mode) heading.current?.focus();
  }, [mode]);
  useEffect(() => {
    if (!review && (notice || error)) feedback.current?.focus();
  }, [notice, error, review]);
  function open(next: Mode, m?: Member) {
    if (
      mutation.pending.current ||
      uncertain ||
      mode ||
      !isOnline ||
      (next === "create" ? !listReady || !list?.canCreate : !teamReady)
    )
      return;
    setModeRevision(workspace?.team.revision);
    setMode(next);
    setMember(m);
    setPassword("");
    setConfirmation("");
    setError("");
    setValues({
      name: next === "create" ? "" : workspace?.team.name || "",
      description: next === "create" ? "" : workspace?.team.description || "",
      slug: "",
      color: workspace?.team.color || colors[0],
      icon: workspace?.team.icon || "users",
      email: "",
      role: m?.role || "member",
      destinationId: "",
      reason: "",
    });
    setGrants(workspace ? grantsFor(workspace) : []);
    setDestinationQuery("");
    setNeedsRecheck(false);
    setFieldErrors({});
    setCheckedWorkspace(undefined);
  }
  function close() {
    if (mutation.pending.current) return;
    if (uncertain) {
      openReview({ kind: "abandon" });
      return;
    }
    setMode(null);
    setPassword("");
    setConfirmation("");
  }
  function choose(id: string) {
    if (mutation.pending.current) return;
    if (uncertain) {
      openReview({ kind: "abandon" });
      return;
    }
    const change = () => {
      close();
      setSelected(id);
      setTab("members");
      setHistoryPage(1);
    };
    if (navigationSafety) navigationSafety.request(change);
    else change();
  }
  const input = (key: string) => ({
    value: values[key] || "",
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      if (!mutation.pending.current && !uncertain && !review) {
        setValues((v) => ({ ...v, [key]: event.target.value }));
        setFieldErrors((previous) => ({ ...previous, [key]: "" }));
      }
    },
  });
  async function perform(intent: Intent, replay = false) {
    if (replay ? !isOnline || !checkedUncertain : !canSave) return;
    if (replay && Date.now() - intent.createdAt >= 47 * 60 * 60 * 1000) {
      setError(
        "The safe retry window ended. Inspect current team and membership records before abandoning this operation and starting another change.",
      );
      return;
    }
    if (!password) {
      setFieldErrors({
        currentPassword:
          "Enter your current password to authorize this team change.",
      });
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    const secret = password;
    setPassword("");
    setError("");
    setNotice("");
    setFieldErrors({});
    try {
      const result = await api<Workspace>(intent.path, {
        method: intent.method,
        protected: true,
        body: { ...intent.body, currentPassword: secret },
        idempotencyKey: intent.key,
        signal: controller.signal,
      });
      if (!mutation.current(controller)) return;
      setSelected(result.team.id);
      setMode(null);
      setMember(undefined);
      setModeRevision(undefined);
      setValues({});
      setConfirmation("");
      setGrants([]);
      setReview(undefined);
      setUncertain(undefined);
      setNeedsRecheck(false);
      setCheckedUncertain(false);
      setCheckedWorkspace(undefined);
      setNotice(
        names[intent.mode] +
          " confirmed by the server." +
          (intent.mode === "restore"
            ? " Previous page grants remain disabled until explicitly approved."
            : ""),
      );
      setRefresh((value) => value + 1);
      try {
        await refreshTeams();
      } catch {
        if (mutation.current(controller))
          setError(
            "The team change was saved, but your membership list could not refresh. Refresh current reads before another change.",
          );
      }
    } catch (failure) {
      if (!mutation.current(controller)) return;
      setError((failure as Error).message);
      if (failure instanceof ApiFailure)
        setFieldErrors(
          Object.fromEntries(
            Object.entries(failure.fields || {}).map(([key, value]) => [
              key.replace(/^record\./, ""),
              value,
            ]),
          ),
        );
      if (
        failure instanceof ApiFailure &&
        failure.code === "PASSWORD_CONFIRMATION_FAILED"
      )
        setFieldErrors({ currentPassword: failure.message });
      else if (
        failure instanceof ApiFailure &&
        [401, 403, 404].includes(failure.status)
      )
        clearPrivate();
      else if (!(failure instanceof ApiFailure) || failure.status >= 500) {
        setUncertain(intent);
        setNeedsRecheck(true);
        setCheckedUncertain(false);
        setError(
          "The result could not be confirmed. Original intent and retry identity are retained without your password. Recheck current saved values, then explicitly retry with fresh password proof. " +
            (failure as Error).message,
        );
      } else if (failure.status === 409) {
        setNeedsRecheck(true);
        setCheckedUncertain(false);
        setError(
          "The team, membership or grants changed. Recheck saved values before another change. " +
            failure.message,
        );
      }
    } finally {
      mutation.finish(controller);
    }
  }
  async function recheck() {
    if (!isOnline) return;
    const controller = mutation.begin();
    if (!controller) return;
    setCheckedUncertain(false);
    setPassword("");
    try {
      let record: Workspace | undefined;
      const id = uncertain?.teamId || selected;
      if (id)
        record = await api<Workspace>("/admin/teams/" + id, {
          signal: controller.signal,
        });
      else {
        const result = await api<Listing>(
          "/admin/teams?" +
            new URLSearchParams({
              q: uncertain?.title || values.name || "",
              state: "current",
              page: "1",
            }),
          { signal: controller.signal },
        );
        const slug =
          (uncertain?.body.record as { slug?: string } | undefined)?.slug ||
          values.slug;
        const match = result.items.find((item) => item.slug === slug);
        if (match)
          record = await api<Workspace>("/admin/teams/" + match.id, {
            signal: controller.signal,
          });
      }
      const destinationId = uncertain?.body.destinationId;
      if (destinationId)
        await api<Workspace>("/admin/teams/" + destinationId, {
          signal: controller.signal,
        });
      if (!mutation.current(controller)) return;
      setCheckedWorkspace(
        record ? { at: new Date().toISOString(), record } : undefined,
      );
      setCheckedUncertain(true);
      setNeedsRecheck(false);
      setError("");
      setNotice(
        "Saved team and membership values were rechecked. No change was sent.",
      );
      setRefresh((value) => value + 1);
    } catch (failure) {
      if (!mutation.current(controller)) return;
      setError((failure as Error).message);
      if (
        failure instanceof ApiFailure &&
        [401, 403, 404].includes(failure.status)
      )
        clearPrivate();
    } finally {
      mutation.finish(controller);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!mode || !canSave || mutation.pending.current) return;
    const record = {
      name: values.name,
      description: values.description,
      color: values.color,
      icon: values.icon,
    };
    let body: Record<string, unknown> = {};
    if (mode === "create")
      body.record = { ...record, slug: values.slug, leadId: currentAdmin!.id };
    else if (mode === "update") body = { revision: modeRevision, record };
    else {
      body = { action: mode, revision: modeRevision };
      if (mode === "permissions") Object.assign(body, { confirmation, grants });
      else if (mode === "archive" || mode === "restore")
        body.confirmation = confirmation;
      else if (mode === "member_add")
        Object.assign(body, {
          email: values.email.trim().toLowerCase(),
          role: values.role,
        });
      else {
        Object.assign(body, {
          membershipId: member!.id,
          membershipRevision: member!.revision,
        });
        if (mode === "member_transfer")
          Object.assign(body, {
            destinationId: values.destinationId,
            reason: values.reason,
          });
        else body.role = values.role;
      }
    }
    if (
      ["archive", "restore", "permissions"].includes(mode) &&
      confirmation !== workspace?.team.name
    )
      return;
    const name = mode === "create" ? values.name : workspace!.team.name,
      person = member?.user.email || member?.user.display_name || values.email,
      destination = destinations.find(
        (item) => item.id === values.destinationId,
      ),
      consequence =
        mode === "create"
          ? `Create ${name} and assign you as its lead. Page/action grants start disabled.`
          : mode === "update"
            ? `Update saved details for ${name}. Current team memberships and page grants remain.`
            : mode === "archive"
              ? `Archive ${name}, disable its page grants and remove active team access. Accounts and membership history remain.`
              : mode === "restore"
                ? `Restore ${name}. Previous page grants stay disabled until explicitly approved.`
                : mode === "permissions"
                  ? `Replace page/action grants for ${name} with the reviewed set. New requests use the changed access immediately. Sensitive grants control response/export/publication capabilities.`
                  : mode === "member_add"
                    ? `Add ${person} to ${name} as ${readable(values.role)}. Their account role remains unchanged.`
                    : mode === "member_role"
                      ? `Change ${person} in ${name} from ${readable(member!.role)} to ${readable(values.role)}. Team access changes immediately; their account role remains unchanged.`
                      : mode === "member_remove"
                        ? `Remove ${person} from ${name}. Team-derived access ends immediately; their account and historical membership remain.`
                        : `Transfer ${person} from ${name} to ${destination?.name || "the selected team"}. Source access ends and destination membership starts as Member. Officer privileges are not inherited. Reason: ${values.reason}`;
    const lines =
      mode === "permissions"
        ? [
            "Current grants:",
            ...(grantsFor(workspace!).length ? [] : ["No page/action grants"]),
            ...grantsFor(workspace!).map(
              (grant) =>
                `${grant.path}: ${
                  ["create", "read", "update", "delete"]
                    .filter(
                      (action) => grant[action as keyof TeamGrant] === true,
                    )
                    .concat(grant.extras)
                    .join(", ") || "No actions"
                }`,
            ),
            "Proposed grants:",
            ...(grants.length ? [] : ["No page/action grants"]),
            ...grants.map(
              (grant) =>
                `${grant.path}: ${
                  ["create", "read", "update", "delete"]
                    .filter(
                      (action) => grant[action as keyof TeamGrant] === true,
                    )
                    .concat(grant.extras)
                    .join(", ") || "No actions"
                }`,
            ),
          ]
        : mode === "update"
          ? [
              `Name: ${workspace!.team.name} → ${values.name}`,
              `Description: ${values.description}`,
              `Color: ${values.color}`,
              `Icon: ${values.icon}`,
            ]
          : [];
    const intent: Intent = {
      mode,
      path: "/admin/teams" + (mode === "create" ? "" : "/" + selected),
      method: mode === "update" ? "PATCH" : "POST",
      body,
      key: crypto.randomUUID(),
      createdAt: Date.now(),
      teamId: mode === "create" ? undefined : selected,
      revision: modeRevision,
      title: name,
      consequence,
      lines,
    };
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    openReview(
      { kind: "save", intent },
      submitter instanceof HTMLElement ? submitter : undefined,
    );
  }
  const recovery = () => (
    <section aria-label="Team operation recovery">
      <p>
        {uncertain
          ? `${names[uncertain.mode]} for ${uncertain.title} has an unconfirmed result. Original input and retry identity are retained without password proof.`
          : "Recheck current team and membership values before another change."}
      </p>
      <Button
        variant="secondary"
        disabled={busy || !isOnline}
        onClick={recheck}
      >
        Recheck saved team values
      </Button>
      {checkedWorkspace && (
        <details>
          <summary>Inspect current saved team and memberships</summary>
          <p>
            Read at{" "}
            <time dateTime={checkedWorkspace.at}>
              {new Date(checkedWorkspace.at).toLocaleString()}
            </time>
          </p>
          <p>
            {checkedWorkspace.record.team.name} · revision{" "}
            {checkedWorkspace.record.team.revision} ·{" "}
            {checkedWorkspace.record.team.deleted_at ? "Archived" : "Active"}
          </p>
          <ul>
            {checkedWorkspace.record.members.map((value) => (
              <li key={value.id}>
                {value.user.email || value.user.display_name} ·{" "}
                {readable(value.role)} ·{" "}
                {value.is_active ? "Active" : "Former member"}
              </li>
            ))}
          </ul>
        </details>
      )}
      {uncertain && (
        <>
          <TeamField
            name="retryPassword"
            label="Current password for retry"
            required
            errors={{ retryPassword: fieldErrors.currentPassword }}
          >
            <input
              type="password"
              maxLength={128}
              autoComplete="current-password"
              disabled={busy}
              value={password}
              onChange={(event) => {
                if (!mutation.pending.current) {
                  setPassword(event.target.value);
                  setFieldErrors({});
                }
              }}
            />
          </TeamField>
          <Button
            disabled={busy || !isOnline || !checkedUncertain || !password}
            onClick={() => perform(uncertain, true)}
          >
            Retry original team operation
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={(event) =>
              openReview({ kind: "abandon" }, event.currentTarget)
            }
          >
            Review abandoning team recovery
          </Button>
        </>
      )}
    </section>
  );
  function toggleGrant(path: string, resource: string, enabled: boolean) {
    if (mutation.pending.current) return;
    setGrants((v) =>
      enabled
        ? [
            ...v,
            {
              path,
              resource,
              create: false,
              read: true,
              update: false,
              delete: false,
              extras: [],
            },
          ]
        : v.filter((g) => g.path !== path),
    );
  }
  if (blocked || denied)
    return (
      <EmptyState
        title="Team access needs to be rechecked"
        action={
          <Button
            disabled={!isOnline}
            onClick={() => {
              setBlocked(false);
              setListRefresh((value) => value + 1);
            }}
          >
            Recheck team access
          </Button>
        }
      >
        Previous team, membership, history and unsaved permission information
        has been cleared. Recheck current access before continuing.
      </EmptyState>
    );
  const panelFeedback = (<>
      {!isOnline && (
        <p role="status">
          You are offline. Draft input remains here; refresh current team data
          before another change.
        </p>
      )}
      {selected && (
        <ReadFeedback
          name="team inventory"
          read={inventory}
          retry={() => setListRefresh((value) => value + 1)}
          disabled={!isOnline || busy}
          offline={!isOnline}
        />
      )}
      <Button
        variant="ghost"
        disabled={!isOnline || busy || inventory.loading}
        onClick={() => setListRefresh((value) => value + 1)}
      >
        Refresh team inventory
      </Button>
      {selected && (
        <>
          <ReadFeedback
            name="selected team"
            read={detail}
            retry={() => setDetailRefresh((value) => value + 1)}
            disabled={!isOnline || busy}
            offline={!isOnline}
          />
          <Button
            variant="ghost"
            disabled={!isOnline || busy || detail.loading}
            onClick={() => setDetailRefresh((value) => value + 1)}
          >
            Refresh selected team
          </Button>
        </>
      )}
      {draftStale && (
        <div role="alert">
          <p>
            The saved team or membership changed. Your unsaved fields are
            retained. Close this editor after reviewing discarded input, then
            choose a current team action.
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              navigationSafety ? navigationSafety.request(close) : close()
            }
          >
            Review closing stale team editor
          </Button>
        </div>
      )}
      {(error || notice) && !review && (
        <div ref={feedback} tabIndex={-1}>
          {error && (
            <p role="alert" className="gt-form-error">
              {error}{" "}
              <button onClick={() => setRefresh((v) => v + 1)}>
                Reload teams
              </button>
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
      {!review && (needsRecheck || uncertain) && recovery()}
  </>);
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>{workspace?.team.name || "Teams & permissions"}</h1>
          <p>
            {workspace?.team.description ||
              "Organize chapter responsibilities, protect team scope, and keep membership changes accountable."}
          </p>
        </div>
        <div className="gt-button-row">
          {selected && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => choose("")}
            >
              All teams
            </Button>
          )}
          {showCreate && (
            <Button
              disabled={busy || !!mode || !listReady}
              onClick={() => open("create")}
            >
              Create team
            </Button>
          )}
        </div>
      </header>
      {!mode && panelFeedback}
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !mutation.pending.current) setReview(undefined);
        }}
      >
        <DialogContent
          className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${busy ? "[&>button]:hidden" : ""}`}
          onEscapeKeyDown={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (notice) feedback.current?.focus();
            else if (
              reviewOpener.current?.isConnected &&
              !reviewOpener.current.matches(":disabled")
            )
              reviewOpener.current.focus();
            else if (heading.current?.isConnected) heading.current.focus();
            else document.getElementById("workspace-content")?.focus();
          }}
        >
          <DialogTitle>
            {review?.kind === "abandon"
              ? "Abandon unconfirmed team recovery?"
              : review?.kind === "save"
                ? `Review: ${names[review.intent.mode]}`
                : "Review team change"}
          </DialogTitle>
          <DialogDescription>
            {review?.kind === "abandon"
              ? `${uncertain?.title}: the original operation may already have completed. Discard retained input and retry identity, then inspect saved team/member records before starting another change. No saved operation is reversed.`
              : review?.kind === "save"
                ? review.intent.consequence
                : ""}
          </DialogDescription>
          {review?.kind === "save" && !!review.intent.lines.length && (
            <ul>
              {review.intent.lines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          )}
          {error && <p role="alert">{error}</p>}
          {review?.kind === "save" && draftStale && (
            <p role="alert">
              The saved team or membership changed. Close this review, inspect
              current values and choose a current action.
            </p>
          )}
          {review?.kind === "save" && (needsRecheck || uncertain) && recovery()}
          {review?.kind === "save" && !uncertain && (
            <TeamField
              name="reviewPassword"
              label="Confirm your password again"
              required
              errors={{ reviewPassword: fieldErrors.currentPassword }}
            >
              <input
                disabled={busy}
                type="password"
                maxLength={128}
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  if (!mutation.pending.current) {
                    setPassword(event.target.value);
                    setFieldErrors({});
                  }
                }}
              />
            </TeamField>
          )}
          <div className="gt-inline-actions">
            <Button
              variant="danger"
              disabled={
                busy || (review?.kind === "save" && (!canSave || !password))
              }
              onClick={() => {
                if (mutation.pending.current) return;
                if (review?.kind === "save") perform(review.intent);
                else if (review?.kind === "abandon") {
                  setMode(null);
                  setMember(undefined);
                  setValues({});
                  setPassword("");
                  setConfirmation("");
                  setGrants([]);
                  setUncertain(undefined);
                  setNeedsRecheck(false);
                  setCheckedUncertain(false);
                  setCheckedWorkspace(undefined);
                  setFieldErrors({});
                  setError("");
                  setReview(undefined);
                  setRefresh((value) => value + 1);
                }
              }}
            >
              {review?.kind === "abandon"
                ? "Abandon team recovery"
                : "Confirm team change"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {mode && (
        <RecordPanel title="Team editor" busy={busy} onClose={() => navigationSafety ? navigationSafety.request(close) : close()}>
          {panelFeedback}
<section className="gt-panel gt-event-editor">
          <h2 tabIndex={-1} ref={heading}>
            {names[mode]}
          </h2>
          <form className="gt-form" onSubmit={save}>
            <fieldset
              disabled={busy || !!review || !!uncertain}
              className="gt-form gt-team-fields"
            >
              {(mode === "create" || mode === "update") && (
                <>
                  <div className="gt-form-grid">
                    <TeamField
                      name="name"
                      errors={fieldErrors}
                      label="Team name"
                      required
                    >
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        {...input("name")}
                      />
                    </TeamField>
                    {mode === "create" && (
                      <TeamField
                        name="slug"
                        errors={fieldErrors}
                        label="Team URL identifier"
                        required
                        hint="Lowercase letters, numbers and hyphens. This identifier cannot be changed later."
                      >
                        <input
                          required
                          pattern="[a-z0-9]+(-[a-z0-9]+)*"
                          maxLength={150}
                          {...input("slug")}
                        />
                      </TeamField>
                    )}
                    <TeamField
                      name="color"
                      errors={fieldErrors}
                      label="Accent color"
                    >
                      <select {...input("color")}>
                        {colors.map((c, i) => (
                          <option value={c} key={c}>
                            {
                              [
                                "Google blue",
                                "Chapter coral",
                                "Google green",
                                "Google gold",
                                "Neutral gray",
                              ][i]
                            }
                          </option>
                        ))}
                      </select>
                    </TeamField>
                    <TeamField
                      name="icon"
                      errors={fieldErrors}
                      label="Team icon"
                    >
                      <select {...input("icon")}>
                        {icons.map((i) => (
                          <option key={i}>{i}</option>
                        ))}
                      </select>
                    </TeamField>
                  </div>
                  <TeamField
                    name="description"
                    errors={fieldErrors}
                    label="Description"
                  >
                    <textarea
                      rows={3}
                      maxLength={2000}
                      {...input("description")}
                    />
                  </TeamField>
                  {mode === "create" && (
                    <p className="gt-helper">
                      You become this team's founding lead. Add another lead
                      before transferring or removing your final required lead
                      membership. Team grants start empty.
                    </p>
                  )}
                </>
              )}
              {mode?.startsWith("member_") && (
                <>
                  {member && (
                    <p>
                      {member.user.display_name ||
                        member.user.email ||
                        "Selected member"}{" "}
                      · {readable(member.role)}
                    </p>
                  )}
                  {mode === "member_add" && (
                    <TeamField
                      name="email"
                      errors={fieldErrors}
                      label="Existing account email"
                      required
                      hint="The account must be active and have completed password setup. New-account invitations are a separate workflow."
                    >
                      <input
                        type="email"
                        required
                        maxLength={255}
                        {...input("email")}
                      />
                    </TeamField>
                  )}
                  {["member_add", "member_role"].includes(mode) && (
                    <TeamField
                      name="role"
                      errors={fieldErrors}
                      label="Team role"
                    >
                      <select {...input("role")}>
                        {(workspace?.actorRole === "team_member"
                          ? ["member"]
                          : ["member", "co_lead", "lead"]
                        ).map((r) => (
                          <option key={r} value={r}>
                            {readable(r)}
                          </option>
                        ))}
                      </select>
                    </TeamField>
                  )}
                  {mode === "member_remove" && (
                    <p>
                      This removes team access but preserves the account and
                      membership history. A team's final active lead cannot be
                      removed.
                    </p>
                  )}
                  {mode === "member_transfer" && (
                    <>
                      <SearchBox
                        label="Find a destination team"
                        placeholder="Search destination teams"
                        value={destinationQuery}
                        onChange={setDestinationQuery}
                      />
                      <ReadFeedback
                        name="destination teams"
                        read={destinationRead}
                        retry={() =>
                          setDestinationRefresh((value) => value + 1)
                        }
                        disabled={!isOnline || busy}
                        offline={!isOnline}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!isOnline || busy || destinationRead.loading}
                        onClick={() =>
                          setDestinationRefresh((value) => value + 1)
                        }
                      >
                        Refresh destination teams
                      </Button>
                      {destinationRead.data &&
                        !destinationRead.loading &&
                        !destinationRead.error &&
                        !destinations.length && (
                          <p>
                            No active matching destination teams. Try another
                            name.
                          </p>
                        )}
                      <TeamField
                        name="destinationId"
                        errors={fieldErrors}
                        label="Destination team"
                        required
                      >
                        <select
                          required
                          disabled={!destinationReady}
                          {...input("destinationId")}
                        >
                          <option value="">Choose an active team</option>
                          {destinations.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </TeamField>
                      <TeamField
                        name="reason"
                        errors={fieldErrors}
                        label="Transfer reason"
                        required
                      >
                        <textarea
                          required
                          minLength={2}
                          maxLength={1000}
                          {...input("reason")}
                        />
                      </TeamField>
                      <p className="gt-helper">
                        Transfers preserve the source history, remove source
                        access, and create a member-level destination
                        membership. Destination officer privileges are never
                        inherited. Up to 100 matching destination teams are
                        shown; search by name to narrow the list.
                      </p>
                    </>
                  )}
                </>
              )}
              {mode === "permissions" && (
                <>
                  <p>
                    Page visibility and individual actions are separate. These
                    grants apply only to this team's active members. Chapter
                    account/security access cannot be delegated here.
                  </p>
                  <div className="gt-team-grants">
                    {teamGrantOptions.map((option) => {
                      const value = grants.find((g) => g.path === option.path);
                      return (
                        <fieldset key={option.path}>
                          <legend>{option.label}</legend>
                          <label>
                            <input
                              type="checkbox"
                              checked={!!value}
                              onChange={(e) =>
                                toggleGrant(
                                  option.path,
                                  option.resource,
                                  e.target.checked,
                                )
                              }
                            />{" "}
                            Allow this page
                          </label>
                          {value && (
                            <div className="gt-grant-actions">
                              {(
                                ["create", "read", "update", "delete"] as const
                              ).map((action) => (
                                <label key={action}>
                                  <input
                                    type="checkbox"
                                    checked={value[action]}
                                    onChange={(e) =>
                                      setGrants((v) =>
                                        v.map((g) =>
                                          g.path === option.path
                                            ? {
                                                ...g,
                                                [action]: e.target.checked,
                                                ...(action === "update" &&
                                                !e.target.checked
                                                  ? {
                                                      extras: g.extras.filter(
                                                        (a) => a !== "publish",
                                                      ),
                                                    }
                                                  : {}),
                                              }
                                            : g,
                                        ),
                                      )
                                    }
                                  />
                                  {action === "read"
                                    ? "View records"
                                    : action === "update"
                                      ? "Edit records"
                                      : action === "delete"
                                        ? "Archive records"
                                        : "Create records"}
                                </label>
                              ))}
                              {option.extras.map((action) => (
                                <label key={action}>
                                  <input
                                    type="checkbox"
                                    checked={value.extras.includes(action)}
                                    disabled={
                                      action === "publish" && !value.update
                                    }
                                    onChange={(e) =>
                                      setGrants((v) =>
                                        v.map((g) =>
                                          g.path === option.path
                                            ? {
                                                ...g,
                                                extras: e.target.checked
                                                  ? [...g.extras, action]
                                                  : g.extras.filter(
                                                      (a) => a !== action,
                                                    ),
                                              }
                                            : g,
                                        ),
                                      )
                                    }
                                  />
                                  {readable(action)}
                                </label>
                              ))}
                            </div>
                          )}
                        </fieldset>
                      );
                    })}
                  </div>
                </>
              )}
              {(["archive", "restore", "permissions"] as Mode[]).includes(
                mode,
              ) && (
                <TeamField
                  name="confirmation"
                  errors={fieldErrors}
                  label="Type the complete team name to confirm"
                  required
                >
                  <input
                    required
                    value={confirmation}
                    onChange={(e) => {
                      if (!mutation.pending.current) {
                        setConfirmation(e.target.value);
                        setFieldErrors((previous) => ({
                          ...previous,
                          confirmation: "",
                        }));
                      }
                    }}
                  />
                </TeamField>
              )}
              {mode === "archive" && (
                <p>
                  Archiving preserves memberships and history, disables team
                  access and page grants, and can be reversed. It does not
                  delete chapter records owned by the team.
                </p>
              )}
              {mode === "restore" && (
                <p>
                  Restoration requires an active lead. Previous page grants stay
                  disabled and must be explicitly reviewed.
                </p>
              )}
              <TeamField
                name="currentPassword"
                errors={fieldErrors}
                label="Confirm your own password"
                required
              >
                <input
                  required
                  type="password"
                  maxLength={128}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    if (!mutation.pending.current) {
                      setPassword(e.target.value);
                      setFieldErrors((previous) => ({
                        ...previous,
                        currentPassword: "",
                      }));
                    }
                  }}
                />
              </TeamField>
              <div className="gt-button-row">
                <Button
                  type="submit"
                  disabled={
                    !canSave ||
                    busy ||
                    (["archive", "restore", "permissions"].includes(mode) &&
                      confirmation !== workspace?.team.name)
                  }
                >
                  {busy ? "Saving…" : "Save team change"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    navigationSafety ? navigationSafety.request(close) : close()
                  }
                >
                  Cancel
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
</RecordPanel>
      )}
      {selected && workspace ? (
        <>
          <div className="gt-toolbar">
            <div className="gt-button-row">
              <Badge>
                {workspace.team.deleted_at ? "Archived" : "Active team"}
              </Badge>
              <span>
                {workspace.statistics.activeMembers} active members ·{" "}
                {workspace.statistics.activeLeads} leads/co-leads
              </span>
            </div>
            <div className="gt-button-row">
              <FormIntegrations
                kind="team"
                resourceId={workspace.team.id}
                onDenied={clearPrivate}
                onRecheck={() => setDetailRefresh((v) => v + 1)}
                disabled={!!mode || busy || !teamReady}
              />
              {workspace.actions.settings && (
                <>
                  <Button
                    variant="secondary"
                    disabled={!!mode || busy || !teamReady}
                    onClick={() =>
                      open(workspace.team.deleted_at ? "restore" : "update")
                    }
                  >
                    {workspace.team.deleted_at
                      ? "Restore team"
                      : "Edit details"}
                  </Button>
                  {!workspace.team.deleted_at && (
                    <Button
                      variant="ghost"
                      disabled={!!mode || busy || !teamReady}
                      onClick={() => open("archive")}
                    >
                      Archive team
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          <nav className="gt-tabs gt-team-tabs" aria-label="Team sections">
            {[
              "members",
              "announcements",
              "chat",
              ...(workspace.actions.manage && !workspace.team.deleted_at
                ? ["invitations"]
                : []),
              ...(workspace.actions.permissions ? ["permissions"] : []),
              "activity",
              "transfers",
            ].map((t) => (
              <Button
                key={t}
                variant={tab === t ? "primary" : "ghost"}
                aria-current={tab === t ? "page" : undefined}
                disabled={busy}
                onClick={() => {
                  const change = () => {
                    setTab(t);
                    setHistoryPage(1);
                    const next = new URLSearchParams(searchParams);
                    next.set("section", t);
                    setSearchParams(next);
                  };
                  if (navigationSafety) navigationSafety.request(change);
                  else change();
                }}
              >
                {readable(t)}
              </Button>
            ))}
          </nav>
          {tab === "members" && (
            <section>
              <header className="gt-admin-heading">
                <h2>Memberships</h2>
                {workspace.actions.manage && !workspace.team.deleted_at && (
                  <Button
                    disabled={!!mode || busy || !teamReady}
                    onClick={() => open("member_add")}
                  >
                    Add member
                  </Button>
                )}
              </header>
              <ScrollableTable label="Team memberships table">
                <table className="gt-data-table">
                  <caption className="sr-only">
                    Team members and membership history
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Member</th>
                      <th scope="col">Team role</th>
                      <th scope="col">Status</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workspace.members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          {m.user.display_name || "Chapter member"}
                          {m.user.email && <small>{m.user.email}</small>}
                        </td>
                        <td>{readable(m.role)}</td>
                        <td>
                          {!m.is_active
                            ? "Former member"
                            : !m.user.is_active
                              ? "Account inactive"
                              : "Active"}
                        </td>
                        <td>{new Date(m.joined_at).toLocaleDateString()}</td>
                        <td>
                          {m.is_active &&
                            workspace.actions.manage &&
                            !workspace.team.deleted_at && (
                              <div className="gt-button-row">
                                {workspace.actorRole !== "team_member" && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      disabled={
                                        busy ||
                                        !teamReady ||
                                        !!mode ||
                                        m.admin_user_id === currentAdmin?.id
                                      }
                                      onClick={() => open("member_role", m)}
                                    >
                                      Change role
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      disabled={busy || !!mode || !teamReady}
                                      onClick={() => open("member_transfer", m)}
                                    >
                                      Transfer
                                    </Button>
                                  </>
                                )}
                                {(workspace.actorRole !== "team_member" ||
                                  m.role === "member") && (
                                  <Button
                                    variant="ghost"
                                    disabled={busy || !!mode || !teamReady}
                                    onClick={() => open("member_remove", m)}
                                  >
                                    Remove
                                  </Button>
                                )}
                              </div>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            </section>
          )}
          {tab === "announcements" && (
            <TeamAnnouncements
              teamId={workspace.team.id}
              canManage={workspace.actions.manage && !workspace.team.deleted_at}
              disabled={!teamReady || busy}
            />
          )}
          {tab === "chat" && (
            <TeamChat key={workspace.team.id} teamId={workspace.team.id} />
          )}
          {tab === "invitations" &&
            workspace.actions.manage &&
            !workspace.team.deleted_at && (
              <TeamInvitations
                teamId={workspace.team.id}
                disabled={!teamReady || busy}
              />
            )}
          {tab === "permissions" && (
            <section className="gt-panel gt-event-editor">
              <h2>Page & action access</h2>
              <p>
                Members need both page access and the matching action.
                Ownership, workflow state and sensitive-response rules still
                apply.
              </p>
              {grantsFor(workspace).length ? (
                <ul>
                  {grantsFor(workspace).map((g) => (
                    <li key={g.path}>
                      <strong>
                        {teamGrantOptions.find((o) => o.path === g.path)?.label}
                      </strong>{" "}
                      ·{" "}
                      {["create", "read", "update", "delete"]
                        .filter((a) => g[a as keyof TeamGrant] === true)
                        .concat(g.extras)
                        .map(readable)
                        .join(", ") || "No actions"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  No page grants are active. Team members retain only their base
                  workspace routes and separately authorized records.
                </p>
              )}
              <Button
                disabled={
                  !!mode || busy || !teamReady || !!workspace.team.deleted_at
                }
                onClick={() => open("permissions")}
              >
                Review & change grants
              </Button>
            </section>
          )}
          {["activity", "transfers"].includes(tab) && (
            <section className="gt-panel gt-event-editor">
              <h2>
                {tab === "activity"
                  ? "Append-only team activity"
                  : "Membership transfer history"}
              </h2>
              <ReadFeedback
                name={tab === "activity" ? "team activity" : "team transfers"}
                read={activity}
                retry={() => setHistoryRefresh((value) => value + 1)}
                disabled={!isOnline || busy}
                offline={!isOnline}
              />
              <Button
                variant="ghost"
                disabled={!isOnline || busy || activity.loading}
                onClick={() => setHistoryRefresh((value) => value + 1)}
              >
                Refresh{" "}
                {tab === "activity" ? "team activity" : "team transfers"}
              </Button>
              {historyLoading && !history ? (
                <p role="status">Loading history…</p>
              ) : history?.items.length ? (
                <ul className="gt-team-history">
                  {history.items.map((row) => (
                    <li key={String(row.id)}>
                      <strong>
                        {tab === "activity"
                          ? readable(String(row.action))
                          : String(row.reason || "Membership transfer")}
                      </strong>
                      <span>
                        {new Date(String(row.created_at)).toLocaleString()}
                      </span>
                      {tab === "transfers" && (
                        <small>
                          From{" "}
                          {list?.items.find((t) => t.id === row.from_team_id)
                            ?.name || "another authorized team"}{" "}
                          →{" "}
                          {list?.items.find((t) => t.id === row.to_team_id)
                            ?.name || "another authorized team"}
                        </small>
                      )}
                    </li>
                  ))}
                </ul>
              ) : history && !activity.error && !activity.loading ? (
                <p>
                  No {tab === "activity" ? "activity" : "transfers"} recorded.
                </p>
              ) : null}
              <nav className="gt-button-row" aria-label="Team history pages">
                <Button
                  variant="secondary"
                  disabled={
                    historyPage <= 1 ||
                    historyLoading ||
                    !!activity.error ||
                    !isOnline ||
                    busy
                  }
                  onClick={() => setHistoryPage((v) => v - 1)}
                >
                  Previous
                </Button>
                <span>Page {historyPage}</span>
                <Button
                  variant="secondary"
                  disabled={
                    !history ||
                    historyPage * 20 >= history.total ||
                    historyLoading ||
                    !!activity.error ||
                    !isOnline ||
                    busy
                  }
                  onClick={() => setHistoryPage((v) => v + 1)}
                >
                  Next
                </Button>
              </nav>
            </section>
          )}
        </>
      ) : (
        !selected && (
          <>
            <div className="gt-toolbar">
              <SearchBox
                label="Search teams"
                placeholder="Search team names"
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
              />
              <Field label="Team status">
                <select
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="current">Current teams</option>
                  <option value="archived">Archived teams</option>
                </select>
              </Field>
            </div>
            <ReadFeedback
              name="team inventory"
              read={inventory}
              retry={() => setListRefresh((value) => value + 1)}
              disabled={!isOnline || busy}
              offline={!isOnline}
            />
            {list?.items.length ? (
              <div className="gt-team-directory">
                {list.items.map((t) => (
                  <article key={t.id}>
                    <div>
                      <h2>{t.name}</h2>
                      <p>{t.description || "No description added."}</p>
                      <Badge>{t.deleted_at ? "Archived" : "Active"}</Badge>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={!listReady || busy}
                      onClick={() => choose(t.id)}
                    >
                      Open {t.name}
                    </Button>
                  </article>
                ))}
              </div>
            ) : list && !inventory.loading && !inventory.error ? (
              <EmptyState
                title="No teams in this view"
                action={
                  q || state !== "current" ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQ("");
                        setState("current");
                        setPage(1);
                      }}
                    >
                      Reset team filters
                    </Button>
                  ) : undefined
                }
              >
                {list?.canCreate
                  ? "Create a chapter team and assign deliberate page/action grants. Nothing is shared by default."
                  : "Your active team memberships will appear here. Ask a chapter administrator if an assignment is missing."}
              </EmptyState>
            ) : null}
            <nav className="gt-button-row" aria-label="Team directory pages">
              <Button
                variant="secondary"
                disabled={page <= 1 || !listReady || busy}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} ·{" "}
                {list ? `${list.total} teams` : "Checking inventory…"}
              </span>
              <Button
                variant="secondary"
                disabled={
                  !listReady ||
                  busy ||
                  !list ||
                  page * list.pageSize >= list.total
                }
                onClick={() => setPage((v) => v + 1)}
              >
                Next
              </Button>
            </nav>
          </>
        )
      )}
      {teamId && (
        <p>
          <Link to="/admin/teams">Team directory</Link>
        </p>
      )}
    </div>
  );
}
