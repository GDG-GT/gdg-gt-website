import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import { formsApi } from "./api";
import type { PreviewForm } from "./store";
export type FormWriteIntent = {
  action: "draft" | "publish";
  snapshot: PreviewForm;
  key: string;
  startedAt: number;
};
type Inspection = Awaited<ReturnType<typeof formsApi.inspectWrite>>;
const retryWindow = 47 * 60 * 60 * 1000;
export default function FormWriteRecovery({
  intent,
  onReconciled,
  onDenied,
  onBusy,
}: {
  intent: FormWriteIntent;
  onReconciled: (form: PreviewForm) => void;
  onDenied: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const { isOnline } = useOnlineStatus();
  const [inspection, setInspection] = useState<Inspection>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [at, setAt] = useState("");
  const active = useRef<AbortController>(),
    pending = useRef(false),
    mounted = useRef(true),
    feedback = useRef<HTMLParagraphElement>(null),
    callbacks = useRef({ onReconciled, onDenied, onBusy });
  callbacks.current = { onReconciled, onDenied, onBusy };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!isOnline) {
      active.current?.abort();
      setInspection(undefined);
      pending.current = false;
      setBusy(false);
      callbacks.current.onBusy(false);
    }
  }, [isOnline]);
  const expired = () =>
    Date.now() - intent.startedAt >= retryWindow ||
    Date.now() < intent.startedAt;
  const currentAction = intent.action === "publish" ? "publish" : "edit";
  const ready =
    !!inspection &&
    !inspection.committed &&
    inspection.form.revision === intent.snapshot.revision &&
    inspection.form.status !== "Archived" &&
    inspection.form.actions?.includes(currentAction);
  async function run(retry: boolean) {
    if (
      pending.current ||
      !isOnline ||
      !navigator.onLine ||
      expired() ||
      (retry && !ready)
    )
      return;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setError("");
    const controller = new AbortController();
    active.current = controller;
    try {
      if (!retry) {
        setInspection(undefined);
        const result = await formsApi.inspectWrite(
          intent.snapshot.id,
          intent.action,
          intent.key,
          controller.signal,
        );
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed) callbacks.current.onReconciled(result.form);
      } else {
        // Frozen normalized definition, original revision and original key.
        const form = await formsApi[
          intent.action === "draft" ? "save" : "publish"
        ](intent.snapshot, controller.signal, intent.key);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection({ committed: true, form });
        setAt(new Date().toISOString());
        callbacks.current.onReconciled(form);
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
          ? "The connection was interrupted. Recheck the original outcome before retrying."
          : e instanceof Error
            ? e.message
            : "The write outcome could not be checked. Recheck before retrying.",
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
      className="gt-form gt-builder-write-recovery"
      aria-label="Unconfirmed form write recovery"
    >
      <h2>
        {inspection?.committed
          ? intent.action === "draft"
            ? "Original draft save confirmed"
            : "Original publication confirmed"
          : intent.action === "draft"
            ? "Recheck the unconfirmed draft save"
            : "Recheck the unconfirmed publication"}
      </h2>
      <p>
        The {intent.action === "draft" ? "save" : "publication"} for “
        {intent.snapshot.title}” may already have completed. Autosave stays
        paused. Checking the outcome does not write or publish anything.
      </p>
      <p>
        Original saved revision {intent.snapshot.revision} ·{" "}
        {intent.snapshot.fields.length} fields ·{" "}
        {intent.snapshot.settings.access} access.
      </p>
      {intent.action === "publish" && (
        <p>
          A retry can publish one immutable version of these saved questions.
          Existing responses keep their original version.
        </p>
      )}
      <p ref={feedback} tabIndex={-1} role="status">
        {!isOnline
          ? "You are offline. Recheck the outcome after reconnecting."
          : expired()
            ? "The safe retry window ended. Inspect the saved draft and published history before starting another change."
            : busy
              ? "Checking the original change…"
              : inspection?.committed
                ? "The original change is confirmed. Review the current saved draft before resuming edits."
                : inspection && ready
                  ? "No receipt was found and the original revision is still current. You can explicitly retry the exact original change."
                  : inspection
                    ? "The saved revision or permissions changed. Exact retry is paused; inspect the saved draft and published history."
                    : "The outcome has not been confirmed. No automatic retry will run."}
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
          Recheck original write outcome
        </Button>
        {ready && (
          <Button
            type="button"
            disabled={busy || !isOnline || expired()}
            onClick={() => void run(true)}
          >
            {intent.action === "draft"
              ? "Retry this exact draft save"
              : "Retry this exact publication"}
          </Button>
        )}
      </div>
    </section>
  );
}
