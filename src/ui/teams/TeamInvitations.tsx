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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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
type InviteIntent = {
  key: string;
  createdAt: number;
  path: string;
  body: Record<string, unknown>;
  action: "create" | "resend" | "revoke";
  email: string;
  role: string;
  id?: string;
  consequence: string;
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
    [review, setReview] = useState<InviteIntent>(),
    [uncertain, setUncertain] = useState<InviteIntent>(),
    [abandon, setAbandon] = useState(false),
    [conflict, setConflict] = useState(false),
    [checked, setChecked] = useState<{ at: string; rows: Invitation[] }>(),
    [passwordError, setPasswordError] = useState(""),
    [pending, setPending] = useState<{
      invite: Invitation;
      action: "resend" | "revoke";
    } | null>(null);
  const opener = useRef<HTMLElement>(),
    receipt = useRef<HTMLParagraphElement>(null),
    access = useRef<HTMLButtonElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
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
    dirty = !!email || !!password || !!pending || !!uncertain,
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
  useDraftGuard(dirty, {
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
    setReview(undefined);
    setUncertain(undefined);
    setChecked(undefined);
    setAbandon(false);
    setConflict(false);
    setPasswordError("");
    setDenied(true);
  }, [cancel, clearRead]);
  useEffect(() => {
    if (read.denied) clear();
  }, [read.denied, clear]);
  useEffect(() => {
    if (blocked) access.current?.focus();
  }, [blocked]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  const discard = (action: () => void) => {
    if (mutation.pending.current) return;
    if (uncertain) {
      setAbandon(true);
      return;
    }
    if (dirty && safety) safety.request(action);
    else action();
  };
  const pendingKey = pending ? pending.invite.id + ":" + pending.action : null;
  useEffect(() => {
    if (pendingKey) heading.current?.focus();
  }, [pendingKey]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !ready ||
      stale ||
      !allowedRole ||
      !allowedPending ||
      uncertain ||
      review ||
      conflict ||
      mutation.pending.current
    )
      return;
    const action = pending?.action || "create",
      target = pending?.invite.email || email.trim().toLowerCase();
    opener.current =
      ((event.nativeEvent as SubmitEvent).submitter as HTMLElement) ||
      undefined;
    setError("");
    setPasswordError("");
    setReview({
      key: crypto.randomUUID(),
      createdAt: Date.now(),
      path:
        `/admin/teams/${teamId}/invitations` +
        (pending ? "/" + pending.invite.id : ""),
      body: pending
        ? { action, revision: pending.invite.revision }
        : { email: target, role },
      action,
      email: target,
      role: pending?.invite.role || role,
      id: pending?.invite.id,
      consequence:
        action === "create"
          ? "Queue a private, email-bound invitation valid for seven days. An existing pending invitation keeps its current role and link. This does not change an existing account’s password or chapter role."
          : action === "resend"
            ? "Rotate this recipient’s private link and restart its seven-day expiry. The previous link stops working. A private email is queued; resending is limited to once per minute."
            : "Revoke this recipient’s invitation immediately. Its link stops working; the invitation history and any existing account or membership remain.",
    });
  }
  async function perform(intent: InviteIntent, replay = false) {
    if (
      replay
        ? !isOnline || disabled || !checked
        : !ready ||
          stale ||
          !allowedRole ||
          !allowedPending ||
          !!uncertain ||
          conflict
    )
      return;
    if (Date.now() - intent.createdAt >= 47 * 60 * 60 * 1000) {
      setError(
        "The safe retry window ended. Review abandoning recovery, inspect saved invitations and start a new action if needed.",
      );
      return;
    }
    if (!password) {
      setPasswordError(
        "Enter your current password to confirm this operation.",
      );
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setNotice("");
    setPasswordError("");
    const secret = password;
    setPassword("");
    try {
      const result = await api<{ record: Invitation }>(intent.path, {
        method: "POST",
        protected: true,
        signal: controller.signal,
        idempotencyKey: intent.key,
        body: { ...intent.body, currentPassword: secret },
      });
      if (!mutation.current(controller)) return;
      setNotice(
        `Invitation change confirmed by the server for ${result.record.email}. Current state: ${result.record.status}; team role: ${result.record.role.replace(/_/g, " ")}.`,
      );
      setReview(undefined);
      setUncertain(undefined);
      setChecked(undefined);
      setConflict(false);
      setPending(null);
      setEmail("");
      setRole("member");
      setRefresh((v) => v + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (
        e instanceof ApiFailure &&
        e.code === "PASSWORD_CONFIRMATION_FAILED"
      ) {
        setPasswordError(e.message);
        return;
      }
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
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(intent);
        setChecked(undefined);
      } else if (e.status === 409) {
        setConflict(true);
        setReview(undefined);
        setChecked(undefined);
      }
    } finally {
      mutation.finish(controller);
    }
  }
  async function recheck() {
    const intent = uncertain || review;
    if (!intent || !isOnline || disabled) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setChecked(undefined);
    try {
      const result = await api<Listing | { record: Invitation }>(
        `/admin/teams/${teamId}/invitations` +
          (intent.id
            ? "/" + intent.id
            : "?email=" + encodeURIComponent(intent.email)),
        { signal: controller.signal },
      );
      if (!mutation.current(controller)) return;
      setChecked({
        at: new Date().toISOString(),
        rows: "record" in result ? [result.record] : result.items,
      });
      setRefresh((v) => v + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clear();
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "Saved invitations could not be rechecked.",
      );
    } finally {
      mutation.finish(controller);
    }
  }
  const recovery = () => (
    <section className="gt-form" aria-label="Unconfirmed invitation recovery">
      <p>
        The original operation may already have completed. Recheck saved values,
        then explicitly retry the identical operation with a fresh password.
        Rechecking never sends an invitation.
      </p>
      <Button
        type="button"
        disabled={busy || !isOnline || disabled}
        onClick={recheck}
      >
        Recheck saved invitation values
      </Button>
      {checked && (
        <details>
          <summary>Inspect current saved invitation values</summary>
          <p>
            Read at{" "}
            <time dateTime={checked.at}>
              {new Date(checked.at).toLocaleString()}
            </time>
          </p>
          {checked.rows.length ? (
            <ul>
              {checked.rows.map((row) => (
                <li key={row.id}>
                  {row.email} · {row.role.replace(/_/g, " ")} · {row.status} ·
                  revision {row.revision}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              No matching invitation was returned by the current authorized
              read.
            </p>
          )}
        </details>
      )}
      <Field label="Current password for retry" required>
        <input
          type="password"
          maxLength={128}
          autoComplete="current-password"
          disabled={busy}
          value={password}
          aria-invalid={!!passwordError}
          aria-describedby={passwordError ? "invite-retry-error" : undefined}
          onChange={(e) => {
            if (!mutation.pending.current) {
              setPassword(e.target.value);
              setPasswordError("");
            }
          }}
        />
      </Field>
      {passwordError && (
        <p id="invite-retry-error" role="alert">
          {passwordError}
        </p>
      )}
      <Button
        type="button"
        disabled={busy || !isOnline || disabled || !checked || !password}
        onClick={() => uncertain && perform(uncertain, true)}
      >
        Retry original invitation operation
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        onClick={(event) => {
          opener.current = event.currentTarget;
          setAbandon(true);
        }}
      >
        Review abandoning invitation recovery
      </Button>
    </section>
  );
  if (blocked)
    return (
      <EmptyState title="Invitation access unavailable">
        Private rows and unsent input have been cleared.
        <button
          ref={access}
          className="gt-button gt-button-primary"
          type="button"
          disabled={!isOnline}
          onClick={() => {
            retrying.current = true;
            setDenied(false);
            setRefresh((v) => v + 1);
          }}
        >
          Recheck invitation access
        </button>
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
        {error && !review && !abandon && (
          <p role="alert" className="gt-form-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" ref={receipt} tabIndex={-1}>
            {notice}
          </p>
        )}
        {!review && uncertain && recovery()}
        {conflict && (
          <p role="alert">
            The invitation changed before this operation was accepted. Reload
            invitations, then review closing the stale action before choosing
            current values.
          </p>
        )}
        <Dialog
          open={!!review || abandon}
          onOpenChange={(open) => {
            if (!open && !mutation.pending.current) {
              if (abandon) setAbandon(false);
              else setReview(undefined);
            }
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
              if (notice) receipt.current?.focus();
              else if (
                opener.current?.isConnected &&
                !opener.current.matches(":disabled")
              )
                opener.current.focus();
              else panel.current?.focus();
            }}
          >
            <DialogTitle>
              {abandon
                ? "Abandon unconfirmed invitation recovery?"
                : `Review invitation ${review?.action}`}
            </DialogTitle>
            <DialogDescription>
              {abandon
                ? `${uncertain?.email}: the original operation may already have completed. Discard retained input and retry identity, then inspect saved invitations before starting another change. No accepted invitation change is reversed.`
                : review?.consequence}
            </DialogDescription>
            {error && <p role="alert">{error}</p>}
            {abandon ? (
              <div className="gt-inline-actions">
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => {
                    setReview(undefined);
                    setUncertain(undefined);
                    setAbandon(false);
                    setChecked(undefined);
                    setPending(null);
                    setEmail("");
                    setRole("member");
                    setPassword("");
                    setPasswordError("");
                    setConflict(false);
                    setError("");
                    setRefresh((v) => v + 1);
                  }}
                >
                  Abandon invitation recovery
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setAbandon(false)}
                >
                  Keep recovery
                </Button>
              </div>
            ) : (
              <>
                <p>Recipient: {review?.email}</p>
                <p>Team membership role: {review?.role.replace(/_/g, " ")}</p>
                {(stale || !allowedPending || !allowedRole || !ready) &&
                  !uncertain && (
                    <p role="alert">
                      Current invitation access or values changed. Close this
                      review and recheck the current invitation before
                      continuing.
                    </p>
                  )}
                {uncertain ? (
                  recovery()
                ) : (
                  <>
                    <Field label="Confirm your password again" required>
                      <input
                        type="password"
                        maxLength={128}
                        autoComplete="current-password"
                        disabled={busy}
                        value={password}
                        aria-invalid={!!passwordError}
                        aria-describedby={
                          passwordError ? "invite-proof-error" : undefined
                        }
                        onChange={(event) => {
                          if (!mutation.pending.current) {
                            setPassword(event.target.value);
                            setPasswordError("");
                          }
                        }}
                      />
                    </Field>
                    {passwordError && (
                      <p id="invite-proof-error" role="alert">
                        {passwordError}
                      </p>
                    )}
                    <Button
                      disabled={
                        busy ||
                        !ready ||
                        stale ||
                        !allowedPending ||
                        !allowedRole ||
                        !password
                      }
                      onClick={() => review && perform(review)}
                    >
                      Confirm reviewed invitation change
                    </Button>
                  </>
                )}
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setReview(undefined)}
                >
                  {uncertain
                    ? "Continue recovery outside review"
                    : "Keep editing"}
                </Button>
              </>
            )}
          </DialogContent>
        </Dialog>
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
            disabled={
              !ready ||
              busy ||
              stale ||
              !allowedPending ||
              !!review ||
              !!uncertain ||
              conflict
            }
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
          </fieldset>
          <div className="gt-button-row">
            <Button
              disabled={
                busy ||
                !ready ||
                stale ||
                !allowedRole ||
                !allowedPending ||
                !!review ||
                !!uncertain ||
                conflict
              }
              type="submit"
            >
              {busy
                ? "Saving…"
                : pending
                  ? "Confirm invitation change"
                  : "Queue private invitation"}
            </Button>
            {(dirty || conflict) && (
              <Button
                variant="secondary"
                type="button"
                disabled={busy}
                onClick={() =>
                  discard(() => {
                    setPending(null);
                    setPassword("");
                    setEmail("");
                    setRole("member");
                    setConflict(false);
                    setPasswordError("");
                  })
                }
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
        {(stale || !allowedPending || conflict) && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              discard(() => {
                setPending(null);
                setPassword("");
                setEmail("");
                setRole("member");
                setConflict(false);
                setPasswordError("");
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
              {page > 1 && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || !ready}
                  onClick={() =>
                    discard(() => {
                      setPage(1);
                      setEmail("");
                      setPassword("");
                      setPending(null);
                    })
                  }
                >
                  Return to first invitation page
                </Button>
              )}
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
