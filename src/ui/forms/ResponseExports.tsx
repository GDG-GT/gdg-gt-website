import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Button, Field } from "../primitives";

type ExportJob = {
  id: string;
  format: "csv" | "xlsx" | "json";
  state: "pending" | "running" | "ready" | "failed" | "cancelled" | "expired";
  count: number;
  sensitive: boolean;
  bytes: number | null;
  errorCode: string | null;
  createdAt: string;
  expiresAt: string;
};
export default function ResponseExports({ formId, filters, selected, columns, canSensitive }: {
  formId: string;
  filters: Record<string, string>;
  selected: string[];
  columns: string[];
  canSensitive: boolean;
}) {
  const [jobs, setJobs] = useState<ExportJob[]>([]),
    [format, setFormat] = useState<ExportJob["format"]>("csv"),
    [includeSensitive, setIncludeSensitive] = useState(false),
    [reviewing, setReviewing] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [cancel, setCancel] = useState(""),
    [link, setLink] = useState<{ jobId: string; url: string } | null>(null),
    [refresh, setRefresh] = useState(0);
  const attempt = useRef<{ body: string; key: string } | null>(null),
    controller = useRef<AbortController>();
  useDraftGuard(false, { busy, label: "Response export request" });
  const scope = JSON.stringify({ filters, selected, columns, format, sensitive: includeSensitive && canSensitive });
  const clear = useCallback(() => {
    controller.current?.abort();
    setJobs([]); setLink(null); setReviewing(false); setIncludeSensitive(false);
    setNotice(""); setError(""); setCancel(""); attempt.current = null;
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    window.addEventListener("gdg:session-cleared", clear);
    return () => { abort.abort(); window.removeEventListener("gdg:session-cleared", clear); };
  }, [formId, clear]);
  useEffect(() => { setLink(null); setReviewing(false); }, [scope]);
  useEffect(() => {
    if (!link) return;
    const timer = window.setTimeout(() => setLink(null), 55000);
    return () => window.clearTimeout(timer);
  }, [link]);
  useEffect(() => {
    const abort = new AbortController();
    let timer: number;
    const load = async () => {
      try {
        const result = await api<{ items: ExportJob[] }>(`/admin/forms/${formId}/exports`, { signal: abort.signal });
        if (!abort.signal.aborted) {
          setJobs(result.items); setLoading(false);
          if (result.items.some((j) => ["pending", "running"].includes(j.state))) timer = window.setTimeout(load, 5000);
        }
      } catch (e) {
        if (!abort.signal.aborted) { setJobs([]); setLink(null); setLoading(false); setError((e as Error).message); }
      }
    };
    load();
    const stop = () => { abort.abort(); window.clearTimeout(timer); };
    window.addEventListener("gdg:session-cleared", stop);
    return () => { stop(); window.removeEventListener("gdg:session-cleared", stop); };
  }, [formId, refresh]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(""); setNotice(""); setLink(null);
    try { await work(); }
    catch (e) { if (!controller.current?.signal.aborted) setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <section className="gt-event-editor" aria-label="Background response exports" aria-busy={busy}>
    <h3>Background exports</h3>
    <p className="gt-helper">Create CSV, XLSX or JSON without keeping this page open. Files expire after 24 hours and are available only to this sign-in. Downloads recheck access and response changes.</p>
    {error && <p role="alert" className="gt-form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <div className="gt-actions">
      <Field label="Export format"><select value={format} onChange={(e) => setFormat(e.target.value as ExportJob["format"])}>
        <option value="csv">CSV spreadsheet</option><option value="xlsx">Excel workbook</option><option value="json">JSON data</option>
      </select></Field>
      <Button variant="secondary" disabled={busy} onClick={() => setReviewing(true)}>Review export</Button>
      <Button variant="ghost" disabled={busy} onClick={() => { setLink(null); setRefresh((v) => v + 1); }}>Refresh exports</Button>
    </div>
    {canSensitive && <label className="gt-check"><input type="checkbox" checked={includeSensitive} onChange={(e) => setIncludeSensitive(e.target.checked)} />Include sensitive answers (separately authorized and audited)</label>}
    {reviewing && <div className="gt-inline-confirm">
      <p>Create {format.toUpperCase()} for {selected.length ? `${selected.length} selected responses matching the current filters` : "all responses matching the current filters"}, with {columns.length ? `${columns.length} selected answer columns` : "all permitted answer columns"}? {includeSensitive && canSensitive ? "Sensitive answers are included." : "Sensitive answers are excluded."}</p>
      <p className="gt-helper">Up to 20,000 responses; above 10,000 requires both date filters. Very wide or large results may require narrower filters. Response edits, redaction or deletion invalidate the snapshot.</p>
      <Button disabled={busy} onClick={() => run(async () => {
        const body = JSON.stringify({ format, filters: { ...filters, ...(selected.length ? { selected } : {}) }, ...(columns.length ? { columns } : {}), sensitive: includeSensitive && canSensitive });
        if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() };
        await api(`/admin/forms/${formId}/exports`, { method: "POST", protected: true, body: JSON.parse(body), idempotencyKey: attempt.current.key, signal: controller.current?.signal });
        if (controller.current?.signal.aborted) return;
        attempt.current = null; setReviewing(false); setRefresh((v) => v + 1); setNotice("Export queued. It is not ready to download until processing succeeds.");
      })}>{busy ? "Creating…" : "Create export"}</Button>
      <Button variant="ghost" disabled={busy} onClick={() => setReviewing(false)}>Back</Button>
    </div>}
    {loading ? <p role="status">Loading exports…</p> : !jobs.length ? <p className="gt-helper">No exports in this sign-in yet. Choose a format and review the current selection.</p> : <ul className="gt-export-jobs">
      {jobs.map((job) => <li key={job.id}>
        <div><strong>{job.format.toUpperCase()} · {job.count.toLocaleString()} responses</strong><p>{job.state} · {new Date(job.createdAt).toLocaleString()}{job.sensitive ? " · Includes sensitive answers" : " · Sensitive answers excluded"}</p>
          {job.state === "ready" && <p className="gt-helper">Expires {new Date(job.expiresAt).toLocaleString()} · {Math.ceil((job.bytes || 0) / 1024).toLocaleString()} KB</p>}
          {job.state === "failed" && <p role="status">{job.errorCode === "EXPORT_TOO_LARGE" ? "Narrow your filters, columns or versions. For answers exceeding Excel's cell text limit, use CSV or JSON." : job.errorCode === "SOURCE_OR_ACCESS_CHANGED" || job.errorCode === "FORM_EXPORT_CHANGED" ? "Response data or access changed. Review the current data and create another export." : "Processing could not finish. Refresh, then create another export if needed."}</p>}
          <small>Reference {job.id}</small>
        </div>
        <div className="gt-actions">
          {job.state === "ready" && <Button variant="secondary" disabled={busy} onClick={() => run(async () => {
            const result = await api<{ url: string }>(`/admin/forms/${formId}/exports/${job.id}/download`, { method: "POST", protected: true, body: {}, signal: controller.current?.signal });
            if (!controller.current?.signal.aborted) { setLink({ jobId: job.id, url: result.url }); setNotice("Download authorized for 60 seconds. Downloaded copies cannot be recalled."); }
          })}>Authorize download</Button>}
          {link?.jobId === job.id && <a className="gt-button gt-button-secondary" href={link.url} rel="noopener noreferrer" referrerPolicy="no-referrer">Download {job.format.toUpperCase()}</a>}
          {["pending", "running", "ready"].includes(job.state) && <Button variant="ghost" disabled={busy} onClick={() => setCancel(job.id)}>Remove export</Button>}
        </div>
        {cancel === job.id && <div className="gt-inline-confirm"><p>Cancel processing and remove access to export {job.id}? Already issued links can remain usable for up to 60 seconds. Source responses are not deleted.</p>
          <Button variant="danger" disabled={busy} onClick={() => run(async () => {
            await api(`/admin/forms/${formId}/exports/${job.id}`, { method: "DELETE", protected: true, signal: controller.current?.signal });
            if (!controller.current?.signal.aborted) { setCancel(""); setRefresh((v) => v + 1); setNotice("Export removed. Source responses are unchanged."); }
          })}>Confirm removal</Button><Button variant="ghost" onClick={() => setCancel("")}>Keep export</Button>
        </div>}
      </li>)}
    </ul>}
  </section>;
}
