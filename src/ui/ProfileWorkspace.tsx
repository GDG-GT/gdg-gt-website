import ScrollableTable from "@/ui/ScrollableTable";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { useAdmin } from "@/contexts/AdminContext";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  const { currentAdmin, mergedProfile, refreshProfile } = useAdmin();
  const [sessionsRefresh, setSessionsRefresh] = useState(0),
    [activityRefresh, setActivityRefresh] = useState(0),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [needsRefresh, setNeedsRefresh] = useState(false),
    [blocked, setBlocked] = useState(false),
    [review, setReview] = useState<string[]>(),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [checkedValues, setCheckedValues] = useState<{
      at: string;
      values: Record<string, string>;
    }>();
  const mutation = usePrivateMutation(currentAdmin?.id || ""),
    busy = mutation.busy,
    feedback = useRef<HTMLParagraphElement>(null),
    passwordForm = useRef<HTMLFormElement>(null);
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
  const writable = isOnline && !busy && !needsRefresh && !blocked;
  const work = async (
    action: (signal: AbortSignal) => Promise<unknown>,
    accepted: () => void,
    receipt: string,
    refreshAccount = false,
  ) => {
    if (!writable) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setFieldErrors({});
    setCheckedValues(undefined);
    setMessage("");
    try {
      await action(controller.signal);
      if (!mutation.current(controller)) return;
      accepted();
      setMessage(receipt);
      setSessionsRefresh((value) => value + 1);
      setActivityRefresh((value) => value + 1);
      if (refreshAccount) {
        try {
          await refreshProfile();
        } catch {
          if (!mutation.current(controller)) return;
          setNeedsRefresh(true);
          setError(
            "The change was saved, but your account information could not refresh. Retry the read before making another change.",
          );
        }
      }
    } catch (e) {
      if (!mutation.current(controller)) return;
      setError((e as Error).message);
      if (e instanceof ApiFailure) setFieldErrors(e.fields || {});
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        setBlocked(true);
        setReview(undefined);
        passwordForm.current?.reset();
        setPasswordDirty(false);
        setDisplayName("");
        setProfile({
          name: "",
          role: "",
          bio: "",
          imageUrl: "",
          linkedinUrl: "",
          githubUrl: "",
        });
        setAccountDirty(false);
        setProfileDirty(false);
        sessionsRead.clear();
        activityRead.clear();
      } else if (!(e instanceof ApiFailure) || e.status >= 500) {
        setNeedsRefresh(true);
        passwordForm.current?.reset();
        setPasswordDirty(false);
        setError(
          "The result could not be confirmed. Recheck your account and sessions before deciding whether to repeat the change. " +
            (e as Error).message,
        );
      }
    } finally {
      mutation.finish(controller);
    }
  };
  const recheck = async () => {
    if (!isOnline) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setCheckedValues(undefined);
    try {
      const latest = await api<{
        user: { display_name: string };
        profile: null | {
          name: string;
          role: string;
          bio?: string;
          image_url?: string;
          linkedin_url?: string;
          github_url?: string;
        };
      }>("/admin/me", { signal: controller.signal });
      if (!mutation.current(controller)) return;
      await refreshProfile();
      if (!mutation.current(controller)) return;
      setCheckedValues({
        at: new Date().toISOString(),
        values: {
          "Saved display name": latest.user.display_name,
          "Saved public name": latest.profile?.name || "",
          "Saved chapter role": latest.profile?.role || "",
          "Saved bio": latest.profile?.bio || "",
          "Saved photo URL": latest.profile?.image_url || "",
          "Saved LinkedIn URL": latest.profile?.linkedin_url || "",
          "Saved GitHub URL": latest.profile?.github_url || "",
        },
      });
      if (blocked) {
        setDisplayName(latest.user.display_name || "");
        setProfile({
          name: latest.profile?.name || latest.user.display_name || "",
          role: latest.profile?.role || "",
          bio: latest.profile?.bio || "",
          imageUrl: latest.profile?.image_url || "",
          linkedinUrl: latest.profile?.linkedin_url || "",
          githubUrl: latest.profile?.github_url || "",
        });
      }
      setNeedsRefresh(false);
      setBlocked(false);
      setReview(undefined);
      setSessionsRefresh((value) => value + 1);
      setActivityRefresh((value) => value + 1);
      setMessage(
        "Current account information was refreshed. Review it before making another change.",
      );
    } catch (e) {
      if (mutation.current(controller)) setError((e as Error).message);
    } finally {
      mutation.finish(controller);
    }
  };
  useEffect(() => {
    if (error || message) feedback.current?.focus();
  }, [error, message]);
  const password = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!writable || review || mutation.pending.current) return;
    const form = e.currentTarget,
      data = new FormData(form);
    if (data.get("newPassword") !== data.get("confirmPassword")) {
      setError("The new passwords do not match.");
      setFieldErrors({
        confirmPassword: "Enter the same new password in both fields.",
      });
      return;
    }
    await work(
      (signal) =>
        api("/auth/password", {
          method: "POST",
          protected: true,
          signal,
          body: {
            currentPassword: data.get("currentPassword"),
            newPassword: data.get("newPassword"),
          },
        }),
      () => {
        form.reset();
        setPasswordDirty(false);
      },
      "Password changed. Your other sessions were revoked.",
    );
  };
  useDraftGuard(accountDirty || profileDirty || passwordDirty || !!review, {
    busy,
    label: "Profile or password input",
  });
  const otherSessionIds = sessions
      .filter((row) => !row.current)
      .map((row) => row.id)
      .sort(),
    sessionReadReady =
      !sessionsRead.loading && !sessionsRead.error && !sessionsRead.denied,
    reviewChanged =
      !!review &&
      sessionReadReady &&
      JSON.stringify(review) !== JSON.stringify(otherSessionIds);
  if (blocked)
    return (
      <EmptyState
        title="Account access needs to be rechecked"
        action={
          <Button disabled={busy || !isOnline} onClick={() => void recheck()}>
            Recheck account access
          </Button>
        }
      >
        <p>
          Your previous private account view is unavailable. Refresh current
          access before continuing.
        </p>
        {error && (
          <p ref={feedback} tabIndex={-1} role="alert">
            {error}
          </p>
        )}
      </EmptyState>
    );
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
      {error && !review && (
        <p ref={feedback} tabIndex={-1} className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p ref={feedback} tabIndex={-1} role="status">
          {message}
        </p>
      )}
      {needsRefresh && (
        <div role="status">
          <p>
            Changes are paused until current account information is rechecked.
            Reconnecting does not retry a write.
          </p>
          <Button
            variant="secondary"
            disabled={busy || !isOnline}
            onClick={() => void recheck()}
          >
            Recheck account information
          </Button>
        </div>
      )}
      {checkedValues && (
        <details className="gt-panel gt-profile-readback">
          <summary>Current saved account values</summary>
          <p>
            Read at{" "}
            <time dateTime={checkedValues.at}>
              {new Date(checkedValues.at).toLocaleString()}
            </time>
            . Your unsaved fields remain below; compare them with these saved
            values before deciding to submit again.
          </p>
          <dl>
            {Object.entries(checkedValues.values).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "Not set"}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <div className="gt-guide-grid">
        <form
          className="gt-panel gt-form"
          onChange={() => setAccountDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            if (review) return;
            void work(
              (signal) =>
                api("/admin/me", {
                  method: "PATCH",
                  protected: true,
                  signal,
                  body: { display_name: displayName },
                }),
              () => setAccountDirty(false),
              "Your display name is saved.",
              true,
            );
          }}
        >
          <fieldset
            disabled={busy || !!review}
            className="gt-form gt-profile-fields"
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
            <Button disabled={!writable}>Save account details</Button>
          </fieldset>
        </form>
        <form
          ref={passwordForm}
          className="gt-panel gt-form"
          onSubmit={password}
          onChange={() => {
            setPasswordDirty(true);
            if (Object.keys(fieldErrors).length) setError("");
            setFieldErrors({});
          }}
        >
          <fieldset
            disabled={busy || !!review}
            className="gt-form gt-profile-fields"
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
                aria-invalid={!!fieldErrors.currentPassword}
                aria-describedby={
                  fieldErrors.currentPassword
                    ? "profile-current-password-error"
                    : undefined
                }
                autoComplete="current-password"
                required
                maxLength={128}
              />
              {fieldErrors.currentPassword && (
                <span id="profile-current-password-error" role="alert">
                  {fieldErrors.currentPassword}
                </span>
              )}
            </Field>
            <Field label="New password" required>
              <input
                type="password"
                name="newPassword"
                aria-invalid={!!fieldErrors.newPassword}
                aria-describedby={
                  fieldErrors.newPassword
                    ? "profile-new-password-error"
                    : undefined
                }
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={128}
              />
              {fieldErrors.newPassword && (
                <span id="profile-new-password-error" role="alert">
                  {fieldErrors.newPassword}
                </span>
              )}
            </Field>
            <Field label="Confirm new password" required>
              <input
                type="password"
                name="confirmPassword"
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={
                  fieldErrors.confirmPassword
                    ? "profile-confirm-password-error"
                    : undefined
                }
                autoComplete="new-password"
                required
                minLength={14}
                maxLength={128}
              />
              {fieldErrors.confirmPassword && (
                <span id="profile-confirm-password-error" role="alert">
                  {fieldErrors.confirmPassword}
                </span>
              )}
            </Field>
            <Button disabled={!writable}>Change password</Button>
          </fieldset>
        </form>
      </div>
      <form
        className="gt-form gt-panel gt-event-editor"
        onChange={() => setProfileDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          if (review) return;
          void work(
            (signal) =>
              api("/admin/me", {
                method: "PATCH",
                protected: true,
                signal,
                body: { profile: { ...profile } },
              }),
            () => setProfileDirty(false),
            "Profile saved. New profiles remain unpublished until an officer approves them.",
            true,
          );
        }}
      >
        <fieldset
          disabled={busy || !!review}
          className="gt-form gt-profile-fields"
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
                  minLength={
                    key === "name" ? 2 : key === "role" ? 1 : undefined
                  }
                  maxLength={["name", "role"].includes(key) ? 100 : 2000}
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
          <Button disabled={!writable}>Save team profile</Button>
        </fieldset>
      </form>
      <section className="gt-panel gt-event-editor">
        <div className="gt-panel-heading">
          <h2>Active sessions</h2>
          <Button
            variant="secondary"
            disabled={busy || !!review || !isOnline || sessionsRead.loading}
            onClick={() => setSessionsRefresh((value) => value + 1)}
          >
            Refresh active sessions
          </Button>
          <Button
            variant="secondary"
            disabled={
              busy ||
              needsRefresh ||
              !!review ||
              !isOnline ||
              sessionsRead.loading ||
              !!sessionsRead.error ||
              sessions.length < 2
            }
            onClick={() => {
              if (!writable || !sessionReadReady) return;
              setReview(otherSessionIds);
              setError("");
              setMessage("");
              setSessionsRefresh((value) => value + 1);
            }}
          >
            Sign out other sessions
          </Button>
        </div>
        <ReadFeedback
          label="Active sessions"
          read={sessionsRead}
          disabled={busy || !!review || !isOnline}
          retry={() => setSessionsRefresh((value) => value + 1)}
        />
        {sessions.length ? (
          <ScrollableTable label="Active sessions table">
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
          </ScrollableTable>
        ) : sessionsRead.data ? (
          <EmptyState title="No active sessions to show" />
        ) : null}
      </section>
      <section className="gt-panel gt-event-editor">
        <div className="gt-panel-heading">
          <h2>Your recent activity</h2>
          <Button
            variant="secondary"
            disabled={busy || !!review || !isOnline || activityRead.loading}
            onClick={() => setActivityRefresh((value) => value + 1)}
          >
            Refresh recent activity
          </Button>
        </div>
        <ReadFeedback
          label="Recent activity"
          read={activityRead}
          disabled={busy || !!review || !isOnline}
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
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !mutation.pending.current) setReview(undefined);
        }}
      >
        <DialogContent
          onEscapeKeyDown={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
        >
          <DialogTitle>Sign out your other sessions?</DialogTitle>
          <DialogDescription>
            Revoke all other signed-in sessions for your account. This device
            stays signed in. Other devices must sign in again; unsaved work on
            those devices may be lost.
          </DialogDescription>
          <p>
            <strong>{currentAdmin?.email}</strong> · {review?.length || 0} other
            sessions in the current inventory. The operation also covers other
            sessions outside this displayed inventory.
          </p>
          {sessionsRead.loading && (
            <p role="status">Checking your current session inventory…</p>
          )}
          {reviewChanged && (
            <p role="alert">
              Your session inventory changed. Cancel and review the current
              sessions before continuing.
            </p>
          )}
          {(sessionsRead.error || error) && (
            <p ref={feedback} tabIndex={-1} role="alert">
              {error || sessionsRead.error}
            </p>
          )}
          {!isOnline && (
            <p role="status">Reconnect before confirming sign-out.</p>
          )}
          <div className="gt-inline-actions">
            <Button
              variant="danger"
              disabled={
                !writable ||
                !sessionReadReady ||
                reviewChanged ||
                !review?.length
              }
              onClick={() => {
                if (
                  !review ||
                  !writable ||
                  !sessionReadReady ||
                  reviewChanged ||
                  !review.length
                )
                  return;
                void work(
                  (signal) =>
                    api("/auth/sessions", {
                      method: "DELETE",
                      protected: true,
                      signal,
                    }),
                  () => setReview(undefined),
                  "Your other sessions are signed out.",
                );
              }}
            >
              {busy ? "Signing out…" : "Confirm other-session sign-out"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Cancel review
            </Button>
            <Button
              variant="ghost"
              disabled={busy || sessionsRead.loading || !isOnline}
              onClick={() =>
                needsRefresh
                  ? void recheck()
                  : setSessionsRefresh((value) => value + 1)
              }
            >
              {needsRefresh
                ? "Recheck account and sessions"
                : "Recheck sessions"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
