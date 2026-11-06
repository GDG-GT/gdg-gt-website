import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router-dom";
import { createDraftRegistry } from "@/lib/draft-registry.mjs";
import {
  NavigationSafetyContext,
  type NavigationSafetyValue,
  type DraftState,
} from "@/contexts/NavigationSafetyContext";
import NavigationReview from "./NavigationReview";
import { navigationChangesContext } from "../../shared/capability-navigation";
export default function NavigationSafety({
  children,
}: {
  children: ReactNode;
}) {
  const registry = useRef(createDraftRegistry()).current;
  const [version, setVersion] = useState(0),
    [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      navigationChangesContext(currentLocation, nextLocation) &&
      registry.shouldBlock(),
  );
  const states = registry.states() as DraftState[],
    busy = states.some((s) => s.busy),
    open = blocker.state === "blocked" || !!pending;
  const context = useMemo<NavigationSafetyValue>(
    () => ({
      register: (id, read) => {
        const remove = registry.register(id, read);
        changed();
        return () => {
          remove();
          changed();
        };
      },
      changed,
      allow: (run) => {
        registry.allow(run);
      },
      request: (run) => {
        if (!registry.shouldBlock()) {
          run();
          return;
        }
        if (pendingRef.current) return;
        pendingRef.current = run;
        setPending(() => run);
      },
    }),
    [registry, changed],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (registry.shouldBlock()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const clear = () => {
      registry.clearPrivate();
      changed();
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, [registry, changed]);
  useEffect(() => {
    if (!registry.states().length && blocker.state === "blocked")
      blocker.proceed();
  }, [version, blocker, registry]);
  const cancel = () => {
    pendingRef.current = null;
    setPending(null);
    if (blocker.state === "blocked") blocker.reset();
  };
  return (
    <NavigationSafetyContext.Provider value={context}>
      {children}
      {open && (
        <NavigationReview
          busy={busy}
          labels={[...new Set(states.map((state) => state.label))]}
          cancel={cancel}
          discard={() => {
            const action = pendingRef.current;
            pendingRef.current = null;
            setPending(null);
            if (blocker.state === "blocked") blocker.proceed();
            else if (action) registry.allow(action);
          }}
        />
      )}
    </NavigationSafetyContext.Provider>
  );
}
