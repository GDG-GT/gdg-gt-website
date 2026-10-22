import { useEffect, useRef, useState } from "react";
/** One private operation at a time; late results cannot cross unmount/logout. */
export function usePrivateOperation() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0),
    pending = useRef<AbortController>(),
    running = useRef(false);
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      pending.current?.abort();
    };
    const clear = () => {
      invalidate();
      running.current = false;
      setBusy(false);
      setError("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  async function work<T>(
    task: (signal: AbortSignal) => Promise<T>,
    done: (result: T) => void,
  ) {
    if (running.current) return;
    running.current = true;
    const current = generation.current,
      controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    try {
      const value = await task(controller.signal);
      if (current === generation.current) done(value);
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (current === generation.current) {
        running.current = false;
        setBusy(false);
      }
    }
  }
  return { busy, error, setError, work };
}
