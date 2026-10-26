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
    const target = document.getElementById(
      pathname.startsWith("/admin") && !pathname.startsWith("/admin/invite/")
        ? "workspace-content"
        : "main-content",
    );
    target?.focus({ preventScroll: true });
  }, [context, pathname]);
  return null;
}
