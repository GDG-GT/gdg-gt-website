import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import {
  inspectRespondentWrite,
  submitRespondentWrite,
  respondentRetryWindow,
  type RespondentWriteIntent,
  type RespondentWriteInspection,
  type RespondentWriteReceipt,
} from "./respondent-write";
export default function RespondentWriteRecovery({
  intent,
  onConfirmed,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: RespondentWriteIntent;
  onConfirmed: (receipt: RespondentWriteReceipt) => void;
  onDenied: () => void;
  onBusy: (busy: boolean) => void;
  onAbandon: () => void;
}) {
  const { isOnline } = useOnlineStatus(),
    [inspection, setInspection] = useState<RespondentWriteInspection>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [at, setAt] = useState(""),
    mounted = useRef(true),
    pending = useRef(false),
    active = useRef<AbortController>(),
    feedback = useRef<HTMLParagraphElement>(null),
    callbacks = useRef({ onConfirmed, onDenied, onBusy });
  callbacks.current = { onConfirmed, onDenied, onBusy };
  const name =
    intent.action === "drafts"
      ? "draft save"
      : intent.action === "edits"
        ? "response edit"
        : "submission";
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
      callbacks.current.onBusy(false);
    }
  }, [isOnline]);
  async function run(retry: boolean) {
    if (pending.current || !navigator.onLine) return;
    if (!respondentRetryWindow(intent)) {
      setInspection(undefined);
      setError(
        "The safe original-request recovery window ended. Stop tracking this request and contact the chapter if you need its outcome checked.",
      );
      feedback.current?.focus();
      return;
    }
    if (retry && (!inspection || inspection.committed || !inspection.canRetry))
      return;
    const c = new AbortController();
    active.current = c;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setError("");
    setInspection(undefined);
    try {
      if (retry) {
        const value = await submitRespondentWrite(intent, c.signal);
        if (mounted.current && !c.signal.aborted)
          callbacks.current.onConfirmed(value);
      } else {
        const value = await inspectRespondentWrite(intent, c.signal);
        if (!mounted.current || c.signal.aborted) return;
        setInspection(value);
        setAt(new Date().toISOString());
        if (value.committed && value.receipt)
          callbacks.current.onConfirmed(value.receipt);
      }
    } catch (e) {
      if (!mounted.current || c.signal.aborted) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        callbacks.current.onDenied();
        return;
      }
      setError(
        e instanceof TypeError
          ? "The connection was interrupted. Check the original outcome again."
          : e instanceof Error
            ? e.message
            : "The original form outcome could not be checked.",
      );
    } finally {
      if (mounted.current && active.current === c && !c.signal.aborted) {
        pending.current = false;
        setBusy(false);
        callbacks.current.onBusy(false);
        feedback.current?.focus();
      }
    }
  }
  return (
    <section
      role="region"
      aria-label="Unconfirmed form request"
      className="gt-respondent-write-recovery"
    >
      <h2>Check your {name}</h2>
      <p ref={feedback} role="status" tabIndex={-1}>
        The original {name} is unconfirmed. Your answers and request are
        preserved in this open tab. New changes are paused until its outcome is
        checked.
      </p>
      {!isOnline && (
        <p role="status">
          Reconnect, then explicitly check the original outcome. Nothing is
          submitted automatically.
        </p>
      )}
      <div className="gt-button-row">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !isOnline}
          onClick={() => void run(false)}
        >
          Check original {name} outcome
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={
            busy || !isOnline || !inspection?.canRetry || inspection.committed
          }
          onClick={() => void run(true)}
        >
          Retry original {name}
        </Button>
      </div>
      {inspection && !inspection.committed && (
        <p role="status">
          {inspection.canRetry
            ? "No committed receipt was found. You may explicitly retry the same original request; its answers, recipient choices and key stay fixed."
            : "No committed receipt was found, but current form or saved-response state prevents a safe retry. Reopen the form or contact the chapter after reviewing stopping recovery."}
        </p>
      )}
      {at && (
        <p className="gt-helper">
          Last original-outcome check:{" "}
          <time dateTime={at}>{new Date(at).toLocaleString()}</time>.
        </p>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      <details>
        <summary>Review stopping form recovery</summary>
        <p>
          The original request may already have succeeded. Stopping cannot
          cancel it or confirm its outcome. The answers and private capabilities
          in this tab will be cleared. Submitting another response later could
          create a duplicate.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this form request
        </Button>
      </details>
    </section>
  );
}
