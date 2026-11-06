import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import {
  inspectLinkWrite,
  submitLinkWrite,
  linkRetryReady,
  type LinkIntent,
  type LinkInspection,
} from "./form-link-api";
type Inspection = LinkInspection;
export default function FormLinkWriteRecovery({
  intent,
  onRecovered,
  onDenied,
  onBusy,
  onAbandon,
}: {
  intent: LinkIntent;
  onRecovered: () => void;
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
    ready = linkRetryReady(intent, inspection);
  async function run(retry: boolean) {
    if (pending.current || !isOnline || !navigator.onLine) return;
    if (expired()) {
      setInspection(undefined);
      setError(
        "The safe retry window ended. Inspect the current private link before starting another private-link review.",
      );
      feedback.current?.focus();
      return;
    }
    if (retry && !linkRetryReady(intent, inspection)) return;
    const controller = new AbortController();
    active.current = controller;
    pending.current = true;
    setBusy(true);
    callbacks.current.onBusy(true);
    setError("");
    try {
      if (retry) {
        setInspection(undefined);
        await submitLinkWrite(intent, controller.signal);
        if (mounted.current && !controller.signal.aborted)
          callbacks.current.onRecovered();
      } else {
        setInspection(undefined);
        const result = await inspectLinkWrite(intent, controller.signal);
        if (!mounted.current || controller.signal.aborted) return;
        setInspection(result);
        setAt(new Date().toISOString());
        if (result.committed) callbacks.current.onRecovered();
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
          : "The original private link outcome could not be checked.",
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
    <section aria-label="Unconfirmed private link change" className="gt-form">
      <p ref={feedback} tabIndex={-1} role={error ? "alert" : "status"}>
        {error ||
          "The original private link change is unconfirmed. New changes are paused until it is checked or you review stopping recovery."}
      </p>
      <p>
        {intent.action === "create"
          ? "Queue the originally approved recipient list"
          : intent.action === "resend"
            ? "Replace the unused private link"
            : "Revoke the private link"}
        : {intent.label}.
      </p>
      <details>
        <summary>Review original private-link request</summary>
        <p>
          Reviewed form revision {JSON.parse(intent.body).formRevision}
          {intent.sourceId
            ? `; link revision ${JSON.parse(intent.body).revision}`
            : ""}
          .
        </p>
        {intent.action === "create" && (
          <>
            <p>
              {JSON.parse(intent.body).recipients.length} approved recipients:
            </p>
            <ul>
              {JSON.parse(intent.body).recipients.map((email: string) => (
                <li key={email}>{email}</li>
              ))}
            </ul>
          </>
        )}
        {JSON.parse(intent.body).expiresAt && (
          <p>
            Original expiry:{" "}
            {new Date(JSON.parse(intent.body).expiresAt).toLocaleString()}.
          </p>
        )}
        <p>
          The original audience, form/version, selected link revision, expiry
          and request key stay fixed. Checking never queues, rotates or revokes
          links.
        </p>
      </details>
      {inspection && !inspection.committed && (
        <p role="status">
          {ready
            ? "No committed receipt was found. You can explicitly retry the identical original change after this current-access and revision check."
            : "The target is no longer ready for this change. Reload the current form and links before making another request."}
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
          Check original private link outcome
        </Button>
        <Button
          type="button"
          disabled={busy || !isOnline || expired() || !ready}
          onClick={() => void run(true)}
        >
          Retry identical private link change
        </Button>
      </div>
      <details>
        <summary>Review stopping recovery</summary>
        <p>
          The original change may already have committed. Stopping recovery does
          not undo it. Reload the current private-link inventory before creating
          another request; no replacement is created automatically.
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onAbandon}
        >
          Stop tracking this private link change
        </Button>
      </details>
    </section>
  );
}
