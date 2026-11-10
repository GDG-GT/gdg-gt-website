import { useEffect, useRef, useState, type FormEvent } from "react";
import { Folder, FileImage, Star, Upload } from "lucide-react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useLiveSearch } from "@/hooks/useLiveSearch";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import {
  humanBytes,
  type MediaFile,
  type MediaFolder,
  type MediaListing,
} from "./types";
import MediaUpload from "./MediaUpload";
import MediaFileEditor from "./MediaFileEditor";
import DestinationPicker from "./DestinationPicker";
import ScrollableTable from "../ScrollableTable";
type FolderMode =
  | { action: "create"; folder?: never }
  | { action: "update" | "move" | "delete"; folder: MediaFolder };
function FolderEditor({
  mode,
  listing,
  teamId,
  parentId,
  onSaved,
  onClose,
  readUnavailable = false,
}: {
  mode: FolderMode;
  listing: MediaListing;
  teamId: string | null;
  parentId: string | null;
  onSaved: () => void;
  onClose: () => void;
  readUnavailable?: boolean;
}) {
  const [name, setName] = useState(mode.folder?.name || ""),
    [description, setDescription] = useState(mode.folder?.description || ""),
    [destination, setDestination] = useState<{
      teamId: string | null;
      folderId: string | null;
    }>(),
    [error, setError] = useState("");
  const safety = useNavigationSafety(),
    heading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null);
  const { busy, begin, current, finish, pending } = usePrivateMutation(
    `${mode.action}:${mode.folder?.id || "new"}:${teamId}:${parentId}`,
  );
  const { isOnline } = useOnlineStatus();
  const canChange =
    !readUnavailable &&
    (teamId
      ? !!listing.teams.find((team) => team.id === teamId)?.canManageFolders
      : !!listing.chapterFolders);
  const dirty =
    name !== (mode.folder?.name || "") ||
    description !== (mode.folder?.description || "") ||
    !!destination;
  useDraftGuard(dirty, { busy, label: "Media folder changes" });
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canChange || (mode.action === "move" && !destination)) return;
    const controller = begin();
    if (!controller) return;
    setError("");
    const f = mode.folder;
    const body =
      mode.action === "create"
        ? { name, description, teamId, parentId }
        : mode.action === "update"
          ? {
              action: "update",
              name,
              description,
              revision: mode.folder.revision,
            }
          : mode.action === "move"
            ? {
                action: "move",
                parentId: destination?.folderId ?? null,
                revision: mode.folder.revision,
              }
            : { revision: mode.folder.revision };
    try {
      await api("/admin/media/folders" + (f ? "/" + f.id : ""), {
        method:
          mode.action === "create"
            ? "POST"
            : mode.action === "delete"
              ? "DELETE"
              : "PATCH",
        body,
        signal: controller.signal,
      });
      if (current(controller)) onSaved();
    } catch (e) {
      if (current(controller)) setError((e as Error).message);
    } finally {
      finish(controller);
    }
  };
  return (
    <form
      className="gt-panel gt-form"
      onSubmit={submit}
      aria-label="Media folder changes"
    >
      <h2 ref={heading} tabIndex={-1}>
        {
          {
            create: "Create a folder",
            update: "Edit folder",
            move: "Move folder",
            delete: "Archive empty folder",
          }[mode.action]
        }
      </h2>
      {mode.folder && (
        <p>
          {mode.folder.name} · revision {mode.folder.revision}
        </p>
      )}
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className="gt-form-error"
        >
          {error}
        </p>
      )}
      {["create", "update"].includes(mode.action) && (
        <>
          <Field label="Folder name" required>
            <input
              required
              maxLength={100}
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Description">
            <textarea
              maxLength={1000}
              rows={2}
              disabled={busy}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </>
      )}
      {mode.action === "move" && (
        <>
          <DestinationPicker
            teams={listing.teams}
            chapter={listing.chapterCreate}
            initialTeam={teamId}
            fixedTeam
            disabled={busy}
            onChange={setDestination}
          />
          <p className="gt-helper">
            Folders remain in their current scope. Cycles and paths deeper than
            eight folders are rejected.
          </p>
        </>
      )}
      {mode.action === "delete" && (
        <p>
          Archive this empty folder? Move its child folders and retained files
          first. This does not delete file bytes.
        </p>
      )}
      <div className="gt-inline-actions">
        <Button
          disabled={
            busy ||
            !isOnline ||
            !canChange ||
            (mode.action === "move" && !destination)
          }
        >
          {busy
            ? "Saving…"
            : mode.action === "delete"
              ? "Confirm empty-folder archive"
              : "Save folder"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() =>
            !pending.current &&
            (dirty && safety ? safety.request(onClose) : onClose())
          }
        >
          Cancel folder changes
        </Button>
      </div>
    </form>
  );
}
export default function MediaWorkspace({
  gallery = false,
}: {
  gallery?: boolean;
}) {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <MediaWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}:${gallery}`}
      gallery={gallery}
    />
  );
}
function MediaWorkspaceContent({ gallery = false }: { gallery?: boolean }) {
  const { isOnline } = useOnlineStatus();
  const [list, setList] = useState<MediaListing>(),
    [loading, setLoading] = useState(true),
    [listError, setListError] = useState(""),
    [loadedAt, setLoadedAt] = useState<string>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [team, setTeam] = useState(""),
    [folder, setFolder] = useState<string | null>(null),
    [state, setState] = useState("current"),
    [type, setType] = useState(gallery ? "image" : ""),
    [starred, setStarred] = useState(false),
    [q, setQ] = useState(""),
    [queryDraft, setQueryDraft] = useState(""),
    [tag, setTag] = useState(""),
    [tagDraft, setTagDraft] = useState(""),
    [page, setPage] = useState(1),
    [cursors, setCursors] = useState<(string | undefined)[]>([undefined]),
    [tick, setTick] = useState(0),
    [selected, setSelected] = useState<MediaFile[]>([]),
    [editor, setEditor] = useState<MediaFile>(),
    [upload, setUpload] = useState(false),
    [folderMode, setFolderMode] = useState<FolderMode>(),
    [bulk, setBulk] = useState(""),
    [tagMode, setTagMode] = useState("add"),
    [bulkTags, setBulkTags] = useState(""),
    [destination, setDestination] = useState<{
      teamId: string | null;
      folderId: string | null;
    }>();
  const safety = useNavigationSafety(),
    readKey = useRef(""),
    epoch = useRef(0),
    attempt = useRef<{ signature: string; key: string }>();
  const {
    busy,
    begin,
    current,
    finish,
    pending: mutationPending,
  } = usePrivateMutation(`${gallery}:${team}:${folder}:${state}:${page}`);
  const noticeFocus = useRef<HTMLParagraphElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    bulkHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (bulk) bulkHeading.current?.focus();
  }, [bulk]);
  useDraftGuard(!!bulk, { busy, label: "Selected media operation" });
  const reset = () => {
    setEditor(undefined);
    setUpload(false);
    setFolderMode(undefined);
    setBulk("");
    setTagMode("add");
    setBulkTags("");
    setDestination(undefined);
    attempt.current = undefined;
  };
  const leave = (action: () => void) => {
    if (mutationPending.current) return;
    const next = () => {
      reset();
      action();
    };
    if (safety) safety.request(next);
    else next();
  };
  const change = (action: () => void) =>
    leave(() => {
      setSelected([]);
      setPage(1);
      setCursors([undefined]);
      action();
    });
  const refresh = () => setTick((v) => v + 1);
  useLiveSearch(JSON.stringify([queryDraft, tagDraft]), JSON.stringify([q, tag]), () => {
    change(() => { setQ(queryDraft); setTag(tagDraft); });
  }, !busy && isOnline && !editor && !folderMode && !upload && !bulk);
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
    };
    const clear = () => {
      invalidate();
      setList(undefined);
      setSelected([]);
      reset();
      setNotice("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      current = ++epoch.current;
    setLoading(true);
    setListError("");
    const params = new URLSearchParams({
      view: gallery ? "gallery" : "library",
      ...(cursors[page - 1] ? { cursor: cursors[page - 1] } : {}),
      state,
      ...(team ? { team } : {}),
      ...(folder ? { folder } : team ? { folder: "root" } : {}),
      ...(type ? { type } : {}),
      ...(q ? { q } : {}),
      ...(tag ? { tag } : {}),
      ...(starred ? { starred: "true" } : {}),
    });
    const key = params.toString();
    if (readKey.current !== key) {
      setList(undefined);
      setLoadedAt(undefined);
      readKey.current = key;
    }
    api<MediaListing>("/admin/media?" + params, { signal: controller.signal })
      .then((v) => {
        if (current === epoch.current && !controller.signal.aborted) {
          setList(v);
          setLoadedAt(new Date().toISOString());
        }
      })
      .catch((e: Error) => {
        if (current === epoch.current && !controller.signal.aborted) {
          setListError(e.message);
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            setList(undefined);
            reset();
            setSelected([]);
          }
        }
      })
      .finally(() => {
        if (current === epoch.current && !controller.signal.aborted)
          setLoading(false);
      });
    return () => controller.abort();
  }, [team, folder, page, cursors, state, q, tag, type, starred, tick, gallery]);
  const pending = list?.items.some(
    (f) =>
      ["pending", "queued"].includes(f.scanState) ||
      f.publicationState === "queued",
  );
  useEffect(() => {
    if (!pending || editor || upload || folderMode || bulk) return;
    const id = setInterval(() => {
      if (!document.hidden && navigator.onLine) refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [pending, editor, upload, folderMode, bulk]);
  const scope =
      list?.folder?.teamId ?? (team === "chapter" ? null : team || null),
    explicitScope = !!team || !!folder,
    canCreate =
      !!list &&
      explicitScope &&
      (scope
        ? !!list.teams.find((t) => t.id === scope)?.canCreate
        : list.chapterCreate),
    canManageFolders =
      !!list &&
      explicitScope &&
      (scope
        ? !!list.teams.find((t) => t.id === scope)?.canManageFolders
        : list.chapterFolders),
    allUpdate =
      selected.length > 0 &&
      selected.every((f) => {
        const current = list?.items.find((item) => item.id === f.id);
        return (
          current?.revision === f.revision &&
          current.actions.includes("update") &&
          !current.purgedAt
        );
      }),
    allDelete =
      selected.length > 0 &&
      selected.every((f) => {
        const current = list?.items.find((item) => item.id === f.id);
        return (
          current?.revision === f.revision &&
          current.actions.includes("delete") &&
          !current.purgedAt
        );
      }),
    movable = selected.every(
      (f) =>
        !f.public && !f.inUse && !["pending", "queued"].includes(f.scanState),
    );
  const saved = (message: string) => {
    reset();
    setSelected([]);
    setNotice(message);
    refresh();
  };
  const applyBulk = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !selected.length ||
      !bulk ||
      loading ||
      listError ||
      (bulk === "move" && !destination)
    )
      return;
    if (
      (bulk === "archive" ? !allDelete || !movable : !allUpdate) ||
      (bulk === "move" && !movable)
    )
      return;
    const controller = begin();
    if (!controller) return;
    const body = {
        action: bulk === "unstar" ? "star" : bulk,
        files: selected.map((f) => ({ id: f.id, revision: f.revision })),
        document:
          bulk === "move"
            ? destination
            : bulk === "tags"
              ? {
                  mode: tagMode,
                  tags: bulkTags
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean),
                }
              : ["star", "unstar"].includes(bulk)
                ? { starred: bulk === "star" }
                : {},
      },
      signature = JSON.stringify(body);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    setError("");
    try {
      await api("/admin/media/files", {
        method: "POST",
        body,
        idempotencyKey: attempt.current.key,
        signal: controller.signal,
      });
      if (current(controller))
        saved(
          "Media change recorded. No original file bytes were permanently deleted.",
        );
    } catch (e) {
      if (current(controller)) setError((e as Error).message);
    } finally {
      finish(controller);
    }
  };
  return (
    <div className="gt-admin-page gt-media-workspace">
      <header className="gt-admin-page-heading">
        <div>
          <h1>{gallery ? "Gallery curation" : "Private media library"}</h1>
          <p>
            {gallery
              ? "Review image descriptions, event associations and responsive public versions."
              : "Organize chapter files. Original uploads stay private; scanning and public approval are separate."}
          </p>
        </div>
        <div className="gt-toolbar">
          <Button
            variant="secondary"
            disabled={loading || busy}
            onClick={() => leave(refresh)}
          >
            Refresh {pending ? "scan / publication status" : "library"}
          </Button>
          <Button
            disabled={!canCreate || state === "trash" || loading || busy}
            onClick={() => leave(() => setUpload(true))}
          >
            <Upload size={16} /> Upload privately
          </Button>
        </div>
      </header>
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status" className="gt-notice">
          {notice}
        </p>
      )}
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className="gt-form-error"
        >
          {error}
        </p>
      )}
      {listError && (
        <p role="alert" className="gt-form-error">
          Media inventory: {listError}{" "}
          <Button
            variant="ghost"
            disabled={busy || !isOnline}
            onClick={() => {
              refresh();
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry list
          </Button>
        </p>
      )}
      {(!isOnline || (list && listError)) && (
        <p role="status" className="gt-data-note">
          {!isOnline
            ? "You are offline. Nothing submits automatically on reconnect."
            : "The inventory may be out of date."}{" "}
          {loadedAt
            ? `Last loaded ${new Date(loadedAt).toLocaleString()}.`
            : "Refresh before continuing."}
        </p>
      )}
      <section className="gt-media-filters" aria-label="Media filters">
        <Field label="Library scope">
          <select
            value={team}
            disabled={busy}
            onChange={(e) =>
              change(() => {
                setTeam(e.target.value);
                setFolder(null);
              })
            }
          >
            <option value="">All permitted scopes</option>
            {list?.chapterCreate && (
              <option value="chapter">Chapter library</option>
            )}
            {list?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        {!gallery && (
          <Field label="File type">
            <select
              value={type}
              disabled={busy}
              onChange={(e) => change(() => setType(e.target.value))}
            >
              <option value="">All types</option>
              {["image", "video", "audio", "document", "archive", "other"].map(
                (v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </Field>
        )}
        <Field label="State">
          <select
            value={state}
            disabled={busy}
            onChange={(e) => change(() => setState(e.target.value))}
          >
            <option value="current">Current files</option>
            <option value="trash">Archived files</option>
          </select>
        </Field>
        <label className="gt-check">
          <input
            type="checkbox"
            checked={starred}
            disabled={busy}
            onChange={(e) => change(() => setStarred(e.target.checked))}
          />
          Starred only
        </label>
        <form
          className="gt-media-search"
          onSubmit={(e) => {
            e.preventDefault();
            change(() => {
              setQ(queryDraft);
              setTag(tagDraft);
            });
          }}
        >
          <SearchBox
            label="Search media names and descriptions"
            placeholder="Find a file…"
            value={queryDraft}
            onChange={setQueryDraft}
          />
          <Field label="Tag">
            <input
              value={tagDraft}
              maxLength={40}
              onChange={(e) => setTagDraft(e.target.value)}
            />
          </Field>
          <Button variant="secondary" disabled={busy}>
            Search
          </Button>
        </form>
      </section>
      {(team ||
        folder ||
        q ||
        tag ||
        starred ||
        type !== (gallery ? "image" : "") ||
        state !== "current" ||
        page > 1) && (
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            change(() => {
              setTeam("");
              setFolder(null);
              setQ("");
              setQueryDraft("");
              setTag("");
              setTagDraft("");
              setStarred(false);
              setType(gallery ? "image" : "");
              setState("current");
            })
          }
        >
          Reset media filters
        </Button>
      )}
      {loading && !list && (
        <div role="status" aria-label="Loading authorized media">
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading authorized media…</span>
        </div>
      )}
      {!loading && !list && listError && (
        <p>
          Media inventory is unavailable. Retry to check your permitted scopes.
        </p>
      )}
      {!explicitScope && (
        <p className="gt-helper">
          Choose a library scope to upload files or manage folders. This view
          includes every file you are permitted to read.
        </p>
      )}
      {upload && (
        <MediaUpload
          imagesOnly={gallery}
          key={`${scope}/${folder}`}
          teamId={scope}
          folderId={folder}
          onSaved={() => {
            setNotice(
              "Private upload queued. Checks must finish before download or public approval.",
            );
            refresh();
          }}
          onClose={() => setUpload(false)}
        />
      )}
      {folderMode && list && (
        <FolderEditor
          key={`${folderMode.action}/${folderMode.folder?.id || "new"}`}
          mode={folderMode}
          listing={list}
          teamId={folderMode.folder?.teamId ?? scope}
          parentId={folder}
          readUnavailable={loading || !!listError}
          onSaved={() => saved("Folder change recorded.")}
          onClose={() => setFolderMode(undefined)}
        />
      )}
      {editor && (
        <MediaFileEditor
          key={editor.id}
          file={
            list?.items.find((file) => file.id === editor.id) || {
              ...editor,
              actions: [],
              canPublish: false,
            }
          }
          readUnavailable={
            loading ||
            !!listError ||
            !list?.items.some((file) => file.id === editor.id)
          }
          onSaved={() =>
            saved(
              "Media metadata or publication change recorded. Refresh the list to review worker status.",
            )
          }
          onClose={() => setEditor(undefined)}
        />
      )}
      {list && (
        <>
          <nav
            className="gt-media-path gt-inline-actions"
            aria-label="Media folder navigation"
          >
            <Folder size={18} />
            <strong>
              {list.folder?.name ||
                (explicitScope ? "Scope root" : "All files")}
            </strong>
            {folder && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  change(() => setFolder(list.folder?.parentId || null))
                }
              >
                ↑ Parent folder
              </Button>
            )}
            {explicitScope && state === "current" && (
              <Button
                variant="secondary"
                disabled={!canManageFolders || busy}
                onClick={() => leave(() => setFolderMode({ action: "create" }))}
              >
                New folder
              </Button>
            )}
          </nav>
          {list.folders.length > 0 && state === "current" && (
            <ul className="gt-media-folders">
              {list.folders.map((f) => (
                <li key={f.id}>
                  <Button
                    variant="ghost"
                    disabled={loading || busy}
                    onClick={() =>
                      change(() => {
                        setTeam(f.teamId || "chapter");
                        setFolder(f.id);
                      })
                    }
                  >
                    <Folder size={17} /> {f.name}
                  </Button>
                  <details>
                    <summary>
                      Folder options
                      <span className="sr-only"> for {f.name}</span>
                    </summary>
                    <div className="gt-inline-actions">
                      {(["update", "move", "delete"] as const).map((action) => (
                        <Button
                          key={action}
                          variant="ghost"
                          disabled={busy}
                          onClick={() =>
                            leave(() => setFolderMode({ action, folder: f }))
                          }
                        >
                          {action === "update"
                            ? "Rename"
                            : action === "delete"
                              ? "Archive empty folder"
                              : "Move"}
                        </Button>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <section
              className="gt-media-selection"
              aria-label="Selected media actions"
            >
              <p>
                <strong>{selected.length} selected</strong> · operations apply
                to these revisions only
              </p>
              <div className="gt-inline-actions">
                {[
                  ...(allUpdate && state === "current"
                    ? ["star", "unstar", "tags", ...(movable ? ["move"] : [])]
                    : []),
                  ...(allDelete && state === "current" && movable
                    ? ["archive"]
                    : []),
                  ...(allUpdate && state === "trash" ? ["restore"] : []),
                ].map((action) => (
                  <Button
                    key={action}
                    variant="secondary"
                    disabled={busy}
                    onClick={() => leave(() => setBulk(action))}
                  >
                    {
                      {
                        star: "Star",
                        unstar: "Unstar",
                        tags: "Edit tags",
                        move: "Move",
                        archive: "Archive",
                        restore: "Restore",
                      }[action]
                    }
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => leave(() => setSelected([]))}
                >
                  Clear selection
                </Button>
              </div>
              {bulk && (
                <form className="gt-form" onSubmit={applyBulk}>
                  <h2 ref={bulkHeading} tabIndex={-1}>
                    Confirm {bulk} · {selected.length} file
                    {selected.length === 1 ? "" : "s"}
                  </h2>
                  {bulk === "move" && (
                    <DestinationPicker
                      gallery={gallery}
                      teams={list.teams}
                      chapter={list.chapterCreate}
                      initialTeam={selected[0].teamId}
                      disabled={busy}
                      onChange={setDestination}
                    />
                  )}
                  {bulk === "tags" && (
                    <>
                      <Field label="Tag operation">
                        <select
                          value={tagMode}
                          disabled={busy}
                          onChange={(e) => setTagMode(e.target.value)}
                        >
                          <option value="add">
                            Add tags · keep existing tags
                          </option>
                          <option value="remove">Remove matching tags</option>
                          <option value="replace">Replace all tags</option>
                        </select>
                      </Field>
                      <Field
                        label="Tags for selected files"
                        hint="Comma-separated. At most 20 distinct tags per file. An empty replacement clears tags."
                      >
                        <input
                          maxLength={820}
                          disabled={busy}
                          value={bulkTags}
                          onChange={(e) => setBulkTags(e.target.value)}
                        />
                      </Field>
                    </>
                  )}
                  <p className="gt-helper">
                    {bulk === "archive"
                      ? "Files leave the current library and new download links are denied. Original bytes are retained for 30 days, then become eligible for cleanup if no usage remains."
                      : bulk === "restore"
                        ? "Only files whose bytes have not been cleaned up can be restored. Restored images remain private."
                        : "Every source and destination is rechecked. A changed or unauthorized file cancels the whole batch."}
                  </p>
                  <div className="gt-inline-actions">
                    <Button
                      disabled={
                        busy ||
                        !isOnline ||
                        loading ||
                        !!listError ||
                        (bulk === "move" && !destination)
                      }
                    >
                      {busy ? "Applying…" : "Confirm media change"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => leave(() => {})}
                    >
                      Cancel operation
                    </Button>
                  </div>
                </form>
              )}
            </section>
          )}
          {loading && (
            <p role="status" aria-busy="true">
              Refreshing authorized media…
            </p>
          )}
          {list.items.length ? (
            <ScrollableTable
              className="gt-table-scroll"
              label="Media inventory, scroll horizontally for all columns"
            >
              <table className="gt-data-table gt-media-table">
                <caption className="sr-only">
                  {gallery
                    ? "Gallery image inventory"
                    : "Private media inventory"}
                  , page {page}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label="Select all available files on this page"
                        checked={
                          list.items
                            .filter((f) => !f.purgedAt)
                            .every((f) =>
                              selected.some((s) => s.id === f.id),
                            ) && list.items.some((f) => !f.purgedAt)
                        }
                        disabled={busy || loading}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? list.items.filter((f) => !f.purgedAt)
                              : [],
                          )
                        }
                      />
                    </th>
                    <th scope="col">File</th>
                    <th scope="col">Safety / visibility</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${f.name}`}
                          checked={selected.some((v) => v.id === f.id)}
                          disabled={busy || loading || !!f.purgedAt}
                          onChange={(e) =>
                            setSelected((v) =>
                              e.target.checked
                                ? [
                                    ...v.filter((item) => item.id !== f.id),
                                    f,
                                  ].slice(0, 50)
                                : v.filter((item) => item.id !== f.id),
                            )
                          }
                        />
                      </td>
                      <th scope="row">
                        <Button
                          variant="ghost"
                          disabled={busy || loading}
                          onClick={() => leave(() => setEditor(f))}
                        >
                          {f.starred && <Star size={15} aria-label="Starred" />}
                          {f.fileType === "image" && <FileImage size={17} />}
                          {f.name}
                        </Button>
                        <small>
                          {f.originalName || "Retained removal record"}
                        </small>
                      </th>
                      <td>
                        <Badge
                          tone={f.scanState === "clean" ? "success" : "warning"}
                        >
                          {f.purgedAt ? "Bytes removed" : f.scanState}
                        </Badge>
                        <small>
                          {f.public
                            ? "Public WebP image"
                            : f.publicationState === "queued"
                              ? "Public approval processing"
                              : "Private"}
                          {f.inUse ? " · in use" : ""}
                        </small>
                      </td>
                      <td>
                        {humanBytes(f.bytes)}
                        <small>
                          {f.mime} · revision {f.revision}
                        </small>
                        {f.tags.length > 0 && (
                          <small>{f.tags.join(" · ")}</small>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          ) : (
            !loading && (
              <EmptyState
                headingLevel={2}
                title={
                  state === "trash"
                    ? "No archived files here"
                    : "This part of the library is empty"
                }
              >
                {state === "trash"
                  ? "Archived files remain restorable until their retained bytes are cleaned up."
                  : canCreate
                    ? "Upload a file privately, or create a folder to organize this scope."
                    : "Choose a permitted scope or adjust the filters to find chapter media."}
              </EmptyState>
            )
          )}
          <div className="gt-inline-actions gt-media-pagination">
            <Button
              variant="secondary"
              disabled={page <= 1 || loading || busy}
              onClick={() =>
                leave(() => {
                  setSelected([]);
                  setPage((v) => v - 1);
                })
              }
            >
              Previous page
            </Button>
            <span>
              Page {page} · {list.total} matching files
            </span>
            <Button
              variant="secondary"
              disabled={!list.nextCursor || loading || busy}
              onClick={() =>
                leave(() => {
                  setSelected([]);
                  setCursors((v) => [...v.slice(0, page), list.nextCursor!]);
                  setPage((v) => v + 1);
                })
              }
            >
              Next page
            </Button>
          </div>
        </>
      )}
      <p className="gt-helper">
        Upload limits: five active uploads, 25 files / 500 MiB per account per
        day, 1 GiB / 1,000 retained files per scope. Scanning and publication
        continue in the background. Original uploads are never published
        automatically; only files that pass scanning can be downloaded.
      </p>
    </div>
  );
}
export function GalleryWorkspace() {
  return <MediaWorkspace gallery />;
}
