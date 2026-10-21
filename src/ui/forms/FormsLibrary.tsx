import { useState } from "react";
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

export default function FormsLibrary() {
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
  const library = useFormLibrary(
      new URLSearchParams({
        page: String(page),
        q: query,
        ...(status !== "All states" ? { state: status } : {}),
      }).toString(),
    ),
    forms = library.items;
  const work = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      library.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
  const create = (name: string, kind: FormTemplate = "blank") =>
    work(async () => {
      const form = await formsApi.create(createTemplate(name, kind));
      navigate(`/admin/forms/${form.id}/edit`);
    });
  const filtered = forms.filter(
    (form) =>
      form.title.toLowerCase().includes(query.toLowerCase()) &&
      (status === "All states" ? true : status === form.status),
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
        <Button disabled={busy} onClick={() => setCreateOpen(true)}>
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
            "Responses on this page",
            forms.reduce((sum, form) => sum + (form.responseCount || 0), 0),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="gt-forms-library-layout">
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
                              {form.team} · Owner {form.ownerId}
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
                        <Link to={`/admin/forms/${form.id}/responses`}>
                          {form.responseCount ?? "Restricted"}
                        </Link>
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
                              Edit form
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/forms/${form.slug}?preview=1`)
                              }
                            >
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem
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
                            {isSuperAdmin && form.status === "Archived" && <DropdownMenuItem disabled={busy} onClick={() => setDeletion(form)}>Review permanent deletion…</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={
                query || status !== "All states"
                  ? "No forms match your filters"
                  : "Create your first form"
              }
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    query || status !== "All states"
                      ? (setQuery(""), setStatus("All states"))
                      : setCreateOpen(true)
                  }
                >
                  {query || status !== "All states"
                    ? "Reset filters"
                    : "Create a form"}
                </Button>
              }
            >
              Start with a blank page or a helpful template.
            </EmptyState>
          )}
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
      </div>
      {deletion && <FormDeletionReview formId={deletion.id} title={deletion.title} onClose={() => setDeletion(null)} onDeleted={() => { setDeletion(null); library.reload(); }} />}
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
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="For example, Workshop feedback"
              />
            </Field>
            <Button type="submit" disabled={busy}>
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
