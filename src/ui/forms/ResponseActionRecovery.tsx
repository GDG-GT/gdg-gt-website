import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import {
  inspectResponseWrite,
  submitResponseWrite,
  responseRetryReady,
  type ResponseIntent,
  type ResponseInspection,
} from "./response-write-api";
type Inspection = ResponseInspection;
export default function ResponseActionRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: ResponseIntent;
  onRecovered: (result: ResponseInspection) => void;
  onDenied: () => void;
  onBusy: (value: boolean) => void;
  onAbandon: () => void;
}) {
  const { isOnline } = useOnlineStatus(),
    [inspection, setInspection] = useState<Inspection>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [at, setAt] = useState("");
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
      callbacks.current.onBusy(false);
    }
  }, [isOnline]);
  const expired = () =>
      Date.now() < intent.startedAt ||
      Date.now() - intent.startedAt >= 47 * 60 * 60 * 1000,
    ready = responseRetryReady(intent, inspection);
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired()) {
      setInspection(undefined);
      setError(
        "The safe retry window ended. Inspect the current response before starting another privacy review.",
      );
      feedback.current?.focus();
      return;
    }
    if (retry && !ready) return;
    const controller = new AbortController();
    active.current = controller;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setError("");
    try {
      if (retry) {
        setInspection(undefined);
        const result = await submitResponseWrite(intent, controller.signal);
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered(result);
      } else {
        setInspection(undefined);
        const result = await inspectResponseWrite(intent, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed) callbacks.current.onRecovered(result);
      }
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      setInspection(undefined);
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        callbacks.current.onDenied();
        return;
      }
      setError(
        e instanceof Error
          ? e.message
          : "The original response outcome could not be checked.",
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
    <section aria-label="Unconfirmed response action" className="gt-form">
      <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"}>
        {error ||
          "The original response action is unconfirmed. New changes are paused until it is checked or you review stopping recovery."}
      </p>
      <p>{intent.description}</p>
      <p className="gt-helper">
        The originally reviewed response, revision, privacy state and request
        key stay fixed. Checking reads the current outcome; it never queues or
        removes a response.
      </p>
      {inspection && !inspection.committed && (
        <p role="status">
          {ready
            ? "No committed receipt was found. You can explicitly retry the identical original change after this current-access check."
            : "The target is no longer ready for this change. Review current responses before making another request."}
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
      <div className="gt-inline-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !isOnline || expired()}
          onClick={() => void run(false)}
        >
          Check original response outcome
        </Button>
        <Button
          type="button"
          disabled={busy || !isOnline || expired() || !ready}
          onClick={() => void run(true)}
        >
          Retry identical response action
        </Button>
      </div>
      <details>
        <summary>Review stopping recovery</summary>
        <p>
          The original change may already have committed. Stopping recovery does
          not undo it. Review the current response inventory before creating
          another request; no replacement is created automatically.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this response action
        </Button>
      </details>
    </section>
  );
}
