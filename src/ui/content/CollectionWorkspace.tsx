import ProfileReconcileDialog from "./ProfileReconcileDialog";
import { useSearchParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import ScrollableTable from "../ScrollableTable";
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
      { name: "portfolio_url", label: "Portfolio / website", type: "url" },
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
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <CollectionEditor
      key={`${initialKind}:${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
      initialKind={initialKind}
    />
  );
}
function CollectionEditor({ initialKind }: { initialKind: Kind }) {
  const { currentAdmin } = useAdmin();
  const [params] = useSearchParams();
  const requestedProfile = initialKind === "team-profiles" ? params.get("profile") || "" : "";
  const openedProfile = useRef("");
  const [profileRetry, setProfileRetry] = useState(0);
  const linkedProfile = usePrivateRead<{ record: Row }>(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedProfile) ? `/admin/content-records/team-profiles/${requestedProfile}` : undefined,
    profileRetry,
  );
  const [kind, setKind] = useState<Kind>(initialKind),
    [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{
      row?: Row;
      values: Record<string, string>;
      teamId: string;
    } | null>(null),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState<{
      row: Row;
      action: "archive" | "publish" | "unpublish" | "restore" | "reconcile";
    }>(),
    [discard, setDiscard] = useState(false),
    [conflict, setConflict] = useState(false);
  const original = useRef(""),
    retry = useRef<{ signature: string; key: string }>(),
    editorHeading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    spec = specifications[kind],
    prefix = "/admin/content-records/" + kind;
  const dirty = !!editor && JSON.stringify(editor) !== original.current,
    editorKey = editor ? editor.row?.id || "new" : null;
  const selected = editor?.row || confirm?.row,
    { isOnline } = useOnlineStatus(),
    { busy, begin, current, finish, cancel, pending } =
      usePrivateMutation(prefix);
  const capRead = usePrivateRead<Capabilities>(
      prefix + "/capabilities",
      refresh,
    ),
    listRead = usePrivateRead<Listing>(
      prefix + "?" + new URLSearchParams({ q, state, page: String(page) }),
      refresh,
    ),
    detailRead = usePrivateRead<{ record: Row }>(
      selected ? prefix + "/" + selected.id : undefined,
      refresh,
    );
  const capabilities = capRead.data,
    data = listRead.data,
    loading = listRead.loading,
    freshRow = detailRead.data?.record,
    unavailable =
      capRead.loading ||
      !!capRead.error ||
      listRead.loading ||
      !!listRead.error ||
      (!!selected && (detailRead.loading || !!detailRead.error || !freshRow)),
    stale = !!selected && !!freshRow && selected.revision !== freshRow.revision,
    canCreate = !!(capabilities?.globalCreate || capabilities?.teams.length),
    denied =
      !!editor &&
      (editor.row ? !freshRow?.actions.includes("update") : !canCreate);
  const { clear: clearCap } = capRead,
    { clear: clearList } = listRead,
    { clear: clearDetail } = detailRead;
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (confirm) reviewHeading.current?.focus();
  }, [confirm]);
  useDraftGuard(dirty, { busy, label: "Content collection changes" });
  useDraftGuard(!!confirm, {
    busy,
    label: "Content collection visibility review",
  });
  useEffect(() => {
    document.title = spec.title + " · GDG workspace";
  }, [spec.title]);
  useEffect(() => {
    const update = () => {
      if (!pending.current) setRefresh((v) => v + 1);
    };
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) update();
    }, 30000);
    window.addEventListener("gdg:access-changed", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("gdg:access-changed", update);
    };
  }, [pending]);
  useEffect(() => {
    if (capRead.denied || listRead.denied) {
      cancel();
      clearCap();
      clearList();
      clearDetail();
      setEditor(null);
      setConfirm(undefined);
      setErrors({});
      setDiscard(false);
      setNotice("");
      retry.current = undefined;
    }
  }, [
    capRead.denied,
    listRead.denied,
    cancel,
    clearCap,
    clearList,
    clearDetail,
  ]);
  useEffect(() => {
    if (detailRead.denied) {
      cancel();
      clearDetail();
      setEditor(null);
      setConfirm(undefined);
      setErrors({});
      setDiscard(false);
      setNotice("");
      setError("This record is no longer available in your current access.");
      retry.current = undefined;
    }
  }, [detailRead.denied, cancel, clearDetail]);
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
  const open = useCallback((row?: Row) => {
    if (
      pending.current ||
      unavailable ||
      (row ? !row.actions.includes("update") : !canCreate)
    )
      return;
    retry.current = undefined;
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
    setConflict(false);
    setNotice("");
  }, [pending, unavailable, canCreate, spec.fields, capabilities]);
  useEffect(() => {
    if (!requestedProfile || openedProfile.current === requestedProfile || editor || confirm || busy || unavailable || !linkedProfile.data) return;
    const row = linkedProfile.data.record;
    if (row?.id !== requestedProfile || !Array.isArray(row.actions) || !row.actions.includes("update")) return;
    openedProfile.current = requestedProfile;
    setQ(rowLabel(row));
    setPage(1);
    open(row);
  }, [requestedProfile, editor, confirm, busy, unavailable, linkedProfile.data, open]);
  const mutationDenied = (error: unknown) => {
    if (
      !(error instanceof ApiFailure) ||
      ![401, 403, 404].includes(error.status)
    )
      return;
    clearCap();
    clearList();
    clearDetail();
    setEditor(null);
    setConfirm(undefined);
    setErrors({});
    setDiscard(false);
    retry.current = undefined;
    setRefresh((v) => v + 1);
  };
  const mutate = async (row: Row, action: string) => {
    const authoritative =
      selected?.id === row.id
        ? freshRow
        : data?.items.find((r) => r.id === row.id);
    if (
      pending.current ||
      !isOnline ||
      unavailable ||
      stale ||
      conflict ||
      !authoritative ||
      authoritative.revision !== row.revision ||
      !authoritative.actions.includes(
        ["archive", "restore"].includes(action)
          ? "delete"
          : action === "duplicate"
            ? "create"
            : "publish",
      )
    )
      return;
    const controller = begin();
    if (!controller) return;
    setError("");
    setNotice("");
    const identity = JSON.stringify([prefix, row.id, action, row.revision]);
    if (retry.current?.signature !== identity)
      retry.current = { signature: identity, key: crypto.randomUUID() };
    try {
      await api(prefix + "/" + row.id, {
        method: action === "archive" ? "DELETE" : "POST",
        protected: true,
        body: { revision: row.revision, action },
        idempotencyKey: retry.current.key,
        signal: controller.signal,
      });
      if (!current(controller)) return;
      retry.current = undefined;
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
      if (!current(controller)) return;
      setError((e as Error).message);
      if (e instanceof ApiFailure && e.status === 409) setConflict(true);
      mutationDenied(e);
    } finally {
      finish(controller);
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
            !!confirm ||
            unavailable ||
            !(capabilities?.globalCreate || capabilities?.teams.length)
          }
          onClick={() => open()}
        >
          Create draft
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh content records
        </Button>
      </div>
      {tabs.length > 1 && (
        <div className="gt-actions" aria-label="Sponsor content sections">
          {tabs.map((value) => (
            <Button
              key={value}
              variant={kind === value ? "primary" : "secondary"}
              disabled={!!editor || !!confirm || busy}
              aria-pressed={kind === value}
              onClick={() => {
                setKind(value);
                setPage(1);
                setNotice("");
                setError("");
                setConflict(false);
                retry.current = undefined;
              }}
            >
              {specifications[value].title}
            </Button>
          ))}
        </div>
      )}
      {requestedProfile && linkedProfile.loading && <p role="status">Opening the selected Team profile…</p>}
      {requestedProfile && linkedProfile.error && <p role="alert">{linkedProfile.error} <Button variant="ghost" onClick={() => setProfileRetry(profileRetry + 1)}>Retry selected Team profile</Button></p>}
      {kind === "team-profiles" && !editor && <p>Member sync creates a draft here. Review the profile, then choose Publish to show it on the Team page.</p>}
      {error && (
        <p
          className="gt-form-error"
          role="alert"
          tabIndex={-1}
          ref={errorFocus}
        >
          {error}{" "}
        </p>
      )}
      {notice && (
        <p role="status" tabIndex={-1} ref={noticeFocus}>
          {notice}
        </p>
      )}
      {[
        { name: "Collection permissions", ...capRead },
        { name: "Content inventory", ...listRead },
        { name: "Selected record", ...detailRead },
      ].map((read) => (
        <div key={read.name}>
          {read.error && (
            <p role="alert">
              {read.name}: {read.error}{" "}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  document.getElementById("workspace-content")?.focus();
                  setRefresh((v) => v + 1);
                }}
              >
                Retry {read.name.toLowerCase()}
              </Button>
            </p>
          )}
          {read.data && (read.loading || read.error) && (
            <p role="status">
              {read.name} may be out of date. Last loaded{" "}
              {new Date(read.at!).toLocaleString()}.
            </p>
          )}
        </div>
      ))}
      {!isOnline && (
        <p role="status">
          You’re offline. Your input stays in this tab. Reconnect and save when
          ready; nothing sends automatically.
        </p>
      )}
      {(stale || conflict) && (
        <p role="alert">
          This record changed. Your input is preserved. Close and reopen the
          editor or review before saving.
        </p>
      )}
      {editor && denied && !unavailable && (
        <p role="alert">
          Your current access no longer permits saving this draft.
        </p>
      )}
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
              if (
                pending.current ||
                !isOnline ||
                unavailable ||
                denied ||
                stale ||
                conflict
              )
                return;
              if (
                !(editor.teamId
                  ? capabilities?.teams.some((t) => t.id === editor.teamId) ||
                    editor.teamId === editor.row?.team_id
                  : capabilities?.globalCreate)
              ) {
                setError("Choose a currently permitted owning scope.");
                return;
              }
              const controller = begin();
              if (!controller) return;
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
                        : ["image_url", "portfolio_url"].includes(field.name) &&
                            !editor.values[field.name]?.trim()
                          ? null
                          : editor.values[field.name],
                  ]),
                );
                const body = {
                  ...(editor.row ? { revision: editor.row.revision } : {}),
                  teamId: editor.teamId || null,
                  record,
                };
                const identity = JSON.stringify([prefix, editor.row?.id, body]);
                if (retry.current?.signature !== identity)
                  retry.current = {
                    signature: identity,
                    key: crypto.randomUUID(),
                  };
                await api(prefix + (editor.row ? "/" + editor.row.id : ""), {
                  method: editor.row ? "PATCH" : "POST",
                  protected: true,
                  body,
                  idempotencyKey: retry.current.key,
                  signal: controller.signal,
                });
                if (!current(controller)) return;
                retry.current = undefined;
                setEditor(null);
                setRefresh((v) => v + 1);
                setNotice(
                  "Saved as a private draft. Publish separately after review.",
                );
              } catch (e) {
                if (!current(controller)) return;
                setError((e as Error).message);
                if (e instanceof ApiFailure) setErrors(e.fields || {});
                if (e instanceof ApiFailure && e.status === 409)
                  setConflict(true);
                mutationDenied(e);
              } finally {
                finish(controller);
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
              <Button
                disabled={
                  busy ||
                  !isOnline ||
                  unavailable ||
                  denied ||
                  stale ||
                  conflict
                }
                type="submit"
              >
                {busy ? "Saving…" : "Save changes"}
              </Button>
              <Button
                disabled={busy}
                type="button"
                variant="secondary"
                onClick={() =>
                  dirty
                    ? setDiscard(true)
                    : (setEditor(null), setConflict(false), setError(""))
                }
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
                      setConflict(false);
                      setError("");
                      retry.current = undefined;
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
      {confirm && (confirm.action === "reconcile" ? <ProfileReconcileDialog id={confirm.row.id}
        onClose={() => setConfirm(undefined)} onSaved={(result) => {
          setConfirm(undefined); setRefresh((v) => v + 1);
          setNotice(`Kept ${result.record.name} ${result.record.is_active ? "published" : "as a private draft"}. Archived ${result.archived} duplicate profile${result.archived === 1 ? "" : "s"}.`);
        }} /> : <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !busy) setConfirm(undefined);
          }}
        >
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              reviewHeading.current?.focus();
            }}
          >
            <DialogTitle tabIndex={-1} ref={reviewHeading}>
              {confirm.action === "publish"
                ? "Publish this record?"
                : confirm.action === "archive"
                  ? "Move this record to archive?"
                  : confirm.action === "restore"
                    ? "Restore this private draft?"
                    : "Unpublish this record?"}
            </DialogTitle>
            <DialogDescription>
              {rowLabel(confirm.row)}.{" "}
              {confirm.action === "publish"
                ? "This makes the approved content visible publicly."
                : confirm.action === "restore"
                  ? "This restores a private draft without publishing it."
                  : "This removes it from public pages. It remains recoverable from Archived records."}
            </DialogDescription>
            {error && <p role="alert">{error}</p>}
            <div className="gt-actions">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => setRefresh((v) => v + 1)}
              >
                Refresh review access
              </Button>
              <Button
                disabled={
                  busy ||
                  !isOnline ||
                  unavailable ||
                  stale ||
                  conflict ||
                  !freshRow?.actions.includes(
                    ["archive", "restore"].includes(confirm.action)
                      ? "delete"
                      : "publish",
                  )
                }
                variant={confirm.action === "archive" ? "danger" : "primary"}
                onClick={() => mutate(confirm.row, confirm.action)}
              >
                Confirm{" "}
                {confirm.action === "publish" ? "publication" : confirm.action}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setConfirm(undefined);
                  setConflict(false);
                  setError("");
                  retry.current = undefined;
                }}
              >
                Cancel
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <fieldset
        className="gt-toolbar gt-plain-fieldset"
        disabled={busy || !!editor || !!confirm}
      >
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
      </fieldset>
      {loading && !data ? (
        <div role="status" aria-label="Loading content records">
          <div className="gt-skeleton gt-overview-placeholder" />
          <span className="sr-only">Loading content…</span>
        </div>
      ) : data?.items.length ? (
        <ScrollableTable label={spec.title + " records"}>
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
                      {kind === "team-profiles" && currentAdmin?.role === "super_admin" && !row.deleted_at && !!row.email && (
                        <Button variant="secondary" disabled={busy || !!editor || !!confirm || unavailable}
                          aria-label={`Resolve duplicates for ${rowLabel(row)} (${row.is_active ? "Published" : "Private draft"})`}
                          onClick={() => setConfirm({ row, action: "reconcile" })}>Resolve duplicates</Button>
                      )}
                      {!row.deleted_at && row.actions.includes("update") && (
                        <Button
                          variant="secondary"
                          disabled={
                            busy || !!editor || !!confirm || unavailable
                          }
                          aria-label={"Edit " + rowLabel(row)}
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
                            disabled={
                              busy || !!editor || !!confirm || unavailable
                            }
                            aria-label={"Duplicate " + rowLabel(row)}
                            onClick={() => mutate(row, "duplicate")}
                          >
                            Duplicate
                          </Button>
                        )}
                      {!row.deleted_at && row.actions.includes("publish") && (
                        <Button
                          variant="secondary"
                          disabled={
                            busy || !!editor || !!confirm || unavailable
                          }
                          aria-label={
                            (row.is_active ? "Unpublish " : "Publish ") +
                            rowLabel(row)
                          }
                          onClick={() => (
                            setConflict(false),
                            setConfirm({
                              row,
                              action: row.is_active ? "unpublish" : "publish",
                            }),
                            (retry.current = undefined)
                          )}
                        >
                          {row.is_active ? "Unpublish" : "Publish"}
                        </Button>
                      )}
                      {row.actions.includes("delete") && (
                        <Button
                          variant="secondary"
                          disabled={
                            busy || !!editor || !!confirm || unavailable
                          }
                          aria-label={
                            (row.deleted_at ? "Restore draft " : "Archive ") +
                            rowLabel(row)
                          }
                          onClick={() => (
                            setConflict(false),
                            setConfirm({
                              row,
                              action: row.deleted_at ? "restore" : "archive",
                            }),
                            (retry.current = undefined)
                          )}
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
        </ScrollableTable>
      ) : (
        !listRead.error && (
          <EmptyState
            title={
              state === "trash" ? "No archived records" : "No matching content"
            }
            action={
              q || state !== "current" ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQ("");
                    setState("current");
                    setPage(1);
                  }}
                >
                  Reset content filters
                </Button>
              ) : undefined
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
            disabled={busy || !!editor || !!confirm || loading || page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={
              busy ||
              !!editor ||
              !!confirm ||
              loading ||
              page * data.pageSize >= data.total
            }
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
