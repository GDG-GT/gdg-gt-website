import { useCallback, useEffect, useRef, useState } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { publicQueue } from "../../shared/public-queue.mjs";
import { Button, Field } from "@/ui/primitives";
import { savePendingSubmission } from "./queue-actions";
export function QueueRuntime() {
  const [clearFailed, setClearFailed] = useState(false);
  useEffect(() => {
    let paused = false;
    const clearFailure = () => {
      paused = true;
      setClearFailed(true);
    };
    const replay = () => {
      if (!paused && navigator.onLine)
        void publicQueue
          .replay()
          .catch(() => {})
          .finally(() => window.dispatchEvent(new Event("gdg:queue-changed")));
    };
    replay();
    window.addEventListener("online", replay);
    window.addEventListener("gdg:queue-added", replay);
    window.addEventListener("gdg:queue-clear-failed", clearFailure);
    const timer = window.setInterval(replay, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", replay);
      window.removeEventListener("gdg:queue-added", replay);
      window.removeEventListener("gdg:queue-clear-failed", clearFailure);
    };
  }, []);
  return clearFailed ? (
    <aside className="gt-pwa-update" role="alert">
      <p>
        You are signed out, but device storage could not be cleared. Close other
        GDG tabs and review pending submissions in Offline help. Automatic
        replay in this tab is paused.
      </p>
      <a href="/offline">Review device storage</a>
    </aside>
  ) : null;
}
type QueueRow = {
  id: string;
  kind: string;
  slug: string | null;
  state: string;
  reason: string;
  expiresAt: number;
  attempts: number;
  nextAt: number;
  leaseUntil: number;
};
export default function SubmissionQueue() {
  const [items, setItems] = useState<QueueRow[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [consent, setConsent] = useState(false),
    [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [loadError, setLoadError] = useState(""),
    [online, setOnline] = useState(() => navigator.onLine);
  const mounted = useRef(false),
    operationPending = useRef(false),
    request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    failure = useRef<HTMLParagraphElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    storageFailure = useRef<HTMLParagraphElement>(null),
    focusTarget = useRef<"heading" | "error" | "notice" | "storage" | null>(
      null,
    );
  const load = useCallback(async () => {
    const version = ++request.current;
    try {
      const rows = await publicQueue.list();
      if (!mounted.current || version !== request.current) return false;
      setItems(rows);
      setLoadState("ready");
      setLoadError("");
      return true;
    } catch {
      if (!mounted.current || version !== request.current) return false;
      setLoadState("error");
      setLoadError(
        "Pending submissions could not be read from this device. Close older GDG tabs and try reading storage again. Your queue has not been cleared.",
      );
      return false;
    }
  }, []);
  useDraftGuard(!!email || consent, {
    busy,
    label: "Unsent pending newsletter signup",
  });
  useEffect(() => {
    if (!email && !consent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [email, consent]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      if (!operationPending.current) void load();
    };
    const connection = () => setOnline(navigator.onLine);
    refresh();
    window.addEventListener("gdg:queue-changed", refresh);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const timer = window.setInterval(refresh, 10000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("gdg:queue-changed", refresh);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, [load]);
  useEffect(() => {
    if (busy || !focusTarget.current) return;
    const target = {
      heading,
      error: failure,
      notice: feedback,
      storage: storageFailure,
    }[focusTarget.current].current;
    if (target) {
      focusTarget.current = null;
      target.focus();
    }
  }, [busy, error, notice, items, loadState]);
  const operation = async (run: () => Promise<string>) => {
    if (operationPending.current) return;
    operationPending.current = true;
    request.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const message = await run();
      if (!mounted.current) return;
      setNotice(message);
      focusTarget.current = "notice";
      await load();
    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof Error
            ? e.message
            : "This device could not save the change. Try again.",
        );
        focusTarget.current = "error";
      }
    } finally {
      operationPending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const retryReading = async () => {
    if (operationPending.current) return;
    operationPending.current = true;
    setBusy(true);
    setNotice("");
    const read = await load();
    focusTarget.current = read ? "heading" : "storage";
    operationPending.current = false;
    if (mounted.current) setBusy(false);
  };
  return (
    <section className="gt-form" aria-label="Pending submissions">
      <h2 ref={heading} tabIndex={-1}>
        Pending submissions on this device
      </h2>
      <p>
        Only event registrations and newsletter signups can be queued. Saving
        here is not a confirmed registration or subscription. The app retries
        when open and online; iOS may not replay while the app is closed.
        Signing out clears this device’s queue.
      </p>
      {!online && (
        <p role="status">
          You’re offline. Pending submissions stay on this device; retries need
          a connection.
        </p>
      )}
      {error && (
        <p ref={failure} tabIndex={-1} role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {notice && (
        <p ref={feedback} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {loadState === "loading" && (
        <p role="status">Reading pending submissions from this device…</p>
      )}
      {loadState === "error" && (
        <div>
          <p
            ref={storageFailure}
            tabIndex={-1}
            role="alert"
            className="gt-form-error"
          >
            {loadError}
            {items.length > 0 &&
              " The list below is the last successfully read copy."}
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void retryReading()}
          >
            Read device storage again
          </Button>
        </div>
      )}
      {loadState === "ready" && !items.length && (
        <p>No pending submissions are stored on this device.</p>
      )}
      {items.length > 0 && (
        <ul
          className="gt-form-integration-list"
          aria-label="Saved public submissions"
          aria-busy={busy}
        >
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>
                  {item.kind === "event"
                    ? `Event: ${item.slug}`
                    : "Newsletter signup"}
                </strong>
                <p>
                  {item.state === "accepted"
                    ? item.kind === "event"
                      ? "Registration accepted by the server."
                      : "Signup submitted. Check your email for confirmation."
                    : item.reason}
                </p>
                {item.state === "pending" && (
                  <p className="gt-helper">
                    Expires {new Date(item.expiresAt).toLocaleString()} ·{" "}
                    {item.attempts} attempts.{" "}
                    {item.kind === "event"
                      ? "Your place is not reserved while pending."
                      : "Your subscription is not confirmed while pending."}
                  </p>
                )}
                {item.slug ? (
                  <a href={`/events/${item.slug}`}>Review original event</a>
                ) : (
                  <a href="/">Review newsletter signup on the home page</a>
                )}
              </div>
              <div className="gt-inline-actions">
                {item.state === "pending" && (
                  <Button
                    variant="secondary"
                    disabled={
                      busy ||
                      !online ||
                      loadState !== "ready" ||
                      item.leaseUntil > Date.now()
                    }
                    onClick={() =>
                      void operation(async () => {
                        await publicQueue.retry(item.id);
                        await publicQueue.replay();
                        return "Retry finished. Review the submission’s current status below.";
                      })
                    }
                  >
                    Retry now
                  </Button>
                )}
                <Button
                  variant="ghost"
                  disabled={busy || loadState !== "ready"}
                  onClick={() =>
                    void operation(async () => {
                      await publicQueue.discard(item.id);
                      return item.state === "accepted"
                        ? "Accepted submission dismissed from this device."
                        : "Submission discarded from this device. This does not cancel a request already received by the server.";
                    })
                  }
                >
                  {item.state === "accepted" ? "Dismiss" : "Discard"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Save a newsletter signup for later</summary>
        <form
          className="gt-form"
          onSubmit={(event) => {
            event.preventDefault();
            void operation(async () => {
              if (!consent)
                throw Error(
                  "Choose device storage consent before saving this signup.",
                );
              await savePendingSubmission("newsletter", { email, website: "" });
              if (mounted.current) {
                setEmail("");
                setConsent(false);
              }
              return "Pending signup saved on this device. It is not subscribed until the server accepts it and you confirm by email.";
            });
          }}
        >
          <fieldset
            disabled={busy}
            className="gt-queue-signup-fields"
            aria-label="Newsletter device storage"
          >
            <Field
              label="Newsletter email address"
              hint="Use your subscription email, never an officer access code or password."
            >
              <input
                type="email"
                required
                autoComplete="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <label className="gt-check">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Save this email on this device for up to 48 hours and submit it
              automatically when online.
            </label>
            <Button type="submit" disabled={busy || !consent || !email}>
              {busy ? "Working…" : "Save pending signup"}
            </Button>
          </fieldset>
        </form>
      </details>
    </section>
  );
}
