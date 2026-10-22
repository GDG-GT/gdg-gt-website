import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Button, Field } from "../primitives";
import { date, useNewsletterWork, type NewsletterRecord } from "./types";
type Review = {
  reviewId: string;
  reviewToken: string;
  count: number;
  subject: string;
  content: string;
  html: string;
  expiresAt: string;
  recipients: { id: string; email: string }[];
};
export default function NewsletterSend({
  record,
  onSaved,
}: {
  record: NewsletterRecord;
  onSaved: (message: string) => void;
}) {
  const [mode, setMode] = useState<"send" | "test" | "cancel">(),
    [review, setReview] = useState<Review>(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [schedule, setSchedule] = useState(""),
    [expired, setExpired] = useState(false),
    [notice, setNotice] = useState("");
  const { busy, error, setError, work } = useNewsletterWork(),
    safety = useNavigationSafety(),
    retry = useRef<{ signature: string; key: string }>();
  const path = `/admin/newsletter/campaigns/${record.id}`;
  useDraftGuard(!!mode, { busy, label: "Campaign send review" });
  const clear = useCallback(() => {
    setMode(undefined);
    setReview(undefined);
    setPassword("");
    setConfirmation("");
    setSchedule("");
    setError("");
    retry.current = undefined;
  }, [setError]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clear]);
  useEffect(() => {
    setExpired(false);
    if (!review) return;
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, new Date(review.expiresAt).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [review]);
  if (!record.actions.includes("send_email") || record.deletedAt) return null;
  const request = async () => {
    setNotice("");
    if (mode === "send" && (!review || expired)) {
      await work(
        (signal) =>
          api<Review>(path + "/send-review", {
            method: "POST",
            body: { revision: record.revision },
            signal,
          }),
        (r) => {
          setReview(r);
          setPassword("");
          setConfirmation("");
        },
      );
      return;
    }
    let scheduledAt: string | null = null;
    if (mode === "send" && schedule) {
      const value = new Date(schedule);
      if (
        !Number.isFinite(value.getTime()) ||
        value.getTime() < Date.now() + 60000 ||
        value.getTime() > Date.now() + 90 * 86400000
      ) {
        setError(
          "Choose a time at least one minute and at most 90 days from now.",
        );
        return;
      }
      scheduledAt = value.toISOString();
    }
    const document =
      mode === "send"
        ? {
            reviewId: review.reviewId,
            reviewToken: review.reviewToken,
            confirmation,
            scheduledAt,
          }
        : { revision: record.revision, confirmation };
    const signature = JSON.stringify({ mode, document });
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    const action = mode,
      currentPassword = password;
    setPassword("");
    await work(
      (signal) =>
        api(path + "/" + action, {
          method: "POST",
          body: { ...document, currentPassword },
          idempotencyKey: retry.current.key,
          signal,
        }),
      () => {
        clear();
        if (action === "test")
          setNotice(
            "Test queued only for your signed-in chapter account. No campaign audience was contacted.",
          );
        else
          onSaved(
            action === "cancel"
              ? "Remaining queued sends cancelled. A message already handed to the mail provider cannot be recalled."
              : "Campaign approved with a frozen audience. Delivery starts on the next scheduler pass; the saved message cannot be rewritten or sent twice.",
          );
      },
    );
  };
  const expected =
    mode === "send"
      ? `SEND ${review?.count || 0}`
      : mode === "test"
        ? "SEND TEST"
        : "CANCEL SEND";
  return (
    <section className="gt-newsletter-send" aria-label="Campaign sending">
      <h3>Delivery controls</h3>
      {notice && <p role="status">{notice}</p>}
      {!mode ? (
        <div className="gt-inline-actions">
          {record.status === "draft" && (
            <>
              <Button
                type="button"
                onClick={() => {
                  setMode("send");
                  setNotice("");
                }}
              >
                Review audience & send
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMode("test")}
              >
                Send test to me
              </Button>
            </>
          )}
          {["scheduled", "sending"].includes(record.status) && (
            <Button
              type="button"
              variant="danger"
              onClick={() => setMode("cancel")}
            >
              Cancel remaining sends
            </Button>
          )}
          {!["draft", "scheduled", "sending"].includes(record.status) && (
            <p className="gt-helper">
              This campaign is finished. Duplicate it to write a new draft.
            </p>
          )}
        </div>
      ) : (
        <div className="gt-form">
          <h4>
            {mode === "send"
              ? "Review the exact audience"
              : mode === "test"
                ? "Send a private test copy"
                : "Cancel remaining deliveries"}
          </h4>
          <p>
            {mode === "send"
              ? "Only confirmed, unsuppressed subscribers in this campaign’s scope are included. Approval freezes their addresses. Later unsubscribes are still honored at delivery."
              : mode === "test"
                ? "The test goes only to your own current chapter account email. It does not contact subscribers or approve the campaign."
                : "Stops queued work. An email already accepted by the provider cannot be recalled."}
          </p>
          {error && (
            <p role="alert" className="gt-form-error">
              {error}
            </p>
          )}
          {mode === "send" && review && (
            <>
              <p>
                <strong>
                  {review.count}{" "}
                  {review.count === 1 ? "recipient" : "recipients"}
                </strong>{" "}
                · review expires {date(review.expiresAt)}
                {expired && " · EXPIRED"}
              </p>
              <details>
                <summary>Review recipient addresses ({review.count})</summary>
                <ul className="gt-newsletter-recipient-list">
                  {review.recipients.map((r) => (
                    <li key={r.id}>{r.email}</li>
                  ))}
                </ul>
              </details>
              <h4>{review.subject}</h4>
              <div className="gt-newsletter-message">{review.content}</div>
              <p className="gt-helper">
                The final email also includes chapter identity and an individual
                unsubscribe link.
              </p>
            </>
          )}
          {mode === "send" && (!review || expired) ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void request()}
            >
              {busy
                ? "Reviewing…"
                : review
                  ? "Refresh expired review"
                  : "Generate send review"}
            </Button>
          ) : (
            <>
              {mode === "send" && (
                <Field
                  label="Schedule in your local time"
                  hint={`Optional. Leave blank to queue now. Your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Scheduler checks every five minutes.`}
                >
                  <input
                    type="datetime-local"
                    value={schedule}
                    disabled={busy}
                    onChange={(e) => setSchedule(e.target.value)}
                  />
                </Field>
              )}
              <Field label="Current password" required>
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={1024}
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label={`Type ${expected} to confirm`} required>
                <input
                  value={confirmation}
                  maxLength={30}
                  autoComplete="off"
                  disabled={busy}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                disabled={
                  busy || !password || confirmation !== expected || expired
                }
                variant={mode === "cancel" ? "danger" : "primary"}
                onClick={() => void request()}
              >
                {busy
                  ? "Confirming…"
                  : mode === "send"
                    ? schedule
                      ? "Approve scheduled send"
                      : "Approve send"
                    : mode === "test"
                      ? "Confirm self-only test"
                      : "Confirm cancellation"}
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => (safety ? safety.request(clear) : clear())}
          >
            Close delivery controls
          </Button>
        </div>
      )}
    </section>
  );
}
