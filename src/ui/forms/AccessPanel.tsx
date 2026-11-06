import { useEffect, useState, useRef, useCallback } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field, EmptyState } from "../primitives";
import {
  prepareCollaboratorWrite,
  submitCollaboratorWrite,
  validGrantVersion,
  type CollaboratorIntent,
  type GrantVersion,
} from "./form-collaborator-api";
import FormCollaboratorWriteRecovery from "./FormCollaboratorWriteRecovery";
import type { PreviewForm } from "./store";
export type AccessWorkState = {
  dirty: boolean;
  busy: boolean;
  uncertain: boolean;
};
type Invitation = {
  id: string;
  recipientHint: string;
  delivery_state: string;
  responded: boolean;
  revoked_at: string | null;
  expires_at: string;
};
type Collaborator = GrantVersion & {
  admin_user_id: string;
  display_name: string;
  actions: string[];
  updated_at: string;
};
type Candidate = GrantVersion & {
  id: string;
  display_name: string;
  role: string;
  actions: string[];
};
type Inventory<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
type ReadState = {
  loading: boolean;
  error: string;
  denied: boolean;
  at?: string;
};
type ReviewAction =
  | { kind: "remove"; row: Collaborator }
  | { kind: "revoke" | "resend"; row: Invitation }
  | { kind: "save"; row: Candidate; actions: string[] };
type Review = ReviewAction & { formRevision: number };
const ready = (read: ReadState) => !read.loading && !read.error && !read.denied;
const focusWorkspace = () =>
  document.getElementById("workspace-content")?.focus();
