import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "../primitives";
import { useDraftGuard } from "@/hooks/useDraftGuard";
type Event = { id: string; title: string; origin: string };
export default function MemberEventLinks({ csrf }: { csrf: string }) {
  const [data, setData] = useState<{
      events: Event[];
      links: { eventId: string }[];
    }>({ events: [], links: [] }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState<{
      value: string;
      expires: string;
      eventId: string;
    }>();
  useDraftGuard(!!code, { busy, label: "Event account link code" });
  const load = async () => {
    try {
      const result = await api<{
        events: Event[];
        links: { eventId: string }[];
      }>("/rewards/event-links");
      if (!Array.isArray(result.events) || !Array.isArray(result.links))
        throw Error("Event links could not load.");
      setData(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Event links could not load.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const write = async (eventId: string, action: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/v1/rewards/event-links/" + action, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-rewards-csrf": csrf },
        body: JSON.stringify({ eventId }),
      });
      const v = await r.json();
      if (!r.ok)
        throw Error(v.error?.message || "Event link could not be saved.");
      if (action === "code")
        setCode({ value: v.data.code, expires: v.data.expiresAt, eventId });
      else {
        setCode(undefined);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  if (!data.events.length && !error) return null;
  return (
    <section aria-label="Your event connections">
      <h2>Your event connections</h2>
      {error && <p role="alert">{error}</p>}
      {error && (
        <Button disabled={busy} onClick={() => void load()}>
          Reload event links
        </Button>
      )}
      {data.events.map((e) => (
        <div key={e.id}>
          <h3>{e.title}</h3>
          <a href={e.origin} target="_blank" rel="noopener noreferrer">
            Open event website ↗
          </a>
          {data.links.some((l) => l.eventId === e.id) ? (
            <>
              <p>Event account linked.</p>
              <Button
                disabled={busy}
                variant="ghost"
                onClick={() => {
                  if (
                    window.confirm(
                      "Disconnect your chapter membership from this event?",
                    )
                  )
                    void write(e.id, "unlink");
                }}
              >
                Disconnect {e.title}
              </Button>
            </>
          ) : (
            <Button
              disabled={busy || !!code}
              variant="secondary"
              onClick={() => void write(e.id, "code")}
            >
              Get link code for {e.title}
            </Button>
          )}
        </div>
      ))}
      {code && (
        <section aria-label="Event account link code">
          <p>
            Paste this code into your signed-in account on{" "}
            {data.events.find((e) => e.id === code.eventId)?.title}. It expires
            at {new Date(code.expires).toLocaleTimeString()} and links your
            chapter membership to that event account.
          </p>
          <input readOnly aria-label="Event link code" value={code.value} />
          <Button
            onClick={() => {
              setCode(undefined);
              void load();
            }}
          >
            Done with this code
          </Button>
        </section>
      )}
    </section>
  );
}
