import { useEffect, useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** A bounded record workspace keeps the directory and its scroll position intact. */
export default function RecordPanel({
  title, children, onClose, busy = false, className = "",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
}) {
  const opener = useRef(document.activeElement as HTMLElement | null),
    content = useRef<HTMLDivElement>(null);
  const focusHeading = () => {
    const feedback = content.current?.querySelector<HTMLElement>('[role="status"][tabindex="-1"], [role="alert"][tabindex="-1"]');
    if (feedback) { feedback.focus({ preventScroll: true }); return; }
    const heading = content.current?.querySelector<HTMLElement>(".gt-record-panel-body h2, .gt-record-panel-body h3");
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    else content.current?.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (document.activeElement === document.body) focusHeading();
  });
  return (
    <Dialog open modal={false} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent ref={content} role="region" className="gt-record-dialog" closeDisabled={busy} aria-describedby={undefined}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (["status", "alert"].includes(document.activeElement?.getAttribute("role") || "")) return;
          focusHeading();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (document.activeElement && document.activeElement !== document.body && !content.current?.contains(document.activeElement)) return;
          if (opener.current?.isConnected && !opener.current.closest('[aria-hidden="true"]'))
            opener.current.focus({ preventScroll: true });
          else document.getElementById("workspace-content")?.focus({ preventScroll: true });
        }}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className={`gt-record-panel-body ${className}`}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
