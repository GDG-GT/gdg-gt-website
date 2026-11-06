import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "../primitives";
import {
  prepareFormLibraryWrite,
  submitFormLibraryWrite,
  type FormLibraryIntent,
} from "./api";
import type { PreviewForm } from "./store";
import FormLibraryWriteRecovery from "./FormLibraryWriteRecovery";
type Props = {
  form: PreviewForm;
  disabled: boolean;
  onComplete: (form: PreviewForm) => void;
  onDenied: () => void;
  onReload: () => void;
};
export default function ResponseAvailability(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <Availability
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.form.id}`}
      {...props}
    />
  );
}
function Availability({ form, disabled, ...handlers }: Props) {
  const [review, setReview] = useState<PreviewForm>(),
    [intent, setIntent] = useState<FormLibraryIntent>(),
    [uncertain, setUncertain] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState(""),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [abandon, setAbandon] = useState(false),
    [sessionInvalid, setSessionInvalid] = useState(false);
  const callbacks = useRef(handlers),
    activeIntent = useRef<FormLibraryIntent>(),
    feedback = useRef<HTMLParagraphElement>(null),
    { isOnline } = useOnlineStatus(),
    mutation = usePrivateMutation("availability:" + form.id),
    pending = mutation.busy || recoveryBusy,
    cancel = mutation.cancel;
  callbacks.current = handlers;
  const eligible =
    form.actions?.includes("publish") &&
    form.status !== "Archived" &&
    form.versions.length > 0 &&
    Number.isInteger(form.revision) &&
    form.revision! >= 1;
  const currentReview =
    !!review &&
    review.id === form.id &&
    review.revision === form.revision &&
    review.status === form.status;
  const writable =
    !disabled &&
    !!eligible &&
    isOnline &&
    !sessionInvalid &&
    !intent &&
    !stale &&
    !pending;
  const nextState = review?.status === "Open" ? "Closed" : "Open",
    label = nextState === "Closed" ? "Close form" : "Reopen form";
  useDraftGuard(!!review || !!intent, {
    busy: pending,
    label: intent
      ? "Unconfirmed response-workspace availability change"
      : "Form availability review",
  });
  useEffect(() => {
    const clear = () => {
      cancel();
      activeIntent.current = undefined;
      setReview(undefined);
      setIntent(undefined);
      setError("");
      setSessionInvalid(true);
      callbacks.current.onDenied();
    };
    const offline = () => {
      cancel();
      if (activeIntent.current) {
        setIntent(activeIntent.current);
        setUncertain(true);
      }
    };
    window.addEventListener("gdg:session-cleared", clear);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", clear);
      window.removeEventListener("offline", offline);
    };
  }, [cancel]);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  const clearReview = () => {
    activeIntent.current = undefined;
    setReview(undefined);
    setIntent(undefined);
    setUncertain(false);
    setAbandon(false);
    setStale(false);
    setError("");
    setRecoveryBusy(false);
  };
  useEffect(() => {
    if ((!review && !intent) || form.actions?.includes("publish")) return;
    cancel();
    activeIntent.current = undefined;
    setReview(undefined);
    setIntent(undefined);
    setUncertain(false);
    setAbandon(false);
    setRecoveryBusy(false);
    setError("");
    setSessionInvalid(true);
    callbacks.current.onDenied();
  }, [form.actions, review, intent, cancel]);
  const completed = (saved: PreviewForm) => {
    if (saved.id !== form.id)
      throw new ApiFailure(
        503,
        "UNCONFIRMED_RESULT",
        "The saved availability target could not be verified. Recheck the original outcome.",
      );
    clearReview();
    callbacks.current.onComplete(saved);
  };
  async function confirm() {
    if (!writable || !currentReview || !review) return;
    const controller = mutation.begin();
    if (!controller) return;
    const packet = prepareFormLibraryWrite("state", review, nextState);
    activeIntent.current = packet;
    setIntent(packet);
    setError("");
    try {
      const saved = await submitFormLibraryWrite(packet, controller.signal);
      if (mutation.current(controller)) completed(saved);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clearReview();
        callbacks.current.onDenied();
      } else if (
        e instanceof ApiFailure &&
        [400, 409, 429].includes(e.status)
      ) {
        activeIntent.current = undefined;
        setIntent(undefined);
        setStale(true);
        setError(
          e.message +
            " Reload the current saved form before reviewing another availability change.",
        );
      } else setUncertain(true);
    } finally {
      mutation.finish(controller);
    }
  }
  return (
    <>
      <Button
        variant="secondary"
        hidden={!form.actions?.includes("publish")}
        disabled={!writable}
        onClick={() => {
          setReview(structuredClone(form));
          setError("");
          setAbandon(false);
        }}
      >
        {form.status === "Open" ? "Close form" : "Reopen form"}
      </Button>
      {form.status === "Archived" && (
        <span className="gt-helper">
          Restore this form as a private draft before publishing or reopening.
        </span>
      )}
      <Dialog
        open={!!review || !!intent}
        onOpenChange={(open) => {
          if (!open && !pending) {
            if (intent) setAbandon(true);
            else clearReview();
          }
        }}
      >
        <DialogContent
          className="gt-notification-dialog"
          onEscapeKeyDown={(e) => {
            if (pending) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <DialogTitle>
            {uncertain ? "Recheck availability" : label + "?"}
          </DialogTitle>
          <DialogDescription>
            {uncertain
              ? "Check whether the originally reviewed availability change completed."
              : nextState === "Closed"
                ? "Stop new submissions. Existing responses and published history remain available."
                : "Reopen the existing published form under its saved access rules, schedule and response limit. This does not publish draft changes."}
          </DialogDescription>
          {!uncertain && (
            <>
              <p>
                <strong>{review?.title || form.title}</strong>
              </p>
              <p>
                Saved revision {review?.revision} · {review?.status}.
              </p>
            </>
          )}
          {error && (
            <p ref={feedback} tabIndex={-1} role="alert">
              {error}
            </p>
          )}
          {!isOnline && (
            <p role="status">
              You are offline. Recheck current reads after reconnecting; no
              availability change is sent automatically.
            </p>
          )}
          {!uncertain && (
            <>
              {(!currentReview || stale) && (
                <p role="alert">
                  The saved form revision, state or previous outcome needs a new
                  review. No replacement request will run automatically.
                </p>
              )}
              {disabled && (
                <p role="status">
                  Current response and saved-form reads must be checked before
                  confirming.
                </p>
              )}
              {!eligible && (
                <p role="alert">
                  The current saved form does not allow this availability
                  change.
                </p>
              )}
              <div className="gt-inline-actions">
                <Button
                  variant={nextState === "Closed" ? "danger" : "primary"}
                  disabled={!writable || !currentReview}
                  onClick={() => void confirm()}
                >
                  {pending ? "Saving…" : label}
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => clearReview()}
                >
                  Cancel review
                </Button>
                {stale && (
                  <Button
                    variant="secondary"
                    disabled={pending || !isOnline}
                    onClick={() => {
                      clearReview();
                      callbacks.current.onReload();
                    }}
                  >
                    Reload current form and review again
                  </Button>
                )}
              </div>
            </>
          )}
          {uncertain && intent && (
            <FormLibraryWriteRecovery
              key={intent.key}
              intent={intent}
              onRecovered={completed}
              onDenied={() => {
                clearReview();
                callbacks.current.onDenied();
              }}
              onBusy={setRecoveryBusy}
              onAbandon={() => setAbandon(true)}
            />
          )}
          {abandon && intent && (
            <section
              aria-label="Review stopping availability recovery"
              className="gt-inline-confirm"
            >
              <p>
                The original change may already have completed. Stopping
                recovery does not undo it. Reload the current form before
                reviewing another change.
              </p>
              <div className="gt-inline-actions">
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    clearReview();
                    callbacks.current.onReload();
                  }}
                >
                  Stop tracking this availability change
                </Button>
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setAbandon(false)}
                >
                  Keep checking original change
                </Button>
              </div>
            </section>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
