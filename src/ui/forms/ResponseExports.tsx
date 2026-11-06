import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { Button, Field } from "../primitives";
import { authorizedPrivateDownload } from "./private-download";
import {
  prepareExportCreation,
  prepareExportCancellation,
  submitExportWrite,
  validExportJob,
  type ExportIntent,
  type ExportJob,
} from "./form-export-api";
import FormExportWriteRecovery from "./FormExportWriteRecovery";
type Props = {
  formId: string;
  filters: Record<string, string>;
  selected: string[];
  columns: string[];
  canSensitive: boolean;
};
type Download = ReturnType<typeof authorizedPrivateDownload> & {
  jobId: string;
  scope: string;
};
export default function ResponseExports(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <ExportWorkspace
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}:${props.canSensitive}`}
      {...props}
    />
  );
}
function ExportWorkspace({
  formId,
  filters,
  selected,
  columns,
  canSensitive,
}: Props) {
  const [format, setFormat] = useState<ExportJob["format"]>("csv"),
    [includeSensitive, setIncludeSensitive] = useState(false),
    [review, setReview] = useState<ExportIntent>(),
    [cancelReview, setCancelReview] = useState<ExportIntent>(),
    [intent, setIntent] = useState<ExportIntent>(),
    [uncertain, setUncertain] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [blocked, setBlocked] = useState(""),
    [sessionInvalid, setSessionInvalid] = useState(false),
    [needsRead, setNeedsRead] = useState(false),
    [link, setLink] = useState<Download>(),
    [refresh, setRefresh] = useState(0);
  const root = `/admin/forms/${formId}/exports`,
    { isOnline } = useOnlineStatus(),
    read = usePrivateRead<{ items: ExportJob[] }>(
      !blocked && !sessionInvalid ? root : undefined,
      refresh,
    ),
    { clear: clearRead, denied, error: readError } = read,
    { busy, begin, current, finish, cancel } = usePrivateMutation(root),
    workspace = useRef<HTMLElement>(null),
    feedback = useRef<HTMLParagraphElement>(null),
    reviewFocus = useRef<HTMLElement>(null),
    intentRef = useRef<ExportIntent>(),
    focusRequested = useRef(false),
    scope = JSON.stringify({
      filters,
      selected,
      columns,
      format,
      sensitive: includeSensitive && canSensitive,
    }),
    previousScope = useRef(scope),
    currentScope = useRef(scope),
    validInventory =
      !!read.data &&
      Array.isArray(read.data.items) &&
      read.data.items.every(validExportJob),
    jobs = validInventory ? read.data!.items : [],
    invalidInventory =
      !read.loading &&
      !readError &&
      !validInventory &&
      !blocked &&
      !sessionInvalid,
    ready =
      validInventory &&
      !read.loading &&
      !readError &&
      !denied &&
      !blocked &&
      !sessionInvalid &&
      isOnline &&
      !needsRead,
    pending = busy || recoveryBusy,
    writable = ready && !pending && !intent;
  currentScope.current = scope;
  useDraftGuard(!!intent || !!review || !!cancelReview, {
    busy: pending,
    label: intent ? "Unconfirmed export change" : "Response export review",
  });
  const clearPrivate = useCallback(
    (reason: string) => {
      cancel();
      clearRead();
      intentRef.current = undefined;
      setIntent(undefined);
      setUncertain(false);
      setRecoveryBusy(false);
      setReview(undefined);
      setCancelReview(undefined);
      setLink(undefined);
      setIncludeSensitive(false);
      setFormat("csv");
      setError("");
      setNotice("");
      setBlocked(reason);
      focusRequested.current = false;
    },
    [cancel, clearRead],
  );
  useEffect(() => {
    if (denied)
      clearPrivate(
        readError ||
          "Export access changed. Recheck before reopening private exports.",
      );
  }, [denied, readError, clearPrivate]);
  useEffect(() => {
    const cleared = () => {
      clearPrivate(
        "Your sign-in changed. Reopen exports from the current workspace.",
      );
      setSessionInvalid(true);
    };
    const offline = () => {
      cancel();
      setLink(undefined);
      setNeedsRead(true);
      focusRequested.current = false;
      if (intentRef.current) {
        setUncertain(true);
        setReview(undefined);
        setCancelReview(undefined);
      }
    };
    window.addEventListener("gdg:session-cleared", cleared);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", cleared);
      window.removeEventListener("offline", offline);
    };
  }, [cancel, clearPrivate]);
  useEffect(() => {
    if (previousScope.current !== scope) {
      setLink(undefined);
      if (!intentRef.current) {
        cancel();
        setReview(undefined);
        setCancelReview(undefined);
      }
      previousScope.current = scope;
    }
  }, [scope, cancel]);
  useEffect(() => {
    if (review || cancelReview) reviewFocus.current?.focus();
  }, [review, cancelReview]);
  useEffect(() => {
    if ((error || notice) && focusRequested.current) {
      feedback.current?.focus();
      focusRequested.current = false;
    }
  }, [error, notice]);
  useEffect(() => {
    if (readError || invalidInventory) setLink(undefined);
  }, [readError, invalidInventory]);
  useEffect(() => {
    if (!link) return;
    const timer = window.setTimeout(
      () => {
        setLink(undefined);
        setNotice("The export download link expired. Authorize it again.");
      },
      Math.max(0, link.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [link]);
  const hasPendingJobs = jobs.some((job) =>
    ["pending", "running"].includes(job.state),
  );
  useEffect(() => {
    if (!ready || pending || intent || !hasPendingJobs) return;
    const timer = window.setTimeout(
      () => setRefresh((value) => value + 1),
      5000,
    );
    return () => window.clearTimeout(timer);
  }, [ready, pending, intent, hasPendingJobs, refresh]);
  const reload = () => {
    if (!isOnline || pending || sessionInvalid) return;
    setLink(undefined);
    setNeedsRead(false);
    setRefresh((value) => value + 1);
    workspace.current?.focus();
  };
  const recovered = (savedIntent: ExportIntent, job: ExportJob) => {
    intentRef.current = undefined;
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setReview(undefined);
    setCancelReview(undefined);
    setLink(undefined);
    setError("");
    focusRequested.current = true;
    setNotice(
      savedIntent.action === "cancel"
        ? `Export removal confirmed. Its current state is ${job.state}. Source responses were not deleted.`
        : `Original export request confirmed. Current state: ${job.state}. A file is downloadable only when processing succeeds and current access is checked.`,
    );
    setRefresh((value) => value + 1);
  };
  async function mutate(proposed: ExportIntent) {
    if (!writable) return;
    if (
      Date.now() < proposed.startedAt ||
      Date.now() - proposed.startedAt >= 47 * 60 * 60 * 1000
    ) {
      setReview(undefined);
      setCancelReview(undefined);
      setNeedsRead(true);
      focusRequested.current = true;
      setError(
        "The export review expired. Refresh current exports and review the change again.",
      );
      return;
    }
    const controller = begin();
    if (!controller) return;
    intentRef.current = proposed;
    setIntent(proposed);
    setError("");
    setNotice("");
    setLink(undefined);
    focusRequested.current = true;
    try {
      const job = await submitExportWrite(proposed, controller.signal);
      if (current(controller)) recovered(proposed, job);
    } catch (e) {
      if (!current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clearPrivate(e.message);
        if (e.status === 401) setSessionInvalid(true);
      } else if (
        e instanceof ApiFailure &&
        [400, 409, 429].includes(e.status)
      ) {
        intentRef.current = undefined;
        setIntent(undefined);
        setError(e.message);
      } else {
        setUncertain(true);
        setReview(undefined);
        setCancelReview(undefined);
        setError("");
      }
    } finally {
      finish(controller);
    }
  }
  async function authorize(job: ExportJob) {
    if (!writable || job.state !== "ready") return;
    if (Date.now() >= Date.parse(job.expiresAt)) {
      focusRequested.current = true;
      setError(
        "This export expired. Reload the inventory before reviewing another request.",
      );
      return;
    }
    const controller = begin();
    if (!controller) return;
    const startedAt = Date.now();
    setLink(undefined);
    setError("");
    setNotice("");
    focusRequested.current = true;
    try {
      const result = await api(root + "/" + job.id + "/download", {
        method: "POST",
        protected: true,
        body: {},
        signal: controller.signal,
      });
      if (!current(controller) || currentScope.current !== scope) return;
      setLink({
        scope,
        jobId: job.id,
        ...authorizedPrivateDownload(result, startedAt),
      });
      setNotice(
        "Export download authorized for up to one minute. Downloaded copies cannot be recalled.",
      );
    } catch (e) {
      if (!current(controller)) return;
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
        clearPrivate(e.message);
        if (e.status === 401) setSessionInvalid(true);
      } else
        setError(
          e instanceof Error
            ? e.message
            : "The download could not be authorized. Try again.",
        );
    } finally {
      finish(controller);
    }
  }
  return (
    <section
      ref={workspace}
      tabIndex={-1}
      className="gt-event-editor"
      aria-label="Background response exports"
      aria-busy={pending}
    >
      <h3>Background exports</h3>
      <p className="gt-helper">
        Create CSV, XLSX or JSON without keeping this page open. Files expire
        after 24 hours and belong to this sign-in. Downloads recheck current
        access and response changes.
      </p>
      {blocked || sessionInvalid || denied ? (
        <div role="alert">
          <p>{blocked || readError || "Private exports have been cleared."}</p>
          <Button
            type="button"
            variant="secondary"
            disabled={!isOnline || pending || sessionInvalid}
            onClick={() => {
              clearRead();
              setBlocked("");
              setNeedsRead(false);
              setRefresh((value) => value + 1);
              workspace.current?.focus();
            }}
          >
            Recheck export access
          </Button>
        </div>
      ) : (
        <>
          {(error || notice) && (
            <p
              ref={feedback}
              tabIndex={-1}
              role={error ? "alert" : "status"}
              className={error ? "gt-form-error" : "gt-helper"}
            >
              {error || notice}
            </p>
          )}
          {read.loading && <p role="status">Loading exports…</p>}
          {(readError || invalidInventory) && (
            <p role="alert">
              {readError ||
                "The export inventory could not be verified. Reload it before further actions."}
            </p>
          )}
          {(readError || read.loading || !isOnline || needsRead) && read.at && (
            <p className="gt-helper">
              Last successful export inventory read:{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              . Showing the matching saved snapshot; actions are paused until it
              is rechecked.
            </p>
          )}
          {(!isOnline || needsRead) && (
            <p role="status">
              {isOnline
                ? "Connection restored. Refresh exports before further actions."
                : "You are offline. Export changes and new downloads are paused."}
            </p>
          )}
          <div className="gt-actions">
            <Field label="Export format">
              <select
                value={format}
                disabled={!writable}
                onChange={(e) =>
                  setFormat(e.target.value as ExportJob["format"])
                }
              >
                <option value="csv">CSV spreadsheet</option>
                <option value="xlsx">Excel workbook</option>
                <option value="json">JSON data</option>
              </select>
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={!writable}
              onClick={() => {
                setCancelReview(undefined);
                setReview(
                  prepareExportCreation(formId, {
                    format,
                    filters,
                    selected,
                    columns,
                    sensitive: includeSensitive && canSensitive,
                  }),
                );
              }}
            >
              Review export
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending || read.loading || !isOnline}
              onClick={reload}
            >
              Refresh exports
            </Button>
          </div>
          {canSensitive && (
            <label className="gt-check">
              <input
                type="checkbox"
                disabled={!writable}
                checked={includeSensitive}
                onChange={(e) => setIncludeSensitive(e.target.checked)}
              />
              Include sensitive answers (separately authorized and audited)
            </label>
          )}
          {review && (
            <section
              ref={reviewFocus}
              tabIndex={-1}
              className="gt-inline-confirm"
              aria-label="Review export creation"
            >
              <p>Create {review.description}</p>
              <p className="gt-helper">
                Up to 20,000 responses; above 10,000 requires both date filters.
                Very wide or large results may need narrower filters. Edits,
                redaction or deletion invalidate its frozen source snapshot.
              </p>
              <Button
                type="button"
                disabled={!writable}
                onClick={() => void mutate(review)}
              >
                {busy ? "Creating…" : "Create export"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending || !!intent}
                onClick={() => setReview(undefined)}
              >
                Back
              </Button>
            </section>
          )}
          {uncertain && intent && (
            <FormExportWriteRecovery
              key={intent.key}
              intent={intent}
              onRecovered={(job) => recovered(intent, job)}
              onDenied={() =>
                clearPrivate(
                  "Export access changed. Private recovery information has been cleared.",
                )
              }
              onBusy={setRecoveryBusy}
              onAbandon={() => {
                intentRef.current = undefined;
                setIntent(undefined);
                setUncertain(false);
                setRecoveryBusy(false);
                setLink(undefined);
                focusRequested.current = true;
                setNotice(
                  "Stopped tracking the original export change. It may already have committed; refresh current exports before another request.",
                );
                setNeedsRead(true);
              }}
            />
          )}
          {validInventory && !jobs.length && (
            <p className="gt-helper">
              No exports in this sign-in yet. Choose a format and review the
              current selection.
            </p>
          )}
          {jobs.length > 0 && (
            <ul className="gt-export-jobs">
              {jobs.map((job) => (
                <li key={job.id}>
                  <div>
                    <strong>
                      {job.format.toUpperCase()} · {job.count.toLocaleString()}{" "}
                      responses
                    </strong>
                    <p>
                      {job.state} · {new Date(job.createdAt).toLocaleString()}
                      {job.sensitive
                        ? " · Includes sensitive answers"
                        : " · Sensitive answers excluded"}
                    </p>
                    {job.state === "ready" && (
                      <p className="gt-helper">
                        Expires {new Date(job.expiresAt).toLocaleString()} ·{" "}
                        {Math.ceil((job.bytes || 0) / 1024).toLocaleString()} KB
                      </p>
                    )}
                    {job.state === "failed" && (
                      <p role="status">
                        {job.errorCode === "EXPORT_TOO_LARGE"
                          ? "Narrow your filters or columns; use CSV or JSON for answers exceeding Excel's cell text limit."
                          : [
                                "SOURCE_OR_ACCESS_CHANGED",
                                "FORM_EXPORT_CHANGED",
                              ].includes(job.errorCode || "")
                            ? "Source data or access changed. Review current data before another request."
                            : "Processing could not finish. Refresh and review current exports before another request."}
                      </p>
                    )}
                    <small>Reference {job.id}</small>
                  </div>
                  <div className="gt-actions">
                    {job.state === "ready" && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!writable}
                        onClick={() => void authorize(job)}
                      >
                        Authorize download
                        <span className="sr-only"> for export {job.id}</span>
                      </Button>
                    )}
                    {link?.jobId === job.id &&
                      link.scope === scope &&
                      job.state === "ready" &&
                      ready &&
                      !intent &&
                      !pending && (
                        <a
                          className="gt-button gt-button-secondary"
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          referrerPolicy="no-referrer"
                          onClick={(event) => {
                            if (
                              !navigator.onLine ||
                              Date.now() < link.startedAt ||
                              Date.now() >= link.expiresAt ||
                              Date.now() >= Date.parse(job.expiresAt)
                            ) {
                              event.preventDefault();
                              setLink(undefined);
                              focusRequested.current = true;
                              setNotice(
                                "The download authorization expired or the connection changed. Authorize it again.",
                              );
                            }
                          }}
                        >
                          Download {job.format.toUpperCase()}
                        </a>
                      )}
                    {["pending", "running", "ready"].includes(job.state) && (
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={!writable}
                        onClick={() => {
                          setReview(undefined);
                          setCancelReview(
                            prepareExportCancellation(formId, job),
                          );
                        }}
                      >
                        Remove export<span className="sr-only"> {job.id}</span>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {cancelReview && (
            <section
              ref={reviewFocus}
              tabIndex={-1}
              className="gt-inline-confirm"
              aria-label="Review export removal"
            >
              <p>{cancelReview.description}</p>
              <Button
                type="button"
                variant="danger"
                disabled={!writable}
                onClick={() => void mutate(cancelReview)}
              >
                Confirm removal
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending || !!intent}
                onClick={() => setCancelReview(undefined)}
              >
                Keep export
              </Button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
