import { useEffect, useState } from "react";
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
type Result = { items: Entry[]; total: number; page: number; pageSize: number };
export default function AuditWorkspace() {
  const [params, setParams] = useSearchParams(),
    [data, setData] = useState<Result>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [refresh, setRefresh] = useState(0);
  const query = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api<Result>("/admin/audit?" + query, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [query, refresh]);
  const setPage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    setParams(next);
  };
  return (
    <div className="gt-admin-page" aria-busy={busy}>
      <header className="gt-admin-page-heading">
        <div>
          <h1>Audit log</h1>
          <p>
            Read-only, append-only records of protected actions. Sensitive
            payloads and credentials are never included.
          </p>
        </div>
        <div className="gt-actions">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setRefresh((v) => v + 1)}
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
        onSubmit={(e) => {
          e.preventDefault();
          const fields = new FormData(e.currentTarget),
            next = new URLSearchParams();
          for (const [key, value] of fields)
            if (String(value))
              next.set(
                key,
                ["from", "to"].includes(key)
                  ? new Date(String(value)).toISOString()
                  : String(value),
              );
          setParams(next);
        }}
      >
        <div className="gt-form-grid">
          <Field label="Exact action">
            <input
              name="action"
              placeholder="For example: events.published"
              defaultValue={params.get("action") || ""}
              maxLength={100}
              pattern="[a-z0-9_.\-]*"
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
            <input name="from" type="datetime-local" />
          </Field>
          <Field label="To (your local time)">
            <input name="to" type="datetime-local" />
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
            variant="ghost"
            type="button"
            onClick={() => {
              setParams({});
              setRefresh((v) => v + 1);
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
      {data && (
        <section className="gt-panel gt-event-editor">
          <p>{data.total.toLocaleString()} matching entries</p>
          {data.items.length ? (
            <div className="gt-table-wrap">
              <table className="gt-data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Target</th>
                    <th>Result</th>
                    <th>Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
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
          <nav className="gt-actions" aria-label="Audit log pages">
            <Button
              variant="secondary"
              disabled={busy || data.page === 1}
              onClick={() => setPage(data.page - 1)}
            >
              Previous
            </Button>
            <span>
              Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={busy || data.page * data.pageSize >= data.total}
              onClick={() => setPage(data.page + 1)}
            >
              Next
            </Button>
          </nav>
        </section>
      )}
    </div>
  );
}
