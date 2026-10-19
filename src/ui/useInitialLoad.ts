import { useEffect, useRef } from "react";

// ContentContext's loader identities change with its data. Load once per mount,
// without turning a completed request into another request/render loop.
export function useInitialLoad(load: () => unknown) {
  const initial = useRef(load);
  useEffect(() => {
    void initial.current();
  }, []);
}
