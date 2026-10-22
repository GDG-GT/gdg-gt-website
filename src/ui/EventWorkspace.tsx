import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Link } from "react-router-dom";
import { Plus, ArrowLeft, Save, Users, Copy, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { Button, Field, Badge, EmptyState, SearchBox } from "./primitives";
import type { ChapterEvent } from "./events";
import FormIntegrations from "./forms/FormIntegrations";
import EventMailPanel from "./EventMailPanel";
type Attendee = {
  id: string;
  attendee_name: string;
  attendee_email: string;
  notes: string;
  attended: boolean;
  registration_date: string;
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
  const { userTeams } = useAdmin();
  const [items, setItems] = useState<ChapterEvent[]>([]),
    [draft, setDraft] = useState<Draft | null>(null),
    [selected, setSelected] = useState<ChapterEvent | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]),
    [mode, setMode] = useState<"list" | "edit" | "attendees">("list");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("");
  const [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [attendeePage, setAttendeePage] = useState(1),
    [attendeeTotal, setAttendeeTotal] = useState(0);
  const [confirmation, setConfirmation] = useState<string | null>(null),
    [dirty, setDirty] = useState(false);
  const [showMail, setShowMail] = useState(false),
    navigation = useNavigationSafety();
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ items: ChapterEvent[]; total: number }>(
        `/admin/events?page=${page}`,
      );
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useDraftGuard(dirty, {
    busy,
    label: "Event changes or unsent event mail",
  });
  const change = (key: keyof ChapterEvent, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };
  const edit = (event?: ChapterEvent) => {
    setSelected(event || null);
    setDraft(event ? { ...event } : starter());
    setMode("edit");
    setError("");
    setNotice("");
    setDirty(false);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const event = Object.fromEntries(
        editable
          .filter((key) => draft[key] !== undefined)
          .map((key) => [key, draft[key]]),
      );
      const result = await api<{ event: ChapterEvent }>(
        "/admin/events" + (selected ? "/" + selected.id : ""),
        {
          method: selected ? "PATCH" : "POST",
          protected: true,
          body: { event, ...(selected ? { revision: selected.revision } : {}) },
        },
      );
      setSelected(result.event);
      setDraft(result.event);
      setDirty(false);
      setNotice("Saved. Publishing is a separate action.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const action = async (kind: string) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ event: ChapterEvent }>(
        "/admin/events/" + selected.id + (kind === "archive" ? "" : "/" + kind),
        {
          method: kind === "archive" ? "DELETE" : "POST",
          protected: true,
          body: { revision: selected.revision, event: {} },
        },
      );
      setSelected(result.event);
      setDraft(result.event);
      setDirty(false);
      setConfirmation(null);
      setNotice("Event " + kind + " completed.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const loadAttendees = async (event: ChapterEvent, p = 1) => {
    setSelected(event);
    setMode("attendees");
    setLoading(true);
    setError("");
    try {
      const result = await api<{ items: Attendee[]; total: number }>(
        `/admin/events/${event.id}/attendees?page=${p}`,
      );
      setAttendees(result.items);
      setAttendeeTotal(result.total);
      setAttendeePage(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const attendeeChange = async (
    person: Attendee,
    values: Partial<Attendee>,
    remove = false,
  ) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`/admin/events/${selected.id}/attendees/${person.id}`, {
        method: remove ? "DELETE" : "PATCH",
        protected: true,
        ...(!remove ? { body: values } : {}),
      });
      await loadAttendees(selected, attendeePage);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
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
          <Button onClick={() => edit()}>
            <Plus size={17} />
            Create event
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              if (dirty) {
                setConfirmation("discard");
                return;
              }
              const leave = () => {
                setShowMail(false);
                setMode("list");
              };
              if (navigation) navigation.request(leave);
              else leave();
            }}
          >
            <ArrowLeft size={17} />
            All events
          </Button>
        )}
      </header>
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
      {confirmation && !confirmation.startsWith("remove-") && (
        <section
          className="gt-panel gt-operational-confirm"
          aria-labelledby="event-confirm-title"
        >
          <h2 id="event-confirm-title">
            {confirmation === "discard"
              ? "Discard unsaved edits?"
              : `${confirmation === "archive" ? "Archive" : confirmation === "cancel" ? "Cancel" : "Update"} this event?`}
          </h2>
          <p>
            {confirmation === "discard"
              ? "Your saved event will not change."
              : "Registrations are preserved. Cancelling or archiving closes registration and removes the event from public results."}
          </p>
          <div className="gt-inline-actions">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (confirmation === "discard") {
                  setDirty(false);
                  setMode("list");
                  setConfirmation(null);
                } else action(confirmation);
              }}
            >
              Confirm
            </Button>
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              Keep editing
            </Button>
          </div>
        </section>
      )}
      {mode === "list" && (
        <>
          <div className="gt-toolbar">
            <SearchBox
              value={query}
              onChange={setQuery}
              label="Search this page of events"
              placeholder="Search this page…"
            />
            <span>{total} events</span>
          </div>
          {loading ? (
            <div className="gt-skeleton gt-detail-skeleton" />
          ) : items.length ? (
            <div className="gt-table-wrap">
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
                  {items
                    .filter((e) =>
                      e.title.toLowerCase().includes(query.toLowerCase()),
                    )
                    .map((event) => (
                      <tr key={event.id}>
                        <td>
                          <button
                            className="gt-text-button"
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
                            <Button variant="ghost" onClick={() => edit(event)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
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
            </div>
          ) : (
            <EmptyState title="Create your first chapter event">
              Start with a draft. Only published events appear on the public
              site.
            </EmptyState>
          )}
          <div className="gt-inline-actions">
            <Button
              variant="secondary"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              variant="secondary"
              disabled={page * 50 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {mode === "edit" && draft && (
        <>
          {selected && (
            <div className="gt-inline-actions">
              <FormIntegrations
                kind="event"
                resourceId={selected.id}
                disabled={busy || dirty}
              />
              <span className="gt-helper">
                Save event changes before managing linked forms.
              </span>
            </div>
          )}
          <form onSubmit={save} className="gt-form gt-panel gt-event-editor">
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
                  disabled={busy || dirty}
                  onClick={() =>
                    action(
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
                  disabled={busy || dirty}
                  onClick={() => action("duplicate")}
                >
                  <Copy size={16} />
                  Duplicate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || dirty}
                  onClick={() => setConfirmation("cancel")}
                >
                  Cancel event
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busy || dirty}
                  onClick={() => setConfirmation("archive")}
                >
                  Archive
                </Button>
              </div>
            )}
            <div className="gt-form-grid">
              <Field label="Event title" required>
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={draft.title || ""}
                  onChange={(e) => change("title", e.target.value)}
                />
              </Field>
              <Field
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
              </Field>
              <Field label="Start (UTC)" required>
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
              </Field>
              <Field label="End (UTC)">
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
              </Field>
              <Field label="Display timezone" required>
                <input
                  required
                  value={draft.timezone || ""}
                  onChange={(e) => change("timezone", e.target.value)}
                />
              </Field>
              <Field label="Venue or online label" required>
                <input
                  required
                  maxLength={500}
                  value={draft.location || ""}
                  onChange={(e) => change("location", e.target.value)}
                />
              </Field>
              <Field label="Room">
                <input
                  maxLength={200}
                  value={draft.room || ""}
                  onChange={(e) => change("room", e.target.value)}
                />
              </Field>
              <Field label="Event type">
                <input
                  required
                  maxLength={50}
                  value={draft.type || ""}
                  onChange={(e) => change("type", e.target.value)}
                />
              </Field>
              <Field label="Experience level">
                <select
                  value={draft.level}
                  onChange={(e) => change("level", e.target.value)}
                >
                  {["open_for_all", "beginner", "intermediate", "advanced"].map(
                    (v) => (
                      <option key={v} value={v}>
                        {v.replace(/_/g, " ")}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Registration mode">
                <select
                  value={draft.registration_type}
                  onChange={(e) => change("registration_type", e.target.value)}
                >
                  {["internal", "external", "both"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Total capacity"
                hint="Includes internal registrations plus the external attendee count. Empty means uncapped."
              >
                <input
                  type="number"
                  min={1}
                  value={draft.max_participants ?? ""}
                  onChange={(e) =>
                    change(
                      "max_participants",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </Field>
              <Field label="External attendee count">
                <input
                  type="number"
                  min={0}
                  value={draft.external_attendees ?? 0}
                  onChange={(e) =>
                    change("external_attendees", Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Owning team">
                <select
                  value={draft.team_id || ""}
                  onChange={(e) => change("team_id", e.target.value || null)}
                >
                  <option value="">Chapter-wide (Admins only)</option>
                  {userTeams.map((m) => (
                    <option key={m.team_id} value={m.team_id}>
                      {m.team?.name || m.team_id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Short summary">
              <textarea
                maxLength={500}
                rows={2}
                value={draft.short_description || ""}
                onChange={(e) => change("short_description", e.target.value)}
              />
            </Field>
            <Field label="Description" required>
              <textarea
                required
                minLength={2}
                maxLength={40000}
                rows={6}
                value={draft.description || ""}
                onChange={(e) => change("description", e.target.value)}
              />
            </Field>
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
                <Field key={key} label={label}>
                  <input
                    maxLength={2000}
                    value={draft[key] || ""}
                    onChange={(e) => change(key, e.target.value)}
                  />
                </Field>
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
              <Field key={key} label={label}>
                <textarea
                  rows={3}
                  maxLength={20000}
                  value={draft[key] || ""}
                  onChange={(e) => change(key, e.target.value)}
                />
              </Field>
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
              <Button disabled={busy} type="submit">
                <Save size={17} />
                {busy ? "Saving…" : "Save draft changes"}
              </Button>
              <span className="gt-helper">
                {dirty ? "Unsaved changes" : "All changes saved"}
              </span>
            </div>
          </form>
        </>
      )}
      {mode === "attendees" && selected && (
        <section>
          <h2>{selected.title}</h2>
          <p>
            {attendeeTotal} registrations ·{" "}
            {attendees.filter((p) => p.attended).length} checked in on this page
          </p>
          <div className="gt-inline-actions">
            <a
              className="gt-button gt-button-secondary"
              href={`/api/v1/admin/events/${selected.id}/attendees/export`}
            >
              Export CSV
            </a>
            <Button
              variant="secondary"
              disabled={showMail}
              onClick={() => setShowMail(true)}
            >
              Email registered attendees
            </Button>
          </div>
          {showMail && (
            <EventMailPanel
              key={selected.id}
              eventId={selected.id}
              onClose={() => setShowMail(false)}
              onQueued={(count) => {
                setShowMail(false);
                setNotice(
                  `${count} audience-bound messages are queued. Delivery runs separately; queued is not delivered.`,
                );
              }}
            />
          )}
          {loading ? (
            <div className="gt-skeleton gt-detail-skeleton" />
          ) : attendees.length ? (
            <div className="gt-table-wrap">
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
                  {attendees.map((person) => (
                    <tr key={person.id}>
                      <td>
                        {person.attendee_name}
                        <small>{person.attendee_email}</small>
                      </td>
                      <td>
                        <input
                          aria-label={"Notes for " + person.attendee_name}
                          defaultValue={person.notes || ""}
                          maxLength={2000}
                          onBlur={(e) => {
                            if (e.target.value !== (person.notes || ""))
                              attendeeChange(person, { notes: e.target.value });
                          }}
                        />
                      </td>
                      <td>
                        <label className="gt-check">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={person.attended}
                            onChange={(e) =>
                              attendeeChange(person, {
                                attended: e.target.checked,
                              })
                            }
                          />
                          {person.attended ? "Checked in" : "Not checked in"}
                        </label>
                      </td>
                      <td>
                        <details>
                          <summary>Edit attendee</summary>
                          <form
                            className="gt-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const data = new FormData(e.currentTarget);
                              attendeeChange(person, {
                                attendee_name: String(data.get("name")),
                                attendee_email: String(data.get("email")),
                              });
                            }}
                          >
                            <Field label="Name">
                              <input
                                name="name"
                                required
                                minLength={2}
                                defaultValue={person.attendee_name}
                              />
                            </Field>
                            <Field label="Email">
                              <input
                                name="email"
                                type="email"
                                required
                                defaultValue={person.attendee_email}
                              />
                            </Field>
                            <Button disabled={busy}>Save correction</Button>
                          </form>
                          <button
                            className="gt-text-button"
                            disabled={busy}
                            onClick={() => {
                              setConfirmation("remove-" + person.id);
                            }}
                          >
                            Remove registration
                          </button>
                          {confirmation === "remove-" + person.id && (
                            <Button
                              variant="danger"
                              onClick={() => {
                                attendeeChange(person, {}, true);
                                setConfirmation(null);
                              }}
                            >
                              Confirm removal
                            </Button>
                          )}
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No registrations yet">
              Committed registrations will appear here. Confirmation delivery is
              tracked separately.
            </EmptyState>
          )}
          <div className="gt-inline-actions">
            <Button
              variant="secondary"
              disabled={attendeePage === 1 || loading}
              onClick={() => loadAttendees(selected, attendeePage - 1)}
            >
              Previous
            </Button>
            <span>Page {attendeePage}</span>
            <Button
              variant="secondary"
              disabled={attendeePage * 50 >= attendeeTotal || loading}
              onClick={() => loadAttendees(selected, attendeePage + 1)}
            >
              Next
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
