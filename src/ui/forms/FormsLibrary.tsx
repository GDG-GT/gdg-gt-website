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
import ScrollableTable from "../ScrollableTable";
import { createTemplate, type PreviewForm, type FormTemplate } from "./store";
import {
  useFormLibrary,
  prepareFormLibraryWrite,
  submitFormLibraryWrite,
  formLibraryWriteLabel,
  type FormLibraryIntent,
} from "./api";
import { ApiFailure } from "@/lib/api";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import FormLibraryWriteRecovery from "./FormLibraryWriteRecovery";
import { useAdmin } from "@/contexts/AdminContext";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import FormDeletionReview from "./FormDeletionReview";
import FormLibraryScopeFilter, {
  type FormScopeOption,
} from "./FormLibraryScopeFilter";
import { formTemplateLabels } from "../../../shared/form-library.mjs";

export default function FormsLibrary() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <FormsLibraryWorkspace
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function FormsLibraryWorkspace() {
  const mutation = usePrivateMutation("form-library"),
    { cancel: cancelMutation } = mutation,
    operationPending = mutation.pending,
    mounted = useRef(false),
    activeIntent = useRef<FormLibraryIntent>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const navigate = useNavigate();
  const navigationSafety = useNavigationSafety();
  const { isSuperAdmin } = useAdmin();
  const [deletion, setDeletion] = useState<PreviewForm | null>(null);
  const [activeActions, setActiveActions] = useState<string | null>(null);
  const [review, setReview] = useState<{
    form: PreviewForm;
    action: "archive" | "restore" | "close" | "reopen" | "duplicate";
  }>();
  const [notice, setNotice] = useState("");
  const { isOnline } = useOnlineStatus();
  const [page, setPage] = useState(1),
    [error, setError] = useState("");
  const [uncertain, setUncertain] = useState<FormLibraryIntent>(),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [abandonRecovery, setAbandonRecovery] = useState(false);
  const busy = mutation.busy || recoveryBusy;
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
    if (operationPending.current || recoveryBusy) return;
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
  const paused =
    library.loading ||
    !!library.error ||
    library.denied ||
    !isOnline ||
    dateError ||
    !!uncertain;
  const currentReadScope = useRef(library.scope);
  currentReadScope.current = library.scope;
  const recheckLibrary = async () => {
    const scope = library.scope;
    await library.reload();
    if (mounted.current && currentReadScope.current === scope)
      (
        document.getElementById("form-library-read-status") ||
        document.getElementById("workspace-content")
      )?.focus();
  };
  useEffect(() => {
    if (!library.denied) return;
    cancelMutation();
    activeIntent.current = undefined;
    setUncertain(undefined);
    setRecoveryBusy(false);
    setAbandonRecovery(false);
    setReview(undefined);
    setDeletion(null);
    setActiveActions(null);
    setShare(null);
    setCreateOpen(false);
    setTitle("");
    setError("");
    setNotice("");
    setCopied(false);
    setOwner(undefined);
    setTeam(undefined);
    setQuery("");
    setStatus("All states");
    setTemplate("");
    setUpdatedFrom("");
    setUpdatedTo("");
    setPage(1);
    setFilterEpoch((value) => value + 1);
  }, [library.denied, cancelMutation]);
  useEffect(() => {
    if (!isOnline && operationPending.current && activeIntent.current) {
      const original = activeIntent.current;
      cancelMutation();
      activeIntent.current = undefined;
      setUncertain(original);
      setReview(undefined);
      setCreateOpen(false);
      setError("");
    }
  }, [isOnline, cancelMutation, operationPending]);
  const committed = (intent: FormLibraryIntent, form: PreviewForm) => {
    if (!mounted.current) return;
    setUncertain(undefined);
    setRecoveryBusy(false);
    setAbandonRecovery(false);
    setReview(undefined);
    setCreateOpen(false);
    setError("");
    if (intent.action === "create") {
      setTitle("");
      navigationSafety.allow(() => navigate(`/admin/forms/${form.id}/edit`));
    } else {
      setNotice(
        `${intent.snapshot.title}: original ${formLibraryWriteLabel(intent)} change confirmed. Saved result: ${form.status}.`,
      );
      const scope = library.scope;
      void library.reload().then(() => {
        if (mounted.current && currentReadScope.current === scope)
          document.getElementById("form-library-write-result")?.focus();
      });
    }
  };
  const work = async (intent: FormLibraryIntent) => {
    if (operationPending.current || paused) return;
    const controller = mutation.begin();
    if (!controller) return;
    activeIntent.current = intent;
    setError("");
    setNotice("");
    try {
      const form = await submitFormLibraryWrite(intent, controller.signal);
      if (!mutation.current(controller)) return;
      if (!form?.id)
        throw new ApiFailure(
          503,
          "UNAVAILABLE",
          "The saved result could not be confirmed. Recheck the original change.",
        );
      committed(intent, form);
    } catch (e) {
      if (!mutation.current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        library.clear();
        return;
      }
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(intent);
        setReview(undefined);
        setCreateOpen(false);
        setError(
          "The change response was interrupted. Recheck the original outcome before trying again.",
        );
      } else {
        setError(e.message);
        if (e.status === 409) void library.reload();
      }
    } finally {
      if (activeIntent.current === intent) activeIntent.current = undefined;
      mutation.finish(controller);
    }
  };
  useDraftGuard(!!review || !!title.trim() || !!uncertain, {
    busy,
    label: uncertain
      ? `Unconfirmed ${formLibraryWriteLabel(uncertain)} for ${uncertain.snapshot.title}; the change may already have completed`
      : review
        ? "Form availability review"
        : "New form draft",
  });
  const reviewCurrent =
      review && forms.find((form) => form.id === review.form.id),
    reviewChanged =
      !!review &&
      !library.loading &&
      !library.error &&
      (!reviewCurrent ||
        reviewCurrent.revision !== review.form.revision ||
        reviewCurrent.status !== review.form.status),
    reviewAllowed =
      review?.action === "duplicate"
        ? !!reviewCurrent?.canDuplicate
        : !!reviewCurrent?.actions?.includes(
            review?.action === "archive" || review?.action === "restore"
              ? "delete"
              : "publish",
          ),
    reviewLabel = review
      ? {
          archive: "Archive form",
          restore: "Restore draft",
          close: "Close form",
          reopen: "Reopen form",
          duplicate: "Duplicate form",
        }[review.action]
      : "Review form";
  const beginReview = (
    form: PreviewForm,
    action: NonNullable<typeof review>["action"],
  ) => {
    if (operationPending.current || paused) return;
    setError("");
    setNotice("");
    setReview({ form, action });
    library.reload();
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
    return work(prepareFormLibraryWrite("create", createTemplate(name, kind)));
  };
  const openCreate = () => {
    if (busy || paused || !library.canCreate) return;
    setCreateOpen(true);
    void library.reload();
  };
  const filtered = forms;
  if (library.denied)
    return (
      <div className="gt-admin-page">
        <h1>Forms</h1>
        <EmptyState
          title="Form library access needs to be rechecked"
          action={
            <Button
              variant="secondary"
              disabled={!isOnline || library.loading}
              onClick={() => void library.reload()}
            >
              Recheck form library access
            </Button>
          }
        >
          {library.error} Private forms, reviews and new-form input have been
          cleared.
        </EmptyState>
      </div>
    );
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
          disabled={busy || paused || !library.canCreate}
          onClick={openCreate}
        >
          <Plus size={17} /> Create form
        </Button>
      </div>
      {((error && !uncertain) || library.error) && (
        <p role="alert" className="gt-form-error">
          {library.error || error}{" "}
          <button
            disabled={busy || library.loading || !isOnline}
            onClick={() => void recheckLibrary()}
          >
            {uncertain ? "Refresh library only" : "Try again"}
          </button>
        </p>
      )}
      <section
        className="gt-form-library-read-status"
        aria-label="Form library read status"
      >
        <p id="form-library-read-status" role="status" tabIndex={-1}>
          {library.at ? (
            <>
              Last successful form library read:{" "}
              <time dateTime={library.at}>
                {new Date(library.at).toLocaleString()}
              </time>
              .
              {uncertain
                ? " The original change is unconfirmed; new writes remain paused."
                : paused
                  ? " Saved forms remain visible; writes are paused until current access is checked."
                  : " Current authorized inventory loaded."}
            </>
          ) : library.loading ? (
            "Loading the current authorized form library…"
          ) : (
            "A successful current library read is required before changes."
          )}
        </p>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || library.loading || !isOnline || dateError}
          onClick={() => void recheckLibrary()}
        >
          Recheck form library
        </Button>
      </section>
      {!isOnline && (
        <p role="alert">You are offline. Form library changes are paused.</p>
      )}
      {notice && (
        <p id="form-library-write-result" tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {uncertain && (
        <FormLibraryWriteRecovery
          key={uncertain.key}
          intent={uncertain}
          onBusy={setRecoveryBusy}
          onRecovered={(form) => committed(uncertain, form)}
          onDenied={() => library.clear()}
          onAbandon={() => setAbandonRecovery(true)}
        />
      )}
      {library.loading && <p role="status">Loading your forms…</p>}
      {library.at && (
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
      )}
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
              disabled={busy}
              value={query}
              onChange={(value) => {
                if (operationPending.current || recoveryBusy) return;
                setQuery(value);
                setPage(1);
              }}
              label="Search forms"
              placeholder="Find a form…"
            />
            <label className="gt-sort">
              <span className="sr-only">Form status</span>
              <select
                disabled={busy}
                value={status}
                onChange={(event) => {
                  if (operationPending.current || recoveryBusy) return;
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
                  disabled={busy}
                  value={owner}
                  onChange={(value) => {
                    if (operationPending.current || recoveryBusy) return;
                    setOwner(value);
                    setPage(1);
                  }}
                />
                <FormLibraryScopeFilter
                  key={`team:${filterEpoch}`}
                  kind="team"
                  disabled={busy}
                  value={team}
                  onChange={(value) => {
                    if (operationPending.current || recoveryBusy) return;
                    setTeam(value);
                    setPage(1);
                  }}
                />
                <div className="gt-form-library-scope">
                  <Field label="Template origin">
                    <select
                      disabled={busy}
                      value={template}
                      onChange={(event) => {
                        if (operationPending.current || recoveryBusy) return;
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
                      disabled={busy}
                      value={updatedFrom}
                      max={updatedTo || "9999-12-31"}
                      onChange={(event) => {
                        if (operationPending.current || recoveryBusy) return;
                        setUpdatedFrom(event.target.value);
                        setPage(1);
                      }}
                    />
                  </Field>
                  <Field label="Updated through (UTC)">
                    <input
                      type="date"
                      disabled={busy}
                      value={updatedTo}
                      min={updatedFrom || undefined}
                      max="9999-12-31"
                      aria-invalid={dateError}
                      aria-describedby={
                        dateError ? "form-library-date-error" : undefined
                      }
                      onChange={(event) => {
                        if (operationPending.current || recoveryBusy) return;
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
            <ScrollableTable
              className="gt-table-scroll"
              label="Form inventory table"
            >
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
                        <DropdownMenu
                          open={activeActions === form.id}
                          onOpenChange={(open) =>
                            setActiveActions(open ? form.id : null)
                          }
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              className="gt-icon-button"
                              disabled={busy}
                              aria-label={`Actions for ${form.title}`}
                            >
                              <MoreHorizontal size={19} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            onKeyDownCapture={(event) => {
                              // Keep Escape available as soon as menu focus is
                              // established, including before Radix's deferred
                              // document-layer registration has completed.
                              if (
                                event.key === "Escape" &&
                                !event.nativeEvent.isComposing &&
                                !event.defaultPrevented
                              ) {
                                event.preventDefault();
                                setActiveActions(null);
                              }
                            }}
                          >
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
                              disabled={busy || paused || !form.canDuplicate}
                              onClick={() => beginReview(form, "duplicate")}
                            >
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={
                                busy ||
                                paused ||
                                form.status === "Archived" ||
                                !form.versions.length ||
                                !form.actions?.includes("publish")
                              }
                              onClick={() =>
                                beginReview(
                                  form,
                                  form.status === "Open" ? "close" : "reopen",
                                )
                              }
                            >
                              {form.status === "Open"
                                ? "Close form"
                                : "Reopen form"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                busy ||
                                paused ||
                                !form.actions?.includes("delete")
                              }
                              onClick={() =>
                                beginReview(
                                  form,
                                  form.status === "Archived"
                                    ? "restore"
                                    : "archive",
                                )
                              }
                            >
                              {form.status === "Archived"
                                ? "Restore draft"
                                : "Archive form"}
                            </DropdownMenuItem>
                            {isSuperAdmin && form.status === "Archived" && (
                              <DropdownMenuItem
                                disabled={busy || paused}
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
            </ScrollableTable>
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
                    onClick={() => (hasFilters ? resetFilters() : openCreate())}
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
                disabled={busy || page === 1 || library.loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="ghost"
                disabled={busy || page * 30 >= library.total || library.loading}
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
                disabled={busy || paused}
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
      <Dialog
        open={!!review && !uncertain}
        onOpenChange={(open) => {
          if (!open && !operationPending.current) setReview(undefined);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(event) => {
            if (uncertain) {
              event.preventDefault();
              queueMicrotask(() => {
                if (mounted.current)
                  document
                    .getElementById("form-library-recovery-status")
                    ?.focus();
              });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (operationPending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (operationPending.current) event.preventDefault();
          }}
        >
          <DialogTitle>{reviewLabel}?</DialogTitle>
          <DialogDescription>
            {review?.action === "duplicate"
              ? "Create one private draft copy of the current saved questions and settings in the same chapter/team scope. Responses, published versions and collaborator access are not copied."
              : review?.action === "archive"
                ? "Remove this form from active use. Responses and published history are retained; the form can be restored as a private draft."
                : review?.action === "restore"
                  ? "Restore this archived form as a private draft. This does not reopen it or collect new responses."
                  : review?.action === "close"
                    ? "Stop new submissions to this form. Existing responses and published history are retained. You can review reopening later."
                    : "Reopen the published form for new submissions under its existing access rules, schedule and response limit."}
          </DialogDescription>
          <p>
            <strong>{review?.form.title}</strong>
          </p>
          <p>
            Saved revision {review?.form.revision} · {review?.form.status} ·{" "}
            {review?.form.team || "Chapter"}.
          </p>
          {review?.action === "duplicate" && (
            <p>New private draft title: {review.form.title} (copy).</p>
          )}
          {library.loading && (
            <p role="status">
              Checking the form's current state and permissions…
            </p>
          )}
          {reviewChanged && (
            <p role="alert">
              The form changed or is no longer in this inventory. Cancel and
              review its current state before continuing.
            </p>
          )}
          {!reviewAllowed && !library.loading && (
            <p role="alert">
              Your current permissions do not allow this action.
            </p>
          )}
          {(error || library.error) && (
            <p
              id="form-library-review-error"
              tabIndex={-1}
              role="alert"
              className="gt-form-error"
            >
              {error || library.error}
            </p>
          )}
          {!isOnline && (
            <p role="status">
              You are offline. Reconnect before confirming this action.
            </p>
          )}
          <div className="gt-inline-actions">
            <Button
              variant={
                review?.action === "archive" || review?.action === "close"
                  ? "danger"
                  : "primary"
              }
              disabled={
                busy ||
                !isOnline ||
                library.loading ||
                !!library.error ||
                reviewChanged ||
                !reviewAllowed
              }
              onClick={() => {
                if (
                  !review ||
                  !reviewCurrent ||
                  reviewChanged ||
                  !reviewAllowed ||
                  !isOnline ||
                  library.loading ||
                  library.error
                )
                  return;
                const action =
                  review.action === "close" || review.action === "reopen"
                    ? "state"
                    : review.action;
                void work(
                  prepareFormLibraryWrite(
                    action,
                    review.form,
                    review.action === "close"
                      ? "Closed"
                      : review.action === "reopen"
                        ? "Open"
                        : undefined,
                  ),
                );
              }}
            >
              {busy ? "Saving…" : reviewLabel}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Cancel review
            </Button>
            <Button
              variant="ghost"
              disabled={busy || library.loading || !isOnline}
              onClick={() => void library.reload()}
            >
              Recheck form
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={createOpen && !uncertain}
        onOpenChange={(open) => {
          if (!operationPending.current) setCreateOpen(open);
        }}
      >
        <DialogContent
          className={mutation.busy ? "[&>button]:hidden" : undefined}
          onCloseAutoFocus={(event) => {
            if (uncertain) {
              event.preventDefault();
              queueMicrotask(() => {
                if (mounted.current)
                  document
                    .getElementById("form-library-recovery-status")
                    ?.focus();
              });
            }
          }}
          onEscapeKeyDown={(event) => {
            if (operationPending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (operationPending.current) event.preventDefault();
          }}
        >
          <DialogTitle>What are you creating?</DialogTitle>
          <DialogDescription>
            Give your form a name. You can change it later.
          </DialogDescription>
          {error && (
            <p
              id="form-library-create-error"
              tabIndex={-1}
              role="alert"
              className="gt-form-error"
            >
              {error}
            </p>
          )}
          {(library.error || !isOnline) && (
            <div role="alert">
              <p>
                {library.error || "You are offline. Creating a form is paused."}{" "}
                Your proposed title remains on this page.
              </p>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || library.loading || !isOnline}
                onClick={() => void library.reload()}
              >
                Recheck form creation access
              </Button>
            </div>
          )}
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
                aria-describedby={
                  error ? "form-library-create-error" : undefined
                }
                onChange={(event) => {
                  if (!operationPending.current) {
                    setTitle(event.target.value);
                    setError("");
                  }
                }}
                placeholder="For example, Workshop feedback"
              />
            </Field>
            <Button
              type="submit"
              disabled={busy || paused || !library.canCreate}
            >
              <Plus size={17} /> Create form
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={abandonRecovery && !!uncertain}
        onOpenChange={(open) => {
          if (!recoveryBusy) setAbandonRecovery(open);
        }}
      >
        <DialogContent>
          <DialogTitle>Stop recovering this form change?</DialogTitle>
          <DialogDescription>
            The original {uncertain && formLibraryWriteLabel(uncertain)} request
            for “{uncertain?.snapshot.title}” may already have completed.
            Stopping recovery does not undo or cancel it. Check the current
            library before starting another change; existing forms and responses
            are retained.
          </DialogDescription>
          <Button
            disabled={recoveryBusy}
            onClick={() => {
              setUncertain(undefined);
              setAbandonRecovery(false);
              setError("");
              setReview(undefined);
              setCreateOpen(false);
              setNotice(
                "Recovery stopped. The original change may already have completed; inspect the current library before another action.",
              );
              void recheckLibrary();
            }}
          >
            Stop recovery and inspect the library
          </Button>
          <Button variant="secondary" onClick={() => setAbandonRecovery(false)}>
            Keep recovering this change
          </Button>
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
