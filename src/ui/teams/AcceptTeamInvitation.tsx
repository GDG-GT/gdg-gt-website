import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button, Field } from "../primitives";
import { useUrlCapability } from '@/hooks/useUrlCapability';
type Info = {
  teamName: string;
  role: string;
  expiresAt: string;
  requiresSignIn: boolean;
};
export default function AcceptTeamInvitation() {
  const [token, setToken] = useUrlCapability('invite');
  const [email, setEmail] = useState(""),
    [info, setInfo] = useState<Info>(),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [needsSignIn, setNeedsSignIn] = useState(false);
  useEffect(() => {
    document.title = "Team invitation · GDG at Georgia Tech";
  }, []);
  return (
    <section className="gt-token-page">
      <div className="gt-token-sheet">
        <h1>
          {done
            ? "Team invitation accepted"
            : info
              ? "Join " + info.teamName
              : "Your chapter team invitation"}
        </h1>
        {error && (
          <p role="alert" className="gt-form-error">
            {error}
          </p>
        )}
        {done ? (
          <>
            <p>
              {needsSignIn
                ? "Your account was created with the Team Member role. Use the chapter access entry to sign in; the invitation does not bypass it."
                : "Your membership is now active. Open your workspace to see the team and its current permissions."}
            </p>
            <Link
              className="gt-button gt-button-secondary"
              to={needsSignIn ? "/" : "/admin/teams"}
            >
              {needsSignIn ? "Chapter website" : "Open teams"}
            </Link>
          </>
        ) : !token ? (
          <p role="alert">
            A valid private invitation link is required. Open the full link from
            your email or ask your team lead for a new one. Older links
            containing a token in the page address are no longer accepted.
          </p>
        ) : (
          <form
            className="gt-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (!info) {
                  setInfo(
                    await api<Info>("/account/team-invitations/inspect", {
                      method: "POST",
                      body: { token, email },
                    }),
                  );
                } else {
                  if (!info.requiresSignIn && password !== confirmation) {
                    setError("The new passwords do not match.");
                    return;
                  }
                  const secret = password;
                  setPassword("");
                  setConfirmation("");
                  const r = await api<{
                    accepted: boolean;
                    requiresSignIn: boolean;
                  }>("/account/team-invitations/accept", {
                    method: "POST",
                    protected: info.requiresSignIn,
                    body: {
                      token,
                      email,
                      ...(!info.requiresSignIn
                        ? { displayName: name, newPassword: secret }
                        : {}),
                    },
                  });
                  setNeedsSignIn(r.requiresSignIn);
                  setDone(true);
                  setToken("");
                }
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "This invitation could not be accepted.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Invited email address" required>
              <input
                required
                type="email"
                autoComplete="username"
                maxLength={255}
                readOnly={!!info}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {info && (
              <>
                <p>
                  Team role: {info.role.replace(/_/g, " ")} · expires{" "}
                  {new Date(info.expiresAt).toLocaleString()}.
                </p>
                {info.requiresSignIn ? (
                  <p>
                    This email already has a chapter account. Sign in through
                    the normal chapter access entry in another tab, then return
                    here to accept. An invitation cannot change your existing
                    password or chapter role.
                  </p>
                ) : (
                  <>
                    <Field label="Your display name" required>
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Choose your account password"
                      required
                      hint="At least 14 characters. Use a unique passphrase or password manager."
                    >
                      <input
                        required
                        type="password"
                        minLength={14}
                        maxLength={128}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </Field>
                    <Field label="Confirm password" required>
                      <input
                        required
                        type="password"
                        minLength={14}
                        maxLength={128}
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            <Button type="submit" disabled={busy}>
              {busy
                ? "Checking…"
                : info
                  ? info.requiresSignIn
                    ? "I'm signed in · Accept invitation"
                    : "Create account & join team"
                  : "Check invitation"}
            </Button>
            {info && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setInfo(undefined);
                  setPassword("");
                  setConfirmation("");
                }}
              >
                Use another email
              </Button>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
