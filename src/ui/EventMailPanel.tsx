import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { usePrivateOperation } from "@/hooks/usePrivateOperation";
import { Button, Field } from "./primitives";
type Review = {
  reviewId: string;
  expiresAt: string;
  count: number;
  subject: string;
  message: string;
  recipients: { id: string; email: string }[];
};
export default function EventMailPanel({
  eventId,
  onClose,
  onQueued,
}: {
  eventId: string;
  onClose: () => void;
  onQueued: (count: number) => void;
}) {
  const [subject, setSubject] = useState(""),
    [message, setMessage] = useState(""),
    [review, setReview] = useState<Review | null>(null),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [key, setKey] = useState(() => crypto.randomUUID()),
    [now, setNow] = useState(Date.now());
  const { busy, error, work } = usePrivateOperation(),
    navigation = useNavigationSafety(),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [review?.reviewId]);
  useDraftGuard(!!subject || !!message || !!review, {
    busy,
    label: "Unsent event email",
  });
  useEffect(() => {
    const clear = () => {
      setSubject("");
      setMessage("");
      setReview(null);
      setPassword("");
      setConfirmation("");
      setKey(crypto.randomUUID());
    };
    const interval = window.setInterval(() => setNow(Date.now()), 10000);
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  const expired = !!review && new Date(review.expiresAt).getTime() <= now;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!review) {
      await work(
        (signal) =>
          api<Review>(`/admin/events/${eventId}/email-review`, {
            method: "POST",
            body: { subject, message },
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
          }),
        (result) => {
          setReview(result);
          setNow(Date.now());
          setKey(crypto.randomUUID());
          setConfirmation("");
          setPassword("");
        },
      );
    } else {
      await work(
        (signal) =>
          api<{ recipientCount: number }>(`/admin/events/${eventId}/email`, {
            method: "POST",
            idempotencyKey: key,
            body: {
              reviewId: review.reviewId,
              currentPassword: password,
              confirmation,
            },
            signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
          }),
        (result) => onQueued(result.recipientCount),
      );
      setPassword("");
    }
  }
  return (
    <form
      className="gt-form gt-panel gt-event-editor"
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
        <div className="gt-form-error" role="alert">
          {error} If approval timed out, retry without changing this review; the
          same request cannot queue it twice.
        </div>
      )}
      {busy && (
        <p role="status">
          {review
            ? "Saving your approval…"
            : "Preparing the saved audience review…"}
        </p>
      )}
      <fieldset disabled={busy} className="gt-mail-fields">
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
                maxLength={1024}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label={`Type SEND ${review.count} to confirm`} required>
              <input
                required
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            {expired && (
              <p role="status">
                This review expired. Return to the message and review again.
              </p>
            )}
            <div className="gt-inline-actions">
              <Button
                disabled={
                  expired ||
                  !password ||
                  confirmation !== `SEND ${review.count}`
                }
              >
                {busy ? "Approving…" : `Queue ${review.count} messages`}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setReview(null);
                  setPassword("");
                  setConfirmation("");
                }}
              >
                Back to message
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
                onChange={(e) => setSubject(e.target.value)}
              />
            </Field>
            <Field label="Message" required>
              <textarea
                required
                minLength={10}
                maxLength={10000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <Button>
              {busy ? "Preparing review…" : "Review recipients and message"}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          onClick={() => (navigation ? navigation.request(onClose) : onClose())}
        >
          Close email
        </Button>
      </fieldset>
    </form>
  );
}
