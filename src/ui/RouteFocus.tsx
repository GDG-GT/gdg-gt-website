import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Focus follows actual page changes, not every URL edit. List filters, editor
// tabs, pagination and capability scrubbing keep their own interaction focus.
export default function RouteFocus() {
  const { pathname, search } = useLocation(),
    requestedInquiry = new URLSearchParams(search).get("type") || "general",
    inquiry =
      pathname === "/contact" &&
      [
        "general",
        "membership",
        "event",
        "sponsorship",
        "speaker",
        "accessibility",
      ].includes(requestedInquiry)
        ? requestedInquiry
        : "general",
    context = pathname + "\n" + inquiry,
    previous = useRef(context);
  useEffect(() => {
    if (previous.current === context) return;
    previous.current = context;
    const id =
      pathname.startsWith("/admin") && !pathname.startsWith("/admin/invite/")
        ? "workspace-content"
        : "main-content";
    const target = document.getElementById(id);
    if (target) {
      target.focus({ preventScroll: true });
      return;
    }
    // A route-lazy shell may not have mounted its landmark yet. Wait for that
    // mount, but let a visitor's intervening focus choice take precedence.
    const observer = new MutationObserver(() => {
      const ready = document.getElementById(id);
      if (!ready) return;
      stop();
      ready.focus({ preventScroll: true });
    });
    function stop() {
      observer.disconnect();
      document.removeEventListener("focusin", stop);
    }
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", stop);
    return stop;
  }, [context, pathname]);
  return null;
}
