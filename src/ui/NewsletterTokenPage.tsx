import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, CircleAlert } from "lucide-react";
import { PublicNewsletterService as NewsletterService } from "@/services/publicWorkflows";
import { useUrlCapability } from "@/hooks/useUrlCapability";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { usePublicMetadata } from "./usePublicMetadata";
import { Badge, Button } from "./primitives";
import { localPreviewEnabled } from "./preview-data";

type Phase =
  | "loading"
  | "ready"
  | "submitting"
  | "success"
  | "invalid"
  | "error"
  | "preview";
export default function NewsletterTokenPage({
  kind,
}: {
  kind: "confirm" | "unsubscribe";
}) {
  const [token] = useUrlCapability("token", true),
    [phase, setPhase] = useState<Phase>("loading"),
    [failedAt, setFailedAt] = useState<"validation" | "commit">("validation"),
    [attempt, setAttempt] = useState(0),
    operation = useRef<AbortController>(),
    pending = useRef(false),
    heading = useRef<HTMLHeadingElement>(null),
    focusResult = useRef(false),
    busy = phase === "submitting";
  usePublicMetadata(
    (kind === "confirm" ? "Confirm subscription" : "Unsubscribe") +
      " · GDG at Georgia Tech",
    { noindex: true },
  );
  useDraftGuard(busy, {
    busy,
    label: "Newsletter preference update",
    privateDraft: false,
  });
  useEffect(() => {
    const controller = new AbortController();
    operation.current = controller;
    pending.current = false;
    setPhase("loading");
    if (!token) setPhase("invalid");
    else if (localPreviewEnabled) setPhase("preview");
    else
      NewsletterService.inspectToken(kind, token, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted)
            setPhase(
              !result.valid ? "invalid" : result.applied ? "success" : "ready",
            );
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setFailedAt("validation");
            setPhase("error");
          }
        });
    return () => {
      controller.abort();
      operation.current?.abort();
    };
  }, [token, kind, attempt]);
  useEffect(() => {
    if (focusResult.current && phase !== "loading" && phase !== "submitting") {
      focusResult.current = false;
      heading.current?.focus();
    }
  }, [phase]);
  const commit = async () => {
    if (pending.current || !token) return;
    pending.current = true;
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    focusResult.current = true;
    setPhase("submitting");
    try {
      const changed = await (kind === "confirm"
        ? NewsletterService.confirmSubscription(token, controller.signal)
        : NewsletterService.unsubscribe(token, controller.signal));
      if (!controller.signal.aborted) setPhase(changed ? "success" : "invalid");
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailedAt("commit");
        setPhase(
          (error as { status?: number }).status === 410 ? "invalid" : "error",
        );
      }
    } finally {
      if (operation.current === controller) pending.current = false;
    }
  };
  const loading = phase === "loading" || busy,
    Icon = loading
      ? Loader2
      : phase === "success"
        ? CheckCircle2
        : phase === "error" || phase === "invalid"
          ? CircleAlert
          : Mail,
    title =
      phase === "loading"
        ? "Checking your link…"
        : busy
          ? "Updating your preference…"
          : phase === "ready"
            ? kind === "confirm"
              ? "Confirm your subscription."
              : "Unsubscribe from chapter newsletters."
            : phase === "preview"
              ? "You’re in the local preview."
              : phase === "invalid"
                ? "This link is no longer available."
                : phase === "error"
                  ? failedAt === "commit"
                    ? "We couldn’t confirm the result."
                    : "This link could not be checked."
                  : kind === "confirm"
                    ? "You’re on the list."
                    : "You’re unsubscribed.";
  return (
    <section className="gt-token-page">
      <div className="gt-token-sheet" aria-live="polite" aria-busy={loading}>
        <Badge>GDG on Campus · Georgia Tech</Badge>
        <Icon
          size={42}
          className={loading ? "animate-spin" : ""}
          aria-hidden="true"
        />
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p>
          {phase === "loading"
            ? "Please wait while we validate this link. Opening it does not change your email preferences."
            : busy
              ? "Wait for confirmation before leaving this page."
              : phase === "ready"
                ? kind === "confirm"
                  ? "Choose Confirm subscription to receive chapter events, workshops, and opportunities. Your subscription has not been activated by opening this page."
                  : "Choose Unsubscribe to stop chapter newsletters. Opening this page does not unsubscribe you."
                : phase === "preview"
                  ? "This preview does not check links or change newsletter preferences."
                  : phase === "invalid"
                    ? "Use a current link from a chapter email, or contact the chapter for help."
                    : phase === "error"
                      ? failedAt === "commit"
                        ? "The change may have completed. Retry to check its result safely."
                        : "Your preferences were not changed by this check. Try again when the connection is available."
                      : kind === "confirm"
                        ? "Your subscription is confirmed. Look out for chapter events, workshops, and opportunities to build."
                        : "You won’t receive further chapter newsletters. You can subscribe again whenever you’re ready."}
        </p>
        <div className="gt-inline-actions">
          {(phase === "ready" || busy) && (
            <Button onClick={() => void commit()} disabled={busy}>
              {busy
                ? "Saving…"
                : kind === "confirm"
                  ? "Confirm subscription"
                  : "Unsubscribe"}
            </Button>
          )}
          {phase === "error" && (
            <Button
              onClick={() => {
                focusResult.current = true;
                if (failedAt === "commit") void commit();
                else setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          )}
          <Link className="gt-button gt-button-secondary" to="/">
            Return home
          </Link>
          <Link className="gt-text-button" to="/contact">
            Contact the chapter
          </Link>
        </div>
      </div>
    </section>
  );
}
