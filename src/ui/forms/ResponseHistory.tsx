import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "../primitives";
type History = {
  items: { revision: number; recordedAt: string; current: boolean }[];
  currentRevision: number; version: number; total: number; page: number; pageSize: number; redacted: boolean;
};
type Revision = {
  responseId: string; revision: number; version: number; current: boolean; recordedAt: string; redacted: boolean;
  fields: { id: string; label: string; type: string; sensitive: boolean; masked: boolean; answered: boolean; value: unknown }[];
};
export default function ResponseHistory({ formId, responseId, canSensitive }: { formId: string; responseId: string; canSensitive: boolean }) {
  const [open, setOpen] = useState(false), [page, setPage] = useState(1),
    [history, setHistory] = useState<History>(), [selected, setSelected] = useState<number>(),
    [revision, setRevision] = useState<Revision>(), [sensitive, setSensitive] = useState(false),
    [error, setError] = useState(""), [loading, setLoading] = useState(false), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const clear = () => { setOpen(false); setHistory(undefined); setRevision(undefined); setSelected(undefined); setSensitive(false); setError(""); };
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setHistory(undefined); setRevision(undefined); setSelected(undefined);
    api<History>(`/admin/forms/${formId}/responses/${responseId}/history?page=${page}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setHistory(result); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [formId, responseId, open, page, refresh]);
  useEffect(() => {
    if (!open || selected === undefined) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setRevision(undefined);
    api<Revision>(`/admin/forms/${formId}/responses/${responseId}/history/${selected}?sensitive=${sensitive && canSensitive}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setRevision(result); })
      .catch((e) => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [formId, responseId, open, selected, sensitive, canSensitive]);
  return <section aria-label="Response revision history" className="gt-response-history">
    <Button variant="secondary" onClick={() => {
      setOpen(!open); setSensitive(false); setSelected(undefined); setRevision(undefined); setHistory(undefined); setError("");
    }}>{open ? "Close revision history" : "Review revision history"}</Button>
    {open && <>
      <h3>Response revision history</h3>
      <p className="gt-helper">Read-only snapshots use the original published questions. Redaction applies to historical answers too; deleted responses have no readable history.</p>
      {error && <p role="alert" className="gt-form-error">{error}<Button variant="ghost" onClick={() => setRefresh((v) => v + 1)}>Reload history</Button></p>}
      {loading && <p role="status">Loading response history…</p>}
      {history && <>
        <p>{history.total} {history.total === 1 ? "revision" : "revisions"} · Form version {history.version}{history.redacted ? " · Identity redacted across history" : ""}</p>
        <div className="gt-actions">{history.items.map((item) => <Button key={item.revision} variant={selected === item.revision ? "primary" : "secondary"} onClick={() => setSelected(item.revision)}>
          Revision {item.revision}{item.current ? " · Current" : ""}
        </Button>)}</div>
        {history.total > history.pageSize && <nav className="gt-actions" aria-label="Revision history pages">
          <Button variant="ghost" disabled={page === 1 || loading} onClick={() => setPage((v) => v - 1)}>Previous revisions</Button>
          <span>Page {page}</span><Button variant="ghost" disabled={page * history.pageSize >= history.total || loading} onClick={() => setPage((v) => v + 1)}>Older revisions</Button>
        </nav>}
        {canSensitive && <label className="gt-check"><input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />Reveal sensitive historical answers (audited)</label>}
      </>}
      {revision && <div className="gt-response-answers" role="region" aria-label={`Revision ${revision.revision} answers`}>
        <h4>Revision {revision.revision}{revision.current ? " · Current at time of review" : " · Historical snapshot"}</h4>
        <p>{new Date(revision.recordedAt).toLocaleString()} · Form version {revision.version}</p>
        {revision.fields.map((field) => <div key={field.id}><strong>{field.label}{field.sensitive ? " · Sensitive" : ""}</strong><p>
          {field.masked ? "Hidden by default" : !field.answered ? "Not answered" : field.type === "file" && Array.isArray(field.value)
            ? `${field.value.length} retained attachment reference(s). Use the current response's authorized download controls.`
            : typeof field.value === "object" ? JSON.stringify(field.value) : String(field.value ?? "Not answered")}
        </p></div>)}
      </div>}
    </>}
  </section>;
}
