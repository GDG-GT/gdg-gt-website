import { useEffect, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useScopedRealtime } from "@/hooks/useScopedRealtime";
import { teamChatSetup } from "../../../shared/team-chat.mjs";
import { validationMessage } from "@/lib/validationMessage";
import { ActionLink, Badge, Button, Field } from "../primitives";
type Workspace = {
  teamId: string;
  teamName: string;
  teamActive: boolean;
  canSetUp: boolean;
  channel: {
    id: string;
    name: string;
    archived: boolean;
    canSend: boolean;
    canManage: boolean;
  } | null;
};
export default function TeamChat({ teamId }: { teamId: string }) {
  const [workspace, setWorkspace] = useState<Workspace>(),
    [tick, setTick] = useState(0),
    [busy, setBusy] = useState(false),
    [setup, setSetup] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState("");
  const live = useScopedRealtime(
    { kind: "notifications" },
    () => setTick((v) => v + 1),
    () => {
      setWorkspace(undefined);
      setPassword("");
      setConfirmation("");
      setSetup(false);
    },
  );
  useEffect(() => {
    const controller = new AbortController();
    api<Workspace>(`/admin/teams/${teamId}/chat`, { signal: controller.signal })
      .then((r) => {
        if (!controller.signal.aborted) {
          setWorkspace(r);
          setError("");
          if (!r.canSetUp || r.channel || !r.teamActive) {
            setSetup(false);
            setPassword("");
            setConfirmation("");
          }
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            setWorkspace(undefined);
            setSetup(false);
            setPassword("");
            setConfirmation("");
          }
        }
      });
    return () => controller.abort();
  }, [teamId, tick]);
  useEffect(() => {
    const t = setInterval(
      () => {
        if (!document.hidden) setTick((v) => v + 1);
      },
      live === "live" ? 30000 : 5000,
    );
    return () => clearInterval(t);
  }, [live]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (password || confirmation) e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [password, confirmation]);
  async function provision(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<Workspace>(`/admin/teams/${teamId}/chat`, {
        method: "POST",
        protected: true,
        body: teamChatSetup.parse({ currentPassword: password, confirmation }),
      });
      setWorkspace(r);
      setSetup(false);
      setConfirmation("");
    } catch (e) {
      setError(
        validationMessage(e, "Check the team chat setup.", {
          confirmation: "Team name",
          currentPassword: "Current password",
        }),
      );
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <section className="gt-team-chat">
      <h2>Team chat</h2>
      <p>
        One protected conversation for current team members. Joining or leaving
        the team updates access automatically; current leads and co-leads
        moderate it. Chapter administrators also have oversight access.
      </p>
      {error && (
        <p className="gt-form-error" role="alert">
          {error}{" "}
          <button onClick={() => setTick((v) => v + 1)}>Retry loading</button>
        </p>
      )}
      {!workspace ? (
        <p role="status">
          {error ? "Team chat is currently unavailable." : "Loading team chat…"}
        </p>
      ) : workspace.channel ? (
        <>
          <div className="gt-button-row">
            <Badge>
              {workspace.channel.archived
                ? "Read-only archive"
                : workspace.channel.canSend
                  ? "Conversation open"
                  : "Read-only"}
            </Badge>
            <ActionLink
              to={`/admin/channels?room=${workspace.channel.id}`}
              variant="secondary"
            >
              Open team chat
            </ActionLink>
          </div>
          <p className="gt-help">
            {!workspace.teamActive
              ? "This team is inactive. Restore the team before reopening its conversation."
              : workspace.channel.archived
              ? "Authorized leads or administrators can restore the conversation from its room controls."
              : "Replies, pins, read markers and live updates use the same protected channel workspace."}
          </p>
        </>
      ) : !workspace.teamActive ? (
        <p>
          This team is inactive. Its chat cannot be set up until the team is
          restored.
        </p>
      ) : (
        <>
          <p>No team chat has been set up yet.</p>
          {workspace.canSetUp ? (
            <Button
              disabled={busy}
              onClick={() => {
                setSetup((v) => !v);
                setPassword("");
                setConfirmation("");
              }}
            >
              {setup ? "Close setup" : "Set up team chat"}
            </Button>
          ) : (
            <p className="gt-help">
              Ask a current team lead, co-lead or chapter administrator to set
              it up.
            </p>
          )}
        </>
      )}
      {setup && workspace?.canSetUp && !workspace.channel && (
        <form className="gt-event-editor" onSubmit={provision}>
          <h3>Set up {workspace.teamName} chat</h3>
          <p>
            Current team members will be able to read and send messages. This
            does not change chapter roles or grant access to other teams.
          </p>
          <Field label="Type the complete team name" required>
            <input
              required
              maxLength={100}
              disabled={busy}
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <Field label="Your current password" required>
            <input
              required
              type="password"
              autoComplete="current-password"
              maxLength={128}
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="gt-button-row">
            <Button
              disabled={
                busy || confirmation !== workspace.teamName || !password
              }
            >
              {busy ? "Setting up…" : "Confirm team chat setup"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setSetup(false);
                setPassword("");
                setConfirmation("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
