import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field, EmptyState, Badge } from "../primitives";
import { useServerForm, formsApi } from "./api";
import type { FormResponse } from "./store";
type Result = {
  items: FormResponse[];
  total: number;
  page: number;
  pageSize: number;
};
type Summary = {
  responseCount: number;
  fields: {
    fieldId: string;
    label: string;
    version: number;
    type: string;
    answered: number;
    counts: Record<string, number>;
    grid: Record<string, Record<string, number>>;
    ranking: Record<string, number | null>;
    numeric?: { mean: number; min: number; max: number; count: number };
  }[];
};
type View = {
  id: string;
  name: string;
  filters: Record<string, string | number>;
  columns: string[];
};
export default function ResponseWorkspace() {
  const { formId } = useParams(),
    server = useServerForm(formId),
    form = server.form,
    [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("Responses"),
    [data, setData] = useState<Result>(),
    [summary, setSummary] = useState<Summary>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<FormResponse>(),
    [checked, setChecked] = useState<string[]>([]),
    [columns, setColumns] = useState<string[]>([]),
    [views, setViews] = useState<View[]>([]),
    [viewName, setViewName] = useState(""),
    [action, setAction] = useState<"delete" | "redact">(),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false);
  const query = params.toString();
  useEffect(() => {
    if (!formId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(undefined);
    setSummary(undefined);
    setSelected(undefined);
    setChecked([]);
    const work =
      tab === "Summary"
        ? api<Summary>(`/admin/forms/${formId}/analytics?${query}`, {
            signal: controller.signal,
          }).then(setSummary)
        : api<Result>(`/admin/forms/${formId}/responses?${query}`, {
            signal: controller.signal,
          }).then(setData);
    work
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [formId, query, refresh, tab]);
  useEffect(() => {
    if (formId)
      api<{ items: View[] }>(`/admin/forms/${formId}/views`)
        .then((r) => setViews(r.items))
        .catch(() => setViews([]));
  }, [formId, refresh]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  };
  const work = async (run: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await run();
      setRefresh((v) => v + 1);
      setNotice(message);
      setSelected(undefined);
      await server.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!form)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title={
            server.loading
              ? "Loading response workspace…"
              : "This form is not available"
          }
        >
          {server.error}
        </EmptyState>
      </div>
    );
  const fieldMap = new Map(
      form.versions.flatMap((v) => v.fields.map((f) => [f.id, f] as const)),
    ),
    visibleColumns = columns.map((id) => fieldMap.get(id)).filter(Boolean);
  const download = (format: string) => {
    const p = new URLSearchParams(params);
    p.delete("page");
    p.delete("pageSize");
    p.set("sensitive", "false");
    p.set("format", format);
    if (checked.length) p.set("selected", checked.join(","));
    if (columns.length) p.set("columns", columns.join(","));
    return `/api/v1/admin/forms/${formId}/responses/export?${p}`;
  };
  return (
    <div className="gt-admin-page" aria-busy={loading || busy}>
      <header className="gt-admin-page-heading">
        <div>
          <Link to="/admin/forms" className="gt-breadcrumb">
            Forms / Responses
          </Link>
          <h1>{form.title}</h1>
          <p>Original questions, version-aware answers, and private review.</p>
          <Badge>{form.status}</Badge>
        </div>
        <div className="gt-actions">
          <Link
            className="gt-button gt-button-secondary"
            to={`/admin/forms/${formId}/edit`}
          >
            Edit form
          </Link>
          {form.actions?.includes("publish") && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                work(
                  () =>
                    formsApi.state(
                      form,
                      form.status === "Open" ? "Closed" : "Open",
                    ),
                  "Form state updated.",
                )
              }
            >
              {form.status === "Open" ? "Close form" : "Reopen form"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => setRefresh((v) => v + 1)}>
            Refresh
          </Button>
        </div>
      </header>
      {(error || server.error) && (
        <p className="gt-form-error" role="alert">
          {error || server.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="gt-tabs" role="tablist" aria-label="Response view">
        {["Summary", "Responses"].map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <form
        className="gt-panel gt-form"
        onSubmit={(e) => {
          e.preventDefault();
          const body = new FormData(e.currentTarget),
            next = new URLSearchParams();
          for (const [key, value] of body)
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
          <Field label="Search non-sensitive answers">
            <input
              type="search"
              name="q"
              defaultValue={params.get("q") || ""}
              maxLength={100}
            />
          </Field>
          <Field label="Published version">
            <select name="version" defaultValue={params.get("version") || ""}>
              <option value="">All versions</option>
              {form.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  Version {v.version}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={params.get("status") || ""}>
              <option value="">All statuses</option>
              <option value="complete">Complete</option>
              <option value="redacted">Redacted</option>
              <option value="held">Held</option>
            </select>
          </Field>
          <Field label="From (your local time)">
            <input name="from" type="datetime-local" />
          </Field>
          <Field label="To (your local time)">
            <input name="to" type="datetime-local" />
          </Field>
        </div>
        <div className="gt-actions">
          <Button disabled={loading}>Apply filters</Button>
          <Button type="button" variant="ghost" onClick={() => setParams({})}>
            Reset
          </Button>
        </div>
      </form>
      <section className="gt-panel gt-event-editor">
        <div className="gt-panel-heading">
          <h2>Review preferences</h2>
          <label className="gt-check">
            <input
              type="checkbox"
              checked={params.get("sensitive") === "true"}
              disabled={!form.actions?.includes("view_sensitive_responses")}
              onChange={(e) =>
                change("sensitive", e.target.checked ? "true" : "false")
              }
            />
            Reveal sensitive answers (audited)
          </label>
        </div>
        <details>
          <summary>Choose answer columns</summary>
          <div className="gt-form-grid">
            {[...fieldMap.values()]
              .filter(
                (f) =>
                  !["title", "description", "divider", "image"].includes(
                    f.type,
                  ),
              )
              .map((field) => (
                <label key={field.id} className="gt-check">
                  <input
                    type="checkbox"
                    checked={columns.includes(field.id)}
                    onChange={(e) =>
                      setColumns(
                        e.target.checked
                          ? [...columns, field.id]
                          : columns.filter((id) => id !== field.id),
                      )
                    }
                  />
                  {field.label}
                  {field.sensitive ? " · Sensitive" : ""}
                </label>
              ))}
          </div>
        </details>
        <div className="gt-actions">
          <Field label="Saved view">
            <select
              defaultValue=""
              onChange={(e) => {
                const view = views.find((v) => v.id === e.target.value);
                if (view) {
                  setColumns(view.columns);
                  setParams(
                    Object.fromEntries(
                      Object.entries(view.filters).map(([key, value]) => [
                        key,
                        String(value),
                      ]),
                    ),
                  );
                }
              }}
            >
              <option value="">Choose a view</option>
              {views.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="New view name">
            <input
              maxLength={100}
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
            />
          </Field>
          <Button
            variant="secondary"
            disabled={busy || !viewName.trim()}
            onClick={() =>
              work(
                () =>
                  api(`/admin/forms/${formId}/views`, {
                    method: "POST",
                    protected: true,
                    body: {
                      name: viewName.trim(),
                      filters: Object.fromEntries(
                        [...params].filter(
                          ([key]) =>
                            !["page", "pageSize", "sensitive"].includes(key),
                        ),
                      ),
                      columns,
                    },
                  }),
                "Review preferences saved.",
              )
            }
          >
            Save view
          </Button>
        </div>
      </section>
      {loading && <p role="status">Loading {tab.toLowerCase()}…</p>}
      {summary && (
        <section className="gt-panel gt-event-editor">
          <h2>{summary.responseCount} matching responses</h2>
          <p>
            Sensitive fields and free-text values are excluded from summaries.
          </p>
          {summary.fields.map((field) => (
            <article
              className="gt-response-summary"
              key={`${field.version}-${field.fieldId}`}
            >
              <h3>
                {field.label}{" "}
                <small>
                  v{field.version} · {field.answered} answered
                </small>
              </h3>
              {field.numeric && (
                <p>
                  Mean {field.numeric.mean.toFixed(2)} · Min {field.numeric.min}{" "}
                  · Max {field.numeric.max}
                </p>
              )}
              {Object.entries(field.counts).map(([label, count]) => (
                <div className="gt-summary-bar" key={label}>
                  <span>{label}</span>
                  <meter
                    min={0}
                    max={Math.max(field.answered, 1)}
                    value={count}
                  />
                  <span>{count}</span>
                </div>
              ))}
              {Object.entries(field.grid).map(([row, counts]) => (
                <div key={row}>
                  <h4>{row}</h4>
                  {Object.entries(counts).map(([column, count]) => (
                    <div className="gt-summary-bar" key={column}>
                      <span>{column}</span>
                      <meter
                        min={0}
                        max={Math.max(field.answered, 1)}
                        value={count}
                      />
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              ))}
              {Object.entries(field.ranking).map(([label, position]) => (
                <p key={label}>
                  {label}: mean rank {position?.toFixed(2) || "No answers"}
                </p>
              ))}
            </article>
          ))}
        </section>
      )}
      {data && (
        <section className="gt-panel gt-event-editor">
          <div className="gt-panel-heading">
            <h2>{data.total.toLocaleString()} matching responses</h2>
            {form.actions?.includes("export_responses") && (
              <div className="gt-actions">
                {["csv", "xlsx", "json"].map((format) => (
                  <a
                    key={format}
                    className="gt-button gt-button-secondary"
                    href={download(format)}
                  >
                    Export {format.toUpperCase()}
                  </a>
                ))}
              </div>
            )}
          </div>
          <p className="gt-helper">
            Downloads exclude sensitive answers, include stable field IDs and
            version labels, and are audited.{" "}
            {checked.length
              ? `${checked.length} selected.`
              : "All filtered responses selected for export."}
          </p>
          {data.items.length ? (
            <div className="gt-table-wrap">
              <table className="gt-data-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Submitted</th>
                    <th>Version</th>
                    <th>Status</th>
                    {visibleColumns.map((f) => (
                      <th key={f.id}>{f.label}</th>
                    ))}
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select response ${row.id}`}
                          checked={checked.includes(row.id)}
                          onChange={(e) =>
                            setChecked(
                              e.target.checked
                                ? [...checked, row.id]
                                : checked.filter((id) => id !== row.id),
                            )
                          }
                        />
                      </td>
                      <td>{new Date(row.submittedAt).toLocaleString()}</td>
                      <td>v{row.version}</td>
                      <td>{row.status}</td>
                      {visibleColumns.map((f) => (
                        <td key={f.id}>
                          {f.sensitive && !row.answers[f.id]
                            ? "Hidden"
                            : typeof row.answers[f.id] === "object"
                              ? JSON.stringify(row.answers[f.id])
                              : String(row.answers[f.id] ?? "—")}
                        </td>
                      ))}
                      <td>
                        <Button
                          variant="ghost"
                          onClick={() => setSelected(row)}
                        >
                          Open
                          <span className="sr-only"> response {row.id}</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No responses match">
              Responses appear only after an online server commit. Try removing
              a filter.
            </EmptyState>
          )}
          <nav className="gt-actions" aria-label="Response pages">
            <Button
              variant="secondary"
              disabled={data.page === 1 || loading}
              onClick={() => change("page", String(data.page - 1))}
            >
              Previous
            </Button>
            <span>
              Page {data.page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <Button
              variant="secondary"
              disabled={data.page * data.pageSize >= data.total || loading}
              onClick={() => change("page", String(data.page + 1))}
            >
              Next
            </Button>
          </nav>
        </section>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(undefined);
            setAction(undefined);
          }
        }}
      >
        <DialogContent className="gt-notification-dialog">
          <DialogTitle>Individual response · v{selected?.version}</DialogTitle>
          <DialogDescription>
            Submitted{" "}
            {selected && new Date(selected.submittedAt).toLocaleString()}.
            Sensitive answers remain hidden unless explicitly revealed.
          </DialogDescription>
          {selected && (
            <>
              <div className="gt-response-answers">
                {form.versions
                  .find((v) => v.version === selected.version)
                  ?.fields.filter(
                    (f) =>
                      !["title", "description", "divider", "image"].includes(
                        f.type,
                      ),
                  )
                  .map((field) => (
                    <div key={field.id}>
                      <strong>
                        {field.label}
                        {field.sensitive ? " · Sensitive" : ""}
                      </strong>
                      <p>
                        {field.sensitive &&
                        !Object.prototype.hasOwnProperty.call(
                          selected.answers,
                          field.id,
                        )
                          ? "Hidden by default"
                          : typeof selected.answers[field.id] === "object"
                            ? JSON.stringify(selected.answers[field.id])
                            : String(
                                selected.answers[field.id] ?? "Not answered",
                              )}
                      </p>
                    </div>
                  ))}
              </div>
              <p className="gt-helper">
                Reference {selected.id}.{" "}
                {form.settings.hold
                  ? "Operational hold: destructive actions are disabled."
                  : `Retention: ${form.settings.retentionDays || 365} days.`}
              </p>
              {form.actions?.includes("delete") && !form.settings.hold && (
                <div className="gt-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAction("redact");
                      setConfirm("");
                    }}
                  >
                    Redact identity
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      setAction("delete");
                      setConfirm("");
                    }}
                  >
                    Delete response
                  </Button>
                </div>
              )}
              {action && (
                <div className="gt-inline-confirm">
                  <p>
                    {action === "delete"
                      ? "This permanently removes answer values and their revision history. The audit record remains."
                      : "This permanently replaces identity and sensitive values in current and historical answers. The audit record remains."}{" "}
                    Type {action.toUpperCase()} to confirm.
                  </p>
                  <input
                    aria-label="Confirm response action"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  <Button
                    variant="danger"
                    disabled={busy || confirm !== action.toUpperCase()}
                    onClick={() =>
                      work(
                        () =>
                          api(
                            `/admin/forms/${formId}/responses/${selected.id}`,
                            {
                              method: action === "delete" ? "DELETE" : "PATCH",
                              protected: true,
                              ...(action === "redact"
                                ? { body: { action: "redact" } }
                                : {}),
                            },
                          ),
                        action === "delete"
                          ? "Response deleted."
                          : "Identity redacted.",
                      )
                    }
                  >
                    Confirm {action}
                  </Button>
                  <Button variant="ghost" onClick={() => setAction(undefined)}>
                    Cancel
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
