import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
import type { FormField } from "./store";
import {
  uploadTypes,
  uploadBody,
  validUploadStatus,
  inspectUploadPreparation,
  prepareUpload,
  waitForUploadCheck,
  type UploadContext,
  type UploadStatus,
  type UploadIntent,
  type UploadInspection,
} from "./respondent-upload";
export type { UploadContext } from "./respondent-upload";
type Props = {
  field: FormField;
  value: string[];
  onChange: (value: string[]) => void;
  context: UploadContext;
  readOnly?: boolean;
  onBusy: (busy: boolean) => void;
  onName: (id: string, name: string) => void;
  onAccessDenied?: () => void;
  error?: string;
};
type Recovery =
  | {
      kind: "upload";
      original: UploadIntent;
      uploadId?: string;
      inspection?: UploadInspection;
    }
  | { kind: "remove"; uploadId: string; checked?: boolean };
export default function RespondentFileField(props: Props) {
  return (
    <CurrentRespondentFileField
      key={JSON.stringify([
        props.field.id,
        props.context.slug,
        props.context.versionId,
        props.context.uploadToken,
        props.context.accessToken,
        props.context.protected,
        !!props.readOnly,
      ])}
      {...props}
    />
  );
}
function CurrentRespondentFileField(props: Props) {
  const { field, context, value, readOnly, error: answerError } = props,
    [records, setRecords] = useState<Record<string, UploadStatus>>({}),
    [readErrors, setReadErrors] = useState<Record<string, string>>({}),
    [checking, setChecking] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [recovery, setRecovery] = useState<Recovery>(),
    { isOnline } = useOnlineStatus(),
    callbacks = useRef(props),
    latestValues = useRef(value),
    mounted = useRef(true),
    pending = useRef(false),
    active = useRef<AbortController>(),
    trackedRecovery = useRef<Recovery>(),
    reads = useRef(new Set<AbortController>()),
    feedback = useRef<HTMLParagraphElement>(null);
  callbacks.current = props;
  latestValues.current = value;
  function trackRecovery(
    next:
      | Recovery
      | undefined
      | ((previous: Recovery | undefined) => Recovery | undefined),
  ) {
    const value =
      typeof next === "function" ? next(trackedRecovery.current) : next;
    trackedRecovery.current = value;
    setRecovery(value);
  }
  function changeValues(next: string[]) {
    latestValues.current = next;
    callbacks.current.onChange(next);
  }
  const prefix = `/forms/${context.slug}/uploads`,
    base = uploadBody(context),
    limit = field.maxFiles || 1,
    max = field.maxFileBytes || 26214400,
    allowed = field.allowedMime || Object.keys(uploadTypes),
    usable = (r: UploadStatus) =>
      r.state === "clean" && r.scanState === "clean",
    displayed = [...new Set([...value, ...Object.keys(records)])],
    unresolved =
      !!recovery ||
      checking.length > 0 ||
      Object.keys(readErrors).some((id) => value.includes(id)),
    bodyKey = JSON.stringify(base),
    valuesKey = JSON.stringify(value);
  function current(c: AbortController) {
    return mounted.current && !c.signal.aborted;
  }
  function forget(id: string) {
    setRecords((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    setReadErrors((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    changeValues(latestValues.current.filter((v) => v !== id));
    callbacks.current.onName(id, "");
  }
  function remember(record: UploadStatus) {
    setRecords((previous) => ({ ...previous, [record.uploadId]: record }));
    setReadErrors((previous) => {
      const next = { ...previous };
      delete next[record.uploadId];
      return next;
    });
    callbacks.current.onName(record.uploadId, record.filename);
  }
  function attach(record: UploadStatus) {
    if (!usable(record)) return;
    const latest = latestValues.current;
    if (!latest.includes(record.uploadId)) {
      if (latest.length >= limit)
        throw Error(
          "The file limit was reached. Remove another file before attaching this one.",
        );
      changeValues([...latest, record.uploadId]);
    }
  }
  function deny() {
    active.current?.abort();
    reads.current.forEach((c) => c.abort());
    setBlocked(true);
    setRecords({});
    setReadErrors({});
    setChecking([]);
    trackRecovery(undefined);
    setMessage("");
    setError(
      "File access could not be verified. Reopen the form using current access before continuing.",
    );
    changeValues([]);
    callbacks.current.onAccessDenied?.();
  }
  function failure(e: unknown, id?: string) {
    if (
      e instanceof ApiFailure &&
      ([401, 403].includes(e.status) ||
        (e.status === 404 && e.code !== "UPLOAD_NOT_FOUND"))
    ) {
      deny();
      return;
    }
    if (e instanceof ApiFailure && e.code === "UPLOAD_NOT_FOUND" && id) {
      forget(id);
      setMessage(
        "This attachment is no longer available and has been removed from this response draft.",
      );
      return;
    }
    if (trackedRecovery.current)
      setMessage("File work is paused until you check the original outcome.");
    const text =
      e instanceof TypeError && trackedRecovery.current
        ? "The connection was interrupted. Check the original file outcome before continuing."
        : e instanceof Error
          ? e.message
          : "The file operation could not be checked. Try again.";
    setError(text);
    if (id) setReadErrors((previous) => ({ ...previous, [id]: text }));
  }
  async function status(id: string, c: AbortController) {
    const record = await api<UploadStatus>(`${prefix}/${id}/status`, {
      method: "POST",
      body: base,
      signal: c.signal,
      protected: context.protected,
    });
    if (!current(c)) return;
    if (!validUploadStatus(record, id))
      throw Error(
        "The attachment status could not be verified. Check status again.",
      );
    remember(record);
    if (["rejected", "expired"].includes(record.state)) {
      changeValues(latestValues.current.filter((v) => v !== id));
      setMessage(
        record.state === "expired"
          ? "This upload expired. Remove it, then choose the file again."
          : record.message ||
              "This file did not pass security validation. Remove it and choose a different file.",
      );
    }
    return record;
  }
  useEffect(() => {
    mounted.current = true;
    const ownedReads = reads.current;
    return () => {
      mounted.current = false;
      active.current?.abort();
      ownedReads.forEach((c) => c.abort());
      callbacks.current.onBusy(false);
    };
  }, []);
  useEffect(() => {
    callbacks.current.onBusy(busy || unresolved);
  }, [busy, unresolved]);
  useEffect(() => {
    if (isOnline) return;
    active.current?.abort();
    reads.current.forEach((c) => c.abort());
    pending.current = false;
    setBusy(false);
    setChecking([]);
    trackRecovery((previous) =>
      previous?.kind === "upload"
        ? { ...previous, inspection: undefined }
        : previous
          ? { ...previous, checked: false }
          : undefined,
    );
    setReadErrors((previous) => ({
      ...previous,
      ...Object.fromEntries(
        latestValues.current.map((id) => [
          id,
          "Reconnect, then check this attachment's current status.",
        ]),
      ),
    }));
    setMessage(
      "File work is paused offline. Reconnect and check the original outcome; no upload resumes automatically.",
    );
  }, [isOnline]);
  useEffect(() => {
    const clear = () => deny();
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
    // A keyed context owns this listener; callbacks always use the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (readOnly || blocked || !navigator.onLine) return;
    const ids = (JSON.parse(valuesKey) as string[]).filter(
      (id) => !records[id] && !readErrors[id],
    );
    if (!ids.length) return;
    const c = new AbortController(),
      ownedReads = reads.current;
    ownedReads.add(c);
    setChecking((previous) => [...new Set([...previous, ...ids])]);
    void Promise.all(
      ids.map(async (id) => {
        try {
          await status(id, c);
        } catch (e) {
          if (current(c)) failure(e, id);
        } finally {
          if (current(c))
            setChecking((previous) => previous.filter((v) => v !== id));
        }
      }),
    ).finally(() => ownedReads.delete(c));
    return () => {
      c.abort();
      ownedReads.delete(c);
      if (mounted.current)
        setChecking((previous) => previous.filter((id) => !ids.includes(id)));
    };
    // Value/context changes cancel old reads. A failed read is retried explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey, bodyKey, readOnly, blocked]);
  async function run(action: (c: AbortController) => Promise<unknown>) {
    if (pending.current || blocked || !navigator.onLine) return;
    const c = new AbortController();
    active.current = c;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action(c);
    } catch (e) {
      if (current(c)) failure(e);
    } finally {
      if (mounted.current && active.current === c) {
        pending.current = false;
        setBusy(false);
        feedback.current?.focus();
      }
    }
  }
  async function transfer(original: UploadIntent, c: AbortController) {
    if (
      Date.now() < original.startedAt ||
      Date.now() - original.startedAt >= 9 * 60 * 1000
    )
      throw Error(
        "This upload's safe continuation window ended. Stop tracking it, remove any unavailable attachment and choose the file again.",
      );
    trackRecovery({ kind: "upload", original });
    setMessage(`Preparing ${original.filename}…`);
    const prepared = await prepareUpload(context, original, c.signal);
    if (!current(c)) return;
    trackRecovery({ kind: "upload", original, uploadId: prepared.uploadId });
    remember({
      uploadId: prepared.uploadId,
      state: prepared.state,
      scanState: prepared.state === "clean" ? "clean" : "pending",
      filename: original.filename,
      bytes: original.bytes.byteLength,
    });
    if (prepared.state === "pending") {
      setMessage(`Uploading ${original.filename}…`);
      const sent = await fetch(prepared.url!, {
        method: "PUT",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: prepared.headers,
        body: original.bytes,
        signal: AbortSignal.any([c.signal, AbortSignal.timeout(120000)]),
      });
      if (!current(c)) return;
      if (!sent.ok)
        throw Error(
          "The original direct upload did not finish. Check its preparation before explicitly continuing.",
        );
      await api(`${prefix}/${prepared.uploadId}/complete`, {
        method: "POST",
        body: base,
        signal: c.signal,
        protected: context.protected,
      });
      if (!current(c)) return;
    }
    setMessage(`Checking ${original.filename} for safe content…`);
    for (let attempt = 0; attempt < 60; attempt++) {
      const record = await status(prepared.uploadId, c);
      if (!current(c) || !record) return;
      if (usable(record)) {
        attach(record);
        trackRecovery(undefined);
        setMessage("The file is securely uploaded and checked.");
        return true;
      }
      if (["rejected", "expired"].includes(record.state)) {
        trackRecovery(undefined);
        return;
      }
      await waitForUploadCheck(c.signal);
      if (!current(c)) return;
    }
    setMessage(
      "Security checks are still running. Check the original file outcome before continuing.",
    );
  }
  async function upload(files: File[]) {
    const slots = displayed.filter(
      (id) =>
        !records[id] || !["expired", "rejected"].includes(records[id].state),
    ).length;
    if (pending.current || recovery || blocked || !navigator.onLine) return;
    setError("");
    if (slots + files.length > limit) {
      setError(
        `Choose no more than ${limit} file${limit === 1 ? "" : "s"} for this question.`,
      );
      return;
    }
    const chosen = files.map((file) => {
      const extension = "." + file.name.split(".").pop()?.toLowerCase(),
        mime =
          file.type ||
          Object.keys(uploadTypes).find((type) =>
            uploadTypes[type].includes(extension),
          ) ||
          "";
      return {
        file,
        mime,
        valid:
          allowed.includes(mime) &&
          uploadTypes[mime]?.includes(extension) &&
          file.size >= 1 &&
          file.size <= max,
      };
    });
    if (chosen.some((item) => !item.valid)) {
      setError(
        `Choose an allowed, non-empty file up to ${Math.round(max / 1048576)} MB.`,
      );
      return;
    }
    await run(async (c) => {
      for (const { file, mime } of chosen) {
        const bytes = await file.arrayBuffer();
        if (!current(c)) return;
        const hash = await crypto.subtle.digest("SHA-256", bytes);
        if (!current(c)) return;
        const sha256 = Array.from(new Uint8Array(hash), (v) =>
            v.toString(16).padStart(2, "0"),
          ).join(""),
          original = {
            document: JSON.stringify({
              ...base,
              fieldId: field.id,
              filename: file.name,
              mime,
              bytes: file.size,
              sha256,
            }),
            key: crypto.randomUUID(),
            bytes,
            filename: file.name,
            startedAt: Date.now(),
          };
        const attached = await transfer(original, c);
        if (!current(c) || !attached) return;
      }
    });
  }
  const canContinue =
    recovery?.kind === "upload" &&
    !!recovery.inspection &&
    (recovery.inspection.committed
      ? recovery.inspection.state === "pending"
      : recovery.inspection.canRetry);
  return (
    <div>
      {!readOnly && !blocked && (
        <input
          id={`field-${field.id}-upload`}
          type="file"
          accept={allowed.flatMap((type) => uploadTypes[type] || []).join(",")}
          multiple={limit > 1}
          disabled={
            busy ||
            !!recovery ||
            !isOnline ||
            displayed.filter(
              (id) =>
                !records[id] ||
                !["expired", "rejected"].includes(records[id].state),
            ).length >= limit
          }
          aria-labelledby={`field-${field.id}-label`}
          aria-required={field.required}
          aria-invalid={!!answerError || !!error}
          aria-describedby={[
            field.description && `field-${field.id}-help`,
            answerError && `field-${field.id}-error`,
            error && `field-${field.id}-upload-error`,
            `field-${field.id}-file-help`,
            `field-${field.id}-file-status`,
          ]
            .filter(Boolean)
            .join(" ")}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            if (files.length) void upload(files);
          }}
        />
      )}
      <p id={`field-${field.id}-file-help`} className="gt-helper">
        {readOnly
          ? "Existing attachments are preserved when you edit other answers."
          : `Up to ${limit} file${limit === 1 ? "" : "s"}, ${Math.round(max / 1048576)} MB each. Files stay private and are checked before submission.`}
      </p>
      {recovery && (
        <section
          role="region"
          aria-label="Unconfirmed file operation"
          className="gt-form"
        >
          <p>
            {recovery.kind === "upload"
              ? `The original upload of “${recovery.original.filename}” is not yet confirmed. New uploads are paused.`
              : "Removal is unconfirmed. Check this file before retrying removal or submitting."}
          </p>
          <div className="gt-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !isOnline || blocked}
              onClick={() =>
                void run(async (c) => {
                  if (recovery.kind === "remove") {
                    try {
                      const record = await status(recovery.uploadId, c);
                      if (current(c) && record)
                        trackRecovery({ ...recovery, checked: true });
                    } catch (e) {
                      if (
                        current(c) &&
                        e instanceof ApiFailure &&
                        e.code === "UPLOAD_NOT_FOUND"
                      ) {
                        forget(recovery.uploadId);
                        trackRecovery(undefined);
                        setMessage(
                          "The attachment is no longer available. Its reference was removed from this response draft.",
                        );
                      } else throw e;
                    }
                  } else {
                    trackRecovery({ ...recovery, inspection: undefined });
                    const inspection = await inspectUploadPreparation(
                      context,
                      recovery.original,
                      c.signal,
                    );
                    if (!current(c)) return;
                    trackRecovery({
                      ...recovery,
                      inspection,
                      uploadId: inspection.uploadId || undefined,
                    });
                    if (
                      inspection.committed &&
                      inspection.uploadId &&
                      inspection.state !== "pending"
                    ) {
                      const record = await status(inspection.uploadId, c);
                      if (!current(c) || !record) return;
                      if (usable(record)) {
                        attach(record);
                        trackRecovery(undefined);
                        setMessage(
                          "The original upload is confirmed and attached.",
                        );
                      } else if (["expired", "rejected"].includes(record.state))
                        trackRecovery(undefined);
                    } else
                      setMessage(
                        inspection.committed
                          ? "The original preparation exists. Explicitly continue the same file; its destination and request key are preserved."
                          : inspection.canRetry
                            ? "No committed preparation was found. You may explicitly continue the original file request."
                            : "No committed preparation was found and current eligibility blocks continuation. Stop tracking this file and reopen the form using current access.",
                      );
                  }
                })
              }
            >
              {recovery.kind === "upload"
                ? "Check original file outcome"
                : "Check removal status"}
            </Button>
            {recovery.kind === "upload" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !isOnline || !canContinue || blocked}
                onClick={() => void run((c) => transfer(recovery.original, c))}
              >
                Continue original upload
              </Button>
            )}
            {recovery.kind === "remove" && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !isOnline || !recovery.checked || blocked}
                onClick={() =>
                  void run(async (c) => {
                    trackRecovery({ ...recovery, checked: false });
                    await api(`${prefix}/${recovery.uploadId}/remove`, {
                      method: "POST",
                      body: base,
                      signal: c.signal,
                      protected: context.protected,
                    });
                    if (current(c)) {
                      forget(recovery.uploadId);
                      trackRecovery(undefined);
                      setMessage("File removed from this response draft.");
                    }
                  })
                }
              >
                Retry removing this file
              </Button>
            )}
          </div>
          <details>
            <summary>Review stopping file recovery</summary>
            <p>
              Stopping does not confirm the server outcome. This file will not
              be included in your response. Unassociated uploads remain subject
              to scheduled cleanup; this does not confirm physical deletion.
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (recovery.uploadId) forget(recovery.uploadId);
                trackRecovery(undefined);
                setError("");
                setMessage(
                  "File recovery stopped. Check your attachments before submitting.",
                );
              }}
            >
              Stop tracking this file
            </Button>
          </details>
        </section>
      )}
      {!blocked && displayed.length > 0 && (
        <ul className="gt-file-list">
          {displayed.map((id) => {
            const record = records[id],
              checked =
                !!record &&
                usable(record) &&
                !readErrors[id] &&
                !checking.includes(id);
            return (
              <li key={id}>
                <div>
                  <strong>{record?.filename || "Private attachment"}</strong>
                  <p className="gt-helper">
                    {readOnly
                      ? "Existing private attachment"
                      : checking.includes(id)
                        ? "Checking current attachment status…"
                        : readErrors[id]
                          ? "Current status unavailable"
                          : record?.state === "expired"
                            ? "Upload expired"
                            : record?.state === "rejected"
                              ? "Not accepted"
                              : checked && value.includes(id)
                                ? "Ready for submission"
                                : "Not yet attached"}
                  </p>
                  {readErrors[id] && <p role="alert">{readErrors[id]}</p>}
                </div>
                {!readOnly && (
                  <div className="gt-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        busy || !!recovery || !isOnline || checking.includes(id)
                      }
                      onClick={() =>
                        void run(async (c) => {
                          try {
                            const r = await status(id, c);
                            if (current(c) && r) {
                              attach(r);
                              setError("");
                              if (!usable(r))
                                setMessage(
                                  r.message ||
                                    "Security checks are still pending.",
                                );
                            }
                          } catch (e) {
                            if (current(c)) failure(e, id);
                          }
                        })
                      }
                    >
                      Check status
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || !!recovery || !isOnline}
                      onClick={() =>
                        void run(async (c) => {
                          trackRecovery({ kind: "remove", uploadId: id });
                          await api(`${prefix}/${id}/remove`, {
                            method: "POST",
                            body: base,
                            signal: c.signal,
                            protected: context.protected,
                          });
                          if (current(c)) {
                            forget(id);
                            trackRecovery(undefined);
                            setMessage(
                              "File removed from this response draft.",
                            );
                          }
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p
        id={`field-${field.id}-file-status`}
        ref={feedback}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="gt-helper"
      >
        {message}
      </p>
      {error && (
        <p
          id={`field-${field.id}-upload-error`}
          role="alert"
          className="gt-form-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
