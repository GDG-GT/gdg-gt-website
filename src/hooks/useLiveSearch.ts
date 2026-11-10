import { useEffect, useRef } from "react";

/** Keep typing responsive while coalescing search reads and cancelling stale input. */
export function useLiveSearch(
  value: string,
  committed: string,
  apply: (value: string) => void,
  enabled = true,
) {
  const latest = useRef(apply);
  latest.current = apply;
  useEffect(() => {
    if (!enabled || value === committed) return;
    const timer = window.setTimeout(() => latest.current(value), 200);
    return () => window.clearTimeout(timer);
  }, [value, committed, enabled]);
}
