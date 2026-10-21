import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, EmptyState, Field } from "../primitives";
type Reference = { id: string; slot: string; formId: string; label: string; title: string | null; href: string | null; revision: number; versionPolicy: "latest_published" };
type Candidate = { id: string; title: string; version: number; access: string };
type Workspace = { items: Reference[]; canEdit: boolean; canLink: boolean };
export default function FormIntegrations({ kind, resourceId, disabled = false }: {
  kind: "event" | "team" | "campaign"; resourceId: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), [state, setState] = useState<Workspace>(), [candidates, setCandidates] = useState<Candidate[]>([]),
    [formId, setFormId] = useState(""), [label, setLabel] = useState("Open form"), [query, setQuery] = useState(""),
    [editing, setEditing] = useState<Reference>(), [removing, setRemoving] = useState<Reference>(),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const safety = useNavigationSafety(), epoch = useRef(0), pending = useRef<AbortController>(),
    attempt = useRef<{ signature: string; key: string }>(), path = `/admin/form-integrations/${kind}/${resourceId}`;
  const dirty = open && (!!formId || label !== "Open form" || !!query || !!removing);
  useDraftGuard(dirty, { busy: open && busy, label: "Published form links" });
  const reset = () => { setFormId(""); setLabel("Open form"); setQuery(""); setEditing(undefined); setRemoving(undefined); attempt.current = undefined; };
  useEffect(() => {
    const controller = new AbortController(), current = ++epoch.current;
    pending.current = controller;
    setState(undefined); setCandidates([]); setError(""); setNotice(""); reset(); setQuery("");
    const invalidate = () => { epoch.current++; controller.abort(); pending.current?.abort(); };
    const clear = () => { invalidate(); setState(undefined); setCandidates([]); reset(); setQuery(""); setOpen(false); setBusy(false); setError(""); setNotice(""); };
    window.addEventListener("gdg:session-cleared", clear);
    if (open) {
      setBusy(true);
      api<Workspace>(path, { signal: controller.signal }).then(async (workspace) => {
        if (current !== epoch.current) return;
        setState(workspace);
        if (workspace.canLink) {
          const list = await api<Candidate[]>(path + "/candidates", { signal: controller.signal });
          if (current === epoch.current) setCandidates(list);
        }
      }).catch((e: Error) => { if (current === epoch.current && !controller.signal.aborted) setError(e.message); })
        .finally(() => { if (current === epoch.current) setBusy(false); });
    }
    return () => { invalidate(); window.removeEventListener("gdg:session-cleared", clear); };
  }, [open, path]);
  const discard = (action: () => void) => { if (busy) return; if (dirty && safety) safety.request(action); else action(); };
  const mutate = async (remove?: Reference) => {
    if (busy || !state) return;
    const slot = remove?.slot || editing?.slot || ["primary", "form-2", "form-3", "form-4", "form-5"].find((s) => !state.items.some((r) => r.slot === s));
    if (!slot) return;
    const body = remove ? { revision: remove.revision } : { revision: editing?.revision || 0, formId, label, versionPolicy: "latest_published" },
      signature = JSON.stringify({ slot, remove: !!remove, body }), controller = new AbortController(), current = epoch.current;
    pending.current = controller;
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try {
      await api(path + "/" + slot, { method: remove ? "DELETE" : "PUT", protected: true, body, idempotencyKey: attempt.current.key, signal: controller.signal });
      const workspace = await api<Workspace>(path, { signal: controller.signal });
      if (current !== epoch.current) return;
      setState(workspace); reset(); setNotice(remove ? "Form link removed. The form and its responses were not deleted." : "Form linked. Respondents still use the form’s normal access checks.");
    } catch (e) { if (current === epoch.current && !controller.signal.aborted) setError((e as Error).message); }
    finally { if (current === epoch.current) setBusy(false); }
  };
  return <>
    <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>Linked forms</Button>
    <Dialog open={open} onOpenChange={(next) => { if (next) setOpen(true); else discard(() => setOpen(false)); }}>
      <DialogContent className="gt-notification-dialog"><DialogHeader><DialogTitle>Linked forms</DialogTitle>
        <DialogDescription>Connect a published form to this {kind}. Links follow the latest published version; drafts stay private.</DialogDescription></DialogHeader>
        <div className="gt-form">
          {error && <p role="alert" className="gt-form-error">{error}</p>}{notice && <p role="status">{notice}</p>}
          {!state ? <EmptyState title={busy ? "Loading form links…" : "Form links unavailable"}>Only authorized resource members can review these links.</EmptyState> : <>
            {state.items.length ? <ul className="gt-form-integration-list">{state.items.map((r) => <li key={r.id}>
              <div><strong>{r.label}</strong><p className="gt-helper">{r.title || "Form details restricted"} · latest published version</p>
                {r.href ? <Link to={r.href}>Open respondent page</Link> : <span className="gt-helper">Not currently available to open</span>}</div>
              {state.canEdit && <div className="gt-inline-actions"><Button variant="ghost" disabled={busy || !state.canLink} onClick={() => discard(() => { reset(); setEditing(r); setFormId(r.formId); setLabel(r.label); })}>Edit link</Button>
                <Button variant="ghost" disabled={busy} onClick={() => discard(() => { reset(); setRemoving(r); })}>Remove link</Button></div>}
            </li>)}</ul> : <p>No forms linked yet.</p>}
            {removing ? <section className="gt-form" aria-label="Confirm link removal"><p>Remove “{removing.label}” from this {kind}? The form, responses and other links stay unchanged.</p>
              <div className="gt-inline-actions"><Button disabled={busy} onClick={() => void mutate(removing)}>{busy ? "Removing…" : "Confirm removal"}</Button><Button variant="secondary" disabled={busy} onClick={reset}>Keep link</Button></div></section>
              : state.canLink && (editing || state.items.length < 5) ? <form className="gt-form" onSubmit={(e) => { e.preventDefault(); void mutate(); }}>
                <h3>{editing ? "Edit form link" : "Add a published form"}</h3>
                <Field label="Find a form" hint="Searches up to 50 published forms you can view and manage. Unpublished and archived forms cannot be linked."><div className="gt-inline-actions"><input value={query} maxLength={100} onChange={(e) => setQuery(e.target.value)} disabled={busy} />
                  <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
                    const controller = new AbortController(), current = epoch.current; pending.current = controller; setBusy(true); setError("");
                    try { const list = await api<Candidate[]>(path + "/candidates?q=" + encodeURIComponent(query), { signal: controller.signal }); if (current === epoch.current) setCandidates(list); }
                    catch (e) { if (current === epoch.current && !controller.signal.aborted) setError((e as Error).message); }
                    finally { if (current === epoch.current) setBusy(false); }
                  }}>Search</Button></div></Field>
                <Field label="Published form"><select required value={formId} disabled={busy} onChange={(e) => setFormId(e.target.value)}><option value="">Choose a form</option>
                  {formId && !candidates.some((c) => c.id === formId) && <option value={formId}>Currently linked form (revalidated on save)</option>}
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.title} · v{c.version} · {c.access}</option>)}</select></Field>
                <Field label="Link label"><input required maxLength={80} value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} /></Field>
                <p className="gt-helper">A link never grants access or verifies identity. Public event pages show only open public or email-verified forms; invited, internal and unlisted forms stay off public event pages.</p>
                <div className="gt-inline-actions"><Button type="submit" disabled={busy || !formId || !label.trim()}>{busy ? "Saving…" : editing ? "Save link" : "Link form"}</Button>
                  {dirty && <Button type="button" variant="secondary" disabled={busy} onClick={() => discard(reset)}>Cancel changes</Button>}</div>
              </form> : <p className="gt-helper">{state.canLink ? "Five forms are linked. Remove one before adding another." : "New links require an active editable resource. Existing links can be removed by its authorized managers."}</p>}
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
