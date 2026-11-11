import { useWorkspaceReadiness } from "@/contexts/WorkspaceReadinessContext";
import "./assets";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
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
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <WhiteboardWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function WhiteboardWorkspaceContent() {
  const { isOnline } = useOnlineStatus();
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
  const [listLoading, setListLoading] = useState(true),
    [boardLoading, setBoardLoading] = useState(false),
    [memberLoading, setMemberLoading] = useState(false),
    [listReadAt, setListReadAt] = useState<string>(),
    [boardReadAt, setBoardReadAt] = useState<string>(),
    [offlinePaused, setOfflinePaused] = useState(false);
  const selectedRef = useRef(""),
    openedRef = useRef<OpenBoard>(),
    draftRef = useRef<BoardDocument>(),
    saved = useRef(""),
    dirtyRef = useRef(false),
    saving = useRef(false),
    key = useRef<{ signature: string; key: string }>(),
    mutationKey = useRef<{ signature: string; key: string }>(),
    formHeading = useRef<HTMLHeadingElement>(null),
    locked = useRef(false);
  const mounted = useRef(true),
    canvasEpoch = useRef(0),
    busyRef = useRef(false),
    onlineRef = useRef(isOnline),
    pausedRef = useRef(false),
    saveRequest = useRef<AbortController>(),
    operationRequest = useRef<AbortController>(),
    operationBoard = useRef(""),
    boardRequest = useRef<AbortController>(),
    memberRequest = useRef<AbortController>(),
    listRequest = useRef<AbortController>(),
    capabilityRequest = useRef<AbortController>(),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null);
  onlineRef.current = isOnline;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      saveRequest.current?.abort();
      operationRequest.current?.abort();
      memberRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (!isOnline) {
      pausedRef.current = true;
      setOfflinePaused(true);
    }
  }, [isOnline]);
  const current = (controller: AbortController, id: string) =>
    mounted.current && !controller.signal.aborted && selectedRef.current === id;
  const clearPrivate = useCallback(() => {
    canvasEpoch.current++;
    locked.current = true;
    boardRequest.current?.abort();
    memberRequest.current?.abort();
    saveRequest.current?.abort();
    operationRequest.current?.abort();
    operationRequest.current = undefined;
    saveRequest.current = undefined;
    busyRef.current = false;
    saving.current = false;
    setBusy(false);
    setOpened(undefined);
    openedRef.current = undefined;
    draftRef.current = undefined;
    dirtyRef.current = false;
    saved.current = "";
    key.current = undefined;
    mutationKey.current = undefined;
    setDirty(false);
    setMembers(null);
    setMemberLoading(false);
    setBoardLoading(false);
    setMode(null);
    setName("");
    setEmail("");
    setPassword("");
    setConfirmation("");
    setConflict(false);
  }, []);
  function begin() {
    if (busyRef.current || saving.current || !onlineRef.current) return;
    const controller = new AbortController();
    operationRequest.current = controller;
    operationBoard.current = selectedRef.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    return controller;
  }
  const ownsOperation = (controller: AbortController) =>
    operationRequest.current === controller &&
    current(controller, operationBoard.current);
  function finish(controller: AbortController) {
    if (mounted.current && operationRequest.current === controller) {
      operationRequest.current = undefined;
      busyRef.current = false;
      setBusy(false);
    }
  }
  openedRef.current = opened;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const [fitRequest, setFitRequest] = useState(0);
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  useWorkspaceReadiness(listLoading || (!capabilities && !loadErrors.capabilities));
  const [capabilityRetry, setCapabilityRetry] = useState(0);
  const liveStatus = useScopedRealtime(
    selected ? { kind: "whiteboard", id: selected } : null,
    () => {
      if (!busyRef.current && !saving.current) setTick((v) => v + 1);
    },
    () => {
      clearPrivate();
      setLoadErrors((v) => ({
        ...v,
        board: "Board access changed. Retry to check your current scope.",
      }));
    },
  );
  useEffect(() => {
    const controller = new AbortController();
    listRequest.current = controller;
    setListLoading(true);
    api<Listing>(
      `/admin/whiteboards?${new URLSearchParams({ q: query, page: String(page), archived: archived ? "1" : "0" })}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        setListing(value);
        setListReadAt(new Date().toISOString());
        setLoadErrors((v) => ({ ...v, directory: "" }));
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setLoadErrors((v) => ({ ...v, directory: e.message }));
          if (e instanceof ApiFailure && [401, 403].includes(e.status)) {
            clearPrivate();
            setListing(undefined);
            setCapabilities(undefined);
            capabilityRequest.current?.abort();
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setListLoading(false);
      });
    return () => controller.abort();
  }, [query, page, archived, tick, clearPrivate]);
  useEffect(() => {
    setListing(undefined);
    setLoadErrors((v) => ({ ...v, directory: "" }));
  }, [query, page, archived]);
  useEffect(() => {
    const controller = new AbortController();
    capabilityRequest.current = controller;
    api<typeof capabilities>("/admin/whiteboards/capabilities", {
      signal: controller.signal,
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setCapabilities(value);
        setLoadErrors((v) => ({ ...v, capabilities: "" }));
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setCapabilities(undefined);
          setLoadErrors((v) => ({ ...v, capabilities: e.message }));
        }
      });
    return () => controller.abort();
  }, [capabilityRetry]);
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (
          !document.hidden &&
          navigator.onLine &&
          !busyRef.current &&
          !saving.current
        )
          setTick((v) => v + 1);
      },
      liveStatus === "live" ? 30000 : 5000,
    );
    return () => clearInterval(timer);
  }, [liveStatus]);
  useEffect(() => {
    const refresh = () => {
      if (!busyRef.current && !saving.current) setTick((v) => v + 1);
    };
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
    canvasEpoch.current++;
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
    boardRequest.current = controller;
    setBoardLoading(true);
    api<OpenBoard>(`/admin/whiteboards/${selected}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (controller.signal.aborted) return;
        setLoadErrors((v) => ({ ...v, board: "" }));
        setBoardReadAt(new Date().toISOString());
        if (saving.current) return;
        if (!openedRef.current) {
          applyBoard(value);
          return;
        }
        const latest = { ...openedRef.current, actions: value.actions };
        openedRef.current = latest;
        setOpened(latest);
        if (!value.actions.includes("manage")) {
          memberRequest.current?.abort();
          setMembers(null);
          setMemberLoading(false);
        }
        locked.current =
          !value.actions.includes("update") ||
          !!value.record.deleted_at ||
          conflictRef.current;
        if (!value.actions.includes("update") && dirtyRef.current)
          setSaveState(
            "Editing permission changed — your unsaved copy remains in this tab",
          );
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
          clearPrivate();
        }
        setLoadErrors((v) => ({ ...v, board: e.message }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setBoardLoading(false);
      });
    return () => controller.abort();
  }, [selected, tick, clearPrivate]);
  function changeDocument(document: BoardDocument) {
    if (
      !mounted.current ||
      locked.current ||
      busyRef.current ||
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
    setRevision((v) => v + 1);
  }
  const save = useCallback(
    async (manual = false) => {
      const board = openedRef.current;
      if (
        !board ||
        !draftRef.current ||
        !dirtyRef.current ||
        saving.current ||
        busyRef.current ||
        boardLoading ||
        !!loadErrors.board ||
        !onlineRef.current ||
        (pausedRef.current && !manual) ||
        locked.current
      )
        return;
      const id = board.record.id,
        document = draftRef.current,
        encoded = JSON.stringify(document);
      const validation = boardDocument.safeParse(JSON.parse(encoded));
      if (!validation.success) {
        setError(
          validation.error.issues[0]?.message ||
            "This drawing cannot be saved.",
        );
        setSaveState("Not saved — correct the drawing before retrying");
        return;
      }
      saving.current = true;
      if (manual) {
        pausedRef.current = false;
        setOfflinePaused(false);
      }
      const controller = new AbortController();
      saveRequest.current = controller;
      setSaveState("Saving…");
      const signature =
        id + board.record.version + board.record.updated_at + encoded;
      if (key.current?.signature !== signature)
        key.current = { signature, key: crypto.randomUUID() };
      const requestKey = key.current.key;
      try {
        const result = await api<{ record: Board }>(
          `/admin/whiteboards/${id}`,
          {
            method: "POST",
            protected: true,
            idempotencyKey: requestKey,
            signal: controller.signal,
            body: {
              action: "save",
              version: board.record.version,
              updatedAt: board.record.updated_at,
              document,
            },
          },
        );
        if (!current(controller, id) || saveRequest.current !== controller)
          return;
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
        if (key.current?.key === requestKey) key.current = undefined;
        if (dirtyRef.current) setRevision((v) => v + 1);
      } catch (e) {
        if (!current(controller, id) || saveRequest.current !== controller)
          return;
        setError(e instanceof Error ? e.message : "The board could not save.");
        setSaveState("Not saved — your changes remain in this tab");
        if (e instanceof ApiFailure && e.status === 409) {
          setConflict(true);
          locked.current = true;
        }
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
          clearPrivate();
        }
      } finally {
        if (mounted.current && saveRequest.current === controller) {
          saving.current = false;
          saveRequest.current = undefined;
        }
      }
    },
    [boardLoading, loadErrors.board, clearPrivate],
  );
  useEffect(() => {
    if (
      !dirty ||
      conflict ||
      !isOnline ||
      offlinePaused ||
      !opened?.actions.includes("update")
    )
      return;
    const timer = setTimeout(() => void save(), 1200);
    return () => clearTimeout(timer);
  }, [
    revision,
    dirty,
    conflict,
    isOnline,
    offlinePaused,
    opened?.actions,
    boardLoading,
    loadErrors.board,
    save,
  ]);
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
    if (busyRef.current && !committed) return;
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
    canvasEpoch.current++;
    setSelected(id);
    boardRequest.current?.abort();
    memberRequest.current?.abort();
    openedRef.current = undefined;
    setOpened(undefined);
    draftRef.current = undefined;
    saved.current = "";
    dirtyRef.current = false;
    locked.current = false;
    setDirty(false);
    setConflict(false);
    setMembers(null);
    setMemberLoading(false);
    setBoardReadAt(undefined);
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
    if (busyRef.current || saving.current) return;
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
    if (
      !id ||
      !openedRef.current?.actions.includes("manage") ||
      !onlineRef.current
    )
      return;
    memberRequest.current?.abort();
    const controller = new AbortController();
    memberRequest.current = controller;
    setMemberLoading(true);
    try {
      const r = await api<{ items: Collaborator[]; total: number }>(
        `/admin/whiteboards/${id}/collaborators?page=${next}`,
        { signal: controller.signal },
      );
      if (current(controller, id) && memberRequest.current === controller) {
        setMembers(r.items);
        setMemberTotal(r.total);
        setMemberPage(next);
        setLoadErrors((v) => ({ ...v, members: "" }));
      }
    } catch (e) {
      if (current(controller, id) && memberRequest.current === controller) {
        setLoadErrors((v) => ({
          ...v,
          members:
            e instanceof Error ? e.message : "Collaborators could not load.",
        }));
        if (e instanceof ApiFailure && [401, 403, 404].includes(e.status))
          setMembers(null);
      }
    } finally {
      if (current(controller, id) && memberRequest.current === controller)
        setMemberLoading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!mode || !modeAllowed || (mode !== "create" && conflict)) return;
    if (
      ["archive", "restore"].includes(mode) &&
      confirmation !== openedRef.current?.record.name
    )
      return;
    if (["share", "unshare"].includes(mode) && !password) return;
    if (dirtyRef.current) {
      setError(
        "Save or resolve your drawing changes before submitting board details.",
      );
      return;
    }
    const controller = begin();
    if (!controller) return;
    const secret = password;
    let committed = false;
    setPassword("");
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
                  ? { email, role, currentPassword: secret }
                  : { confirmation }),
            };
      const path =
          "/admin/whiteboards" + (mode === "create" ? "" : "/" + selected),
        signature =
          path +
          JSON.stringify(body, (field, value) =>
            field === "currentPassword" ? undefined : value,
          );
      if (mutationKey.current?.signature !== signature)
        mutationKey.current = { signature, key: crypto.randomUUID() };
      const result = await api<{ record: Board }>(path, {
        method: "POST",
        protected: true,
        idempotencyKey: mutationKey.current.key,
        signal: controller.signal,
        body,
      });
      if (!ownsOperation(controller)) return;
      committed = true;
      mutationKey.current = undefined;
      setMode(null);
      setPassword("");
      setConfirmation("");
      setTick((v) => v + 1);
      if (mode === "create") {
        choose(result.record.id, true);
      } else if (mode === "archive") {
        choose("", true);
      } else {
        const value = await api<OpenBoard>("/admin/whiteboards/" + selected, {
          signal: controller.signal,
        });
        if (!ownsOperation(controller)) return;
        applyBoard(value);
        if (members) await loadMembers(memberPage);
      }
      setNotice("Board changes saved.");
    } catch (e) {
      if (!ownsOperation(controller)) return;
      setError(
        committed
          ? "Board changes were saved, but refreshed details could not load. Check the current board before continuing."
          : e instanceof Error
            ? e.message
            : "Board changes could not save.",
      );
      if (committed)
        setLoadErrors((v) => ({
          ...v,
          board: "Refresh required after the saved change.",
        }));
      if (e instanceof ApiFailure && e.status === 409) {
        setConflict(true);
        locked.current = true;
      }
    } finally {
      finish(controller);
    }
  }
  async function reload() {
    if (busyRef.current || saving.current || !selectedRef.current) return;
    if (
      (dirtyRef.current || modeRef.current) &&
      !confirm(
        "Replace your unsaved drawing or staged board details with the saved server version? Download your copy or note your details first.",
      )
    )
      return;
    const controller = begin();
    if (!controller) return;
    try {
      const value = await api<OpenBoard>("/admin/whiteboards/" + selected, {
        signal: controller.signal,
      });
      if (ownsOperation(controller)) {
        applyBoard(value);
        setMode(null);
        setPassword("");
        setConfirmation("");
      }
      if (ownsOperation(controller)) setError("");
    } catch (e) {
      if (!ownsOperation(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status))
        clearPrivate();
      setError(
        e instanceof Error ? e.message : "This action could not be completed.",
      );
    } finally {
      finish(controller);
    }
  }
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const modeAllowed =
    mode === "create"
      ? !!capabilities &&
        (team
          ? capabilities.teams.some((t) => t.id === team)
          : capabilities.globalCreate)
      : !!opened &&
        !boardLoading &&
        !loadErrors.board &&
        opened.actions.includes(
          mode === "rename"
            ? "update"
            : mode === "archive"
              ? "delete"
              : mode === "restore"
                ? "restore"
                : "manage",
        );
  const renderedCanvasEpoch = canvasEpoch.current;
  async function exportSaved() {
    const controller = begin();
    if (!controller) return;
    try {
      const r = await api<{ name: string; document: unknown }>(
        `/admin/whiteboards/${selected}/export`,
        { signal: controller.signal },
      );
      if (!ownsOperation(controller)) return;
      downloadBoard(r.name, r.document);
      setNotice("Saved board export prepared. Check your downloads.");
    } catch (e) {
      if (ownsOperation(controller))
        setError(
          e instanceof Error ? e.message : "The saved board could not export.",
        );
    } finally {
      finish(controller);
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
        <p
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className="gt-form-error"
        >
          {error}{" "}
          <button
            disabled={busy || !isOnline}
            onClick={() => setTick((v) => v + 1)}
          >
            Check again
          </button>
        </p>
      )}
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {(!isOnline || offlinePaused) && (
        <p role="status" className="gt-data-note">
          {!isOnline
            ? "You are offline."
            : "Autosave remains paused after the connection interruption."}{" "}
          Unsaved drawing changes stay only in this open tab. Reconnect and
          choose Save now to resume; nothing submits automatically on reconnect.
        </p>
      )}
      {((opened && (loadErrors.board || !isOnline)) ||
        (!selected && listing && (loadErrors.directory || !isOnline))) && (
        <p role="status" className="gt-data-note">
          {selected ? "Board" : "Directory"} may be out of date. Last loaded{" "}
          {((selected ? boardReadAt : listReadAt) &&
            new Date(
              (selected ? boardReadAt : listReadAt)!,
            ).toLocaleString()) ||
            "earlier"}
          . Check the current saved version before acting.
        </p>
      )}
      {Object.entries(loadErrors)
        .filter(
          ([scope, message]) => message && (scope !== "board" || selected),
        )
        .map(([scope, message]) => (
          <p key={scope} className="gt-form-error" role="alert">
            {scope === "directory"
              ? "Board directory"
              : scope === "members"
                ? "Collaborators"
                : scope === "capabilities"
                  ? "Board permissions"
                  : "Board details"}
            : {message}{" "}
            <button
              onClick={() => {
                if (scope === "members") void loadMembers(memberPage);
                else setTick((v) => v + 1);
                if (scope === "capabilities") setCapabilityRetry((v) => v + 1);
                document.getElementById("workspace-content")?.focus();
              }}
              disabled={busy || !isOnline}
            >
              Retry{" "}
              {scope === "board"
                ? "this board"
                : scope === "members"
                  ? "collaborators"
                  : scope === "capabilities"
                    ? "board permissions"
                    : "board directory"}
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
          {!modeAllowed && (
            <p role="alert" className="gt-form-error">
              This action is unavailable with the current scope, permission or
              read state. Your fields are preserved.
            </p>
          )}
          {(mode === "create" || mode === "rename") && (
            <Field label="Board name" required>
              <input
                required
                minLength={2}
                maxLength={100}
                disabled={busy}
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
                disabled={busy}
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
                  disabled={busy}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {mode === "share" && (
                <Field label="Board access">
                  <select
                    disabled={busy}
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
                  disabled={busy}
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
                disabled={busy}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
          )}
          <div className="gt-button-row">
            <Button
              disabled={
                busy ||
                !isOnline ||
                !modeAllowed ||
                (mode !== "create" && conflict) ||
                (["archive", "restore"].includes(mode) &&
                  confirmation !== opened?.record.name) ||
                (["share", "unshare"].includes(mode) && !password)
              }
            >
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
          {(query || archived || page > 1) && (
            <Button
              variant="ghost"
              onClick={() => {
                setQuery("");
                setArchived(false);
                setPage(1);
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Reset board filters
            </Button>
          )}
          {!listing && listLoading ? (
            <div role="status" aria-label="Loading authorized boards">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading authorized boards…</span>
            </div>
          ) : !listing && loadErrors.directory ? (
            <p>Board directory is unavailable. Retry to check your access.</p>
          ) : !listing ? null : !listing.items.length ? (
            <EmptyState headingLevel={2} title="No boards in this view">
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
                  <Button
                    variant="secondary"
                    aria-label={`Open board ${b.name}`}
                    disabled={busy}
                    onClick={() => choose(b.id)}
                  >
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
            <div role="status" aria-label="Loading private canvas">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading the private canvas…</span>
            </div>
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
              disabled={
                !dirty ||
                busy ||
                saveState === "Saving…" ||
                !isOnline ||
                conflict ||
                !opened.actions.includes("update") ||
                !!loadErrors.board ||
                boardLoading
              }
              onClick={() => void save(true)}
            >
              Save now
            </Button>
            <Button
              variant="secondary"
              onClick={() => setFitRequest((v) => v + 1)}
            >
              Fit drawing
            </Button>
            {opened.actions.includes("export") && (
              <Button
                variant="secondary"
                disabled={busy || !isOnline}
                onClick={() => void exportSaved()}
              >
                Export saved board
              </Button>
            )}
            {dirty && opened.actions.includes("export") && (
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
                disabled={dirty || busy || !!mode || saveState === "Saving…"}
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
                    members || memberLoading
                      ? (memberRequest.current?.abort(),
                        setMemberLoading(false),
                        setMembers(null))
                      : void loadMembers()
                  }
                  disabled={busy}
                >
                  Board access
                </Button>
                <Button
                  variant="ghost"
                  disabled={dirty || busy || !!mode || saveState === "Saving…"}
                  onClick={() => start("share")}
                >
                  Add collaborator
                </Button>
              </>
            )}
            {opened.actions.includes("delete") && !opened.record.deleted_at && (
              <Button
                variant="ghost"
                disabled={dirty || busy || !!mode || saveState === "Saving…"}
                onClick={() => start("archive")}
              >
                Archive
              </Button>
            )}
            {opened.actions.includes("restore") && opened.record.deleted_at && (
              <Button
                variant="ghost"
                disabled={busy || !!mode}
                onClick={() => start("restore")}
              >
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
              <Button
                variant="secondary"
                disabled={busy || !isOnline}
                onClick={() => void reload()}
              >
                Load saved server version
              </Button>
            </div>
          )}
          {memberLoading && (
            <div role="status" aria-label="Loading board collaborators">
              <div className="gt-skeleton gt-loading-heading" />
              <span className="sr-only">Loading board collaborators…</span>
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
                        disabled={dirty || busy || !!mode}
                        onClick={() => start("share", m)}
                      >
                        Change access
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={dirty || busy || !!mode}
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
                  disabled={
                    memberPage === 1 || memberLoading || busy || !isOnline
                  }
                  onClick={() => void loadMembers(memberPage - 1)}
                >
                  Previous collaborators
                </Button>
                <span>{memberPage}</span>
                <Button
                  variant="secondary"
                  disabled={
                    memberPage * 30 >= memberTotal ||
                    memberLoading ||
                    busy ||
                    !isOnline
                  }
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
                busy ||
                !!mode
              }
              onChange={(document) => {
                if (
                  selectedRef.current === selected &&
                  canvasEpoch.current === renderedCanvasEpoch
                )
                  changeDocument(document);
              }}
              fitRequest={fitRequest}
              onBaseline={(value) => {
                if (
                  mounted.current &&
                  selectedRef.current === selected &&
                  canvasEpoch.current === renderedCanvasEpoch &&
                  !dirtyRef.current &&
                  !saving.current
                ) {
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
