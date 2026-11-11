import { useWorkspaceReadiness } from "@/contexts/WorkspaceReadinessContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";

// Each independent view owns its request, error and last successful snapshot.
// A changed key hides the old snapshot during render, before effect cleanup.
export function usePrivateRead<T>(path: string | undefined, refresh: number) {
  const active = useRef<AbortController>();
  const clear = useCallback(() => {
    active.current?.abort();
    setSnapshot(undefined);
    setRequest((previous) => ({ ...previous, loading: false }));
  }, []);
  const [snapshot, setSnapshot] = useState<{
      path: string;
      value: T;
      at: string;
    }>(),
    [request, setRequest] = useState<{
      path: string | undefined;
      refresh: number;
      loading: boolean;
      error: string;
      denied: boolean;
    }>({ path, refresh, loading: !!path, error: "", denied: false });
  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    setRequest({ path, refresh, loading: !!path, error: "", denied: false });
    if (!path) return () => controller.abort();
    api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted)
          setSnapshot({ path, value, at: new Date().toISOString() });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const denied =
          error instanceof ApiFailure && [401, 403, 404].includes(error.status);
        if (denied) setSnapshot(undefined);
        setRequest({
          path,
          refresh,
          loading: false,
          denied,
          error:
            error instanceof Error
              ? error.message
              : "This information could not load. Try again.",
        });
      })
      .finally(() => {
        if (!controller.signal.aborted)
          setRequest((previous) =>
            previous.path === path && previous.refresh === refresh
              ? { ...previous, loading: false }
              : previous,
          );
      });
    return () => controller.abort();
  }, [path, refresh]);
  const matching = snapshot?.path === path ? snapshot : undefined;
  const currentRequest = request.path === path && request.refresh === refresh;
  useWorkspaceReadiness(!!path && (!currentRequest || request.loading));
  return {
    data: matching?.value,
    at: matching?.at,
    loading: !!path && (!currentRequest || request.loading),
    error: currentRequest ? request.error : "",
    denied: currentRequest && request.denied,
    clear,
  };
}
