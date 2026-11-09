import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
/** Action results stay visible even when the triggering button is below the fold. */
export default function ActionFeedback({
  message,
  tone = "success",
  children,
}: {
  message: string;
  tone?: "success" | "error";
  children?: ReactNode;
}) {
  const [mount, setMount] = useState<HTMLElement>();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    let stack = document.getElementById("gdg-action-feedback");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "gdg-action-feedback";
      stack.className = "gt-action-feedback-stack";
      document.body.appendChild(stack);
    }
    setMount(stack);
  }, []);
  useEffect(() => {
    setDismissed(false);
    if (tone !== "success" || children) return;
    const timer = window.setTimeout(() => setDismissed(true), 5000);
    return () => window.clearTimeout(timer);
  }, [message, tone, children]);
  if (!message || dismissed) return null;
  const content = (
    <section
      role={tone === "error" ? "alert" : "status"}
      className={`gt-action-feedback gt-action-feedback-${tone}`}
    >
      {tone === "error" ? (
        <AlertCircle aria-hidden="true" size={20} />
      ) : (
        <CheckCircle2 aria-hidden="true" size={20} />
      )}
      <div className="gt-action-feedback-body">
        <p>{message}</p>
        {children}
      </div>
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={() => setDismissed(true)}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
  return mount ? createPortal(content, mount) : content;
}
