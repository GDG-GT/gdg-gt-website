import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, Field } from "../primitives";
import {
  inspectPrivacyWrite,
  submitPrivacyWrite,
  privacyRetryReady,
  type PrivacyIntent,
  type PrivacyInspection,
} from "./form-privacy-api";
type Inspection = PrivacyInspection;
export default function FormPrivacyWriteRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: PrivacyIntent;
  onRecovered: (result: { revision: number }) => void;
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
    ready = privacyRetryReady(intent, inspection);
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired()) {
      setInspection(undefined);
      setError(
        "The safe retry window ended. Inspect the current privacy settings before starting another privacy review.",
      );
      feedback.current?.focus();
      return;
    }
    if (retry && (!ready || !password)) return;
    const controller = new AbortController();
    active.current = controller;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setError("");
    try {
      if (retry) {
        setInspection(undefined);
        const result = await submitPrivacyWrite(
          intent,
          password,
          controller.signal,
        );
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered(result);
      } else {
        setInspection(undefined);
        const result = await inspectPrivacyWrite(intent, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed)
          callbacks.current.onRecovered({ revision: result.receipt!.revision });
      }
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      setInspection(undefined);
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
          : "The original privacy outcome could not be checked.",
      );
    } finally {
      if (mounted.current) setPassword("");
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
    <section aria-label="Unconfirmed privacy review" className="gt-form">
      <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"}>
        {error ||
          "The original privacy review is unconfirmed. New changes are paused until it is checked or you review stopping recovery."}
      </p>
      <p>
        {intent.responseId ? "Response" : "Form"}{" "}
        {intent.responseId || intent.formId} · original policy revision{" "}
        {intent.revision}.{" "}
        {intent.held
          ? "Retain under an operational hold."
          : "Release this target’s hold or update its retention settings."}{" "}
        Existing response deadlines stay unchanged.
      </p>
      <p className="gt-helper">
        The originally reviewed privacy target, policy revision, choice and
        request key stay fixed. Checking reads the current outcome; it never
        queues or changes a hold.
      </p>
      {inspection && !inspection.committed && (
        <p role="status">
          {ready
            ? "No committed receipt was found. You can explicitly retry the identical original change after this current-access check."
            : "The target is no longer ready for this change. Reload current privacy settings before making another request."}
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
        <Field
          label="Current password for identical retry"
          hint="Enter fresh proof for this original change. Passwords are never kept in the retry intent."
        >
          <input
            type="password"
            autoComplete="current-password"
            disabled={busy || !isOnline}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          Check original privacy outcome
        </Button>
        <Button
          type="button"
          disabled={busy || !isOnline || expired() || !ready || !password}
          onClick={() => void run(true)}
        >
          Retry identical privacy review
        </Button>
      </div>
      <details>
        <summary>Review stopping recovery</summary>
        <p>
          The original change may already have committed. Stopping recovery does
          not undo it. Reload current privacy settings before creating another
          request; no replacement is created automatically.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this privacy review
        </Button>
      </details>
    </section>
  );
}
