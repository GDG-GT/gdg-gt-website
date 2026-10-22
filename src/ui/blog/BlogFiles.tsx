import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
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
}: {
  globalCreate: boolean;
  teams: { id: string; name: string }[];
  onCreated: (id: string) => void;
}) {
  const [file, setFile] = useState<File>(),
    [team, setTeam] = useState(globalCreate ? "" : teams[0]?.id || ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null),
    epoch = useRef(0),
    controller = useRef<AbortController>(),
    attempt = useRef<{
      createKey: string;
      completeKey: string;
      intent?: Intent;
      putDone?: boolean;
    }>();
  const navigation = useNavigationSafety();
  useDraftGuard(!!file, { busy, label: "Private editorial file upload" });
  useEffect(() => {
    const clear = () => {
      epoch.current++;
      controller.current?.abort();
      setFile(undefined);
      setBusy(false);
      setError("");
      setNotice("");
      attempt.current = undefined;
      if (input.current) input.current.value = "";
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      clear();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
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
          if (!file || busy) return;
          const n = epoch.current,
            current = attempt.current!;
          setBusy(true);
          setError("");
          setNotice("Preparing private quarantine upload…");
          controller.current = new AbortController();
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
            if (n !== epoch.current) return;
            if (!current.putDone) {
              if (!current.intent) {
                const digest = await crypto.subtle.digest("SHA-256", bytes),
                  sha256 = Array.from(new Uint8Array(digest), (v) =>
                    v.toString(16).padStart(2, "0"),
                  ).join("");
                if (n !== epoch.current) return;
                current.intent = await api<Intent>(base, {
                  method: "POST",
                  protected: true,
                  idempotencyKey: current.createKey,
                  body: {
                    teamId: team || null,
                    filename: file.name,
                    mime,
                    bytes: file.size,
                    sha256,
                  },
                });
              }
              if (n !== epoch.current) return;
              const result = await fetch(current.intent.url, {
                method: "PUT",
                credentials: "omit",
                headers: current.intent.headers,
                body: bytes,
                signal: controller.current.signal,
              });
              if (!result.ok)
                throw Error(
                  "The private upload did not finish. Retry before its two-minute link expires.",
                );
              current.putDone = true;
            }
            if (n !== epoch.current) return;
            const result = await api<{ submissionId: string }>(
              base + "/" + current.intent!.uploadId + "/complete",
              {
                method: "POST",
                protected: true,
                idempotencyKey: current.completeKey,
                body: {},
              },
            );
            if (n !== epoch.current) return;
            setFile(undefined);
            attempt.current = undefined;
            if (input.current) input.current.value = "";
            setNotice(
              "File quarantined. Scanning must finish before private download.",
            );
            navigation.allow(() => onCreated(result.submissionId));
          } catch (x) {
            if (n === epoch.current) {
              setError(
                x instanceof Error
                  ? x.message
                  : "The file could not be uploaded.",
              );
              setNotice("");
            }
          } finally {
            if (n === epoch.current) setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
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
          <p role="alert" className="gt-inline-error">
            {error}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        <div className="gt-toolbar">
          <Button disabled={busy || !file}>
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
}: {
  uploadId: string;
  filename: string;
}) {
  const [link, setLink] = useState<{ url: string; expires: number }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    epoch = useRef(0);
  useDraftGuard(false, { busy, label: "Private file download authorization" });
  useEffect(() => {
    const clear = () => {
      epoch.current++;
      setLink(undefined);
      setBusy(false);
      setError("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      clear();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
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
        disabled={busy}
        onClick={async () => {
          const n = epoch.current;
          setBusy(true);
          setError("");
          setLink(undefined);
          try {
            const result = await api<{ url: string }>(
              base + "/" + uploadId + "/download",
            );
            if (n === epoch.current)
              setLink({ url: result.url, expires: Date.now() + 55000 });
          } catch (x) {
            if (n === epoch.current) setError((x instanceof Error ? x.message : "This action could not be completed."));
          } finally {
            if (n === epoch.current) setBusy(false);
          }
        }}
      >
        {busy ? "Checking file access…" : "Authorize private download"}
      </Button>
      {link && (
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
        <p role="alert" className="gt-inline-error">
          {error}
        </p>
      )}
    </div>
  );
}
