import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Button, Field } from "../primitives";
import type { FormResponse } from "./store";
import {
  prepareResponseWrite,
  reviewableResponse,
  submitResponseWrite,
  type ResponseAction,
  type ResponseIntent,
  type ResponseInspection,
} from "./response-write-api";
import ResponseActionRecovery from "./ResponseActionRecovery";
export type ResponseActionState = {
  dirty: boolean;
  busy: boolean;
  hideDetails: boolean;
};
type Props = {
  formId: string;
  response: FormResponse;
  disabled: boolean;
  held: boolean;
  onStateChange: (state: ResponseActionState) => void;
  onComplete: (result: ResponseInspection) => void;
  onDenied: () => void;
  onReload: () => void;
};
export default function ResponseActionReview(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <ActionWorkspace
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}:${props.response.id}`}
      {...props}
    />
  );
}
function ActionWorkspace({
  formId,
  response,
  disabled,
  held,
  ...handlers
}: Props) {
  const [action, setAction] = useState<ResponseAction>(),
    [confirmation, setConfirmation] = useState(""),
    [intent, setIntent] = useState<ResponseIntent>(),
    [uncertain, setUncertain] = useState(false),
    [withheld, setWithheld] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState(""),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [sessionInvalid, setSessionInvalid] = useState(false);
  const root = `/admin/forms/${formId}/responses/${response.id}`,
    { isOnline } = useOnlineStatus(),
    { busy, begin, current, finish, cancel } = usePrivateMutation(root),
    callbacks = useRef(handlers),
    intentRef = useRef<ResponseIntent>(),
    feedback = useRef<HTMLElement>(null),
    pending = busy || recoveryBusy,
    dirty = !!confirmation || !!intent || withheld,
    writable =
      !disabled &&
      !held &&
      response.status !== "held" &&
      isOnline &&
      !sessionInvalid &&
      !withheld &&
      !stale &&
      !intent &&
      reviewableResponse(response);
  callbacks.current = handlers;
  useDraftGuard(dirty, {
    busy: pending,
    label: intent
      ? "Unconfirmed response privacy action"
      : "Response privacy review",
  });
  useEffect(() => {
    callbacks.current.onStateChange({
      dirty,
      busy: pending,
      hideDetails: withheld,
    });
  }, [dirty, pending, withheld]);
  useEffect(() => {
    if (action || error) feedback.current?.focus();
  }, [action, error]);
  useEffect(() => {
    const clear = () => {
      cancel();
      intentRef.current = undefined;
      setIntent(undefined);
      setConfirmation("");
      setAction(undefined);
      setError("");
      setSessionInvalid(true);
      callbacks.current.onDenied();
    };
    const offline = () => {
      cancel();
      if (intentRef.current) {
        setUncertain(true);
        setWithheld(true);
      }
    };
    window.addEventListener("gdg:session-cleared", clear);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", clear);
      window.removeEventListener("offline", offline);
    };
  }, [cancel]);
  const completed = (result: ResponseInspection) => {
    intentRef.current = undefined;
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setAction(undefined);
    setConfirmation("");
    setError("");
    callbacks.current.onComplete(result);
  };
  async function confirm() {
    if (!writable || !action || confirmation !== action.toUpperCase()) return;
    const controller = begin();
    if (!controller) return;
    let packet: ResponseIntent;
    try {
      packet = prepareResponseWrite(formId, response, action, confirmation);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reload this response before reviewing another action.",
      );
      finish(controller);
      return;
    }
    intentRef.current = packet;
    setIntent(packet);
    setWithheld(true);
    setError("");
    // Withhold current/historical answers synchronously before a potentially
    // irreversible write; a late or lost result must not restore erased data.
    callbacks.current.onStateChange({
      dirty: true,
      busy: true,
      hideDetails: true,
    });
    try {
      const result = await submitResponseWrite(packet, controller.signal);
      if (current(controller)) completed(result);
    } catch (e) {
      if (!current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        intentRef.current = undefined;
        setIntent(undefined);
        setConfirmation("");
        setAction(undefined);
        callbacks.current.onDenied();
      } else if (
        e instanceof ApiFailure &&
        [400, 409, 429].includes(e.status)
      ) {
        intentRef.current = undefined;
        setIntent(undefined);
        setStale(true);
        setError(
          e.message +
            " Reload the current response and review again before another privacy action.",
        );
      } else setUncertain(true);
    } finally {
      finish(controller);
    }
  }
  return (
    <section aria-label="Response privacy actions" className="gt-form">
      {!reviewableResponse(response) && (
        <p role="status">
          Reload the response to obtain its current revision and privacy state
          before reviewing destructive actions.
        </p>
      )}
      {(held || response.status === "held") && (
        <p role="status">
          This response is under an operational hold. Deletion and redaction are
          unavailable.
        </p>
      )}
      {disabled && !intent && !stale && (
        <p role="status">
          Current response and hold reads must be checked before a privacy
          action.
        </p>
      )}
      {withheld && (
        <p role="status">
          Answer details are hidden while this privacy action is pending or
          unconfirmed. Reload current data after recovery before reviewing
          answers again.
        </p>
      )}
      {error && (
        <section ref={feedback} tabIndex={-1} role="alert">
          <p>{error}</p>
        </section>
      )}
      {!intent && !stale && (
        <div className="gt-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={
              pending ||
              !writable ||
              !!response.redacted ||
              response.status === "redacted"
            }
            onClick={() => {
              setAction("redact");
              setConfirmation("");
              setError("");
            }}
          >
            Redact identity
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={pending || !writable}
            onClick={() => {
              setAction("delete");
              setConfirmation("");
              setError("");
            }}
          >
            Delete response
          </Button>
        </div>
      )}
      {action && !uncertain && (
        <section
          ref={feedback}
          tabIndex={-1}
          aria-label="Review response privacy action"
          className="gt-inline-confirm"
        >
          <p>
            {action === "delete"
              ? "Permanently delete answer values and their revision history"
              : "Permanently replace identity and sensitive values in current and historical answers"}{" "}
            for response {response.id}, form version {response.version},
            response revision {response.revision}? The audit record remains.
          </p>
          <Field
            label="Confirm response action"
            hint={`Type ${action.toUpperCase()} exactly. Current access, revision, privacy state and holds are checked again in the transaction.`}
          >
            <input
              value={confirmation}
              autoComplete="off"
              disabled={pending || !!intent || stale}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <div className="gt-inline-actions">
            <Button
              type="button"
              variant="danger"
              disabled={
                pending || !writable || confirmation !== action.toUpperCase()
              }
              onClick={() => void confirm()}
            >
              Confirm {action}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending || !!intent || stale}
              onClick={() => {
                setAction(undefined);
                setConfirmation("");
              }}
            >
              Cancel review
            </Button>
          </div>
        </section>
      )}
      {stale && (
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !isOnline}
          onClick={() => callbacks.current.onReload()}
        >
          Reload current response and review again
        </Button>
      )}
      {uncertain && intent && (
        <ResponseActionRecovery
          key={intent.key}
          intent={intent}
          onRecovered={completed}
          onBusy={setRecoveryBusy}
          onDenied={() => callbacks.current.onDenied()}
          onAbandon={() => {
            intentRef.current = undefined;
            setIntent(undefined);
            setUncertain(false);
            setConfirmation("");
            setAction(undefined);
            callbacks.current.onReload();
          }}
        />
      )}
    </section>
  );
}
