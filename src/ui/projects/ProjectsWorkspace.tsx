import RecordPanel from "@/ui/RecordPanel";
import ScrollableTable from "@/ui/ScrollableTable";
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
import {
  projectCreate,
  projectMutation,
  projectRecord,
} from "../../../shared/projects.mjs";
import { linktreeUrl } from "../../../shared/linktree.mjs";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
type Fields = {
  title: string;
  description: string;
  short_description: string;
  image_url: string;
  github_url: string;
  demo_url: string;
  tech_stack: string[];
  tags: string[];
  category: string;
  status: string;
  difficulty_level: string;
  team_size: number;
  start_date: string;
  end_date: string;
  is_featured: boolean;
  is_open_source: boolean;
};
type Project = Fields & {
  id: string;
  team_id: string | null;
  teamName: string | null;
  revision: number;
  deleted_at: string | null;
  stars_count: number;
  starCount: string;
  actions: string[];
  memberCount: number;
};
type Member = {
  id: string;
  memberId: string;
  name: string;
  role: string;
  active: boolean;
  communityActive: boolean;
  joinedAt: string;
};
type Detail = {
  project: Project;
  members: Member[];
  memberTotal: number;
  pageSize: number;
};
type Listing = {
  items: Project[];
  total: number;
  pageSize: number;
  stats: {
    active: number;
    completed: number;
    featured: number;
    categories: Record<string, number>;
    statuses: Record<string, number>;
    technologies: Record<string, number>;
  };
};
type Cap = { globalCreate: boolean; teams: { id: string; name: string }[] };
type Mode = "create" | "update" | "member_save" | "archive" | "restore" | null;
const base = "/admin/projects";
const fields = (p?: Project): Fields => ({
  title: p?.title || "",
  description: p?.description || "",
  short_description: p?.short_description || "",
  image_url: p?.image_url || "",
  github_url: p?.github_url || "",
  demo_url: p?.demo_url || "",
  tech_stack: p?.tech_stack || [],
  tags: p?.tags || [],
  category: p?.category || "web",
  status: p?.status || "active",
  difficulty_level: p?.difficulty_level || "intermediate",
  team_size: p?.team_size || 1,
  start_date: p?.start_date || "",
  end_date: p?.end_date || "",
  is_featured: p?.is_featured || false,
  is_open_source: p?.is_open_source ?? true,
});
export default function ProjectsWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <ProjectsWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function ProjectsWorkspaceContent() {
  const { isOnline } = useOnlineStatus();
  const [params, setParams] = useApprovedSearchParams(),
    selected = params.get("project") || "",
    navigation = useNavigationSafety();
  const [q, setQ] = useState(""),
    [state, setState] = useState("current"),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [featured, setFeatured] = useState(false),
    [page, setPage] = useState(1),
    [memberPage, setMemberPage] = useState(1),
    [tick, setTick] = useState(0);
  const [mode, setMode] = useState<Mode>(null),
    [values, setValues] = useState(fields()),
    [team, setTeam] = useState(""),
    [technology, setTechnology] = useState(""),
    [tags, setTags] = useState("");
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("contributor"),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const snapshot = useRef<{ revision: number; title: string }>(),
    key = useRef<string>(),
    keyDocument = useRef<string>(),
    workspaceHeading = useRef<HTMLHeadingElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const {
    busy,
    begin: beginOperation,
    current,
    finish,
    cancel,
    pending,
  } = usePrivateMutation(selected);
  const noticeFocus = useRef<HTMLParagraphElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  const query = new URLSearchParams({
    q,
    state,
    page: String(page),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(featured ? { featured: "true" } : {}),
  });
  const capRead = usePrivateRead<Cap>(base + "/capabilities", tick),
    listRead = usePrivateRead<Listing>(base + "?" + query, tick),
    detailRead = usePrivateRead<Detail>(
      selected ? base + "/" + selected + "?page=" + memberPage : undefined,
      tick,
    );
  const cap = capRead.data,
    listing = listRead.data,
    detail = detailRead.data;
  const { clear: clearCap } = capRead,
    { clear: clearList } = listRead,
    { clear: clearDetail } = detailRead;
  const reads = [
    { name: "Project permissions", ...capRead },
    { name: "Project inventory", ...listRead },
    { name: "Project details", ...detailRead },
  ];
  const p = detail?.project,
    stale =
      !!mode && mode !== "create" && p?.revision !== snapshot.current?.revision;
  const required =
      mode === "archive" || mode === "restore" ? "delete" : "update",
    denied =
      !!mode && mode !== "create" && (!p || !p.actions.includes(required));
  useDraftGuard(!!mode, { busy, label: "Private project changes" });
  useEffect(() => {
    const refresh = () => {
      if (!pending.current) setTick((v) => v + 1);
    };
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) refresh();
    }, 30000);
    window.addEventListener("gdg:access-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("gdg:access-changed", refresh);
    };
  }, [pending]);
  useEffect(() => {
    if (capRead.denied) {
      cancel();
      clearCap();
      clearList();
      clearDetail();
      setMode(null);
      setPassword("");
      setValues(fields());
      setEmail("");
      setTechnology("");
      setTags("");
      setConfirmation("");
    }
  }, [capRead.denied, cancel, clearCap, clearList, clearDetail]);
  useEffect(() => {
    if (detailRead.denied) {
      cancel();
      setMode(null);
      setPassword("");
      setValues(fields());
      setEmail("");
      setConfirmation("");
    }
  }, [detailRead.denied, cancel]);
  useEffect(() => {
    if (mode) heading.current?.focus();
    else if (!notice) workspaceHeading.current?.focus();
  }, [mode, notice]);
  const reset = useCallback(() => {
    setMode(null);
    setPassword("");
    setConfirmation("");
    setEmail("");
    setConflict(false);
    key.current = undefined;
    keyDocument.current = undefined;
    snapshot.current = undefined;
    setValues(fields());
    setTechnology("");
    setTags("");
    setTeam("");
  }, []);
  useEffect(() => {
    cancel();
    reset();
    setError("");
    setMemberPage(1);
  }, [selected, cancel, reset]);
  const leave = (run: () => void) => {
    if (pending.current) return;
    const next = () => {
      reset();
      setError("");
      run();
    };
    if (navigation) navigation.request(next);
    else next();
  };
  const choose = (id: string) =>
    leave(() => {
      clearDetail();
      setMemberPage(1);
      setParams(id ? { project: id } : {});
    });
  const edit = (next: Mode) =>
    leave(() => {
      if (
        next === "create"
          ? !canCreate
          : !p ||
            detailRead.loading ||
            !!detailRead.error ||
            !p.actions.includes(
              next === "archive" || next === "restore" ? "delete" : "update",
            )
      )
        return;
      snapshot.current = { revision: p?.revision || 0, title: p?.title || "" };
      setValues(fields(next === "update" ? p : undefined));
      setTechnology(next === "update" ? p?.tech_stack.join(", ") || "" : "");
      setTags(next === "update" ? p?.tags.join(", ") || "" : "");
      setTeam(p?.team_id || "");
      setRole("contributor");
      setMode(next);
    });
  async function mutate(
    document: unknown,
    controller: AbortController,
    id = selected,
  ) {
    const identity =
      id +
      JSON.stringify(document, (key, value) =>
        key === "currentPassword" ? undefined : value,
      );
    if (keyDocument.current !== identity) {
      key.current = undefined;
      keyDocument.current = identity;
    }
    key.current ??= crypto.randomUUID();
    return api<{ id: string }>(base + (id ? "/" + id : ""), {
      method: "POST",
      body: document,
      protected: true,
      idempotencyKey: key.current,
      signal: controller.signal,
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      stale ||
      conflict ||
      denied ||
      !mode ||
      readUnavailable ||
      (mode === "create" && !scopeAllowed)
    )
      return;
    if (
      ["archive", "restore"].includes(mode) &&
      (!password || confirmation !== snapshot.current?.title)
    )
      return;
    const controller = beginOperation();
    if (!controller) return;
    const secret = password;
    setPassword("");
    setError("");
    try {
      const revision = snapshot.current!.revision;
      const record =
        mode === "create" || mode === "update"
          ? projectRecord.parse({
              ...values,
              tech_stack: technology
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
              tags: tags
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            })
          : undefined;
      const body =
        mode === "create"
          ? projectCreate.parse({ record, teamId: team || null })
          : projectMutation.parse({
              action: mode,
              revision,
              ...(record ? { record } : {}),
              ...(mode === "member_save" ? { email, role } : {}),
              ...(["archive", "restore"].includes(mode)
                ? { currentPassword: secret, confirmation }
                : {}),
            });
      const r = await mutate(
        body,
        controller,
        mode === "create" ? "" : selected,
      );
      if (!current(controller)) return;
      navigation.allow(() => {
        reset();
        clearDetail();
        setParams({ project: r.id });
      });
      setTick((v) => v + 1);
      setNotice("Private project changes saved. Nothing was published.");
    } catch (e) {
      if (current(controller)) {
        if (e instanceof ApiFailure && e.status === 409) setConflict(true);
        setError(
          validationMessage(e, "Check the project fields and try again."),
        );
      }
    } finally {
      finish(controller);
    }
  }
  async function remove(m: Member) {
    if (
      !p ||
      mode ||
      !p.actions.includes("update") ||
      readUnavailable ||
      p.deleted_at
    )
      return;
    const controller = beginOperation();
    if (!controller) return;
    setError("");
    try {
      await mutate(
        projectMutation.parse({
          action: "member_remove",
          revision: p.revision,
          memberId: m.memberId,
        }),
        controller,
      );
      if (!current(controller)) return;
      key.current = undefined;
      setTick((v) => v + 1);
      setNotice("Participant removed; membership history is retained.");
    } catch (e) {
      if (current(controller))
        setError(
          validationMessage(e, "The participant change could not be saved."),
        );
    } finally {
      finish(controller);
    }
  }
  const canCreate = !!cap && (cap.globalCreate || cap.teams.length > 0);
  const scopeAllowed =
    !!cap && (team ? cap.teams.some((t) => t.id === team) : cap.globalCreate);
  const readUnavailable =
    !isOnline ||
    !!capRead.error ||
    capRead.loading ||
    (mode !== "create" && (detailRead.loading || !!detailRead.error));
  const input = (
    label: string,
    name: keyof Fields,
    type = "text",
    maxLength?: number,
  ) => (
    <Field label={label} key={name}>
      <input
        type={type}
        maxLength={maxLength}
        value={String(values[name])}
        onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
      />
    </Field>
  );
  const panelFeedback = (<>
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          className="gt-inline-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {!isOnline && (
        <p role="status" className="gt-data-note">
          You are offline. Unsaved project fields stay only in this open tab;
          nothing submits automatically on reconnect.
        </p>
      )}
      {reads
        .filter((read) => read.error)
        .map((read) => (
          <p key={read.name} role="alert" className="gt-inline-error">
            {read.name}: {read.error}{" "}
            <button
              disabled={busy || !isOnline}
              onClick={() => {
                setTick((v) => v + 1);
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Retry {read.name.toLowerCase()}
            </button>
          </p>
        ))}
      {reads
        .filter((read) => read.data && (read.error || !isOnline))
        .map((read) => (
          <p key={read.name} role="status" className="gt-data-note">
            {read.name} may be out of date. Last loaded{" "}
            {read.at ? new Date(read.at).toLocaleString() : "earlier"}.
          </p>
        ))}
  </>);
  return (
    <section className="gt-admin-page gt-projects-workspace">
      <header className="gt-admin-heading">
        <div>
          <h1 ref={workspaceHeading} tabIndex={-1}>
            Projects
          </h1>
          <p>
            Private chapter work, participants and progress. Featured projects
            stay private.
          </p>
        </div>
        <div className="gt-actions">
          <Button
            disabled={
              !canCreate ||
              !isOnline ||
              !!capRead.error ||
              capRead.loading ||
              busy ||
              !!mode
            }
            onClick={() => edit("create")}
          >
            New project
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !isOnline}
            onClick={() => setTick((v) => v + 1)}
          >
            Refresh
          </Button>
        </div>
      </header>
      {!mode && !(selected && p) && panelFeedback}
      {mode && (
        <RecordPanel title="Project editor" busy={busy} onClose={() => leave(() => {})}>
          {panelFeedback}
<form className="gt-panel gt-event-editor" onSubmit={save}>
          <h2 ref={heading} tabIndex={-1}>
            {mode === "create"
              ? "New private project"
              : mode === "update"
                ? "Project details"
                : mode === "member_save"
                  ? "Add or update participant"
                  : `${mode === "archive" ? "Archive" : "Restore"} project`}
          </h2>
          {(stale || conflict || denied) && (
            <p role="alert">
              {denied
                ? "Your current access no longer permits this action."
                : "This project changed. Your input is preserved. Close the editor and reload before saving."}
            </p>
          )}
          {mode === "create" && !scopeAllowed && (
            <p role="alert">
              Project creation is unavailable in the selected scope. Your fields
              are preserved.
            </p>
          )}
          <fieldset disabled={busy} className="gt-plain-fieldset">
            {(mode === "create" || mode === "update") && (
              <>
                <div className="gt-form-grid">
                  <Field label="Project title" required>
                    <input
                      required
                      maxLength={200}
                      value={values.title}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, title: e.target.value }))
                      }
                    />
                  </Field>
                  {mode === "create" && (
                    <Field label="Team" required>
                      <select
                        required={!cap?.globalCreate}
                        value={team}
                        onChange={(e) => setTeam(e.target.value)}
                      >
                        {cap?.globalCreate ? (
                          <option value="">Chapter</option>
                        ) : (
                          <option value="">Choose a team</option>
                        )}
                        {cap?.teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  {input("Category", "category", "text", 100)}
                  <Field label="Project status">
                    <select
                      value={values.status}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, status: e.target.value }))
                      }
                    >
                      {["active", "completed", "on_hold", "archived"].map(
                        (x) => (
                          <option key={x} value={x}>
                            {x.replace(/_/g, " ")}
                          </option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field label="Difficulty">
                    <select
                      value={values.difficulty_level}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          difficulty_level: e.target.value,
                        }))
                      }
                    >
                      {["beginner", "intermediate", "advanced"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Planned team size"
                    hint="Planning capacity, separate from the participant count."
                  >
                    <input
                      type="number"
                      required
                      min={1}
                      max={1000}
                      value={values.team_size}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          team_size: Number(e.target.value),
                        }))
                      }
                    />
                  </Field>
                  {input("Start date", "start_date", "date")}
                  {input("End date", "end_date", "date")}
                  {input("Repository URL", "github_url", "url")}
                  {input("Demo URL", "demo_url", "url")}
                  <Field
                    label="Image URL"
                    hint="An approved HTTPS image or local /assets/ image. This does not upload a file."
                  >
                    <input
                      value={values.image_url}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, image_url: e.target.value }))
                      }
                    />
                  </Field>
                  <Field
                    label="Technologies"
                    hint="Comma-separated; up to 50 unique names."
                  >
                    <input
                      value={technology}
                      onChange={(e) => setTechnology(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Tags"
                    hint="Comma-separated; up to 30 unique tags."
                  >
                    <input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Short description">
                  <textarea
                    maxLength={500}
                    value={values.short_description}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        short_description: e.target.value,
                      }))
                    }
                  />
                </Field>
                <Field
                  label="Description"
                  required
                  hint="Plain text; no executable HTML."
                >
                  <textarea
                    required
                    rows={7}
                    maxLength={20000}
                    value={values.description}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, description: e.target.value }))
                    }
                  />
                </Field>
                <label>
                  <input
                    type="checkbox"
                    checked={values.is_featured}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        is_featured: e.target.checked,
                      }))
                    }
                  />{" "}
                  Featured internally
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={values.is_open_source}
                    onChange={(e) =>
                      setValues((v) => ({
                        ...v,
                        is_open_source: e.target.checked,
                      }))
                    }
                  />{" "}
                  Open-source project
                </label>
              </>
            )}
            {mode === "member_save" && (
              <>
                <p>
                  Enter an existing active community member’s exact email. Only
                  their name and project role appear here; this does not grant
                  admin access or send an invitation. Ambiguous duplicate emails
                  require review in Members.
                </p>
                <Field label="Participant email" required>
                  <input
                    type="email"
                    required
                    autoComplete="off"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Project role" required>
                  <input
                    required
                    maxLength={100}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </Field>
              </>
            )}
            {(mode === "archive" || mode === "restore") && (
              <>
                <p>
                  {mode === "archive"
                    ? "Archive without deleting participants, star data or financial references."
                    : "Restore to the private workspace. Nothing becomes public."}
                </p>
                <Field label={`Type ${snapshot.current?.title}`} required>
                  <input
                    required
                    autoComplete="off"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
                <Field label="Current password" required>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              </>
            )}
          </fieldset>
          <div className="gt-actions">
            <Button
              type="submit"
              disabled={
                busy ||
                stale ||
                conflict ||
                denied ||
                readUnavailable ||
                (mode === "create" && !scopeAllowed) ||
                (["archive", "restore"].includes(mode) &&
                  (!password || confirmation !== snapshot.current?.title))
              }
            >
              Save changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => leave(() => {})}
            >
              Close editor
            </Button>
          </div>
        </form>
