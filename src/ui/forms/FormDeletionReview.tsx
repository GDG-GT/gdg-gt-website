import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, EmptyState, Field } from "../primitives";
import {
  deletionEligible,
  validDeletionState,
  prepareDeletionWrite,
  submitDeletionWrite,
  type DeletionState,
  type DeletionReview,
  type DeletionIntent,
} from "./form-deletion-api";
import FormDeletionWriteRecovery from "./FormDeletionWriteRecovery";
type Props = {
  formId: string;
  title: string;
  onClose: () => void;
  onDeleted: () => void;
};
export default function FormDeletionReview(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin || currentAdmin.role !== "super_admin")
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <DialogContent>
          <DialogTitle>Deletion access restricted</DialogTitle>
          <DialogDescription>
            A current Super Admin session is required.
          </DialogDescription>
        </DialogContent>
      </Dialog>
    );
  return (
    <DeletionWorkspace
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}`}
      {...props}
    />
  );
}
function DeletionWorkspace(props: Props) {
  const [refresh, setRefresh] = useState(0),
    [review, setReview] = useState<DeletionReview>(),
    [intent, setIntent] = useState<DeletionIntent>(),
    [uncertain, setUncertain] = useState(false),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false);
  const path = `/admin/forms/${props.formId}`,
    read = usePrivateRead<DeletionState>(path + "/deletion-review", refresh),
    mutation = usePrivateMutation(path + ":deletion"),
    { isOnline } = useOnlineStatus(),
    safety = useNavigationSafety(),
    callbacks = useRef(props),
    feedback = useRef<HTMLParagraphElement>(null);
  callbacks.current = props;
  const { begin, current, finish, cancel, pending } = mutation,
    busy = mutation.busy || recoveryBusy,
    denied = blocked || read.denied,
    state = validDeletionState(read.data, props.formId) ? read.data : undefined,
    ready =
      !!state &&
      !read.loading &&
      !read.error &&
      !needsRecheck &&
      !denied &&
      isOnline &&
      !busy &&
      !intent,
    eligible = deletionEligible(state),
    expired = !!review && Date.parse(review.expiresAt) <= Date.now(),
    changed =
      !!review &&
      !!state &&
      JSON.stringify(review.state) !== JSON.stringify(state),
    dirty = !!(review || intent || password || confirmation || ack);
  const clearRead = read.clear;
  const clearProof = () => {
    setPassword("");
    setConfirmation("");
    setAck(false);
  };
  const block = () => {
    cancel();
    clearRead();
    setBlocked(true);
    setReview(undefined);
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    clearProof();
    setError("");
  };
  const blockRef = useRef(block);
  blockRef.current = block;
  useDraftGuard(dirty, {
    busy,
    label: intent
      ? "Unconfirmed permanent form deletion"
      : "Permanent form deletion review",
  });
  useEffect(() => {
    const clear = () => blockRef.current();
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  useEffect(() => {
    if (read.denied) blockRef.current();
  }, [read.denied]);
  useEffect(() => {
    if (!isOnline) {
      setNeedsRecheck(true);
      setPassword("");
      if (pending.current && intent) {
        cancel();
        setReview(undefined);
        setUncertain(true);
      }
    }
  }, [isOnline, intent, pending, cancel]);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const reload = () => {
    if (!isOnline || pending.current || intent) return;
    setNeedsRecheck(false);
    setRefresh((v) => v + 1);
  };
  const reset = () => {
    setNeedsRecheck(false);
    setReview(undefined);
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    clearProof();
    setError("");
    clearRead();
    setRefresh((v) => v + 1);
  };
  const deleted = () => {
    setIntent(undefined);
    setReview(undefined);
    clearProof();
    clearRead();
    callbacks.current.onDeleted();
  };
  const close = () => {
    if (busy || uncertain) return;
    if (dirty) safety.request(() => callbacks.current.onClose());
    else callbacks.current.onClose();
  };
  async function prepare() {
    if (!ready || !eligible || !state) return;
    const controller = begin();
    if (!controller) return;
    setError("");
    setPassword("");
    try {
      const r = await api<DeletionReview>(path + "/deletion-review", {
        method: "POST",
        protected: true,
        body: { revision: state.revision },
        signal: controller.signal,
      });
      if (!current(controller)) return;
      if (
        !r ||
        !validDeletionState(r.state, props.formId) ||
        !deletionEligible(r.state) ||
        !r.reviewId ||
        !r.reviewToken ||
        !Number.isFinite(Date.parse(r.expiresAt)) ||
        Date.parse(r.expiresAt) <= Date.now()
      )
        throw new ApiFailure(
          503,
          "UNCONFIRMED_REVIEW",
          "The deletion review could not be verified.",
        );
      setReview(r);
      clearProof();
    } catch (e) {
      if (!current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status))
        block();
      else {
        setReview(undefined);
        setNeedsRecheck(true);
        setError(
          (e as Error).message +
            " No permanent deletion was requested. Recheck eligibility before explicitly requesting another review.",
        );
      }
    } finally {
      finish(controller);
    }
  }
  async function remove() {
    if (
      !ready ||
      !eligible ||
      !review ||
      expired ||
      changed ||
      !ack ||
      confirmation !== props.title ||
      !password
    )
      return;
    let original: DeletionIntent;
    try {
      original = prepareDeletionWrite(props.formId, review);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const controller = begin();
    if (!controller) return;
    const proof = password;
    setPassword("");
    setError("");
    setIntent(original);
    try {
      await submitDeletionWrite(original, proof, controller.signal);
      if (current(controller)) deleted();
    } catch (e) {
      if (!current(controller)) return;
      if (
        e instanceof ApiFailure &&
        [401, 403, 404].includes(e.status) &&
        e.code !== "PASSWORD_REQUIRED"
      )
        block();
      else if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(true);
        setReview(undefined);
        clearProof();
      } else {
        setIntent(undefined);
        setError((e as Error).message);
        if (!(e instanceof ApiFailure) || e.code !== "PASSWORD_REQUIRED") {
          setReview(undefined);
          clearProof();
          clearRead();
          setRefresh((v) => v + 1);
        }
      }
    } finally {
      finish(controller);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="gt-notification-dialog"
        closeDisabled={busy || uncertain}
        onEscapeKeyDown={(event) => {
          if (busy || uncertain) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy || uncertain) event.preventDefault();
        }}
      >
        <DialogTitle>Permanent form deletion</DialogTitle>
        <DialogDescription>
          This is irreversible. Permanent deletion cannot be restored. Review
          retention, holds and existing copies before continuing.
        </DialogDescription>
        {denied ? (
          <EmptyState title="Deletion access restricted">
            This review is no longer available to your current session. Private
            eligibility details and proof have been cleared.
          </EmptyState>
        ) : (
          <div className="gt-form">
            {!intent && (
              <p>
                <strong>{props.title}</strong>
              </p>
            )}
            {error && (
              <p
                ref={feedback}
                tabIndex={-1}
                role="alert"
                className="gt-form-error"
              >
                {error}
              </p>
            )}
            {needsRecheck && isOnline && (
              <p role="status">
                Recheck current eligibility before continuing with this review.
              </p>
            )}
            {!isOnline && (
              <p role="status">
                Reconnect and explicitly recheck the review before confirming.
                No deletion runs automatically.
              </p>
            )}
            {intent && uncertain ? (
              <FormDeletionWriteRecovery
                key={intent.key}
                intent={intent}
                onRecovered={deleted}
                onDenied={block}
                onBusy={setRecoveryBusy}
                onAbandon={reset}
              />
            ) : (
              <>
                {read.loading && (
                  <div role="status" aria-label="Loading deletion eligibility">
                    <div className="gt-skeleton" />
                    <span>Checking retention and references…</span>
                  </div>
                )}
                {(read.error || (!read.loading && read.data && !state)) && (
                  <section role="alert">
                    <p>
                      {read.error ||
                        "The eligibility result could not be verified."}
                    </p>
                    {read.at && (
                      <p>
                        Last successful eligibility check:{" "}
                        <time dateTime={read.at}>
                          {new Date(read.at).toLocaleString()}
                        </time>
                        .
                      </p>
                    )}
                    <Button
                      variant="secondary"
                      disabled={!isOnline || busy || !!intent}
                      onClick={reload}
                    >
                      Retry eligibility check
                    </Button>
                  </section>
                )}
                {state ? (
                  <>
                    <p>
                      {state.retainedResponses} retained responses ·{" "}
                      {state.drafts} incomplete drafts ·{" "}
                      {state.publishedVersions} published versions.
                    </p>
                    {!eligible && (
                      <section aria-label="Deletion blockers">
                        <h3>Resolve these before deletion</h3>
                        <ul>
                          {!state.archived && <li>Archive the form first.</li>}
                          {(state.formHeld || !!state.heldResponses) && (
                            <li>
                              An operational hold applies. Review it in
                              Responses → Retention &amp; holds; deletion cannot
                              override a hold.
                            </li>
                          )}
                          {!!state.unexpiredResponses && (
                            <li>
                              {state.unexpiredResponses} responses are still
                              within their original retention period.
                            </li>
                          )}
                          {!!state.activeReferences && (
                            <li>
                              {state.activeReferences} active event, team or
                              campaign references must be removed or their
                              source archived.
                            </li>
                          )}
                          {state.purged && (
                            <li>This form was already permanently deleted.</li>
                          )}
                        </ul>
                      </section>
                    )}
                    <p>
                      Erases the draft, published question definitions, retained
                      answers/history, incomplete responses, private saved views
                      and respondent identity copies. Minimal identifiers and
                      security audits remain; the old URL stays reserved.
                    </p>
                    <p className="gt-helper">
                      {state.filesAwaitingCleanup} files and{" "}
                      {state.exportsAwaitingCleanup} export artifacts may need
                      physical cleanup. Export jobs are cancelled and access
                      revoked immediately; private bytes are removed by
                      retryable workers. Already downloaded files or delivered
                      messages cannot be recalled.
                    </p>
                    <p>
                      <Link to={`/admin/forms/${props.formId}/responses`}>
                        Review responses and export what you need before
                        proceeding
                      </Link>
                      . This action does not make an automatic backup.
                    </p>
                    {!review ? (
                      <div className="gt-inline-actions">
                        <Button
                          disabled={!ready || !eligible}
                          onClick={() => void prepare()}
                        >
                          Review permanent deletion
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={
                            !isOnline || busy || !!intent || read.loading
                          }
                          onClick={reload}
                        >
                          Recheck eligibility
                        </Button>
                      </div>
                    ) : (
                      <form
                        className="gt-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void remove();
                        }}
                      >
                        <p className="gt-helper">
                          This session-bound review expires{" "}
                          {new Date(review.expiresAt).toLocaleString()}. Changed
                          retention, holds, references or contents require a new
                          review.
                        </p>
                        {(changed || expired) && (
                          <p role="alert">
                            The form changed or the five-minute review expired.
                            Start a new current eligibility review before
                            deleting.
                          </p>
                        )}
                        <fieldset
                          className="gt-form gt-plain-fieldset"
                          disabled={busy || !!intent}
                        >
                          <label className="gt-check">
                            <input
                              type="checkbox"
                              required
                              checked={ack}
                              onChange={(e) => setAck(e.target.checked)}
                            />
                            I have exported anything I need and understand that
                            deletion is irreversible, cancels pending exports
                            and does not recall existing copies.
                          </label>
                          <Field
                            label="Deletion confirmation"
                            hint={`Type the form name exactly: ${props.title}`}
                          >
                            <input
                              required
                              value={confirmation}
                              autoComplete="off"
                              spellCheck={false}
                              onChange={(e) => setConfirmation(e.target.value)}
                            />
                          </Field>
                          <Field label="Current password">
                            <input
                              required
                              type="password"
                              autoComplete="current-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </Field>
                          <div className="gt-inline-actions">
                            <Button
                              type="submit"
                              variant="danger"
                              disabled={
                                !ready ||
                                !eligible ||
                                changed ||
                                expired ||
                                !ack ||
                                !password ||
                                confirmation !== props.title
                              }
                            >
                              Permanently delete this form
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={busy || !!intent}
                              onClick={() => safety.request(reset)}
                            >
                              Start a new review
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={
                                !isOnline || busy || !!intent || read.loading
                              }
                              onClick={reload}
                            >
                              Recheck eligibility
                            </Button>
                          </div>
                        </fieldset>
                      </form>
                    )}
                  </>
                ) : !read.loading && !read.error ? (
                  <EmptyState title="Deletion review unavailable">
                    Only a current Super Admin can review this operation.
                  </EmptyState>
                ) : null}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
