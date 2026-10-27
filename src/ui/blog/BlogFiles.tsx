import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { blogFileTypes } from "../../../shared/blog-uploads.mjs";
import { Button, Field } from "../primitives";
type Intent = {
  uploadId: string;
  submissionId: string;
  url: string;
  headers: Record<string, string>;
};
const base = "/admin/blog/uploads",
  max = 20971520;
const extensions: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
export function BlogFileUpload({
  globalCreate,
  teams,
  onCreated,
  unavailable = false,
}: {
  globalCreate: boolean;
  teams: { id: string; name: string }[];
  onCreated: (id: string) => void;
  unavailable?: boolean;
}) {
  const [file, setFile] = useState<File>(),
    [team, setTeam] = useState(globalCreate ? "" : teams[0]?.id || ""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    attempt = useRef<{
      createKey: string;
      completeKey: string;
      intent?: Intent;
      putDone?: boolean;
    }>();
  const navigation = useNavigationSafety();
  const { isOnline } = useOnlineStatus();
  const {
    busy,
    begin,
    current: owns,
    finish,
    cancel,
  } = usePrivateMutation(team);
  const allowed = team ? teams.some((t) => t.id === team) : globalCreate;
  useDraftGuard(!!file, { busy, label: "Private editorial file upload" });
  useEffect(() => {
    const clear = () => {
      cancel();
      setFile(undefined);
      setError("");
      setNotice("");
      attempt.current = undefined;
      if (input.current) input.current.value = "";
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      cancel();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, [cancel]);
  useEffect(() => {
    if (!allowed) {
      cancel();
      setFile(undefined);
      attempt.current = undefined;
      if (input.current) input.current.value = "";
    }
  }, [allowed, cancel]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  return (
    <section
      className="gt-blog-detail"
      aria-label="Private editorial file upload"
    >
      <h2>Submit an editorial file</h2>
      <p>
        PDF, DOCX, text, PNG, JPEG or WebP up to 20 MB. Files are private,
        scanned before download and retained with their discussion. Maximum five
        pending uploads, 25 files and 250 MB per account per 24 hours. No public
        submission or email is created.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file || unavailable || !allowed || !isOnline || !attempt.current)
            return;
          const controller = begin();
          if (!controller) return;
          const current = attempt.current;
          setError("");
          setNotice("Preparing private quarantine upload…");
          try {
            const mime =
              file.type ||
              extensions[file.name.split(".").pop()?.toLowerCase() || ""];
            if (
              file.size < 1 ||
              file.size > max ||
              !blogFileTypes.includes(mime)
            )
              throw Error("Choose an allowed file up to 20 MB.");
            const bytes = await file.arrayBuffer();
            if (!owns(controller)) return;
            if (!current.putDone) {
              if (!current.intent) {
                const digest = await crypto.subtle.digest("SHA-256", bytes),
                  sha256 = Array.from(new Uint8Array(digest), (v) =>
                    v.toString(16).padStart(2, "0"),
                  ).join("");
                if (!owns(controller)) return;
                current.intent = await api<Intent>(base, {
                  method: "POST",
                  protected: true,
                  idempotencyKey: current.createKey,
                  signal: controller.signal,
                  body: {
                    teamId: team || null,
                    filename: file.name,
                    mime,
                    bytes: file.size,
                    sha256,
                  },
                });
              }
              if (!owns(controller)) return;
              const result = await fetch(current.intent.url, {
                method: "PUT",
                credentials: "omit",
                headers: current.intent.headers,
                body: bytes,
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(120000),
                ]),
              });
              if (!result.ok)
                throw Error(
                  "The private upload did not finish. Retry before its two-minute link expires.",
                );
              if (!owns(controller)) return;
              current.putDone = true;
            }
            if (!owns(controller)) return;
            const result = await api<{ submissionId: string }>(
              base + "/" + current.intent!.uploadId + "/complete",
              {
                method: "POST",
                protected: true,
                idempotencyKey: current.completeKey,
                signal: controller.signal,
                body: {},
              },
            );
            if (!owns(controller)) return;
            setFile(undefined);
            attempt.current = undefined;
            if (input.current) input.current.value = "";
            setNotice(
              "File quarantined. Scanning must finish before private download.",
            );
            navigation.allow(() => onCreated(result.submissionId));
          } catch (x) {
            if (owns(controller)) {
              setError(
                x instanceof Error
                  ? x.message
                  : "The file could not be uploaded.",
              );
              setNotice("");
            }
          } finally {
            finish(controller);
          }
        }}
      >
        <fieldset disabled={busy || unavailable}>
          <Field label="File owning scope">
            <select
              value={team}
              disabled={!!file}
              onChange={(e) => setTeam(e.target.value)}
            >
              {globalCreate && <option value="">Chapter</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Private editorial file">
            <input
              ref={input}
              type="file"
              accept={blogFileTypes.join(",")}
              onChange={(e) => {
                setFile(e.target.files?.[0]);
                attempt.current = {
                  createKey: crypto.randomUUID(),
                  completeKey: crypto.randomUUID(),
                };
                setError("");
                setNotice("");
              }}
            />
          </Field>
        </fieldset>
        {error && (
          <p
            role="alert"
            tabIndex={-1}
            ref={errorFocus}
            className="gt-inline-error"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" tabIndex={-1} ref={noticeFocus}>
            {notice}
          </p>
        )}
        {!isOnline && (
          <p role="status">
            You’re offline. Reconnect and choose Upload when ready; nothing
            sends automatically.
          </p>
        )}
        <div className="gt-toolbar">
          <Button
            disabled={busy || !file || unavailable || !allowed || !isOnline}
          >
            {busy ? "Uploading privately…" : "Upload and scan privately"}
          </Button>
          {file && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setFile(undefined);
                attempt.current = undefined;
                if (input.current) input.current.value = "";
                setError("");
              }}
            >
              Clear selected file
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
export function BlogFileDownload({
  uploadId,
  filename,
  unavailable = false,
}: {
  uploadId: string;
  filename: string;
  unavailable?: boolean;
}) {
  const [link, setLink] = useState<{ url: string; expires: number }>(),
    [error, setError] = useState(""),
    errorFocus = useRef<HTMLParagraphElement>(null);
  const { busy, begin, current, finish, cancel } = usePrivateMutation(uploadId);
  const { isOnline } = useOnlineStatus();
  useDraftGuard(false, { busy, label: "Private file download authorization" });
  useEffect(() => {
    const clear = () => {
      cancel();
      setLink(undefined);
      setError("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      cancel();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, [cancel]);
  useEffect(() => {
    cancel();
    setLink(undefined);
    setError("");
  }, [uploadId, unavailable, cancel]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!link) return;
    const timer = setTimeout(
      () => setLink(undefined),
      Math.max(0, link.expires - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [link]);
  return (
    <div>
      <Button
        variant="secondary"
        disabled={busy || unavailable || !isOnline}
        onClick={async () => {
          if (unavailable || !isOnline) return;
          const controller = begin();
          if (!controller) return;
          setError("");
          setLink(undefined);
          try {
            const result = await api<{ url: string }>(
              base + "/" + uploadId + "/download",
              { signal: controller.signal },
            );
            if (current(controller))
              setLink({ url: result.url, expires: Date.now() + 55000 });
          } catch (x) {
            if (current(controller))
              setError(
                x instanceof Error
                  ? x.message
                  : "This action could not be completed.",
              );
          } finally {
            finish(controller);
          }
        }}
      >
        {busy ? "Checking file access…" : "Authorize private download"}
      </Button>
      {link && !unavailable && (
        <p>
          <a
            className="gt-button gt-button-secondary"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Download {filename} · expires within 60 seconds
          </a>
        </p>
      )}
      {error && (
        <p
          role="alert"
          tabIndex={-1}
          ref={errorFocus}
          className="gt-inline-error"
        >
          {error}
        </p>
      )}
    </div>
  );
}
