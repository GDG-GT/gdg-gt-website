import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { Button, Field } from "../primitives";
import { human } from "./types";
type Files = {
  items: {
    id: string;
    filename: string;
    mime: string;
    bytes: number;
    state: string;
    uploaderName: string | null;
    createdAt: string;
  }[];
  total: number;
  pageSize: number;
  canUpload: boolean;
  revision: number;
};
type Intent = {
  uploadId: string;
  url: string;
  headers: Record<string, string>;
};
type AttachmentProps = {
  financeId: string;
  revision: number;
  disabled: boolean;
  onEditState: (state: { dirty: boolean; busy: boolean }) => void;
  operationPending?: () => boolean;
};
export default function FinanceAttachments(props: AttachmentProps) {
  return <FinanceAttachmentContent key={props.financeId} {...props} />;
}
function FinanceAttachmentContent({
  financeId,
  revision,
  disabled,
  onEditState,
  operationPending,
}: AttachmentProps) {
  const [files, setFiles] = useState<Files>(),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [file, setFile] = useState<File>(),
    [error, setError] = useState(""),
    [listError, setListError] = useState(""),
    [notice, setNotice] = useState(""),
    [download, setDownload] = useState<{
      id: string;
      url: string;
      expiresAt: number;
    }>();
  const attempt = useRef<{
    createKey: string;
    completeKey: string;
    revision: number;
    intent?: Intent;
    putDone?: boolean;
  }>();
  const input = useRef<HTMLInputElement>(null);
  const base = `/admin/finances/${financeId}/attachments`;
  const {
    busy,
    begin,
    current: owns,
    finish,
    cancel,
  } = usePrivateMutation(financeId);
  const errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (
      notice &&
      notice != "Preparing private upload…" &&
      notice !== "Uploading to private quarantine…"
    )
      noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    onEditState({ dirty: !!file || busy, busy });
    return () => onEditState({ dirty: false, busy: false });
  }, [file, busy, onEditState]);
  useEffect(() => {
    const c = new AbortController();
    api<Files>(`${base}?page=${page}`, { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) {
          setFiles(r);
          setListError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setListError(e.message);
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            cancel();
            setFile(undefined);
            attempt.current = undefined;
            setFiles(undefined);
            setDownload(undefined);
          }
        }
      });
    return () => c.abort();
  }, [base, page, tick, revision, cancel]);
  const pending = files?.items.some((f) =>
    ["pending", "queued"].includes(f.state),
  );
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      if (!document.hidden) setTick((v) => v + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [pending]);
  useEffect(() => {
    if (!download) return;
    const id = setTimeout(
      () => setDownload(undefined),
      Math.max(0, download.expiresAt - Date.now()),
    );
    return () => clearTimeout(id);
  }, [download]);
  const stale = !!file && attempt.current?.revision !== revision;
  return (
    <section>
      <h3>Private attachments</h3>
      <p className="gt-helper">
        PDF, PNG, JPEG or WebP, up to 10 MB each; at most ten active files per
        request. Scanning must finish before download. Financial receipts are
        retained; deletion and replacement of clean files are disabled.
      </p>
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          className="gt-form-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {listError && (
        <p className="gt-form-error" role="alert">
          {listError}
        </p>
      )}
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {!files ? (
        listError ? (
          <Button
            variant="ghost"
            onClick={() => {
              setListError("");
              setTick((v) => v + 1);
            }}
          >
            Retry attachment list
          </Button>
        ) : (
          <p role="status" aria-busy="true">
            Loading private attachments…
          </p>
        )
      ) : (
        <>
          {files.items.length ? (
            <ul className="gt-finance-files">
              {files.items.map((f) => (
                <li key={f.id}>
                  <strong>{f.filename}</strong>
                  <span>
                    {human(f.state)} · {(f.bytes / 1024).toFixed(1)} KB ·{" "}
                    {f.uploaderName || "Chapter account"}
                  </span>
                  {f.state === "clean" && (
                    <Button
                      variant="ghost"
                      disabled={disabled || busy}
                      onClick={async () => {
                        if (disabled || operationPending?.()) return;
                        const controller = begin();
                        if (!controller) return;
                        onEditState({ dirty: !!file, busy: true });
                        setError("");
                        setDownload(undefined);
                        try {
                          const r = await api<{ url: string }>(
                            `${base}/${f.id}/download`,
                            { signal: controller.signal },
                          );
                          if (owns(controller))
                            setDownload({
                              id: f.id,
                              url: r.url,
                              expiresAt: Date.now() + 55000,
                            });
                        } catch (e) {
                          if (owns(controller))
                            setError(
                              e instanceof Error
                                ? e.message
                                : "The download could not be authorized.",
                            );
                        } finally {
                          finish(controller);
                        }
                      }}
                    >
                      Authorize download of {f.filename}
                    </Button>
                  )}
                  {download?.id === f.id && (
                    <a
                      className="gt-button gt-button-secondary"
                      href={download.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Download {f.filename} · valid for 60 seconds
                    </a>
                  )}
                  {f.state === "queued" && (
                    <p className="gt-helper">
                      Security scan pending. You may return later; this is not
                      downloadable yet.
                    </p>
                  )}
                  {f.state === "rejected" && (
                    <p className="gt-helper">
                      The file failed validation or its request/access changed
                      before scanning completed. Choose a fresh file if uploads
                      are still permitted.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>No supporting files attached.</p>
          )}
          <nav aria-label="Finance attachment pages" className="gt-button-row">
            <Button
              variant="ghost"
              disabled={busy || page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Newer files
            </Button>
            <span>
              Page {page} · {files.total} files
            </span>
            <Button
              variant="ghost"
              disabled={busy || page * files.pageSize >= files.total}
              onClick={() => setPage(page + 1)}
            >
              Older files
            </Button>
          </nav>
          {files.canUpload && (
            <form
              className="gt-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  !file ||
                  disabled ||
                  operationPending?.() ||
                  stale ||
                  !files.canUpload
                )
                  return;
                const controller = begin();
                if (!controller) return;
                onEditState({ dirty: true, busy: true });
                setError("");
                setNotice("Preparing private upload…");
                const current = attempt.current!;
                try {
                  if (
                    file.size < 1 ||
                    file.size > 10485760 ||
                    ![
                      "application/pdf",
                      "image/png",
                      "image/jpeg",
                      "image/webp",
                    ].includes(file.type)
                  )
                    throw new Error(
                      "Choose an allowed PDF or image up to 10 MB.",
                    );
                  if (!current.putDone) {
                    const bytes = await file.arrayBuffer(),
                      digest = await crypto.subtle.digest("SHA-256", bytes),
                      sha256 = Array.from(new Uint8Array(digest), (v) =>
                        v.toString(16).padStart(2, "0"),
                      ).join("");
                    if (!owns(controller)) return;
                    current.intent = await api<Intent>(base, {
                      method: "POST",
                      protected: true,
                      idempotencyKey: current.createKey,
                      body: {
                        revision: current.revision,
                        filename: file.name,
                        mime: file.type,
                        bytes: file.size,
                        sha256,
                      },
                      signal: controller.signal,
                    });
                    if (!owns(controller)) return;
                    setNotice("Uploading to private quarantine…");
                    const uploaded = await fetch(current.intent.url, {
                      method: "PUT",
                      credentials: "omit",
                      headers: current.intent.headers,
                      body: file,
                      signal: AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(120000),
                      ]),
                    });
                    if (!uploaded.ok)
                      throw new Error(
                        "The private upload did not finish. Your chosen file is preserved; retry uploading.",
                      );
                    current.putDone = true;
                  }
                  if (!owns(controller)) return;
                  await api(`${base}/${current.intent!.uploadId}/complete`, {
                    method: "POST",
                    protected: true,
                    idempotencyKey: current.completeKey,
                    body: {},
                    signal: controller.signal,
                  });
                  if (!owns(controller)) return;
                  setFile(undefined);
                  attempt.current = undefined;
                  if (input.current) input.current.value = "";
                  setPage(1);
                  setTick((v) => v + 1);
                  setNotice(
                    "Upload received. Download becomes available only after the security scan passes.",
                  );
                } catch (e) {
                  if (owns(controller)) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Upload failed. Your chosen file is preserved.",
                    );
                    setNotice("");
                  }
                } finally {
                  finish(controller);
                }
              }}
            >
              <Field
                label="Supporting file"
                hint="Uploads are allowed only on your own draft/pending requests or by an authorized administrator."
              >
                <input
                  ref={input}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  disabled={disabled || busy}
                  onChange={(e) => {
                    const chosen = e.target.files?.[0];
                    setFile(chosen);
                    attempt.current = chosen
                      ? {
                          createKey: crypto.randomUUID(),
                          completeKey: crypto.randomUUID(),
                          revision,
                        }
                      : undefined;
                    setError("");
                    setNotice("");
                  }}
                />
              </Field>
              {stale && (
                <p role="alert">
                  The request changed. Clear and choose the file again after
                  reviewing the current request.
                </p>
              )}
              <div className="gt-button-row">
                <Button disabled={!file || disabled || busy || stale}>
                  {busy ? "Working…" : "Upload for security scan"}
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={busy || !file}
                  onClick={() => {
                    setFile(undefined);
                    attempt.current = undefined;
                    if (input.current) input.current.value = "";
                  }}
                >
                  Clear chosen file
                </Button>
              </div>
            </form>
          )}
          {!files.canUpload && (
            <p className="gt-helper">
              Adding attachments is unavailable in this request's current state
              or for your account. Existing clean files remain available to
              authorized readers.
            </p>
          )}
        </>
      )}
    </section>
  );
}
