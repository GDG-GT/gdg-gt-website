import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import {
  SiteAvailabilityContext as Context,
  useSiteAvailability,
  type SiteState,
} from "@/contexts/SiteAvailabilityContext";
import {
  publicSiteStatus,
  maintenanceExemptPath,
} from "../../../shared/site-status.mjs";
const storageKey = "gdg:public-availability:v1";
function offlineSnapshot(): SiteState | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      !saved ||
      !Number.isFinite(saved.at) ||
      Date.now() - saved.at > 30 * 86400000 ||
      saved.at > Date.now() + 60000
    )
      return;
    const v = publicSiteStatus.safeParse(saved.status);
    if (v.success) return v.data;
  } catch {
    /* Public snapshot is optional; no credentials or private state are stored. */
  }
}
export default function SiteAvailability({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<SiteState>(),
    [unavailable, setUnavailable] = useState(false),
    [tick, setTick] = useState(0);
  const { pathname } = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const c = new AbortController();
    const timeout = window.setTimeout(() => {
      c.abort();
      setUnavailable(true);
      setStatus((previous) => previous || offlineSnapshot());
    }, 5000);
    api<SiteState>("/site-status", { signal: c.signal })
      .then((raw) => {
        const safe = publicSiteStatus.safeParse(raw);
        if (!safe.success) throw Error("Invalid public status");
        if (c.signal.aborted) return;
        setStatus(safe.data);
        setUnavailable(false);
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ at: Date.now(), status: safe.data }),
          );
        } catch {
          /* Storage may be disabled. */
        }
      })
      .catch(() => {
        if (c.signal.aborted) return;
        setUnavailable(true);
        setStatus((previous) => previous || offlineSnapshot());
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      c.abort();
    };
  }, [tick]);
  useEffect(() => {
    const refresh = () => setTick((v) => v + 1),
      timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("gdg:site-status-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("gdg:site-status-changed", refresh);
    };
  }, []);
  useEffect(() => {
    if (status?.is_live === false && !maintenanceExemptPath(pathname))
      navigate(
        status.auto_redirect && status.redirect_url.startsWith("/l/")
          ? status.redirect_url
          : "/maintenance",
        { replace: true },
      );
  }, [
    status?.is_live,
    status?.revision,
    status?.redirect_url,
    status?.auto_redirect,
    pathname,
    navigate,
  ]);
  if (!status && !unavailable && !maintenanceExemptPath(pathname))
    return (
      <div className="gt-container gt-route-loading" role="status">
        Checking site availability…
      </div>
    );
  return (
    <Context.Provider
      value={{ status, unavailable, refresh: () => setTick((v) => v + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
export function MaintenanceBanner() {
  const { status, unavailable } = useSiteAvailability();
  if (status?.is_live !== false) return null;
  return (
    <aside className="gt-maintenance-banner" aria-label="Site availability">
      <p>
        <strong>Maintenance is in progress.</strong>{" "}
        {unavailable ? "Showing the last available public status. " : ""}
        <Link to="/maintenance">View chapter updates</Link>
      </p>
    </aside>
  );
}
export function MaintenanceContent({
  status,
  preview = false,
}: {
  status?: SiteState;
  preview?: boolean;
}) {
  const Heading = preview ? "h3" : "h1";
  return (
    <section className="gt-container gt-maintenance-content">
      <span className="gt-section-note">CHAPTER UPDATE</span>
      <Heading>A little work behind the scenes.</Heading>
      <p style={{ whiteSpace: "pre-wrap" }}>
        {status?.message ||
          "The chapter website is taking a short break while we make improvements."}
      </p>
      {status?.redirect_url &&
        (preview ? (
          <span className="gt-button gt-button-secondary" aria-disabled="true">
            {status.button_text} (preview)
          </span>
        ) : status.redirect_url.startsWith("/") ? (
          <Link
            className="gt-button gt-button-primary"
            to={status.redirect_url}
          >
            {status.button_text}
          </Link>
        ) : (
          <a
            className="gt-button gt-button-primary"
            href={status.redirect_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {status.button_text} (opens a new tab)
          </a>
        ))}
      <div className="gt-inline-actions">
        <Link to="/privacy">Privacy</Link>
        <Link to="/accessibility">Accessibility</Link>
      </div>
    </section>
  );
}
export function MaintenancePage() {
  const { status, unavailable, refresh } = useSiteAvailability();
  useEffect(() => {
    document.title = "Site maintenance · GDG at Georgia Tech";
  }, []);
  return (
    <>
      <MaintenanceContent status={status} />
      <section className="gt-container gt-maintenance-check">
        <p role="status">
          {unavailable
            ? "You may be offline. Showing available public information."
            : status?.is_live
              ? "The site is live again. You can return to the home page."
              : "Please check chapter updates while we finish maintenance."}
        </p>
        {status?.is_live && (
          <Link className="gt-button gt-button-primary" to="/">
            Return home
          </Link>
        )}
        <button className="gt-button gt-button-secondary" onClick={refresh}>
          Check again
        </button>
      </section>
    </>
  );
}
