import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "../primitives";
import type { FormField } from "./store";
type Status = {
  uploadId: string;
  state: string;
  scanState: string;
  filename: string;
  bytes: number;
  message?: string;
};
export type UploadContext = {
  slug: string;
  versionId: string;
  uploadToken: string;
  accessToken?: string;
};
const types: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};
export default function RespondentFileField({
  field,
  value,
  onChange,
  context,
  readOnly,
  onBusy,
  onName,
  error: answerError,
}: {
  field: FormField;
  value: string[];
  onChange: (value: string[]) => void;
  context: UploadContext;
  readOnly?: boolean;
  onBusy: (busy: boolean) => void;
  onName: (id: string, name: string) => void;
  error?: string;
}) {
  const [records, setRecords] = useState<Record<string, Status>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const mounted = useRef(true),
    prefix = `/forms/${context.slug}/uploads`,
    limit = field.maxFiles || 1,
    max = field.maxFileBytes || 26214400,
    allowed = field.allowedMime || Object.keys(types);
  const body = useMemo(
    () => ({
      versionId: context.versionId,
      uploadToken: context.uploadToken,
      ...(context.accessToken ? { accessToken: context.accessToken } : {}),
    }),
    [context.versionId, context.uploadToken, context.accessToken],
  );
  const onNameRef = useRef(onName);
  onNameRef.current = onName;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const remember = useCallback((record: Status) => {
    if (!mounted.current) return;
    setRecords((previous) => ({ ...previous, [record.uploadId]: record }));
    onNameRef.current(record.uploadId, record.filename);
  }, []);
  const status = useCallback(
    async (id: string) => {
      const result = await api<Status>(`${prefix}/${id}/status`, {
        method: "POST",
        body,
      });
      remember(result);
      return result;
    },
    [prefix, body, remember],
  );
  const valuesKey = value.join(",");
  useEffect(() => {
    if (!readOnly)
      for (const id of valuesKey.split(",").filter(Boolean))
        status(id).catch(() => {
          /* Final submission validates all uploaded IDs again. */
        });
  }, [readOnly, status, valuesKey]);
  const upload = async (files: File[]) => {
    setError("");
    if (value.length + files.length > limit) {
      setError(
        `Choose no more than ${limit} file${limit === 1 ? "" : "s"} for this question.`,
      );
      return;
    }
    setBusy(true);
    onBusy(true);
    const accepted = [...value];
    try {
      for (const file of files) {
        const mime =
          file.type ||
          Object.keys(types).find((type) =>
            types[type].includes(
              "." + file.name.split(".").pop()?.toLowerCase(),
            ),
          ) ||
          "";
        if (
          !allowed.includes(mime) ||
          !types[mime]?.includes(
            "." + file.name.split(".").pop()?.toLowerCase(),
          ) ||
          file.size < 1 ||
          file.size > max
        )
          throw new Error(
            `Choose an allowed, non-empty file up to ${Math.round(max / 1048576)} MB.`,
          );
        setMessage(`Preparing ${file.name}…`);
        const bytes = await file.arrayBuffer(),
          hash = await crypto.subtle.digest("SHA-256", bytes),
          sha256 = Array.from(new Uint8Array(hash), (v) =>
            v.toString(16).padStart(2, "0"),
          ).join("");
        const intent = await api<{
          uploadId: string;
          url: string;
          headers: Record<string, string>;
        }>(prefix, {
          method: "POST",
          body: {
            ...body,
            fieldId: field.id,
            filename: file.name,
            mime,
            bytes: file.size,
            sha256,
          },
        });
        remember({
          uploadId: intent.uploadId,
          filename: file.name,
          bytes: file.size,
          state: "pending",
          scanState: "pending",
        });
        setMessage(`Uploading ${file.name}…`);
        const sent = await fetch(intent.url, {
          method: "PUT",
          credentials: "omit",
          headers: intent.headers,
          body: bytes,
          signal: AbortSignal.timeout(120000),
        });
        if (!sent.ok)
          throw new Error(
            "The direct upload did not finish. Choose the file again.",
          );
        await api(`${prefix}/${intent.uploadId}/complete`, {
          method: "POST",
          body,
        });
        setMessage(`Checking ${file.name} for safe content…`);
        let result: Status | undefined;
        for (let attempt = 0; attempt < 60; attempt++) {
          result = await status(intent.uploadId);
          if (["clean", "rejected", "expired"].includes(result.state)) break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        if (result?.state === "clean") {
          accepted.push(intent.uploadId);
          onChange([...accepted]);
        } else if (result?.state === "rejected")
          throw new Error(
            result.message || "This file did not pass security validation.",
          );
        else
          throw new Error(
            "Security checks are still running. Use “Check status” below before continuing.",
          );
      }
      setMessage("Files are securely uploaded and checked.");
    } catch (e) {
      setError((e as Error).message);
      setMessage("");
    } finally {
      if (mounted.current) setBusy(false);
      onBusy(false);
    }
  };
  const displayed = [...new Set([...value, ...Object.keys(records)])];
  return (
    <div>
      {!readOnly && (
        <input
          id={`field-${field.id}-upload`}
          type="file"
          accept={allowed.flatMap((type) => types[type] || []).join(",")}
          multiple={limit > 1}
          disabled={busy || value.length >= limit}
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
      {displayed.length > 0 && (
        <ul className="gt-file-list">
          {displayed.map((id) => {
            const record = records[id];
            return (
              <li key={id}>
                <div>
                  <strong>{record?.filename || "Private attachment"}</strong>
                  <p className="gt-helper">
                    {value.includes(id)
                      ? "Ready for submission"
                      : record?.state === "rejected"
                        ? "Not accepted"
                        : "Not yet attached"}
                  </p>
                </div>
                {!readOnly && (
                  <div className="gt-actions">
                    {!value.includes(id) && record?.state !== "rejected" && (
                      <Button
                        type="button"
                        disabled={busy}
                        variant="secondary"
                        onClick={async () => {
                          if (busy) return;
                          setBusy(true);
                          onBusy(true);
                          try {
                            const r = await status(id);
                            if (r.state === "clean") {
                              onChange([...value, id]);
                              setError("");
                            } else
                              setMessage(
                                r.message ||
                                  "Security checks are still pending.",
                              );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            if (mounted.current) setBusy(false);
                            onBusy(false);
                          }
                        }}
                      >
                        Check status
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (busy) return;
                        setBusy(true);
                        onBusy(true);
                        try {
                          await api(`${prefix}/${id}/remove`, {
                            method: "POST",
                            body,
                          });
                          onChange(value.filter((v) => v !== id));
                          setRecords((previous) => {
                            const next = { ...previous };
                            delete next[id];
                            return next;
                          });
                          setError("");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          if (mounted.current) setBusy(false);
                          onBusy(false);
                        }
                      }}
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
