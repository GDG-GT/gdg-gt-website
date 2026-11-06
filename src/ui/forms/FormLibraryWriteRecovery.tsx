import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import {
  inspectFormLibraryWrite,
  submitFormLibraryWrite,
  formLibraryWriteLabel,
  type FormLibraryIntent,
} from "./api";
import type { PreviewForm } from "./store";
type Inspection = Awaited<ReturnType<typeof inspectFormLibraryWrite>>;
export default function FormLibraryWriteRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: FormLibraryIntent;
  onRecovered: (form: PreviewForm) => void;
  onDenied: () => void;
  onBusy: (busy: boolean) => void;
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
      Date.now() - intent.startedAt >= 47 * 60 * 60 * 1000 ||
      Date.now() < intent.startedAt,
    originalRevision = intent.body.revision,
    required =
      intent.action === "duplicate"
        ? "view"
        : intent.action === "state"
          ? "publish"
          : "delete",
    ready =
      !!inspection &&
      !inspection.committed &&
      (intent.action === "create"
        ? inspection.canCreate
        : !!inspection.form &&
          inspection.form.id === intent.sourceId &&
          inspection.form.revision === originalRevision &&
          inspection.form.actions?.includes(required) &&
          (intent.action !== "duplicate" || inspection.canCreate) &&
          (intent.action !== "restore" ||
            inspection.form.status === "Archived") &&
          (intent.action !== "archive" ||
            inspection.form.status !== "Archived") &&
          (intent.action !== "state" ||
            (inspection.form.status !== "Archived" &&
              inspection.form.versions.length > 0))),
    label = formLibraryWriteLabel(intent);
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired()) {
      setInspection(undefined);
      setError(
        "The safe retry window ended. Inspect the current library before starting a new change.",
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
        const form = await submitFormLibraryWrite(intent, controller.signal);
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered(form);
      } else {
        setInspection(undefined);
        const result = await inspectFormLibraryWrite(intent, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed && result.form)
          callbacks.current.onRecovered(result.form);
      }
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      setInspection(undefined);
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        callbacks.current.onDenied();
        return;
      }
      setError(
        e instanceof TypeError
          ? "The connection was interrupted. Recheck the original change before retrying."
          : e instanceof Error
            ? e.message
            : "The outcome could not be checked.",
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
      className="gt-form gt-form-library-recovery"
      aria-label="Unconfirmed form library change"
    >
      <h2>Recheck the original {label} change</h2>
      <p>
        The {label} request for “{intent.snapshot.title}” may already have
        completed. New changes are paused. Checking its outcome does not create,
        duplicate, publish or change any form.
      </p>
      <p>
        {intent.action === "create" || intent.action === "duplicate"
          ? "This request creates one private draft. Responses, published versions and collaborator access are not copied."
          : intent.action === "archive"
            ? "Archiving stops active use and retains responses and published history."
            : intent.action === "restore"
              ? "Restoring creates a private draft and does not reopen submissions."
              : intent.body.state === "Closed"
                ? "Closing stops new submissions while retaining responses and published history."
                : "Reopening uses the existing published questions, access rules, schedule and response limit."}
      </p>
      {originalRevision && (
        <p>
          Original saved revision {originalRevision} · {intent.snapshot.status}.
        </p>
      )}
      <p
        id="form-library-recovery-status"
        ref={feedback}
        tabIndex={-1}
        role="status"
      >
        {!isOnline
          ? "You are offline. Recheck after reconnecting."
          : expired()
            ? "The safe retry window ended. Inspect the current library before starting another change."
            : busy
              ? "Checking the original change…"
              : inspection && ready
                ? "No receipt was found and the original context is still available. You can explicitly retry the exact original request."
                : inspection
                  ? "The source revision, state or permissions changed. Exact retry is paused; review the current library."
                  : "The original outcome is unconfirmed. No automatic retry will run."}
      </p>
      {at && (
        <p>
          Last successful outcome check:{" "}
          <time dateTime={at}>{new Date(at).toLocaleString()}</time>.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="gt-inline-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !isOnline || expired()}
          onClick={() => void run(false)}
        >
          Recheck original library change
        </Button>
        {ready && (
          <Button
            type="button"
            disabled={busy || !isOnline || expired()}
            onClick={() => void run(true)}
          >
            Retry this exact {label} request
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={onAbandon}
        >
          Review stopping recovery
        </Button>
      </div>
    </section>
  );
}
