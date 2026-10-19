import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ClipboardList,
  FileText,
  Heart,
  Plus,
  Users,
} from "lucide-react";
import { useAdmin } from "@/contexts/AdminContext";
import { useContent } from "@/contexts/ContentContext";
import { ActionLink, Badge, EmptyState } from "./primitives";
import { localPreviewEnabled } from "./preview-data";
import { useInitialLoad } from "./useInitialLoad";
import { useForms } from "./forms/store";

export default function AdminOverview() {
  const { currentAdmin } = useAdmin();
  const { events, loadEvents, teamMembers, loadTeamMembers } = useContent();
  const [tasks, setTasks] = useState([
    { title: "Review the chapter’s public identity", done: false },
    { title: "Prepare the next event page", done: false },
    { title: "Try the native form builder", done: false },
  ]);
  useInitialLoad(() => {
    loadEvents();
    loadTeamMembers();
  });
  const upcoming = events
    .filter((event) => new Date(event.date).getTime() > Date.now())
    .sort((a, b) => a.date.localeCompare(b.date));
  const formCount = useForms().length;
  return (
    <div className="gt-admin-page">
      <div className="gt-admin-page-heading">
        <div>
          <p className="gt-breadcrumb">Your chapter, at a glance</p>
          <h1>
            Welcome back
            {currentAdmin?.display_name &&
            currentAdmin.display_name !== "Local Preview"
              ? `, ${currentAdmin.display_name.split(" ")[0]}`
              : ""}
            .
          </h1>
          <p>Here’s what’s happening with GDG@GT.</p>
        </div>
        <div className="gt-dashboard-date">
          <CalendarDays size={17} />
          {new Date().toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          <small>Build · Learn · Grow · Together</small>
        </div>
      </div>
      <div className="gt-dashboard-layout">
        <div className="gt-dashboard-main">
          <div className="gt-kpi-grid">
            {[
              [
                CalendarDays,
                events.length,
                "Events in the calendar",
                "/admin/events",
              ],
              [ClipboardList, formCount || "—", "Local forms", "/admin/forms"],
              [
                Users,
                teamMembers.length || "—",
                "Public team profiles",
                "/admin/team",
              ],
              [Heart, "—", "Pending approvals", "/admin/finances"],
            ].map(([Icon, value, label, href]) => {
              const MetricIcon = Icon as typeof Users;
              return (
                <Link to={String(href)} key={String(label)} className="gt-kpi">
                  <span className="gt-kpi-icon">
                    <MetricIcon size={20} />
                  </span>
                  <ArrowUpRight size={15} className="gt-kpi-arrow" />
                  <strong>{String(value)}</strong>
                  <span>{String(label)}</span>
                </Link>
              );
            })}
          </div>
          <div className="gt-dashboard-panels">
            <section className="gt-panel">
              <div className="gt-panel-heading">
                <h2>Upcoming events</h2>
                <Link to="/admin/events">
                  Manage <ArrowUpRight size={14} />
                </Link>
              </div>
              {upcoming.length ? (
                <div className="gt-upcoming-list">
                  {upcoming.map((event) => (
                    <Link key={event.id} to="/admin/events">
                      <span className="gt-mini-date">
                        <small>
                          {new Date(event.date).toLocaleDateString("en-US", {
                            month: "short",
                          })}
                        </small>
                        <strong>{new Date(event.date).getDate()}</strong>
                      </span>
                      <div>
                        <h3>{event.title}</h3>
                        <p>{event.time || "Time to be announced"}</p>
                      </div>
                      <ArrowUpRight size={17} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Your next event starts here"
                  action={
                    <ActionLink to="/admin/events" variant="secondary">
                      Create an event
                    </ActionLink>
                  }
                >
                  Plan a workshop or bring the community together.
                </EmptyState>
              )}
            </section>
            <section className="gt-panel gt-funding-panel">
              <div className="gt-panel-heading">
                <h2>Funding overview</h2>
                <Link to="/admin/finances">
                  View finances <ArrowUpRight size={14} />
                </Link>
              </div>
              {localPreviewEnabled ? (
                <>
                  <p className="gt-helper">
                    Planning snapshot from the PRD. Not a live balance.
                  </p>
                  {[
                    ["Hackathon", "$450", "Approved", 75],
                    ["Chapter foundation", "$600", "Approved", 100],
                    ["Workshop", "$1,200", "Requested · pending", 100],
                  ].map(([label, value, state, width]) => (
                    <div className="gt-funding-row" key={String(label)}>
                      <div>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                      <span
                        className={`gt-funding-track ${state === "Approved" ? "" : "is-pending"}`}
                      >
                        <span style={{ width: `${width}%` }} />
                      </span>
                      <small>{state}</small>
                    </div>
                  ))}
                  <p className="gt-helper">
                    No personal spending. Funds remain scoped to their approved
                    purpose.
                  </p>
                </>
              ) : (
                <EmptyState title="No funding data yet">
                  Approved requests and budgets will appear here.
                </EmptyState>
              )}
            </section>
          </div>
          <section className="gt-panel">
            <div className="gt-panel-heading">
              <h2>Quick actions</h2>
              <span className="gt-helper">Make something happen</span>
            </div>
            <div className="gt-quick-actions">
              {[
                [
                  CalendarDays,
                  "Plan an event",
                  "Dates, details, and registrations",
                  "/admin/events",
                ],
                [
                  ClipboardList,
                  "Create a form",
                  "Questions, insights, and ideas",
                  "/admin/forms",
                ],
                [
                  FileText,
                  "Update the site",
                  "Keep your community informed",
                  "/admin/content",
                ],
                [
                  Users,
                  "Bring people together",
                  "Teams and chapter membership",
                  "/admin/teams",
                ],
              ].map(([Icon, title, text, href]) => {
                const ActionIcon = Icon as typeof Users;
                return (
                  <Link key={String(title)} to={String(href)}>
                    <ActionIcon size={22} />
                    <div>
                      <h3>{String(title)}</h3>
                      <p>{String(text)}</p>
                    </div>
                    <ArrowRight size={17} />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
        <aside className="gt-dashboard-rail">
          <section className="gt-panel">
            <div className="gt-panel-heading">
              <h2>Your focus</h2>
              <Badge tone="coral">Local checklist</Badge>
            </div>
            <p className="gt-helper">
              A few useful places to start your UI review.
            </p>
            <div className="gt-task-list">
              {tasks.map((task, index) => (
                <label key={task.title}>
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() =>
                      setTasks((items) =>
                        items.map((item, i) =>
                          i === index ? { ...item, done: !item.done } : item,
                        ),
                      )
                    }
                  />
                  <span className={task.done ? "is-done" : ""}>
                    {task.title}
                  </span>
                </label>
              ))}
            </div>
          </section>
          <section className="gt-panel gt-activity-panel">
            <div className="gt-panel-heading">
              <h2>Recent activity</h2>
              <Activity size={17} />
            </div>
            <div className="gt-activity-entry">
              <span>
                <Check size={15} />
              </span>
              <div>
                <strong>Workspace ready</strong>
                <p>Your local UI environment is running.</p>
                <small>This session</small>
              </div>
            </div>
            <div className="gt-activity-entry">
              <span>
                <CalendarDays size={15} />
              </span>
              <div>
                <strong>Explore the fall calendar</strong>
                <p>Review event pages and registration states.</p>
                <Link to="/events">
                  Open events <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
            <div className="gt-rail-note">
              <p>
                Build something
                <br />
                <strong>worth sharing.</strong>
              </p>
              <span>GDG on Campus · Georgia Tech</span>
            </div>
          </section>
        </aside>
      </div>
      <Link
        to="/admin/forms"
        className="gt-floating-create"
        aria-label="Create a form"
      >
        <Plus size={25} />
      </Link>
    </div>
  );
}
