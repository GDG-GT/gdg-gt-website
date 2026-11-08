import EventConnections from "./EventConnections";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAdmin } from "@/contexts/AdminContext";
import { api, ApiFailure } from "@/lib/api";
import { Button, Brand, Field } from "../primitives";
import { parseCardPayload } from "../../../shared/rewards.mjs";
import "./rewards.css";
export default function TapHandoff() {
  const { isSuperAdmin, isLoading } = useAdmin(),
    [eventMode, setEventMode] = useState(false),
    [credential, setCredential] = useState<string | null>(null),
    [member, setMember] = useState<{
      id: string;
      name: string;
      email: string;
      points: number;
      credentialId: string;
    }>(),
    [activities, setActivities] = useState<
      {
        id: string;
        title: string;
        points: number;
        opens_at: string;
        closes_at: string;
      }[]
    >([]),
    [selected, setSelected] = useState(""),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    setCredential(
      parseCardPayload(window.location.href, window.location.origin),
    );
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
    window.dispatchEvent(new Event("gdg:auth-needed"));
  }, []);
  const resolve = async () => {
    if (!credential) return;
    setBusy(true);
    setError("");
    try {
      const m = await api<NonNullable<typeof member>>(
        "/admin/rewards/resolve",
        { method: "POST", body: { credential } },
      );
      setMember(m);
      setActivities(
        (await api<{ activities: typeof activities }>("/admin/rewards"))
          .activities,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This card could not be checked.",
      );
    } finally {
      setBusy(false);
    }
  };
  const award = async () => {
    if (!member || !selected) return;
    setBusy(true);
    setError("");
    try {
      await api("/admin/rewards/award", {
        method: "POST",
        body: {
          memberId: member.id,
          activityId: selected,
          credentialId: member.credentialId,
        },
        idempotencyKey: key,
      });
      setDone(true);
      setCredential(null);
    } catch (e) {
      setError(
        e instanceof ApiFailure
          ? e.message
          : "The result is uncertain. Retry this same award; a second tap cannot create another award for the same activity.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rewards-public">
      <header className="rewards-public-header">
        <Brand compact />
      </header>
      <div className="rewards-public-main">
        <h1>Member card check-in</h1>
        <p>
          Stay online and confirm the person and activity before awarding
          points.
        </p>
        {isSuperAdmin && credential && (
          <div className="gt-button-row">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setEventMode(false)}
            >
              Chapter activity
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setEventMode(true)}
            >
              External event
            </Button>
          </div>
        )}
        {isSuperAdmin && credential && (
          <div hidden={!eventMode}>
            <EventConnections
              active={eventMode}
              checkinOnly
              initialCredential={credential}
            />
          </div>
        )}
        {!eventMode &&
          (isLoading ? (
            <p role="status">Loading your session…</p>
          ) : !isSuperAdmin ? (
            <>
              <p>
                A chapter Super Admin needs to open this card in their signed-in
                browser.
              </p>
              <Link to="/">Return to the chapter website</Link>
            </>
          ) : done ? (
            <>
              <h2 role="status">Check-in recorded</h2>
              <p>{member?.name} received points for this activity.</p>
              <Link to="/admin/rewards">Open points & cards</Link>
            </>
          ) : !credential ? (
            <p>
              No valid card was found. Tap the card again and open its
              notification.
            </p>
          ) : !member ? (
            <Button disabled={busy} onClick={() => void resolve()}>
              Read this member card
            </Button>
          ) : (
            <section>
              <h2>{member.name}</h2>
              <p>{member.email}</p>
              <p>{member.points} points</p>
              <Field label="Check-in activity">
                <select
                  value={selected}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setReview(false);
                  }}
                >
                  <option value="">Choose an activity</option>
                  {activities
                    .filter(
                      (a) =>
                        Date.parse(a.opens_at) <= Date.now() &&
                        Date.parse(a.closes_at) >= Date.now(),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {a.points} points
                      </option>
                    ))}
                </select>
              </Field>
              {review ? (
                <>
                  <p>
                    Confirm {member.name} is present for{" "}
                    {activities.find((a) => a.id === selected)?.title}.
                  </p>
                  <Button disabled={busy} onClick={() => void award()}>
                    Confirm award
                  </Button>
                </>
              ) : (
                <Button
                  disabled={busy || !selected}
                  onClick={() => setReview(true)}
                >
                  Review award
                </Button>
              )}
            </section>
          ))}
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
