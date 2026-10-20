import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { api } from "@/lib/api";
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
export default function TeamInvitations({ teamId }: { teamId: string }) {
  const [data, setData] = useState<Listing>(),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("member"),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      invite: Invitation;
      action: "resend" | "revoke";
    } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useDraftGuard(!!email || !!password || !!pending, {
    busy,
    label: "Team invitation or confirmation",
  });
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    api<Listing>(`/admin/teams/${teamId}/invitations?page=${page}`, {
      signal: controller.signal,
    })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [teamId, page, refresh]);
  const pendingKey = pending ? pending.invite.id + ":" + pending.action : null;
  useEffect(() => {
    if (pendingKey) heading.current?.focus();
  }, [pendingKey]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
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
          body: pending
            ? {
                currentPassword: secret,
                action: pending.action,
                revision: pending.invite.revision,
              }
            : { currentPassword: secret, email, role },
        },
      );
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
      setError(
        e instanceof Error ? e.message : "The invitation could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <header className="gt-admin-heading">
        <div>
          <h2>Private team invitations</h2>
          <p>
            Links are email-bound, single-use, valid for seven days, and never
            shown to administrators.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}{" "}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            Reload invitations
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        className="gt-panel gt-event-editor gt-form gt-invite-editor"
        onSubmit={submit}
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
              <select value={role} onChange={(e) => setRole(e.target.value)}>
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
          A new recipient chooses their own password and receives the fixed Team
          Member chapter role. Existing account holders must sign in; this link
          cannot reset a password or change a chapter role.
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
          <Button disabled={busy || loading} type="submit">
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
              onClick={() => {
                setPending(null);
                setPassword("");
              }}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
      {loading ? (
        <div
          className="gt-skeleton gt-detail-skeleton"
          role="status"
          aria-label="Loading invitations"
        />
      ) : data?.items.length ? (
        <div className="gt-table-wrap">
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
                            disabled={busy}
                            onClick={() => {
                              setPending({ invite, action: "resend" });
                              setPassword("");
                            }}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={busy}
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
        </div>
      ) : (
        !error && (
          <EmptyState title="No invitations recorded">
            Add a recipient above. Copyable public invitation links are not
            created.
          </EmptyState>
        )
      )}
      <nav className="gt-button-row" aria-label="Invitation pages">
        <Button
          variant="secondary"
          disabled={page <= 1 || loading}
          onClick={() => setPage((v) => v - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · {data?.total || 0} invitations
        </span>
        <Button
          variant="secondary"
          disabled={loading || !data || page * 20 >= data.total}
          onClick={() => setPage((v) => v + 1)}
        >
          Next
        </Button>
      </nav>
    </section>
  );
}
