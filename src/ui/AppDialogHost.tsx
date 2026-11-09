import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { appDialogs } from "@/lib/app-dialogs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "./primitives";
export default function AppDialogHost() {
  const request = useSyncExternalStore(
    appDialogs.subscribe,
    appDialogs.snapshot,
    () => null,
  );
  const location = useLocation();
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", appDialogs.cancelAll);
    return () => {
      window.removeEventListener("gdg:session-cleared", appDialogs.cancelAll);
      appDialogs.cancelAll();
    };
  }, []);
  useEffect(() => {
    appDialogs.cancelAll();
  }, [location.pathname, location.search]);
  return (
    <Dialog
      open={!!request}
      onOpenChange={(open) => {
        if (!open) appDialogs.settle(false);
      }}
    >
      {request && (
        <DialogContent>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>{request.message}</DialogDescription>
          <div className="gt-dialog-actions">
            <Button
              variant="secondary"
              onClick={() => appDialogs.settle(false)}
            >
              {request.cancelLabel || "Keep editing"}
            </Button>
            <Button
              variant={request.danger ? "danger" : "primary"}
              onClick={() => appDialogs.settle(true)}
            >
              {request.confirmLabel || "Discard changes"}
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
