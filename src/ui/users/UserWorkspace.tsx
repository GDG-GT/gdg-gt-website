import { useEffect, useRef, useState } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { api } from "@/lib/api";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
type Role = "super_admin" | "admin" | "team_member" | "blog_editor";
type User = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  revision: number;
  deleted_at: string | null;
  last_login_at: string | null;
  locked_until: string | null;
};
type Listing = {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  actorId: string;
};
const roles: Role[] = ["team_member", "blog_editor", "admin", "super_admin"];
const labels: Record<Role, string> = {
  team_member: "Team member",
  blog_editor: "Blog editor",
  admin: "Admin",
  super_admin: "Super Admin",
};
type Action =
  | "activate"
  | "deactivate"
  | "archive"
  | "restore"
  | "reset"
  | "revoke_sessions";
const verbs: Record<Action, string> = {
  activate: "Activate account",
  deactivate: "Deactivate account",
  archive: "Archive account",
  restore: "Restore as inactive",
  reset: "Send new setup link",
  revoke_sessions: "Sign out all sessions",
};
export default function UserWorkspace() {
  const [data, setData] = useState<Listing>(),
    [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [role, setRole] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{
      user?: User;
      email: string;
      display_name: string;
      role: Role;
    } | null>(null),
    [pending, setPending] = useState<{ user: User; action: Action } | null>(
      null,
    ),
    [currentPassword, setCurrentPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<{
    email: string;
    items: {
      id: string;
      created_at: string;
      last_seen_at: string;
      idle_expires_at: string;
    }[];
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const editing = !!editor,
    confirming = !!pending;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<Listing>(
      `/admin/users?${new URLSearchParams({ q, state, ...(role ? { role } : {}), page: String(page) })}`,
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
  }, [q, state, role, page, refresh]);
  useEffect(() => {
    if (editing || confirming) heading.current?.focus();
  }, [editing, confirming]);
  useEffect(() => {
    if (!editor) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editor]);
  useDraftGuard(!!editor || !!pending || !!currentPassword || !!confirmation, {
    busy,
    label: "Account or security changes",
  });
  function close() {
    if (busy) return;
    setEditor(null);
    setPending(null);
    setCurrentPassword("");
    setConfirmation("");
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const password = currentPassword;
    setCurrentPassword("");
    try {
      if (editor) {
        const record = {
          display_name: editor.display_name,
          role: editor.role,
          ...(!editor.user ? { email: editor.email } : {}),
        };
        await api("/admin/users" + (editor.user ? "/" + editor.user.id : ""), {
          method: editor.user ? "PATCH" : "POST",
          protected: true,
          body: {
            record,
            currentPassword: password,
            ...(editor.user ? { revision: editor.user.revision } : {}),
          },
        });
        setNotice(
          editor.user
            ? "Account updated. Existing sessions were signed out."
            : "Account created. A single-use setup link is queued for the recipient.",
        );
      } else if (pending) {
        await api("/admin/users/" + pending.user.id, {
          method: "POST",
          protected: true,
          body: {
            action: pending.action,
            revision: pending.user.revision,
            currentPassword: password,
            confirmation,
          },
        });
        setNotice(
          pending.action === "reset"
            ? "Previous setup links and sessions were revoked. A new single-use link is queued."
            : "Account change saved.",
        );
      }
      setEditor(null);
      setPending(null);
      setConfirmation("");
      setSessions(null);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The account change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-page-heading">
        <div>
          <h1>People & account access</h1>
          <p>
            Create individual accounts, manage roles, and revoke access. Account
            passwords are never shared with administrators.
          </p>
        </div>
        <Button
          disabled={busy || !!editor || !!pending}
          onClick={() => {
            setEditor({ email: "", display_name: "", role: "team_member" });
            setCurrentPassword("");
            setSessions(null);
          }}
        >
          Create account
        </Button>
      </header>
      {error && (
        <p className="gt-form-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            Reload accounts
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {(editor || pending) && (
        <section className="gt-panel gt-event-editor">
          <h2 ref={heading} tabIndex={-1}>
            {editor
              ? editor.user
                ? "Edit account"
                : "Create an individual account"
              : verbs[pending!.action]}
          </h2>
          <form className="gt-form" onSubmit={save}>
            {editor ? (
              <>
                <div className="gt-form-grid">
                  <Field label="Display name" required>
                    <input
                      required
                      maxLength={100}
                      value={editor.display_name}
                      onChange={(e) =>
                        setEditor({ ...editor, display_name: e.target.value })
                      }
                    />
                  </Field>
                  <Field
                    label="Account email"
                    required
                    hint={
                      editor.user
                        ? "Email is identity-bound and cannot be changed here."
                        : "The recipient chooses their password through an emailed link valid for 24 hours."
                    }
                  >
                    <input
                      type="email"
                      required
                      maxLength={255}
                      readOnly={!!editor.user}
                      value={editor.email}
                      onChange={(e) =>
                        setEditor({ ...editor, email: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Account role" required>
                    <select
                      value={editor.role}
                      onChange={(e) =>
                        setEditor({ ...editor, role: e.target.value as Role })
                      }
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {labels[r]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <p className="gt-helper">
                  Super Admins manage all chapter accounts and security. Admins
                  manage operations. Team members need team-specific
                  permissions. Blog editors receive only editorial access.
                  Changing a role signs out existing sessions.
                </p>
              </>
            ) : (
              <>
                <p>{pending!.user.email}</p>
                <p className="gt-helper">
                  {pending!.action === "reset"
                    ? "This revokes every current session and previous setup link immediately. The recipient must choose a password before signing in again."
                    : pending!.action === "archive"
                      ? "This preserves the account and its audit history, disables access, and signs out all sessions. It can be restored as inactive."
                      : pending!.action === "restore"
                        ? "The account remains inactive after restoration. Activation is a separate action."
                        : "This change applies immediately. Any existing sessions and pending setup links will be revoked."}
                </p>
                <Field label="Type the account email to confirm" required>
                  <input
                    required
                    autoComplete="off"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
              </>
            )}
            <Field
              label="Confirm your own password"
              required
              hint="Your password is used only to authorize this change and is cleared after submission."
            >
              <input
                type="password"
                required
                autoComplete="current-password"
                maxLength={128}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <div className="gt-button-row">
              <Button
                type="submit"
                disabled={
                  busy || (!!pending && confirmation !== pending.user.email)
                }
              >
                {busy
                  ? "Saving…"
                  : editor
                    ? editor.user
                      ? "Save account"
                      : "Create & send setup link"
                    : "Confirm change"}
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
      {sessions && (
        <section className="gt-panel">
          <h2>Active sessions · {sessions.email}</h2>
          <p className="gt-helper">
            No IP addresses, cookies, or tokens are exposed. Up to 100 current
            sessions are shown.
          </p>
          {sessions.items.length ? (
            <ul>
              {sessions.items.map((s) => (
                <li key={s.id}>
                  Signed in {new Date(s.created_at).toLocaleString()} · last
                  active {new Date(s.last_seen_at).toLocaleString()}
                </li>
              ))}
            </ul>
          ) : (
            <p>No active sessions.</p>
          )}
          <Button variant="secondary" onClick={() => setSessions(null)}>
            Close session details
          </Button>
        </section>
      )}
      <div className="gt-toolbar">
        <SearchBox
          label="Search account emails"
          placeholder="Search email addresses"
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <Field label="Account status">
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            {["current", "active", "inactive", "archived"].map((v) => (
              <option key={v} value={v}>
                {v[0].toUpperCase() + v.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {labels[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {loading ? (
        <div
          className="gt-skeleton gt-detail-skeleton"
          role="status"
          aria-label="Loading accounts"
        />
      ) : data?.items.length ? (
        <div className="gt-table-wrap">
          <table className="gt-data-table gt-account-table">
            <caption className="sr-only">
              Chapter accounts and authorized access actions
            </caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Role</th>
                <th scope="col">Access</th>
                <th scope="col">Last sign-in</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.display_name || "Unnamed account"}</strong>
                    <br />
                    {user.email}
                    {user.id === data.actorId && <span> · You</span>}
                  </td>
                  <td>{labels[user.role]}</td>
                  <td>
                    <Badge
                      tone={
                        user.deleted_at
                          ? "neutral"
                          : !user.is_active
                            ? "warning"
                            : user.must_change_password
                              ? "neutral"
                              : "success"
                      }
                    >
                      {user.deleted_at
                        ? "Archived"
                        : !user.is_active
                          ? "Inactive"
                          : user.must_change_password
                            ? "Setup required"
                            : "Active"}
                    </Badge>
                    {user.locked_until &&
                      new Date(user.locked_until) > new Date() && (
                        <p>Temporarily locked</p>
                      )}
                  </td>
                  <td>
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString()
                      : "Not yet signed in"}
                  </td>
                  <td>
                    {user.id === data.actorId ? (
                      <a href="/admin/profile">Manage your profile</a>
                    ) : (
                      <div className="gt-button-row">
                        {!user.deleted_at && (
                          <>
                            <Button
                              variant="ghost"
                              disabled={busy || !!editor || !!pending}
                              onClick={() => {
                                setEditor({
                                  user,
                                  email: user.email,
                                  display_name: user.display_name || "",
                                  role: user.role,
                                });
                                setCurrentPassword("");
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={async () => {
                                try {
                                  const r = await api<{
                                    items: NonNullable<
                                      typeof sessions
                                    >["items"];
                                  }>(`/admin/users/${user.id}/sessions`);
                                  setSessions({
                                    email: user.email,
                                    items: r.items,
                                  });
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "Sessions could not load.",
                                  );
                                }
                              }}
                            >
                              Sessions
                            </Button>
                          </>
                        )}
                        {(user.deleted_at
                          ? ["restore"]
                          : user.is_active
                            ? [
                                "deactivate",
                                "reset",
                                "revoke_sessions",
                                "archive",
                              ]
                            : ["activate", "archive"]
                        ).map((value) => (
                          <Button
                            key={value}
                            variant="ghost"
                            disabled={busy || !!editor || !!pending}
                            onClick={() => {
                              setPending({ user, action: value as Action });
                              setCurrentPassword("");
                              setConfirmation("");
                            }}
                          >
                            {verbs[value as Action]}
                          </Button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <EmptyState title="No matching accounts">
            Try another email or status filter. New accounts receive a private
            setup link.
          </EmptyState>
        )
      )}
      {data && (
        <nav className="gt-button-row" aria-label="Account pages">
          <span>
            {data.total} accounts · page {page}
          </span>
          <Button
            variant="secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={loading || page * data.pageSize >= data.total}
            onClick={() => setPage((v) => v + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
