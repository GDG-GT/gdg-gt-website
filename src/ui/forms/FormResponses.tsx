import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Eye,
  FileText,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import { formsStore, useForms, useResponses, type FormResponse } from "./store";

type SavedView = {
  name: string;
  query: string;
  version: string;
  from: string;
  to: string;
  status: string;
  columns: string[];
};

export default function FormResponses() {
  const { formId } = useParams(),
    forms = useForms(),
    responses = useResponses().filter((response) => response.formId === formId);
  const form = forms.find((item) => item.id === formId);
  const [tab, setTab] = useState("Responses"),
    [query, setQuery] = useState(""),
    [version, setVersion] = useState("all"),
    [selected, setSelected] = useState<FormResponse | null>(null),
    [exportOpen, setExportOpen] = useState(false),
    [format, setFormat] = useState("csv"),
    [notice, setNotice] = useState(""),
    [destructive, setDestructive] = useState<"redact" | "delete" | null>(null),
    [confirmation, setConfirmation] = useState(""),
    [sensitive, setSensitive] = useState(false);
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [pageSize, setPageSize] = useState(10),
    [columns, setColumns] = useState(["Submitted", "Version", "Status"]),
    [checked, setChecked] = useState<string[]>([]),
    [viewOpen, setViewOpen] = useState(false),
    [viewName, setViewName] = useState(""),
    [savedViews, setSavedViews] = useState<SavedView[]>(() => {
      try {
        return JSON.parse(
          localStorage.getItem(`gdg-response-views-${formId}`) || "[]",
        );
      } catch {
        return [];
      }
    });
  if (!form)
    return (
      <div className="gt-admin-page">
        <EmptyState
          title="This form is not available"
          action={<Link to="/admin/forms">Back to forms</Link>}
        />
      </div>
    );
  const filtered = responses
    .filter(
      (response) =>
        (version === "all" || response.version === Number(version)) &&
        (!from || response.submittedAt.slice(0, 10) >= from) &&
        (!to || response.submittedAt.slice(0, 10) <= to) &&
        (status === "all" ||
          (status === "redacted" ? response.redacted : !response.redacted)) &&
        `${response.id} ${JSON.stringify(response.answers)}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    currentPage = Math.min(page, pages),
    pageRows = filtered.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize,
    ),
    exportRows = checked.length
      ? filtered.filter((response) => checked.includes(response.id))
      : filtered;
  const download = async () => {
    if (exportRows.length > 5000) {
      setNotice(
        "Narrow your filters to 5,000 local responses or fewer. Background exports require the production service.",
      );
      return;
    }
    const exported = exportRows.map((response) => {
      const definition = form.versions.find(
        (item) => item.version === response.version,
      );
      return {
        responseId: response.id,
        formId: form.id,
        version: response.version,
        submittedAt: response.submittedAt,
        completionState: response.redacted ? "redacted" : "complete",
        ...Object.fromEntries(
          Object.entries(response.answers)
            .filter(
              ([id]) =>
                !definition?.fields.find((field) => field.id === id)?.sensitive,
            )
            .map(([id, value]) => [
              `${definition?.fields.find((field) => field.id === id)?.label || id} [${id}]`,
              value,
            ]),
        ),
      };
    });
    const { responseCsv, responseXlsx } = await import("./export");
    const content =
      format === "json"
        ? JSON.stringify(exported, null, 2)
        : format === "xlsx"
          ? responseXlsx(exported)
          : responseCsv(exported);
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(
      new Blob([content], {
        type:
          format === "json"
            ? "application/json"
            : format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "text/csv;charset=utf-8",
      }),
    );
    anchor.download = `${form.slug}-responses.${format}`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 30_000);
    setNotice(
      "Export generated. Check your browser’s downloads. Sensitive answers were excluded.",
    );
  };
  const detail = selected && (
    <div className="gt-response-detail">
      <div className="gt-panel-heading">
        <h2>Individual response</h2>
        <Badge tone="coral">v{selected.version}</Badge>
      </div>
      <p className="gt-helper">
        {new Date(selected.submittedAt).toLocaleString()} · Local sample data
        {!!selected.revisions?.length &&
          ` · ${selected.revisions.length} saved revision${selected.revisions.length === 1 ? "" : "s"}`}
      </p>
      <div className="gt-response-answers">
        {form.versions
          .find((item) => item.version === selected.version)
          ?.fields.filter(
            (field) =>
              !["divider", "title", "description", "image"].includes(
                field.type,
              ),
          )
          .map((field) => (
            <div key={field.id}>
              <strong>
                {field.label}
                {field.sensitive && <Badge tone="warning">Sensitive</Badge>}
              </strong>
              <p>
                {field.sensitive && !sensitive
                  ? "•••••• · Hidden by default"
                  : typeof selected.answers[field.id] === "object"
                    ? JSON.stringify(selected.answers[field.id])
                    : String(selected.answers[field.id] || "Not answered")}
              </p>
            </div>
          ))}
      </div>
      <button
        className="gt-button gt-button-ghost"
        onClick={() => setSensitive(!sensitive)}
      >
        <Eye size={15} />
        {sensitive ? "Mask sensitive fields" : "Reveal local sensitive fields"}
      </button>
      <div className="gt-response-destructive">
        <Button
          variant="secondary"
          onClick={() => {
            setDestructive("redact");
            setConfirmation("");
          }}
        >
          Redact identity
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setDestructive("delete");
            setConfirmation("");
          }}
        >
          <Trash2 size={15} />
          Delete
        </Button>
      </div>
    </div>
  );
  return (
    <div className="gt-admin-page">
      <div className="gt-admin-page-heading">
        <div>
          <Link to="/admin/forms" className="gt-breadcrumb">
            <ArrowLeft size={14} /> Forms / Responses
          </Link>
          <h1>{form.title}</h1>
          <p>
            Every response, in its original context.{" "}
            <Badge tone={form.status === "Open" ? "success" : "neutral"}>
              {form.status}
            </Badge>
          </p>
        </div>
        <div className="gt-inline-actions">
          <Link
            to={`/forms/${form.slug}`}
            className="gt-button gt-button-secondary"
          >
            <Eye size={16} />
            View form
          </Link>
          <Button
            variant="secondary"
            onClick={() =>
              formsStore.save({
                ...form,
                status: form.status === "Open" ? "Closed" : "Open",
              })
            }
          >
            {form.status === "Open" ? "Close form" : "Reopen form"}
          </Button>
          <Button
            onClick={() => {
              setExportOpen(true);
              setNotice("");
            }}
          >
            <Download size={16} />
            Export
          </Button>
        </div>
      </div>
      <div className="gt-forms-stats">
        {[
          ["Responses", responses.length],
          ["Published versions", form.versions.length],
          [
            "Last response",
            responses.length
              ? new Date(
                  responses[responses.length - 1].submittedAt,
                ).toLocaleDateString()
              : "No data yet",
          ],
          ["File scanning", "Not connected"],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div
        className="gt-tabs gt-response-tabs"
        role="tablist"
        aria-label="Response views"
      >
        {["Summary", "Responses", "Individual"].map((value) => (
          <button
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            key={value}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="gt-panel">
        <div className="gt-toolbar">
          <SearchBox
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            label="Search local responses"
            placeholder="Search response data…"
          />
          <label className="gt-sort">
            Version
            <select
              value={version}
              onChange={(event) => setVersion(event.target.value)}
            >
              <option value="all">All versions</option>
              {form.versions.map((item) => (
                <option key={item.version} value={item.version}>
                  Version {item.version}
                </option>
              ))}
            </select>
          </label>
          <label className="gt-sort">
            State
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All responses</option>
              <option value="complete">Complete</option>
              <option value="redacted">Redacted</option>
            </select>
          </label>
          <Button variant="ghost" onClick={() => setViewOpen(true)}>
            Save view
          </Button>
        </div>
        <div className="gt-toolbar gt-response-filters">
          <Field label="From date (UTC)">
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field label="To date (UTC)">
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field label="Saved views">
            <select
              defaultValue=""
              onChange={(event) => {
                const view = savedViews[Number(event.target.value)];
                if (view) {
                  setQuery(view.query);
                  setVersion(view.version);
                  setFrom(view.from);
                  setTo(view.to);
                  setStatus(view.status);
                  setColumns(view.columns);
                  setPage(1);
                }
              }}
            >
              <option value="" disabled>
                Choose a saved view
              </option>
              {savedViews.map((view, index) => (
                <option key={view.name} value={index}>
                  {view.name}
                </option>
              ))}
            </select>
          </Field>
          <details className="gt-column-chooser">
            <summary>Visible columns</summary>
            <div>
              {["Submitted", "Version", "Status"].map((column) => (
                <label key={column} className="gt-check">
                  <input
                    type="checkbox"
                    checked={columns.includes(column)}
                    onChange={() =>
                      setColumns(
                        columns.includes(column)
                          ? columns.filter((item) => item !== column)
                          : [...columns, column],
                      )
                    }
                  />
                  {column}
                </label>
              ))}
            </div>
          </details>
          <button
            className="gt-text-button"
            onClick={() => {
              setQuery("");
              setVersion("all");
              setFrom("");
              setTo("");
              setStatus("all");
              setChecked([]);
              setPage(1);
            }}
          >
            Reset filters
          </button>
        </div>
        {checked.length > 0 && (
          <p className="gt-selection-note" role="status">
            {exportRows.length} selected in the current results. Export uses
            this selection.{" "}
            <button className="gt-text-button" onClick={() => setChecked([])}>
              Clear selection
            </button>
          </p>
        )}
        {!filtered.length ? (
          <EmptyState
            title="Every insight starts with a response."
            action={
              <Link
                className="gt-button gt-button-secondary"
                to={`/forms/${form.slug}`}
              >
                Try the local form
              </Link>
            }
          >
            Once you complete a sample form, its responses will appear here. No
            response data is invented.
          </EmptyState>
        ) : tab === "Summary" ? (
          <div className="gt-response-summary">
            {(form.versions[form.versions.length - 1]?.fields || [])
              .filter((field) =>
                ["radio", "checkbox", "dropdown", "scale", "rating"].includes(
                  field.type,
                ),
              )
              .map((field) => (
                <section key={field.id}>
                  <h2>{field.label}</h2>
                  {(["scale", "rating"].includes(field.type)
                    ? Array.from({ length: field.max || 5 }, (_, index) =>
                        String(index + 1),
                      )
                    : field.options
                  ).map((option) => {
                    const count = filtered.filter((response) =>
                      Array.isArray(response.answers[field.id])
                        ? (response.answers[field.id] as string[]).includes(
                            option,
                          )
                        : response.answers[field.id] === option,
                    ).length;
                    return (
                      <div className="gt-answer-chart" key={option}>
                        <div>
                          <span>{option}</span>
                          <strong>{count}</strong>
                        </div>
                        <div>
                          <span
                            style={{
                              width: `${(count / filtered.length) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </section>
              ))}
            <p className="gt-helper">
              Charts show actual local responses. Question labels remain
              version-aware in Individual view.
            </p>
          </div>
        ) : tab === "Individual" ? (
          <div>
            <label className="gt-field">
              <span>Select a response</span>
              <select
                value={selected?.id || ""}
                onChange={(event) =>
                  setSelected(
                    filtered.find(
                      (response) => response.id === event.target.value,
                    ) || null,
                  )
                }
              >
                <option value="">Choose response</option>
                {filtered.map((response, index) => (
                  <option key={response.id} value={response.id}>
                    Response {index + 1} ·{" "}
                    {new Date(response.submittedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            {detail}
          </div>
        ) : (
          <div className={`gt-responses-split ${selected ? "has-detail" : ""}`}>
            <div className="gt-table-scroll">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="Select responses on this page"
                        checked={
                          pageRows.length > 0 &&
                          pageRows.every((response) =>
                            checked.includes(response.id),
                          )
                        }
                        onChange={(event) =>
                          setChecked(
                            event.target.checked
                              ? [
                                  ...new Set([
                                    ...checked,
                                    ...pageRows.map((response) => response.id),
                                  ]),
                                ]
                              : checked.filter(
                                  (id) =>
                                    !pageRows.some(
                                      (response) => response.id === id,
                                    ),
                                ),
                          )
                        }
                      />
                    </th>
                    <th>Response</th>
                    {columns.includes("Submitted") && <th>Submitted</th>}
                    {columns.includes("Version") && <th>Version</th>}
                    {columns.includes("Status") && <th>Status</th>}
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((response, index) => (
                    <tr
                      key={response.id}
                      className={
                        selected?.id === response.id ? "is-selected" : ""
                      }
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select response ${response.id.slice(0, 8)}`}
                          checked={checked.includes(response.id)}
                          onChange={(event) =>
                            setChecked(
                              event.target.checked
                                ? [...checked, response.id]
                                : checked.filter((id) => id !== response.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <strong>
                          Response {(currentPage - 1) * pageSize + index + 1}
                        </strong>
                        <small>{response.id.slice(0, 8)}</small>
                      </td>
                      {columns.includes("Submitted") && (
                        <td>
                          {new Date(response.submittedAt).toLocaleString()}
                        </td>
                      )}
                      {columns.includes("Version") && (
                        <td>v{response.version}</td>
                      )}
                      {columns.includes("Status") && (
                        <td>
                          <Badge tone="success">
                            {response.redacted ? "Redacted" : "Saved locally"}
                          </Badge>
                        </td>
                      )}
                      <td>
                        <button
                          className="gt-text-button"
                          onClick={() => {
                            setSelected(response);
                            setSensitive(false);
                          }}
                        >
                          View{" "}
                          <ArrowLeft
                            size={13}
                            style={{ transform: "rotate(180deg)" }}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="gt-response-pagination">
                <span>
                  {filtered.length} results · Page {currentPage} of {pages}
                </span>
                <label>
                  Rows
                  <select
                    aria-label="Responses per page"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {[10, 25, 50].map((size) => (
                      <option key={size}>{size}</option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  disabled={currentPage === pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            {detail}
          </div>
        )}
      </div>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogTitle>Export responses</DialogTitle>
          <DialogDescription>
            Download {exportRows.length}{" "}
            {checked.length ? "selected" : "filtered"} local responses.
            Sensitive fields are excluded by default.
          </DialogDescription>
          <Field label="Format">
            <select
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            >
              <option value="csv">CSV · spreadsheet compatible</option>
              <option value="json">JSON · structured data</option>
              <option value="xlsx">XLSX · Excel workbook</option>
            </select>
          </Field>
          <p className="gt-helper">
            Includes original question labels, stable field IDs, and published
            version. CSV and XLSX values are protected against formula
            injection.
          </p>
          <Button onClick={download}>
            <Download size={16} />
            Download local export
          </Button>
          <p role="status" className="gt-helper">
            {notice}
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent>
          <DialogTitle>Save this response view</DialogTitle>
          <DialogDescription>
            Keep the current search, filters, and column preferences in this
            browser. No response values are saved in a view.
          </DialogDescription>
          <Field label="View name">
            <input
              value={viewName}
              maxLength={60}
              onChange={(event) => setViewName(event.target.value)}
            />
          </Field>
          <Button
            disabled={!viewName.trim()}
            onClick={() => {
              const view = {
                name: viewName.trim(),
                query,
                version,
                from,
                to,
                status,
                columns,
              };
              const next = [
                ...savedViews.filter((item) => item.name !== view.name),
                view,
              ];
              try {
                localStorage.setItem(
                  `gdg-response-views-${formId}`,
                  JSON.stringify(next),
                );
                setSavedViews(next);
                setViewOpen(false);
                setViewName("");
              } catch {
                setNotice(
                  "This browser could not save the view. Your responses are unchanged.",
                );
              }
            }}
          >
            Save local view
          </Button>
          <p role="status">{notice}</p>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!destructive}
        onOpenChange={(open) => {
          if (!open) setDestructive(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {destructive === "delete"
              ? "Delete this sample response?"
              : "Redact identity in this sample response?"}
          </DialogTitle>
          <DialogDescription>
            This affects only this browser’s local demonstration data. Type{" "}
            {destructive === "delete" ? "DELETE" : "REDACT"} to confirm.
            {destructive === "redact" &&
              " Identity-labeled and sensitive fields are redacted, including saved revisions. Review free-text answers separately; they may still contain personal information."}
          </DialogDescription>
          <Field label="Confirmation">
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          <Button
            variant="danger"
            disabled={
              confirmation !== (destructive === "delete" ? "DELETE" : "REDACT")
            }
            onClick={() => {
              if (!selected) return;
              if (destructive === "delete")
                formsStore.removeResponse(selected.id);
              else formsStore.redact(selected.id);
              setSelected(null);
              setDestructive(null);
            }}
          >
            Confirm {destructive === "delete" ? "deletion" : "redaction"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
