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
import { api } from "@/lib/api";
import { Button, EmptyState } from "./primitives";
import { RegistrationChart, FundingChart } from "./DashboardCharts";
import PersonalWork from "./PersonalWork";
type Widget<T> =
  { state: "ready"; data: T } | { state: "error"; message: string };
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
}: {
  widget?: Widget<T>;
  children: (data: T) => ReactNode;
}) {
  if (!widget) return null;
  return widget.state === "error" ? (
    <p role="status" className="gt-form-error">
      {widget.message}
    </p>
  ) : (
    children(widget.data)
  );
}
export default function AdminOverview() {
  const [params] = useSearchParams(),
    view = params.get("view");
  return view === "tasks" || view === "messages" ? (
    <PersonalWork view={view} />
  ) : (
    <Overview />
  );
}
function Overview() {
  const { currentAdmin } = useAdmin();
  const [data, setData] = useState<Dashboard>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const load = async () => {
    setBusy(true);
    setError("");
    try {
      setData(await api<Dashboard>("/admin/dashboard"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
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
        <Button variant="secondary" disabled={busy} onClick={() => void load()}>
          Refresh overview
        </Button>
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
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
          {new Date(data.generatedAt).toLocaleTimeString()} until the current
          request succeeds.
        </p>
      )}
      {data && (
        <>
          <div className="gt-kpi-grid">
            <Section widget={data.widgets.messages}>
              {(w) => (
                <Link to="/admin?view=messages" className="gt-kpi">
                  <Mail size={20} />
                  <strong>{w.unread}</strong>
                  <span>Your unread messages</span>
                </Link>
              )}
            </Section>
            <Section widget={data.widgets.events}>
              {(w) => (
                <Link to="/admin/events" className="gt-kpi">
                  <CalendarDays size={20} />
                  <strong>{w.count}</strong>
                  <span>Events in your scope</span>
                </Link>
              )}
            </Section>
            <Section widget={data.widgets.profiles}>
              {(w) => (
                <Link to="/admin/team" className="gt-kpi">
                  <Users size={20} />
                  <strong>{w.count}</strong>
                  <span>Published team profiles</span>
                </Link>
              )}
            </Section>
            <Section widget={data.widgets.finances}>
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
                    <Section widget={data.widgets.registrations}>
                      {(w) => <RegistrationChart {...w} />}
                    </Section>
                  </section>
                )}
                {data.widgets.funding && (
                  <section className="gt-panel">
                    <h2>Funding status</h2>
                    <Section widget={data.widgets.funding}>
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
                  <Section widget={data.widgets.events}>
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
                          Create a draft when you’re ready to plan the next
                          gathering.
                        </EmptyState>
                      )
                    }
                  </Section>
                </section>
              )}
              <section className="gt-panel">
                <h2>Quick actions</h2>
                <div className="gt-quick-actions">
                  {[
                    ["/admin/events", "Plan an event"],
                    ["/admin/forms", "Build a form"],
                    ["/admin/content", "Update the site"],
                    ["/admin/teams", "Manage your teams"],
                  ]
                    .filter(([href]) => data.allowedRoutes.includes(href))
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
                <Section widget={data.widgets.memberships}>
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
                <Section widget={data.widgets.tasks}>
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
                <Section widget={data.widgets.activity}>
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
            Updated {new Date(data.generatedAt).toLocaleTimeString()}. Counts
            reflect your current access.
          </p>
        </>
      )}
    </div>
  );
}
