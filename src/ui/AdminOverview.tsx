import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  Users,
  Heart,
  Activity,
  Mail,
} from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, EmptyState } from "./primitives";
import { RegistrationChart, FundingChart } from "./DashboardCharts";
import PersonalWork from "./PersonalWork";
type Widget<T> =
  | { state: "ready"; data: T }
  | { state: "error"; message: string };
type Dashboard = {
  allowedRoutes: string[];
  generatedAt: string;
  widgets: {
    events?: Widget<{
      count: number;
      items: {
        id: string;
        title: string;
        start_at: string;
        timezone: string;
        publication_status: string;
      }[];
    }>;
    profiles?: Widget<{ count: number }>;
    finances?: Widget<{ pending: number }>;
    messages: Widget<{ unread: number }>;
    registrations?: Widget<{
      totalEvents: number;
      items: {
        id: string;
        title: string;
        internal: number;
        external: number;
      }[];
    }>;
    funding?: Widget<{
      items: { status: string; count: number; amount: string }[];
    }>;
    activity: Widget<{
      items: {
        id: string;
        action: string;
        result: string;
        created_at: string;
      }[];
    }>;
    tasks: Widget<{
      items: {
        id: string;
        title: string;
        status: string;
        due_date: string | null;
        priority: string;
      }[];
    }>;
    memberships: Widget<{
      items: { id: string; name: string; role: string }[];
    }>;
  };
};
function Section<T>({
  widget,
  children,
  label,
  retry,
  disabled,
}: {
  widget?: Widget<T>;
  label: string;
  retry: () => void;
  disabled: boolean;
  children: (data: T) => ReactNode;
}) {
  if (!widget) return null;
  return widget.state === "error" ? (
    <div role="alert" className="gt-form-error">
      <p>{widget.message}</p>
      <Button variant="ghost" disabled={disabled} onClick={retry}>
        Retry {label}
      </Button>
    </div>
  ) : (
    children(widget.data)
  );
}
export default function AdminOverview() {
  const [params] = useSearchParams(),
    view = params.get("view"),
    { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  const key = `${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`;
  if (!currentAdmin) return null;
  return view === "tasks" || view === "messages" ? (
    <PersonalWork key={key} view={view} />
  ) : (
    <Overview key={key} />
  );
}
function Overview() {
  const { currentAdmin } = useAdmin();
  const [refresh, setRefresh] = useState(0),
    [blocked, setBlocked] = useState(false);
  const read = usePrivateRead<Dashboard>("/admin/dashboard", refresh),
    data = read.data,
    busy = read.loading,
    error = read.error,
    clear = read.clear,
    { isOnline } = useOnlineStatus();
  useEffect(() => {
    if (read.denied) {
      setBlocked(true);
      clear();
    }
  }, [read.denied, clear]);
  const load = () => {
    setRefresh((value) => value + 1);
  };
  const retry = () => {
    load();
    document.getElementById("workspace-content")?.focus();
  };
  const ready = !!data && !busy && !error && isOnline;
  if (blocked || read.denied)
    return (
      <EmptyState
        title="Overview access needs to be rechecked"
        action={
          <Button
            disabled={!isOnline}
            onClick={() => {
              setBlocked(false);
              retry();
            }}
          >
            Recheck overview access
          </Button>
        }
      >
        Previous private overview data has been cleared. Recheck current access
        before continuing.
      </EmptyState>
    );
  return (
    <div className="gt-admin-page" aria-busy={busy}>
      <header className="gt-admin-page-heading">
        <div>
          <p className="gt-breadcrumb">Your chapter, at a glance</p>
          <h1>
            Welcome back
            {currentAdmin?.display_name
              ? `, ${currentAdmin.display_name.split(" ")[0]}`
              : ""}
            .
          </h1>
          <p>Events, work, and updates you have access to.</p>
        </div>
        <Button variant="secondary" disabled={busy || !isOnline} onClick={load}>
          Refresh overview
        </Button>
      </header>
      {!isOnline && (
        <p role="status">
          You are offline. Refresh waits for connectivity.
          {read.at && (
            <>
              {" "}
              Overview snapshot from{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              .
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {error && (
        <Button
          variant="secondary"
          disabled={!isOnline || busy}
          onClick={retry}
        >
          Retry overview
        </Button>
      )}
      {busy && !data && (
        <div role="status" aria-label="Loading your workspace">
          <div className="gt-kpi-grid">
            {[1, 2, 3, 4].map((key) => (
              <div className="gt-skeleton gt-overview-placeholder" key={key} />
            ))}
          </div>
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading your workspace…</span>
        </div>
      )}
      {data && (busy || error) && (
        <p role="status" className="gt-helper">
          Showing the overview loaded at{" "}
          {new Date(data.generatedAt).toLocaleString()} until the current
          request succeeds.
        </p>
      )}
      {data && (
        <>
          <div className="gt-kpi-grid">
            <Section
              widget={data.widgets.messages}
              label="unread messages"
              retry={retry}
              disabled={busy || !isOnline}
            >
              {(w) => (
                <Link to="/admin?view=messages" className="gt-kpi">
                  <Mail size={20} />
                  <strong>{w.unread}</strong>
                  <span>Your unread messages</span>
                </Link>
              )}
            </Section>
            <Section
              widget={data.widgets.events}
              label="event count"
              retry={retry}
              disabled={busy || !isOnline}
            >
              {(w) => (
                <Link to="/admin/events" className="gt-kpi">
                  <CalendarDays size={20} />
                  <strong>{w.count}</strong>
                  <span>Events in your scope</span>
                </Link>
              )}
            </Section>
            <Section
              widget={data.widgets.profiles}
              label="team profiles"
              retry={retry}
              disabled={busy || !isOnline}
            >
              {(w) => (
                <Link to="/admin/team" className="gt-kpi">
                  <Users size={20} />
                  <strong>{w.count}</strong>
                  <span>Published team profiles</span>
                </Link>
              )}
            </Section>
            <Section
              widget={data.widgets.finances}
              label="finance summary"
              retry={retry}
              disabled={busy || !isOnline}
            >
              {(w) => (
                <Link to="/admin/finances" className="gt-kpi">
                  <Heart size={20} />
                  <strong>{w.pending}</strong>
                  <span>Pending finance requests</span>
                </Link>
              )}
            </Section>
          </div>
          <div className="gt-dashboard-layout">
            <div className="gt-dashboard-main">
              <div className="gt-dashboard-panels">
                {data.widgets.registrations && (
                  <section className="gt-panel">
                    <h2>Registrations by event</h2>
                    <Section
                      widget={data.widgets.registrations}
                      label="registrations"
                      retry={retry}
                      disabled={busy || !isOnline}
                    >
                      {(w) => <RegistrationChart {...w} />}
                    </Section>
                  </section>
                )}
                {data.widgets.funding && (
                  <section className="gt-panel">
                    <h2>Funding status</h2>
                    <Section
                      widget={data.widgets.funding}
                      label="funding"
                      retry={retry}
                      disabled={busy || !isOnline}
                    >
                      {(w) => <FundingChart {...w} />}
                    </Section>
                  </section>
                )}
              </div>
              {data.widgets.events && (
                <section className="gt-panel">
                  <div className="gt-panel-heading">
                    <h2>Upcoming events</h2>
                    <Link to="/admin/events">
                      Manage events <ArrowUpRight size={14} />
                    </Link>
                  </div>
                  <Section
                    widget={data.widgets.events}
                    label="upcoming events"
                    retry={retry}
                    disabled={busy || !isOnline}
                  >
                    {(w) =>
                      w.items.length ? (
                        <div className="gt-upcoming-list">
                          {w.items.map((event) => (
                            <Link to="/admin/events" key={event.id}>
                              <span className="gt-mini-date">
                                <small>
                                  {new Date(event.start_at).toLocaleDateString(
                                    "en-US",
                                    {
                                      month: "short",
                                      timeZone: event.timezone,
                                    },
                                  )}
                                </small>
                                <strong>
                                  {new Date(event.start_at).toLocaleDateString(
                                    "en-US",
                                    {
                                      day: "numeric",
                                      timeZone: event.timezone,
                                    },
                                  )}
                                </strong>
                              </span>
                              <div>
                                <h3>{event.title}</h3>
                                <p>
                                  {new Date(event.start_at).toLocaleString(
                                    "en-US",
                                    { timeZone: event.timezone },
                                  )}{" "}
                                  · {event.timezone} ·{" "}
                                  {event.publication_status}
                                </p>
                              </div>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <EmptyState title="No upcoming events">
                          Upcoming events in your scope will appear here.
                        </EmptyState>
                      )
                    }
                  </Section>
                </section>
              )}
              <section className="gt-panel">
                <h2>Quick actions</h2>
                {!ready && (
                  <p role="status">
                    Refresh the overview to check current shortcuts.
                  </p>
                )}
                <div className="gt-quick-actions">
                  {[
                    ["/admin/events", "Plan an event"],
                    ["/admin/forms", "Build a form"],
                    ["/admin/content", "Update the site"],
                    ["/admin/teams", "Manage your teams"],
                  ]
                    .filter(
                      ([href]) => ready && data.allowedRoutes.includes(href),
                    )
                    .map(([href, label]) => (
                      <Link to={href} key={href}>
                        <h3>{label}</h3>
                        <ArrowUpRight size={18} />
                      </Link>
                    ))}
                </div>
              </section>
              <section className="gt-panel">
                <h2>Your teams</h2>
                <Section
                  widget={data.widgets.memberships}
                  label="team memberships"
                  retry={retry}
                  disabled={busy || !isOnline}
                >
                  {(w) =>
                    w.items.length ? (
                      <ul>
                        {w.items.map((team) => (
                          <li key={team.id}>
                            <Link to={"/admin/team/" + team.id}>
                              {team.name}
                            </Link>{" "}
                            · {team.role.replace(/_/g, " ")}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title="No team memberships">
                        Your account can be assigned to a team by a chapter
                        administrator.
                      </EmptyState>
                    )
                  }
                </Section>
              </section>
            </div>
            <aside className="gt-dashboard-rail">
              <section className="gt-panel">
                <h2>Assigned to you</h2>
                <Section
                  widget={data.widgets.tasks}
                  label="assigned tasks"
                  retry={retry}
                  disabled={busy || !isOnline}
                >
                  {(w) =>
                    w.items.length ? (
                      <ul>
                        {w.items.map((task) => (
                          <li key={task.id}>
                            <Link to={"/admin?view=tasks&task=" + task.id}>
                              {task.title}
                            </Link>
                            <p>
                              {task.status} · {task.priority}
                              {task.due_date ? ` · Due ${task.due_date}` : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyState title="Nothing assigned right now">
                        Your assigned tasks will appear here.
                      </EmptyState>
                    )
                  }
                </Section>
              </section>
              <section className="gt-panel gt-activity-panel">
                <div className="gt-panel-heading">
                  <h2>Your recent activity</h2>
                  <Activity size={17} />
                </div>
                <Section
                  widget={data.widgets.activity}
                  label="recent activity"
                  retry={retry}
                  disabled={busy || !isOnline}
                >
                  {(w) =>
                    w.items.length ? (
                      w.items.map((item) => (
                        <div className="gt-activity-entry" key={item.id}>
                          <div>
                            <strong>{item.action.replace(/[_.]/g, " ")}</strong>
                            <p>{item.result}</p>
                            <small>
                              {new Date(item.created_at).toLocaleString()}
                            </small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState title="No recent activity" />
                    )
                  }
                </Section>
              </section>
            </aside>
          </div>
          <p className="gt-helper">
            Updated {new Date(data.generatedAt).toLocaleString()}. Counts
            reflect your current access.
          </p>
        </>
      )}
    </div>
  );
}