function ReadStatus({
  name,
  read,
  retry,
  disabled,
}: {
  name: string;
  read: ReadState;
  retry: () => void;
  disabled?: boolean;
}) {
  return (
    <>
      {read.loading && (
        <div role="status" aria-label={`Loading ${name}`}>
          <div className="gt-skeleton" />
          <span className="sr-only">Loading {name}…</span>
        </div>
      )}
      {read.error && (
        <div role="alert">
          <p>{read.error}</p>
          {read.at && (
            <p>
              Last successful {name} read:{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              .
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              retry();
              focusWorkspace();
            }}
          >
            Retry {name}
          </Button>
        </div>
      )}
    </>
  );
}
const names: Record<string, string> = {
  view: "View definition",
  edit: "Edit draft",
  publish: "Publish and change state",
  manage_access: "Manage access",
  view_responses: "Review responses",
  view_sensitive_responses: "Reveal sensitive answers",
  export_responses: "Export responses",
  delete: "Archive and privacy actions",
};
export default function AccessPanel({
  form,
  onAccessChanged,
  onStateChange,
}: {
  form: PreviewForm;
  onAccessChanged?: () => void;
  onStateChange?: (state: AccessWorkState) => void;
}) {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <AccessWorkspace
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${form.id}:${epoch}`}
      form={form}
      onAccessChanged={onAccessChanged}
      onStateChange={onStateChange}
    />
  );
}
function AccessWorkspace({
  form,
  onAccessChanged,
  onStateChange,
}: {
  form: PreviewForm;
  onAccessChanged?: () => void;
  onStateChange?: (state: AccessWorkState) => void;
}) {
  const [refresh, setRefresh] = useState({
      context: 0,
      invitations: 0,
      collaborators: 0,
      candidates: 0,
    }),
    [page, setPage] = useState(1),
    [collaboratorPage, setCollaboratorPage] = useState(1),
    [candidatePage, setCandidatePage] = useState(1),
    [candidateQuery, setCandidateQuery] = useState("");
  const [recipients, setRecipients] = useState(""),
    [days, setDays] = useState(7),
    [confirmed, setConfirmed] = useState(false),
    [user, setUser] = useState(""),
    [actions, setActions] = useState(["view"]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [review, setReview] = useState<Review>(),
    [uncertain, setUncertain] = useState(false),
    [blocked, setBlocked] = useState(false),
    [grantIntent, setGrantIntent] = useState<CollaboratorIntent>(),
    [grantUncertain, setGrantUncertain] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false);
  const stateChange = useRef(onStateChange);
  stateChange.current = onStateChange;
  const accessChanged = useRef(onAccessChanged);
  accessChanged.current = onAccessChanged;
  const submission = useRef<{ body: string; key: string }>();
  const allowed = form.actions?.includes("manage_access");
  const root = `/admin/forms/${form.id}`,
    context = usePrivateRead<{ form: PreviewForm }>(
      allowed ? root : undefined,
      refresh.context,
    ),
    inviteRead = usePrivateRead<Inventory<Invitation>>(
      allowed ? `${root}/invitations?page=${page}` : undefined,
      refresh.invitations,
    ),
    collaboratorRead = usePrivateRead<Inventory<Collaborator>>(
      allowed ? `${root}/collaborators?page=${collaboratorPage}` : undefined,
      refresh.collaborators,
    ),
    candidateRead = usePrivateRead<Inventory<Candidate>>(
      allowed
        ? `${root}/collaborator-candidates?page=${candidatePage}&q=${encodeURIComponent(candidateQuery)}`
        : undefined,
      refresh.candidates,
    ),
    invitations = inviteRead.data?.items || [],
    collaborators = collaboratorRead.data?.items || [],
    candidates = candidateRead.data?.items || [],
    total = inviteRead.data?.total || 0,
    currentForm = context.data?.form,
    published = currentForm?.versions[currentForm.versions.length - 1],
    { isOnline } = useOnlineStatus(),
    mutation = usePrivateMutation(root),
    busy = mutation.busy || recoveryBusy,
    denied =
      blocked ||
      !allowed ||
      context.denied ||
      inviteRead.denied ||
      collaboratorRead.denied ||
      candidateRead.denied ||
      (!!currentForm && !currentForm.actions?.includes("manage_access")),
    writable =
      isOnline &&
      !busy &&
      !uncertain &&
      !grantIntent &&
      !denied &&
      ready(context) &&
      !!currentForm &&
      Number.isInteger(currentForm.revision) &&
      (currentForm.revision || 0) >= 1;
  const fileRead = useRef(0),
    feedback = useRef<HTMLParagraphElement>(null);
  const clearContext = context.clear,
    clearInvitations = inviteRead.clear,
    clearCollaborators = collaboratorRead.clear,
    clearCandidates = candidateRead.clear,
    cancelMutation = mutation.cancel,
    pendingMutation = mutation.pending;
  const load = useCallback(() => {
    setRefresh((value) => ({
      context: value.context + 1,
      invitations: value.invitations + 1,
      collaborators: value.collaborators + 1,
      candidates: value.candidates + 1,
    }));
    setUncertain(false);
    setBlocked(false);
  }, []);
  const retry = (key: keyof typeof refresh) => {
    if (isOnline && !mutation.pending.current)
      setRefresh((value) => ({ ...value, [key]: value[key] + 1 }));
  };
  useEffect(() => {
    if (denied) {
      setBlocked(true);
      fileRead.current++;
      cancelMutation();
      clearContext();
      clearInvitations();
      clearCollaborators();
      clearCandidates();
      setRecipients("");
      setUser("");
      setActions(["view"]);
      setConfirmed(false);
      setReview(undefined);
      setError("");
      setNotice("");
      submission.current = undefined;
      setGrantIntent(undefined);
      setGrantUncertain(false);
      setRecoveryBusy(false);
      accessChanged.current?.();
    }
  }, [
    denied,
    cancelMutation,
    clearContext,
    clearInvitations,
    clearCollaborators,
    clearCandidates,
  ]);
  useEffect(
    () => () => {
      fileRead.current++;
    },
    [],
  );
  useEffect(() => {
    if (error || notice) feedback.current?.focus();
  }, [error, notice]);
  useEffect(() => {
    if (!isOnline && pendingMutation.current && grantIntent) {
      cancelMutation();
      setGrantUncertain(true);
      setReview(undefined);
    }
  }, [isOnline, grantIntent, cancelMutation, pendingMutation]);
  const dirty = !!recipients || !!user || !!review || !!grantIntent;
  useEffect(() => {
    stateChange.current?.({ dirty, busy, uncertain: grantUncertain });
  }, [dirty, busy, grantUncertain]);
  useDraftGuard(dirty, {
    busy,
    label: "Form access changes",
  });
  const work = async (
    run: (signal: AbortSignal) => Promise<unknown>,
    message: string,
    onSuccess?: () => void,
  ) => {
    if (!writable) return;
    const controller = mutation.begin();
    if (!controller) return;
    fileRead.current++;
    setError("");
    setNotice("");
    try {
      await run(controller.signal);
      if (!mutation.current(controller)) return;
      setReview(undefined);
      setUser("");
      setActions(["view"]);
      onSuccess?.();
      load();
      setNotice(message);
    } catch (e) {
      if (!mutation.current(controller)) return;
      setError((e as Error).message);
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        context.clear();
        inviteRead.clear();
        collaboratorRead.clear();
        candidateRead.clear();
        setRecipients("");
        setUser("");
        setReview(undefined);
        setConfirmed(false);
        setBlocked(true);
      } else if (!(e instanceof ApiFailure) || e.status >= 500)
        setUncertain(true);
    } finally {
      mutation.finish(controller);
    }
  };
  const completeGrant = () => {
    setGrantIntent(undefined);
    setGrantUncertain(false);
    setRecoveryBusy(false);
    setReview(undefined);
    setUser("");
    setActions(["view"]);
    setError("");
    clearContext();
    clearCollaborators();
    clearCandidates();
    load();
    setNotice(
      "Collaborator change confirmed. Current access is being refreshed.",
    );
    accessChanged.current?.();
  };
  const writeGrant = async (
    selected: Review & ({ kind: "save" } | { kind: "remove" }),
  ) => {
    if (!writable || mutation.pending.current) return;
    let intent: CollaboratorIntent;
    try {
      intent = prepareCollaboratorWrite(
        form.id,
        selected.kind === "save" ? selected.row.id : selected.row.admin_user_id,
        selected.row.display_name,
        selected.kind,
        selected.formRevision,
        selected.row,
        selected.kind === "save" ? selected.actions : [],
      );
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    setGrantIntent(intent);
    setGrantUncertain(false);
    setError("");
    setNotice("");
    try {
      await submitCollaboratorWrite(intent, controller.signal);
      if (mutation.current(controller)) completeGrant();
    } catch (e) {
      if (!mutation.current(controller)) return;
      setReview(undefined);
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status))
        setBlocked(true);
      else if (!(e instanceof ApiFailure) || e.status >= 500) {
        setGrantUncertain(true);
        setError("");
      } else {
        setGrantIntent(undefined);
        load();
        setError(
          (e as Error).message +
            " Reload and review the current grant before making another request.",
        );
      }
    } finally {
      mutation.finish(controller);
    }
  };
  if (denied)
    return (
      <EmptyState
        title="Access management is restricted"
        action={
          <Button
            type="button"
            variant="secondary"
            disabled={!isOnline}
            onClick={load}
          >
            Retry current access
          </Button>
        }
      >
        Your current form permissions do not include managing access.
      </EmptyState>
    );
  const addresses = [
    ...new Set(
      recipients
        .split(/[\s,;]+/)
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v && v !== "email"),
    ),
  ];
  const reviewRead =
      review?.kind === "remove"
        ? collaboratorRead
        : review?.kind === "save"
          ? candidateRead
          : inviteRead,
    reviewRow =
      review?.kind === "remove"
        ? collaborators.find(
            (row) => row.admin_user_id === review.row.admin_user_id,
          )
        : review?.kind === "save"
          ? candidates.find((row) => row.id === review.row.id)
          : review && invitations.find((row) => row.id === review.row.id),
    reviewChanged =
      !!review &&
      ((ready(reviewRead) &&
        JSON.stringify(reviewRow) !== JSON.stringify(review.row)) ||
        (ready(context) && currentForm?.revision !== review.formRevision)),
    reviewLabel =
      review?.kind === "remove"
        ? "Remove collaborator"
        : review?.kind === "revoke"
          ? "Revoke access link"
          : review?.kind === "resend"
            ? "Replace access link"
            : "Save collaborator access",
    reviewReady =
      writable &&
      ready(reviewRead) &&
      !reviewChanged &&
      !!reviewRow &&
      ((review?.kind !== "save" && review?.kind !== "remove") ||
        (validGrantVersion(review.row) &&
          (review.kind !== "remove" || review.row.grantId !== null))) &&
      (review?.kind !== "save" ||
        review.actions.every((action) =>
          currentForm?.actions?.includes(action),
        ));
  const beginReview = (next: ReviewAction) => {
    if (
      mutation.pending.current ||
      !writable ||
      !currentForm ||
      currentForm.revision === undefined
    )
      return;
    setError("");
    setNotice("");
    setReview({ ...next, formRevision: currentForm.revision });
    load();
  };
  return (
    <div className="gt-form">
      <h2>Form access</h2>
      <p>
        Published access mode: {published?.settings.access || "Not published"}.
        Change settings and publish a new version to change access mode.
      </p>
      <ReadStatus
        name="current form access"
        read={context}
        retry={() => retry("context")}
        disabled={busy || !isOnline || !!review}
      />
      {!isOnline && (
        <p role="status">
          You are offline. Access changes stay unsent until you reconnect and
          confirm.
        </p>
      )}
      {error && !review && (
        <p
          ref={!review ? feedback : undefined}
          tabIndex={-1}
          role="alert"
          className="gt-form-error"
        >
          {error}
        </p>
      )}
      {notice && (
        <p ref={feedback} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {uncertain && (
        <div role="alert">
          <p>
            The result could not be confirmed. Refresh the inventories and check
            their current state before repeating an action.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={!isOnline || busy}
            onClick={load}
          >
            Recheck access inventories
          </Button>
        </div>
      )}
      {grantIntent && grantUncertain && (
        <FormCollaboratorWriteRecovery
          key={grantIntent.key}
          intent={grantIntent}
          onRecovered={completeGrant}
          onDenied={() => setBlocked(true)}
          onBusy={setRecoveryBusy}
          onAbandon={() => {
            setGrantIntent(undefined);
            setGrantUncertain(false);
            setRecoveryBusy(false);
            setUser("");
            setActions(["view"]);
            clearContext();
            clearCollaborators();
            clearCandidates();
            load();
            setNotice(
              "Recovery stopped. Reload and review current collaborator access before making another change.",
            );
            accessChanged.current?.();
          }}
        />
      )}
      <h3>Collaborators</h3>
      <p>
        Only explicitly checked actions are granted. Team membership rules still
        apply.
      </p>
      <ReadStatus
        name="collaborators"
        read={collaboratorRead}
        retry={() => retry("collaborators")}
        disabled={busy || !isOnline || !!review}
      />
      {collaborators.map((row) => (
        <div key={row.admin_user_id}>
          <strong>{row.display_name || "Chapter account"}</strong>
          <p>{row.actions.map((a) => names[a]).join(" · ")}</p>
          <Button
            disabled={
              !writable ||
              !ready(collaboratorRead) ||
              !!review ||
              !validGrantVersion(row)
            }
            variant="secondary"
            onClick={() => beginReview({ kind: "remove", row })}
          >
            Remove collaborator
          </Button>
        </div>
      ))}
      {!collaboratorRead.loading &&
        !collaboratorRead.error &&
        !collaborators.length && <p>No collaborators on this page.</p>}
      <div className="gt-actions" aria-label="Collaborator pages">
        <Button
          type="button"
          variant="ghost"
          disabled={
            busy ||
            !!review ||
            !ready(collaboratorRead) ||
            collaboratorPage === 1
          }
          onClick={() => setCollaboratorPage((value) => value - 1)}
        >
          Previous collaborators
        </Button>
        <span>
          Page {collaboratorPage} · {collaboratorRead.data?.total || 0}{" "}
          collaborators
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={
            busy ||
            !!review ||
            !ready(collaboratorRead) ||
            collaboratorPage * 30 >= (collaboratorRead.data?.total || 0)
          }
          onClick={() => setCollaboratorPage((value) => value + 1)}
        >
          Next collaborators
        </Button>
      </div>
      <fieldset
        disabled={busy || !!review || !!grantIntent}
        className="gt-form gt-access-fields"
      >
        <Field
          label="Search eligible accounts"
          hint="Search by account display name within this form's eligible scope."
        >
          <input
            aria-label="Search eligible accounts"
            value={candidateQuery}
            maxLength={100}
            onChange={(event) => {
              setCandidateQuery(event.target.value);
              setCandidatePage(1);
              setUser("");
              setActions(["view"]);
            }}
          />
        </Field>
        <ReadStatus
          name="eligible accounts"
          read={candidateRead}
          retry={() => retry("candidates")}
          disabled={!isOnline}
        />
        <Field label="Chapter account">
          <select
            value={user}
            disabled={!ready(candidateRead) || !isOnline}
            onChange={(e) => {
              setUser(e.target.value);
              setActions(
                candidates.find((c) => c.id === e.target.value)?.actions?.length
                  ? candidates.find((c) => c.id === e.target.value)!.actions
                  : ["view"],
              );
            }}
          >
            <option value="">Choose an eligible account</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.display_name || candidate.id} ·{" "}
                {candidate.role.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        {!candidateRead.loading &&
          !candidateRead.error &&
          !candidates.length && <p>No eligible accounts match this search.</p>}
        <div className="gt-actions" aria-label="Eligible account pages">
          <Button
            type="button"
            variant="ghost"
            disabled={!ready(candidateRead) || candidatePage === 1}
            onClick={() => {
              setCandidatePage((value) => value - 1);
              setUser("");
            }}
          >
            Previous accounts
          </Button>
          <span>
            Page {candidatePage} · {candidateRead.data?.total || 0} eligible
            accounts
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={
              !ready(candidateRead) ||
              candidatePage * 30 >= (candidateRead.data?.total || 0)
            }
            onClick={() => {
              setCandidatePage((value) => value + 1);
              setUser("");
            }}
          >
            Next accounts
          </Button>
        </div>
        {Object.entries(names)
          .filter(([action]) => currentForm?.actions?.includes(action))
          .map(([action, label]) => (
            <label className="gt-check" key={action}>
              <input
                type="checkbox"
                checked={actions.includes(action)}
                disabled={action === "view"}
                onChange={(e) =>
                  setActions(
                    e.target.checked
                      ? [...actions, action]
                      : actions.filter((a) => a !== action),
                  )
                }
              />
              {label}
            </label>
          ))}
        <Button
          disabled={
            !writable ||
            !ready(candidateRead) ||
            !user ||
            actions.some((action) => !currentForm?.actions?.includes(action))
          }
          variant="secondary"
          onClick={() =>
            candidates.some((row) => row.id === user) &&
            beginReview({
              kind: "save",
              row: candidates.find((row) => row.id === user)!,
              actions: [...actions],
            })
          }
        >
          Save collaborator access
        </Button>
      </fieldset>
      <h3>Private access links</h3>
      <p>
        Invitation and unlisted links are delivered privately. Raw tokens never
        appear in this admin workspace. Resending an unused invitation
        invalidates its old link.
      </p>
      {["invited", "unlisted"].includes(published?.settings.access || "") ? (
        <form
          className="gt-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              !writable ||
              !!review ||
              !ready(inviteRead) ||
              !confirmed ||
              addresses.length < 1 ||
              addresses.length > 100 ||
              !Number.isInteger(days) ||
              days < 1 ||
              days > 30
            )
              return;
            const body = {
                type: published?.settings.access,
                recipients: addresses,
                expiresInDays: days,
                confirmed: true,
              },
              serialized = JSON.stringify(body);
            if (submission.current?.body !== serialized)
              submission.current = {
                body: serialized,
                key: crypto.randomUUID(),
              };
            work(
              (signal) =>
                api(`/admin/forms/${form.id}/invitations`, {
                  method: "POST",
                  protected: true,
                  body,
                  idempotencyKey: submission.current!.key,
                  signal,
                }),
              "Private links queued. Refresh delivery status after the local worker runs.",
              () => {
                setRecipients("");
                setConfirmed(false);
                submission.current = undefined;
              },
            );
          }}
        >
          <fieldset
            disabled={busy || !!review || !!grantIntent}
            className="gt-form gt-access-fields"
          >
            <Field
              label="Approved recipient emails"
              hint="One per line, comma-separated, or paste an email CSV column. Maximum 100."
            >
              <textarea
                aria-label="Approved recipient emails"
                rows={5}
                value={recipients}
                onChange={(e) => {
                  fileRead.current++;
                  setRecipients(e.target.value);
                  setConfirmed(false);
                }}
                maxLength={30000}
              />
            </Field>
            <Field label="Import email CSV">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const generation = ++fileRead.current;
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 32768) {
                    setError("Use an email CSV smaller than 32 KB.");
                    return;
                  }
                  try {
                    const text = await file.text();
                    if (fileRead.current !== generation) return;
                    setRecipients(text.replace(/"/g, ""));
                    setConfirmed(false);
                  } catch {
                    if (fileRead.current === generation)
                      setError(
                        "The email CSV could not be read. Try the file again or enter addresses directly.",
                      );
                  }
                }}
              />
            </Field>
            <Field label="Expires in days">
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </Field>
            <p>{addresses.length} unique recipients</p>
            <label className="gt-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I approve these recipients and understand that their links grant
              access to this form.
            </label>
            <Button
              disabled={
                !writable ||
                !ready(inviteRead) ||
                !confirmed ||
                addresses.length < 1 ||
                addresses.length > 100
              }
            >
              Queue private links
            </Button>
          </fieldset>
        </form>
      ) : (
        <p>
          Publish an invitation-only or unlisted form to send private access
          links. Verified-email forms deliver links when respondents request
          verification.
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !!review || !isOnline || inviteRead.loading}
        onClick={() => {
          retry("invitations");
          focusWorkspace();
        }}
      >
        Refresh delivery status
      </Button>
      <ReadStatus
        name="private links"
        read={inviteRead}
        retry={() => retry("invitations")}
        disabled={busy || !isOnline || !!review}
      />
      {invitations.length ? (
        <div className="gt-table-wrap">
          <table className="gt-data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Delivery</th>
                <th>Response</th>
                <th>Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.recipientHint}</td>
                  <td>
                    {invite.revoked_at ? "Revoked" : invite.delivery_state}
                  </td>
                  <td>{invite.responded ? "Responded" : "Not yet"}</td>
                  <td>{new Date(invite.expires_at).toLocaleString()}</td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={
                        !writable ||
                        !!review ||
                        !ready(inviteRead) ||
                        invite.responded ||
                        !!invite.revoked_at
                      }
                      onClick={() =>
                        beginReview({ kind: "resend", row: invite })
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={
                        !writable ||
                        !!review ||
                        !ready(inviteRead) ||
                        !!invite.revoked_at
                      }
                      onClick={() =>
                        beginReview({ kind: "revoke", row: invite })
                      }
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !inviteRead.loading && !inviteRead.error ? (
        <p>No private links have been issued.</p>
      ) : null}
      <div className="gt-actions">
        <Button
          variant="ghost"
          disabled={page === 1 || busy || !!review || !ready(inviteRead)}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="ghost"
          disabled={
            page * 30 >= total || busy || !!review || !ready(inviteRead)
          }
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
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
          <DialogTitle>{reviewLabel}?</DialogTitle>
          <DialogDescription>
            {review?.kind === "remove"
              ? "Remove this account's explicit collaborator actions. Team permissions and administrator access still apply; existing responses are retained."
              : review?.kind === "revoke"
                ? "Invalidate this private access link so it can no longer admit new submissions. Existing responses are retained."
                : review?.kind === "resend"
                  ? "Invalidate the unused old link and queue its replacement to the same approved recipient. The replacement grants access under the published form's rules."
                  : "Grant only the listed actions to this eligible account. This can expose the form and its responses when those actions are selected; team membership rules still apply."}
          </DialogDescription>
          <p>
            <strong>{currentForm?.title || form.title}</strong> ·{" "}
            {review?.kind === "remove" || review?.kind === "save"
              ? review.row.display_name
              : review?.row.recipientHint}
          </p>
          {(review?.kind === "save" || review?.kind === "remove") && (
            <p>
              Reviewed form revision {review.formRevision}; grant revision{" "}
              {review.row.grantRevision}.
            </p>
          )}
          {review?.kind === "save" && (
            <p>{review.actions.map((action) => names[action]).join(" · ")}</p>
          )}
          {(context.loading || reviewRead.loading) && (
            <p role="status">
              Checking current access and the selected record…
            </p>
          )}
          {reviewChanged && (
            <p role="alert">
              The selected record changed or left this page. Cancel and review
              its current state before continuing.
            </p>
          )}
          {(context.error || reviewRead.error || error) && (
            <p ref={feedback} tabIndex={-1} role="alert">
              {error || context.error || reviewRead.error}
            </p>
          )}
          {!isOnline && (
            <p role="status">Reconnect before confirming this access change.</p>
          )}
          <div className="gt-inline-actions">
            <Button
              type="button"
              variant={
                review?.kind === "remove" || review?.kind === "revoke"
                  ? "danger"
                  : "primary"
              }
              disabled={!reviewReady}
              onClick={() => {
                if (!review || !reviewReady) return;
                const selected = review;
                if (selected.kind === "save" || selected.kind === "remove") {
                  void writeGrant(selected);
                  return;
                }
                void work(
                  (signal) =>
                    api(`${root}/invitations/${selected.row.id}`, {
                      method: "PATCH",
                      protected: true,
                      signal,
                      body: { action: selected.kind },
                    }),
                  selected.kind === "revoke"
                    ? "Access link revoked."
                    : "Replacement private link queued; the old link is invalid.",
                );
              }}
            >
              {busy ? "Saving…" : reviewLabel}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Cancel review
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={
                busy || !isOnline || context.loading || reviewRead.loading
              }
              onClick={load}
            >
              Recheck review
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
