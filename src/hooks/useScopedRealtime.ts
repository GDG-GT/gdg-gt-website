import { useEffect, useRef, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import {
  startScopedRealtime,
  type LiveScope,
  type LiveStatus,
} from "@/lib/scoped-realtime";

export function useScopedRealtime(
  scope: LiveScope | null,
  onChange: () => void,
  onDenied?: () => void,
) {
  const { currentAdmin } = useAdmin();
  const callbacks = useRef({ onChange, onDenied });
  callbacks.current = { onChange, onDenied };
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const kind = scope?.kind,
    id = scope && scope.kind !== "notifications" ? scope.id : "";
  useEffect(() => {
    if (!currentAdmin?.id || !kind) return;
    const live = startScopedRealtime({
      scope: kind !== "notifications" ? { kind, id } : { kind },
      onChange: () => callbacks.current.onChange(),
      onDenied: () => callbacks.current.onDenied?.(),
      onStatus: setStatus,
      onAccessChange: () =>
        window.dispatchEvent(new Event("gdg:access-changed")),
    });
    const visible = () => {
      if (!document.hidden) live.refresh();
    };
    const endSession = () => {
      live.stop();
      setStatus("denied");
      callbacks.current.onDenied?.();
    };
    const reauthorize = () => live.reauthorize();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("gdg:session-cleared", endSession);
    window.addEventListener("gdg:access-changed", reauthorize);
    return () => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("gdg:session-cleared", endSession);
      window.removeEventListener("gdg:access-changed", reauthorize);
      live.stop();
    };
  }, [currentAdmin?.id, kind, id]);
  return status;
}
