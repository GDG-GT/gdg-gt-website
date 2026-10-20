import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";
import { api } from "@/lib/api";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import TeamInvitations from "./TeamInvitations";
import TeamAnnouncements from "./TeamAnnouncements";
import TeamChat from "./TeamChat";
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
export default function TeamWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams(),
    section = searchParams.get("section");
  const { teamId } = useParams(),
    { currentAdmin, refreshTeams } = useAdmin();
  const [list, setList] = useState<Listing>(),
    [workspace, setWorkspace] = useState<Workspace>(),
    [selected, setSelected] = useState(teamId || ""),
    [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [mode, setMode] = useState<Mode | null>(null),
    [member, setMember] = useState<Member>(),
    [values, setValues] = useState<Record<string, string>>({}),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [grants, setGrants] = useState<TeamGrant[]>([]),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState(
      section === "announcements"
        ? "announcements"
        : section === "chat"
          ? "chat"
          : "members",
    ),
    [historyPage, setHistoryPage] = useState(1),
    [history, setHistory] = useState<{
      items: Record<string, unknown>[];
      total: number;
    }>(),
    [historyLoading, setHistoryLoading] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [destinationQuery, setDestinationQuery] = useState(""),
    [destinations, setDestinations] = useState<Team[]>([]);
  useEffect(() => {
    if (mode !== "member_transfer") return;
    const controller = new AbortController();
    api<Listing>(
      `/admin/teams?${new URLSearchParams({ q: destinationQuery, pageSize: "100" })}`,
      { signal: controller.signal },
    )
      .then((r) =>
        setDestinations(
          r.items.filter(
            (t) => t.id !== selected && t.is_active && !t.deleted_at,
          ),
        ),
      )
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [mode, destinationQuery, selected]);
  useEffect(() => setSelected(teamId || ""), [teamId]);
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
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<Listing>(
        `/admin/teams?${new URLSearchParams({ q, state, page: String(page) })}`,
        { signal: controller.signal },
      ),
      ...(selected
        ? [
            api<Workspace>("/admin/teams/" + selected, {
              signal: controller.signal,
            }),
          ]
        : []),
    ])
      .then(([listing, detail]) => {
        setList(listing as Listing);
        setWorkspace(detail as Workspace | undefined);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [q, state, page, selected, refresh]);
  useEffect(() => {
    if (mode) heading.current?.focus();
  }, [mode]);
  useEffect(() => {
    if (!mode) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode]);
  useEffect(() => {
    if (!selected || !["activity", "transfers"].includes(tab)) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    setHistory(undefined);
    api<{ items: Record<string, unknown>[]; total: number }>(
      `/admin/teams/${selected}/${tab}?page=${historyPage}`,
      { signal: controller.signal },
    )
      .then(setHistory)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [selected, tab, historyPage, refresh]);
  function open(next: Mode, m?: Member) {
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
  }
  function close() {
    if (busy) return;
    setMode(null);
    setPassword("");
    setConfirmation("");
  }
  function choose(id: string) {
    if (mode && !window.confirm("Discard the open team changes?")) return;
    close();
    setSelected(id);
    setTab("members");
    setHistoryPage(1);
    setWorkspace(undefined);
  }
  const input = (key: string) => ({
    value: values[key] || "",
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => setValues((v) => ({ ...v, [key]: event.target.value })),
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!mode) return;
    setBusy(true);
    setError("");
    setNotice("");
    const secret = password;
    setPassword("");
    try {
      const record = {
        name: values.name,
        description: values.description,
        color: values.color,
        icon: values.icon,
      };
      let body: Record<string, unknown> = { currentPassword: secret };
      if (mode === "create")
        body.record = {
          ...record,
          slug: values.slug,
          leadId: currentAdmin!.id,
        };
      else if (mode === "update")
        body = { ...body, revision: workspace!.team.revision, record };
      else {
        body = { ...body, action: mode, revision: workspace!.team.revision };
        if (mode === "permissions")
          Object.assign(body, { confirmation, grants });
        else if (mode === "archive" || mode === "restore")
          body.confirmation = confirmation;
        else if (mode === "member_add")
          Object.assign(body, { email: values.email, role: values.role });
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
      const result = await api<Workspace>(
        "/admin/teams" + (mode === "create" ? "" : "/" + workspace!.team.id),
        { method: mode === "update" ? "PATCH" : "POST", protected: true, body },
      );
      setSelected(result.team.id);
      setWorkspace(result);
      setMode(null);
      setNotice(
        mode === "permissions"
          ? "Grants saved. New requests use the updated permissions immediately."
          : mode === "restore"
            ? "Team restored. Previous page grants remain disabled until explicitly approved."
            : "Team change saved with an audit entry.",
      );
      setRefresh((v) => v + 1);
      await refreshTeams();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The team change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function toggleGrant(path: string, resource: string, enabled: boolean) {
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
          {list?.canCreate && (
            <Button disabled={busy || !!mode} onClick={() => open("create")}>
              Create team
            </Button>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}{" "}
          <button onClick={() => setRefresh((v) => v + 1)}>Reload teams</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {mode && (
        <section className="gt-panel gt-event-editor">
          <h2 tabIndex={-1} ref={heading}>
            {names[mode]}
          </h2>
          <form className="gt-form" onSubmit={save}>
            {(mode === "create" || mode === "update") && (
              <>
                <div className="gt-form-grid">
                  <Field label="Team name" required>
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      {...input("name")}
                    />
                  </Field>
                  {mode === "create" && (
                    <Field
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
                    </Field>
                  )}
                  <Field label="Accent color">
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
                  </Field>
                  <Field label="Team icon">
                    <select {...input("icon")}>
                      {icons.map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    rows={3}
                    maxLength={2000}
                    {...input("description")}
                  />
                </Field>
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
                  <Field
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
                  </Field>
                )}
                {["member_add", "member_role"].includes(mode) && (
                  <Field label="Team role">
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
                  </Field>
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
                    <Field label="Destination team" required>
                      <select required {...input("destinationId")}>
                        <option value="">Choose an active team</option>
                        {destinations.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Transfer reason" required>
                      <textarea
                        required
                        minLength={2}
                        maxLength={1000}
                        {...input("reason")}
                      />
                    </Field>
                    <p className="gt-helper">
                      Transfers preserve the source history, remove source
                      access, and create a member-level destination membership.
                      Destination officer privileges are never inherited. Up to
                      100 matching destination teams are shown; search by name
                      to narrow the list.
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
              <Field label="Type the complete team name to confirm" required>
                <input
                  required
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
            )}
            {mode === "archive" && (
              <p>
                Archiving preserves memberships and history, disables team
                access and page grants, and can be reversed. It does not delete
                chapter records owned by the team.
              </p>
            )}
            {mode === "restore" && (
              <p>
                Restoration requires an active lead. Previous page grants stay
                disabled and must be explicitly reviewed.
              </p>
            )}
            <Field label="Confirm your own password" required>
              <input
                required
                type="password"
                maxLength={128}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="gt-button-row">
              <Button
                type="submit"
                disabled={
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
                onClick={close}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}
      {loading ? (
        <div
          className="gt-skeleton gt-detail-skeleton"
          role="status"
          aria-label="Loading teams"
        />
      ) : selected && workspace ? (
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
              {workspace.actions.settings && (
                <>
                  <Button
                    variant="secondary"
                    disabled={!!mode || busy}
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
                      disabled={!!mode || busy}
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
                onClick={() => {
                  setTab(t);
                  setHistoryPage(1);
                  const next = new URLSearchParams(searchParams);
                  next.set("section", t);
                  setSearchParams(next);
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
                    disabled={!!mode || busy}
                    onClick={() => open("member_add")}
                  >
                    Add member
                  </Button>
                )}
              </header>
              <div className="gt-table-wrap">
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
                                        !!mode ||
                                        m.admin_user_id === currentAdmin?.id
                                      }
                                      onClick={() => open("member_role", m)}
                                    >
                                      Change role
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      disabled={busy || !!mode}
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
                                    disabled={busy || !!mode}
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
              </div>
            </section>
          )}
          {tab === "announcements" && (
            <TeamAnnouncements
              teamId={workspace.team.id}
              canManage={workspace.actions.manage && !workspace.team.deleted_at}
            />
          )}
          {tab === "chat" && (
            <TeamChat key={workspace.team.id} teamId={workspace.team.id} />
          )}
          {tab === "invitations" &&
            workspace.actions.manage &&
            !workspace.team.deleted_at && (
              <TeamInvitations teamId={workspace.team.id} />
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
                disabled={!!mode || busy || !!workspace.team.deleted_at}
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
              {historyLoading ? (
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
              ) : (
                <p>
                  No {tab === "activity" ? "activity" : "transfers"} recorded.
                </p>
              )}
              <nav className="gt-button-row" aria-label="Team history pages">
                <Button
                  variant="secondary"
                  disabled={historyPage <= 1 || historyLoading}
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
                    historyLoading
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
            {list?.items.length ? (
              <div className="gt-team-directory">
                {list.items.map((t) => (
                  <article key={t.id}>
                    <div>
                      <h2>{t.name}</h2>
                      <p>{t.description || "No description added."}</p>
                      <Badge>{t.deleted_at ? "Archived" : "Active"}</Badge>
                    </div>
                    <Button variant="secondary" onClick={() => choose(t.id)}>
                      Open {t.name}
                    </Button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState title="No teams in this view">
                {list?.canCreate
                  ? "Create a chapter team and assign deliberate page/action grants. Nothing is shared by default."
                  : "Your active team memberships will appear here. Ask a chapter administrator if an assignment is missing."}
              </EmptyState>
            )}
            <nav className="gt-button-row" aria-label="Team directory pages">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous
              </Button>
              <span>
                Page {page} · {list?.total || 0} teams
              </span>
              <Button
                variant="secondary"
                disabled={!list || page * list.pageSize >= list.total}
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
