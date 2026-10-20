import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
type Kind =
  | "resources"
  | "sponsors"
  | "sponsor-tiers"
  | "sponsor-stats"
  | "team-profiles";
type Input = {
  name: string;
  label: string;
  type?: "long" | "lines" | "number" | "url" | "email" | "color";
  options?: readonly string[];
  required?: boolean;
  max?: number;
  default?: string;
};
const common: Input[] = [
  { name: "order_index", label: "Display order", type: "number", default: "0" },
];
const specifications: Record<
  Kind,
  { title: string; description: string; fields: Input[] }
> = {
  resources: {
    title: "Resources",
    description:
      "Curate learning opportunities and useful links. Drafts stay private until explicitly published.",
    fields: [
      { name: "title", label: "Title", required: true, max: 200 },
      {
        name: "description",
        label: "Description",
        type: "long",
        required: true,
        max: 10000,
      },
      {
        name: "type",
        label: "Resource type",
        options: ["study_jam", "cloud_credit", "documentation", "recording"],
      },
      { name: "category", label: "Category", max: 100 },
      { name: "url", label: "Resource URL", type: "url" },
      {
        name: "level",
        label: "Level",
        options: ["Beginner", "Intermediate", "Advanced"],
      },
      {
        name: "status",
        label: "Availability",
        options: ["Available", "Coming Soon", "Archived"],
      },
      { name: "provider", label: "Provider", max: 200 },
      { name: "duration", label: "Duration", max: 100 },
      { name: "amount", label: "Credit amount or offer", max: 100 },
      { name: "speaker", label: "Speaker", max: 200 },
      {
        name: "requirements",
        label: "Requirements · one per line",
        type: "lines",
      },
      { name: "materials", label: "Materials · one per line", type: "lines" },
      { name: "tags", label: "Tags · one per line", type: "lines" },
      { name: "icon", label: "Icon name", max: 60 },
      {
        name: "color",
        label: "Accent color",
        type: "color",
        default: "#E6705F",
      },
      ...common,
    ],
  },
  sponsors: {
    title: "Sponsors",
    description:
      "Manage chapter partners. Publishing makes a sponsor visible on the public website.",
    fields: [
      { name: "name", label: "Sponsor name", required: true, max: 200 },
      {
        name: "logo_url",
        label: "Approved logo URL or /assets/ path",
        required: true,
      },
      { name: "website_url", label: "Website", type: "url" },
      {
        name: "tier",
        label: "Sponsorship tier",
        options: ["bronze", "silver", "gold", "platinum"],
      },
      ...common,
    ],
  },
  "sponsor-tiers": {
    title: "Sponsorship tiers",
    description: "Define sponsorship packages and their approved benefits.",
    fields: [
      { name: "tier_name", label: "Tier name", required: true, max: 100 },
      {
        name: "tier_level",
        label: "Tier level",
        options: ["bronze", "silver", "gold", "platinum"],
      },
      {
        name: "amount",
        label: "Amount or contribution description",
        required: true,
        max: 100,
      },
      {
        name: "color_gradient",
        label: "Approved accent",
        options: ["coral", "gold", "silver", "bronze"],
      },
      { name: "benefits", label: "Benefits · one per line", type: "lines" },
      ...common,
    ],
  },
  "sponsor-stats": {
    title: "Verified impact",
    description:
      "Only publish figures approved by chapter leadership. No invented statistics are added.",
    fields: [
      { name: "stat_label", label: "Metric label", required: true, max: 100 },
      { name: "stat_value", label: "Verified value", required: true, max: 50 },
      {
        name: "stat_description",
        label: "Context and verification",
        required: true,
        type: "long",
        max: 1000,
      },
      {
        name: "icon_name",
        label: "Icon",
        options: ["users", "calendar", "code", "award", "heart", "globe"],
      },
      ...common,
    ],
  },
  "team-profiles": {
    title: "Public team profiles",
    description:
      "Manage chapter biographies separately from private account permissions. Profiles are drafts until published.",
    fields: [
      { name: "name", label: "Name", required: true, max: 100 },
      { name: "role", label: "Chapter role", required: true, max: 100 },
      { name: "bio", label: "Biography", type: "long", max: 3000 },
      { name: "image_url", label: "Approved photo URL or /assets/ path" },
      { name: "linkedin_url", label: "LinkedIn", type: "url" },
      { name: "github_url", label: "GitHub", type: "url" },
      {
        name: "email",
        label: "Private contact email · never shown publicly",
        type: "email",
      },
      {
        name: "team_section",
        label: "Public section",
        default: "Active Members",
        required: true,
        max: 100,
      },
      ...common,
    ],
  },
};
type Row = {
  id: string;
  revision: number;
  is_active: boolean;
  deleted_at: string | null;
  team_id: string | null;
  updated_at: string;
  actions: string[];
  [key: string]: unknown;
};
type Listing = { items: Row[]; total: number; page: number; pageSize: number };
type Capabilities = {
  globalCreate: boolean;
  teams: { id: string; name: string }[];
};
const rowLabel = (row: Row) =>
  String(
    row.title || row.name || row.tier_name || row.stat_label || "Untitled",
  );
