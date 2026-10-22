import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "react-router-dom";
import * as Alert from "@radix-ui/react-alert-dialog";
import { createDraftRegistry } from "@/lib/draft-registry.mjs";
import {
  NavigationSafetyContext,
  type NavigationSafetyValue,
  type DraftState,
} from "@/contexts/NavigationSafetyContext";
import { Button } from "./primitives";
import { navigationChangesContext } from '../../shared/capability-navigation';
export default function NavigationSafety({
  children,
}: {
  children: ReactNode;
}) {
  const registry = useRef(createDraftRegistry()).current;
  const [version, setVersion] = useState(0),
    [pending, setPending] = useState<(() => void) | null>(null);
  const pendingRef = useRef<(() => void) | null>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    stay = useRef<HTMLButtonElement>(null);
  const changed = useCallback(() => setVersion((v) => v + 1), []);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      navigationChangesContext(currentLocation,nextLocation) &&
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
      <Alert.Root
        open={open}
        onOpenChange={(value) => {
          if (!value) cancel();
        }}
      >
        <Alert.Portal>
          <Alert.Overlay className="gt-navigation-backdrop" />
          <Alert.Content
            className="gt-navigation-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              previousFocus.current = document.activeElement as HTMLElement;
              stay.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (previousFocus.current?.isConnected)
                previousFocus.current.focus();
            }}
          >
            <Alert.Title asChild>
              <h2>
                {busy ? "An operation is still running" : "Leave unsaved work?"}
              </h2>
            </Alert.Title>
            <Alert.Description asChild>
              <p>
                {busy
                  ? "Stay here until the current operation finishes so you can see whether it succeeded."
                  : "Leaving may discard edits or unsent text. Stay to save or finish your work first."}
              </p>
            </Alert.Description>
            {states.length > 0 && (
              <ul>
                {[...new Set(states.map((s) => s.label))].map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            )}
            <div className="gt-button-row">
              <Alert.Cancel
                ref={stay}
                className="gt-button gt-button-secondary"
              >
                Stay here
              </Alert.Cancel>
              {!busy && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const action = pendingRef.current;
                    pendingRef.current = null;
                    setPending(null);
                    if (blocker.state === "blocked") blocker.proceed();
                    else if (action) registry.allow(action);
                  }}
                >
                  Discard and leave
                </Button>
              )}
            </div>
          </Alert.Content>
        </Alert.Portal>
      </Alert.Root>
    </NavigationSafetyContext.Provider>
  );
}
