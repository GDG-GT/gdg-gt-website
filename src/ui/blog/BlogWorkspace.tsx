import RecordPanel from "@/ui/RecordPanel";
import RecordAcknowledgement from "@/ui/RecordAcknowledgement";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import {
  useApprovedSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import { validationMessage } from "@/lib/validationMessage";
import { blogCreate, blogMutation } from "../../../shared/blog.mjs";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import BlogFields from "./BlogFields";
import { initialValues, string, type Values } from "./fields";
import BlogMarkdown from "./BlogMarkdown";
import { BlogFileUpload, BlogFileDownload } from "./BlogFiles";
import EditorialOverview from "./EditorialOverview";
import ScrollableTable from "../ScrollableTable";
type Kind = "posts" | "categories" | "submissions" | "comments";
type Row = Values & {
  id: string;
  revision: number;
  reference: string;
  actions: string[];
  deleted_at?: string;
};
type Listing = { items: Row[]; total: number; pageSize: number };
type Detail = {
  record: Row;
  versions: { revision: number; action: string; createdAt: string }[];
  versionTotal: number;
  discussion: {
    id: string;
    comment: string;
    type: string;
    authorName: string;
    createdAt: string;
  }[];
  discussionTotal: number;
  pageSize: number;
};
type Cap = {
  admin: boolean;
  editor: boolean;
  globalCreate: boolean;
  teams: { id: string; name: string; canCreate: boolean }[];
  editors: { id: string; display_name: string }[];
};
const kinds: Kind[] = ["posts", "categories", "submissions", "comments"],
  labels = {
    posts: "Articles",
    categories: "Categories",
    submissions: "Submissions",
    comments: "Retained comments",
  },
  base = "/admin/blog";
const actionLabels: Record<string, string> = {
  create: "New private draft",
  update: "Edit proposed version",
  submit: "Request review",
  approve: "Approve",
  reject: "Return for revision",
  publish: "Set internal published state",
  unpublish: "Return to draft",
  archive: "Archive",
  restore: "Restore",
  assign: "Assign editor",
  comment: "Add discussion",
  review: "Review submission",
  hide: "Hide comment",
  flag: "Flag",
  unflag: "Clear flag",
};
export default function BlogWorkspace({
  initialCollection = "posts",
  editorial = false,
}: {
  initialCollection?: Kind;
  editorial?: boolean;
}) {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <BlogWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
      initialCollection={initialCollection}
      editorial={editorial}
    />
  );
}
function BlogWorkspaceContent({
  initialCollection,
  editorial,
}: {
  initialCollection: Kind;
  editorial: boolean;
}) {
  const { isOnline } = useOnlineStatus();
  const [params, setParams] = useApprovedSearchParams(),
    navigation = useNavigationSafety(),
    { currentAdmin } = useAdmin();
  const requestedCollection = params.get("collection") || params.get("tab"),
    kind = kinds.includes(requestedCollection as Kind)
      ? (requestedCollection as Kind)
      : initialCollection,
    selected = params.get("record") || "";
  const [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [categoryPage, setCategoryPage] = useState(1),
    [historyPage, setHistoryPage] = useState(1),
    [tick, setTick] = useState(0);
  const [mode, setMode] = useState<string | null>(null),
    [values, setValues] = useState<Values>({}),
    [team, setTeam] = useState(""),
    [summary, setSummary] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState(""),
    [editor, setEditor] = useState(""),
    [commentType, setCommentType] = useState("general"),
    [reviewStatus, setReviewStatus] = useState("reviewed");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const baseline = useRef(""),
    snapshot = useRef<number>(),
    key = useRef<string>(),
    keyBody = useRef<string>(),
    heading = useRef<HTMLHeadingElement>(null),
    workspaceHeading = useRef<HTMLHeadingElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null);
  const {
    busy,
    begin: beginOperation,
    current,
    finish,
    cancel,
    pending: operationPending,
  } = usePrivateMutation(kind + ":" + selected);
  const query = new URLSearchParams({
    q,
    state,
    page: String(page),
    ...(status ? { status } : {}),
  });
  const capRead = usePrivateRead<Cap>(base + "/capabilities", tick),
    listRead = usePrivateRead<Listing>(base + "/" + kind + "?" + query, tick),
    categoryRead = usePrivateRead<Listing>(
      base + "/categories?page=" + categoryPage,
      tick,
    ),
    detailRead = usePrivateRead<Detail>(
      selected
        ? base + "/" + kind + "/" + selected + "?page=" + historyPage
        : undefined,
      tick,
    );
  const cap = capRead.data,
    listing = listRead.data,
    detail = detailRead.data,
    categories = (categoryRead.data?.items || [])
      .filter((r) => r.is_active && !r.deleted_at)
      .map((r) => ({ id: r.id, name: string(r, "name") }));
  const { clear: clearCap } = capRead,
    { clear: clearList } = listRead,
    { clear: clearCategories } = categoryRead,
    { clear: clearDetail } = detailRead;
  const reads = [
    { name: "Editorial permissions", ...capRead },
    { name: "Editorial inventory", ...listRead },
    { name: "Editorial categories", ...categoryRead },
    { name: "Editorial details", ...detailRead },
  ];
  const readUnavailable =
    capRead.loading ||
    !!capRead.error ||
    detailRead.loading ||
    !!detailRead.error;
  const record = detail?.record,
    pending =
      record?.pending_changes &&
      typeof record.pending_changes === "object" &&
      !Array.isArray(record.pending_changes)
        ? (record.pending_changes as Values)
        : undefined;
  const formState = JSON.stringify({
      values,
      team,
      summary,
      password,
      confirmation,
      reason,
      editor,
      commentType,
      reviewStatus,
    }),
    stale =
      !!mode && mode !== "create" && record?.revision !== snapshot.current,
    permission = mode === "archive" || mode === "restore" ? "delete" : mode,
    denied =
      !!mode &&
      mode !== "create" &&
      (!record || !record.actions.includes(permission || "")),
    confirmed =
      !!mode && !["create", "update", "submit", "comment"].includes(mode);
  useDraftGuard(!!mode && formState !== baseline.current, {
    busy,
    label: "Private editorial changes",
  });
  useEffect(() => {
    if (kind !== "submissions" || record?.scan_status !== "pending") return;
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine && !operationPending.current)
        setTick((v) => v + 1);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [kind, record?.scan_status, operationPending]);
  const reset = useCallback(() => {
    setMode(null);
    setValues({});
    setTeam("");
    setSummary("");
    setPassword("");
    setConfirmation("");
    setReason("");
    setEditor("");
    setCommentType("general");
    setReviewStatus("reviewed");
    setError("");
    setConflict(false);
    baseline.current = "";
    snapshot.current = undefined;
    key.current = undefined;
    keyBody.current = undefined;
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (!operationPending.current) setTick((v) => v + 1);
    };
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) refresh();
    }, 30000);
    window.addEventListener("gdg:access-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("gdg:access-changed", refresh);
    };
  }, [operationPending]);
  useEffect(() => {
    if (capRead.denied) {
      cancel();
      reset();
      clearCap();
      clearList();
      clearCategories();
      clearDetail();
      setNotice("");
    }
  }, [
    capRead.denied,
    cancel,
    reset,
    clearCap,
    clearList,
    clearCategories,
    clearDetail,
  ]);
  useEffect(() => {
    if (detailRead.denied) {
      cancel();
      reset();
      setNotice("");
    }
  }, [detailRead.denied, cancel, reset]);
  useEffect(() => {
    if (mode) heading.current?.focus();
    else if (!notice) workspaceHeading.current?.focus();
  }, [mode, notice]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    cancel();
    reset();
    setHistoryPage(1);
  }, [selected, kind, cancel, reset]);
  const select = (id: string) => {
    const p = new URLSearchParams(params);
    if (id) p.set("record", id);
    else p.delete("record");
    setHistoryPage(1);
    setParams(p);
  };
  const collection = (next: Kind) =>
    navigation.request(() =>
      navigation.allow(() => {
        reset();
        clearDetail();
        setQ("");
        setState("current");
        setStatus("");
        setPage(1);
        setHistoryPage(1);
        const p = new URLSearchParams(params);
        p.set("collection", next);
        p.delete("record");
        setParams(p);
      }),
    );
  const begin = (action: string) => {
    if (
      operationPending.current ||
      (action === "create"
        ? !create
        : readUnavailable || !operations.includes(action))
    )
      return;
    const initial = initialValues(
        kind,
        action === "create" ? undefined : pending || record,
      ),
      initialTeam =
        action === "create"
          ? cap?.globalCreate
            ? ""
            : cap?.teams.find((t) => t.canCreate)?.id || ""
          : string(record, "team_id"),
      initialEditor = string(record, "editorId");
    setValues(initial);
    setTeam(initialTeam);
    setSummary("");
    setPassword("");
    setConfirmation("");
    setReason("");
    setEditor(initialEditor);
    setCommentType("general");
    setReviewStatus("reviewed");
    setError("");
    setNotice("");
    setConflict(false);
    snapshot.current = record?.revision;
    key.current = undefined;
    keyBody.current = undefined;
    baseline.current = JSON.stringify({
      values: initial,
      team: initialTeam,
      summary: "",
      password: "",
      confirmation: "",
      reason: "",
      editor: initialEditor,
      commentType: "general",
      reviewStatus: "reviewed",
    });
    setMode(action);
  };
  const open = (action: string) =>
    navigation.request(() => navigation.allow(() => begin(action)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !mode ||
      operationPending.current ||
      !isOnline ||
      stale ||
      conflict ||
      denied ||
      capRead.loading ||
      capRead.error ||
      (mode !== "create" && (readUnavailable || !operations.includes(mode)))
    )
      return;
    if (
      mode === "create" &&
      (!create ||
        (kind === "posts" &&
          !(team
            ? cap?.teams.some((t) => t.id === team && t.canCreate)
            : cap?.globalCreate)))
    ) {
      setError("Choose a currently permitted owning scope.");
      return;
    }
    if (confirmed && (!password || confirmation !== record?.reference)) {
      setError(
        "Confirm the selected editorial record and enter your current password.",
      );
      return;
    }
    let doc: Values;
    if (mode === "create" || mode === "update") {
      const fields = {
        ...values,
        ...(kind === "posts"
          ? {
              tags: (Array.isArray(values.tags) ? values.tags : [])
                .map((s) => String(s).trim())
                .filter(Boolean),
            }
          : {}),
      };
      doc =
        mode === "create"
          ? { record: fields, teamId: team || null }
          : {
              action: mode,
              revision: snapshot.current,
              record: fields,
              ...(kind === "posts" ? { summary } : {}),
            };
    } else
      doc = {
        action: mode,
        revision: snapshot.current,
        ...(confirmed ? { currentPassword: password, confirmation } : {}),
        ...([
          "approve",
          "reject",
          "publish",
          "unpublish",
          "archive",
          "restore",
        ].includes(mode) && kind === "posts"
          ? { reason }
          : {}),
        ...(mode === "submit" ? { summary } : {}),
        ...(mode === "assign" ? { editorId: editor || null } : {}),
        ...(mode === "comment" ? { comment: reason, type: commentType } : {}),
        ...(mode === "review" ? { status: reviewStatus, notes: reason } : {}),
      };
    const parsed = (
      mode === "create" ? blogCreate(kind) : blogMutation(kind)
    ).safeParse(doc);
    if (!parsed.success) {
      setError(validationMessage(parsed.error, "Check the editorial fields."));
      return;
    }
    const body =
      kind +
      ":" +
      selected +
      JSON.stringify(parsed.data, (key, value) =>
        key === "currentPassword" ? undefined : value,
      );
    if (keyBody.current !== body) {
      keyBody.current = body;
      key.current = crypto.randomUUID();
    }
    const controller = beginOperation();
    if (!controller) return;
    setPassword("");
    setError("");
    try {
      const result = await api<{ id: string }>(
        base + "/" + kind + (mode === "create" ? "" : "/" + record?.id),
        {
          method: "POST",
          protected: true,
          body: parsed.data,
          idempotencyKey: key.current,
          signal: controller.signal,
        },
      );
      if (!current(controller)) return;
      navigation.allow(() => {
        reset();
        select(result.id);
      });
      setNotice(
        "Editorial change saved privately. No public Blog or email was created.",
      );
      setTick((v) => v + 1);
    } catch (x) {
      if (!current(controller)) return;
      setError(
        x instanceof Error ? x.message : "This action could not be completed.",
      );
      if (x instanceof ApiFailure) {
        if (x.status === 409) setConflict(true);
        if ([403, 404].includes(x.status) && x.code !== "PASSWORD_REQUIRED") {
          reset();
          clearDetail();
          setError("Editorial access changed. Private fields were cleared.");
          setTick((v) => v + 1);
        }
      }
    } finally {
      finish(controller);
    }
  };
  const operations = record
    ? (record.deleted_at
        ? ["restore"]
        : kind === "posts"
          ? [
              "update",
              ...(pending
                ? [
                    "submit",
                    ...(string(record, "approval_status") === "pending"
                      ? ["approve", "reject"]
                      : []),
                  ]
                : []),
              ...(string(record, "status") === "draft" &&
              string(record, "approval_status") === "approved" &&
              !pending
                ? ["publish"]
                : []),
              ...(string(record, "status") === "published"
                ? ["unpublish"]
                : []),
              "assign",
              "archive",
            ]
          : kind === "categories"
            ? ["update", "archive"]
            : kind === "submissions"
              ? ["comment", "review", "assign", "archive"]
              : [
                  record.is_approved ? "hide" : "approve",
                  record.is_flagged ? "unflag" : "flag",
                  "archive",
                ]
      )
        .filter((a) =>
          record.actions.includes(
            a === "archive" || a === "restore" ? "delete" : a,
          ),
        )
        .filter(
          (a) =>
            !(
              cap?.editor &&
              a === "archive" &&
              (string(record, "status") === "published" ||
                record.ownerId !== currentAdmin?.id)
            ),
        )
    : [];
  const create =
    !capRead.loading &&
    !capRead.error &&
    (kind === "posts"
      ? cap?.globalCreate || cap?.teams.some((t) => t.canCreate)
      : kind === "categories" && cap?.admin);
  const title = (r: Values) =>
    string(r, "title") ||
    string(r, "name") ||
    string(r, "original_name") ||
    string(r, "content").slice(0, 120) ||
    "Retained record";
  const panelFeedback = (<>
      {notice && (
        <p role="status" tabIndex={-1} ref={noticeFocus} className="gt-notice">
          {notice}
        </p>
      )}
      {!isOnline && (
        <p role="status">
          You’re offline. Input stays in this tab. Reconnect and save when
          ready; nothing sends automatically.
        </p>
      )}
      {reads.map((read) => (
        <div key={read.name}>
          {read.error && (
            <p role="alert" className="gt-inline-error">
              {read.name}: {read.error}{" "}
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  document.getElementById("workspace-content")?.focus();
                  setTick((v) => v + 1);
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
      {selected && !detail && (
        <div role="status" aria-label="Loading selected editorial record">
          {detailRead.error ? (
            "Editorial details are unavailable. Retry editorial details."
          ) : (
            <>
              <div className="gt-skeleton gt-overview-placeholder" />
              <span className="sr-only">
                Loading selected editorial record…
              </span>
            </>
          )}
        </div>
      )}
      {error && !mode && (
        <p
          role="alert"
          tabIndex={-1}
          ref={errorFocus}
          className="gt-inline-error"
        >
          {error}
        </p>
      )}
  </>);
  return (
    <div className="gt-admin-page gt-blog-workspace">
      <div className="gt-admin-page-heading">
        <div>
          <h1 tabIndex={-1} ref={workspaceHeading}>
            Private editorial workspace
          </h1>
          <p>
            Draft, review and retain chapter writing. Internal publication never
            creates a public Blog.
          </p>
        </div>
        <div className="gt-toolbar">
          {create && (
            <Button disabled={busy || !!mode} onClick={() => open("create")}>
              New {kind === "posts" ? "article" : "category"}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => setTick((v) => v + 1)}
          >
            Refresh editorial records
          </Button>
        </div>
      </div>
      {editorial && <EditorialOverview />}
      <nav aria-label="Editorial collections" className="gt-workspace-tabs">
        {kinds.map((k) => (
          <Button
            key={k}
            variant={k === kind ? "primary" : "ghost"}
            aria-current={k === kind ? "page" : undefined}
            disabled={busy}
            onClick={() => collection(k)}
          >
            {labels[k]}
          </Button>
        ))}
      </nav>
      {!mode && !(selected && detail) && panelFeedback}
      {mode && (
        <RecordPanel title="Editorial editor" busy={busy} onClose={() => navigation.request(() => navigation.allow(reset))}>
          {panelFeedback}
<form
          className="gt-blog-editor"
          onSubmit={submit}
          aria-labelledby="blog-editor-title"
        >
          <h2 tabIndex={-1} ref={heading} id="blog-editor-title">
            {actionLabels[mode]}
          </h2>
          <p>
            {kind === "posts" && ["create", "update"].includes(mode)
              ? "Raw HTML and automatic Markdown images are removed on save. Code remains literal code."
              : "Discussion and notes are plain text. Editorial changes are retained privately."}{" "}
            Nothing here is public.
          </p>
          {(stale || conflict) && (
            <p role="alert" className="gt-inline-error">
              This record changed. Input is preserved but saving is disabled.
              Copy needed edits, close, refresh and reopen.
            </p>
          )}
          {denied && <p role="alert">This action is no longer granted.</p>}
          <fieldset disabled={busy || denied}>
            {["create", "update"].includes(mode) && (
              <>
                <BlogFields
                  kind={kind}
                  values={values}
                  change={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
                  categories={categories}
                />
                {kind === "posts" && (
                  <nav
                    aria-label="Category choice pages"
                    className="gt-toolbar"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={categoryPage === 1 || categoryRead.loading}
                      onClick={() => setCategoryPage((v) => v - 1)}
                    >
                      Previous category choices
                    </Button>
                    <span>Category choices page {categoryPage}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={
                        !categoryRead.data ||
                        categoryRead.loading ||
                        categoryPage * categoryRead.data.pageSize >=
                          categoryRead.data.total
                      }
                      onClick={() => setCategoryPage((v) => v + 1)}
                    >
                      Next category choices
                    </Button>
                  </nav>
                )}
                {mode === "create" && kind === "posts" && (
                  <Field label="Team">
                    <select
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                    >
                      {cap?.globalCreate && <option value="">Chapter</option>}
                      {cap?.teams
                        .filter((t) => t.canCreate)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
              </>
            )}
            {(mode === "submit" || (mode === "update" && kind === "posts")) && (
              <Field label="Change summary">
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  required={mode === "submit"}
                />
              </Field>
            )}
            {mode === "assign" && (
              <Field label="Assigned editor">
                <select
                  value={editor}
                  onChange={(e) => setEditor(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {editor && !cap?.editors.some((u) => u.id === editor) && (
                    <option value={editor}>Current retained assignment</option>
                  )}
                  {cap?.editors.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || "Editor"} · {u.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {mode === "comment" && (
              <Field label="Discussion visibility">
                <select
                  value={commentType}
                  onChange={(e) => setCommentType(e.target.value)}
                >
                  <option value="general">General discussion</option>
                  <option value="feedback">Editorial feedback</option>
                  {cap?.admin && (
                    <option value="internal">Administrators only</option>
                  )}
                </select>
              </Field>
            )}
            {mode === "review" && (
              <Field label="Review decision">
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value)}
                >
                  {["reviewed", "approved", "rejected"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            )}
            {["reject", "comment", "review"].includes(mode) && (
              <Field
                label={
                  mode === "comment"
                    ? "Discussion comment"
                    : mode === "reject"
                      ? "Revision feedback"
                      : "Administrator notes"
                }
              >
                <textarea
                  rows={5}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={mode === "reject" ? 2000 : 5000}
                  required={mode !== "review"}
                />
              </Field>
            )}
            {confirmed && (
              <>
                <p>
                  {mode === "publish"
                    ? "This changes internal state only; /blog remains a 404."
                    : mode === "archive"
                      ? "The record and history will be retained, not deleted."
                      : "Confirm this editorial operation."}
                </p>
                <RecordAcknowledgement
                  label={`I have reviewed “${record?.title || record?.name || "this editorial record"}” and want to ${mode?.replace(/_/g, " ")}.`}
                  reference={record?.reference || ""}
                  value={confirmation}
                  onChange={setConfirmation}
                />
                <Field label="Current password">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    maxLength={128}
                  />
                </Field>
              </>
            )}
          </fieldset>
          {error && (
            <p
              role="alert"
              tabIndex={-1}
              ref={errorFocus}
              className="gt-inline-error"
            >
              {error}
            </p>
          )}
          <div className="gt-toolbar">
            <Button
              disabled={
                busy ||
                !isOnline ||
                stale ||
                conflict ||
                denied ||
                capRead.loading ||
                !!capRead.error ||
                (mode !== "create" && readUnavailable) ||
                (mode === "create" && !create) ||
                (confirmed && (!password || confirmation !== record?.reference))
              }
            >
              {busy ? "Saving privately…" : "Save editorial change"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => navigation.request(() => navigation.allow(reset))}
            >
              Close editorial editor
            </Button>
          </div>
        </form>
</RecordPanel>
      )}
      {kind === "submissions" &&
        !mode &&
        cap &&
        (cap.globalCreate || cap.teams.some((t) => t.canCreate)) && (
          <BlogFileUpload
            key={kind + ":" + selected}
            globalCreate={cap.globalCreate}
            teams={cap.teams.filter((t) => t.canCreate)}
            unavailable={capRead.loading || !!capRead.error}
            onCreated={(id) => {
              select(id);
              setTick((v) => v + 1);
            }}
          />
        )}
      <section aria-label="Editorial inventory">
        <div className="gt-blog-filters">
          <SearchBox
            label="Search editorial records"
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          <Field label="Record inventory">
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="current">Current</option>
              <option value="trash">Archived</option>
            </select>
          </Field>
          <Field label="State filter">
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All states</option>
              {(kind === "posts"
                ? ["draft", "published", "archived"]
                : kind === "categories"
                  ? ["active", "inactive"]
                  : kind === "submissions"
                    ? ["pending", "reviewed", "approved", "rejected"]
                    : ["pending", "approved", "flagged"]
              ).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        {!listing ? (
          <div role="status" aria-label="Loading editorial inventory">
            {listRead.error ? (
              "Editorial records unavailable. Use Refresh to retry."
            ) : (
              <>
                <div className="gt-skeleton gt-overview-placeholder" />
                <span className="sr-only">
                  Loading authorized editorial records…
                </span>
              </>
            )}
          </div>
        ) : (
          <>
            <p role="status">
              {listing.total} matching {labels[kind].toLowerCase()} in your
              current access and filters.
            </p>
            {listing.items.length ? (
              <ScrollableTable
                className="gt-table-scroll"
                label={labels[kind] + " inventory"}
              >
                <table>
                  <caption>Authorized {labels[kind].toLowerCase()}</caption>
                  <thead>
                    <tr>
                      <th>Record</th>
                      <th>State</th>
                      <th>Scope</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listing.items.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{title(r)}</strong>
                        </td>
                        <td>
                          <Badge>
                            {string(r, "status") ||
                              (kind === "categories"
                                ? r.is_active
                                  ? "active"
                                  : "inactive"
                                : r.is_flagged
                                  ? "flagged"
                                  : r.is_approved
                                    ? "approved"
                                    : "pending")}
                          </Badge>
                          {kind === "posts" && (
                            <small>
                              Review: {string(r, "approval_status")}
                            </small>
                          )}
                          {kind === "submissions" && (
                            <small>File: {string(r, "scan_status")}</small>
                          )}
                        </td>
                        <td>
                          {string(r, "teamName") || "Chapter / assigned scope"}
                        </td>
                        <td>
                          <Button
                            variant="ghost"
                            aria-label={"Review " + title(r)}
                            disabled={busy || selected === r.id}
                            onClick={() => select(r.id)}
                          >
                            Review<span className="sr-only"> {title(r)}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
            ) : (
              <EmptyState
                title="No editorial records in this view"
                action={
                  q || state !== "current" || status ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQ("");
                        setState("current");
                        setStatus("");
                        setPage(1);
                      }}
                    >
                      Reset editorial filters
                    </Button>
                  ) : undefined
                }
              >
                Create a private article or adjust filters. Assigned work
                appears only for authorized editors.
              </EmptyState>
            )}
            <nav aria-label="Editorial inventory pages" className="gt-toolbar">
              <Button
                variant="ghost"
                disabled={page === 1}
                onClick={() => setPage((v) => v - 1)}
              >
                Previous records
              </Button>
              <span>Page {page}</span>
              <Button
                variant="ghost"
                disabled={page * listing.pageSize >= listing.total}
                onClick={() => setPage((v) => v + 1)}
              >
                Next records
              </Button>
            </nav>
          </>
        )}
      </section>
      {record && !mode && (
        <RecordPanel title="Editorial record" busy={busy} onClose={() => select("")}>
          {panelFeedback}
<section
          className="gt-blog-detail"
          aria-label="Selected editorial record"
        >
          <div className="gt-admin-page-heading">
            <div>
              <h2>{title(record)}</h2>
              <p>
                {record.reference} · revision {record.revision}
              </p>
            </div>
            <Button variant="ghost" onClick={() => select("")}>
              Close editorial record
            </Button>
          </div>
          {record.deleted_at && <p>Archived; history retained.</p>}
          {kind === "posts" ? (
            <>
              <p>
                Internal state: {string(record, "status")} · review:{" "}
                {string(record, "approval_status")}. No public route.
              </p>
              <p>
                {String(record.actualLikes || "0")} retained likes ·{" "}
                {String(record.actualComments || "0")} current comments. Legacy
                counters: {Number(record.likes_count) || 0} likes /{" "}
                {Number(record.comments_count) || 0} comments /{" "}
                {Number(record.views_count) || 0} historical views. Voter
                identifiers are not exposed.
              </p>
              <h3>Retained base version</h3>
              <BlogMarkdown>
                {string(record, "content").slice(0, 180000)}
              </BlogMarkdown>
              {pending && (
                <details open>
                  <summary>Proposed version</summary>
                  <dl className="gt-blog-comparison">
                    {Object.keys(initialValues("posts"))
                      .filter(
                        (k) =>
                          k !== "content" &&
                          JSON.stringify(record[k] ?? "") !==
                            JSON.stringify(pending[k] ?? ""),
                      )
                      .map((k) => (
                        <div key={k}>
                          <dt>{k.replace(/_/g, " ")}</dt>
                          <dd>
                            {Array.isArray(pending[k])
                              ? (pending[k] as string[]).join(", ")
                              : String(pending[k] ?? "Not set")}
                          </dd>
                        </div>
                      ))}
                  </dl>
                  <BlogMarkdown>
                    {string(pending, "content").slice(0, 180000)}
                  </BlogMarkdown>
                </details>
              )}
              {string(record, "rejection_reason") && (
                <p>Revision feedback: {string(record, "rejection_reason")}</p>
              )}
              {string(record, "change_summary") && (
                <p>Change summary: {string(record, "change_summary")}</p>
              )}
            </>
          ) : kind === "categories" ? (
            <p>{string(record, "description")}</p>
          ) : kind === "submissions" ? (
            <>
              <p>
                {string(record, "submitter_name")} ·{" "}
                {Number(record.file_size) || 0} bytes ·{" "}
                {string(record, "mime_type")}
              </p>
              <p>
                File safety: {string(record, "scan_status")}. Unverified legacy
                paths are not exposed; private downloads require verified clean
                scanning.
              </p>
              {record.scan_status === "clean" &&
                typeof record.upload_id === "string" && (
                  <BlogFileDownload
                    key={record.upload_id}
                    uploadId={record.upload_id}
                    filename={string(record, "original_name")}
                    unavailable={readUnavailable}
                  />
                )}
              {cap?.admin && (
                <details>
                  <summary>Private administrator review</summary>
                  <p>{string(record, "submitter_email")}</p>
                  <p>{string(record, "admin_notes")}</p>
                </details>
              )}
              <h3>Submission discussion</h3>
              {detail.discussion.map((c) => (
                <article className="gt-blog-thread" key={c.id}>
                  <p>
                    <strong>{c.authorName}</strong> · {c.type} ·{" "}
                    {new Date(c.createdAt).toLocaleString()}
                  </p>
                  <p>{c.comment}</p>
                </article>
              ))}
              {!detail.discussion.length && (
                <p>No discussion in this page of your permitted view.</p>
              )}
            </>
          ) : (
            <>
              <p>
                {string(record, "author_name")} · {string(record, "postTitle")}
              </p>
              <p className="gt-blog-comment-copy">
                {string(record, "content")}
              </p>
              <p>
                Approved: {record.is_approved ? "yes" : "no"} · flagged:{" "}
                {record.is_flagged ? "yes" : "no"}. Retained, non-public.
              </p>
            </>
          )}
          <div className="gt-toolbar">
            {operations.map((a) => (
              <Button
                key={a}
                disabled={busy || readUnavailable}
                variant={
                  ["archive", "reject", "hide"].includes(a)
                    ? "danger"
                    : "secondary"
                }
                onClick={() => open(a)}
              >
                {actionLabels[a] || a}
              </Button>
            ))}
          </div>
          {kind === "posts" && (
            <>
              <h3>Retained editorial revisions</h3>
              <ol>
                {detail.versions.map((v) => (
                  <li key={v.revision}>
                    Revision {v.revision} · {v.action} ·{" "}
                    {new Date(v.createdAt).toLocaleString()}
                  </li>
                ))}
              </ol>
            </>
          )}
          {["posts", "submissions"].includes(kind) && (
            <nav aria-label="Editorial history pages" className="gt-toolbar">
              <Button
                variant="ghost"
                disabled={historyPage === 1}
                onClick={() => setHistoryPage((v) => v - 1)}
              >
                Previous history
              </Button>
              <span>Page {historyPage}</span>
              <Button
                variant="ghost"
                disabled={
                  historyPage * detail.pageSize >=
                  (kind === "posts"
                    ? detail.versionTotal
                    : detail.discussionTotal)
                }
                onClick={() => setHistoryPage((v) => v + 1)}
              >
                Next history
              </Button>
            </nav>
          )}
        </section>
</RecordPanel>
      )}
    </div>
  );
}
