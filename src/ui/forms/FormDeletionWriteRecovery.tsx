import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, Field } from "../primitives";
import {
  inspectDeletionWrite,
  submitDeletionWrite,
  deletionRetryReady,
  type DeletionIntent,
  type DeletionInspection,
} from "./form-deletion-api";
type Inspection = DeletionInspection;
export default function FormDeletionWriteRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: DeletionIntent;
  onRecovered: () => void;
  onDenied: () => void;
  onBusy: (value: boolean) => void;
  onAbandon: () => void;
}) {
  const { isOnline } = useOnlineStatus(),
    [inspection, setInspection] = useState<Inspection>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [at, setAt] = useState(""),
    [password, setPassword] = useState("");
  const pending = useRef(false),
    mounted = useRef(true),
    active = useRef<AbortController>(),
    feedback = useRef<HTMLParagraphElement>(null),
    callbacks = useRef({ onRecovered, onDenied, onBusy });
  callbacks.current = { onRecovered, onDenied, onBusy };
  useEffect(() => {
    mounted.current = true;
    feedback.current?.focus();
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!isOnline) {
      active.current?.abort();
      pending.current = false;
      setBusy(false);
      setInspection(undefined);
      setPassword("");
      callbacks.current.onBusy(false);
    }
  }, [isOnline]);
  const expired = () =>
      Date.now() < intent.startedAt ||
      Date.now() - intent.startedAt >= 47 * 60 * 60 * 1000,
    ready = deletionRetryReady(intent, inspection);
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired()) {
      setInspection(undefined);
      setError(
        "The safe retry window ended. Inspect the current form before starting another deletion review.",
      );
      feedback.current?.focus();
      return;
    }
    if (retry && !password) return;
    if (retry && !deletionRetryReady(intent, inspection)) {
      setInspection(undefined);
      setPassword("");
      setError(
        "The original deletion review is no longer current. Check the original outcome or obtain a new review after stopping recovery.",
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setError("");
    if (!retry) setPassword("");
    try {
      if (retry) {
        setInspection(undefined);
        const proof = password;
        setPassword("");
        await submitDeletionWrite(
          intent,
          proof,
          controller.signal,
        );
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered();
      } else {
        setInspection(undefined);
        const result = await inspectDeletionWrite(intent, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed) callbacks.current.onRecovered();
      }
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      setInspection(undefined);
      setPassword("");
      if (
        e instanceof ApiFailure &&
        [401, 403, 404].includes(e.status) &&
        e.code !== "PASSWORD_REQUIRED"
      ) {
        callbacks.current.onDenied();
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "The original permanent deletion outcome could not be checked.",
      );
    } finally {
      if (
        mounted.current &&
        active.current === controller &&
        !controller.signal.aborted
      ) {
        pending.current = false;
        setBusy(false);
        callbacks.current.onBusy(false);
        feedback.current?.focus();
      }
    }
  }
  return (
    <section
      aria-label="Unconfirmed permanent deletion change"
      className="gt-form"
    >
      <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"}>
        {error ||
          "The original permanent deletion change is unconfirmed. New changes are paused until it is checked or you review stopping recovery."}
      </p>
      <p>
        Irreversibly erase the originally reviewed archived form. Retention and
        hold rules still apply. Existing downloaded exports and delivered
        messages cannot be recalled.
      </p>
      <details>
        <summary>Review original deletion request</summary>
        <p>
          Form reference {intent.formId}; reviewed revision{" "}
          {JSON.parse(intent.body).revision}.
        </p>
        <p>
          The original form, session-bound review, confirmation, export
          acknowledgement and request key stay fixed. Passwords are never kept
          in the original request.
        </p>
        <p>
          The five-minute review expires{" "}
          {new Date(intent.reviewExpiresAt).toLocaleString()}. Accepted outcomes
          can still be checked afterwards; an expired unaccepted review cannot
          be retried.
        </p>
      </details>
      {inspection && !inspection.committed && (
        <p role="status">
          {ready
            ? "No committed receipt was found. You can explicitly retry the identical original change after this current-access, review-expiry and eligibility check. Enter your current password again to confirm an identical retry."
            : "The review expired or the form changed. Stop recovery, then obtain a new current eligibility review before requesting deletion again."}
          {at && (
            <>
              {" "}
              Checked <time dateTime={at}>{new Date(at).toLocaleString()}</time>
              .
            </>
          )}
        </p>
      )}
      {!isOnline && (
        <p role="status">
          Reconnect, then check the original outcome again. No retry runs
          automatically.
        </p>
      )}
      {ready && (
        <Field label="Current password for identical deletion retry">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={busy || !isOnline}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <div className="gt-inline-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !isOnline || expired()}
          onClick={() => void run(false)}
        >
          Check original permanent deletion outcome
        </Button>
        <Button
          type="button"
          disabled={busy || !isOnline || expired() || !ready || !password}
          onClick={() => void run(true)}
        >
          Retry identical permanent deletion change
        </Button>
      </div>
      <details>
        <summary>Review stopping recovery</summary>
        <p>
          The original change may already have committed. Stopping recovery does
          not undo it. Recheck the current form and deletion eligibility before
          creating another request; no new review or deletion is requested
          automatically.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this permanent deletion change
        </Button>
      </details>
    </section>
  );
}
