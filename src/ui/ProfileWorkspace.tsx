import { useState, useEffect, type FormEvent } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { useAdmin } from "@/contexts/AdminContext";
import { api } from "@/lib/api";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, Field, Badge, EmptyState } from "./primitives";
type Session = {
  id: string;
  current: boolean;
  created_at: string;
  last_seen_at: string;
  absolute_expires_at: string;
};
type Activity = {
  id: string;
  action: string;
  created_at: string;
  result: string;
};
export default function ProfileWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <ProfileEditor key={`${currentAdmin.id}:${currentAdmin.role}:${epoch}`} />
  );
}
function ReadFeedback({
  label,
  read,
  retry,
  disabled,
}: {
  label: string;
  read: { data?: unknown; at?: string; loading: boolean; error: string };
  retry: () => void;
  disabled: boolean;
}) {
  return (
    <>
      {read.loading && !read.data && (
        <div role="status" aria-label={`Loading ${label.toLowerCase()}`}>
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading {label.toLowerCase()}…</span>
        </div>
      )}
      {read.error && (
        <div role="alert" className="gt-inline-error">
          <p>
            {label} could not {read.at ? "refresh" : "load"}. {read.error}
          </p>
          {read.at && (
            <p>
              Showing information last loaded{" "}
              {new Date(read.at).toLocaleString()}.
            </p>
          )}
          <Button
            variant="secondary"
            disabled={disabled || read.loading}
            onClick={() => {
              retry();
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry {label.toLowerCase()}
          </Button>
        </div>
      )}
    </>
  );
}
function ProfileEditor() {
  const [accountDirty, setAccountDirty] = useState(false),
    [profileDirty, setProfileDirty] = useState(false),
    [passwordDirty, setPasswordDirty] = useState(false);
  const { currentAdmin, mergedProfile, refreshProfile, updateTeamProfile } =
    useAdmin();
  const [sessionsRefresh, setSessionsRefresh] = useState(0),
    [activityRefresh, setActivityRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const sessionsRead = usePrivateRead<{ items: Session[] }>(
      "/admin/me/sessions",
      sessionsRefresh,
    ),
    activityRead = usePrivateRead<{ items: Activity[] }>(
      "/admin/me/activity",
      activityRefresh,
    ),
    sessions = sessionsRead.data?.items || [],
    activity = activityRead.data?.items || [],
    { isOnline } = useOnlineStatus();
  const [displayName, setDisplayName] = useState(
    currentAdmin?.display_name || "",
  );
  const p = mergedProfile?.teamMember;
  const [profile, setProfile] = useState({
    name: p?.name || currentAdmin?.display_name || "",
    role: p?.teamRole || "",
    bio: p?.bio || "",
    imageUrl: p?.imageUrl || "",
    linkedinUrl: p?.linkedinUrl || "",
    githubUrl: p?.githubUrl || "",
  });
  const work = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setSessionsRefresh((value) => value + 1);
      setActivityRefresh((value) => value + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const password = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("The new passwords do not match.");
      return;
    }
    await work(async () => {
      await api("/auth/password", {
        method: "POST",
        protected: true,
        body: {
          currentPassword: data.get("currentPassword"),
          newPassword: data.get("newPassword"),
        },
      });
      form.reset();
      setPasswordDirty(false);
      setMessage("Password changed. Your other sessions were revoked.");
    });
  };
  useDraftGuard(accountDirty || profileDirty || passwordDirty, {
    busy,
    label: "Profile or password input",
  });
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>My profile</h1>
          <p>Your chapter identity, account security, and recent activity.</p>
        </div>
        <Badge>{currentAdmin?.role.replace(/_/g, " ")}</Badge>
      </header>
      {!isOnline && (
        <p role="status">
          You are offline. Saved snapshots may be out of date. Reconnect, then
          refresh to check your account activity.
        </p>
      )}
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="gt-guide-grid">
        <form
          className="gt-panel gt-form"
          onChange={() => setAccountDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            work(async () => {
              await api("/admin/me", {
                method: "PATCH",
                protected: true,
                body: { display_name: displayName },
              });
              await refreshProfile();
              setAccountDirty(false);
              setMessage("Your display name is saved.");
            });
          }}
        >
          <h2>Account</h2>
          <Field label="Email">
            <input readOnly value={currentAdmin?.email || ""} />
          </Field>
          <Field label="Display name" required>
            <input
              required
              minLength={2}
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Button disabled={busy}>Save account details</Button>
        </form>
        <form
          className="gt-panel gt-form"
          onSubmit={password}
          onChange={() => setPasswordDirty(true)}
        >
          <h2>Change password</h2>
          <p>
            Use at least 14 characters. This rotates your current session and
            signs out your other sessions.
          </p>
          <Field label="Current password" required>
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </Field>
          <Field label="New password" required>
            <input
              type="password"
              name="newPassword"
              autoComplete="new-password"
              required
              minLength={14}
              maxLength={128}
            />
          </Field>
          <Field label="Confirm new password" required>
            <input
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={14}
              maxLength={128}
            />
          </Field>
          <Button disabled={busy}>Change password</Button>
        </form>
      </div>
      <form
        className="gt-form gt-panel gt-event-editor"
        onChange={() => setProfileDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          work(async () => {
            if (!(await updateTeamProfile(profile)))
              throw new Error("Your public profile could not be saved.");
            setProfileDirty(false);
            setMessage(
              "Profile saved. New profiles remain unpublished until an officer approves them.",
            );
          });
        }}
      >
        <h2>Public team profile</h2>
        <p>
          These are public-facing details. Your email is not published
          automatically.
        </p>
        <div className="gt-form-grid">
          {(
            [
              ["name", "Full name"],
              ["role", "Chapter role"],
              ["imageUrl", "Photo URL"],
              ["linkedinUrl", "LinkedIn URL"],
              ["githubUrl", "GitHub URL"],
            ] as const
          ).map(([key, label]) => (
            <Field
              key={key}
              label={label}
              required={["name", "role"].includes(key)}
            >
              <input
                required={["name", "role"].includes(key)}
                maxLength={2000}
                value={profile[key]}
                onChange={(e) =>
                  setProfile({ ...profile, [key]: e.target.value })
                }
              />
            </Field>
          ))}
        </div>
        <Field label="Short bio">
          <textarea
            maxLength={3000}
            rows={4}
            value={profile.bio}
            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          />
        </Field>
        <Button disabled={busy}>Save team profile</Button>
      </form>
      <section className="gt-panel gt-event-editor">
        <div className="gt-panel-heading">
          <h2>Active sessions</h2>
          <Button
            variant="secondary"
            disabled={busy || !isOnline || sessionsRead.loading}
            onClick={() => setSessionsRefresh((value) => value + 1)}
          >
            Refresh active sessions
          </Button>
          <Button
            variant="secondary"
            disabled={
              busy ||
              !isOnline ||
              sessionsRead.loading ||
              !!sessionsRead.error ||
              sessions.length < 2
            }
            onClick={() =>
              work(async () => {
                await api("/auth/sessions", {
                  method: "DELETE",
                  protected: true,
                });
                setMessage("Your other sessions are signed out.");
              })
            }
          >
            Sign out other sessions
          </Button>
        </div>
        <ReadFeedback
          label="Active sessions"
          read={sessionsRead}
          disabled={busy || !isOnline}
          retry={() => setSessionsRefresh((value) => value + 1)}
        />
        {sessions.length ? (
          <div className="gt-table-wrap">
            <table className="gt-data-table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Last active</th>
                  <th>Absolute expiry</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.current ? "This session" : "Other session"}</td>
                    <td>{new Date(row.last_seen_at).toLocaleString()}</td>
                    <td>
                      {new Date(row.absolute_expires_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : sessionsRead.data ? (
          <EmptyState title="No active sessions to show" />
        ) : null}
      </section>
      <section className="gt-panel gt-event-editor">
        <div className="gt-panel-heading">
          <h2>Your recent activity</h2>
          <Button
            variant="secondary"
            disabled={busy || !isOnline || activityRead.loading}
            onClick={() => setActivityRefresh((value) => value + 1)}
          >
            Refresh recent activity
          </Button>
        </div>
        <ReadFeedback
          label="Recent activity"
          read={activityRead}
          disabled={busy || !isOnline}
          retry={() => setActivityRefresh((value) => value + 1)}
        />
        {activity.length ? (
          <ul>
            {activity.map((row) => (
              <li key={row.id}>
                {row.action.replace(/[_.]/g, " ")} ·{" "}
                {new Date(row.created_at).toLocaleString()} · {row.result}
              </li>
            ))}
          </ul>
        ) : activityRead.data ? (
          <EmptyState title="No recent activity" />
        ) : null}
      </section>
    </div>
  );
}
