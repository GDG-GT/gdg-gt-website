import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ScrollableTable from "@/ui/ScrollableTable";
import TeamReadFeedback from "./TeamReadFeedback";
import { Badge, Button, EmptyState, Field } from "../primitives";
type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  revision: number;
  invited_by: string;
  last_sent_at: string;
};
type Listing = {
  items: Invitation[];
  total: number;
  actorId: string;
  canInviteOfficers: boolean;
};
export default function TeamInvitations({
  teamId,
  disabled = false,
}: {
  teamId: string;
  disabled?: boolean;
}) {
  return (
    <TeamInvitationsContent key={teamId} teamId={teamId} disabled={disabled} />
  );
}
function TeamInvitationsContent({
  teamId,
  disabled,
}: {
  teamId: string;
  disabled: boolean;
}) {
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [denied, setDenied] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("member"),
    [password, setPassword] = useState(""),
    [pending, setPending] = useState<{
      invite: Invitation;
      action: "resend" | "revoke";
    } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    panel = useRef<HTMLElement>(null),
    retrying = useRef(false);
  const safety = useNavigationSafety(),
    { isOnline } = useOnlineStatus(),
    mutation = usePrivateMutation(teamId),
    { busy } = mutation,
    read = usePrivateRead<Listing>(
      denied ? undefined : `/admin/teams/${teamId}/invitations?page=${page}`,
      refresh,
    ),
    { data, loading } = read,
    blocked = denied || read.denied,
    ready =
      !disabled && isOnline && !!data && !loading && !read.error && !blocked,
    dirty = !!email || !!password || !!pending,
    stale =
      !!pending &&
      !data?.items.some(
        (row) =>
          row.id === pending.invite.id &&
          row.revision === pending.invite.revision &&
          row.status === "pending",
      ),
    allowedRole = role === "member" || !!data?.canInviteOfficers,
    allowedPending =
      !pending ||
      !!data?.canInviteOfficers ||
      (pending.invite.invited_by === data?.actorId &&
        pending.invite.role === "member");
  const reload = () => {
    retrying.current = true;
    setRefresh((v) => v + 1);
  };
  useEffect(() => {
    if (!loading && retrying.current) {
      retrying.current = false;
      panel.current?.focus();
    }
  }, [loading]);
  useDraftGuard(!!email || !!password || !!pending, {
    busy,
    label: "Team invitation or confirmation",
  });
  const { cancel } = mutation,
    { clear: clearRead } = read;
  const clear = useCallback(() => {
    cancel();
    clearRead();
    setEmail("");
    setPassword("");
    setRole("member");
    setPending(null);
    setError("");
    setNotice("");
    setDenied(true);
  }, [cancel, clearRead]);
  useEffect(() => {
    if (read.denied) clear();
  }, [read.denied, clear]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  const discard = (action: () => void) => {
    if (mutation.pending.current) return;
    if (dirty && safety) safety.request(action);
    else action();
  };
  const pendingKey = pending ? pending.invite.id + ":" + pending.action : null;
  useEffect(() => {
    if (pendingKey) heading.current?.focus();
  }, [pendingKey]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || stale || !allowedRole || !allowedPending) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setNotice("");
    const secret = password;
    setPassword("");
    try {
      await api(
        `/admin/teams/${teamId}/invitations` +
          (pending ? "/" + pending.invite.id : ""),
        {
          method: "POST",
          protected: true,
          signal: controller.signal,
          body: pending
            ? {
                currentPassword: secret,
                action: pending.action,
                revision: pending.invite.revision,
              }
            : { currentPassword: secret, email, role },
        },
      );
      if (!mutation.current(controller)) return;
      setNotice(
        pending
          ? pending.action === "revoke"
            ? "Invitation revoked. Its link can no longer be used."
            : "Invitation resent with a new link. The previous link is invalid."
          : "Invitation saved. A new invitation queues a private email; an already-pending invitation is not duplicated.",
      );
      setPending(null);
      setEmail("");
      setRole("member");
      setRefresh((v) => v + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (
        e instanceof ApiFailure &&
        [401, 403, 404].includes(e.status) &&
        e.code !== "PASSWORD_CONFIRMATION_FAILED"
      ) {
        clear();
        return;
      }
      setError(
        e instanceof Error ? e.message : "The invitation could not be saved.",
      );
    } finally {
      mutation.finish(controller);
    }
  }
  if (blocked)
    return (
      <EmptyState title="Invitation access unavailable">
        Private rows and unsent input have been cleared.
        <Button
          type="button"
          disabled={!isOnline}
          onClick={() => {
            setDenied(false);
            setRefresh((v) => v + 1);
          }}
        >
          Recheck invitation access
        </Button>
      </EmptyState>
    );
  return (
    <fieldset disabled={disabled} className="gt-team-fields">
      <section ref={panel} tabIndex={-1} aria-label="Private team invitations">
        <header className="gt-admin-heading">
          <div>
            <h2>Private team invitations</h2>
            <p>
              Links are email-bound, single-use, valid for seven days, and never
              shown to administrators.
            </p>
          </div>
        </header>
        <TeamReadFeedback
          name="invitations"
          read={read}
          offline={!isOnline}
          busy={busy}
          retry={reload}
        />
        {error && (
          <p role="alert" className="gt-form-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {(stale || !allowedPending) && (
          <p role="alert">
            This invitation changed. Review canceling this action, then choose a
            current invitation.
          </p>
        )}
        <form
          className="gt-panel gt-event-editor gt-form gt-invite-editor"
          onSubmit={submit}
        >
          <fieldset
            className="gt-form gt-team-fields"
            disabled={!ready || busy || stale || !allowedPending}
          >
            <h3 ref={heading} tabIndex={-1}>
              {pending
                ? pending.action === "revoke"
                  ? "Revoke invitation"
                  : "Resend with a new link"
                : "Invite a teammate"}
            </h3>
            {pending ? (
              <>
                <p>{pending.invite.email}</p>
                <p>
                  {pending.action === "revoke"
                    ? "Revocation takes effect immediately and preserves the invitation history."
                    : "This rotates the private link and restarts its seven-day expiry. Resending is limited to once per minute."}
                </p>
              </>
            ) : (
              <div className="gt-form-grid">
                <Field label="Recipient email" required>
                  <input
                    required
                    type="email"
                    maxLength={255}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Team membership role">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {(data?.canInviteOfficers
                      ? ["member", "co_lead", "lead"]
                      : ["member"]
                    ).map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            <p className="gt-helper">
              A new recipient chooses their own password and receives the fixed
              Team Member chapter role. Existing account holders must sign in;
              this link cannot reset a password or change a chapter role.
            </p>
            <Field label="Confirm your own password" required>
              <input
                type="password"
                required
                maxLength={128}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="gt-button-row">
              <Button
                disabled={busy || !ready || stale || !allowedRole}
                type="submit"
              >
                {busy
                  ? "Saving…"
                  : pending
                    ? "Confirm invitation change"
                    : "Queue private invitation"}
              </Button>
              {pending && (
                <Button
                  variant="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    discard(() => {
                      setPending(null);
                      setPassword("");
                    })
                  }
                >
                  Cancel
                </Button>
              )}
            </div>
          </fieldset>
        </form>
        {(stale || !allowedPending) && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              discard(() => {
                setPending(null);
                setPassword("");
              })
            }
          >
            Review closing stale invitation action
          </Button>
        )}
        {loading && !data ? (
          <div
            className="gt-skeleton gt-detail-skeleton"
            role="status"
            aria-label="Loading invitations"
          />
        ) : data?.items.length ? (
          <ScrollableTable label="Team invitation history">
            <table className="gt-data-table">
              <caption className="sr-only">
                Team invitation delivery and acceptance status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Team role</th>
                  <th scope="col">State</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((invite) => (
                  <tr key={invite.id}>
                    <td>{invite.email}</td>
                    <td>{invite.role.replace(/_/g, " ")}</td>
                    <td>
                      <Badge
                        tone={
                          invite.status === "accepted" ? "success" : "neutral"
                        }
                      >
                        {invite.status}
                      </Badge>
                    </td>
                    <td>{new Date(invite.expires_at).toLocaleString()}</td>
                    <td>
                      {invite.status === "pending" &&
                        (data.canInviteOfficers ||
                          (invite.invited_by === data.actorId &&
                            invite.role === "member")) && (
                          <div className="gt-button-row">
                            <Button
                              variant="ghost"
                              disabled={busy || !ready || dirty}
                              onClick={() => {
                                setPending({ invite, action: "resend" });
                                setPassword("");
                              }}
                            >
                              Resend
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busy || !ready || dirty}
                              onClick={() => {
                                setPending({ invite, action: "revoke" });
                                setPassword("");
                              }}
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        ) : (
          !read.error &&
          !error &&
          data && (
            <EmptyState title="No invitations recorded">
              Add a recipient above. Copyable public invitation links are not
              created.
            </EmptyState>
          )
        )}
        <nav className="gt-button-row" aria-label="Invitation pages">
          <Button
            variant="secondary"
            disabled={page <= 1 || !ready || busy}
            onClick={() =>
              discard(() => {
                setEmail("");
                setPassword("");
                setPending(null);
                setPage((v) => v - 1);
              })
            }
          >
            Previous
          </Button>
          <span>
            Page {page}
            {data ? ` · ${data.total} invitations` : " · count unavailable"}
          </span>
          <Button
            variant="secondary"
            disabled={!ready || busy || !data || page * 20 >= data.total}
            onClick={() =>
              discard(() => {
                setEmail("");
                setPassword("");
                setPending(null);
                setPage((v) => v + 1);
              })
            }
          >
            Next
          </Button>
        </nav>
      </section>
    </fieldset>
  );
}