export default function CollectionWorkspace({
  initialKind,
}: {
  initialKind: Kind;
}) {
  const [kind, setKind] = useState<Kind>(initialKind),
    [data, setData] = useState<Listing>(),
    [capabilities, setCapabilities] = useState<Capabilities>(),
    [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{
      row?: Row;
      values: Record<string, string>;
      teamId: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<{
      row: Row;
      action: "archive" | "publish";
    }>(),
    [discard, setDiscard] = useState(false);
  const original = useRef(""),
    editorHeading = useRef<HTMLHeadingElement>(null),
    spec = specifications[kind],
    prefix = "/admin/content-records/" + kind;
  const dirty = !!editor && JSON.stringify(editor) !== original.current,
    editorKey = editor ? editor.row?.id || "new" : null;
  useEffect(() => {
    document.title = spec.title + " · GDG workspace";
  }, [spec.title]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(undefined);
    setError("");
    Promise.all([
      api<Listing>(
        prefix + "?" + new URLSearchParams({ q, state, page: String(page) }),
        { signal: controller.signal },
      ),
      api<Capabilities>(prefix + "/capabilities", {
        signal: controller.signal,
      }),
    ])
      .then(([rows, allowed]) => {
        setData(rows);
        setCapabilities(allowed);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [prefix, q, state, page, refresh]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (editorKey) editorHeading.current?.focus();
  }, [editorKey]);
  const open = (row?: Row) => {
    const next = {
      row,
      values: Object.fromEntries(
        spec.fields.map((field) => {
          const value = row?.[field.name];
          return [
            field.name,
            Array.isArray(value)
              ? value.join("\n")
              : value === undefined || value === null
                ? field.default || field.options?.[0] || ""
                : String(value),
          ];
        }),
      ),
      teamId:
        row?.team_id ||
        (!capabilities?.globalCreate ? capabilities?.teams[0]?.id || "" : ""),
    };
    setEditor(next);
    original.current = JSON.stringify(next);
    setDiscard(false);
    setErrors({});
    setError("");
    setConfirm(undefined);
  };
  const mutate = async (row: Row, action: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(prefix + "/" + row.id, {
        method: action === "archive" ? "DELETE" : "POST",
        protected: true,
        body: { revision: row.revision, action },
      });
      setConfirm(undefined);
      setRefresh((v) => v + 1);
      setNotice(
        action === "archive"
          ? "Moved to archive. You can restore it from Archived records."
          : action === "restore"
            ? "Restored as a private draft."
            : action === "duplicate"
              ? "A private draft copy was created."
              : "Publication state updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const tabs: Kind[] =
    initialKind === "sponsors"
      ? ["sponsors", "sponsor-tiers", "sponsor-stats"]
      : [initialKind];
  return (
    <div className="gt-admin-page">
      <div className="gt-admin-page-heading">
        <div>
          <p className="gt-breadcrumb">Chapter content</p>
          <h1>{spec.title}</h1>
          <p>{spec.description}</p>
        </div>
        <Button
          disabled={
            busy ||
            !!editor ||
            !(capabilities?.globalCreate || capabilities?.teams.length)
          }
          onClick={() => open()}
        >
          Create draft
        </Button>
      </div>
      {tabs.length > 1 && (
        <div className="gt-actions" aria-label="Sponsor content sections">
          {tabs.map((value) => (
            <Button
              key={value}
              variant={kind === value ? "primary" : "secondary"}
              disabled={!!editor || busy}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setPage(1);
                setNotice("");
              }}
            >
              {specifications[value].title}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p className="gt-form-error" role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRefresh((v) => v + 1)}>
            Retry loading
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {editor && (
        <section className="gt-panel gt-event-editor">
          <h2 tabIndex={-1} ref={editorHeading}>
            {editor.row ? "Edit " + rowLabel(editor.row) : "New private draft"}
          </h2>
          <p className="gt-helper">
            Saving never publishes a draft. Publishing is a separate,
            permission-checked action.
          </p>
          <form
            className="gt-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              setErrors({});
              try {
                const record = Object.fromEntries(
                  spec.fields.map((field) => [
                    field.name,
                    field.type === "lines"
                      ? editor.values[field.name]
                          .split("\n")
                          .map((value) => value.trim())
                          .filter(Boolean)
                      : field.type === "number"
                        ? Number(editor.values[field.name])
                        : field.name === "image_url" &&
                            !editor.values[field.name]
                          ? null
                          : editor.values[field.name],
                  ]),
                );
                await api(prefix + (editor.row ? "/" + editor.row.id : ""), {
                  method: editor.row ? "PATCH" : "POST",
                  protected: true,
                  body: {
                    ...(editor.row ? { revision: editor.row.revision } : {}),
                    teamId: editor.teamId || null,
                    record,
                  },
                });
                setEditor(null);
                setRefresh((v) => v + 1);
                setNotice(
                  "Saved as a private draft. Publish separately after review.",
                );
              } catch (e) {
                setError((e as Error).message);
                if (e instanceof ApiFailure) setErrors(e.fields || {});
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="Owning team"
              hint="Team-scoped records require both membership and an explicit action grant."
            >
              <select
                value={editor.teamId}
                onChange={(event) =>
                  setEditor({ ...editor, teamId: event.target.value })
                }
                disabled={busy}
              >
                {capabilities?.globalCreate && (
                  <option value="">Chapter-wide · administrators only</option>
                )}
                {editor.teamId &&
                  !capabilities?.teams.some(
                    (team) => team.id === editor.teamId,
                  ) && (
                    <option value={editor.teamId}>
                      Current team · {editor.teamId}
                    </option>
                  )}
                {capabilities?.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="gt-form-grid">
              {spec.fields.map((field) => {
                const invalid = !!errors["record." + field.name],
                  props = {
                    id: "content-" + field.name,
                    value: editor.values[field.name] || "",
                    disabled: busy,
                    required: field.required,
                    maxLength: field.max,
                    "aria-invalid": invalid,
                    onChange: (
                      event: React.ChangeEvent<
                        | HTMLInputElement
                        | HTMLTextAreaElement
                        | HTMLSelectElement
                      >,
                    ) =>
                      setEditor({
                        ...editor,
                        values: {
                          ...editor.values,
                          [field.name]: event.target.value,
                        },
                      }),
                  };
                return (
                  <Field
                    key={field.name}
                    label={field.label}
                    required={field.required}
                    hint={invalid ? "Check this field." : undefined}
                  >
                    {field.options ? (
                      <select {...props}>
                        {field.options.map((option) => (
                          <option key={option} value={option}>
                            {option.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    ) : field.type === "long" || field.type === "lines" ? (
                      <textarea
                        {...props}
                        rows={field.type === "long" ? 4 : 3}
                      />
                    ) : (
                      <input
                        {...props}
                        type={
                          ["number", "url", "email", "color"].includes(
                            field.type || "",
                          )
                            ? field.type
                            : "text"
                        }
                        min={field.type === "number" ? 0 : undefined}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
            <div className="gt-actions">
              <Button disabled={busy} type="submit">
                {busy ? "Saving…" : "Save changes"}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="secondary"
                onClick={() => (dirty ? setDiscard(true) : setEditor(null))}
              >
                Cancel editing
              </Button>
            </div>
            {discard && (
              <div role="alert">
                <p>
                  Discard these unsaved changes? The saved record will remain
                  unchanged.
                </p>
                <div className="gt-actions">
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => {
                      setEditor(null);
                      setDiscard(false);
                    }}
                  >
                    Discard changes
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDiscard(false)}
                  >
                    Keep editing
                  </Button>
                </div>
              </div>
            )}
          </form>
        </section>
      )}
      {confirm && (
        <section className="gt-panel gt-operational-confirm">
          <h2>
            {confirm.action === "publish"
              ? "Publish this record?"
              : "Move this record to archive?"}
          </h2>
          <p>
            {rowLabel(confirm.row)}.{" "}
            {confirm.action === "publish"
              ? "This makes the approved content visible publicly."
              : "This removes it from public pages. It remains recoverable from Archived records."}
          </p>
          <div className="gt-actions">
            <Button
              disabled={busy}
              variant={confirm.action === "archive" ? "danger" : "primary"}
              onClick={() => mutate(confirm.row, confirm.action)}
            >
              Confirm {confirm.action === "publish" ? "publication" : "archive"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(undefined)}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}
      <div className="gt-toolbar">
        <SearchBox
          label="Search content"
          value={q}
          onChange={(value) => {
            setQ(value);
            setPage(1);
          }}
        />
        <Field label="Visibility">
          <select
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setPage(1);
            }}
          >
            <option value="current">Current records</option>
            <option value="draft">Private drafts</option>
            <option value="published">Published</option>
            <option value="trash">Archived records</option>
          </select>
        </Field>
      </div>
      {loading ? (
        <p role="status">Loading content…</p>
      ) : data?.items.length ? (
        <div className="gt-table-wrap">
          <table className="gt-data-table">
            <caption className="sr-only">
              {spec.title} · {data.total} matching records
            </caption>
            <thead>
              <tr>
                <th>Record</th>
                <th>Visibility</th>
                <th>Scope</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{rowLabel(row)}</strong>
                    <p className="gt-helper">
                      Order {String(row.order_index ?? 0)} · revision{" "}
                      {row.revision}
                    </p>
                  </td>
                  <td>
                    <Badge>
                      {row.deleted_at
                        ? "Archived"
                        : row.is_active
                          ? "Published"
                          : "Private draft"}
                    </Badge>
                  </td>
                  <td>
                    {row.team_id
                      ? capabilities?.teams.find(
                          (team) => team.id === row.team_id,
                        )?.name || "Team scoped"
                      : "Chapter-wide"}
                  </td>
                  <td>{new Date(row.updated_at).toLocaleDateString()}</td>
                  <td>
                    <div className="gt-actions">
                      {!row.deleted_at && row.actions.includes("update") && (
                        <Button
                          variant="secondary"
                          disabled={busy || !!editor}
                          onClick={() => open(row)}
                        >
                          Edit
                        </Button>
                      )}
                      {kind !== "sponsor-tiers" &&
                        !row.deleted_at &&
                        row.actions.includes("create") && (
                          <Button
                            variant="secondary"
                            disabled={busy || !!editor}
                            onClick={() => mutate(row, "duplicate")}
                          >
                            Duplicate
                          </Button>
                        )}
                      {!row.deleted_at && row.actions.includes("publish") && (
                        <Button
                          variant="secondary"
                          disabled={busy || !!editor}
                          onClick={() =>
                            row.is_active
                              ? mutate(row, "unpublish")
                              : setConfirm({ row, action: "publish" })
                          }
                        >
                          {row.is_active ? "Unpublish" : "Publish"}
                        </Button>
                      )}
                      {row.actions.includes("delete") && (
                        <Button
                          variant="secondary"
                          disabled={busy || !!editor}
                          onClick={() =>
                            row.deleted_at
                              ? mutate(row, "restore")
                              : setConfirm({ row, action: "archive" })
                          }
                        >
                          {row.deleted_at ? "Restore draft" : "Archive"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !error && (
          <EmptyState
            title={
              state === "trash" ? "No archived records" : "No matching content"
            }
          >
            Create a private draft or change your search. Only permitted records
            are listed.
          </EmptyState>
        )
      )}
      {data && (
        <div className="gt-actions">
          <span>
            {data.total} matching records · Page {page}
          </span>
          <Button
            variant="secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={loading || page * data.pageSize >= data.total}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
export function ResourceWorkspace() {
  return <CollectionWorkspace initialKind="resources" />;
}
export function SponsorWorkspace() {
  return <CollectionWorkspace initialKind="sponsors" />;
}
export function PublicTeamWorkspace() {
  return <CollectionWorkspace initialKind="team-profiles" />;
}
