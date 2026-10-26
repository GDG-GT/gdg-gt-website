import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Archive,
  ArrowRight,
  ArrowUpRight,
  Check,
  ClipboardList,
  Copy,
  Eye,
  FilePlus2,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Sparkles,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import { createTemplate, type PreviewForm, type FormTemplate } from "./store";
import { formsApi, useFormLibrary } from "./api";
import { useAdmin } from "@/contexts/AdminContext";
import FormDeletionReview from "./FormDeletionReview";
import FormLibraryScopeFilter, {
  type FormScopeOption,
} from "./FormLibraryScopeFilter";
import { formTemplateLabels } from "../../../shared/form-library.mjs";

export default function FormsLibrary() {
  const { currentAdmin } = useAdmin();
  return (
    <FormsLibraryWorkspace key={`${currentAdmin?.id}:${currentAdmin?.role}`} />
  );
}
function FormsLibraryWorkspace() {
  const mounted = useRef(false),
    operationPending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const navigate = useNavigate();
  const { isSuperAdmin } = useAdmin();
  const [deletion, setDeletion] = useState<PreviewForm | null>(null);
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("All states"),
    [createOpen, setCreateOpen] = useState(false),
    [title, setTitle] = useState(""),
    [share, setShare] = useState<PreviewForm | null>(null),
    [copied, setCopied] = useState(false);
  const [owner, setOwner] = useState<FormScopeOption>(),
    [team, setTeam] = useState<FormScopeOption>(),
    [template, setTemplate] = useState(""),
    [updatedFrom, setUpdatedFrom] = useState(""),
    [updatedTo, setUpdatedTo] = useState(""),
    [filtersOpen, setFiltersOpen] = useState(false),
    [filterEpoch, setFilterEpoch] = useState(0);
  const dateError = !!updatedFrom && !!updatedTo && updatedFrom > updatedTo;
  const hasFilters = !!(
    query ||
    status !== "All states" ||
    owner ||
    team ||
    template ||
    updatedFrom ||
    updatedTo
  );
  const resetFilters = () => {
    setQuery("");
    setStatus("All states");
    setOwner(undefined);
    setTeam(undefined);
    setTemplate("");
    setUpdatedFrom("");
    setUpdatedTo("");
    setPage(1);
    setFilterEpoch((value) => value + 1);
  };
  const library = useFormLibrary(
      new URLSearchParams({
        page: String(page),
        q: query,
        ...(status !== "All states" ? { state: status } : {}),
        ...(owner ? { owner: owner.id } : {}),
        ...(team ? { team: team.id } : {}),
        ...(template ? { template } : {}),
        ...(updatedFrom ? { updatedFrom } : {}),
        ...(updatedTo ? { updatedTo } : {}),
      }).toString(),
      !dateError,
    ),
    forms = library.items;
  const work = async (action: () => Promise<unknown>) => {
    if (operationPending.current) return;
    operationPending.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      if (mounted.current) library.reload();
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      operationPending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const templates = [
    [
      "Event Interest",
      "Find out what the community wants to explore.",
      "interest",
    ],
    ["Event Feedback", "Make your next gathering even better.", "feedback"],
    [
      "Volunteer Signup",
      "Bring willing hands and good ideas together.",
      "volunteer",
    ],
    [
      "Team Application",
      "Help students find their place in the chapter.",
      "application",
    ],
    ["General Survey", "Start a conversation with your community.", "survey"],
  ] as const;
  const create = (name: string, kind: FormTemplate = "blank") => {
    if (!library.canCreate) return;
    return work(async () => {
      const form = await formsApi.create(createTemplate(name, kind));
      if (mounted.current) navigate(`/admin/forms/${form.id}/edit`);
    });
  };
  const filtered = forms;
  return (
    <div className="gt-admin-page">
      <div className="gt-admin-page-heading">
        <div>
          <p className="gt-breadcrumb">
            Collect ideas. Understand your community.
          </p>
          <h1>Forms</h1>
          <p>Build, publish, and make sense of what comes back.</p>
        </div>
        <Button
          disabled={busy || library.loading || !library.canCreate}
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={17} /> Create form
        </Button>
      </div>
      {(error || library.error) && (
        <p role="alert" className="gt-form-error">
          {error || library.error}{" "}
          <button onClick={library.reload}>Try again</button>
        </p>
      )}
      {library.loading && <p role="status">Loading your forms…</p>}
      <div className="gt-forms-stats">
        {[
          ["Matching forms", library.total],
          [
            "Open on this page",
            forms.filter((form) => form.status === "Open").length,
          ],
          [
            "Drafts on this page",
            forms.filter((form) => form.status === "Draft").length,
          ],
          [
            "Visible responses on this page",
            forms.length &&
            !forms.some((form) => form.actions?.includes("view_responses"))
              ? "Restricted"
              : forms.reduce(
                  (sum, form) =>
                    sum +
                    (form.actions?.includes("view_responses")
                      ? form.responseCount || 0
                      : 0),
                  0,
                ),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div
        className={`gt-forms-library-layout ${library.canCreate ? "" : "is-view-only"}`}
      >
        <section className="gt-panel gt-forms-inventory">
          <div className="gt-panel-heading">
            <h2>Your forms</h2>
            <Badge tone="coral">Chapter workspace</Badge>
          </div>
          <div className="gt-toolbar">
            <SearchBox
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              label="Search forms"
              placeholder="Find a form…"
            />
            <label className="gt-sort">
              <span className="sr-only">Form status</span>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                {[
                  "All states",
                  "Draft",
                  "Open",
                  "Scheduled",
                  "Closed",
                  "Archived",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <details
            className="gt-form-library-filters"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary>
              More filters
              {owner || team || template || updatedFrom || updatedTo
                ? " · active"
                : ""}
            </summary>
            <p className="gt-helper">
              Narrow the full authorized library, not just the current page.
              Date bounds include the entire selected UTC day.
            </p>
            {filtersOpen && (
              <div className="gt-form-library-filter-grid">
                <FormLibraryScopeFilter
                  key={`owner:${filterEpoch}`}
                  kind="owner"
                  value={owner}
                  onChange={(value) => {
                    setOwner(value);
                    setPage(1);
                  }}
                />
                <FormLibraryScopeFilter
                  key={`team:${filterEpoch}`}
                  kind="team"
                  value={team}
                  onChange={(value) => {
                    setTeam(value);
                    setPage(1);
                  }}
                />
                <div className="gt-form-library-scope">
                  <Field label="Template origin">
                    <select
                      value={template}
                      onChange={(event) => {
                        setTemplate(event.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All template origins</option>
                      {Object.entries(formTemplateLabels).map(
                        ([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ),
                      )}
                      <option value="unspecified">
                        Unspecified (older forms)
                      </option>
                    </select>
                  </Field>
                  <Field label="Updated from (UTC)">
                    <input
                      type="date"
                      value={updatedFrom}
                      max={updatedTo || "9999-12-31"}
                      onChange={(event) => {
                        setUpdatedFrom(event.target.value);
                        setPage(1);
                      }}
                    />
                  </Field>
                  <Field label="Updated through (UTC)">
                    <input
                      type="date"
                      value={updatedTo}
                      min={updatedFrom || undefined}
                      max="9999-12-31"
                      aria-invalid={dateError}
                      aria-describedby={
                        dateError ? "form-library-date-error" : undefined
                      }
                      onChange={(event) => {
                        setUpdatedTo(event.target.value);
                        setPage(1);
                      }}
                    />
                  </Field>
                </div>
              </div>
            )}
          </details>
          {dateError && (
            <p
              id="form-library-date-error"
              role="alert"
              className="gt-form-error"
            >
              The end date must be on or after the start date.
            </p>
          )}
          {hasFilters && (
            <Button variant="ghost" onClick={resetFilters}>
              Reset all filters
            </Button>
          )}
          {!library.loading && !library.error && !dateError && (
            <p role="status" className="gt-helper">
              {library.total}{" "}
              {library.total === 1 ? "form matches" : "forms match"} your
              filters.
            </p>
          )}
          {filtered.length ? (
            <div className="gt-table-scroll">
              <table className="gt-table">
                <thead>
                  <tr>
                    <th>Form</th>
                    <th>Status</th>
                    <th>Responses</th>
                    <th>Version</th>
                    <th>Updated</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((form) => (
                    <tr key={form.id}>
                      <td>
                        <Link
                          className="gt-form-name"
                          to={`/admin/forms/${form.id}/edit`}
                        >
                          <span className="gt-form-file-icon">
                            <ClipboardList size={20} />
                          </span>
                          <span>
                            <strong>{form.title}</strong>
                            <small>
                              {form.team} ·{" "}
                              {form.ownerLabel || "Owner " + form.ownerId}
                              {form.templateKey && (
                                <> · {formTemplateLabels[form.templateKey]}</>
                              )}
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <Badge
                          tone={
                            form.status === "Open"
                              ? "success"
                              : form.status === "Scheduled"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          {form.status}
                        </Badge>
                      </td>
                      <td>
                        {form.actions?.includes("view_responses") ? (
                          <Link to={`/admin/forms/${form.id}/responses`}>
                            {form.responseCount ?? 0}
                          </Link>
                        ) : (
                          <span>Restricted</span>
                        )}
                      </td>
                      <td>
                        {form.versions.length
                          ? `v${form.versions.length}`
                          : "Not published"}
                      </td>
                      <td>
                        {new Date(form.updatedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="gt-icon-button"
                              disabled={busy}
                              aria-label={`Actions for ${form.title}`}
                            >
                              <MoreHorizontal size={19} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/admin/forms/${form.id}/edit`)
                              }
                            >
                              {form.actions?.includes("edit")
                                ? "Edit form"
                                : "View form"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/forms/${form.slug}?preview=1`)
                              }
                            >
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !form.actions?.includes("view_responses")
                              }
                              onClick={() =>
                                navigate(`/admin/forms/${form.id}/responses`)
                              }
                            >
                              View responses
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setShare(form);
                                setCopied(false);
                              }}
                            >
                              Share
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={busy || !form.canDuplicate}
                              onClick={() =>
                                work(() => formsApi.duplicate(form))
                              }
                            >
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={
                                !form.versions.length ||
                                !form.actions?.includes("publish")
                              }
                              onClick={() =>
                                work(() =>
                                  formsApi.state(
                                    form,
                                    form.status === "Open" ? "Closed" : "Open",
                                  ),
                                )
                              }
                            >
                              {form.status === "Open"
                                ? "Close form"
                                : "Reopen form"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!form.actions?.includes("delete")}
                              onClick={() =>
                                work(() =>
                                  form.status === "Archived"
                                    ? formsApi.restore(form)
                                    : formsApi.archive(form),
                                )
                              }
                            >
                              {form.status === "Archived"
                                ? "Restore draft"
                                : "Archive form"}
                            </DropdownMenuItem>
                            {isSuperAdmin && form.status === "Archived" && (
                              <DropdownMenuItem
                                disabled={busy}
                                onClick={() => setDeletion(form)}
                              >
                                Review permanent deletion…
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !library.loading && !library.error && !dateError ? (
            <EmptyState
              title={
                hasFilters
                  ? "No forms match your filters"
                  : library.canCreate
                    ? "Create your first form"
                    : "No forms are available"
              }
              action={
                hasFilters || library.canCreate ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      hasFilters ? resetFilters() : setCreateOpen(true)
                    }
                  >
                    {hasFilters ? "Reset filters" : "Create a form"}
                  </Button>
                ) : (
                  <Link to="/admin">Back to dashboard</Link>
                )
              }
            >
              {hasFilters
                ? "Try widening the date, owner, team or template filters."
                : library.canCreate
                  ? "Start with a blank page or a helpful template."
                  : "Forms shared with your account will appear here. Ask a form owner if you need access."}
            </EmptyState>
          ) : null}
          <div className="gt-table-footer">
            <span>{library.total} matching forms</span>
            <div className="gt-actions">
              <Button
                variant="ghost"
                disabled={page === 1 || library.loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="ghost"
                disabled={page * 30 >= library.total || library.loading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
        {library.canCreate && (
          <aside className="gt-forms-template-panel">
            <h2>A head start.</h2>
            <p>Good questions start here.</p>
            {templates.map(([name, description, kind]) => (
              <button
                key={name}
                disabled={busy}
                onClick={() => create(`${name} Form`, kind)}
              >
                <span className="gt-template-icon">
                  <FilePlus2 size={19} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{description}</small>
                </span>
                <Plus size={16} />
              </button>
            ))}
            <div className="gt-template-tip">
              <Sparkles size={22} />
              <h3>Made for your chapter.</h3>
              <p>
                Build on the website, collect responses in one place, and keep
                your community in the loop.
              </p>
            </div>
          </aside>
        )}
      </div>
      {deletion && (
        <FormDeletionReview
          formId={deletion.id}
          title={deletion.title}
          onClose={() => setDeletion(null)}
          onDeleted={() => {
            setDeletion(null);
            library.reload();
          }}
        />
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle>What are you creating?</DialogTitle>
          <DialogDescription>
            Give your form a name. You can change it later.
          </DialogDescription>
          <form
            className="gt-form"
            onSubmit={(event) => {
              event.preventDefault();
              create(title.trim());
            }}
          >
            <Field label="Form title" required>
              <input
                autoFocus
                disabled={busy}
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="For example, Workshop feedback"
              />
            </Field>
            <Button type="submit" disabled={busy || !library.canCreate}>
              <Plus size={17} /> Create form
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!share}
        onOpenChange={(open) => {
          if (!open) setShare(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Share your form</DialogTitle>
          <DialogDescription>
            {share?.versions.length
              ? "This opens the published form. Restricted forms also require their private access link or an authorized account."
              : "Publish this draft before collecting responses."}
          </DialogDescription>
          <Field label="Form address">
            <input
              readOnly
              value={
                share ? `${window.location.origin}/forms/${share.slug}` : ""
              }
            />
          </Field>
          <Button
            disabled={!share?.versions.length}
            onClick={async () => {
              if (share) {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/forms/${share.slug}`,
                );
                setCopied(true);
              }
            }}
          >
            {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
