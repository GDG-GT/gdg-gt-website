import "./assets";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, ApiFailure } from "@/lib/api";
import { useScopedRealtime } from "@/hooks/useScopedRealtime";
import { boardDocument } from "../../../shared/whiteboards.mjs";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import {
  downloadBoard,
  exportDocument,
  type Board,
  type BoardDocument,
  type OpenBoard,
} from "./types";
const Canvas = lazy(() => import("./BoardCanvas"));
type Listing = { items: Board[]; total: number; pageSize: number };
type Collaborator = {
  user_id: string;
  role: string;
  user: { display_name: string; email: string };
};
type Mode = "create" | "rename" | "archive" | "restore" | "share" | "unshare";
export default function WhiteboardWorkspace() {
  const [listing, setListing] = useState<Listing>(),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(""),
    [archived, setArchived] = useState(false),
    [tick, setTick] = useState(0);
  const [capabilities, setCapabilities] = useState<{
      globalCreate: boolean;
      teams: { id: string; name: string }[];
    }>(),
    [selected, setSelected] = useState(""),
    [opened, setOpened] = useState<OpenBoard>(),
    [canvasKey, setCanvasKey] = useState(0);
  const [mode, setMode] = useState<Mode | null>(null),
    [name, setName] = useState(""),
    [team, setTeam] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("viewer"),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [conflict, setConflict] = useState(false),
    [saveState, setSaveState] = useState("Saved"),
    [revision, setRevision] = useState(0),
    [members, setMembers] = useState<Collaborator[] | null>(null),
    [memberPage, setMemberPage] = useState(1),
    [memberTotal, setMemberTotal] = useState(0);
  const selectedRef = useRef(""),
    openedRef = useRef<OpenBoard>(),
    draftRef = useRef<BoardDocument>(),
    saved = useRef(""),
    dirtyRef = useRef(false),
    saving = useRef(false),
    key = useRef<string>(),
    formHeading = useRef<HTMLHeadingElement>(null),
    locked = useRef(false);
  openedRef.current = opened;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [fitRequest, setFitRequest] = useState(0);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [capabilityRetry, setCapabilityRetry] = useState(0);
  const liveStatus = useScopedRealtime(
    selected ? { kind: "whiteboard", id: selected } : null,
    () => setTick((v) => v + 1),
    () => {
      locked.current = true;
      setOpened(undefined);
      openedRef.current = undefined;
      draftRef.current = undefined;
      dirtyRef.current = false;
      setDirty(false);
      setMembers(null);
      setTick((v) => v + 1);
    },
  );
  useEffect(() => {
    const controller = new AbortController();
    api<Listing>(
      `/admin/whiteboards?${new URLSearchParams({ q: query, page: String(page), archived: archived ? "1" : "0" })}`,
      { signal: controller.signal },
    )
      .then((value) => {
        setListing(value);
        setLoadErrors((v) => ({ ...v, directory: "" }));
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setLoadErrors((v) => ({ ...v, directory: e.message }));
      });
    return () => controller.abort();
  }, [query, page, archived, tick]);
  useEffect(() => {
    api<typeof capabilities>("/admin/whiteboards/capabilities")
      .then((value) => {
        setCapabilities(value);
        setLoadErrors((v) => ({ ...v, capabilities: "" }));
      })
      .catch((e) => setLoadErrors((v) => ({ ...v, capabilities: e.message })));
  }, [capabilityRetry]);
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (!document.hidden) setTick((v) => v + 1);
      },
      liveStatus === "live" ? 30000 : 5000,
    );
    return () => clearInterval(timer);
  }, [liveStatus]);
  useEffect(() => {
    const refresh = () => setTick((v) => v + 1);
    window.addEventListener("gdg:notifications-updated", refresh);
    const refreshAccess = () => {
      setCapabilityRetry((v) => v + 1);
      refresh();
    };
    window.addEventListener("gdg:access-changed", refreshAccess);
    return () => {
      window.removeEventListener("gdg:access-changed", refreshAccess);
      window.removeEventListener("gdg:notifications-updated", refresh);
    };
  }, []);
  function applyBoard(value: OpenBoard) {
    openedRef.current = value;
    setOpened(value);
    saved.current = JSON.stringify(value.record.document);
    draftRef.current = value.record.document;
    dirtyRef.current = false;
    setDirty(false);
    setConflict(false);
    setSaveState(value.record.deleted_at ? "Read-only archive" : "Saved");
    setCanvasKey((v) => v + 1);
    locked.current = !value.actions.includes("update");
  }
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    api<OpenBoard>(`/admin/whiteboards/${selected}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setLoadErrors((v) => ({ ...v, board: "" }));
        if (saving.current) return;
        if (!openedRef.current) {
          applyBoard(value);
          return;
        }
        if (value.record.version === openedRef.current.record.version) return;
        if (dirtyRef.current || modeRef.current) {
          setConflict(true);
          setSaveState("Conflict — your changes are preserved in this tab");
          locked.current = true;
        } else applyBoard(value);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          locked.current = true;
          setOpened(undefined);
          openedRef.current = undefined;
          draftRef.current = undefined;
          dirtyRef.current = false;
          setDirty(false);
          setMembers(null);
        }
        setLoadErrors((v) => ({ ...v, board: e.message }));
      });
    return () => controller.abort();
  }, [selected, tick]);
  function changeDocument(document: BoardDocument) {
    if (
      locked.current ||
      modeRef.current ||
      !openedRef.current?.actions.includes("update")
    )
      return;
    const encoded = JSON.stringify(document);
    if (encoded === JSON.stringify(draftRef.current)) return;
    draftRef.current = document;
    dirtyRef.current = encoded !== saved.current;
    setDirty(dirtyRef.current);
    setSaveState(dirtyRef.current ? "Unsaved changes" : "Saved");
    key.current = undefined;
    setRevision((v) => v + 1);
  }
  async function save() {
    const board = openedRef.current;
    if (
      !board ||
      !draftRef.current ||
      !dirtyRef.current ||
      saving.current ||
      locked.current
    )
      return;
    const id = board.record.id,
      document = draftRef.current,
      encoded = JSON.stringify(document);
    const validation = boardDocument.safeParse(JSON.parse(encoded));
    if (!validation.success) {
      setError(
        validation.error.issues[0]?.message || "This drawing cannot be saved.",
      );
      setSaveState("Not saved — correct the drawing before retrying");
      return;
    }
    saving.current = true;
    setSaveState("Saving…");
    key.current ??= crypto.randomUUID();
    try {
      const result = await api<{ record: Board }>(`/admin/whiteboards/${id}`, {
        method: "POST",
        protected: true,
        idempotencyKey: key.current,
        body: {
          action: "save",
          version: board.record.version,
          updatedAt: board.record.updated_at,
          document,
        },
      });
      if (selectedRef.current !== id) return;
      saved.current = encoded;
      openedRef.current = {
        ...board,
        record: { ...result.record, document },
        actions: result.record.actions || board.actions,
      };
      setOpened(openedRef.current);
      dirtyRef.current = JSON.stringify(draftRef.current) !== encoded;
      setDirty(dirtyRef.current);
      setSaveState(dirtyRef.current ? "Unsaved changes" : "Saved");
      key.current = undefined;
      if (dirtyRef.current) setRevision((v) => v + 1);
    } catch (e) {
      if (selectedRef.current !== id) return;
      setError(e instanceof Error ? e.message : "The board could not save.");
      setSaveState("Not saved — your changes remain in this tab");
      if (e instanceof ApiFailure && e.status === 409) {
        setConflict(true);
        locked.current = true;
      }
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        locked.current = true;
        setOpened(undefined);
        openedRef.current = undefined;
        draftRef.current = undefined;
        dirtyRef.current = false;
        setDirty(false);
      }
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (!dirty || conflict) return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [revision, dirty, conflict]);
  useEffect(() => {
    if (!dirty && !mode) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, mode]);
  useDraftGuard(dirty || !!mode, {
    busy: busy || saving.current,
    label: "Whiteboard scene or settings",
  });
  useEffect(() => {
    if (mode) formHeading.current?.focus();
  }, [mode]);
  function choose(id: string, committed = false) {
    if (saving.current) {
      setError("Wait for the current save to finish.");
      return;
    }
    if (
      !committed &&
      (dirtyRef.current || mode) &&
      !confirm(
        "Discard unsaved board changes? Download a copy first if you need it.",
      )
    )
      return;
    selectedRef.current = id;
    setSelected(id);
    openedRef.current = undefined;
    setOpened(undefined);
    draftRef.current = undefined;
    saved.current = "";
    dirtyRef.current = false;
    locked.current = false;
    setDirty(false);
    setConflict(false);
    setMembers(null);
    setMode(null);
    setError("");
    setNotice("");
    setLoadErrors((v) => ({ ...v, board: "" }));
    setPassword("");
    setConfirmation("");
    key.current = undefined;
    setTick((v) => v + 1);
  }
  function start(action: Mode, member?: Collaborator) {
    if (
      mode &&
      !confirm(
        "Discard the unsaved board details before opening another action?",
      )
    )
      return;
    if (dirtyRef.current || saving.current) {
      setError(
        "Save or resolve your drawing changes before changing board details or access.",
      );
      return;
    }
    setMode(action);
    setName(opened?.record.name || "");
    setEmail(member?.user.email || "");
    setRole(member?.role || "viewer");
    setPassword("");
    setConfirmation("");
    setError("");
  }
  async function loadMembers(next = 1) {
    const id = selectedRef.current;
    try {
      const r = await api<{ items: Collaborator[]; total: number }>(
        `/admin/whiteboards/${id}/collaborators?page=${next}`,
      );
      if (id === selectedRef.current) {
        setMembers(r.items);
        setMemberTotal(r.total);
        setMemberPage(next);
      }
    } catch (e) {
      setError(e.message);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || saving.current) return;
    if (dirtyRef.current) {
      setError(
        "Save or resolve your drawing changes before submitting board details.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const board = openedRef.current?.record;
      const body =
        mode === "create"
          ? { name, teamId: team || null }
          : {
              action: mode,
              version: board!.version,
              updatedAt: board!.updated_at,
              ...(mode === "rename"
                ? { name }
                : mode === "share" || mode === "unshare"
                  ? { email, role, currentPassword: password }
                  : { confirmation }),
            };
      const result = await api<{ record: Board }>(
        "/admin/whiteboards" + (mode === "create" ? "" : "/" + selected),
        {
          method: "POST",
          protected: true,
          idempotencyKey: crypto.randomUUID(),
          body,
        },
      );
      setMode(null);
      setPassword("");
      setConfirmation("");
      setNotice("Board changes saved.");
      setTick((v) => v + 1);
      if (mode === "create") {
        choose(result.record.id, true);
      } else if (mode === "archive") {
        choose("", true);
      } else {
        const value = await api<OpenBoard>("/admin/whiteboards/" + selected);
        if (selected === selectedRef.current) applyBoard(value);
        if (members) await loadMembers(memberPage);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Board changes could not save.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (
      (dirtyRef.current || modeRef.current) &&
      !confirm(
        "Replace your unsaved drawing or staged board details with the saved server version? Download your copy or note your details first.",
      )
    )
      return;
    try {
      const value = await api<OpenBoard>("/admin/whiteboards/" + selected);
      if (selected === selectedRef.current) {
        applyBoard(value);
        setMode(null);
        setPassword("");
        setConfirmation("");
      }
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Whiteboards</h1>
          <p>
            Private planning canvases. Saves are version-checked so
            collaborators cannot silently overwrite each other.
          </p>
        </div>
        {(capabilities?.globalCreate || !!capabilities?.teams.length) && (
          <Button
            disabled={busy || !!mode || dirty}
            onClick={() => start("create")}
          >
            New board
          </Button>
        )}
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}{" "}
          <button onClick={() => setTick((v) => v + 1)}>Check again</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {Object.entries(loadErrors)
        .filter(
          ([scope, message]) => message && (scope !== "board" || selected),
        )
        .map(([scope, message]) => (
          <p key={scope} className="gt-form-error" role="alert">
            {message}{" "}
            <button
              onClick={() => {
                setTick((v) => v + 1);
                if (scope === "capabilities") setCapabilityRetry((v) => v + 1);
              }}
            >
              Retry loading {scope === "board" ? "this board" : "the workspace"}
            </button>
          </p>
        ))}
      {mode && (
        <form className="gt-event-editor" onSubmit={submit}>
          <h2 tabIndex={-1} ref={formHeading}>
            {
              {
                create: "Create a private board",
                rename: "Rename board",
                archive: "Archive board",
                restore: "Restore board",
                share: "Grant explicit board access",
                unshare: "Remove explicit board access",
              }[mode]
            }
          </h2>
          {(mode === "create" || mode === "rename") && (
            <Field label="Board name" required>
              <input
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          {mode === "create" && (
            <Field
              label="Board scope"
              hint="The owning team cannot be changed later. Team members still need the appropriate action grant or explicit board access."
            >
              <select
                required={!capabilities?.globalCreate}
                value={team}
                onChange={(e) => setTeam(e.target.value)}
              >
                <option value="">
                  {capabilities?.globalCreate
                    ? "Private — creator and explicit collaborators"
                    : "Choose a team"}
                </option>
                {capabilities?.teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {(mode === "share" || mode === "unshare") && (
            <>
              <Field label="Exact chapter account email" required>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {mode === "share" && (
                <Field label="Board access">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="viewer">View and export only</option>
                    <option value="editor">
                      View, export and edit drawing
                    </option>
                  </select>
                </Field>
              )}
              <Field label="Your current password" required>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <p className="gt-field-hint">
                Explicit access does not change a chapter role. Removing it does
                not remove access independently provided by an active team
                grant.
              </p>
            </>
          )}
          {(mode === "archive" || mode === "restore") && (
            <Field
              label={`Type “${opened?.record.name}” to confirm`}
              required
              hint={
                mode === "archive"
                  ? "Recoverable archive; the drawing is retained."
                  : "Restoring preserves the original board scope and collaborator grants."
              }
            >
              <input
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
          )}
          <div className="gt-button-row">
            <Button disabled={busy || (mode !== "create" && conflict)}>
              {busy ? "Saving…" : "Confirm changes"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setMode(null);
                setPassword("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!selected ? (
        <section aria-label="Board directory">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            label="Search board names"
          />
          <Field label="Board state">
            <select
              value={archived ? "1" : "0"}
              onChange={(e) => {
                setArchived(e.target.value === "1");
                setPage(1);
              }}
            >
              <option value="0">Current boards</option>
              <option value="1">Archived boards</option>
            </select>
          </Field>
          {!listing ? (
            <p role="status">Loading authorized boards…</p>
          ) : !listing.items.length ? (
            <EmptyState title="No boards in this view">
              Create a private planning canvas or ask its owner for access.
            </EmptyState>
          ) : (
            <div className="gt-team-directory">
              {listing.items.map((b) => (
                <article key={b.id}>
                  <div>
                    <h2>{b.name}</h2>
                    <p>
                      {b.team_id ? "Team-scoped" : "Private"} · Version{" "}
                      {b.version} · Updated{" "}
                      {new Date(b.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => choose(b.id)}>
                    Open<span className="sr-only"> {b.name}</span>
                  </Button>
                </article>
              ))}
            </div>
          )}
          <nav className="gt-button-row" aria-label="Board pages">
            <Button
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>{page}</span>
            <Button
              variant="secondary"
              disabled={!listing || page * 30 >= listing.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </nav>
        </section>
      ) : !opened ? (
        <>
          <Button variant="secondary" onClick={() => choose("")}>
            Back to boards
          </Button>
          {!error && !loadErrors.board && (
            <p role="status">Loading the private canvas…</p>
          )}
        </>
      ) : (
        <section aria-label="Open board">
          <header className="gt-admin-heading">
            <div>
              <h2>{opened.record.name}</h2>
              <p>
                {opened.record.team_id ? "Team-scoped board" : "Private board"}{" "}
                · Version {opened.record.version}
              </p>
              <Badge>
                {opened.record.deleted_at ? "Archived" : "Private workspace"}
              </Badge>
            </div>
            <Button variant="secondary" onClick={() => choose("")}>
              Back to boards
            </Button>
          </header>
          <div className="gt-button-row">
            <Button
              disabled={!dirty || busy || conflict}
              onClick={() => void save()}
            >
              Save now
            </Button>
            <Button
              variant="secondary"
              onClick={() => setFitRequest((v) => v + 1)}
            >
              Fit drawing
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  const r = await api<{ name: string; document: unknown }>(
                    `/admin/whiteboards/${selected}/export`,
                  );
                  downloadBoard(r.name, r.document);
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              Export saved board
            </Button>
            {dirty && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (draftRef.current)
                    downloadBoard(
                      opened.record.name + " unsaved copy",
                      exportDocument(draftRef.current),
                    );
                }}
              >
                Download my unsaved copy
              </Button>
            )}
            {opened.actions.includes("update") && !opened.record.deleted_at && (
              <Button
                variant="ghost"
                disabled={dirty}
                onClick={() => start("rename")}
              >
                Rename
              </Button>
            )}
            {opened.actions.includes("manage") && !opened.record.deleted_at && (
              <>
                <Button
                  variant="ghost"
                  onClick={() =>
                    members ? setMembers(null) : void loadMembers()
                  }
                >
                  Board access
                </Button>
                <Button
                  variant="ghost"
                  disabled={dirty}
                  onClick={() => start("share")}
                >
                  Add collaborator
                </Button>
              </>
            )}
            {opened.actions.includes("delete") && !opened.record.deleted_at && (
              <Button
                variant="ghost"
                disabled={dirty}
                onClick={() => start("archive")}
              >
                Archive
              </Button>
            )}
            {opened.actions.includes("restore") && opened.record.deleted_at && (
              <Button variant="ghost" onClick={() => start("restore")}>
                Restore
              </Button>
            )}
          </div>
          <p role="status" className="gt-board-save-state">
            {saveState}
          </p>
          {conflict && (
            <div className="gt-form-error" role="alert">
              <h3>Another save changed this board</h3>
              <p>
                Your unsaved changes remain in this tab. Download your drawing
                copy or note your staged details before loading the server
                version. Neither version has been silently overwritten.
              </p>
              <Button variant="secondary" onClick={() => void reload()}>
                Load saved server version
              </Button>
            </div>
          )}
          {members && (
            <section aria-label="Explicit board collaborators">
              <h3>Explicit collaborators</h3>
              <p>
                Chapter administrators and authorized team members may also have
                independent access.
              </p>
              <ul className="gt-team-history">
                {members.map((m) => (
                  <li key={m.user_id}>
                    <strong>{m.user.display_name}</strong>
                    <span>
                      {m.user.email} · {m.role}
                    </span>
                    <div className="gt-button-row">
                      <Button
                        variant="ghost"
                        disabled={dirty}
                        onClick={() => start("share", m)}
                      >
                        Change access
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={dirty}
                        onClick={() => start("unshare", m)}
                      >
                        Remove explicit access
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {!members.length && <p>No additional explicit collaborators.</p>}
              <div className="gt-button-row">
                <Button
                  variant="secondary"
                  disabled={memberPage === 1}
                  onClick={() => void loadMembers(memberPage - 1)}
                >
                  Previous collaborators
                </Button>
                <span>{memberPage}</span>
                <Button
                  variant="secondary"
                  disabled={memberPage * 30 >= memberTotal}
                  onClick={() => void loadMembers(memberPage + 1)}
                >
                  Next collaborators
                </Button>
              </div>
            </section>
          )}
          <p className="gt-field-hint" id="board-help">
            Draw shapes, arrows and text. Images, embeds, cloud sharing and file
            imports are disabled. Changes save after a pause; keep this tab open
            until “Saved” appears. Use the page outside the canvas to scroll.
          </p>
          <Suspense fallback={<p role="status">Loading drawing tools…</p>}>
            <Canvas
              key={`${selected}:${canvasKey}`}
              document={opened.record.document}
              readOnly={
                !opened.actions.includes("update") ||
                !!opened.record.deleted_at ||
                conflict ||
                !!mode
              }
              onChange={changeDocument}
              fitRequest={fitRequest}
              onBaseline={(value) => {
                if (!dirtyRef.current && !saving.current) {
                  draftRef.current = value;
                  saved.current = JSON.stringify(value);
                }
              }}
            />
          </Suspense>
          <p className="gt-field-hint" role="status">
            {liveStatus === "live"
              ? "Live canvas updates connected. Changes are still read through the protected API."
              : liveStatus === "denied"
                ? "Live access ended — checking current board access."
                : "Connecting live updates; protected API refresh remains active."}
          </p>
        </section>
      )}
    </div>
  );
}
