import RecordPanel from "@/ui/RecordPanel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  cloneElement,
  type ReactElement,
} from "react";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Link } from "react-router-dom";
import { Plus, ArrowLeft, Save, Users, Copy, ExternalLink } from "lucide-react";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ScrollableTable from "./ScrollableTable";
import { useAdmin } from "@/contexts/AdminContext";
import { Button, Field, Badge, EmptyState, SearchBox } from "./primitives";
import type { ChapterEvent } from "./events";
import FormIntegrations from "./forms/FormIntegrations";
import EventMailPanel from "./EventMailPanel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Attendee = {
  id: string;
  attendee_name: string;
  attendee_email: string;
  notes: string;
  attended: boolean;
  registration_date: string;
  updated_at: string;
};
type ManagedEvent = ChapterEvent & {
  actions?: string[];
  canExport?: boolean;
  canEmail?: boolean;
};
type Capabilities = {
  globalCreate: boolean;
  teams: { id: string; name: string }[];
};
type Intent = {
  path: string;
  method: string;
  body: unknown;
  key: string;
  kind: "event" | "attendee";
  label: string;
  personId?: string;
  createdAt: number;
};
type Draft = Partial<ChapterEvent>;
const starter = (): Draft => ({
  title: "",
  slug: "",
  short_description: "",
  description: "",
  start_at: "",
  end_at: null,
  timezone: "America/New_York",
  location: "",
  room: "",
  type: "Workshop",
  level: "open_for_all",
  registration_type: "internal",
  registration_enabled: true,
  max_participants: null,
  external_attendees: 0,
  is_featured: false,
  team_id: null,
});
const dateInput = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
const editable = [
  "title",
  "slug",
  "short_description",
  "description",
  "start_at",
  "end_at",
  "timezone",
  "location",
  "room",
  "type",
  "level",
  "image_url",
  "image_media_id",
  "event_link",
  "registration_url",
  "google_form_url",
  "google_event_url",
  "registration_type",
  "registration_enabled",
  "max_participants",
  "external_attendees",
  "is_featured",
  "team_id",
  "prerequisites",
  "what_youll_learn",
  "what_to_bring",
  "schedule",
  "additional_info",
  "contact_info",
] as const;
export default function EventWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((value) => value + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <EventWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function ReadFeedback({
  name,
  read,
  retry,
  disabled,
  offline,
}: {
  name: string;
  read: { loading: boolean; error: string; at?: string; data?: unknown };
  retry: () => void;
  disabled: boolean;
  offline?: boolean;
}) {
  return (
    <>
      {offline && read.at && (
        <p role="status">
          {name} snapshot from{" "}
          <time dateTime={read.at}>{new Date(read.at).toLocaleString()}</time>;
          offline data may be out of date.
        </p>
      )}
      {read.loading && !read.data && (
        <div role="status" aria-label={`Loading ${name}`}>
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading {name}…</span>
        </div>
      )}
      {read.error && (
        <div role="alert">
          <p>
            {name} could not {read.at ? "refresh" : "load"}. {read.error}
          </p>
          {read.at && (
            <p>
              Last successful read:{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              .
            </p>
          )}
          <Button
            variant="secondary"
            disabled={disabled || read.loading}
            onClick={() => {
              retry();
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry {name}
          </Button>
        </div>
      )}
    </>
  );
}
function EventField({
  name,
  errors,
  idPrefix = "event",
  children,
  ...props
}: {
  name: string;
  errors: Record<string, string>;
  idPrefix?: string;
  children: ReactElement;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  const error = errors[name],
    id = `${idPrefix}-field-${name}`;
  return (
    <Field {...props}>
      {cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? id + "-error" : undefined,
      } as Record<string, unknown>)}
      {error && <small id={id + "-error"}>{error}</small>}
    </Field>
  );
}
function EventWorkspaceContent() {
  const { currentAdmin } = useAdmin();
  const [draft, setDraft] = useState<Draft | null>(null),
    [selected, setSelected] = useState<ManagedEvent | null>(null);
  const [mode, setMode] = useState<"list" | "edit" | "attendees">("list");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("");
  const [page, setPage] = useState(1),
    [attendeePage, setAttendeePage] = useState(1),
    [listRefresh, setListRefresh] = useState(0),
    [detailRefresh, setDetailRefresh] = useState(0),
    [attendeeRefresh, setAttendeeRefresh] = useState(0),
    [blocked, setBlocked] = useState(false);
  const mutation = usePrivateMutation(
      `${currentAdmin?.id}:${mode}:${selected?.id || "new"}:${attendeePage}`,
    ),
    busy = mutation.busy;
  const [uncertain, setUncertain] = useState<Intent>(),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [checkedUncertain, setCheckedUncertain] = useState(false),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [fieldTarget, setFieldTarget] = useState<string>(),
    [attendeeDrafts, setAttendeeDrafts] = useState<
      Record<string, Partial<Attendee>>
    >({});
  const feedback = useRef<HTMLDivElement>(null);
  const reviewTarget = useRef<{
      id: string;
      revision: number;
      updatedAt?: string;
    }>(),
    pendingMove = useRef<() => void>();
  const [typedConfirmation, setTypedConfirmation] = useState("");
  const [publishedSave, setPublishedSave] = useState<Intent>();
  const [confirmation, setConfirmation] = useState<string | null>(null),
    [dirty, setDirty] = useState(false);
  const [showMail, setShowMail] = useState(false),
    navigation = useNavigationSafety();
  const inventory = usePrivateRead<{
      items: ManagedEvent[];
      total: number;
      capabilities?: Capabilities;
    }>(`/admin/events?page=${page}`, listRefresh),
    detail = usePrivateRead<{ event: ManagedEvent }>(
      selected && mode !== "list" ? `/admin/events/${selected.id}` : undefined,
      detailRefresh,
    ),
    audience = usePrivateRead<{ items: Attendee[]; total: number }>(
      selected && mode === "attendees"
        ? `/admin/events/${selected.id}/attendees?page=${attendeePage}`
        : undefined,
      attendeeRefresh,
    ),
    items = inventory.data?.items || [],
    visibleItems = items.filter((event) =>
      event.title.toLowerCase().includes(query.toLowerCase()),
    ),
    total = inventory.data?.total || 0,
    attendees = audience.data?.items || [],
    attendeeTotal = audience.data?.total || 0,
    capabilities = inventory.data?.capabilities,
    canCreate =
      !inventory.loading &&
      !inventory.error &&
      !!capabilities &&
      (capabilities.globalCreate || capabilities.teams.length > 0),
    loading = inventory.loading,
    { isOnline } = useOnlineStatus(),
    detailReady =
      !selected ||
      (!!detail.data && !detail.loading && !detail.error && !detail.denied),
    detailChanged =
      !!selected &&
      !!detail.data &&
      selected.revision !== detail.data.event.revision,
    audienceReady =
      detailReady &&
      !detailChanged &&
      !!audience.data &&
      !audience.loading &&
      !audience.error &&
      !audience.denied &&
      isOnline,
    canWrite = isOnline && !busy && !needsRecheck && !uncertain && !blocked,
    selectedActions = detail.data?.event.actions || [],
    canUpdate = selectedActions.includes("update"),
    clearInventory = inventory.clear,
    clearDetail = detail.clear,
    clearAudience = audience.clear,
    denied = inventory.denied || detail.denied || audience.denied;
  const load = useCallback(() => {
    setListRefresh((value) => value + 1);
    setDetailRefresh((value) => value + 1);
  }, []);
  const clearPrivate = useCallback(() => {
    setBlocked(true);
    clearInventory();
    clearDetail();
    clearAudience();
    setSelected(null);
    setDraft(null);
    setMode("list");
    setDirty(false);
    setShowMail(false);
    setConfirmation(null);
    setError("");
    setNotice("");
    setUncertain(undefined);
    setNeedsRecheck(false);
    setAttendeeDrafts({});
    setFieldErrors({});
    setFieldTarget(undefined);
    setPublishedSave(undefined);
    reviewTarget.current = undefined;
    pendingMove.current = undefined;
  }, [clearInventory, clearDetail, clearAudience]);
  useEffect(() => {
    if (denied) clearPrivate();
  }, [denied, clearPrivate]);
  useEffect(() => {
    if (!confirmation) setPublishedSave(undefined);
  }, [confirmation]);
  useEffect(() => {
    if (
      !dirty &&
      !uncertain &&
      !needsRecheck &&
      !busy &&
      detailReady &&
      detail.data &&
      selected &&
      detail.data.event.revision >= selected.revision
    ) {
      setSelected(detail.data.event);
      if (mode === "edit") setDraft(detail.data.event);
    }
  }, [
    detail.data,
    detailReady,
    dirty,
    busy,
    mode,
    selected,
    uncertain,
    needsRecheck,
  ]);
  const attendeeDirty = Object.keys(attendeeDrafts).length > 0;
  useDraftGuard(dirty || attendeeDirty || !!uncertain, {
    busy,
    label: "Event changes or unsent event mail",
  });
  const change = (key: keyof ChapterEvent, value: unknown) => {
    if (mutation.pending.current || uncertain) return;
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setFieldErrors((previous) => ({ ...previous, [key]: "" }));
  };
  useEffect(() => {
    if (error || notice) {
      if (confirmation)
        document.getElementById("event-review-feedback")?.focus();
      else feedback.current?.focus();
    }
  }, [error, notice, confirmation]);
  const review = (kind: string, person?: Attendee) => {
    if (mutation.pending.current) return;
    reviewTarget.current = selected
      ? {
          id: selected.id,
          revision:
            kind === "reload"
              ? detail.data?.event.revision || selected.revision
              : selected.revision,
          updatedAt: person?.updated_at,
        }
      : undefined;
    setTypedConfirmation("");
    setConfirmation(kind);
  };
  const requestMove = (move: () => void) => {
    if (mutation.pending.current) return;
    if (dirty || attendeeDirty || uncertain) {
      pendingMove.current = move;
      review("discard");
    } else if (navigation) navigation.request(move);
    else move();
  };
  const edit = (event?: ManagedEvent) => {
    if (mutation.pending.current || uncertain || (!event && !canCreate)) return;
    setSelected(event || null);
    setDraft(
      event
        ? { ...event }
        : {
            ...starter(),
            team_id: capabilities?.globalCreate
              ? null
              : capabilities?.teams[0]?.id || null,
          },
    );
    setMode("edit");
    setError("");
    setNotice("");
    setDirty(false);
  };
  const perform = async (intent: Intent, replay = false) => {
    if (replay ? !isOnline || !checkedUncertain : !canWrite) return;
    if (replay && Date.now() - intent.createdAt >= 47 * 60 * 60 * 1000) {
      setError(
        "The safe retry window ended. Return to Events and inspect saved records before starting another operation.",
      );
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    setError("");
    setNotice("");
    setFieldErrors({});
    setFieldTarget(intent.personId);
    try {
      const result = await api<{ event?: ManagedEvent }>(intent.path, {
        method: intent.method,
        protected: true,
        body: intent.body,
        idempotencyKey: intent.key,
        signal: controller.signal,
      });
      if (!mutation.current(controller)) return;
      if (intent.kind === "event" && result.event) {
        setSelected(result.event);
        setDraft(result.event);
        setDirty(false);
      } else {
        setAttendeeDrafts((previous) => {
          const next = { ...previous };
          delete next[intent.personId || ""];
          return next;
        });
        setAttendeeRefresh((value) => value + 1);
      }
      setUncertain(undefined);
      setNeedsRecheck(false);
      setCheckedUncertain(false);
      setConfirmation(null);
      setNotice(intent.label + " confirmed by the server.");
      load();
    } catch (failure) {
      if (!mutation.current(controller)) return;
      setError((failure as Error).message);
      if (failure instanceof ApiFailure) {
        setFieldErrors(
          Object.fromEntries(
            Object.entries(failure.fields || {}).map(([key, value]) => [
              key.replace(/^event\./, ""),
              value,
            ]),
          ),
        );
      }
      if (
        failure instanceof ApiFailure &&
        [401, 403, 404].includes(failure.status)
      ) {
        clearPrivate();
      } else if (!(failure instanceof ApiFailure) || failure.status >= 500) {
        setUncertain(intent);
        setNeedsRecheck(true);
        setCheckedUncertain(false);
        setError(
          "The result could not be confirmed. Recheck saved data, then explicitly retry this same operation if needed. Your original retry identity is retained. " +
            (failure as Error).message,
        );
      } else if (failure.status === 409) {
        setNeedsRecheck(true);
        setCheckedUncertain(false);
        setError(
          "Saved data or access changed. Recheck current values before another change. " +
            failure.message,
        );
      }
    } finally {
      mutation.finish(controller);
    }
  };
  const recheck = async () => {
    if (!isOnline) return;
    const controller = mutation.begin();
    if (!controller) return;
    setCheckedUncertain(false);
    try {
      await api(`/admin/events?page=${page}`, { signal: controller.signal });
      if (selected) {
        await api(`/admin/events/${selected.id}`, {
          signal: controller.signal,
        });
        if (mode === "attendees")
          await api(
            `/admin/events/${selected.id}/attendees?page=${attendeePage}`,
            { signal: controller.signal },
          );
      }
      if (!mutation.current(controller)) return;
      load();
      setAttendeeRefresh((value) => value + 1);
      setCheckedUncertain(true);
      setNeedsRecheck(false);
      setError("");
      setNotice("Current saved data was rechecked. No change was sent.");
    } catch (failure) {
      if (!mutation.current(controller)) return;
      setError((failure as Error).message);
      if (
        failure instanceof ApiFailure &&
        [401, 403, 404].includes(failure.status)
      ) {
        clearPrivate();
      }
    } finally {
      mutation.finish(controller);
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (
      !draft ||
      !canWrite ||
      !detailReady ||
      detailChanged ||
      (selected ? !canUpdate : !canCreate)
    )
      return;
    const event = Object.fromEntries(
      editable
        .filter((key) => draft[key] !== undefined)
        .map((key) => [key, draft[key]]),
    );
    const intent: Intent = {
      path: "/admin/events" + (selected ? "/" + selected.id : ""),
      method: selected ? "PATCH" : "POST",
      body: { event, ...(selected ? { revision: selected.revision } : {}) },
      key: crypto.randomUUID(),
      createdAt: Date.now(),
      kind: "event",
      label: selected ? "Event save" : "Private draft creation",
    };
    if (selected?.publication_status === "published") {
      setPublishedSave(intent);
      review("save-published");
    } else await perform(intent);
  };
  const action = async (kind: string) => {
    const required =
      kind === "archive"
        ? "delete"
        : kind === "duplicate"
          ? "create"
          : ["publish", "unpublish"].includes(kind)
            ? "publish"
            : "update";
    if (
      !selected ||
      dirty ||
      !canWrite ||
      !detailReady ||
      detailChanged ||
      !selectedActions.includes(required)
    )
      return;
    await perform({
      path:
        "/admin/events/" + selected.id + (kind === "archive" ? "" : "/" + kind),
      method: kind === "archive" ? "DELETE" : "POST",
      body: { revision: selected.revision, event: {} },
      key: crypto.randomUUID(),
      createdAt: Date.now(),
      kind: "event",
      label: "Event " + kind,
    });
  };
  const loadAttendees = (event: ManagedEvent, p = 1) => {
    if (mutation.pending.current || uncertain) return;
    setSelected(event);
    setMode("attendees");
    setAttendeePage(p);
    setAttendeeRefresh((value) => value + 1);
    setShowMail(false);
    setError("");
  };
  const attendeeChange = async (
    person: Attendee,
    values: Partial<Attendee>,
    remove = false,
  ) => {
    if (!selected || !canWrite || !audienceReady || !canUpdate) return;
    const { updated_at, ...changes } = values;
    await perform({
      path: `/admin/events/${selected.id}/attendees/${person.id}`,
      method: remove ? "DELETE" : "PATCH",
      body: { ...changes, updatedAt: updated_at || person.updated_at },
      key: crypto.randomUUID(),
      createdAt: Date.now(),
      kind: "attendee",
      personId: person.id,
      label: remove ? "Registration removal" : "Attendee update",
    });
  };
  if (blocked || denied)
    return (
      <EmptyState
        title="Event access needs to be rechecked"
        action={
          <Button
            disabled={!isOnline}
            onClick={() => {
              setBlocked(false);
              setListRefresh((value) => value + 1);
            }}
          >
            Recheck event access
          </Button>
        }
      >
        Previous event and attendee information has been cleared. Refresh
        current access before continuing.
      </EmptyState>
    );
  const panelFeedback = (<>
      {!isOnline && (
        <p role="status">
          You are offline. Draft input stays on this page; reconnect and refresh
          current data before saving or changing registrations.
        </p>
      )}
      {mode !== "list" && selected && (
        <>
          <ReadFeedback
            name="selected event"
            read={detail}
            retry={() => setDetailRefresh((value) => value + 1)}
            disabled={!isOnline || busy}
            offline={!isOnline}
          />
          <Button
            variant="ghost"
            disabled={!isOnline || busy || detail.loading}
            onClick={() => setDetailRefresh((value) => value + 1)}
          >
            Refresh selected event
          </Button>
          {detailChanged && (
            <div role="alert">
              <p>
                The saved event changed. Your unsaved fields are retained.
                Review current saved data before another write.
              </p>
              <Button
                variant="secondary"
                disabled={busy || !detailReady}
                onClick={() => review("reload")}
              >
                Review loading saved event
              </Button>
            </div>
          )}
        </>
      )}
      {(error || notice) && (
        <div ref={feedback} tabIndex={-1}>
          {error && (
            <div className="gt-form-error" role="alert">
              {error}
              <Button variant="ghost" onClick={() => setError("")}>
                Dismiss
              </Button>
            </div>
          )}
          {notice && (
            <p role="status" className="gt-helper">
              {notice}
            </p>
          )}
        </div>
      )}
      {!confirmation && (needsRecheck || uncertain) && (
        <section className="gt-panel" aria-label="Event operation recovery">
          <p>
            {uncertain
              ? `${uncertain.label} has an unconfirmed result. Original input and retry identity are retained.`
              : "Recheck current saved data before another write."}
          </p>
          <Button
            disabled={busy || !isOnline}
            variant="secondary"
            onClick={recheck}
          >
            Recheck saved event data
          </Button>
          {uncertain && (
            <Button
              disabled={busy || !isOnline || !checkedUncertain}
              onClick={() => perform(uncertain, true)}
            >
              Retry original operation
            </Button>
          )}
        </section>
      )}
  </>);
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <p className="gt-helper">Chapter operations</p>
          <h1>
            {mode === "attendees"
              ? "Registrations & attendance"
              : mode === "edit"
                ? selected
                  ? "Edit event"
                  : "Create an event"
                : "Events"}
          </h1>
          <p>
            Draft, publish, and run events with confirmed registration data.
          </p>
        </div>
        {mode === "list" ? (
          <Button
            disabled={
              !canWrite || !canCreate || inventory.loading || !!inventory.error
            }
            onClick={() => edit()}
          >
            <Plus size={17} />
            Create event
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => {
              const leave = () => {
                setShowMail(false);
                setMode("list");
              };
              requestMove(leave);
            }}
          >
            <ArrowLeft size={17} />
            All events
          </Button>
        )}
      </header>
      {(mode !== "edit" || !draft) && panelFeedback}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !mutation.pending.current) setConfirmation(null);
        }}
      >
        <DialogContent
          className={busy ? "[&>button]:hidden" : ""}
          onEscapeKeyDown={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (mutation.pending.current) event.preventDefault();
          }}
        >
          <DialogTitle>
            {confirmation === "discard"
              ? "Discard unsaved edits?"
              : confirmation === "reload"
                ? "Replace this draft with the current saved event?"
                : confirmation?.startsWith("remove-")
                  ? "Remove this registration?"
                  : `${({ publish: "Publish event", unpublish: "Unpublish event", duplicate: "Duplicate event", archive: "Archive event", cancel: "Cancel event", "save-published": "Save published changes" } as Record<string, string>)[confirmation || ""] || "Update event"}: ${selected?.title || ""}`}
          </DialogTitle>
          <DialogDescription>
            {confirmation === "discard"
              ? uncertain
                ? "The original operation may already have completed. Discard retained input and retry identity, then inspect saved records before starting another operation."
                : "Unsaved event and attendee input will be discarded. Saved records will not change."
              : confirmation === "reload"
                ? `Replace unsaved fields for ${selected?.title || "this event"} with current saved values. No server write is performed.`
                : confirmation?.startsWith("remove-")
                  ? `Remove ${attendees.find((person) => "remove-" + person.id === confirmation)?.attendee_name || "this attendee"} from ${selected?.title}. Their registration will no longer occupy a seat. Previous audit history remains.`
                  : confirmation === "publish"
                    ? `Make ${selected?.title} visible publicly with its saved registration settings.`
                    : confirmation === "unpublish"
                      ? `Remove ${selected?.title} from public results and public registration. Existing registrations remain.`
                      : confirmation === "duplicate"
                        ? `Create one private draft copy of ${selected?.title}. Registrations are not copied.`
                        : confirmation === "save-published"
                          ? `Save these changes to ${selected?.title} immediately on the public event page. Existing registrations remain.`
                          : `Close registration for ${selected?.title} and remove it from public results. Existing registrations and audit history remain.`}
          </DialogDescription>
          {error && (
            <p id="event-review-feedback" tabIndex={-1} role="alert">
              {error}
            </p>
          )}
          {confirmation !== "discard" &&
            selected &&
            detailReady &&
            reviewTarget.current?.revision !== detail.data?.event.revision && (
              <p role="alert">
                The saved event changed. Close this review, check current data
                and review the action again.
              </p>
            )}
          {["archive", "cancel"].includes(confirmation || "") && (
            <Field label="Type the event slug to confirm">
              <input
                value={typedConfirmation}
                disabled={busy}
                autoComplete="off"
                onChange={(e) => setTypedConfirmation(e.target.value)}
              />
            </Field>
          )}
          {(needsRecheck || uncertain) && (
            <div>
              <Button
                disabled={busy || !isOnline}
                variant="secondary"
                onClick={recheck}
              >
                Recheck saved event data
              </Button>
              {uncertain && (
                <Button
                  disabled={busy || !isOnline || !checkedUncertain}
                  onClick={() => perform(uncertain, true)}
                >
                  Retry original operation
                </Button>
              )}
            </div>
          )}
          <div className="gt-inline-actions">
            <Button
              variant="danger"
              disabled={
                busy ||
                (confirmation !== "discard" &&
                  (!isOnline ||
                    !!uncertain ||
                    needsRecheck ||
                    !detailReady ||
                    !selected ||
                    reviewTarget.current?.id !== selected.id ||
                    reviewTarget.current?.revision !==
                      detail.data?.event.revision ||
                    (confirmation !== "reload" && detailChanged))) ||
                (["archive", "cancel"].includes(confirmation || "") &&
                  typedConfirmation !== selected?.slug)
              }
              onClick={() => {
                if (mutation.pending.current) return;
                if (confirmation === "discard") {
                  setDirty(false);
                  setAttendeeDrafts({});
                  setUncertain(undefined);
                  setNeedsRecheck(false);
                  setCheckedUncertain(false);
                  setConfirmation(null);
                  const move = pendingMove.current;
                  pendingMove.current = undefined;
                  if (move) move();
                  else setMode("list");
                } else if (confirmation === "reload") {
                  if (!detail.data) return;
                  setSelected(detail.data.event);
                  setDraft(detail.data.event);
                  setDirty(false);
                  setConfirmation(null);
                } else if (confirmation === "save-published" && publishedSave) {
                  if (canUpdate) perform(publishedSave);
                } else if (confirmation?.startsWith("remove-")) {
                  const person = attendees.find(
                    (value) => "remove-" + value.id === confirmation,
                  );
                  if (
                    !person ||
                    reviewTarget.current?.updatedAt !== person.updated_at ||
                    !audienceReady
                  ) {
                    setError(
                      "The registration changed. Close this review and check the current attendee before removing it.",
                    );
                    return;
                  }
                  attendeeChange(person, {}, true);
                } else if (confirmation) action(confirmation);
              }}
            >
              Confirm
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Keep editing
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {mode === "list" && (
        <>
          <div className="gt-toolbar">
            <SearchBox
              value={query}
              onChange={setQuery}
              label="Search this page of events"
              placeholder="Search this page…"
            />
            <span>
              {inventory.data ? `${total} events` : "Checking event inventory…"}
            </span>
          </div>
          <ReadFeedback
            name="event inventory"
            read={inventory}
            retry={() => setListRefresh((value) => value + 1)}
            disabled={!isOnline || busy}
            offline={!isOnline}
          />
          <Button
            variant="ghost"
            disabled={!isOnline || busy || inventory.loading}
            onClick={() => setListRefresh((value) => value + 1)}
          >
            Refresh event inventory
          </Button>
          {visibleItems.length ? (
            <ScrollableTable label="Authorized events table">
              <table className="gt-data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>When</th>
                    <th>State</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <button
                          className="gt-text-button"
                          disabled={
                            busy || inventory.loading || !!inventory.error
                          }
                          onClick={() => edit(event)}
                        >
                          {event.title}
                        </button>
                        <small>/{event.slug}</small>
                      </td>
                      <td>
                        {new Date(event.start_at).toLocaleString()}
                        <small>{event.timezone}</small>
                      </td>
                      <td>
                        <Badge
                          tone={
                            event.publication_status === "published"
                              ? "success"
                              : "neutral"
                          }
                        >
                          {event.publication_status}
                        </Badge>
                      </td>
                      <td>
                        <div className="gt-inline-actions">
                          <Button
                            variant="ghost"
                            disabled={
                              busy || inventory.loading || !!inventory.error
                            }
                            onClick={() => edit(event)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={
                              busy || inventory.loading || !!inventory.error
                            }
                            onClick={() => loadAttendees(event)}
                          >
                            <Users size={16} />
                            Attendance
                          </Button>
                          {event.publication_status === "published" && (
                            <Link
                              to={"/events/" + event.slug}
                              className="gt-text-button"
                            >
                              View <ExternalLink size={14} />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          ) : inventory.data &&
            !inventory.loading &&
            !inventory.error &&
            query ? (
            <EmptyState
              title="No events match this page"
              action={
                <Button variant="secondary" onClick={() => setQuery("")}>
                  Reset page search
                </Button>
              }
            >
              Try another title or reset this page's search.
            </EmptyState>
          ) : inventory.data && !inventory.loading && !inventory.error ? (
            <EmptyState
              title={
                canCreate
                  ? "Create your first chapter event"
                  : "No events available"
              }
            >
              {canCreate
                ? "Start with a draft. Only published events appear on the public site."
                : "Events available to your current access will appear here."}
            </EmptyState>
          ) : null}
          <div className="gt-inline-actions">
            <Button
              variant="secondary"
              disabled={page === 1 || loading || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="secondary"
              disabled={page * 50 >= total || loading || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {mode === "edit" && draft && (
        <RecordPanel title="Event editor" busy={busy || !!uncertain} onClose={() => requestMove(() => setMode("list"))}>
          {panelFeedback}
          {selected && (
            <div className="gt-inline-actions">
              <FormIntegrations
                kind="event"
                resourceId={selected.id}
                onDenied={clearPrivate}
                onRecheck={load}
                disabled={!canWrite || dirty || !detailReady || detailChanged}
              />
              <span className="gt-helper">
                Save event changes before managing linked forms.
              </span>
            </div>
          )}
<form onSubmit={save} className="gt-form gt-panel gt-event-editor">
            {selected?.publication_status === "published" && (
              <p role="status">
                Saving changes updates this published event. Unpublish it first
                to work privately.
              </p>
            )}
            <fieldset
              disabled={busy || !!uncertain}
              className="gt-form gt-event-fields"
            >
              {selected && (
                <div className="gt-inline-actions">
                  <Badge
                    tone={
                      selected.publication_status === "published"
                        ? "success"
                        : "neutral"
                    }
                  >
                    {selected.publication_status}
                  </Badge>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      !canWrite ||
                      !selectedActions.includes("publish") ||
                      dirty ||
                      !isOnline ||
                      !detailReady ||
                      detailChanged
                    }
                    onClick={() =>
                      review(
                        selected.publication_status === "published"
                          ? "unpublish"
                          : "publish",
                      )
                    }
                  >
                    {selected.publication_status === "published"
                      ? "Unpublish"
                      : "Publish"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      !canWrite ||
                      !selectedActions.includes("create") ||
                      dirty ||
                      !isOnline ||
                      !detailReady ||
                      detailChanged
                    }
                    onClick={() => review("duplicate")}
                  >
                    <Copy size={16} />
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={
                      !canWrite ||
                      !selectedActions.includes("update") ||
                      dirty ||
                      !isOnline ||
                      !detailReady ||
                      detailChanged
                    }
                    onClick={() => review("cancel")}
                  >
                    Cancel event
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={
                      !canWrite ||
                      !selectedActions.includes("delete") ||
                      dirty ||
                      !isOnline ||
                      !detailReady ||
                      detailChanged
                    }
                    onClick={() => review("archive")}
                  >
                    Archive
                  </Button>
                </div>
              )}
              <div className="gt-form-grid">
                <EventField
                  name="title"
                  errors={fieldErrors}
                  label="Event title"
                  required
                >
                  <input
                    required
                    minLength={2}
                    maxLength={200}
                    value={draft.title || ""}
                    onChange={(e) => change("title", e.target.value)}
                  />
                </EventField>
                <EventField
                  name="slug"
                  errors={fieldErrors}
                  label="URL slug"
                  hint="Lowercase words separated by hyphens. Previous slugs redirect after a rename."
                  required
                >
                  <input
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={150}
                    value={draft.slug || ""}
                    onChange={(e) => change("slug", e.target.value)}
                  />
                </EventField>
                <EventField
                  name="start_at"
                  errors={fieldErrors}
                  label="Start (UTC)"
                  required
                >
                  <input
                    type="datetime-local"
                    required
                    value={dateInput(draft.start_at)}
                    onChange={(e) =>
                      change(
                        "start_at",
                        e.target.value ? e.target.value + ":00Z" : "",
                      )
                    }
                  />
                </EventField>
                <EventField
                  name="end_at"
                  errors={fieldErrors}
                  label="End (UTC)"
                >
                  <input
                    type="datetime-local"
                    value={dateInput(draft.end_at)}
                    onChange={(e) =>
                      change(
                        "end_at",
                        e.target.value ? e.target.value + ":00Z" : null,
                      )
                    }
                  />
                </EventField>
                <EventField
                  name="timezone"
                  errors={fieldErrors}
                  label="Display timezone"
                  required
                >
                  <input
                    required
                    maxLength={80}
                    value={draft.timezone || ""}
                    onChange={(e) => change("timezone", e.target.value)}
                  />
                </EventField>
                <EventField
                  name="location"
                  errors={fieldErrors}
                  label="Venue or online label"
                  required
                >
                  <input
                    required
                    maxLength={500}
                    value={draft.location || ""}
                    onChange={(e) => change("location", e.target.value)}
                  />
                </EventField>
                <EventField name="room" errors={fieldErrors} label="Room">
                  <input
                    maxLength={200}
                    value={draft.room || ""}
                    onChange={(e) => change("room", e.target.value)}
                  />
                </EventField>
                <EventField name="type" errors={fieldErrors} label="Event type">
                  <input
                    required
                    maxLength={50}
                    value={draft.type || ""}
                    onChange={(e) => change("type", e.target.value)}
                  />
                </EventField>
                <EventField
                  name="level"
                  errors={fieldErrors}
                  label="Experience level"
                >
                  <select
                    value={draft.level}
                    onChange={(e) => change("level", e.target.value)}
                  >
                    {[
                      "open_for_all",
                      "beginner",
                      "intermediate",
                      "advanced",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </EventField>
                <EventField
                  name="registration_type"
                  errors={fieldErrors}
                  label="Registration mode"
                >
                  <select
                    value={draft.registration_type}
                    onChange={(e) =>
                      change("registration_type", e.target.value)
                    }
                  >
                    {["internal", "external", "both"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </EventField>
                <EventField
                  name="max_participants"
                  errors={fieldErrors}
                  label="Total capacity"
                  hint="Includes internal registrations plus the external attendee count. Empty means uncapped."
                >
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    value={draft.max_participants ?? ""}
                    onChange={(e) =>
                      change(
                        "max_participants",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  />
                </EventField>
                <EventField
                  name="external_attendees"
                  errors={fieldErrors}
                  label="External attendee count"
                >
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={draft.external_attendees ?? 0}
                    onChange={(e) =>
                      change("external_attendees", Number(e.target.value))
                    }
                  />
                </EventField>
                <EventField
                  name="team_id"
                  errors={fieldErrors}
                  label="Owning team"
                >
                  <select
                    value={draft.team_id || ""}
                    onChange={(e) => change("team_id", e.target.value || null)}
                  >
                    {capabilities?.globalCreate && (
                      <option value="">Chapter-wide</option>
                    )}
                    {draft.team_id &&
                      !capabilities?.teams.some(
                        (team) => team.id === draft.team_id,
                      ) && (
                        <option value={draft.team_id}>
                          Current owning team
                        </option>
                      )}
                    {(capabilities?.teams || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </EventField>
              </div>
              <EventField
                name="short_description"
                errors={fieldErrors}
                label="Short summary"
              >
                <textarea
                  maxLength={500}
                  rows={2}
                  value={draft.short_description || ""}
                  onChange={(e) => change("short_description", e.target.value)}
                />
              </EventField>
              <EventField
                name="description"
                errors={fieldErrors}
                label="Description"
                required
              >
                <textarea
                  required
                  minLength={2}
                  maxLength={40000}
                  rows={6}
                  value={draft.description || ""}
                  onChange={(e) => change("description", e.target.value)}
                />
              </EventField>
              <div className="gt-form-grid">
                {(
                  [
                    ["image_url", "Image URL"],
                    ["event_link", "Online event URL"],
                    ["registration_url", "External registration URL"],
                    ["google_form_url", "Additional registration URL"],
                    ["google_event_url", "External calendar URL"],
                  ] as const
                ).map(([key, label]) => (
                  <EventField
                    key={key}
                    name={key}
                    errors={fieldErrors}
                    label={label}
                  >
                    <input
                      maxLength={2000}
                      value={draft[key] || ""}
                      onChange={(e) => change(key, e.target.value)}
                    />
                  </EventField>
                ))}
              </div>
              {(
                [
                  ["prerequisites", "Prerequisites"],
                  ["what_youll_learn", "Learning outcomes"],
                  ["what_to_bring", "What to bring"],
                  ["schedule", "Schedule"],
                  ["additional_info", "Additional information"],
                  ["contact_info", "Contact information"],
                ] as const
              ).map(([key, label]) => (
                <EventField
                  key={key}
                  name={key}
                  errors={fieldErrors}
                  label={label}
                >
                  <textarea
                    rows={3}
                    maxLength={
                      key === "contact_info"
                        ? 2000
                        : key === "schedule" || key === "additional_info"
                          ? 20000
                          : 10000
                    }
                    value={draft[key] || ""}
                    onChange={(e) => change(key, e.target.value)}
                  />
                </EventField>
              ))}
              <label className="gt-check">
                <input
                  type="checkbox"
                  checked={draft.registration_enabled ?? true}
                  onChange={(e) =>
                    change("registration_enabled", e.target.checked)
                  }
                />
                Registration enabled
              </label>
              <label className="gt-check">
                <input
                  type="checkbox"
                  checked={draft.is_featured ?? false}
                  onChange={(e) => change("is_featured", e.target.checked)}
                />
                Feature this event
              </label>
              <div className="gt-inline-actions">
                <Button
                  disabled={
                    !canWrite ||
                    !detailReady ||
                    detailChanged ||
                    (selected ? !canUpdate : !canCreate)
                  }
                  type="submit"
                >
                  <Save size={17} />
                  {busy
                    ? "Saving…"
                    : selected?.publication_status === "published"
                      ? "Save published changes"
                      : "Save draft changes"}
                </Button>
                <span className="gt-helper">
                  {dirty
                    ? "Unsaved changes"
                    : selected
                      ? "All changes saved"
                      : "New unsaved draft"}
                </span>
              </div>
            </fieldset>
          </form>
        </RecordPanel>
      )}
      {mode === "attendees" && selected && (
        <section>
          <h2>{selected.title}</h2>
          <p>
            {audience.data
              ? `${attendeeTotal} registrations · ${attendees.filter((p) => p.attended).length} checked in on this page`
              : "Checking authorized registrations…"}
          </p>
          <div className="gt-inline-actions">
            {audienceReady && detail.data?.event.canExport ? (
              <a
                className="gt-button gt-button-secondary"
                href={`/api/v1/admin/events/${selected.id}/attendees/export`}
              >
                Export CSV
              </a>
            ) : (
              <Button variant="secondary" disabled>
                Export CSV
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={
                showMail ||
                !audienceReady ||
                !canWrite ||
                !detail.data?.event.canEmail
              }
              onClick={() => setShowMail(true)}
            >
              Email registered attendees
            </Button>
          </div>
          {showMail && detail.data?.event.canEmail && (
            <EventMailPanel
              key={selected.id}
              eventId={selected.id}
              disabled={!audienceReady || !canWrite}
              onClose={() => setShowMail(false)}
              onQueued={(count) => {
                setShowMail(false);
                setNotice(
                  `${count} audience-bound messages are queued. Delivery runs separately; queued is not delivered.`,
                );
              }}
            />
          )}
          <ReadFeedback
            name="event attendees"
            read={audience}
            retry={() => setAttendeeRefresh((value) => value + 1)}
            disabled={!isOnline || busy}
            offline={!isOnline}
          />
          <Button
            variant="ghost"
            disabled={!isOnline || busy || audience.loading}
            onClick={() => setAttendeeRefresh((value) => value + 1)}
          >
            Refresh event attendees
          </Button>
          {attendees.length ? (
            <ScrollableTable label="Event registrations table">
              <table className="gt-data-table">
                <thead>
                  <tr>
                    <th>Attendee</th>
                    <th>Notes</th>
                    <th>Check-in</th>
                    <th>Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map((person) => {
                    const edits = attendeeDrafts[person.id],
                      changed =
                        !!edits && edits.updated_at !== person.updated_at;
                    const disabled =
                      !canWrite || !audienceReady || !canUpdate || changed;
                    const editPerson = (key: keyof Attendee, value: string) => {
                      if (mutation.pending.current || uncertain) return;
                      if (fieldTarget === person.id)
                        setFieldErrors((previous) => ({
                          ...previous,
                          [key]: "",
                        }));
                      setAttendeeDrafts((previous) => ({
                        ...previous,
                        [person.id]: {
                          updated_at: person.updated_at,
                          ...previous[person.id],
                          [key]: value,
                        },
                      }));
                    };
                    const clearEdits = () =>
                      setAttendeeDrafts((previous) => {
                        const next = { ...previous };
                        delete next[person.id];
                        return next;
                      });
                    return (
                      <tr key={person.id}>
                        <td>
                          {person.attendee_name}
                          <small>{person.attendee_email}</small>
                        </td>
                        <td>
                          <input
                            aria-label={"Notes for " + person.attendee_name}
                            aria-invalid={
                              fieldTarget === person.id && fieldErrors.notes
                                ? true
                                : undefined
                            }
                            aria-describedby={
                              fieldTarget === person.id && fieldErrors.notes
                                ? `${person.id}-notes-error`
                                : undefined
                            }
                            disabled={!canWrite || !audienceReady || !canUpdate}
                            value={edits?.notes ?? person.notes ?? ""}
                            maxLength={2000}
                            onChange={(event) =>
                              editPerson("notes", event.target.value)
                            }
                          />
                          {fieldTarget === person.id && fieldErrors.notes && (
                            <small id={`${person.id}-notes-error`}>
                              {fieldErrors.notes}
                            </small>
                          )}
                          {changed && (
                            <p role="alert">
                              This registration changed. Your edits are
                              retained; discard them to use current saved
                              values.
                            </p>
                          )}
                          {edits && (
                            <Button
                              variant="ghost"
                              disabled={busy || !!uncertain}
                              onClick={clearEdits}
                            >
                              Discard attendee edits
                            </Button>
                          )}
                        </td>
                        <td>
                          <label className="gt-check">
                            <input
                              type="checkbox"
                              disabled={disabled || !!edits}
                              checked={person.attended}
                              onChange={(event) =>
                                attendeeChange(person, {
                                  attended: event.target.checked,
                                })
                              }
                            />
                            {person.attended ? "Checked in" : "Not checked in"}
                          </label>
                          {edits && (
                            <small>
                              Save or discard edited fields before check-in.
                            </small>
                          )}
                        </td>
                        <td>
                          <details>
                            <summary>Edit attendee</summary>
                            <form
                              className="gt-form"
                              onSubmit={(event) => {
                                event.preventDefault();
                                if (edits) attendeeChange(person, edits);
                              }}
                            >
                              <EventField
                                name="attendee_name"
                                label="Name"
                                idPrefix={person.id}
                                errors={
                                  fieldTarget === person.id ? fieldErrors : {}
                                }
                              >
                                <input
                                  required
                                  minLength={2}
                                  maxLength={100}
                                  disabled={
                                    !canWrite || !audienceReady || !canUpdate
                                  }
                                  value={
                                    edits?.attendee_name ?? person.attendee_name
                                  }
                                  onChange={(event) =>
                                    editPerson(
                                      "attendee_name",
                                      event.target.value,
                                    )
                                  }
                                />
                              </EventField>
                              <EventField
                                name="attendee_email"
                                label="Email"
                                idPrefix={person.id}
                                errors={
                                  fieldTarget === person.id ? fieldErrors : {}
                                }
                              >
                                <input
                                  type="email"
                                  required
                                  maxLength={255}
                                  disabled={
                                    !canWrite || !audienceReady || !canUpdate
                                  }
                                  value={
                                    edits?.attendee_email ??
                                    person.attendee_email
                                  }
                                  onChange={(event) =>
                                    editPerson(
                                      "attendee_email",
                                      event.target.value,
                                    )
                                  }
                                />
                              </EventField>
                              <Button disabled={disabled || !edits}>
                                Save attendee changes
                              </Button>
                            </form>
                            <button
                              className="gt-text-button"
                              disabled={disabled || !!edits}
                              onClick={() =>
                                review("remove-" + person.id, person)
                              }
                            >
                              Remove registration
                            </button>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollableTable>
          ) : audience.data && !audience.loading && !audience.error ? (
            <EmptyState title="No registrations yet">
              Committed registrations will appear here. Confirmation delivery is
              tracked separately.
            </EmptyState>
          ) : null}
          <div className="gt-inline-actions">
            <Button
              variant="secondary"
              disabled={
                attendeePage === 1 || audience.loading || busy || !!uncertain
              }
              onClick={() =>
                requestMove(() => loadAttendees(selected, attendeePage - 1))
              }
            >
              Previous
            </Button>
            <span>Page {attendeePage}</span>
            <Button
              variant="secondary"
              disabled={
                attendeePage * 50 >= attendeeTotal ||
                audience.loading ||
                busy ||
                !!uncertain
              }
              onClick={() =>
                requestMove(() => loadAttendees(selected, attendeePage + 1))
              }
            >
              Next
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
