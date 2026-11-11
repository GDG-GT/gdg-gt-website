import { createContext, useContext, useLayoutEffect, useRef, useState, useCallback, type ReactNode } from "react";
const Readiness = createContext<((id: object, pending: boolean | null) => void) | null>(null);
/** Collect the initial route's reads before revealing its final layout. Refreshes retain their own UI. */
export function WorkspaceReadinessProvider({ children }: { children: ReactNode }) {
  const reads = useRef(new Map<object, boolean>()), released = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>();
  const [ready, setReady] = useState(false);
  const update = useCallback((id:object,pending:boolean|null) => {
    if(released.current)return;
    if(pending===null)reads.current.delete(id);else reads.current.set(id,pending);
    clearTimeout(timer.current);
    if(![...reads.current.values()].some(Boolean))timer.current=setTimeout(()=>{if(![...reads.current.values()].some(Boolean)){released.current=true;setReady(true)}},0);
  },[]);
  useLayoutEffect(()=>{const id={};update(id,false);return()=>{clearTimeout(timer.current)}},[update]);
  return <Readiness.Provider value={update}><div className="gt-workspace-readiness">
    {!ready && <div role="status" aria-label="Loading workspace" className="gt-workspace-loading"><div className="gt-skeleton gt-loading-heading"/><div className="gt-skeleton gt-detail-skeleton"/><span className="sr-only">Loading workspace…</span></div>}
    <div hidden={!ready}>{children}</div>
  </div></Readiness.Provider>;
}
export function useWorkspaceReadiness(pending:boolean) {
  const update=useContext(Readiness),id=useRef<object>({});
  useLayoutEffect(()=>{update?.(id.current,pending)},[pending,update]);
  useLayoutEffect(()=>{const key=id.current;return()=>update?.(key,null)},[update]);
}

export function WorkspaceLoading({children = "Loading workspace…"}:{children?:ReactNode}){useWorkspaceReadiness(true);return <div className="gt-admin-page" role="status">{children}</div>;}
