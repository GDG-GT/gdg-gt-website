import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { mediaTypes } from "../../../shared/media.mjs";
import { Button, Field } from "../primitives";
import { humanBytes } from "./types";
type Intent = {
  uploadId: string;
  fileId: string;
  url: string;
  headers: Record<string, string>;
};
export default function MediaUpload({
  teamId,
  folderId,
  onSaved,
  onClose,
  imagesOnly = false,
}: {
  teamId: string | null;
  folderId: string | null;
  onSaved: () => void;
  onClose: () => void;
  imagesOnly?: boolean;
}) {
  const [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const safety = useNavigationSafety(),
    input = useRef<HTMLInputElement>(null),
    epoch = useRef(0),
    abort = useRef<AbortController>(),
    attempt = useRef<{
      createKey: string;
      completeKey: string;
      intent?: Intent;
      putDone?: boolean;
    }>();
  useDraftGuard(!!file, { busy, label: "Private media upload" });
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
      abort.current?.abort();
    };
    const clear = () => {
      invalidate();
      setFile(undefined);
      setBusy(false);
      setError("");
      attempt.current = undefined;
      if (input.current) input.current.value = "";
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  const upload = async () => {
    if (!file || busy) return;
    const rule = Object.values(
        mediaTypes as Record<string, { extensions: string[]; limit: number }>,
      ).find((v) =>
        v.extensions.includes(file.name.split(".").at(-1)?.toLowerCase() || ""),
      ),
      mime = Object.entries(mediaTypes).find(([, v]) => v === rule)?.[0];
    if (
      !rule ||
      !mime ||
      (imagesOnly && !mime.startsWith("image/")) ||
      file.size < 1 ||
      file.size > rule.limit
    ) {
      setError(
        "Choose a supported extension within its category’s size limit. SVG and HTML are not supported.",
      );
      return;
    }
    const controller = new AbortController(),
      current = epoch.current;
    abort.current = controller;
    setBusy(true);
    setError("");
    const valid = () => current === epoch.current && !controller.signal.aborted;
    try {
      setProgress("Checking file and reserving private quarantine…");
      const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        ),
        sha256 = [...new Uint8Array(digest)]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      if (!valid()) return;
      if (!attempt.current)
        attempt.current = {
          createKey: crypto.randomUUID(),
          completeKey: crypto.randomUUID(),
        };
      const a = attempt.current;
      if (!a.intent)
        a.intent = await api<Intent>("/admin/media/uploads", {
          method: "POST",
          body: {
            teamId,
            folderId,
            filename: file.name,
            mime,
            bytes: file.size,
            sha256,
          },
          idempotencyKey: a.createKey,
          signal: controller.signal,
        });
      if (!valid()) return;
      if (!a.putDone) {
        setProgress("Uploading directly to private storage…");
        const put = await fetch(a.intent.url, {
          method: "PUT",
          headers: a.intent.headers,
          body: file,
          credentials: "omit",
          signal: controller.signal,
        });
        if (!put.ok)
          throw Error(
            "The signed upload failed or expired. Retry to request a fresh capability for the same pending file.",
          );
        a.putDone = true;
      }
      if (!valid()) return;
      setProgress("Queueing isolated malware and content checks…");
      await api(`/admin/media/uploads/${a.intent.uploadId}/complete`, {
        method: "POST",
        body: {},
        idempotencyKey: a.completeKey,
        signal: controller.signal,
      });
      if (valid()) {
        setFile(undefined);
        attempt.current = undefined;
        if (input.current) input.current.value = "";
        setProgress(
          "Uploaded privately. Refresh scan status; downloads remain unavailable until checks finish.",
        );
        onSaved();
      }
    } catch (e) {
      if (valid()) {
        setError((e as Error).message);
        if (attempt.current && !attempt.current.putDone)
          attempt.current.intent = undefined;
        setProgress("");
      }
    } finally {
      if (valid()) setBusy(false);
    }
  };
  return (
    <section className="gt-panel gt-form" aria-label="Upload private media">
      <h2>Upload to this folder</h2>
      <p className="gt-helper">
        Images 20 MiB · video 250 MiB · audio 50 MiB · documents/ZIP 25 MiB.
        Files stay private until scanning passes. Publishing is a separate
        approval.
      </p>
      <Field
        label="Media file"
        hint="PNG, JPEG, WebP, MP4, WebM, MP3, WAV, OGG, PDF, DOCX, TXT, Markdown or ZIP."
      >
        <input
          ref={input}
          type="file"
          disabled={busy}
          accept={Object.entries(mediaTypes)
            .filter(([mime]) => !imagesOnly || mime.startsWith("image/"))
            .map(([, rule]) => rule)
            .flatMap((r: { extensions: string[] }) =>
              r.extensions.map((ext) => "." + ext),
            )
            .join(",")}
          onChange={(e) => {
            setFile(e.target.files?.[0]);
            attempt.current = undefined;
            setError("");
            setProgress("");
          }}
        />
      </Field>
      {file && (
        <p>
          {file.name} · {humanBytes(file.size)}
        </p>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {progress && <p role="status">{progress}</p>}
      <div className="gt-inline-actions">
        <Button disabled={busy || !file} onClick={() => void upload()}>
          {busy
            ? "Working…"
            : error
              ? "Retry private upload"
              : "Upload privately"}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (file && safety) safety.request(onClose);
            else onClose();
          }}
        >
          Close upload
        </Button>
      </div>
    </section>
  );
}
