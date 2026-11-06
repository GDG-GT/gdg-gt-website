import { useEffect, useRef, useState } from "react";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useAdmin } from "@/contexts/AdminContext";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field, EmptyState, Badge } from "../primitives";
import { useServerForm } from "./api";
import type { FormResponse } from "./store";
import ResponseFileLinks from "./ResponseFileLinks";
import ResponseExports from "./ResponseExports";
import ResponseAvailability from "./ResponseAvailability";
import ResponseHistory from "./ResponseHistory";
import ResponseActionReview, {
  type ResponseActionState,
} from "./ResponseActionReview";
import PrivacyPanel from "./PrivacyPanel";
import { responseFilterLocalTime } from "./response-filters";
import { useNavigationSafety } from "@/hooks/useDraftGuard";
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
  const { currentAdmin } = useAdmin(),
    { formId } = useParams(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  if (!currentAdmin) return null;
  return (
    <ResponseWorkspaceContent
      key={`${currentAdmin.id}:${currentAdmin.role}:${formId || "missing"}:${epoch}`}
    />
  );
}
function ResponseWorkspaceContent() {
  const navigationSafety = useNavigationSafety();
  const { formId } = useParams(),
    server = useServerForm(formId),
    form = server.form,
    [params, setParams] = useSearchParams();
  const [tab, setTab] = useState("Responses"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<string>(),
    [checked, setChecked] = useState<string[]>([]),
    [columns, setColumns] = useState<string[]>([]),
    [viewName, setViewName] = useState(""),
    [busy, setBusy] = useState(false);
  const [responseActionState, setResponseActionState] =
    useState<ResponseActionState>({
      dirty: false,
      busy: false,
      hideDetails: false,
    });
  const selectedMetadata = useRef<FormResponse>();
  const [privacyTarget, setPrivacyTarget] = useState<{ responseId?: string }>(),
    [privacyState, setPrivacyState] = useState({ dirty: false, busy: false });
  const [dateError, setDateError] = useState<"from" | "to" | "">(""),
    [dateMessage, setDateMessage] = useState("");
  const query = params.toString();
  useEffect(() => {
    setDateError("");
    setDateMessage("");
  }, [query]);
  const [blocked, setBlocked] = useState(""),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [readRetry, setReadRetry] = useState({
      responses: 0,
      summary: 0,
      views: 0,
      holds: 0,
    });
  const hadResponseAccess = useRef(false);
  const { isOnline } = useOnlineStatus(),
    mayReviewResponses = !!form?.actions?.includes("view_responses"),
    mayReviewPrivacy = !!form?.actions?.includes("delete"),
    root = `/admin/forms/${formId}`,
    readable = !!formId && !!form && mayReviewResponses && !blocked,
    responsesRead = usePrivateRead<Result>(
      readable && tab === "Responses"
        ? `${root}/responses?${query}`
        : undefined,
      refresh + readRetry.responses,
    ),
    summaryRead = usePrivateRead<Summary>(
      readable && tab === "Summary" ? `${root}/analytics?${query}` : undefined,
      refresh + readRetry.summary,
    ),
    viewsRead = usePrivateRead<{ items: View[] }>(
      readable ? `${root}/views` : undefined,
      refresh + readRetry.views,
    ),
    holdsRead = usePrivateRead<{ held: boolean }>(
      readable && mayReviewPrivacy ? `${root}/privacy` : undefined,
      refresh + readRetry.holds,
    ),
    activeRead = tab === "Summary" ? summaryRead : responsesRead,
    denied =
      server.denied ||
      (!!form && !mayReviewResponses && hadResponseAccess.current) ||
      responsesRead.denied ||
      summaryRead.denied ||
      viewsRead.denied ||
      holdsRead.denied,
    data = readable && !denied ? responsesRead.data : undefined,
    summary = readable && !denied ? summaryRead.data : undefined,
    views = readable && !denied ? viewsRead.data?.items || [] : [],
    loading = activeRead.loading,
    ready =
      readable &&
      !denied &&
      !!activeRead.data &&
      !loading &&
      !activeRead.error &&
      isOnline &&
      !needsRecheck &&
      !server.loading &&
      !server.error,
    viewsReady =
      ready && !!viewsRead.data && !viewsRead.loading && !viewsRead.error,
    holdsReady =
      ready && !!holdsRead.data && !holdsRead.loading && !holdsRead.error,
    formHeld = holdsReady ? holdsRead.data?.held : undefined,
    holdError = mayReviewPrivacy && !holdsReady,
    selected =
      data?.items.find((row) => row.id === selectedId) ||
      (responseActionState.hideDetails &&
      selectedMetadata.current?.id === selectedId
        ? selectedMetadata.current
        : undefined),
    setSelected = (row?: FormResponse) => {
      selectedMetadata.current = row
        ? {
            id: row.id,
            formId: row.formId,
            version: row.version,
            submittedAt: row.submittedAt,
            revision: row.revision,
            status: row.status,
            redacted: row.redacted,
            answers: {},
          }
        : undefined;
      setResponseActionState({ dirty: false, busy: false, hideDetails: false });
      setSelectedId(row?.id);
    };
  useEffect(() => {
    if (mayReviewResponses) hadResponseAccess.current = true;
  }, [mayReviewResponses]);
  const { clear: clearResponses } = responsesRead,
    { clear: clearSummary } = summaryRead,
    { clear: clearViews } = viewsRead,
    { clear: clearHolds } = holdsRead;
  useEffect(() => {
    setSelectedId(undefined);
    setChecked([]);
    selectedMetadata.current = undefined;
    setResponseActionState({ dirty: false, busy: false, hideDetails: false });
  }, [query, tab]);
  useEffect(() => {
    if (!denied) return;
    setBlocked(
      "Private response access changed. Recheck current access before reopening this workspace.",
    );
    clearResponses();
    clearSummary();
    clearViews();
    clearHolds();
    setSelectedId(undefined);
    setChecked([]);
    setColumns([]);
    setViewName("");
    selectedMetadata.current = undefined;
    setResponseActionState({ dirty: false, busy: false, hideDetails: false });
    setPrivacyTarget(undefined);
    setPrivacyState({ dirty: false, busy: false });
    setError("");
    setNotice("");
    setParams({}, { replace: true });
  }, [denied, clearResponses, clearSummary, clearViews, clearHolds, setParams]);
  useEffect(() => {
    const offline = () => setNeedsRecheck(true);
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);
  const retry = (name: keyof typeof readRetry) => {
    if (name === (tab === "Summary" ? "summary" : "responses"))
      setNeedsRecheck(false);
    setReadRetry((value) => ({ ...value, [name]: value[name] + 1 }));
  };
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
    if (key === "page") document.getElementById("workspace-content")?.focus();
  };
  const work = async (run: () => Promise<unknown>, message: string) => {
    if (!ready || busy) return;
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
  if (blocked || denied)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="Response access needs to be rechecked"
          action={
            <Button
              disabled={!isOnline || busy}
              onClick={() => {
                clearResponses();
                clearSummary();
                clearViews();
                clearHolds();
                setBlocked("");
                setRefresh((value) => value + 1);
                void server.reload();
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Recheck response workspace access
            </Button>
          }
        >
          {blocked || "Private response information has been cleared."}
        </EmptyState>
        <Link to="/admin/forms">Back to forms</Link>
      </div>
    );
  if (!form)
    return (
      <div className="gt-admin-page">
        {server.loading ? (
          <div role="status" aria-label="Loading form responses">
            <div className="gt-skeleton gt-detail-skeleton" />
            <span className="sr-only">Loading response workspace…</span>
          </div>
        ) : (
          <EmptyState
            title="This form is not available"
            action={
              <div className="gt-inline-actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void server.reload();
                    document.getElementById("workspace-content")?.focus();
                  }}
                >
                  Try loading form again
                </Button>
                <Link to="/admin/forms">Back to forms</Link>
              </div>
            }
          >
            {server.error}
          </EmptyState>
        )}
      </div>
    );
  if (!mayReviewResponses)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="Response review permission required"
          action={
            <Button onClick={() => void server.reload()}>
              Recheck saved form access
            </Button>
          }
        >
          This saved definition does not grant response review. No response
          inventory, summary or saved view is loaded.
        </EmptyState>
        <Link to="/admin/forms">Back to forms</Link>
      </div>
    );
  const fieldMap = new Map(
      form.versions.flatMap((v) => v.fields.map((f) => [f.id, f] as const)),
    ),
    visibleColumns = columns
      .map((id) => fieldMap.get(id))
      .filter((field): field is NonNullable<typeof field> => !!field);
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
          <ResponseAvailability
            form={form}
            disabled={busy || !ready}
            onComplete={(saved) => {
              setNotice(
                `Original availability change confirmed. Current saved state: ${saved.status}.`,
              );
              setRefresh((value) => value + 1);
              void server.reload();
            }}
            onDenied={() => {
              clearResponses();
              clearSummary();
              clearViews();
              clearHolds();
              setSelected(undefined);
              setBlocked(
                "Availability access changed. Private response details and the proposed change have been cleared.",
              );
            }}
            onReload={() => {
              setNotice(
                "Reloading the current saved form. The original availability change may already have completed; review the current state before another change.",
              );
              setRefresh((value) => value + 1);
              setNeedsRecheck(false);
              void server.reload();
            }}
          />
          <Button
            variant="secondary"
            disabled={busy || !isOnline}
            onClick={() => {
              setRefresh((v) => v + 1);
              setNeedsRecheck(false);
              void server.reload();
            }}
          >
            Refresh
          </Button>
          {mayReviewPrivacy && (
            <Button
              variant="secondary"
              disabled={!holdsReady || busy}
              onClick={() => setPrivacyTarget({})}
            >
              Retention &amp; holds
            </Button>
          )}
        </div>
      </header>
      {(error || server.error) && (
        <p className="gt-form-error" role="alert">
          {error || server.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {needsRecheck && isOnline && (
        <p role="status">
          Connection restored. Reload the current response view before further
          actions.
        </p>
      )}
      <div className="gt-response-read-controls">
        <ResponseReadFeedback
          name="saved form"
          read={server}
          offline={!isOnline}
          busy={busy}
          retry={() => void server.reload()}
        />
        {mayReviewPrivacy && (
          <ResponseReadFeedback
            name="hold status"
            read={holdsRead}
            offline={!isOnline}
            busy={busy}
            retry={() => retry("holds")}
          />
        )}
      </div>
      <div className="gt-tabs" role="tablist" aria-label="Response view">
        {["Summary", "Responses"].map((value, index, tabs) => (
          <button
            key={value}
            role="tab"
            id={`response-tab-${value}`}
            aria-controls="response-results-panel"
            tabIndex={tab === value ? 0 : -1}
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              const target =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : -1;
              if (target < 0) return;
              event.preventDefault();
              setTab(tabs[target]);
              document.getElementById(`response-tab-${tabs[target]}`)?.focus();
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <form
        key={query}
        className="gt-panel gt-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isOnline || busy) return;
          const body = new FormData(e.currentTarget),
            next = new URLSearchParams();
          setDateError("");
          setDateMessage("");
          setError("");
          for (const [key, value] of body)
            if (String(value)) {
              if (key === "from" || key === "to") {
                const date = new Date(String(value));
                if (!Number.isFinite(date.getTime())) {
                  setDateError(key);
                  setDateMessage("Choose a valid date and time.");
                  e.currentTarget
                    .querySelector<HTMLInputElement>(`[name="${key}"]`)
                    ?.focus();
                  return;
                }
                const previous = params.get(key),
                  previousLocal = responseFilterLocalTime(previous);
                // Keep an unchanged saved instant through a DST repeated hour,
                // including native controls that omit zero seconds in value.
                next.set(
                  key,
                  previous &&
                    previousLocal &&
                    new Date(previousLocal).getTime() === date.getTime()
                    ? previous
                    : date.toISOString(),
                );
              } else next.set(key, String(value));
            }
          if (
            next.get("from") &&
            next.get("to") &&
            new Date(next.get("from")!).getTime() >
              new Date(next.get("to")!).getTime()
          ) {
            setDateError("to");
            setDateMessage("The end date must be on or after the start date.");
            e.currentTarget
              .querySelector<HTMLInputElement>('[name="to"]')
              ?.focus();
            return;
          }
          setParams(next);
          document.getElementById("workspace-content")?.focus();
        }}
      >
        {dateError && dateMessage && (
          <p
            id="response-filter-date-error"
            role="alert"
            className="gt-form-error"
          >
            {dateMessage}
          </p>
        )}
        <div className="gt-form-grid">
          <Field label="Search respondents and non-sensitive answers">
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
            <input
              name="from"
              type="datetime-local"
              step="any"
              defaultValue={responseFilterLocalTime(params.get("from"))}
              aria-invalid={dateError === "from"}
              aria-describedby={
                dateError === "from" ? "response-filter-date-error" : undefined
              }
            />
          </Field>
          <Field label="To (your local time)">
            <input
              name="to"
              type="datetime-local"
              step="any"
              defaultValue={responseFilterLocalTime(params.get("to"))}
              aria-invalid={dateError === "to"}
              aria-describedby={
                dateError === "to" ? "response-filter-date-error" : undefined
              }
            />
          </Field>
        </div>
        <div className="gt-actions">
          <Button disabled={loading || busy || !isOnline}>Apply filters</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={(event) => {
              event.currentTarget.form?.reset();
              setError("");
              setDateError("");
              setDateMessage("");
              setParams({});
              document.getElementById("workspace-content")?.focus();
            }}
          >
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
              disabled={
                busy ||
                (!ready && params.get("sensitive") !== "true") ||
                !form.actions?.includes("view_sensitive_responses")
              }
              onChange={(e) =>
                change("sensitive", e.target.checked ? "true" : "false")
              }
            />
            Reveal sensitive answers (audited)
          </label>
        </div>
        <ResponseReadFeedback
          name="saved views"
          read={viewsRead}
          offline={!isOnline}
          busy={busy}
          retry={() => retry("views")}
        />
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
              disabled={!viewsReady || busy}
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
                  setDateError("");
                  setDateMessage("");
                  setError("");
                  document.getElementById("workspace-content")?.focus();
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
            disabled={busy || !viewsReady || !viewName.trim()}
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
      <div
        role="tabpanel"
        id="response-results-panel"
        aria-labelledby={`response-tab-${tab}`}
      >
        <ResponseReadFeedback
          name={tab === "Summary" ? "summary" : "responses"}
          read={activeRead}
          offline={!isOnline}
          busy={busy}
          retry={() => retry(tab === "Summary" ? "summary" : "responses")}
        />
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
                    Mean {field.numeric.mean.toFixed(2)} · Min{" "}
                    {field.numeric.min} · Max {field.numeric.max}
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
            </div>
            <p className="gt-helper">
              Exports include stable field IDs and version labels, and are
              audited.{" "}
              {checked.length
                ? `${checked.length} selected.`
                : "All filtered responses selected for export."}
            </p>
            {form.actions?.includes("export_responses") && (
              <fieldset
                disabled={!ready || busy}
                aria-label="Response export controls"
                onClickCapture={(event) => {
                  if (!ready || busy) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
              >
                {!ready && (
                  <p role="status">
                    Exports are paused until the response read is checked again.
                  </p>
                )}
                <ResponseExports
                  key={form.id}
                  formId={form.id}
                  filters={Object.fromEntries(
                    [...params].filter(([key]) =>
                      ["q", "version", "from", "to", "status"].includes(key),
                    ),
                  )}
                  selected={checked}
                  columns={columns}
                  canSensitive={
                    !!form.actions?.includes("view_sensitive_responses")
                  }
                />
              </fieldset>
            )}
            {data.items.length ? (
              <div
                className="gt-table-wrap"
                role="region"
                aria-label="Response inventory table"
                tabIndex={0}
              >
                <table className="gt-data-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Submitted</th>
                      <th>Respondent</th>
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
                            disabled={!ready || busy}
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
                        <td>
                          {row.respondent?.name ||
                            "Historical identity unavailable"}
                          <br />
                          {row.respondent?.email}
                        </td>
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
                            disabled={!ready || busy}
                            aria-label={`Open response ${row.id}`}
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
                Responses appear only after an online server commit. Try
                removing a filter.
              </EmptyState>
            )}
            <nav className="gt-actions" aria-label="Response pages">
              <Button
                variant="secondary"
                disabled={data.page === 1 || !ready || busy}
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
                disabled={
                  data.page * data.pageSize >= data.total || !ready || busy
                }
                onClick={() => change("page", String(data.page + 1))}
              >
                Next
              </Button>
            </nav>
          </section>
        )}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !responseActionState.busy) {
            const close = () => setSelected(undefined);
            if (responseActionState.dirty) navigationSafety.request(close);
            else close();
          }
        }}
      >
        <DialogContent
          className="gt-notification-dialog"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("individual-response-heading")?.focus();
          }}
        >
          <DialogTitle id="individual-response-heading" tabIndex={-1}>
            Individual response · v{selected?.version}
          </DialogTitle>
          <DialogDescription>
            Submitted{" "}
            {selected && new Date(selected.submittedAt).toLocaleString()}.
            Sensitive answers remain hidden unless explicitly revealed.
          </DialogDescription>
          {selected && (
            <>
              {!responseActionState.hideDetails && (
                <>
                  <p>
                    <strong>
                      {selected.respondent?.name ||
                        "Historical identity unavailable"}
                    </strong>
                    <br />
                    {selected.respondent?.email}
                    <br />
                    {selected.respondent?.source === "self_reported"
                      ? "Entered details · unverified"
                      : selected.respondent?.source === "email_verified"
                        ? "Email access link"
                        : selected.respondent?.source === "account"
                          ? "Chapter account"
                          : "Identity unavailable"}
                  </p>
                  <div className="gt-response-answers">
                    {form.versions
                      .find((v) => v.version === selected.version)
                      ?.fields.filter(
                        (f) =>
                          ![
                            "title",
                            "description",
                            "divider",
                            "image",
                          ].includes(f.type),
                      )
                      .map((field) => (
                        <div key={field.id}>
                          <strong>
                            {field.label}
                            {field.sensitive ? " · Sensitive" : ""}
                          </strong>
                          {field.type === "file" &&
                          Array.isArray(selected.answers[field.id]) ? (
                            <ResponseFileLinks
                              formId={form.id}
                              responseId={selected.id}
                              ids={selected.answers[field.id] as string[]}
                              canDownload={
                                ready &&
                                (!field.sensitive ||
                                  !!form.actions?.includes(
                                    "view_sensitive_responses",
                                  ))
                              }
                            />
                          ) : (
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
                                      selected.answers[field.id] ??
                                        "Not answered",
                                    )}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                  <p className="gt-helper">
                    Reference {selected.id}.{" "}
                    {formHeld || selected.status === "held"
                      ? "Operational hold: destructive actions are disabled."
                      : `Original version retention: ${form.versions.find((v) => v.version === selected.version)?.settings.retentionDays || 365} days.`}
                  </p>
                  {mayReviewPrivacy && (
                    <Button
                      variant="secondary"
                      disabled={!holdsReady || busy}
                      onClick={() =>
                        setPrivacyTarget({ responseId: selected.id })
                      }
                    >
                      Review response retention &amp; hold
                    </Button>
                  )}
                  {holdError && (
                    <p role="alert">
                      Hold status could not be checked. Refresh before a
                      destructive action.
                    </p>
                  )}
                  {!ready && (
                    <ResponseReadFeedback
                      name="selected response source"
                      read={responsesRead}
                      offline={!isOnline}
                      busy={busy}
                      retry={() => retry("responses")}
                    />
                  )}
                  {!ready && (
                    <p role="status">
                      Response review is paused. Recheck the current response
                      read before further actions.
                    </p>
                  )}
                  <ResponseHistory
                    key={selected.id}
                    formId={form.id}
                    responseId={selected.id}
                    canSensitive={
                      !!form.actions?.includes("view_sensitive_responses")
                    }
                  />
                </>
              )}
              {form.actions?.includes("delete") && (
                <ResponseActionReview
                  key={selected.id}
                  formId={form.id}
                  response={selected}
                  disabled={!ready || !holdsReady}
                  held={formHeld === true || selected.status === "held"}
                  onStateChange={(state) => {
                    setResponseActionState(state);
                    if (state.hideDetails) {
                      clearResponses();
                      clearSummary();
                    }
                  }}
                  onDenied={() => {
                    clearResponses();
                    clearSummary();
                    clearViews();
                    clearHolds();
                    setBlocked(
                      "Response privacy access changed. Private details and proposed actions have been cleared.",
                    );
                    setSelected(undefined);
                  }}
                  onComplete={(result) => {
                    clearResponses();
                    clearSummary();
                    setChecked([]);
                    setSelected(undefined);
                    setNotice(
                      `Original response ${result.receipt?.action === "delete" ? "deletion" : "redaction"} confirmed. Current state: ${result.response.status}.`,
                    );
                    setRefresh((value) => value + 1);
                    void server.reload();
                  }}
                  onReload={() => {
                    clearResponses();
                    clearSummary();
                    setChecked([]);
                    setSelected(undefined);
                    setNotice(
                      "Reloading current responses. The previous privacy action may already have committed; review the current record before another action.",
                    );
                    setRefresh((value) => value + 1);
                    void server.reload();
                  }}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!privacyTarget}
        onOpenChange={(open) => {
          if (open || privacyState.busy) return;
          const close = () => {
            setPrivacyTarget(undefined);
            setPrivacyState({ dirty: false, busy: false });
          };
          if (privacyState.dirty) navigationSafety?.request(close);
          else close();
        }}
      >
        <DialogContent className="gt-notification-dialog">
          <DialogTitle>
            {privacyTarget?.responseId
              ? "Response retention & hold"
              : "Form retention & holds"}
          </DialogTitle>
          <DialogDescription>
            Review current deadlines and operational holds separately from the
            form definition.
          </DialogDescription>
          <PrivacyPanel
            formId={form.id}
            responseId={privacyTarget?.responseId}
            onStateChange={setPrivacyState}
            onSaved={() => setRefresh((v) => v + 1)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResponseReadFeedback({
  name,
  read,
  offline,
  busy,
  retry,
}: {
  name: string;
  read: { loading: boolean; error: string; at?: string };
  offline: boolean;
  busy: boolean;
  retry: () => void;
}) {
  const region = useRef<HTMLElement>(null);
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label={`${name} read status`}
      className="gt-response-read-feedback"
    >
      {read.loading && <p role="status">Loading {name}…</p>}
      {(read.error || offline) && (
        <p role={read.error ? "alert" : "status"}>
          {read.error || "You are offline. New response actions are paused."}
        </p>
      )}
      {(read.loading || read.error || offline) && read.at && (
        <p className="gt-helper">
          Last successful {name} read:{" "}
          <time dateTime={read.at}>{new Date(read.at).toLocaleString()}</time>.
          Showing the matching saved snapshot; recheck before further actions.
        </p>
      )}
      <Button
        type="button"
        variant={read.error ? "secondary" : "ghost"}
        disabled={read.loading || offline || busy}
        onClick={() => {
          retry();
          region.current?.focus();
        }}
      >
        Reload {name}
      </Button>
    </section>
  );
}
