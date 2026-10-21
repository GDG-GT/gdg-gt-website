import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button, EmptyState, Field } from "../primitives";
type DeletionState = {
  formId: string; revision: number; archived: boolean; purged: boolean; formHeld: boolean;
  heldResponses: number; unexpiredResponses: number; retainedResponses: number; activeReferences: number;
  drafts: number; filesAwaitingCleanup: number; exportsAwaitingCleanup: number; activeExports: number; publishedVersions: number;
};
type Review = { reviewId: string; reviewToken: string; expiresAt: string; state: DeletionState };
export default function FormDeletionReview({ formId, title, onClose, onDeleted }: {
  formId: string; title: string; onClose: () => void; onDeleted: () => void;
}) {
  const [state, setState] = useState<DeletionState>(), [review, setReview] = useState<Review>(),
    [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [ack, setAck] = useState(false),
    [busy, setBusy] = useState(true), [error, setError] = useState(""), [refresh, setRefresh] = useState(0);
  const safety = useNavigationSafety(), epoch = useRef(0), request = useRef<AbortController>(), key = useRef<string>(),
    path = `/admin/forms/${formId}`, reference = `DELETE FORM ${formId}`, dirty = !!(review || password || confirmation || ack);
  useDraftGuard(dirty, { busy, label: "Permanent form deletion review" });
  const clearReview = () => { setReview(undefined); setPassword(""); setConfirmation(""); setAck(false); key.current = undefined; };
  useEffect(() => {
    const current = ++epoch.current, controller = new AbortController(); request.current = controller;
    const invalidate = () => { epoch.current++; controller.abort(); request.current?.abort(); };
    const clear = () => { invalidate(); clearReview(); setState(undefined); setError(""); setBusy(false); onClose(); };
    window.addEventListener("gdg:session-cleared", clear);
    clearReview(); setState(undefined); setBusy(true); setError("");
    api<DeletionState>(path + "/deletion-review", { signal: controller.signal }).then((s) => { if (current === epoch.current) setState(s); })
      .catch((e: Error) => { if (current === epoch.current && !controller.signal.aborted) setError(e.message); })
      .finally(() => { if (current === epoch.current) setBusy(false); });
    return () => { invalidate(); window.removeEventListener("gdg:session-cleared", clear); };
    // onClose is a parent callback, not a reason to reset an in-progress review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, refresh]);
  const eligible = state && state.archived && !state.purged && !state.formHeld && !state.heldResponses && !state.unexpiredResponses && !state.activeReferences;
  const close = () => { if (busy) return; if (dirty && safety) safety.request(onClose); else onClose(); };
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="gt-notification-dialog">
    <DialogTitle>Permanent form deletion</DialogTitle><DialogDescription>This is irreversible. Archive is the recoverable option; permanent deletion cannot be restored.</DialogDescription>
    <div className="gt-form">
      <p><strong>{title}</strong></p>
      {error && <p role="alert" className="gt-form-error">{error}</p>}
      {!state ? <EmptyState title={busy ? "Checking retention and references…" : "Deletion review unavailable"}>Only a current Super Admin can review this operation.</EmptyState> : <>
        <p>{state.retainedResponses} retained responses · {state.drafts} incomplete drafts · {state.publishedVersions} published versions.</p>
        {!eligible && <section aria-label="Deletion blockers"><h3>Resolve these before deletion</h3><ul>
          {!state.archived && <li>Archive the form first.</li>}
          {(state.formHeld || !!state.heldResponses) && <li>An operational hold applies. Review it in Responses → Retention &amp; holds; deletion cannot override a hold.</li>}
          {!!state.unexpiredResponses && <li>{state.unexpiredResponses} responses are still within their original retention period.</li>}
          {!!state.activeReferences && <li>{state.activeReferences} active event, team or campaign references must be removed or their source archived.</li>}
          {state.purged && <li>This form was already permanently deleted.</li>}
        </ul></section>}
        <p>Erases the draft, published question definitions, retained answers/history, incomplete responses, private saved views and respondent identity copies. Minimal form/version/response identifiers and security audit records remain; the old URL stays reserved.</p>
        <p className="gt-helper">{state.filesAwaitingCleanup} files and {state.exportsAwaitingCleanup} export artifacts may need physical cleanup. Export jobs are cancelled and access revoked immediately; private bytes are removed by retryable workers. Already downloaded files or delivered messages cannot be recalled.</p>
        <p><Link to={`/admin/forms/${formId}/responses`}>Review responses and export what you need before proceeding</Link>. This action does not make an automatic backup.</p>
        {!review ? <div className="gt-inline-actions"><Button disabled={busy || !eligible} onClick={async () => {
          if (!state || busy) return; const current = epoch.current, controller = new AbortController(); request.current = controller; setBusy(true); setError("");
          try { const r = await api<Review>(path + "/deletion-review", { method: "POST", protected: true, body: { revision: state.revision }, signal: controller.signal });
            if (current === epoch.current) { setReview(r); setState(r.state); key.current = crypto.randomUUID(); }
          } catch (e) { if (current === epoch.current && !controller.signal.aborted) setError((e as Error).message); }
          finally { if (current === epoch.current) setBusy(false); }
        }}>{busy ? "Reviewing…" : "Review permanent deletion"}</Button><Button variant="secondary" disabled={busy} onClick={() => setRefresh((v) => v + 1)}>Recheck eligibility</Button></div>
          : <form className="gt-form" onSubmit={async (e) => {
            e.preventDefault(); if (busy || !key.current) return;
            const current = epoch.current, controller = new AbortController(); request.current = controller; setBusy(true); setError("");
            try {
              await api(path + "/permanent-deletion", { method: "POST", protected: true, idempotencyKey: key.current, signal: controller.signal,
                body: { revision: review.state.revision, reviewId: review.reviewId, reviewToken: review.reviewToken, confirmation, exportWarningAcknowledged: ack, currentPassword: password } });
              if (current === epoch.current) { clearReview(); onDeleted(); }
            } catch (e) { if (current === epoch.current && !controller.signal.aborted) setError((e as Error).message); }
            finally { if (current === epoch.current) { setPassword(""); setBusy(false); } }
          }}>
            <p className="gt-helper">This session-bound review expires {new Date(review.expiresAt).toLocaleString()}. Changed retention, holds, references or contents require a new review.</p>
            <fieldset className="gt-form gt-plain-fieldset" disabled={busy}>
              <label className="gt-check"><input type="checkbox" required checked={ack} onChange={(e) => setAck(e.target.checked)} />I have exported anything I need and understand that deletion is irreversible, cancels pending exports and does not recall existing copies.</label>
              <Field label="Deletion confirmation" hint={`Type ${reference}`}><input required value={confirmation} autoComplete="off" spellCheck={false} onChange={(e) => setConfirmation(e.target.value)} /></Field>
              <Field label="Current password"><input required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
              <div className="gt-inline-actions"><Button type="submit" disabled={busy || !ack || !password || confirmation !== reference}>{busy ? "Deleting…" : "Permanently delete this form"}</Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => { const reset = () => { clearReview(); setRefresh((v) => v + 1); }; if (safety) safety.request(reset); else reset(); }}>Start a new review</Button></div>
            </fieldset>
          </form>}
      </>}
      {!state && !busy && <Button variant="secondary" onClick={() => setRefresh((v) => v + 1)}>Retry eligibility check</Button>}
    </div>
  </DialogContent></Dialog>;
}
