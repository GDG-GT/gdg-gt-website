import { useCallback, useEffect, useRef, useState } from "react";

// Callers own field state, validation, permission checks and retry keys.
export function usePrivateMutation(scope: string) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true),
    activeRequest = useRef<AbortController>(),
    pending = useRef(false),
    currentScope = useRef(scope),
    requestScope = useRef(scope);
  currentScope.current = scope;
  const cancel = useCallback(() => {
    activeRequest.current?.abort();
    activeRequest.current = undefined;
    pending.current = false;
    if (mounted.current) setBusy(false);
  }, []);
  useEffect(() => {
    mounted.current = true;
    setBusy(false);
    return () => {
      mounted.current = false;
      cancel();
    };
  }, [scope, cancel]);
  useEffect(() => {
    window.addEventListener("gdg:session-cleared", cancel);
    return () => window.removeEventListener("gdg:session-cleared", cancel);
  }, [cancel]);
  const begin = useCallback(() => {
    if (pending.current || !mounted.current || !navigator.onLine) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    requestScope.current = currentScope.current;
    pending.current = true;
    setBusy(true);
    return controller;
  }, []);
  const current = useCallback(
    (controller: AbortController) =>
      mounted.current &&
      activeRequest.current === controller &&
      !controller.signal.aborted &&
      currentScope.current === requestScope.current,
    [],
  );
  const finish = useCallback((controller: AbortController) => {
    if (mounted.current && activeRequest.current === controller) {
      activeRequest.current = undefined;
      pending.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, begin, current, finish, cancel, pending };
}
