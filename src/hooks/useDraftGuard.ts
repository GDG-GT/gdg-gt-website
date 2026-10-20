import { useContext, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  NavigationSafetyContext,
  type DraftState,
} from "@/contexts/NavigationSafetyContext";
export function useDraftGuard(
  dirty: boolean,
  {
    busy = false,
    label = "Unsaved work",
    privateDraft = true,
  }: Partial<Omit<DraftState, "dirty">> = {},
) {
  const context = useContext(NavigationSafetyContext),
    id = useRef(Symbol("draft"));
  const current = useRef<DraftState>({ dirty, busy, label, privateDraft });
  current.current = { dirty, busy, label, privateDraft };
  useEffect(
    () => context?.register(id.current, () => current.current),
    [context],
  );
  useEffect(() => {
    context?.changed();
  }, [context, dirty, busy]);
}
export function useNavigationSafety() {
  return useContext(NavigationSafetyContext);
}
// For an editor's own navigation only AFTER its local discard check or successful
// commit. Browser Back/Forward and ordinary links still pass through the blocker.
export function useApprovedSearchParams() {
  const [params, setParams] = useSearchParams(),
    context = useNavigationSafety();
  const approved: typeof setParams = (next, options) => {
    const run = () => setParams(next, options);
    if (context) context.allow(run);
    else run();
  };
  return [params, approved] as const;
}
