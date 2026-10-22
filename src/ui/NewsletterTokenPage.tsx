import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Mail, CircleAlert } from "lucide-react";
import { PublicNewsletterService as NewsletterService } from "@/services/publicWorkflows";
import { Badge } from "./primitives";
import { localPreviewEnabled } from "./preview-data";
import { useUrlCapability } from '@/hooks/useUrlCapability';

export default function NewsletterTokenPage({
  kind,
}: {
  kind: "confirm" | "unsubscribe";
}) {
  const [token] = useUrlCapability('token',true);
  const [state, setState] = useState<
    "loading" | "success" | "error" | "preview"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState("loading");
    document.title = `${kind === "confirm" ? "Confirm subscription" : "Unsubscribe"} · GDG at Georgia Tech`;
    if (!token) {
      setState("error");
      return;
    }
    if (localPreviewEnabled) {
      setState("preview");
      return;
    }
    const operation =
      kind === "confirm"
        ? NewsletterService.confirmSubscription(token)
        : NewsletterService.unsubscribe(token);
    operation
      .then((result) => {
        if (active) setState(result ? "success" : "error");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [token, kind, attempt]);
  const Icon =
    state === "loading"
      ? Loader2
      : state === "success"
        ? CheckCircle2
        : state === "preview"
          ? Mail
          : CircleAlert;
  const title =
    state === "loading"
      ? "Checking your link…"
      : state === "preview"
        ? "You’re in the local preview."
        : state === "error"
          ? "This link couldn’t be verified."
          : kind === "confirm"
            ? "You’re on the list."
            : "You’re unsubscribed.";
  return (
    <section className="gt-token-page">
      <div
        className="gt-token-sheet"
        aria-live="polite"
        aria-busy={state === "loading"}
      >
        <Badge>GDG on Campus · Georgia Tech</Badge>
        <Icon size={42} className={state === "loading" ? "animate-spin" : ""} />
        <h1>{title}</h1>
        <p>
          {state === "loading"
            ? "Please wait while we check this request."
            : state === "preview"
              ? "No live subscription or email preferences were changed. Token verification will be connected with the production newsletter service."
              : state === "error"
                ? "The link may be missing, expired, or already used. Your email preferences have not been changed by this page."
                : kind === "confirm"
                  ? "Your subscription is confirmed. Look out for chapter events, workshops, and opportunities to build."
                  : "You won’t receive further chapter newsletters. You can subscribe again whenever you’re ready."}
        </p>
        <div className="gt-inline-actions">
          {state === "error" && token && (
            <button
              className="gt-button gt-button-primary"
              onClick={() => setAttempt(attempt + 1)}
            >
              Try again
            </button>
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
