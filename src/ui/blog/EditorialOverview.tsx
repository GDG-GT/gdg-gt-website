import { useState } from "react";
import { Link } from "react-router-dom";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { Button } from "../primitives";
type Summary = {
  articles: number;
  states: Record<string, number>;
  assignedSubmissions: number;
  revisionMonths: { month: string; count: number }[];
};
type Personal = {
  widgets: {
    tasks: { state: string; data?: { count: number } };
    messages: { state: string; data?: { unread: number } };
  };
};
export default function EditorialOverview() {
  const [tick, setTick] = useState(0);
  const summary = usePrivateRead<Summary>("/admin/blog/overview", tick),
    work = usePrivateRead<Personal>("/admin/dashboard", tick),
    data = summary.data,
    personal = work.data,
    error = summary.error,
    personalError = work.error,
    busy = summary.loading || work.loading;
  const max = Math.max(1, ...(data?.revisionMonths.map((m) => m.count) || []));
  return (
    <section
      className="gt-panel"
      aria-labelledby="editorial-overview-title"
      aria-busy={busy}
    >
      <div className="gt-panel-heading">
        <h2 id="editorial-overview-title">Your writing and work</h2>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setTick((t) => t + 1)}
        >
          Refresh overview
        </Button>
      </div>
      {busy && !data && (
        <div role="status" aria-label="Loading editorial overview">
          <div className="gt-skeleton gt-overview-placeholder" />
          <span className="sr-only">Loading your editorial overview…</span>
        </div>
      )}
      {data && (busy || error) && (
        <p role="status">
          Showing the editorial snapshot last loaded{" "}
          {new Date(summary.at!).toLocaleString()} until refresh succeeds.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {data.articles} accessible articles · {data.assignedSubmissions}{" "}
            submissions assigned to you.
          </p>
          <dl className="gt-editorial-states">
            {Object.entries(data.states).map(([state, count]) => (
              <div key={state}>
                <dt>{state.replace(/_/g, " ")}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <h3>Editorial revisions</h3>
          <p className="gt-helper">
            Saved article revisions across your current article scope, by UTC
            month. Private writing has no public readership statistics.
          </p>
          <ul className="gt-overview-bars">
            {data.revisionMonths.map((month) => (
              <li key={month.month}>
                <div>
                  <span>{month.month}</span>
                  <strong>{month.count} revisions</strong>
                </div>
                <span className="gt-overview-track" aria-hidden="true">
                  <span style={{ width: `${(100 * month.count) / max}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <nav aria-label="Your personal work" className="gt-actions">
        <Link
          className="gt-button gt-button-secondary"
          to="/admin/blog-editor?view=tasks"
        >
          Your tasks
          {personal?.widgets.tasks.state === "ready"
            ? ` (${personal.widgets.tasks.data?.count ?? 0})`
            : ""}
        </Link>
        <Link
          className="gt-button gt-button-secondary"
          to="/admin/blog-editor?view=messages"
        >
          Your messages
          {personal?.widgets.messages.state === "ready"
            ? ` (${personal.widgets.messages.data?.unread ?? 0} unread)`
            : ""}
        </Link>
      </nav>
      {(personalError ||
        personal?.widgets.tasks.state === "error" ||
        personal?.widgets.messages.state === "error") && (
        <p role="status">
          Personal work counts could not load. Open your tasks or messages, or
          refresh the overview.
        </p>
      )}
    </section>
  );
}
