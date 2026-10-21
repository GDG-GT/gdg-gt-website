import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
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
  const [params, setParams] = useApprovedSearchParams(),
    selected = params.get("project") || "",
    navigation = useNavigationSafety();
  const [listing, setListing] = useState<Listing>(),
    [detail, setDetail] = useState<Detail>(),
    [cap, setCap] = useState<Cap>();
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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const snapshot = useRef<{ revision: number; title: string }>(),
    key = useRef<string>(),
    keyDocument = useRef<string>(),
    epoch = useRef(0),
    workspaceHeading = useRef<HTMLHeadingElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const p = detail?.project,
    stale =
      !!mode &&
      mode !== "create" &&
      !!p &&
      p.revision !== snapshot.current?.revision;
  const required =
      mode === "archive" || mode === "restore" ? "delete" : "update",
    denied =
      !!mode && mode !== "create" && (!p || !p.actions.includes(required));
  useDraftGuard(!!mode, { busy, label: "Private project changes" });
  useEffect(() => {
    const timer = window.setInterval(() => setTick((v) => v + 1), 30000);
    const invalidate = () => {
      epoch.current++;
    };
    const clear = () => {
      invalidate();
      setListing(undefined);
      setDetail(undefined);
      setCap(undefined);
      setMode(null);
      setPassword("");
      setEmail("");
      setValues(fields());
      setTechnology("");
      setTags("");
      setConfirmation("");
      setNotice("");
      setError("");
      setBusy(false);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<Cap>(base + "/capabilities", { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && readEpoch === epoch.current) setCap(v);
      })
      .catch((e) => {
        if (!c.signal.aborted && readEpoch === epoch.current) {
          setCap(undefined);
          setLoadError(e.message);
        }
      });
    return () => c.abort();
  }, [tick]);
  useEffect(() => {
    const c = new AbortController(),
      readEpoch = epoch.current,
      query = new URLSearchParams({
        q,
        state,
        page: String(page),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(featured ? { featured: "true" } : {}),
      });
    api<Listing>(base + "?" + query, { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && readEpoch === epoch.current) {
          setListing(v);
          setLoadError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted && readEpoch === epoch.current) {
          setListing(undefined);
          setLoadError(e.message);
        }
      });
    return () => c.abort();
  }, [q, state, page, status, category, featured, tick]);
  useEffect(() => {
    if (!selected) {
      setDetail(undefined);
      return;
    }
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<Detail>(base + "/" + selected + "?page=" + memberPage, {
      signal: c.signal,
    })
      .then((v) => {
        if (!c.signal.aborted && readEpoch === epoch.current) setDetail(v);
      })
      .catch((e) => {
        if (!c.signal.aborted && readEpoch === epoch.current) {
          setDetail(undefined);
          setLoadError(e.message);
        }
      });
    return () => c.abort();
  }, [selected, memberPage, tick]);
  useEffect(() => {
    if (mode) heading.current?.focus();
    else workspaceHeading.current?.focus();
  }, [mode]);
  const reset = () => {
    setMode(null);
    setPassword("");
    setConfirmation("");
    setEmail("");
    setConflict(false);
    key.current = undefined;
  };
  const leave = (run: () => void) => {
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
      setDetail(undefined);
      setMemberPage(1);
      setParams(id ? { project: id } : {});
    });
  const edit = (next: Mode) =>
    leave(() => {
      snapshot.current = { revision: p?.revision || 0, title: p?.title || "" };
      setValues(fields(next === "update" ? p : undefined));
      setTechnology(next === "update" ? p?.tech_stack.join(", ") || "" : "");
      setTags(next === "update" ? p?.tags.join(", ") || "" : "");
      setTeam(p?.team_id || "");
      setRole("contributor");
      setMode(next);
    });
  const changed = () => {
    key.current = undefined;
  };
  async function mutate(document: unknown, id = selected) {
    const identity = id + JSON.stringify(document);
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
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || stale || conflict || denied || !mode) return;
    const runEpoch = epoch.current,
      secret = password;
    setPassword("");
    setError("");
    setBusy(true);
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
      const r = await mutate(body, mode === "create" ? "" : selected);
      if (runEpoch !== epoch.current) return;
      reset();
      setDetail(undefined);
      setParams({ project: r.id });
      setTick((v) => v + 1);
      setNotice("Private project changes saved. Nothing was published.");
    } catch (e) {
      if (runEpoch === epoch.current) {
        if (e instanceof ApiFailure && e.status === 409) setConflict(true);
        setError(
          validationMessage(e, "Check the project fields and try again."),
        );
      }
    } finally {
      if (runEpoch === epoch.current) setBusy(false);
    }
  }
  async function remove(m: Member) {
    if (!p || busy) return;
    const runEpoch = epoch.current;
    setError("");
    setBusy(true);
    try {
      await mutate(
        projectMutation.parse({
          action: "member_remove",
          revision: p.revision,
          memberId: m.memberId,
        }),
      );
      if (runEpoch !== epoch.current) return;
      key.current = undefined;
      setTick((v) => v + 1);
      setNotice("Participant removed; membership history is retained.");
    } catch (e) {
      if (runEpoch === epoch.current)
        setError(
          validationMessage(e, "The participant change could not be saved."),
        );
    } finally {
      if (runEpoch === epoch.current) setBusy(false);
    }
  }
  const canCreate = !!cap && (cap.globalCreate || cap.teams.length > 0);
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
            disabled={!canCreate || busy || !!mode}
            onClick={() => edit("create")}
          >
            New project
          </Button>
          <Button variant="secondary" onClick={() => setTick((v) => v + 1)}>
            Refresh
          </Button>
        </div>
      </header>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p className="gt-inline-error" role="alert">
          {error}
        </p>
      )}
      {loadError && (
        <p className="gt-inline-error" role="alert">
          {loadError}
        </p>
      )}
      {mode && (
        <form
          className="gt-panel gt-event-editor"
          onSubmit={save}
          onChange={changed}
        >
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
                    <Field label="Owning scope" required>
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
              disabled={busy || stale || conflict || denied}
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
      {listing && (
        <>
          <p role="status">
            {listing.total} matching projects · {listing.stats.active} active ·{" "}
            {listing.stats.completed} completed · {listing.stats.featured}{" "}
            featured. Statistics follow filters and current access.
          </p>
          <div className="gt-table-scroll">
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
          </div>
          {!listing.items.length && (
            <EmptyState title="No matching projects">
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
        <section className="gt-panel">
          <div className="gt-panel-heading">
            <div>
              <h2>{p.title}</h2>
              <p>
                {p.teamName || "Chapter"} · revision {p.revision} · private
              </p>
            </div>
            <Button variant="ghost" onClick={() => choose("")}>
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
                <Button onClick={() => edit("update")}>Edit project</Button>
                <Button variant="secondary" onClick={() => edit("member_save")}>
                  Add or update participant
                </Button>
              </>
            )}
            {p.actions.includes("delete") && (
              <Button
                variant="secondary"
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
          <div className="gt-table-scroll">
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
                            disabled={busy}
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
          </div>
          {!detail.members.length && <p>No participants yet.</p>}
          <nav aria-label="Participant pages" className="gt-actions">
            <Button
              variant="secondary"
              disabled={memberPage <= 1}
              onClick={() => setMemberPage((v) => v - 1)}
            >
              Previous participants
            </Button>
            <span>
              Page {memberPage} · {detail.memberTotal} retained memberships
            </span>
            <Button
              variant="secondary"
              disabled={memberPage * detail.pageSize >= detail.memberTotal}
              onClick={() => setMemberPage((v) => v + 1)}
            >
              Next participants
            </Button>
          </nav>
        </section>
      )}
    </section>
  );
}
