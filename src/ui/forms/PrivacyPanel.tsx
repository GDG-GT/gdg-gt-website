import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Button, EmptyState, Field } from "../primitives";
import {
  privacyPath,
  preparePrivacyWrite,
  submitPrivacyWrite,
  type PrivacyState,
  type PrivacyIntent,
} from "./form-privacy-api";
import FormPrivacyWriteRecovery from "./FormPrivacyWriteRecovery";
type Props = {
  formId: string;
  responseId?: string;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
  onSaved: () => void;
};
export default function PrivacyPanel(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <PrivacyWorkspace
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}:${props.responseId || "form"}`}
      {...props}
    />
  );
}
function PrivacyWorkspace({ formId, responseId, ...handlers }: Props) {
  const [state, setState] = useState<PrivacyState>(),
    [held, setHeld] = useState(false),
    [reason, setReason] = useState(""),
    [draftDays, setDraftDays] = useState(7),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [readRetry, setReadRetry] = useState(0),
    [blocked, setBlocked] = useState(""),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [intent, setIntent] = useState<PrivacyIntent>(),
    [uncertain, setUncertain] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [stale, setStale] = useState(false);
  const callbacks = useRef(handlers),
    intentRef = useRef<PrivacyIntent>(),
    feedback = useRef<HTMLParagraphElement>(null),
    { isOnline } = useOnlineStatus(),
    safety = useNavigationSafety(),
    path = privacyPath(formId, responseId),
    read = usePrivateRead<PrivacyState>(!blocked ? path : undefined, readRetry),
    { busy, begin, current, finish, cancel } = usePrivateMutation(path),
    pending = busy || recoveryBusy;
  callbacks.current = handlers;
  const revision = (value: PrivacyState) =>
    responseId ? value.responseRevision : value.revision;
  const matches = (value: PrivacyState | undefined) =>
    !!value &&
    value.formId === formId &&
    (responseId
      ? value.responseId === responseId &&
        Number.isInteger(value.responseRevision) &&
        value.responseRevision! >= 0 &&
        typeof value.responseHeld === "boolean" &&
        typeof value.responseReason === "string" &&
        typeof value.effectiveResponseHold === "boolean"
      : !value.responseId) &&
    Number.isInteger(value.revision) &&
    value.revision >= 0 &&
    typeof value.held === "boolean" &&
    typeof value.reason === "string" &&
    Number.isInteger(value.draftDays) &&
    value.draftDays >= 1 &&
    value.draftDays <= 30 &&
    typeof value.canRelease === "boolean" &&
    [
      value.totalResponses,
      value.heldResponses,
      value.dueResponses,
      value.pendingFiles,
    ].every((count) => Number.isInteger(count) && count >= 0);
  const baselineHeld = responseId ? !!state?.responseHeld : !!state?.held,
    baselineReason = responseId
      ? state?.responseReason || ""
      : state?.reason || "",
    changed =
      !!state &&
      !!read.data &&
      (revision(state) !== revision(read.data) ||
        state.revision !== read.data.revision),
    dirty =
      !!intent ||
      (!!state &&
        (held !== baselineHeld ||
          reason !== baselineReason ||
          (!responseId && draftDays !== state.draftDays) ||
          !!password ||
          !!confirmation));
  const writable =
    !!state &&
    matches(read.data) &&
    !blocked &&
    !read.denied &&
    !read.loading &&
    !read.error &&
    isOnline &&
    !needsRecheck &&
    !pending &&
    !intent &&
    !stale &&
    !changed;
  useDraftGuard(dirty, {
    busy: pending,
    label: intent
      ? "Unconfirmed privacy review; the original hold may already have changed"
      : "Form retention and operational hold review",
  });
  useEffect(() => {
    callbacks.current.onStateChange({ dirty, busy: pending });
  }, [dirty, pending]);
  const { clear } = read;
  function resetProposal() {
    intentRef.current = undefined;
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setPassword("");
    setConfirmation("");
    setStale(false);
  }
  function deny(message: string) {
    cancel();
    clear();
    setState(undefined);
    setHeld(false);
    setReason("");
    setDraftDays(7);
    resetProposal();
    setError("");
    setNotice("");
    setBlocked(message);
  }
  useEffect(() => {
    const clearSession = () =>
      deny(
        "Your session changed. Recheck current access before reopening private retention settings.",
      );
    const offline = () => {
      setNeedsRecheck(true);
      setPassword("");
      cancel();
      if (intentRef.current) setUncertain(true);
    };
    window.addEventListener("gdg:session-cleared", clearSession);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", clearSession);
      window.removeEventListener("offline", offline);
    };
    // Only stable cancellation/read-clear capabilities belong to this listener.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel, clear]);
  useEffect(() => {
    if (read.denied) {
      deny(
        "Private retention access is unavailable. Settings and proposed values have been cleared.",
      );
      return;
    }
    if (read.data && !matches(read.data)) {
      deny(
        "This privacy result did not match the current form/response. Reload current access.",
      );
      return;
    }
    if (read.data && !state) {
      setState(read.data);
      setHeld(responseId ? !!read.data.responseHeld : read.data.held);
      setReason(responseId ? read.data.responseReason || "" : read.data.reason);
      setDraftDays(read.data.draftDays);
    }
    // New current data initializes empty state; it never overwrites a local proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read.data, read.denied, state, responseId]);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  function reloadSaved() {
    clear();
    setState(undefined);
    setHeld(false);
    setReason("");
    setDraftDays(7);
    resetProposal();
    setError("");
    setBlocked("");
    setNeedsRecheck(false);
    setReadRetry((v) => v + 1);
  }
  function retryRead() {
    setNeedsRecheck(false);
    setReadRetry((v) => v + 1);
    document.getElementById("workspace-content")?.focus();
  }
  function complete(result: { revision: number }) {
    resetProposal();
    setNotice(
      `Privacy review confirmed at policy revision ${result.revision}. Existing response retention deadlines were not rewritten.`,
    );
    clear();
    setState(undefined);
    setNeedsRecheck(false);
    setReadRetry((v) => v + 1);
    callbacks.current.onSaved();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !writable ||
      !state ||
      !password ||
      reason.trim().length < 5 ||
      confirmation !== `HOLD ${responseId || formId}`
    )
      return;
    const controller = begin();
    if (!controller) return;
    let packet: PrivacyIntent;
    try {
      packet = preparePrivacyWrite(state, {
        revision: revision(state)!,
        held,
        reason,
        confirmation,
        ...(!responseId ? { draftDays } : {}),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reload privacy settings before reviewing.",
      );
      finish(controller);
      return;
    }
    intentRef.current = packet;
    setIntent(packet);
    setError("");
    setNotice("");
    try {
      const result = await submitPrivacyWrite(
        packet,
        password,
        controller.signal,
      );
      if (current(controller)) complete(result);
    } catch (e) {
      if (!current(controller)) return;
      if (
        e instanceof ApiFailure &&
        [401, 403, 404].includes(e.status) &&
        e.code !== "PASSWORD_REQUIRED"
      )
        deny(
          "Privacy authorization changed. Private settings and the proposed review have been cleared.",
        );
      else if (
        e instanceof ApiFailure &&
        [400, 403, 409, 429].includes(e.status)
      ) {
        intentRef.current = undefined;
        setIntent(undefined);
        setError(e.message);
        if (e.code !== "PASSWORD_REQUIRED") setStale(true);
      } else setUncertain(true);
    } finally {
      if (current(controller)) setPassword("");
      finish(controller);
    }
  }
  if (blocked || read.denied)
    return (
      <EmptyState
        title="Privacy access needs to be rechecked"
        action={
          <Button
            variant="secondary"
            disabled={!isOnline || pending}
            onClick={reloadSaved}
          >
            Recheck private retention access
          </Button>
        }
      >
        {blocked || "Private settings have been cleared."}
      </EmptyState>
    );
  if (!state)
    return (
      <>
        {notice && <p role="status">{notice}</p>}
        {read.error ? (
          <EmptyState
            title="Privacy review unavailable"
            action={
              <Button
                variant="secondary"
                disabled={!isOnline || pending}
                onClick={retryRead}
              >
                Retry retention settings
              </Button>
            }
          >
            {read.error}
          </EmptyState>
        ) : (
          <div role="status" aria-label="Loading retention settings">
            <div className="gt-skeleton gt-detail-skeleton" />
            <span className="sr-only">
              Checking retention, holds and current access…
            </span>
          </div>
        )}
      </>
    );
  const reference = `HOLD ${responseId || formId}`;
  return (
    <form className="gt-form" onSubmit={submit}>
      {uncertain && intent && (
        <FormPrivacyWriteRecovery
          key={intent.key}
          intent={intent}
          onRecovered={complete}
          onBusy={setRecoveryBusy}
          onDenied={() =>
            deny(
              "Current privacy access changed. Private settings and the proposed review have been cleared.",
            )
          }
          onAbandon={() => reloadSaved()}
        />
      )}
      <details open={!uncertain}>
        <summary>
          {uncertain
            ? "Review frozen original privacy settings"
            : "Privacy settings and consequences"}
        </summary>
        <div className="gt-form">
          <p>
            Operational holds retain responses and their attachments without
            extending the published retention promise. A hold blocks redaction,
            deletion and scheduled response expiry. Only an Admin or Super Admin
            can release an existing hold.
          </p>
          {responseId ? (
            <>
              <p>
                <strong>Response deadline:</strong>{" "}
                {state.responseExpiresAt
                  ? new Date(state.responseExpiresAt).toLocaleString()
                  : "Unavailable"}
                .
              </p>
              <p role="status">
                {state.effectiveResponseHold
                  ? "This response is retained under an operational hold."
                  : "No operational hold currently applies to this response."}
              </p>
              {state.held && (
                <p className="gt-helper">
                  A form-wide hold is also active. Releasing only this
                  individual hold does not release the form-wide hold.
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                {state.totalResponses} retained responses ·{" "}
                {state.heldResponses} individual holds · {state.dueResponses}{" "}
                currently eligible for scheduled expiry.
              </p>
              <p className="gt-helper">
                Next unheld deadline:{" "}
                {state.nextExpiry
                  ? new Date(state.nextExpiry).toLocaleString()
                  : "No retained unheld responses"}
                . {state.pendingFiles} files await physical cleanup.
              </p>
              <p className="gt-helper">
                Each response keeps its original published version’s deadline.
                Republishing a longer or shorter policy does not rewrite
                historical deadlines. A hold cannot recover content already
                erased or recall downloaded copies.
              </p>
            </>
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
          {notice && <p role="status">{notice}</p>}
          {(read.error ||
            read.loading ||
            needsRecheck ||
            !isOnline ||
            stale ||
            changed) && (
            <section aria-label="Privacy read status" className="gt-form">
              {read.loading && (
                <p role="status">Checking current privacy settings…</p>
              )}
              {read.error && <p role="alert">{read.error}</p>}
              {read.at && (
                <p>
                  Last successful privacy read:{" "}
                  <time dateTime={read.at}>
                    {new Date(read.at).toLocaleString()}
                  </time>
                  .
                </p>
              )}
              {(!isOnline || needsRecheck) && (
                <p role="status">
                  Changes are paused. Reconnect and explicitly recheck current
                  privacy settings.
                </p>
              )}
              {(changed || stale) && (
                <p role="alert">
                  The policy revision or previous result needs a new review.
                  Your proposed values are retained; reloading discards this
                  proposal.
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={!isOnline || pending || !!intent}
                onClick={() => void retryRead()}
              >
                Recheck privacy settings
              </Button>
            </section>
          )}

          {(changed || stale) && !intent && (
            <Button
              type="button"
              variant="secondary"
              disabled={!isOnline || pending}
              onClick={() => safety.request(() => reloadSaved())}
            >
              Reload saved privacy settings and discard this review
            </Button>
          )}
          <fieldset className="gt-form gt-plain-fieldset" disabled={!writable}>
            <label className="gt-check">
              <input
                type="checkbox"
                checked={held}
                disabled={baselineHeld && !state.canRelease}
                onChange={(e) => {
                  setHeld(e.target.checked);
                  setConfirmation("");
                }}
              />
              {responseId
                ? "Retain this response under an individual hold"
                : "Retain all responses under a form-wide hold"}
            </label>
            <Field
              label="Private operational reason"
              hint="5–500 characters. Explain the hold or release without including answers or unnecessary personal data."
            >
              <textarea
                rows={3}
                maxLength={500}
                minLength={5}
                required
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setConfirmation("");
                }}
              />
            </Field>
            {!responseId && (
              <Field
                label="Incomplete draft retention (days)"
                hint="1–30 days; applies to new save-and-resume drafts only. Existing private links retain their original expiry."
              >
                <input
                  type="number"
                  min={1}
                  max={30}
                  required
                  value={draftDays}
                  onChange={(e) => {
                    setDraftDays(Number(e.target.value));
                    setConfirmation("");
                  }}
                />
              </Field>
            )}
            <Field label="Hold confirmation" hint={`Type ${reference}`}>
              <input
                autoComplete="off"
                spellCheck={false}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              disabled={
                !writable ||
                !password ||
                reason.trim().length < 5 ||
                confirmation !== reference
              }
            >
              {busy ? "Saving privacy review…" : "Confirm privacy review"}
            </Button>
          </fieldset>
        </div>
      </details>
    </form>
  );
}
