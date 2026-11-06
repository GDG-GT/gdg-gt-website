import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import {
  inspectCollaboratorWrite,
  submitCollaboratorWrite,
  collaboratorRetryReady,
  type CollaboratorIntent,
  type CollaboratorInspection,
} from "./form-collaborator-api";
type Inspection = CollaboratorInspection;
export default function FormCollaboratorWriteRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: CollaboratorIntent;
  onRecovered: (result: CollaboratorInspection) => void;
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
    ready = collaboratorRetryReady(intent, inspection);
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired()) {
      setInspection(undefined);
      setError(
        "The safe retry window ended. Inspect the current collaborator before starting another access review.",
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
        const result = await submitCollaboratorWrite(intent, controller.signal);
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered(result);
      } else {
        setInspection(undefined);
        const result = await inspectCollaboratorWrite(
          intent,
          controller.signal,
        );
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
          : "The original collaborator outcome could not be checked.",
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
    <section aria-label="Unconfirmed collaborator change" className="gt-form">
      <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"}>
        {error ||
          "The original collaborator change is unconfirmed. New changes are paused until it is checked or you review stopping recovery."}
      </p>
      <p>
        {intent.action === "save" ? "Save" : "Remove"} explicit collaborator
        access for {intent.label}.
      </p>
      <details>
        <summary>Review original collaborator change</summary>
        <p>
          Form revision {JSON.parse(intent.body).formRevision}; grant revision{" "}
          {JSON.parse(intent.body).grantRevision}.
        </p>
        {intent.action === "save" && (
          <p>Actions: {JSON.parse(intent.body).actions.join(", ")}</p>
        )}
        <p>
          The originally reviewed account, grant generation, revisions, actions
          and request key stay fixed. Checking reads the outcome and current
          authority.
        </p>
      </details>
      {inspection && !inspection.committed && (
        <p role="status">
          {ready
            ? "No committed receipt was found. You can explicitly retry the identical original change after this current-access and revision check."
            : "The target is no longer ready for this change. Reload current collaborators before making another request."}
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
          Check original collaborator outcome
        </Button>
        <Button
          type="button"
          disabled={busy || !isOnline || expired() || !ready}
          onClick={() => void run(true)}
        >
          Retry identical collaborator change
        </Button>
      </div>
      <details>
        <summary>Review stopping recovery</summary>
        <p>
          The original change may already have committed. Stopping recovery does
          not undo it. Reload the current collaborator inventory before creating
          another request; no replacement is created automatically.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this collaborator change
        </Button>
      </details>
    </section>
  );
}
