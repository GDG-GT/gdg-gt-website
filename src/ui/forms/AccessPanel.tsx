import { useEffect, useState, useRef, useCallback } from "react";
import { ApiFailure } from "@/lib/api";
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
import PrivateFormLinks from "./PrivateFormLinks";
import type { PreviewForm } from "./store";
export type AccessWorkState = {
  dirty: boolean;
  busy: boolean;
  uncertain: boolean;
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
      collaborators: 0,
      candidates: 0,
    }),
    [collaboratorPage, setCollaboratorPage] = useState(1),
    [candidatePage, setCandidatePage] = useState(1),
    [candidateQuery, setCandidateQuery] = useState("");
  const [user, setUser] = useState(""),
    [actions, setActions] = useState(["view"]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [review, setReview] = useState<Review>(),
    [blocked, setBlocked] = useState(false),
    [privateState, setPrivateState] = useState<AccessWorkState>({
      dirty: false,
      busy: false,
      uncertain: false,
    }),
    [grantIntent, setGrantIntent] = useState<CollaboratorIntent>(),
    [grantUncertain, setGrantUncertain] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false);
  const stateChange = useRef(onStateChange);
  stateChange.current = onStateChange;
  const accessChanged = useRef(onAccessChanged);
  accessChanged.current = onAccessChanged;
  const allowed = form.actions?.includes("manage_access");
  const root = `/admin/forms/${form.id}`,
    context = usePrivateRead<{ form: PreviewForm }>(
      allowed ? root : undefined,
      refresh.context,
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
    collaborators = collaboratorRead.data?.items || [],
    candidates = candidateRead.data?.items || [],
    currentForm =
      context.data?.form?.id === form.id ? context.data.form : undefined,
    published = currentForm?.versions[currentForm.versions.length - 1],
    { isOnline } = useOnlineStatus(),
    mutation = usePrivateMutation(root),
    busy = mutation.busy || recoveryBusy || privateState.busy,
    denied =
      blocked ||
      !allowed ||
      context.denied ||
      collaboratorRead.denied ||
      candidateRead.denied ||
      (!!currentForm && !currentForm.actions?.includes("manage_access")),
    writable =
      isOnline &&
      !busy &&
      !privateState.uncertain &&
      !grantIntent &&
      !denied &&
      ready(context) &&
      !!currentForm &&
      Number.isInteger(currentForm.revision) &&
      (currentForm.revision || 0) >= 1;
  const feedback = useRef<HTMLParagraphElement>(null);
  const clearContext = context.clear,
    clearCollaborators = collaboratorRead.clear,
    clearCandidates = candidateRead.clear,
    cancelMutation = mutation.cancel,
    pendingMutation = mutation.pending;
  const load = useCallback(() => {
    setRefresh((value) => ({
      context: value.context + 1,
      collaborators: value.collaborators + 1,
      candidates: value.candidates + 1,
    }));
    setBlocked(false);
  }, []);
  const retry = (key: keyof typeof refresh) => {
    if (isOnline && !mutation.pending.current)
      setRefresh((value) => ({ ...value, [key]: value[key] + 1 }));
  };
  useEffect(() => {
    if (denied) {
      setBlocked(true);
      cancelMutation();
      clearContext();
      clearCollaborators();
      clearCandidates();
      setUser("");
      setActions(["view"]);
      setReview(undefined);
      setError("");
      setNotice("");
      setGrantIntent(undefined);
      setGrantUncertain(false);
      setRecoveryBusy(false);
      setPrivateState({ dirty: false, busy: false, uncertain: false });
      accessChanged.current?.();
    }
  }, [
    denied,
    cancelMutation,
    clearContext,
    clearCollaborators,
    clearCandidates,
  ]);
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
  const dirty = privateState.dirty || !!user || !!review || !!grantIntent;
  useEffect(() => {
    stateChange.current?.({
      dirty,
      busy,
      uncertain: grantUncertain || privateState.uncertain,
    });
  }, [dirty, busy, grantUncertain, privateState.uncertain]);
  useDraftGuard(dirty, {
    busy,
    label: "Form access changes",
  });
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
  const reviewRead =
      review?.kind === "remove" ? collaboratorRead : candidateRead,
    reviewRow =
      review?.kind === "remove"
        ? collaborators.find(
            (row) => row.admin_user_id === review.row.admin_user_id,
          )
        : review
          ? candidates.find((row) => row.id === review.row.id)
          : undefined,
    reviewChanged =
      !!review &&
      ((ready(reviewRead) &&
        JSON.stringify(reviewRow) !== JSON.stringify(review.row)) ||
        (ready(context) && currentForm?.revision !== review.formRevision)),
    reviewLabel =
      review?.kind === "remove"
        ? "Remove collaborator"
        : "Save collaborator access",
    reviewReady =
      writable &&
      ready(reviewRead) &&
      !reviewChanged &&
      !!reviewRow &&
      !!review &&
      validGrantVersion(review.row) &&
      (review.kind !== "remove" || review.row.grantId !== null) &&
      (review.kind !== "save" ||
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
      {context.data && !currentForm && (
        <p role="alert">
          Current form access could not be verified. Retry the current form
          access read before reviewing a change.
        </p>
      )}
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
      <PrivateFormLinks
        form={currentForm || form}
        contextReady={
          ready(context) &&
          !!currentForm &&
          Number.isInteger(currentForm.revision)
        }
        disabled={mutation.busy || recoveryBusy || !!review || !!grantIntent}
        onRecheck={load}
        onDenied={() => setBlocked(true)}
        onStateChange={setPrivateState}
      />
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
              : "Grant only the listed actions to this eligible account. This can expose the form and its responses when those actions are selected; team membership rules still apply."}
          </DialogDescription>
          <p>
            <strong>{currentForm?.title || form.title}</strong> ·{" "}
            {review?.row.display_name}
          </p>
          {review && (
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
              variant={review?.kind === "remove" ? "danger" : "primary"}
              disabled={!reviewReady}
              onClick={() => {
                if (!review || !reviewReady) return;
                void writeGrant(review);
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