</RecordPanel>
      )}
      <section
        aria-label="Project filters"
        className="gt-toolbar gt-response-filters"
      >
        <SearchBox
          value={q}
          onChange={(v) => {
            setPage(1);
            setQ(v);
          }}
          label="Search private projects"
        />
        <Field label="Project inventory">
          <select
            value={state}
            onChange={(e) => {
              setPage(1);
              setState(e.target.value);
            }}
          >
            <option value="current">Current</option>
            <option value="trash">Archived records</option>
          </select>
        </Field>
        <Field label="Filter status">
          <select
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All statuses</option>
            {["active", "completed", "on_hold", "archived"].map((x) => (
              <option key={x} value={x}>
                {x.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Filter category">
          <input
            value={category}
            maxLength={100}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value);
            }}
          />
        </Field>
        <label>
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => {
              setPage(1);
              setFeatured(e.target.checked);
            }}
          />{" "}
          Featured only
        </label>
      </section>
      {(q ||
        state !== "current" ||
        status ||
        category ||
        featured ||
        page > 1) && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setQ("");
            setState("current");
            setStatus("");
            setCategory("");
            setFeatured(false);
            setPage(1);
            document.getElementById("workspace-content")?.focus();
          }}
        >
          Reset project filters
        </Button>
      )}
      {listRead.loading && !listing && (
        <div role="status" aria-label="Loading private projects">
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading private projects…</span>
        </div>
      )}
      {!listRead.loading && !listing && listRead.error && (
        <p>
          Project inventory is unavailable. Retry to check your current scope.
        </p>
      )}
      {listing && (
        <>
          <p role="status">
            {listing.total} matching projects · {listing.stats.active} active ·{" "}
            {listing.stats.completed} completed · {listing.stats.featured}{" "}
            featured. Statistics follow filters and current access.
          </p>
          <ScrollableTable
            label="Private projects table"
            className="gt-table-scroll"
          >
            <table className="gt-data-table">
              <caption className="sr-only">Authorized private projects</caption>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Scope / status</th>
                  <th>Participants / stars</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listing.items.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <strong>{x.title}</strong>
                      <small>
                        {x.category} ·{" "}
                        {x.tech_stack.join(", ") || "No technologies yet"}
                      </small>
                    </td>
                    <td>
                      {x.teamName || "Chapter"}
                      <small>
                        <Badge>
                          {x.deleted_at
                            ? "Archived record"
                            : x.status.replace(/_/g, " ")}
                        </Badge>
                        {x.is_featured && " Featured internally"}
                      </small>
                    </td>
                    <td>
                      {x.memberCount} participants ·{" "}
                      {BigInt(x.starCount).toLocaleString()} retained stars
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        aria-label={`Manage project ${x.title}`}
                        disabled={busy || selected === x.id}
                        onClick={() => choose(x.id)}
                      >
                        Manage<span className="sr-only"> {x.title}</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {!listing.items.length && (
            <EmptyState headingLevel={2} title="No matching projects">
              Try another filter or create a private project.
            </EmptyState>
          )}
          <nav aria-label="Project pages" className="gt-actions">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous projects
            </Button>
            <span>Page {page}</span>
            <Button
              variant="secondary"
              disabled={page * listing.pageSize >= listing.total}
              onClick={() => setPage((v) => v + 1)}
            >
              Next projects
            </Button>
          </nav>
          <details className="gt-panel">
            <summary>Filtered statistics</summary>
            {(
              [
                ["Categories", listing.stats.categories],
                ["Statuses", listing.stats.statuses],
                ["Technologies", listing.stats.technologies],
              ] as const
            ).map(([title, counts]) => (
              <section key={title}>
                <h3>{title}</h3>
                <dl>
                  {Object.entries(counts).map(([name, n]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{n}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </details>
        </>
      )}
      {!mode && selected && p && (
        <RecordPanel title="Project details" busy={busy} onClose={() => choose("")}>
          {panelFeedback}
<section className="gt-panel">
          <div className="gt-panel-heading">
            <div>
              <h2>{p.title}</h2>
              <p>
                {p.teamName || "Chapter"} · revision {p.revision} · private
              </p>
            </div>
            <Button variant="ghost" disabled={busy} onClick={() => choose("")}>
              Close project
            </Button>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>
          <p>{p.short_description}</p>
          <p>
            {BigInt(p.starCount).toLocaleString()} retained star records ·
            legacy cached counter: {p.stars_count}. Star identities remain
            private; this release does not accept public votes.
          </p>
          <p>
            Planned capacity: {p.team_size} · difficulty: {p.difficulty_level} ·{" "}
            {p.is_open_source ? "Open source" : "Not marked open source"}
          </p>
          <p>
            {p.start_date || "No start date"} → {p.end_date || "No end date"}
          </p>
          <div className="gt-actions">
            {[
              ["Repository", p.github_url],
              ["Demo", p.demo_url],
            ].map(([name, url]) =>
              url && linktreeUrl.safeParse(url).success ? (
                <a
                  key={name}
                  className="gt-button gt-button-secondary"
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {name}
                  <span className="sr-only"> (opens a new tab)</span>
                </a>
              ) : null,
            )}
            {!p.deleted_at && p.actions.includes("update") && (
              <>
                <Button
                  disabled={busy || readUnavailable}
                  onClick={() => edit("update")}
                >
                  Edit project
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || readUnavailable}
                  onClick={() => edit("member_save")}
                >
                  Add or update participant
                </Button>
              </>
            )}
            {p.actions.includes("delete") && (
              <Button
                variant="secondary"
                disabled={busy || readUnavailable}
                onClick={() => edit(p.deleted_at ? "restore" : "archive")}
              >
                {p.deleted_at ? "Restore project" : "Archive project"}
              </Button>
            )}
          </div>
          <h3>Participants and retained history</h3>
          <p>
            Removal does not delete a community record or change chapter access.
          </p>
          <ScrollableTable
            label="Project participants table"
            className="gt-table-scroll"
          >
            <table className="gt-data-table">
              <caption className="sr-only">Project participants</caption>
              <thead>
                <tr>
                  <th>Name / role</th>
                  <th>State</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                      <small>{m.role}</small>
                    </td>
                    <td>
                      {m.active ? "Active participant" : "Former participant"}
                      {!m.communityActive && " · community record inactive"}
                    </td>
                    <td>
                      {m.active &&
                        !p.deleted_at &&
                        p.actions.includes("update") && (
                          <Button
                            variant="secondary"
                            disabled={busy || readUnavailable}
                            aria-label={`Remove ${m.name} from project`}
                            onClick={() => remove(m)}
                          >
                            Remove
                            <span className="sr-only">
                              {" "}
                              {m.name} from project
                            </span>
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
          {!detail.members.length && <p>No participants yet.</p>}
          <nav aria-label="Participant pages" className="gt-actions">
            <Button
              variant="secondary"
              disabled={busy || detailRead.loading || memberPage <= 1}
              onClick={() => setMemberPage((v) => v - 1)}
            >
              Previous participants
            </Button>
            <span>
              Page {memberPage} · {detail.memberTotal} retained memberships
            </span>
            <Button
              variant="secondary"
              disabled={
                busy ||
                detailRead.loading ||
                memberPage * detail.pageSize >= detail.memberTotal
              }
              onClick={() => setMemberPage((v) => v + 1)}
            >
              Next participants
            </Button>
          </nav>
        </section>
</RecordPanel>
      )}
      {!mode &&
        selected &&
        !p &&
        (detailRead.loading ? (
          <div role="status" aria-label="Loading selected project">
            <div className="gt-skeleton gt-detail-skeleton" />
            <span className="sr-only">Loading selected project…</span>
          </div>
        ) : (
          <p>
            Selected project is unavailable. Retry its details or choose another
            project.
          </p>
        ))}
    </section>
  );
}
