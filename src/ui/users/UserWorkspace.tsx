import AccountSecurity from "./AccountSecurity";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  cloneElement,
  type ReactElement,
} from "react";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAdmin } from "@/contexts/AdminContext";
import ScrollableTable from "../ScrollableTable";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
type Intent = {
  path: string;
  method: string;
  body: Record<string, unknown>;
  key: string;
  createdAt: number;
  email: string;
  label: string;
  action: string;
  revision?: number;
  targetId?: string;
};
type Review =
  | { kind: "save"; intent: Intent }
  | { kind: "reload" | "discard" | "discard-draft" };
const actionsFor = (user: User): Action[] =>
  user.deleted_at
    ? ["restore"]
    : user.is_active
      ? ["deactivate", "reset", "revoke_sessions", "archive"]
      : ["activate", "archive"];
function AccountField({
  name,
  errors,
  children,
  ...props
}: {
  name: string;
  errors: Record<string, string>;
  children: ReactElement;
  label: string;
  required?: boolean;
  hint?: string;
}) {
  const id = "account-field-" + name,
    error = errors[name];
  return (
    <Field {...props}>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? id + "-error" : undefined,
      } as Record<string, unknown>)}
      {error && <small id={id + "-error"}>{error}</small>}
    </Field>
  );
}
type Sessions = {
  items: {
    id: string;
    created_at: string;
    last_seen_at: string;
    idle_expires_at: string;
  }[];
};
export default function UserWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <AccountDirectory
      key={`${currentAdmin.id}:${currentAdmin.role}:${epoch}`}
    />
  );
}
function AccountDirectory() {
  const [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [role, setRole] = useState(""),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [blocked, setBlocked] = useState(false),
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
    [confirmation, setConfirmation] = useState("");
  const [sessionsTarget, setSessionsTarget] = useState<User | null>(null),
    [sessionsRefresh, setSessionsRefresh] = useState(0),
    [selectedRefresh, setSelectedRefresh] = useState(0),
    [review, setReview] = useState<Review>(),
    [uncertain, setUncertain] = useState<Intent>(),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [checkedUncertain, setCheckedUncertain] = useState(false),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [checkedRecord, setCheckedRecord] = useState<{
      at: string;
      record: User;
    }>();
  const selectedTarget = editor?.user || pending?.user,
    mutation = usePrivateMutation(selectedTarget?.id || "create"),
    cancelMutation = mutation.cancel,
    busy = mutation.busy,
    feedback = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null),
    reviewOpener = useRef<HTMLElement>(),
    sessionsHeading = useRef<HTMLHeadingElement>(null),
    sessionsOpener = useRef<HTMLElement>();
  const openReview = useCallback((next: Review, opener?: HTMLElement) => {
    if (opener && !opener.closest('[role="dialog"]'))
      reviewOpener.current = opener;
    else if (
      document.activeElement instanceof HTMLElement &&
      !document.activeElement.closest('[role="dialog"]')
    )
      reviewOpener.current = document.activeElement;
    setReview(next);
  }, []);
  const editing = !!editor,
    confirming = !!pending;
  const directory = usePrivateRead<Listing>(
      `/admin/users?${new URLSearchParams({ q, state, ...(role ? { role } : {}), page: String(page) })}`,
      refresh,
    ),
    sessionRead = usePrivateRead<Sessions>(
      sessionsTarget ? `/admin/users/${sessionsTarget.id}/sessions` : undefined,
      sessionsRefresh,
    ),
    selectedRead = usePrivateRead<{ record: User }>(
      selectedTarget ? "/admin/users/" + selectedTarget.id : undefined,
      selectedRefresh,
    ),
    data = directory.data,
    loading = directory.loading,
    { isOnline } = useOnlineStatus(),
    ready = !!data && !loading && !directory.error && isOnline,
    selectedReady =
      !!selectedRead.data &&
      !selectedRead.loading &&
      !selectedRead.error &&
      !selectedRead.denied,
    selectedChanged =
      !!selectedTarget &&
      !!selectedRead.data &&
      selectedTarget.revision !== selectedRead.data.record.revision,
    canSave =
      ready &&
      !busy &&
      !needsRecheck &&
      !uncertain &&
      (!selectedTarget || (selectedReady && !selectedChanged)),
    denied = directory.denied || sessionRead.denied || selectedRead.denied,
    clearSelected = selectedRead.clear,
    clearDirectory = directory.clear,
    clearSessions = sessionRead.clear;
  const clearPrivate = useCallback(() => {
    cancelMutation();
    setBlocked(true);
    clearDirectory();
    clearSessions();
    setEditor(null);
    setPending(null);
    setSessionsTarget(null);
    setCurrentPassword("");
    setConfirmation("");
    setError("");
    setNotice("");
    clearSelected();
    setReview(undefined);
    setUncertain(undefined);
    setNeedsRecheck(false);
    setCheckedUncertain(false);
    setCheckedRecord(undefined);
    setFieldErrors({});
    sessionsOpener.current = undefined;
  }, [clearDirectory, clearSessions, clearSelected, cancelMutation]);
  useEffect(() => {
    if (denied) clearPrivate();
  }, [denied, clearPrivate]);
  useEffect(() => {
    if (!review && (error || notice)) feedback.current?.focus();
  }, [error, notice, review]);
  useEffect(() => {
    if (sessionsTarget) sessionsHeading.current?.focus();
    else if (sessionsOpener.current) {
      if (sessionsOpener.current.isConnected) sessionsOpener.current.focus();
      else document.getElementById("workspace-content")?.focus();
      sessionsOpener.current = undefined;
    }
  }, [sessionsTarget]);
  useEffect(() => {
    if (editing || confirming) {
      heading.current?.focus();
      setFieldErrors({});
      setNeedsRecheck(false);
      setCheckedRecord(undefined);
      setNotice("");
    }
  }, [editing, confirming]);
  useDraftGuard(
    !!editor || !!pending || !!currentPassword || !!confirmation || !!uncertain,
    {
      busy,
      label: "Account or security changes",
    },
  );
  function close(event?: React.MouseEvent<HTMLButtonElement>) {
    if (mutation.pending.current) return;
    if (uncertain) {
      openReview({ kind: "discard" }, event?.currentTarget);
      return;
    }
    openReview({ kind: "discard-draft" }, event?.currentTarget);
  }
  async function perform(intent: Intent, replay = false) {
    if (replay ? !ready || !checkedUncertain : !canSave) return;
    if (replay && Date.now() - intent.createdAt >= 47 * 60 * 60 * 1000) {
      setError(
        "The safe retry window ended. Inspect saved account values before abandoning this operation and starting another change.",
      );
      return;
    }
    if (!currentPassword) {
      setFieldErrors({
        currentPassword:
          "Enter your current password to authorize this change.",
      });
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    const secret = currentPassword;
    setCurrentPassword("");
    setError("");
    setNotice("");
    setFieldErrors({});
    try {
      await api(intent.path, {
        method: intent.method,
        protected: true,
        body: { ...intent.body, currentPassword: secret },
        idempotencyKey: intent.key,
        signal: controller.signal,
      });
      if (!mutation.current(controller)) return;
      setEditor(null);
      setPending(null);
      setConfirmation("");
      setSessionsTarget(null);
      setReview(undefined);
      setUncertain(undefined);
      setNeedsRecheck(false);
      setCheckedUncertain(false);
      setCheckedRecord(undefined);
      setNotice(
        intent.label +
          " confirmed by the server." +
          (["create", "reset"].includes(intent.action)
            ? " A single-use setup link is queued; queued is not delivered."
            : " Existing sessions were signed out."),
      );
      setRefresh((value) => value + 1);
    } catch (failure) {
      if (!mutation.current(controller)) return;
      setError((failure as Error).message);
      if (failure instanceof ApiFailure)
        setFieldErrors(
          Object.fromEntries(
            Object.entries(failure.fields || {}).map(([key, value]) => [
              key.replace(/^record\./, ""),
              value,
            ]),
          ),
        );
      if (
        failure instanceof ApiFailure &&
        failure.code === "PASSWORD_CONFIRMATION_FAILED"
      )
        setFieldErrors({ currentPassword: failure.message });
      else if (
        failure instanceof ApiFailure &&
        [401, 403, 404].includes(failure.status)
      )
        clearPrivate();
      else if (!(failure instanceof ApiFailure) || failure.status >= 500) {
        setUncertain(intent);
        setNeedsRecheck(true);
        setCheckedUncertain(false);
        setError(
          "The result could not be confirmed. Recheck saved values before explicitly retrying this same operation. Your password was cleared; a retry requires current password confirmation. " +
            (failure as Error).message,
        );
      } else if (failure.status === 409) {
        if (failure.code === "DUPLICATE" && intent.action === "create")
          setFieldErrors({
            email:
              "An account already uses this email. Check the current directory before choosing another address.",
          });
        else {
          setNeedsRecheck(true);
          setCheckedUncertain(false);
          setError(
            "The saved account changed. Recheck current values before another change. " +
              failure.message,
          );
        }
      }
    } finally {
      mutation.finish(controller);
    }
  }
  async function recheck() {
    if (!isOnline) return;
    const controller = mutation.begin();
    if (!controller) return;
    setCheckedUncertain(false);
    setCurrentPassword("");
    try {
      const id = uncertain?.targetId || selectedTarget?.id;
      let record: User | undefined;
      if (id)
        record = (
          await api<{ record: User }>("/admin/users/" + id, {
            signal: controller.signal,
          })
        ).record;
      else {
        const query = new URLSearchParams({
          q: uncertain?.email || editor?.email.trim().toLowerCase() || "",
          state: "current",
          page: "1",
        });
        const result = await api<Listing>("/admin/users?" + query, {
          signal: controller.signal,
        });
        record = result.items.find(
          (row) =>
            row.email ===
            (uncertain?.email || editor?.email.trim().toLowerCase()),
        );
      }
      if (!mutation.current(controller)) return;
      setCheckedRecord(
        record ? { at: new Date().toISOString(), record } : undefined,
      );
      setCheckedUncertain(true);
      setNeedsRecheck(false);
      setError("");
      setNotice("Saved account values were rechecked. No change was sent.");
      setRefresh((value) => value + 1);
      setSelectedRefresh((value) => value + 1);
    } catch (failure) {
      if (!mutation.current(controller)) return;
      setError((failure as Error).message);
      if (
        failure instanceof ApiFailure &&
        [401, 403, 404].includes(failure.status)
      )
        clearPrivate();
    } finally {
      mutation.finish(controller);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (!canSave || mutation.pending.current) return;
    const intent: Intent = editor
      ? {
          path: "/admin/users" + (editor.user ? "/" + editor.user.id : ""),
          method: editor.user ? "PATCH" : "POST",
          body: {
            record: {
              display_name: editor.display_name,
              role: editor.role,
              ...(!editor.user
                ? { email: editor.email.trim().toLowerCase() }
                : {}),
            },
            ...(editor.user ? { revision: editor.user.revision } : {}),
          },
          key: crypto.randomUUID(),
          createdAt: Date.now(),
          email: editor.email.trim().toLowerCase(),
          label: editor.user ? "Account update" : "Account creation",
          action: editor.user ? "update" : "create",
          targetId: editor.user?.id,
          revision: editor.user?.revision,
        }
      : {
          path: "/admin/users/" + pending!.user.id,
          method: "POST",
          body: {
            action: pending!.action,
            revision: pending!.user.revision,
            confirmation,
          },
          key: crypto.randomUUID(),
          createdAt: Date.now(),
          email: pending!.user.email,
          label: verbs[pending!.action],
          action: pending!.action,
          targetId: pending!.user.id,
          revision: pending!.user.revision,
        };
    if (editor)
      openReview(
        { kind: "save", intent },
        submitter instanceof HTMLElement ? submitter : undefined,
      );
    else if (
      pending &&
      confirmation === pending.user.email &&
      selectedRead.data &&
      actionsFor(selectedRead.data.record).includes(pending.action)
    )
      await perform(intent);
  }
  const recovery = () => (
    <section className="gt-panel" aria-label="Account operation recovery">
      <p>
        {uncertain
          ? `${uncertain.label} for ${uncertain.email} has an unconfirmed result. The exact original intent and retry identity are retained; no password is retained.`
          : "Recheck saved account values before another change."}
      </p>
      <Button
        variant="secondary"
        disabled={busy || !isOnline}
        onClick={recheck}
      >
        Recheck saved account values
      </Button>
      {checkedRecord && (
        <details>
          <summary>Inspect current saved account values</summary>
          <p>
            Read at{" "}
            <time dateTime={checkedRecord.at}>
              {new Date(checkedRecord.at).toLocaleString()}
            </time>
          </p>
          <dl>
            {Object.entries(checkedRecord.record)
              .filter(([key]) =>
                [
                  "email",
                  "display_name",
                  "role",
                  "is_active",
                  "must_change_password",
                  "revision",
                ].includes(key),
              )
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/_/g, " ")}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
          </dl>
        </details>
      )}
      {uncertain && (
        <>
          <AccountField
            name="retryPassword"
            label="Current password for retry"
            required
            errors={{ retryPassword: fieldErrors.currentPassword }}
          >
            <input
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={currentPassword}
              disabled={busy}
              onChange={(event) => {
                setCurrentPassword(event.target.value);
                setFieldErrors({});
              }}
            />
          </AccountField>
          <Button
            disabled={busy || !ready || !checkedUncertain || !currentPassword}
            onClick={() => perform(uncertain, true)}
          >
            Retry original account operation
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={(event) =>
              openReview({ kind: "discard" }, event.currentTarget)
            }
          >
            Review abandoning this operation
          </Button>
        </>
      )}
    </section>
  );
  const retryDirectory = () => {
    setRefresh((value) => value + 1);
    document.getElementById("workspace-content")?.focus();
  };
  if (blocked || denied)
    return (
      <EmptyState
        title="Account access needs to be rechecked"
        action={
          <Button
            disabled={!isOnline}
            onClick={() => {
              setBlocked(false);
              setRefresh((value) => value + 1);
            }}
          >
            Recheck account access
          </Button>
        }
      >
        Previous account, session and unsaved security information has been
        cleared. Recheck current access before continuing.
      </EmptyState>
    );
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
          disabled={!ready || busy || !!editor || !!pending}
          onClick={() => {
            setEditor({ email: "", display_name: "", role: "team_member" });
            setCurrentPassword("");
            setSessionsTarget(null);
          }}
        >
          Create account
        </Button>
      </header>
      <AccountSecurity />
      {!isOnline && (
        <p role="status">
          You are offline. Account changes and refresh wait for connectivity.
          {directory.at && (
            <>
              {" "}
              Directory snapshot from{" "}
              <time dateTime={directory.at}>
                {new Date(directory.at).toLocaleString()}
              </time>
              .
            </>
          )}
        </p>
      )}
      {directory.error && (
        <div className="gt-form-error" role="alert">
          <p>{directory.error}</p>
          {directory.at && (
            <p>
              Last successful account read:{" "}
              <time dateTime={directory.at}>
                {new Date(directory.at).toLocaleString()}
              </time>
              .
            </p>
          )}
          <Button
            variant="secondary"
            disabled={busy || !isOnline || loading}
            onClick={retryDirectory}
          >
            Retry account directory
          </Button>
        </div>
      )}
      <Button
        variant="ghost"
        disabled={!isOnline || busy || loading}
        onClick={() => setRefresh((value) => value + 1)}
      >
        Refresh account directory
      </Button>
      {(error || notice) && !review && (
        <div ref={feedback} tabIndex={-1}>
          {error && (
            <p className="gt-form-error" role="alert">
              {error}{" "}
              <button type="button" onClick={() => setRefresh((v) => v + 1)}>
                Reload accounts
              </button>
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
      {!review && (needsRecheck || uncertain) && recovery()}
      {selectedTarget && (
        <section aria-label="Selected account freshness">
          {selectedRead.loading && !selectedRead.data && (
            <div role="status" aria-label="Loading selected account">
              <div className="gt-skeleton gt-detail-skeleton" />
            </div>
          )}
          {selectedRead.error && (
            <div role="alert">
              <p>{selectedRead.error}</p>
              {selectedRead.at && (
                <p>
                  Last successful account detail read:{" "}
                  <time dateTime={selectedRead.at}>
                    {new Date(selectedRead.at).toLocaleString()}
                  </time>
                  .
                </p>
              )}
              <Button
                variant="secondary"
                disabled={!isOnline || busy}
                onClick={() => setSelectedRefresh((value) => value + 1)}
              >
                Retry selected account
              </Button>
            </div>
          )}
          <Button
            variant="ghost"
            disabled={!isOnline || busy || selectedRead.loading}
            onClick={() => setSelectedRefresh((value) => value + 1)}
          >
            Refresh selected account
          </Button>
          {selectedChanged && (
            <div role="alert">
              <p>
                The saved account changed. Unsaved fields are retained. Review
                current values before another change.
              </p>
              <Button
                variant="secondary"
                disabled={!selectedReady || busy || !!uncertain}
                onClick={(event) =>
                  openReview({ kind: "reload" }, event.currentTarget)
                }
              >
                Review loading saved account
              </Button>
            </div>
          )}
        </section>
      )}
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !mutation.pending.current) setReview(undefined);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (notice) feedback.current?.focus();
            else if (
              reviewOpener.current?.isConnected &&
              !reviewOpener.current.matches(":disabled")
            )
              reviewOpener.current.focus();
            else if (heading.current?.isConnected) heading.current.focus();
            else document.getElementById("workspace-content")?.focus();
          }}
          className={busy ? "[&>button]:hidden" : ""}
          onEscapeKeyDown={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
        >
          <DialogTitle>
            {review?.kind === "discard"
              ? "Abandon unconfirmed account recovery?"
              : review?.kind === "discard-draft"
                ? "Discard unsaved account input?"
                : review?.kind === "reload"
                  ? "Load the current saved account?"
                  : "Review account change"}
          </DialogTitle>
          <DialogDescription>
            {review?.kind === "discard"
              ? `${uncertain?.label} for ${uncertain?.email} may already have completed. Discard retained input and retry identity, then inspect saved records before starting another change. No operation is reversed.`
              : review?.kind === "discard-draft"
                ? `Discard unsaved account input for ${selectedTarget?.email || editor?.email || "this new account"}. Entered password and typed confirmation will be cleared. Saved records will not change.`
                : review?.kind === "reload"
                  ? `Replace unsaved fields for ${selectedTarget?.email} with its current saved values. Entered password and typed confirmation will be cleared. No server write occurs.`
                  : review?.kind === "save"
                    ? `${review.intent.action === "create" ? "Create an individual account for" : "Update"} ${review.intent.email}. ${review.intent.action === "create" ? "Queue one intended-recipient setup link; the recipient chooses their password." : "Apply the displayed name and role changes immediately and sign out existing sessions."}`
                    : ""}
          </DialogDescription>
          {review?.kind === "save" && editor && (
            <dl>
              <div>
                <dt>Display name</dt>
                <dd>
                  {editor.user?.display_name
                    ? `${editor.user.display_name} → `
                    : ""}
                  {editor.display_name}
                </dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>
                  {editor.user ? `${labels[editor.user.role]} → ` : ""}
                  {labels[editor.role]}
                </dd>
              </div>
            </dl>
          )}
          {error && <p role="alert">{error}</p>}
          {review?.kind === "save" && (needsRecheck || uncertain) && recovery()}
          {review?.kind === "save" && selectedChanged && (
            <p role="alert">
              The saved revision changed. Close this review and inspect current
              values before reviewing again.
            </p>
          )}
          <div className="gt-inline-actions">
            <Button
              variant="danger"
              disabled={
                busy ||
                (review?.kind === "save" && !canSave) ||
                (review?.kind === "reload" && (!selectedReady || !!uncertain))
              }
              onClick={() => {
                if (mutation.pending.current) return;
                if (review?.kind === "save") perform(review.intent);
                else if (review?.kind === "reload" && selectedRead.data) {
                  const fresh = selectedRead.data.record;
                  if (editor)
                    setEditor({
                      user: fresh,
                      email: fresh.email,
                      display_name: fresh.display_name,
                      role: fresh.role,
                    });
                  if (pending) {
                    if (actionsFor(fresh).includes(pending.action))
                      setPending({ ...pending, user: fresh });
                    else {
                      setPending(null);
                      setNotice(
                        "This action no longer applies to the saved account. Choose a current directory action.",
                      );
                    }
                  }
                  setCurrentPassword("");
                  setConfirmation("");
                  setFieldErrors({});
                  setNeedsRecheck(false);
                  setReview(undefined);
                } else if (
                  review?.kind === "discard" ||
                  review?.kind === "discard-draft"
                ) {
                  setEditor(null);
                  setPending(null);
                  setCurrentPassword("");
                  setConfirmation("");
                  setUncertain(undefined);
                  setNeedsRecheck(false);
                  setCheckedUncertain(false);
                  setCheckedRecord(undefined);
                  setReview(undefined);
                  setError("");
                  setFieldErrors({});
                  setRefresh((value) => value + 1);
                }
              }}
            >
              {review?.kind === "discard-draft"
                ? "Discard unsaved input"
                : review?.kind === "discard"
                  ? "Abandon recovery"
                  : review?.kind === "reload"
                    ? "Load saved account"
                    : "Confirm account change"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
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
            <fieldset
              disabled={busy || !!review || !!uncertain}
              className="gt-form gt-account-fields"
            >
              {editor ? (
                <>
                  <div className="gt-form-grid">
                    <AccountField
                      name="display_name"
                      errors={fieldErrors}
                      label="Display name"
                      required
                    >
                      <input
                        required
                        maxLength={100}
                        value={editor.display_name}
                        onChange={(e) => {
                          if (!mutation.pending.current) {
                            setEditor({
                              ...editor,
                              display_name: e.target.value,
                            });
                            setFieldErrors((previous) => ({
                              ...previous,
                              display_name: "",
                            }));
                          }
                        }}
                      />
                    </AccountField>
                    <AccountField
                      name="email"
                      errors={fieldErrors}
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
                        onChange={(e) => {
                          if (!mutation.pending.current) {
                            setEditor({ ...editor, email: e.target.value });
                            setFieldErrors((previous) => ({
                              ...previous,
                              email: "",
                            }));
                          }
                        }}
                      />
                    </AccountField>
                    <AccountField
                      name="role"
                      errors={fieldErrors}
                      label="Account role"
                      required
                    >
                      <select
                        value={editor.role}
                        onChange={(e) => {
                          if (!mutation.pending.current) {
                            setEditor({
                              ...editor,
                              role: e.target.value as Role,
                            });
                            setFieldErrors((previous) => ({
                              ...previous,
                              role: "",
                            }));
                          }
                        }}
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {labels[r]}
                          </option>
                        ))}
                      </select>
                    </AccountField>
                  </div>
                  <p className="gt-helper">
                    Super Admins manage all chapter accounts and security.
                    Admins manage operations. Team members need team-specific
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
                  <AccountField
                    name="confirmation"
                    errors={fieldErrors}
                    label="Type the account email to confirm"
                    required
                  >
                    <input
                      required
                      autoComplete="off"
                      value={confirmation}
                      onChange={(e) => {
                        if (!mutation.pending.current) {
                          setConfirmation(e.target.value);
                          setFieldErrors((previous) => ({
                            ...previous,
                            confirmation: "",
                          }));
                        }
                      }}
                    />
                  </AccountField>
                </>
              )}
              {!uncertain && (
                <AccountField
                  name="currentPassword"
                  errors={fieldErrors}
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
                    onChange={(e) => {
                      if (!mutation.pending.current) {
                        setCurrentPassword(e.target.value);
                        setFieldErrors((previous) => ({
                          ...previous,
                          currentPassword: "",
                        }));
                      }
                    }}
                  />
                </AccountField>
              )}
              <div className="gt-button-row">
                <Button
                  type="submit"
                  disabled={
                    !canSave ||
                    (!!pending &&
                      (confirmation !== pending.user.email ||
                        !selectedRead.data ||
                        !actionsFor(selectedRead.data.record).includes(
                          pending.action,
                        )))
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
            </fieldset>
          </form>
        </section>
      )}
      {sessionsTarget && (
        <section className="gt-panel" aria-label="Selected account sessions">
          <h2 ref={sessionsHeading} tabIndex={-1}>
            Active sessions · {sessionsTarget.email}
          </h2>
          <p className="gt-helper">
            No IP addresses, cookies, or tokens are exposed. Up to 100 current
            sessions are shown.
          </p>
          <Button
            variant="ghost"
            disabled={!isOnline || busy || sessionRead.loading}
            onClick={() => setSessionsRefresh((value) => value + 1)}
          >
            Refresh account sessions
          </Button>
          {sessionRead.loading && !sessionRead.data && (
            <div role="status" aria-label="Loading selected account sessions">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading account sessions…</span>
            </div>
          )}
          {sessionRead.error && (
            <div role="alert">
              <p>{sessionRead.error}</p>
              {sessionRead.at && (
                <p>
                  Last successful session read:{" "}
                  <time dateTime={sessionRead.at}>
                    {new Date(sessionRead.at).toLocaleString()}
                  </time>
                  .
                </p>
              )}
              <Button
                variant="secondary"
                disabled={!isOnline || busy || sessionRead.loading}
                onClick={() => setSessionsRefresh((value) => value + 1)}
              >
                Retry account sessions
              </Button>
            </div>
          )}
          {!isOnline && sessionRead.at && (
            <p role="status">
              Session snapshot from{" "}
              <time dateTime={sessionRead.at}>
                {new Date(sessionRead.at).toLocaleString()}
              </time>
              ; offline information may be out of date.
            </p>
          )}
          {sessionRead.data &&
            (sessionRead.data.items.length ? (
              <ul>
                {sessionRead.data.items.map((session) => (
                  <li key={session.id}>
                    Signed in {new Date(session.created_at).toLocaleString()} ·
                    last active{" "}
                    {new Date(session.last_seen_at).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : !sessionRead.loading && !sessionRead.error ? (
              <p>No active sessions.</p>
            ) : null)}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setSessionsTarget(null)}
          >
            Close session details
          </Button>
        </section>
      )}
      {data && loading && (
        <p role="status">
          Refreshing accounts; the last matching snapshot remains visible.
        </p>
      )}
      <fieldset disabled={busy} className="gt-toolbar gt-account-filters">
        <SearchBox
          label="Search account emails"
          maxLength={100}
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
      </fieldset>
      {loading && !data ? (
        <div
          className="gt-skeleton gt-detail-skeleton"
          role="status"
          aria-label="Loading accounts"
        />
      ) : data?.items.length ? (
        <ScrollableTable label="Chapter accounts table">
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
                              disabled={!ready || busy || !!editor || !!pending}
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
                              disabled={!ready || busy}
                              onClick={(event) => {
                                sessionsOpener.current = event.currentTarget;
                                setSessionsTarget(user);
                                setSessionsRefresh((value) => value + 1);
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
                            disabled={!ready || busy || !!editor || !!pending}
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
        </ScrollableTable>
      ) : (
        data &&
        !loading &&
        !directory.error &&
        !error && (
          <EmptyState
            title="No matching accounts"
            action={
              q || state !== "current" || role ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setState("current");
                    setRole("");
                    setPage(1);
                  }}
                >
                  Reset account filters
                </Button>
              ) : undefined
            }
          >
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
            disabled={
              loading || busy || !isOnline || !!directory.error || page <= 1
            }
            onClick={() => setPage((v) => v - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={
              loading ||
              busy ||
              !isOnline ||
              !!directory.error ||
              page * data.pageSize >= data.total
            }
            onClick={() => setPage((v) => v + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
