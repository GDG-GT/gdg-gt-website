import { useState, useEffect, useContext, type ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";
import { PermissionsService } from "@/services/permissionsService";
import { Button, EmptyState } from "@/ui/primitives";
import { WorkspaceAccessContext } from "@/contexts/WorkspaceAccessContext";
export default function PageAccessGuard({ children }: { children: ReactNode }) {
  const {
      currentAdmin,
      isAuthenticated,
      isLoading,
      error: sessionError,
      retrySession,
    } = useAdmin(),
    location = useLocation();
  const workspaceAccess = useContext(WorkspaceAccessContext);
  // The shell already refreshes this exact route inventory on navigation.
  // Record-specific routes retain their separate server permission checks.
  const sharedRoute =
    !!workspaceAccess && /^\/admin(?:\/[^/]+)?$/.test(location.pathname);
  const [refresh, setRefresh] = useState(0),
    [decision, setDecision] = useState<{
      key: string;
      allowed?: boolean;
      error?: string;
    }>();
  const key =
    location.pathname +
    ":" +
    (currentAdmin?.id || "") +
    ":" +
    currentAdmin?.role;
  useEffect(() => {
    if (!currentAdmin || sharedRoute) return;
    let active = true;
    const controller = new AbortController();
    PermissionsService.canAccessPage(
      currentAdmin,
      location.pathname,
      controller.signal,
    )
      .then((allowed) => {
        if (active) setDecision({ key, allowed });
      })
      .catch(() => {
        if (active)
          setDecision({
            key,
            error:
              "Access could not be checked. Your saved work has not been changed.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [currentAdmin, location.pathname, key, refresh, sharedRoute]);
  const snapshot = workspaceAccess?.snapshot;
  const resolved = sharedRoute
    ? snapshot && snapshot.actor === currentAdmin
      ? { key, allowed: snapshot.routes.includes(location.pathname) }
      : workspaceAccess.failed
        ? {
            key,
            error:
              "Access could not be checked. Your saved work has not been changed.",
          }
        : undefined
    : decision;
  if (isLoading)
    return (
      <div className="gt-admin-page" role="status">
        Loading your workspace…
      </div>
    );
  if (!isAuthenticated && sessionError)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="Your workspace is temporarily unavailable"
          action={
            <Button onClick={() => void retrySession()}>Try again</Button>
          }
        >
          {sessionError}
        </EmptyState>
      </div>
    );
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (resolved?.key !== key)
    return (
      <div className="gt-admin-page" role="status">
        Checking access…
      </div>
    );
  if (resolved.error)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="Could not check access"
          action={
            <Button
              onClick={() =>
                sharedRoute ? workspaceAccess.retry() : setRefresh((v) => v + 1)
              }
            >
              Try again
            </Button>
          }
        >
          {resolved.error}
        </EmptyState>
      </div>
    );
  if (!resolved.allowed)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="This workspace is restricted"
          action={
            <Link to="/admin" className="gt-button gt-button-secondary">
              Back to dashboard
            </Link>
          }
        >
          Your current account does not have access to this page. Ask a chapter
          administrator if your responsibilities have changed.
        </EmptyState>
      </div>
    );
  return <>{children}</>;
}
