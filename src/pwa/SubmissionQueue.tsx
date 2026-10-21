import { useEffect, useState } from "react";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { publicQueue } from "../../shared/public-queue.mjs";
import { Button, Field } from "@/ui/primitives";
import { savePendingSubmission } from "./queue-actions";
export function QueueRuntime() {
  const [clearFailed, setClearFailed] = useState(false);
  useEffect(() => {
    let paused = false;
    const clearFailure = () => { paused = true; setClearFailed(true); };
    const replay = () => { if (!paused && navigator.onLine) void publicQueue.replay().catch(() => {}).finally(() => window.dispatchEvent(new Event("gdg:queue-changed"))); };
    replay(); window.addEventListener("online", replay); window.addEventListener("gdg:queue-added", replay);
    window.addEventListener("gdg:queue-clear-failed", clearFailure);
    const timer = window.setInterval(replay, 30000);
    return () => { clearInterval(timer); window.removeEventListener("online", replay); window.removeEventListener("gdg:queue-added", replay); window.removeEventListener("gdg:queue-clear-failed", clearFailure); };
  }, []);
  return clearFailed ? <aside className="gt-pwa-update" role="alert"><p>You are signed out, but device storage could not be cleared. Close other GDG tabs and review pending submissions in Offline help. Automatic replay in this tab is paused.</p><a href="/offline">Review device storage</a></aside> : null;
}
type QueueRow = { id: string; kind: string; slug: string | null; state: string; reason: string; expiresAt: number; attempts: number; nextAt: number; leaseUntil: number };
export default function SubmissionQueue() {
  const [items, setItems] = useState<QueueRow[]>([]), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""), [consent, setConsent] = useState(false);
  useDraftGuard(!!email || consent, { busy, label: "Unsent pending newsletter signup" });
  useEffect(() => {
    if (!email && !consent) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [email, consent]);
  useEffect(() => {
    let active = true;
    const load = () => void publicQueue.list().then((rows) => { if (active) { setItems(rows); setError(""); } }).catch((e: Error) => { if (active) setError(e.message); });
    load(); window.addEventListener("gdg:queue-changed", load);
    const timer = window.setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); window.removeEventListener("gdg:queue-changed", load); };
  }, []);
  const operation = async (run: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError("");
    try { await run(); setItems(await publicQueue.list()); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="gt-form" aria-label="Pending submissions">
    <h2>Pending submissions on this device</h2>
    <p>Only event registrations and newsletter signups can be queued. Saving here is not a confirmed registration or subscription. The app retries when open and online; iOS may not replay while the app is closed. Signing out clears this device’s queue.</p>
    {error && <p role="alert" className="gt-form-error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!items.length ? <p>No pending submissions are stored on this device.</p> : <ul className="gt-form-integration-list">{items.map((item) => <li key={item.id}><div>
      <strong>{item.kind === "event" ? `Event: ${item.slug}` : "Newsletter signup"}</strong>
      <p>{item.state === "accepted" ? (item.kind === "event" ? "Registration accepted by the server." : "Signup submitted. Check your email for confirmation.") : item.reason}</p>
      {item.state === "pending" && <p className="gt-helper">Expires {new Date(item.expiresAt).toLocaleString()} · {item.attempts} attempts. Your place is not reserved while pending.</p>}
      {item.slug && <a href={`/events/${item.slug}`}>Review original event</a>}
    </div><div className="gt-inline-actions">
      {item.state === "pending" && <Button variant="secondary" disabled={busy || item.leaseUntil > Date.now()} onClick={() => void operation(async () => { await publicQueue.retry(item.id); await publicQueue.replay(); })}>Retry now</Button>}
      <Button variant="ghost" disabled={busy} onClick={() => void operation(() => publicQueue.discard(item.id))}>{item.state === "accepted" ? "Dismiss" : "Discard"}</Button>
    </div></li>)}</ul>}
    <details><summary>Save a newsletter signup for later</summary><form className="gt-form" onSubmit={(event) => { event.preventDefault(); void operation(async () => {
      await savePendingSubmission("newsletter", { email, website: "" }); setEmail(""); setConsent(false); setNotice("Pending signup saved on this device. It is not subscribed until the server accepts it and you confirm by email.");
    }); }}>
      <Field label="Newsletter email address" hint="Use your subscription email, never an officer access code or password."><input type="email" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <label className="gt-check"><input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} />Save this email on this device for up to 48 hours and submit it automatically when online.</label>
      <Button type="submit" disabled={busy || !consent || !email}>Save pending signup</Button>
    </form></details>
  </section>;
}
