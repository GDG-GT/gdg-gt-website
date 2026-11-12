import ScrollableTable from "@/ui/ScrollableTable";
import { useEffect, useState } from "react";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAdmin } from "@/contexts/AdminContext";
import { Badge, Button, EmptyState } from "./primitives";
type Alert = {
  id: string;
  code: string;
  count: number;
  threshold: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};
type Job = {
  job_name: string;
  state: string;
  started_at: string;
  completed_at: string | null;
  error_code: string | null;
  counts: Record<string, number>;
};
type Status = {
  checkedAt: string;
  lastEvaluatedAt: string | null;
  installedAt: string;
  alerts: Alert[];
  jobs: Job[];
  rateAggregates: { day: string; scope: string; attempts: number }[];
};
const names: Record<string, string> = {
  auth_failures: "Gate or login failures",
  server_failures: "Server failures",
  email_rejections: "Email delivery rejection",
  jobs_missed: "Missed scheduled work",
  jobs_duplicated: "Duplicate scheduled work",
  event_conflicts: "Registration conflicts",
  database_failures: "Database request failures",
  database_slow: "Slow database requests",
  storage_failures: "Private storage failures",
  form_rejections: "Rejected form submissions",
  form_limits: "Form response limits",
  scan_failures: "Rejected or failed scans",
  export_failures: "Failed form exports",
  push_failures: "Failed event reminders",
  csp_violations: "Content security violations",
};
const retention = [
  ["Expired/revoked sessions and CSRF", "30 days after expiry/revocation"],
  [
    "Risk-window keys",
    "Expire at the rate window; expired rows are removed daily",
  ],
  [
    "Gate/login aggregate counts",
    "90 days · no risk keys, addresses or actor IDs",
  ],
  ["Security events", "1 year"],
  ["Audit history", "At least 2 years; automatic deletion is disabled"],
  ["Contact inquiries and files", "365 days after resolution, unless held"],
  ["Incomplete Forms drafts", "Form-configured, at most 30 days"],
  [
    "Form responses and files",
    "Original-version retention; default 1 year, holds preserved",
  ],
  ["Generated form exports", "24 hours, then private artifact cleanup"],
  ["Newsletter attempts / Push logs", "30 days / 90 days"],
  ["Failed delivery details", "90 days; deduplication identifiers remain"],
  ["Read / unread notifications", "90 days / 180 days"],
  ["Report cache", "Expired cache only; finance evidence is not removed"],
  [
    "Finance records and attachments",
    "Retained; deletion disabled pending chapter policy",
  ],
];
export default function OperationsWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return <OperationsStatus key={`${currentAdmin.id}:${currentAdmin.role}:${epoch}`} />;
}
function OperationsStatus() {
  const [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now());
  const { isOnline } = useOnlineStatus();
  const { data: status, loading: busy, error, at } = usePrivateRead<Status>("/admin/operations", refresh);
  useEffect(() => {
    const timer = window.setInterval(() => {setNow(Date.now());if(!document.hidden && navigator.onLine)setRefresh(v=>v+1)}, 60000);
    return () => window.clearInterval(timer);
  }, []);
  const stale =
      !status?.lastEvaluatedAt ||
      now - new Date(status.lastEvaluatedAt).getTime() > 900000,
    active = status?.alerts.filter((row) => !row.resolved_at) || [];
  return (
    <div className="gt-admin-page gt-operations-workspace" aria-busy={busy}>
      <header className="gt-admin-page-heading">
        <div>
          <h1>Operations & retention</h1>
          <p>
            Read-only job outcomes, operational alerts and data-retention
            policies.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!isOnline}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Refresh status
        </Button>
      </header>
      <p className="gt-helper">
        Super Admin only. Counters contain no participant identities. This page
        never runs cleanup, releases holds, sends mail or deletes records.
      </p>
      {!isOnline && <p role="status">You are offline. Reconnect and refresh to check current operational status.{at && ` Snapshot from ${new Date(at).toLocaleString()}.`}</p>}
      {busy && status && <p role="status">Refreshing status… Refresh again to restart a stuck request.</p>}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}{status ? " Previously loaded status may be stale." : " Previous protected status is unavailable."}
        </p>
      )}
      {!status && busy ? (
        <section className="gt-panel gt-form" role="status">
          <div className="gt-skeleton gt-loading-heading" />
          <p>Loading operational status…</p>
        </section>
      ) : (
        status && (
          <>
            <section
              className="gt-panel gt-form"
              aria-labelledby="operations-monitor-heading"
            >
              <h2 id="operations-monitor-heading">Monitor freshness</h2>
              <Badge tone={stale ? "warning" : "success"}>
                {stale ? "Monitor needs attention" : "Recently evaluated"}
              </Badge>
              <p>
                Last evaluation:{" "}
                {status.lastEvaluatedAt
                  ? new Date(status.lastEvaluatedAt).toLocaleString()
                  : "Not evaluated yet"}
                . Status fetched {new Date(status.checkedAt).toLocaleString()}.
              </p>
              <p className="gt-helper">
                The authenticated monitor runs every five minutes. A stopped
                scheduler or unavailable database cannot alert through itself:
                hosted operation also needs an independent uptime/watchdog
                service and a reviewed on-call destination. Local monitoring is
                not production certification.
              </p>
            </section>
            <section
              className="gt-panel gt-form"
              aria-labelledby="operations-alert-heading"
            >
              <h2 id="operations-alert-heading">Operational alerts</h2>
              <p>
                Current alerts from background jobs and service checks. This page refreshes every minute.
              </p>
              {active.length ? (
                <ScrollableTable label="Operational alerts table">
                  <table className="gt-data-table">
                    <thead>
                      <tr>
                        <th>Condition</th>
                        <th>Detected</th>
                        <th>Alert threshold</th>
                        <th>Last observed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {active.map((row) => (
                        <tr key={row.id}>
                          <td>{names[row.code] || "Operational condition"}</td>
                          <td>
                            {row.count.toLocaleString()}{row.code==="jobs_missed" ? (row.count===1 ? " overdue job":" overdue jobs"):""}
                          </td>
                          <td>{row.threshold}</td>
                          <td>{new Date(row.last_seen_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              ) : (
                <EmptyState
                  title={
                    stale
                      ? "No current alert data"
                      : "No active alerts"
                  }
                >
                  {stale
                    ? "Restore the scheduler and refresh before interpreting this as healthy."
                    : "The latest check found no active alerts."}
                </EmptyState>
              )}
              {status.alerts.some((row) => row.resolved_at) && (
                <details>
                  <summary>Recently resolved alerts</summary>
                  <ul>
                    {status.alerts
                      .filter((row) => row.resolved_at)
                      .map((row) => (
                        <li key={row.id}>
                          {names[row.code] || "Operational condition"} ·
                          resolved {new Date(row.resolved_at!).toLocaleString()}
                        </li>
                      ))}
                  </ul>
                </details>
              )}
            </section>
            <section
              className="gt-panel gt-form"
              aria-labelledby="operations-jobs-heading"
            >
              <h2 id="operations-jobs-heading">Latest scheduled runs</h2>
              {status.jobs.length ? (
                <ScrollableTable label="Scheduled job runs table">
                  <table className="gt-data-table">
                    <thead>
                      <tr>
                        <th>Job</th>
                        <th>State</th>
                        <th>Started</th>
                        <th>Outcome counters</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.jobs.map((job) => (
                        <tr key={job.job_name}>
                          <td>{job.job_name}</td>
                          <td>
                            {job.state}
                            {job.error_code ? ` · ${job.error_code}` : ""}
                          </td>
                          <td>{new Date(job.started_at).toLocaleString()}</td>
                          <td>
                            {Object.entries(job.counts)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(" · ") || "No outcome recorded yet"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              ) : (
                <EmptyState title="No runs recorded">
                  Start the separate authenticated scheduler; browser timers do
                  not perform scheduled work.
                </EmptyState>
              )}
            </section>
          </>
        )
      )}
      <section
        className="gt-panel gt-form"
        aria-labelledby="operations-retention-heading"
      >
        <h2 id="operations-retention-heading">Retention policy</h2>
        <p>
          Automatic jobs apply the policies below in bounded batches. Files are
          not considered removed until physical cleanup succeeds. Holds and
          financial evidence are not bypassed.
        </p>
        <ScrollableTable label="Retention policies table">
          <table className="gt-data-table">
            <thead>
              <tr>
                <th>Record class</th>
                <th>Policy</th>
              </tr>
            </thead>
            <tbody>
              {retention.map(([name, policy]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{policy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </section>
    </div>
  );
}
