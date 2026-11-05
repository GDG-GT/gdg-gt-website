import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAdmin } from "@/contexts/AdminContext";
import ScrollableTable from "./ScrollableTable";
import { Button, Field, EmptyState } from "./primitives";
type Entry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  result: string;
  request_id: string;
  created_at: string;
};
type Statistics = {
  total: number;
  success: number;
  denied: number;
  failure: number;
  firstEntry: string | null;
  lastEntry: string | null;
  actions: { action: string; count: number }[];
  retention: {
    minimumYears: number;
    automaticPurge: boolean;
    earliestAvailable: string | null;
  };
};
type Cursor = { before: string; beforeId: string; at: string };
type Listing = {
  items: Entry[];
  total: number;
  pageSize: number;
  at: string;
  nextCursor: Cursor | null;
  statistics: Statistics;
};
type Detail = {
  record: Entry & { metadata: Record<string, string | number | boolean> };
  metadataPolicy: string;
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "No entries";
function localDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export default function AuditWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <AuditHistory key={`${currentAdmin.id}:${currentAdmin.role}:${epoch}`} />
  );
}
function AuditHistory() {
  const [params, setParams] = useSearchParams(),
    [validationError, setError] = useState(""),
    [blocked, setBlocked] = useState(false),
    [refresh, setRefresh] = useState(0),
    [trail, setTrail] = useState<string[]>([]),
    [detailRefresh, setDetailRefresh] = useState(0);
  const detailHeading = useRef<HTMLHeadingElement>(null),
    detailOpener = useRef<HTMLElement | null>(null),
    historyHeading = useRef<HTMLHeadingElement>(null),
    moveToHistory = useRef(false),
    selected = params.get("entry"),
    filters = new URLSearchParams(params);
  const trailQuery = useRef<string>();
  filters.delete("entry");
  const query = filters.toString();
  useEffect(() => {
    if (trailQuery.current !== query) setTrail([]);
    trailQuery.current = query;
  }, [query]);
  const history = usePrivateRead<Listing>("/admin/audit?" + query, refresh),
    entry = usePrivateRead<Detail>(
      selected ? "/admin/audit/" + encodeURIComponent(selected) : undefined,
      detailRefresh,
    ),
    data = history.data,
    detail = entry.data,
    busy = history.loading,
    detailBusy = entry.loading,
    detailError = entry.error,
    error = validationError || history.error,
    { isOnline } = useOnlineStatus(),
    ready = !!data && !busy && !history.error && !history.denied && isOnline,
    clearHistory = history.clear,
    clearEntry = entry.clear,
    denied = history.denied || entry.denied;
  useEffect(() => {
    if (!denied) return;
    setBlocked(true);
    clearHistory();
    clearEntry();
    setTrail([]);
    setError("");
    detailOpener.current = null;
  }, [denied, clearHistory, clearEntry]);
  useEffect(() => {
    if (detail || detailError) detailHeading.current?.focus();
  }, [detail, detailError]);
  useEffect(() => {
    if (!selected && detailOpener.current) {
      if (detailOpener.current.isConnected) detailOpener.current.focus();
      else document.getElementById("workspace-content")?.focus();
      detailOpener.current = null;
    }
  }, [selected]);
  useEffect(() => {
    if (data && moveToHistory.current) {
      moveToHistory.current = false;
      historyHeading.current?.focus();
    }
  }, [data]);
  const choose = (id?: string) => {
    if (id && document.activeElement instanceof HTMLElement)
      detailOpener.current = document.activeElement;
    const next = new URLSearchParams(params);
    if (id) next.set("entry", id);
    else next.delete("entry");
    setParams(next);
  };
  const first = () => {
    moveToHistory.current = true;
    const next = new URLSearchParams(filters);
    for (const key of ["before", "beforeId", "at", "page"]) next.delete(key);
    setTrail([]);
    setParams(next);
  };
  const retryHistory = () => {
    setError("");
    setRefresh((value) => value + 1);
    document.getElementById("workspace-content")?.focus();
  };
  if (blocked || denied)
    return (
      <EmptyState
        title="Audit access needs to be rechecked"
        action={
          <Button
            disabled={!isOnline}
            onClick={() => {
              setBlocked(false);
              setParams(filters);
              setRefresh((value) => value + 1);
              setDetailRefresh((value) => value + 1);
            }}
          >
            Recheck audit access
          </Button>
        }
      >
        Previous audit history and entry details have been cleared. Recheck
        current access before continuing.
      </EmptyState>
    );
  return (
    <div className="gt-admin-page" aria-busy={busy}>
      <header className="gt-admin-page-heading">
        <div>
          <h1>Audit log</h1>
          <p>
            Read-only history of protected actions. Detail views show only
            approved metadata.
          </p>
        </div>
        <div className="gt-actions">
          <Button
            variant="secondary"
            disabled={busy || detailBusy || !isOnline}
            onClick={() => {
              setError("");
              setRefresh((r) => r + 1);
              setDetailRefresh((r) => r + 1);
            }}
          >
            Refresh
          </Button>
          {ready ? (
            <a
              className="gt-button gt-button-secondary"
              href={"/api/v1/admin/audit/export?" + query}
            >
              Export filtered CSV
            </a>
          ) : (
            <Button variant="secondary" disabled>
              Export filtered CSV
            </Button>
          )}
        </div>
      </header>
      {!isOnline && (
        <p role="status">
          You are offline. Audit reads and export wait for connectivity.
          {history.at && (
            <>
              {" "}
              History snapshot from{" "}
              <time dateTime={history.at}>{date(history.at)}</time>.
            </>
          )}
        </p>
      )}
      <form
        className="gt-panel gt-form"
        key={query}
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget),
            next = new URLSearchParams();
          for (const [key, value] of values)
            if (String(value))
              next.set(
                key,
                ["from", "to"].includes(key)
                  ? new Date(String(value)).toISOString()
                  : String(value),
              );
          if (
            next.get("from") &&
            next.get("to") &&
            new Date(next.get("from")!) > new Date(next.get("to")!)
          ) {
            setError("The end of the date range must follow its start.");
            return;
          }
          setError("");
          setTrail([]);
          setParams(next);
        }}
      >
        <div className="gt-form-grid">
          <Field
            label="Search actions, target types or exact IDs"
            hint="Letters, numbers, periods, underscores, colons and hyphens."
          >
            <input
              name="q"
              defaultValue={params.get("q") || ""}
              maxLength={100}
              pattern="[A-Za-z0-9_.:\-]*"
            />
          </Field>
          <Field label="Exact action">
            <input
              name="action"
              defaultValue={params.get("action") || ""}
              maxLength={100}
              pattern="[a-z0-9_.\-]*"
              placeholder="For example: events.published"
            />
          </Field>
          <Field label="Actor account ID">
            <input
              name="actor"
              defaultValue={params.get("actor") || ""}
              placeholder="UUID, or leave blank"
              maxLength={36}
              pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            />
          </Field>
          <Field label="From (your local time)">
            <input
              name="from"
              type="datetime-local"
              defaultValue={localDate(params.get("from"))}
            />
          </Field>
          <Field label="To (your local time)">
            <input
              name="to"
              type="datetime-local"
              defaultValue={localDate(params.get("to"))}
            />
          </Field>
          <Field label="Result">
            <select name="result" defaultValue={params.get("result") || ""}>
              <option value="">All results</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="failure">Failure</option>
            </select>
          </Field>
        </div>
        <div className="gt-actions">
          <Button disabled={busy}>Apply filters</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setError("");
              setTrail([]);
              setParams({});
              setRefresh((r) => r + 1);
            }}
          >
            Clear filters
          </Button>
        </div>
      </form>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {history.error && (
        <div role="status">
          {history.at && (
            <p>
              Last successful history read:{" "}
              <time dateTime={history.at}>{date(history.at)}</time>.
            </p>
          )}
          <Button
            disabled={!isOnline || busy}
            variant="secondary"
            onClick={retryHistory}
          >
            Retry audit history
          </Button>
        </div>
      )}
      {busy && !data && (
        <div role="status" aria-label="Loading audit history">
          <div className="gt-skeleton gt-overview-placeholder" />
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading audit history…</span>
        </div>
      )}
      {data && (
        <>
          {(busy || error) && (
            <p role="status">
              Showing the last loaded snapshot until the current request
              succeeds.
            </p>
          )}
          <section className="gt-panel" aria-label="Audit statistics">
            <h2>Filtered activity</h2>
            <dl className="gt-editorial-states">
              {(
                [
                  ["Matching entries", data.statistics.total],
                  ["Successful", data.statistics.success],
                  ["Denied", data.statistics.denied],
                  ["Failed", data.statistics.failure],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <p>
              First matching entry: {date(data.statistics.firstEntry)}. Latest:{" "}
              {date(data.statistics.lastEntry)}.
            </p>
            <details>
              <summary>Most frequent matching actions</summary>
              <ul>
                {data.statistics.actions.map((row) => (
                  <li key={row.action}>
                    {row.action}: {row.count.toLocaleString()}
                  </li>
                ))}
              </ul>
            </details>
          </section>
          <section className="gt-panel gt-event-editor">
            <h2 ref={historyHeading} tabIndex={-1}>
              Action history
            </h2>
            <p>
              {data.total.toLocaleString()} matching entries · snapshot{" "}
              {date(data.at)}
            </p>
            {data.items.length ? (
              <ScrollableTable label="Audit history table">
                <table className="gt-data-table">
                  <caption className="sr-only">
                    Protected action history
                  </caption>
                  <thead>
                    <tr>
                      {[
                        "When",
                        "Action",
                        "Actor",
                        "Target",
                        "Result",
                        "Request ID",
                        "Details",
                      ].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.id}>
                        <td>{date(row.created_at)}</td>
                        <td>{row.action}</td>
                        <td>
                          <code>
                            {row.actor_id || "System / unauthenticated"}
                          </code>
                        </td>
                        <td>
                          {row.target_type || "—"}
                          <br />
                          <code>{row.target_id}</code>
                        </td>
                        <td>{row.result}</td>
                        <td>
                          <code>{row.request_id}</code>
                        </td>
                        <td>
                          <Button
                            disabled={!ready}
                            variant="ghost"
                            onClick={() => choose(row.id)}
                            aria-label={
                              "Details for " +
                              row.action +
                              " at " +
                              date(row.created_at)
                            }
                          >
                            View details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            ) : (
              <EmptyState
                title={
                  query ? "No audit entries match" : "No audit history yet"
                }
                action={
                  query ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setTrail([]);
                        setError("");
                        setParams({});
                      }}
                    >
                      Reset audit filters
                    </Button>
                  ) : undefined
                }
              >
                {query
                  ? "Try a wider date range or remove a filter."
                  : "Protected account and workspace actions will appear here."}
              </EmptyState>
            )}
            <nav className="gt-actions" aria-label="Audit history pages">
              <Button
                variant="secondary"
                disabled={!ready || !params.has("before")}
                onClick={first}
              >
                First page
              </Button>
              <Button
                variant="secondary"
                disabled={!ready || !trail.length}
                onClick={() => {
                  const next = trail.at(-1);
                  if (next !== undefined) {
                    moveToHistory.current = true;
                    trailQuery.current = next;
                    setTrail((t) => t.slice(0, -1));
                    setParams(next);
                  }
                }}
              >
                Newer entries
              </Button>
              <Button
                variant="secondary"
                disabled={!ready || !data.nextCursor}
                onClick={() => {
                  if (!data.nextCursor) return;
                  moveToHistory.current = true;
                  const next = new URLSearchParams(filters);
                  next.delete("page");
                  for (const [key, value] of Object.entries(data.nextCursor))
                    next.set(key, value);
                  trailQuery.current = next.toString();
                  setTrail((t) => [...t, query]);
                  setParams(next);
                }}
              >
                Older entries
              </Button>
            </nav>
          </section>
          <section className="gt-panel">
            <h2>Retention</h2>
            <p>
              Policy minimum: {data.statistics.retention.minimumYears} years.
              Automatic audit deletion is disabled. Earliest available record:{" "}
              {date(data.statistics.retention.earliestAvailable)}.
            </p>
            <p className="gt-helper">
              This describes the current record inventory and application
              policy. Backup coverage and institutional retention approval
              require separate operational verification.
            </p>
          </section>
        </>
      )}
      {selected && (
        <section
          className="gt-panel"
          aria-label="Audit entry detail"
          aria-busy={detailBusy}
        >
          <div className="gt-panel-heading">
            <h2 ref={detailHeading} tabIndex={-1}>
              Audit entry detail
            </h2>
            <Button variant="secondary" onClick={() => choose()}>
              Close details
            </Button>
            <Button
              variant="ghost"
              disabled={!isOnline || detailBusy}
              onClick={() => setDetailRefresh((value) => value + 1)}
            >
              Refresh audit entry
            </Button>
          </div>
          {detailBusy && !detail && (
            <div role="status" aria-label="Loading audit entry">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading entry…</span>
            </div>
          )}
          {detailBusy && detail && (
            <p role="status">
              Refreshing entry; the last saved snapshot remains visible.
            </p>
          )}
          {detailError && (
            <div role="alert">
              <p>{detailError}</p>
              {entry.at && (
                <p>
                  Last successful entry read:{" "}
                  <time dateTime={entry.at}>{date(entry.at)}</time>.
                </p>
              )}
              <Button
                disabled={!isOnline || detailBusy}
                variant="secondary"
                onClick={() => setDetailRefresh((value) => value + 1)}
              >
                Retry audit entry
              </Button>
            </div>
          )}
          {!isOnline && entry.at && (
            <p role="status">
              Entry snapshot from{" "}
              <time dateTime={entry.at}>{date(entry.at)}</time>; offline data
              may be out of date.
            </p>
          )}
          {detail && (
            <>
              <dl>
                {Object.entries(detail.record)
                  .filter(([key]) => key !== "metadata")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key.replace(/_/g, " ")}</dt>
                      <dd>
                        <code>{value ? String(value) : "Not recorded"}</code>
                      </dd>
                    </div>
                  ))}
              </dl>
              <h3>Approved metadata</h3>
              {Object.keys(detail.record.metadata).length ? (
                <dl>
                  {Object.entries(detail.record.metadata).map(
                    ([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{String(value)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              ) : (
                <p>No approved metadata fields for this entry.</p>
              )}
              <p className="gt-helper">{detail.metadataPolicy}</p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
