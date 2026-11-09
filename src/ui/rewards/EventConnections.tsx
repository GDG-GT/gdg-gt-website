import ActionFeedback from "@/ui/ActionFeedback";
import { confirmAction } from "@/lib/app-dialogs";
import { useCallback, useEffect, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { Button, Field } from "../primitives";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import NfcControls from "./NfcControls";
type Connection = {
  id: string;
  title: string;
  origin: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  activity_id: string | null;
  revision: number;
};
type Checkin = {
  id: string;
  event_id: string;
  name: string;
  state: string;
  completed_at: string | null;
};
type Review = {
  member: { name: string };
  registration: { status: string; checkedIn: boolean };
  reviewId: string | null;
};
type Attempt = { action: string; body: Record<string, unknown>; key: string };
export default function EventConnections({
  activities = [],
  initialCredential,
  checkinOnly = false,
  active = true,
}: {
  activities?: { id: string; title: string }[];
  initialCredential?: string;
  checkinOnly?: boolean;
  active?: boolean;
}) {
  const [data, setData] = useState<{
      events: Connection[];
      checkins: Checkin[];
    }>({ events: [], checkins: [] }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [formVersion, setFormVersion] = useState(0),
    [edit, setEdit] = useState<Connection>(),
    [secret, setSecret] = useState(""),
    [attempt, setAttempt] = useState<Attempt>(),
    [selected, setSelected] = useState(""),
    [review, setReview] = useState<Review>();
  useDraftGuard(dirty || !!secret || !!attempt, {
    busy,
    label: "Event connection changes",
  });
  const load = useCallback(async () => {
    try {
      const result = await api<typeof data>("/admin/reward-events");
      if (!Array.isArray(result.events) || !Array.isArray(result.checkins))
        throw Error("Event connections could not load.");
      setData(result);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Event connections could not load.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const run = async (a: Attempt) => {
    if (attempt && attempt.key !== a.key) {
      setError("Retry the previous request first.");
      return;
    }
    setAttempt(a);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await api<Record<string, unknown>>(
        "/admin/reward-events/" + a.action,
        { method: "POST", body: a.body, idempotencyKey: a.key },
      );
      setAttempt(undefined);
      if (a.action === "lookup") setReview(r as unknown as Review);
      else if (a.action === "health") setNotice("Event connection verified.");
      else if (a.action === "confirm") {
        setReview(undefined);
        setNotice(
          "Event check-in confirmed. Chapter points have not been awarded.",
        );
      } else if (a.action === "points")
        setNotice(
          r.alreadyAwarded
            ? "Chapter points were already awarded."
            : "Chapter points awarded.",
        );
      else {
        if (a.action === "save") {
          setDirty(false);
          setEdit(undefined);
          setFormVersion((v) => v + 1);
        }
        setNotice("Event connection saved.");
        if (r.credential) setSecret(String(r.credential));
      }
      await load();
    } catch (e) {
      setError(
        (e instanceof Error
          ? e.message
          : "This request could not be confirmed.") +
          " Retry the same request if its outcome is uncertain.",
      );
      if (e instanceof ApiFailure && e.status < 500) setAttempt(undefined);
    } finally {
      setBusy(false);
    }
  };
  const action = (action: string, body: Record<string, unknown>) =>
    void run({ action, body, key: crypto.randomUUID() });
  return (
    <section
      className="rewards-event-connections"
      aria-label="External event connections"
    >
      <h2>{checkinOnly ? "External event check-in" : "Event connections"}</h2>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void load()}
          >
            Reload event connections
          </Button>
        </div>
      )}
      {notice && <ActionFeedback message={notice} />}
      {attempt && !busy && (
        <Button onClick={() => void run(attempt)}>
          Retry same event request
        </Button>
      )}
      {secret && (
        <section aria-label="Event server credential">
          <h3>Event server credential</h3>
          <p>
            Save this in the event backend’s encrypted environment settings.
            Never put it in browser code.
          </p>
          <textarea readOnly aria-label="Server credential" value={secret} />
          <Button onClick={() => setSecret("")}>
            I have saved this credential
          </Button>
        </section>
      )}
      {!checkinOnly && (
        <>
          <form
            key={(edit?.id || "new") + formVersion}
            className="rewards-profile-form"
            onChange={() => setDirty(true)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const opens = new Date(String(f.get("opens"))),
                closes = new Date(String(f.get("closes")));
              if (
                !Number.isFinite(opens.getTime()) ||
                !Number.isFinite(closes.getTime())
              ) {
                setError("Enter valid check-in dates.");
                return;
              }
              action("save", {
                ...(edit ? { id: edit.id, revision: edit.revision } : {}),
                title: String(f.get("title")),
                origin: String(f.get("origin")),
                opensAt: opens.toISOString(),
                closesAt: closes.toISOString(),
                active: f.get("active") === "on",
                activityId: String(f.get("activity")) || null,
              });
            }}
          >
            <fieldset
              disabled={busy || !!attempt || !!secret}
              className="rewards-form-fields"
            >
              <h3>{edit ? "Edit connection" : "Connect an event"}</h3>
              <Field label="Event name">
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={edit?.title}
                />
              </Field>
              <Field
                label="Event website"
                hint="HTTPS origin ending in /, for example https://devfest.example.org/"
              >
                <input
                  name="origin"
                  type="url"
                  required
                  defaultValue={edit?.origin}
                />
              </Field>
              <Field label="Check-in opens">
                <input
                  name="opens"
                  type="datetime-local"
                  required
                  defaultValue={edit ? localDate(edit.opens_at) : ""}
                />
              </Field>
              <Field
                label="Check-in closes"
                hint="Up to 31 days after opening."
              >
                <input
                  name="closes"
                  type="datetime-local"
                  required
                  defaultValue={edit ? localDate(edit.closes_at) : ""}
                />
              </Field>
              <Field label="Optional chapter points activity">
                <select name="activity" defaultValue={edit?.activity_id || ""}>
                  <option value="">No chapter points</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="rewards-checkbox">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={edit?.is_active}
                />
                Enable event connection
              </label>
              <Button disabled={busy || !!attempt || !!secret}>
                {edit ? "Save event connection" : "Create event connection"}
              </Button>
              {(edit || dirty) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={async () => {
                    if (
                      !dirty ||
                      (await confirmAction(
                        "Discard these event connection edits?",
                      ))
                    ) {
                      setEdit(undefined);
                      setDirty(false);
                      setFormVersion((v) => v + 1);
                    }
                  }}
                >
                  Cancel changes
                </Button>
              )}
            </fieldset>
          </form>
          <ul className="gt-file-list">
            {data.events.map((e) => (
              <li key={e.id}>
                <div>
                  <strong>{e.title}</strong>
                  <p>
                    {e.origin} · {e.is_active ? "Enabled" : "Disabled"}
                  </p>
                  <small>Event ID: {e.id}</small>
                </div>
                <div className="gt-button-row">
                  <Button
                    disabled={busy || !!attempt || !!secret}
                    variant="ghost"
                    onClick={async () => {
                      if (
                        !dirty ||
                        (await confirmAction("Discard current edits?"))
                      ) {
                        setEdit(e);
                        setDirty(false);
                      }
                    }}
                  >
                    Edit {e.title}
                  </Button>
                  <Button
                    disabled={busy || !!attempt}
                    variant="secondary"
                    onClick={() => action("health", { id: e.id })}
                  >
                    Test {e.title}
                  </Button>
                  <Button
                    disabled={busy || !!attempt || !!secret}
                    variant="ghost"
                    onClick={async () => {
                      if (
                        await confirmAction(
                          "Rotate this event’s key? The previous key stops working immediately.",
                          {
                            title: "Rotate event key?",
                            confirmLabel: "Rotate key",
                            cancelLabel: "Cancel",
                            danger: true,
                          },
                        )
                      )
                        action("rotate", { id: e.id, revision: e.revision });
                    }}
                  >
                    Rotate key for {e.title}
                  </Button>
                  <Button
                    disabled={busy || !!attempt}
                    variant="danger"
                    onClick={async () => {
                      if (
                        await confirmAction(
                          "Disable this event connection and revoke its key?",
                          {
                            title: "Revoke event connection?",
                            confirmLabel: "Revoke connection",
                            cancelLabel: "Cancel",
                            danger: true,
                          },
                        )
                      )
                        action("revoke", { id: e.id, revision: e.revision });
                    }}
                  >
                    Revoke {e.title}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>Event check-in</h3>
      <Field label="Check-in event">
        <select
          value={selected}
          disabled={busy || !!attempt}
          onChange={(e) => {
            setSelected(e.target.value);
            setReview(undefined);
          }}
        >
          <option value="">Choose an event</option>
          {data.events
            .filter((e) => e.is_active)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
        </select>
      </Field>
      {selected && initialCredential && (
        <Button
          disabled={busy || !!attempt}
          onClick={async () => {
            setReview(undefined);
            action("lookup", {
              eventId: selected,
              credential: initialCredential,
            });
          }}
        >
          Check this card for the event
        </Button>
      )}
      {active && selected && !initialCredential && !busy && !attempt && (
        <NfcControls
          onRead={(credential) => {
            setReview(undefined);
            action("lookup", { eventId: selected, credential });
          }}
        />
      )}
      {review && (
        <section aria-label="Event registration result">
          <h3>{review.member.name}</h3>
          <p>
            Active community member ·{" "}
            {review.registration.checkedIn
              ? "Already checked in"
              : (
                  {
                    registered: "Registration confirmed",
                    not_registered: "Not registered",
                    waitlisted: "Waitlisted",
                    cancelled: "Registration cancelled",
                    unlinked: "Event account not linked",
                  } as Record<string, string>
                )[review.registration.status]}
          </p>
          {review.reviewId && (
            <Button
              disabled={busy || !!attempt}
              onClick={() => action("confirm", { reviewId: review.reviewId })}
            >
              {review.registration.checkedIn
                ? "Confirm existing check-in"
                : "Confirm event check-in"}
            </Button>
          )}
        </section>
      )}
      {!checkinOnly && (
        <>
          <h3>Recent event check-ins</h3>
          <ul className="gt-file-list">
            {data.checkins.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <p>
                    {data.events.find((e) => e.id === c.event_id)?.title} ·{" "}
                    {c.state === "completed"
                      ? "Confirmed"
                      : "Awaiting confirmation"}
                  </p>
                </div>
                {c.state === "completed" &&
                  data.events.find((e) => e.id === c.event_id)?.activity_id && (
                    <Button
                      disabled={busy || !!attempt}
                      variant="secondary"
                      onClick={async () => {
                        if (
                          await confirmAction(
                            "Award the linked activity’s chapter points for this confirmed check-in?",
                            {
                              title: "Award chapter points?",
                              confirmLabel: "Award points",
                              cancelLabel: "Cancel",
                            },
                          )
                        )
                          action("points", { checkinId: c.id });
                      }}
                    >
                      Award chapter points to {c.name}
                    </Button>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}
      {!data.events.length && <p>No event connections yet.</p>}
    </section>
  );
}
function localDate(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
