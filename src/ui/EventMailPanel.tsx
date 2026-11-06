import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, ApiFailure } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, Field } from "./primitives";
type Review = {
  reviewId: string;
  expiresAt: string;
  count: number;
  subject: string;
  message: string;
  recipients: { id: string; email: string }[];
};
type Approval = {
  reviewId: string;
  confirmation: string;
  key: string;
  createdAt: number;
};
type Recovery =
  | { state: "ready"; at: string; review: Review }
  | {
      state: "queued";
      at: string;
      receipt: { recipientCount: number; queued: true };
    }
  | { state: "unavailable"; at: string; reason: string };
type Props = {
  eventId: string;
  onClose: () => void;
  onQueued: (count: number) => void;
  disabled?: boolean;
};
export default function EventMailPanel(props: Props) {
  return <EventMailContent key={props.eventId} {...props} />;
}
function EventMailContent({
  eventId,
  onClose,
  onQueued,
  disabled = false,
}: Props) {
  const [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [review, setReview] = useState<Review>(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(""),
    [passwordError, setPasswordError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [uncertain, setUncertain] = useState<Approval>(),
    [checked, setChecked] = useState<Recovery>(),
    [mustRecheck, setMustRecheck] = useState(false),
    [abandon, setAbandon] = useState<"message" | "close">(),
    [now, setNow] = useState(Date.now());
  const [historyOpen, setHistoryOpen] = useState(false),
    [historyPage, setHistoryPage] = useState(1),
    [historyRefresh, setHistoryRefresh] = useState(0);
  const historyHeading = useRef<HTMLHeadingElement>(null),
    historyRetry = useRef(false);
  const history = usePrivateRead<{
      items: {
        id: string;
        subject: string;
        message: string;
        recipient_count: number;
        created_at: string;
      }[];
      total: number;
    }>(
      historyOpen && !blocked
        ? `/admin/events/${eventId}/email?history=true&page=${historyPage}`
        : undefined,
      historyRefresh,
    ),
    { clear: clearHistory } = history;
  const mutation = usePrivateMutation(eventId),
    { busy, cancel } = mutation,
    { isOnline } = useOnlineStatus(),
    navigation = useNavigationSafety(),
    heading = useRef<HTMLHeadingElement>(null),
    recoveryHeading = useRef<HTMLHeadingElement>(null),
    access = useRef<HTMLButtonElement>(null),
    opener = useRef<HTMLElement>(),
    notified = useRef(false);
  const expired = !!review && new Date(review.expiresAt).getTime() <= now,
    dirty = !!subject || !!message || !!review || !!uncertain,
    ready = isOnline && !disabled && !blocked,
    approvalReady = ready && !!review && !expired && !mustRecheck && !uncertain;
  useDraftGuard(dirty, { busy, label: "Unsent event email" });
  const clear = useCallback(() => {
    cancel();
    clearHistory();
    setHistoryOpen(false);
    setHistoryPage(1);
    setSubject("");
    setMessage("");
    setReview(undefined);
    setPassword("");
    setConfirmation("");
    setKey(crypto.randomUUID());
    setError("");
    setPasswordError("");
    setUncertain(undefined);
    setChecked(undefined);
    setMustRecheck(false);
    setAbandon(undefined);
    setBlocked(true);
  }, [cancel, clearHistory]);
  useEffect(() => {
    if (history.denied) clear();
  }, [history.denied, clear]);
  useEffect(() => {
    if (!history.loading && historyRetry.current) {
      historyRetry.current = false;
      historyHeading.current?.focus();
    }
  }, [history.loading]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  useEffect(() => {
    if (blocked) access.current?.focus();
    else heading.current?.focus();
  }, [blocked, review?.reviewId]);
  useEffect(() => {
    if (uncertain) recoveryHeading.current?.focus();
  }, [uncertain]);
  useEffect(() => {
    if (checked?.state === "ready" && !uncertain) heading.current?.focus();
  }, [checked, uncertain]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const pause = () => {
      if (review) {
        setMustRecheck(true);
        setChecked(undefined);
        setPassword("");
      }
    };
    window.addEventListener("offline", pause);
    return () => window.removeEventListener("offline", pause);
  }, [review]);
  const done = (count: number) => {
    if (notified.current) return;
    notified.current = true;
    setUncertain(undefined);
    setChecked(undefined);
    setReview(undefined);
    setPassword("");
    setConfirmation("");
    setSubject("");
    setMessage("");
    onQueued(count);
  };
  const denied = (failure: unknown) =>
    failure instanceof ApiFailure &&
    [401, 403, 404].includes(failure.status) &&
    failure.code !== "PASSWORD_REQUIRED";
  const failureText = (failure: unknown) =>
    failure instanceof Error
      ? failure.message
      : "This email operation could not complete. Try again.";
  async function recheckAccess() {
    if (!isOnline || disabled) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    try {
      await api(`/admin/events/${eventId}/email`, {
        signal: controller.signal,
      });
      if (mutation.current(controller)) setBlocked(false);
    } catch (failure) {
      if (mutation.current(controller)) setError(failureText(failure));
    } finally {
      mutation.finish(controller);
    }
  }
  async function prepare() {
    if (!ready || review || uncertain || notified.current) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setPasswordError("");
    try {
      const result = await api<Review>(
        `/admin/events/${eventId}/email-review`,
        {
          method: "POST",
          protected: true,
          body: { subject, message },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        },
      );
      if (!mutation.current(controller)) return;
      setReview(result);
      setNow(Date.now());
      setKey(crypto.randomUUID());
      setConfirmation("");
      setPassword("");
      setMustRecheck(false);
      setChecked(undefined);
    } catch (failure) {
      if (!mutation.current(controller)) return;
      if (denied(failure)) {
        clear();
        return;
      }
      setError(failureText(failure));
    } finally {
      mutation.finish(controller);
    }
  }
  async function approve(replay = false) {
    if (
      !ready ||
      !review ||
      notified.current ||
      (replay ? !uncertain || checked?.state !== "ready" : !approvalReady)
    )
      return;
    const intent = uncertain || {
      reviewId: review.reviewId,
      confirmation,
      key,
      createdAt: Date.now(),
    };
    if (Date.now() - intent.createdAt >= 47 * 60 * 60 * 1000) {
      setError(
        "The safe retry window ended. Review abandoning recovery and inspect the saved message history before preparing another email.",
      );
      return;
    }
    if (new Date(review.expiresAt).getTime() <= Date.now()) {
      setNow(Date.now());
      setMustRecheck(true);
      setError(
        "This audience review expired. Recheck saved approval before preparing a new review.",
      );
      return;
    }
    if (intent.confirmation !== `SEND ${review.count}` || !password) return;
    const controller = mutation.begin();
    if (!controller) return;
    const proof = password;
    setPassword("");
    setPasswordError("");
    setError("");
    try {
      const result = await api<{ recipientCount: number }>(
        `/admin/events/${eventId}/email`,
        {
          method: "POST",
          protected: true,
          idempotencyKey: intent.key,
          body: {
            reviewId: intent.reviewId,
            confirmation: intent.confirmation,
            currentPassword: proof,
          },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        },
      );
      if (mutation.current(controller)) done(result.recipientCount);
    } catch (failure) {
      if (!mutation.current(controller)) return;
      if (
        failure instanceof ApiFailure &&
        failure.code === "PASSWORD_REQUIRED"
      ) {
        setPasswordError(failure.message);
        return;
      }
      if (denied(failure)) {
        clear();
        return;
      }
      setError(failureText(failure));
      if (!(failure instanceof ApiFailure) || failure.status >= 500) {
        setUncertain(intent);
        setChecked(undefined);
        setMustRecheck(true);
      } else if (
        failure.status === 409 ||
        [
          "AUDIENCE_CHANGED",
          "EVENT_MAIL_REVIEW_REQUIRED",
          "INVALID_STATE",
        ].includes(failure.code)
      ) {
        setMustRecheck(true);
        setChecked(undefined);
      }
    } finally {
      mutation.finish(controller);
    }
  }
  async function recheck() {
    if (!ready || !review || notified.current) return;
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setChecked(undefined);
    setPassword("");
    try {
      const result = await api<Recovery>(
        `/admin/events/${eventId}/email?reviewId=${encodeURIComponent(review.reviewId)}`,
        { idempotencyKey: uncertain?.key || key, signal: controller.signal },
      );
      if (!mutation.current(controller)) return;
      if (result.state === "queued") {
        done(result.receipt.recipientCount);
        return;
      }
      if (
        result.state === "ready" &&
        (result.review.reviewId !== review.reviewId ||
          result.review.subject !== review.subject ||
          result.review.message !== review.message ||
          JSON.stringify(result.review.recipients) !==
            JSON.stringify(review.recipients))
      ) {
        setError(
          "The saved audience review no longer matches this approval. Start a new review after inspecting saved message history.",
        );
        setChecked({ state: "unavailable", reason: "changed", at: result.at });
        return;
      }
      setChecked(result);
      setNow(Date.now());
      if (result.state === "ready") {
        setReview(result.review);
        if (!uncertain) setMustRecheck(false);
      }
      recoveryHeading.current?.focus();
    } catch (failure) {
      if (!mutation.current(controller)) return;
      if (denied(failure)) {
        clear();
        return;
      }
      setError(failureText(failure));
    } finally {
      mutation.finish(controller);
    }
  }
  const back = () => {
    setReview(undefined);
    setPassword("");
    setConfirmation("");
    setUncertain(undefined);
    setChecked(undefined);
    setMustRecheck(false);
    setKey(crypto.randomUUID());
    setError("");
    setPasswordError("");
  };
  const leave = (where: "message" | "close", button?: HTMLElement) => {
    if (mutation.pending.current) return;
    if (uncertain) {
      opener.current = button;
      setAbandon(where);
      return;
    }
    const action = where === "close" ? onClose : back;
    if (dirty && navigation) navigation.request(action);
    else action();
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (review) approve();
    else prepare();
  }
  if (blocked)
    return (
      <section
        className="gt-panel gt-form"
        aria-label="Event email access unavailable"
      >
        <h3>Email access unavailable</h3>
        <p>Private recipients, message and approval input have been cleared.</p>
        {error && <p role="alert">{error}</p>}
        <button
          ref={access}
          className="gt-button gt-button-primary"
          type="button"
          disabled={busy || !isOnline || disabled}
          onClick={recheckAccess}
        >
          Recheck event email access
        </button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={onClose}
        >
          Close email
        </Button>
      </section>
    );
  return (
    <form
      className="gt-form gt-panel gt-event-editor [overflow-wrap:anywhere]"
      onSubmit={submit}
      aria-labelledby="event-mail-title"
    >
      <h3 id="event-mail-title" ref={heading} tabIndex={-1}>
        {review
          ? `Review email to ${review.count} attendees`
          : "Email registered attendees"}
      </h3>
      <p>
        Only current registrations for this event are eligible. Review the exact
        audience and message before approving. No arbitrary recipient addresses
        are accepted.
      </p>
      {error && (
        <p className="gt-form-error" role="alert">
          {error}
        </p>
      )}
      {!isOnline && (
        <p role="status">
          You are offline. Email changes are paused; reconnect and explicitly
          recheck an existing approval.
        </p>
      )}
      {busy && (
        <p role="status">
          {review
            ? "Checking or saving your approval…"
            : "Preparing the saved audience review…"}
        </p>
      )}
      {review && (uncertain || mustRecheck) && (
        <section className="gt-form" aria-label="Event email approval recovery">
          <h4 ref={recoveryHeading} tabIndex={-1}>
            Reconcile saved email approval
          </h4>
          <p>
            {uncertain
              ? "Approval may already have queued the messages. Recheck its saved receipt before retrying or preparing another email."
              : "Current event or audience values need to be checked before this approval can continue."}{" "}
            Rechecking sends no messages.
          </p>
          <Button type="button" disabled={busy || !ready} onClick={recheck}>
            Recheck saved email approval
          </Button>
          {checked && (
            <p role="status">
              Read at{" "}
              <time dateTime={checked.at}>
                {new Date(checked.at).toLocaleString()}
              </time>
              .{" "}
              {checked.state === "ready"
                ? "The exact saved audience review remains ready. Enter a fresh password to approve."
                : "This approval cannot be used. Inspect saved message history, then prepare a new audience review."}
            </p>
          )}
          {uncertain && (
            <>
              <Field label="Fresh current password for retry" required>
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={128}
                  value={password}
                  disabled={busy || !ready}
                  aria-invalid={!!passwordError}
                  aria-describedby={
                    passwordError ? "event-mail-password-error" : undefined
                  }
                  onChange={(event) => {
                    if (!mutation.pending.current) {
                      setPassword(event.target.value);
                      setPasswordError("");
                    }
                  }}
                />
              </Field>
              <Button
                type="button"
                disabled={
                  busy || !ready || checked?.state !== "ready" || !password
                }
                onClick={() => approve(true)}
              >
                Retry original email approval
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={(event) => leave("message", event.currentTarget)}
              >
                Review abandoning email recovery
              </Button>
            </>
          )}
        </section>
      )}
      <fieldset
        disabled={busy || disabled || !isOnline || !!uncertain}
        className="gt-mail-fields"
      >
        {review ? (
          <>
            <p className="gt-helper">
              Review expires {new Date(review.expiresAt).toLocaleString()}.
              Changes to the event or its recipients require a new review.
            </p>
            <h4>{review.subject}</h4>
            <p className="gt-mail-preview">{review.message}</p>
            <details>
              <summary>Inspect all {review.count} recipient addresses</summary>
              <ul className="gt-mail-recipients">
                {review.recipients.map((person) => (
                  <li key={person.id}>{person.email}</li>
                ))}
              </ul>
            </details>
            <p>
              Approval queues individual messages. Delivery rechecks the
              sender’s current access and each registration. Removed or changed
              recipients are skipped. Accepted mail cannot be recalled.
            </p>
            <Field label="Current password" required>
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
                value={uncertain ? "" : password}
                aria-invalid={!!passwordError}
                aria-describedby={
                  passwordError ? "event-mail-password-error" : undefined
                }
                onChange={(event) => {
                  if (!mutation.pending.current) {
                    setPassword(event.target.value);
                    setPasswordError("");
                  }
                }}
              />
            </Field>
            <Field label={`Type SEND ${review.count} to confirm`} required>
              <input
                required
                autoComplete="off"
                value={confirmation}
                onChange={(event) => {
                  if (!mutation.pending.current)
                    setConfirmation(event.target.value);
                }}
              />
            </Field>
            {expired && (
              <p role="status">
                This review expired. Recheck any uncertain approval before
                preparing a new review.
              </p>
            )}
            <div className="gt-inline-actions">
              <Button
                type="submit"
                disabled={
                  !approvalReady ||
                  !password ||
                  confirmation !== `SEND ${review.count}`
                }
              >
                {busy ? "Approving…" : `Queue ${review.count} messages`}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Subject" required>
              <input
                required
                minLength={2}
                maxLength={200}
                value={subject}
                onChange={(event) => {
                  if (!mutation.pending.current) setSubject(event.target.value);
                }}
              />
            </Field>
            <Field label="Message" required>
              <textarea
                required
                minLength={10}
                maxLength={10000}
                rows={6}
                value={message}
                onChange={(event) => {
                  if (!mutation.pending.current) setMessage(event.target.value);
                }}
              />
            </Field>
            <Button type="submit">
              {busy ? "Preparing review…" : "Review recipients and message"}
            </Button>
          </>
        )}
      </fieldset>
      {historyOpen && (
        <section className="gt-form" aria-label="Your queued event messages">
          <h4 ref={historyHeading} tabIndex={-1}>
            Your queued event messages
          </h4>
          <p>
            This event’s approvals from your account, newest first. Queued does
            not mean delivered. Compare subject, message, time and recipient
            count before preparing another approval.
          </p>
          {history.loading && (
            <div
              className="gt-skeleton gt-detail-skeleton"
              role="status"
              aria-label="Loading queued message history"
            />
          )}
          {(history.error || !isOnline) && (
            <div role="alert">
              <p>
                {history.error ||
                  "You are offline. History changes are paused."}
              </p>
              {history.at && (
                <p>
                  Showing the last successful history read from{" "}
                  <time dateTime={history.at}>
                    {new Date(history.at).toLocaleString()}
                  </time>
                  .
                </p>
              )}
            </div>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={busy || history.loading || !isOnline}
            onClick={() => {
              historyRetry.current = true;
              setHistoryRefresh((value) => value + 1);
            }}
          >
            Reload queued message history
          </Button>
          {history.data?.items.map((item) => (
            <article key={item.id}>
              <h5>{item.subject}</h5>
              <p>
                Approval queued{" "}
                <time dateTime={item.created_at}>
                  {new Date(item.created_at).toLocaleString()}
                </time>{" "}
                · {item.recipient_count} recipients
              </p>
              <p className="gt-mail-preview">{item.message}</p>
            </article>
          ))}
          {history.data &&
            !history.loading &&
            !history.error &&
            history.data.items.length === 0 && (
              <p>
                No queued event messages from your account on this page.
                {historyPage > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setHistoryPage(1)}
                  >
                    Return to first history page
                  </Button>
                )}
              </p>
            )}
          <nav
            className="gt-inline-actions"
            aria-label="Queued message history pages"
          >
            <Button
              type="button"
              variant="secondary"
              disabled={
                busy ||
                !isOnline ||
                history.loading ||
                !!history.error ||
                historyPage <= 1
              }
              onClick={() => setHistoryPage((value) => value - 1)}
            >
              Previous history page
            </Button>
            <span>
              Page {historyPage}
              {history.data
                ? ` · ${history.data.total} queued approvals`
                : " · count unavailable"}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={
                busy ||
                !isOnline ||
                history.loading ||
                !!history.error ||
                !history.data ||
                historyPage * 20 >= history.data.total
              }
              onClick={() => setHistoryPage((value) => value + 1)}
            >
              Next history page
            </Button>
          </nav>
        </section>
      )}
      {passwordError && (
        <p role="alert" id="event-mail-password-error">
          {passwordError}
        </p>
      )}
      <div className="gt-inline-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setHistoryOpen((value) => !value)}
        >
          {historyOpen
            ? "Hide queued message history"
            : "Review your queued event messages"}
        </Button>
        {review && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={(event) => leave("message", event.currentTarget)}
          >
            Back to message
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={(event) => leave("close", event.currentTarget)}
        >
          Close email
        </Button>
      </div>
      <Dialog
        open={!!abandon}
        onOpenChange={(open) => {
          if (!open && !mutation.pending.current) setAbandon(undefined);
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto [overflow-wrap:anywhere]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (opener.current?.isConnected) opener.current.focus();
            else heading.current?.focus();
          }}
        >
          <DialogTitle>Abandon unconfirmed email approval?</DialogTitle>
          <DialogDescription>
            “{review?.subject}” to {review?.count} attendees may already have
            been queued. Discarding retained approval cannot recall accepted
            messages. Inspect saved message history before approving another
            email.
          </DialogDescription>
          <Button
            variant="danger"
            onClick={() => {
              const where = abandon;
              setAbandon(undefined);
              back();
              if (where === "close") onClose();
            }}
          >
            Abandon email recovery
          </Button>
          <Button variant="secondary" onClick={() => setAbandon(undefined)}>
            Keep recovery
          </Button>
        </DialogContent>
      </Dialog>
    </form>
  );
}
