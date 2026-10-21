import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Button, EmptyState, Field } from "../primitives";
type Privacy = {
  formId: string; revision: number; held: boolean; reason: string; draftDays: number;
  canRelease: boolean; totalResponses: number; heldResponses: number; dueResponses: number;
  nextExpiry: string | null; pendingFiles: number; responseId?: string; responseRevision?: number;
  responseHeld?: boolean; responseReason?: string; responseExpiresAt?: string; effectiveResponseHold?: boolean;
};
export default function PrivacyPanel({ formId, responseId, onStateChange, onSaved }: {
  formId: string; responseId?: string; onStateChange: (state: { dirty: boolean; busy: boolean }) => void; onSaved: () => void;
}) {
  const [state, setState] = useState<Privacy>(), [held, setHeld] = useState(false), [reason, setReason] = useState(""),
    [draftDays, setDraftDays] = useState(7), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const epoch = useRef(0), request = useRef<AbortController>(), attempt = useRef<{ signature: string; key: string }>();
  const path = `/admin/forms/${formId}${responseId ? `/responses/${responseId}` : ""}/privacy`,
    baselineHeld = responseId ? !!state?.responseHeld : !!state?.held,
    baselineReason = responseId ? state?.responseReason || "" : state?.reason || "",
    dirty = !!state && (held !== baselineHeld || reason !== baselineReason || (!responseId && draftDays !== state.draftDays) || !!password || !!confirmation);
  useDraftGuard(dirty, { busy, label: "Form retention and operational hold review" });
  useEffect(() => onStateChange({ dirty, busy }), [onStateChange, dirty, busy]);
  useEffect(() => {
    const controller = new AbortController(), current = ++epoch.current;
    const invalidate = () => { epoch.current++; controller.abort(); request.current?.abort(); };
    const clear = () => { invalidate(); setState(undefined); setReason(""); setPassword(""); setConfirmation(""); setError(""); setNotice(""); setBusy(false); };
    window.addEventListener("gdg:session-cleared", clear);
    api<Privacy>(path, { signal: controller.signal }).then((p) => {
      if (current !== epoch.current) return;
      setState(p); setHeld(responseId ? !!p.responseHeld : p.held); setReason(responseId ? p.responseReason || "" : p.reason); setDraftDays(p.draftDays);
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => { invalidate(); window.removeEventListener("gdg:session-cleared", clear); };
  }, [path, responseId]);
  if (!state) return <EmptyState title={error ? "Privacy review unavailable" : "Checking retention and holds…"}>{error || "Only currently authorized reviewers can inspect these controls."}</EmptyState>;
  const reference = `HOLD ${responseId || formId}`;
  return <form className="gt-form" onSubmit={async (event) => {
    event.preventDefault(); if (busy) return;
    const document = { revision: responseId ? state.responseRevision : state.revision, held, reason, confirmation, ...(!responseId ? { draftDays } : {}) }, signature = JSON.stringify(document), current = epoch.current,
      controller = new AbortController(); request.current = controller;
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try {
      await api(path, { method: "POST", protected: true, body: { ...document, currentPassword: password }, idempotencyKey: attempt.current.key, signal: controller.signal });
      const p = await api<Privacy>(path, { signal: controller.signal });
      if (current !== epoch.current) return;
      setState(p); setHeld(responseId ? !!p.responseHeld : p.held); setReason(responseId ? p.responseReason || "" : p.reason); setDraftDays(p.draftDays);
      setConfirmation(""); attempt.current = undefined; setNotice("Privacy review saved. Existing response retention deadlines were not rewritten."); onSaved();
    } catch (e) { if (current === epoch.current && !controller.signal.aborted) setError((e as Error).message); }
    finally { if (current === epoch.current) { setPassword(""); setBusy(false); } }
  }}>
    <p>Operational holds retain responses and their attachments without extending the published retention promise. A hold blocks redaction, deletion and scheduled response expiry. Only an Admin or Super Admin can release an existing hold.</p>
    {responseId ? <>
      <p><strong>Response deadline:</strong> {state.responseExpiresAt ? new Date(state.responseExpiresAt).toLocaleString() : "Unavailable"}.</p>
      <p role="status">{state.effectiveResponseHold ? "This response is retained under an operational hold." : "No operational hold currently applies to this response."}</p>
      {state.held && <p className="gt-helper">A form-wide hold is also active. Releasing only this individual hold does not release the form-wide hold.</p>}
    </> : <>
      <p>{state.totalResponses} retained responses · {state.heldResponses} individual holds · {state.dueResponses} currently eligible for scheduled expiry.</p>
      <p className="gt-helper">Next unheld deadline: {state.nextExpiry ? new Date(state.nextExpiry).toLocaleString() : "No retained unheld responses"}. {state.pendingFiles} files await physical cleanup.</p>
      <p className="gt-helper">Each response keeps its original published version’s deadline. Republishing a longer or shorter policy does not rewrite historical deadlines. A hold cannot recover content already erased or recall downloaded copies.</p>
    </>}
    {error && <p role="alert" className="gt-form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset className="gt-form gt-plain-fieldset" disabled={busy}>
      <label className="gt-check"><input type="checkbox" checked={held} disabled={baselineHeld && !state.canRelease} onChange={(e) => { setHeld(e.target.checked); setConfirmation(""); }} />{responseId ? "Retain this response under an individual hold" : "Retain all responses under a form-wide hold"}</label>
      <Field label="Private operational reason" hint="5–500 characters. Explain the hold or release without including answers or unnecessary personal data."><textarea rows={3} maxLength={500} minLength={5} required value={reason} onChange={(e) => { setReason(e.target.value); setConfirmation(""); }} /></Field>
      {!responseId && <Field label="Incomplete draft retention (days)" hint="1–30 days; applies to new save-and-resume drafts only. Existing private links retain their original expiry."><input type="number" min={1} max={30} required value={draftDays} onChange={(e) => { setDraftDays(Number(e.target.value)); setConfirmation(""); }} /></Field>}
      <Field label="Hold confirmation" hint={`Type ${reference}`}><input autoComplete="off" spellCheck={false} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></Field>
      <Field label="Current password"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <Button type="submit" disabled={busy || !password || reason.trim().length < 5 || confirmation !== reference}>{busy ? "Saving privacy review…" : "Confirm privacy review"}</Button>
    </fieldset>
  </form>;
}
