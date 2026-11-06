import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, Field } from "../primitives";
import {
  inspectPrivacyWrite,
  submitPrivacyWrite,
  privacyRetryWindow,
  type PrivacyIntent,
  type PrivacyInspection,
  type PrivacyReceipt,
} from "./privacy-write";
export default function PrivacyWriteRecovery({
  intent,
  onConfirmed,
  onDenied,
  onBusy,
  onStop,
}: {
  intent: PrivacyIntent;
  onConfirmed: (receipt: PrivacyReceipt) => void;
  onDenied: () => void;
  onBusy: (busy: boolean) => void;
  onStop: () => void;
}) {
  const { isOnline } = useOnlineStatus(),
    [inspection, setInspection] = useState<PrivacyInspection>(),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [at, setAt] = useState(""),
    active = useRef<AbortController>(),
    pending = useRef(false),
    mounted = useRef(true),
    status = useRef<HTMLParagraphElement>(null),
    callbacks = useRef({ onConfirmed, onDenied, onBusy });
  callbacks.current = { onConfirmed, onDenied, onBusy };
  useEffect(() => {
    mounted.current = true;
    status.current?.focus();
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
      setPassword("");
      setInspection(undefined);
      callbacks.current.onBusy(false);
    }
  }, [isOnline]);
  async function run(retry: boolean) {
    if (pending.current || !navigator.onLine) return;
    if (!privacyRetryWindow(intent)) {
      setInspection(undefined);
      setError(
        "The safe privacy recovery window ended. Review stopping recovery and inspect the current privacy records before creating another request.",
      );
      return;
    }
    if (
      retry &&
      (!inspection?.canRetry ||
        inspection.committed ||
        (intent.needsProof && !password))
    )
      return;
    const c = new AbortController(),
      proof = password;
    active.current = c;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setPassword("");
    setInspection(undefined);
    setError("");
    try {
      if (retry) {
        const value = await submitPrivacyWrite(intent, c.signal, proof);
        if (mounted.current && !c.signal.aborted)
          callbacks.current.onConfirmed(value);
      } else {
        const value = await inspectPrivacyWrite(intent, c.signal);
        if (!mounted.current || c.signal.aborted) return;
        setInspection(value);
        setAt(new Date().toISOString());
        if (value.committed && value.receipt)
          callbacks.current.onConfirmed(value.receipt);
      }
    } catch (e) {
      if (!mounted.current || c.signal.aborted) return;
      if (
        e instanceof ApiFailure &&
        (e.status === 401 ||
          e.status === 404 ||
          (e.status === 403 && e.code !== "PASSWORD_REQUIRED"))
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
      if (mounted.current && active.current === c && !c.signal.aborted) {
        pending.current = false;
        setBusy(false);
        callbacks.current.onBusy(false);
        status.current?.focus();
      }
    }
  }
  return (
    <section
      className="gt-panel gt-form"
      role="region"
      aria-label="Unconfirmed privacy request"
    >
      <h2>Check the original privacy request</h2>
      <p role="status" ref={status} tabIndex={-1}>
        The original privacy {intent.action} request is unconfirmed. Its exact
        fields, scope, revision and key are preserved only in this open tab. New
        changes are paused until its outcome is checked.
      </p>
      {!isOnline && (
        <p role="status">
          Reconnect, then explicitly check the original outcome. No save retries
          automatically.
        </p>
      )}
      <div className="gt-button-row">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !isOnline}
          onClick={() => void run(false)}
        >
          Check original privacy outcome
        </Button>
      </div>
      {inspection && !inspection.committed && (
        <p role="status">
          {inspection.canRetry
            ? "No committed receipt was found. You may explicitly retry the identical original request."
            : "No committed receipt was found, but the current record or access state prevents a safe retry. Review stopping recovery before inspecting current records."}
        </p>
      )}
      {intent.needsProof && inspection?.canRetry && (
        <Field label="Current password for original privacy retry" required>
          <input
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            disabled={busy || !isOnline}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={
          busy ||
          !isOnline ||
          !inspection?.canRetry ||
          inspection.committed ||
          (intent.needsProof && !password)
        }
        onClick={() => void run(true)}
      >
        Retry identical privacy request
      </Button>
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
        <summary>Review stopping privacy recovery</summary>
        <p>
          The original request may already have succeeded. Stopping does not
          undo it or confirm its outcome. Proposed private fields will be
          cleared; another change can overwrite later data.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onStop}
        >
          Stop tracking this privacy request
        </Button>
      </details>
    </section>
  );
}
