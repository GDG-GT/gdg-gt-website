import ActionFeedback from "@/ui/ActionFeedback";
import { useEffect, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
import { Button, Field } from "../primitives";

type Security = { version: number; rotatedAt: string; checkedAt: string; activeAccounts: number; lockedAccounts: number; setupRequired: number; activeSessions: number };
type Intent = { key: string; version: number; code: string; createdAt: number };
export default function AccountSecurity() {
  const { currentAdmin } = useAdmin();
  const [expanded, setExpanded] = useState(false);
  return currentAdmin?.role === "super_admin" ? <details className="gt-panel gt-account-security" onToggle={(e) => { if (e.currentTarget.open) setExpanded(true); }}>
    <summary>Account security</summary>
    {expanded && <SecurityControls />}
  </details> : null;
}
function SecurityControls() {
  const [refresh, setRefresh] = useState(0), [open, setOpen] = useState(false),
    [code, setCode] = useState(""), [repeat, setRepeat] = useState(""),
    [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""),
    [reviewedVersion, setReviewedVersion] = useState<number>(),
    [notice, setNotice] = useState(""), [error, setError] = useState(""),
    [uncertain, setUncertain] = useState<Intent>(), [retryAllowed, setRetryAllowed] = useState(false),
    [blocked, setBlocked] = useState(false);
  const read = usePrivateRead<Security>(blocked ? undefined : "/admin/security", refresh),
    mutation = usePrivateMutation("account-security"), { isOnline } = useOnlineStatus();
  const ready = isOnline && !read.loading && !read.error && !!read.data && !blocked;
  useDraftGuard(open && (!!code || !!password || !!uncertain), { busy: mutation.busy, label: "Gate security change" });
  useEffect(() => {
    if (read.denied) {
      setCode(""); setRepeat(""); setPassword(""); setConfirmation("");
      setUncertain(undefined); setReviewedVersion(undefined); setOpen(false);
    }
  }, [read.denied]);
  const clear = () => {
    setCode(""); setRepeat(""); setPassword(""); setConfirmation("");
    setUncertain(undefined); setRetryAllowed(false); setReviewedVersion(undefined); setOpen(false);
  };
  const fail = (e: unknown) => {
    setError(e instanceof Error ? e.message : "The security request could not complete.");
    if (e instanceof ApiFailure && [401, 403, 404].includes(e.status) && e.code !== "PASSWORD_CONFIRMATION_FAILED") {
      clear(); read.clear(); setBlocked(true);
    }
  };
  async function rotate(intent: Intent) {
    const controller = mutation.begin();
    if (!controller) return;
    setError(""); setNotice(""); setRetryAllowed(false);
    const currentPassword = password;
    setPassword("");
    try {
      await api("/admin/security/gate", { method: "POST", idempotencyKey: intent.key,
        body: { code: intent.code, expectedVersion: intent.version, currentPassword, confirmation },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      if (!mutation.current(controller)) return;
      clear(); setNotice("Gate rotated. The previous code and all previous gate passes are invalid. Existing signed-in sessions remain active."); setRefresh((v) => v + 1);
    } catch (e) {
      if (!mutation.current(controller)) return;
      fail(e);
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(intent); setError("The rotation result is unconfirmed. Check the original result before trying again.");
      } else if (e instanceof ApiFailure && e.status === 409) {
        setReviewedVersion(undefined); setRefresh((v) => v + 1);
      }
    } finally { mutation.finish(controller); }
  }
  async function inspect() {
    if (!uncertain) return;
    const controller = mutation.begin(); if (!controller) return;
    setError(""); setRetryAllowed(false);
    try {
      const result = await api<{ committed: boolean; version: number }>("/admin/security/gate?key=" + uncertain.key,
        { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]) });
      if (!mutation.current(controller)) return;
      if (result.committed) { clear(); setNotice("The original rotation completed. No second rotation was sent."); setRefresh((v) => v + 1); }
      else if (result.version === uncertain.version && Date.now() - uncertain.createdAt < 1800000) {
        setRetryAllowed(true); setNotice("The original rotation has not completed. Re-enter your password to retry the identical change.");
      } else { clear(); setNotice("The reviewed gate changed or the review expired. Review current security status before a new rotation."); setRefresh((v) => v + 1); }
    } catch (e) { if (mutation.current(controller)) fail(e); }
    finally { mutation.finish(controller); }
  }
  return <section className="gt-form" aria-labelledby="account-security-heading">
    <header className="gt-admin-page-heading"><div><h2 id="account-security-heading">Security overview</h2><p>Super Admin controls and current account totals.</p></div>
      <Button variant="secondary" disabled={!isOnline || mutation.busy} onClick={() => { setBlocked(false); setRefresh((v) => v + 1); }}>Refresh security status</Button></header>
    {!isOnline && <p role="status">You are offline. Security changes wait for connectivity.</p>}
    {read.loading && <p role="status">Loading security status… Refresh again to restart a stuck read.</p>}
    {read.error && <p role="alert">{read.error}</p>}
    {error && <p role="alert" className="gt-form-error">{error}</p>}
    {notice && <ActionFeedback message={notice} />}
    {read.data && <><dl className="gt-security-metrics">
      <div><dt>Active accounts</dt><dd>{read.data.activeAccounts}</dd></div>
      <div><dt>Active sessions</dt><dd>{read.data.activeSessions}</dd></div>
      <div><dt>Temporarily locked accounts</dt><dd>{read.data.lockedAccounts}</dd></div>
      <div><dt>Accounts awaiting setup</dt><dd>{read.data.setupRequired}</dd></div>
      <div><dt>Gate version</dt><dd>{read.data.version}</dd></div>
      <div><dt>Gate last changed</dt><dd>{new Date(read.data.rotatedAt).toLocaleString()}</dd></div>
    </dl><p className="gt-helper">Snapshot from {new Date(read.data.checkedAt).toLocaleString()}. Review individual sessions in the account directory below. <a href="/admin/operations">View operational alerts</a>.</p></>}
    {!open ? <Button variant="secondary" disabled={!ready || mutation.busy} onClick={() => { setOpen(true); setNotice(""); setError(""); }}>Rotate gate code</Button> : <form className="gt-form" onSubmit={(event) => {
      event.preventDefault();
      if (!ready || mutation.busy || code !== repeat || !code.trim() || uncertain) return;
      if (reviewedVersion === undefined) { setReviewedVersion(read.data!.version); return; }
      if (reviewedVersion !== read.data!.version) { setError("Security status changed. Review the current version again."); setReviewedVersion(undefined); return; }
      if (confirmation === "ROTATE GATE") void rotate({ key: crypto.randomUUID(), version: reviewedVersion, code, createdAt: Date.now() });
    }}>
      <h3>Rotate the chapter gate</h3>
      <p>The old code and existing 15-minute gate passes stop working immediately. Existing signed-in sessions stay active; revoke those from the account directory when needed. Share the new code through your chapter’s private channel.</p>
      {!uncertain && <><Field label="New gate code" hint="24–128 characters. This code is never shown again after saving."><input type="password" autoComplete="off" minLength={24} maxLength={128} required value={code} disabled={mutation.busy || reviewedVersion !== undefined} onChange={(e) => setCode(e.target.value)} /></Field>
      <Field label="Repeat new gate code"><input type="password" autoComplete="off" required minLength={24} maxLength={128} value={repeat} disabled={mutation.busy || reviewedVersion !== undefined} onChange={(e) => setRepeat(e.target.value)} /></Field>
      {code !== repeat && repeat && <p role="alert">The new codes must match.</p>}</>}
      {(reviewedVersion !== undefined || uncertain) && <>
        <p>Reviewed gate version: {uncertain?.version ?? reviewedVersion}. Confirm the immediate invalidation before proceeding.</p>
        <Field label="Your current password"><input type="password" autoComplete="current-password" maxLength={128} required value={password} disabled={mutation.busy} onChange={(e) => setPassword(e.target.value)} /></Field>
        <Field label="Type ROTATE GATE to confirm"><input autoComplete="off" required value={confirmation} disabled={mutation.busy} onChange={(e) => setConfirmation(e.target.value)} /></Field>
      </>}
      <div className="gt-button-row">
        {uncertain ? <><Button type="button" variant="secondary" disabled={!isOnline || mutation.busy} onClick={inspect}>Check original rotation result</Button>
          {retryAllowed && <Button type="button" disabled={!ready || mutation.busy || !password || confirmation !== "ROTATE GATE"} onClick={() => rotate(uncertain)}>Retry reviewed rotation</Button>}</> :
          <Button disabled={!ready || mutation.busy || code !== repeat || code.length < 24 || (reviewedVersion !== undefined && (!password || confirmation !== "ROTATE GATE"))}>{mutation.busy ? "Rotating…" : reviewedVersion === undefined ? "Review gate rotation" : "Confirm gate rotation"}</Button>}
        {!uncertain && <Button type="button" variant="ghost" disabled={mutation.busy} onClick={reviewedVersion !== undefined ? () => setReviewedVersion(undefined) : clear}>{reviewedVersion !== undefined ? "Edit new code" : "Cancel rotation"}</Button>}
      </div>
    </form>}
  </section>;
}
