import { useState, useEffect, type ReactNode } from "react";
import { Navigate, useLocation, Link } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";
import { PermissionsService } from "@/services/permissionsService";
import { Button, EmptyState } from "@/ui/primitives";
export default function PageAccessGuard({ children }: { children: ReactNode }) {
  const {
      currentAdmin,
      isAuthenticated,
      isLoading,
      error: sessionError,
      retrySession,
    } = useAdmin(),
    location = useLocation();
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
    if (!currentAdmin) return;
    let active = true;
    PermissionsService.canAccessPage(currentAdmin, location.pathname)
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
    };
  }, [currentAdmin, location.pathname, key, refresh]);
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
  if (decision?.key !== key)
    return (
      <div className="gt-admin-page" role="status">
        Checking access…
      </div>
    );
  if (decision.error)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="Could not check access"
          action={
            <Button onClick={() => setRefresh((v) => v + 1)}>Try again</Button>
          }
        >
          {decision.error}
        </EmptyState>
      </div>
    );
  if (!decision.allowed)
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
