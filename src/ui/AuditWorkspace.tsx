import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
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
  const [params, setParams] = useSearchParams(),
    [data, setData] = useState<Listing>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [refresh, setRefresh] = useState(0),
    [trail, setTrail] = useState<string[]>([]),
    [detail, setDetail] = useState<Detail>(),
    [detailError, setDetailError] = useState(""),
    [detailBusy, setDetailBusy] = useState(false);
  const detailHeading = useRef<HTMLHeadingElement>(null),
    detailOpener = useRef<HTMLElement | null>(null),
    historyHeading = useRef<HTMLHeadingElement>(null),
    moveToHistory = useRef(false),
    selected = params.get("entry"),
    filters = new URLSearchParams(params);
  filters.delete("entry");
  const query = filters.toString();
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api<Listing>("/admin/audit?" + query, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [query, refresh]);
  useEffect(() => {
    setDetail(undefined);
    setDetailError("");
    if (!selected) return;
    const controller = new AbortController();
    setDetailBusy(true);
    api<Detail>("/admin/audit/" + encodeURIComponent(selected), {
      signal: controller.signal,
    })
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted) setDetailError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailBusy(false);
      });
    return () => controller.abort();
  }, [selected, refresh]);
  useEffect(() => {
    if (detail || detailError) detailHeading.current?.focus();
  }, [detail, detailError]);
  useEffect(() => {
    if (!selected) detailOpener.current?.focus();
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
            disabled={busy}
            onClick={() => setRefresh((r) => r + 1)}
          >
            Refresh
          </Button>
          <a
            className="gt-button gt-button-secondary"
            href={"/api/v1/admin/audit/export?" + query}
          >
            Export filtered CSV
          </a>
        </div>
      </header>
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
              <div className="gt-table-wrap">
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
                            disabled={busy || !!error}
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
              </div>
            ) : (
              <EmptyState title="No audit entries match">
                Try a wider date range or remove a filter.
              </EmptyState>
            )}
            <nav className="gt-actions" aria-label="Audit history pages">
              <Button
                variant="secondary"
                disabled={busy || !params.has("before")}
                onClick={first}
              >
                First page
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !trail.length}
                onClick={() => {
                  const next = trail.at(-1);
                  if (next !== undefined) {
                    moveToHistory.current = true;
                    setTrail((t) => t.slice(0, -1));
                    setParams(next);
                  }
                }}
              >
                Newer entries
              </Button>
              <Button
                variant="secondary"
                disabled={busy || !!error || !data.nextCursor}
                onClick={() => {
                  if (!data.nextCursor) return;
                  moveToHistory.current = true;
                  const next = new URLSearchParams(filters);
                  next.delete("page");
                  for (const [key, value] of Object.entries(data.nextCursor))
                    next.set(key, value);
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
          </div>
          {detailBusy && <p role="status">Loading entry…</p>}
          {detailError && <p role="alert">{detailError}</p>}
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
