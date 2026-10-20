import { useState, useEffect, type FormEvent } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { api } from "@/lib/api";
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
  const { currentAdmin, mergedProfile, refreshProfile, updateTeamProfile } =
    useAdmin();
  const [sessions, setSessions] = useState<Session[]>([]),
    [activity, setActivity] = useState<Activity[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
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
  const load = async () => {
    const results = await Promise.allSettled([
      api<{ items: Session[] }>("/admin/me/sessions"),
      api<{ items: Activity[] }>("/admin/me/activity"),
    ]);
    if (results[0].status === "fulfilled") setSessions(results[0].value.items);
    if (results[1].status === "fulfilled") setActivity(results[1].value.items);
  };
  useEffect(() => {
    load().catch(() => setError("Your account activity could not load."));
  }, []);
  const work = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await load();
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
      setMessage("Password changed. Your other sessions were revoked.");
    });
  };
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>My profile</h1>
          <p>Your chapter identity, account security, and recent activity.</p>
        </div>
        <Badge>{currentAdmin?.role.replace(/_/g, " ")}</Badge>
      </header>
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <div className="gt-guide-grid">
        <form
          className="gt-panel gt-form"
          onSubmit={(e) => {
            e.preventDefault();
            work(async () => {
              await api("/admin/me", {
                method: "PATCH",
                protected: true,
                body: { display_name: displayName },
              });
              await refreshProfile();
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
        <form className="gt-panel gt-form" onSubmit={password}>
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
        onSubmit={(e) => {
          e.preventDefault();
          work(async () => {
            if (!(await updateTeamProfile(profile)))
              throw new Error("Your public profile could not be saved.");
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
            disabled={busy || sessions.length < 2}
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
        ) : (
          <EmptyState title="No active sessions to show" />
        )}
      </section>
      <section className="gt-panel gt-event-editor">
        <h2>Your recent activity</h2>
        {activity.length ? (
          <ul>
            {activity.map((row) => (
              <li key={row.id}>
                {row.action.replace(/[_.]/g, " ")} ·{" "}
                {new Date(row.created_at).toLocaleString()} · {row.result}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No recent activity" />
        )}
      </section>
    </div>
  );
}
