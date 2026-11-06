import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import {
  inspectExportWrite,
  submitExportWrite,
  type ExportIntent,
  type ExportJob,
} from "./form-export-api";
type Inspection = Awaited<ReturnType<typeof inspectExportWrite>>;
export default function FormExportWriteRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: ExportIntent;
  onRecovered: (job: ExportJob) => void;
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
    targetExpired = () =>
      intent.action === "cancel" &&
      !!inspection?.job &&
      Date.now() >= Date.parse(inspection.job.expiresAt),
    ready = !!inspection && !inspection.committed && inspection.canRetry;
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired() || (retry && targetExpired())) {
      setInspection(undefined);
      setError(
        "The safe retry window or target export lifetime ended. Inspect the current exports before starting another change.",
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
        const job = await submitExportWrite(intent, controller.signal);
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered(job);
      } else {
        setInspection(undefined);
        const result = await inspectExportWrite(intent, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed && result.job)
          callbacks.current.onRecovered(result.job);
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
          : "The original export outcome could not be checked.",
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
    <section aria-label="Unconfirmed export change" className="gt-form">
      <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"}>
        {error ||
          "The original export change is unconfirmed. New changes are paused until it is checked or you review stopping recovery."}
      </p>
      <p>{intent.description}</p>
      <p className="gt-helper">
        The original filters, selection, columns and request key stay fixed.
        Checking reads the current outcome; it never queues or removes an
        export.
      </p>
      {inspection && !inspection.committed && (
        <p role="status">
          {ready
            ? "No committed receipt was found. You can explicitly retry the identical original change after this current-access check."
            : "The target is no longer ready for this change. Review current exports before making another request."}
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
          Check original export outcome
        </Button>
        <Button
          type="button"
          disabled={busy || !isOnline || expired() || targetExpired() || !ready}
          onClick={() => void run(true)}
        >
          Retry identical export change
        </Button>
      </div>
      <details>
        <summary>Review stopping recovery</summary>
        <p>
          The original change may already have committed. Stopping recovery does
          not undo it. Review the current export inventory before creating
          another request; no replacement is created automatically.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this export change
        </Button>
      </details>
    </section>
  );
}
