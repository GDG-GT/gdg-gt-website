import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { mediaFileMutation } from "../../../shared/media.mjs";
import { Button, Field, Badge } from "../primitives";
import { humanBytes, type MediaFile } from "./types";
export default function MediaFileEditor({
  file,
  onSaved,
  onClose,
  readUnavailable = false,
}: {
  file: MediaFile;
  onSaved: () => void;
  onClose: () => void;
  readUnavailable?: boolean;
}) {
  const initial = {
    name: file.name,
    alt: file.alt,
    description: file.description,
    seoTitle: file.seoTitle || "",
    seoDescription: file.seoDescription || "",
    tags: file.tags.join(", "),
    eventId: file.eventId || "",
    order: file.order,
    allowDownload: file.allowDownload,
  };
  const [draft, setDraft] = useState(initial),
    [review, setReview] = useState<"publish" | "revoke">(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false),
    [capability, setCapability] = useState<{ url: string; preview: boolean }>(),
    [events, setEvents] = useState<
      { id: string; title: string; publication_status: string }[]
    >([]),
    [eventQuery, setEventQuery] = useState(""),
    [eventSearch, setEventSearch] = useState(""),
    [eventError, setEventError] = useState(""),
    [eventRetry, setEventRetry] = useState(0);
  const { busy, begin, current, finish, cancel, pending } = usePrivateMutation(
    file.id,
  );
  const { isOnline } = useOnlineStatus();
  const originalRevision = useRef(file.revision),
    heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null);
  const stale = originalRevision.current !== file.revision;
  const editable =
      file.actions.includes("update") &&
      !file.public &&
      !file.deletedAt &&
      !file.purgedAt,
    dirty =
      JSON.stringify(draft) !== JSON.stringify(initial) ||
      !!password ||
      !!confirmation,
    safety = useNavigationSafety(),
    attempt = useRef<{ signature: string; key: string }>();
  useDraftGuard(dirty, {
    busy,
    label: "Media metadata and publication review",
  });
  useEffect(() => {
    const clear = () => {
      cancel();
      setCapability(undefined);
      setPassword("");
      setConfirmation("");
      setDraft({
        name: "",
        alt: "",
        description: "",
        seoTitle: "",
        seoDescription: "",
        tags: "",
        eventId: "",
        order: 0,
        allowDownload: false,
      });
      setEvents([]);
      setReview(undefined);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, [cancel]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ items: typeof events }>(
      `/admin/media/events?team=${file.teamId || "chapter"}&q=${encodeURIComponent(eventSearch)}`,
      { signal: controller.signal },
    )
      .then((r) => {
        if (!controller.signal.aborted) {
          setEvents(r.items);
          setEventError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setEvents([]);
          setEventError(
            e instanceof Error ? e.message : "Event choices could not load.",
          );
        }
      });
    return () => controller.abort();
  }, [file.teamId, eventSearch, eventRetry]);
  useEffect(() => {
    if (!capability) return;
    const timer = setTimeout(() => setCapability(undefined), 55000);
    return () => clearTimeout(timer);
  }, [capability]);
  const leave = (next: () => void) => {
    if (pending.current) return;
    if (dirty && safety) safety.request(next);
    else next();
  };
  const run = async (publication = false) => {
    if (readUnavailable || conflict || stale || (!publication && !editable))
      return;
    if (
      publication &&
      (!file.canPublish ||
        file.deletedAt ||
        file.purgedAt ||
        file.fileType !== "image" ||
        file.scanState !== "clean" ||
        !review ||
        !password ||
        confirmation !==
          (review === "publish" ? "PUBLISH IMAGE" : "REVOKE IMAGE") ||
        (review === "publish" && !file.alt.trim()))
    )
      return;
    const controller = begin();
    if (!controller) return;
    const secret = password;
    setPassword("");
    setError("");
    try {
      let body: unknown;
      if (publication)
        body = {
          action: review,
          revision: file.revision,
          currentPassword: secret,
          confirmation,
        };
      else {
        const parsed = mediaFileMutation.safeParse({
          action: "metadata",
          files: [{ id: file.id, revision: file.revision }],
          document: {
            ...draft,
            tags: draft.tags
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
            eventId: draft.eventId || null,
          },
        });
        if (!parsed.success)
          throw Error(
            "Check the metadata: at most 20 distinct tags of 40 characters, a short name, valid event and non-negative order.",
          );
        body = parsed.data;
      }
      // Passwords never become an idempotency fingerprint or persisted draft.
      const signature = JSON.stringify(
        publication ? { review, revision: file.revision, confirmation } : body,
      );
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() };
      await api(
        publication
          ? `/admin/media/files/${file.id}/publication`
          : "/admin/media/files",
        {
          method: "POST",
          body,
          idempotencyKey: attempt.current.key,
          signal: controller.signal,
        },
      );
      if (current(controller)) {
        attempt.current = undefined;
        setPassword("");
        setConfirmation("");
        setCapability(undefined);
        onSaved();
      }
    } catch (e) {
      if (current(controller)) {
        setError((e as Error).message);
        if (
          e instanceof ApiFailure &&
          e.status === 409 &&
          e.code === "CONFLICT"
        )
          setConflict(true);
      }
    } finally {
      finish(controller);
    }
  };
  return (
    <section
      className="gt-panel gt-media-editor"
      aria-label="Selected media file"
    >
      <div className="gt-panel-heading">
        <div>
          <h2 ref={heading} tabIndex={-1}>
            {file.name}
          </h2>
          <p className="gt-helper">
            {file.originalName} · {humanBytes(file.bytes)} · revision{" "}
            {file.revision}
          </p>
        </div>
        <Button variant="ghost" disabled={busy} onClick={() => leave(onClose)}>
          Close file
        </Button>
      </div>
      <div className="gt-inline-actions">
        <Badge tone={file.scanState === "clean" ? "success" : "warning"}>
          {file.scanState}
        </Badge>
        <Badge>{file.public ? "Published image" : "Private"}</Badge>
        {file.publicationState === "queued" && (
          <Badge tone="warning">Publication queued</Badge>
        )}
      </div>
      <p className="gt-helper">
        {file.width && file.height
          ? `${file.width} × ${file.height} pixels · `
          : ""}
        {file.duration ? `${file.duration} seconds · ` : ""}
        {file.inUse
          ? `In use${file.usageCount ? ` · ${file.usageCount} explicit references` : " by chapter content"}. Resolve references before moving or archiving.`
          : "No retained usage reference found."}
      </p>
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          role="alert"
          className="gt-form-error"
        >
          {error}
        </p>
      )}
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {!isOnline && (
        <p role="status" className="gt-data-note">
          You are offline. Unsaved metadata stays in this open tab; nothing
          submits automatically on reconnect.
        </p>
      )}
      {readUnavailable && (
        <p role="status" className="gt-data-note">
          File actions are unavailable until the current protected inventory
          loads. Your fields are preserved.
        </p>
      )}
      {(conflict || stale) && (
        <p role="alert" className="gt-form-error">
          This file changed. Close this draft and reopen the current record;
          unsaved changes will be reviewed before leaving.
        </p>
      )}
      {file.scanState === "clean" && !file.deletedAt && !file.purgedAt && (
        <div className="gt-inline-actions">
          {[false, ...(file.fileType === "image" ? [true] : [])].map(
            (preview) => (
              <Button
                key={String(preview)}
                variant="secondary"
                disabled={busy || !isOnline || readUnavailable}
                onClick={async () => {
                  if (readUnavailable) return;
                  const controller = begin();
                  if (!controller) return;
                  setError("");
                  setCapability(undefined);
                  try {
                    const r = await api<{ url: string }>(
                      `/admin/media/files/${file.id}/${preview ? "preview" : "download"}`,
                      { signal: controller.signal },
                    );
                    if (current(controller)) {
                      setCapability({ url: r.url, preview });
                      setNotice(
                        "Private link expires in 60 seconds. Previously downloaded copies cannot be recalled.",
                      );
                    }
                  } catch (e) {
                    if (current(controller)) setError((e as Error).message);
                  } finally {
                    finish(controller);
                  }
                }}
              >
                {preview ? "Authorize image preview" : "Authorize download"}
              </Button>
            ),
          )}
        </div>
      )}
      {capability && (
        <div className="gt-media-preview">
          {capability.preview ? (
            <img
              src={capability.url}
              alt={file.alt || "Private media preview"}
              width={file.width || undefined}
              height={file.height || undefined}
            />
          ) : (
            <a href={capability.url} referrerPolicy="no-referrer">
              Download {file.originalName} ↗
            </a>
          )}
          <Button variant="ghost" onClick={() => setCapability(undefined)}>
            Clear private link
          </Button>
        </div>
      )}
      {!review ? (
        <form
          className="gt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          {file.public && (
            <p className="gt-helper">
              Revoke publication before changing approved metadata or download
              permission.
            </p>
          )}
          <fieldset
            disabled={busy || !editable || conflict || stale}
            className="gt-media-fields"
          >
            <Field label="Display name" required>
              <input
                required
                maxLength={100}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field
              label="Image alt text"
              hint="Describe the meaningful visual content; required before publication."
            >
              <input
                maxLength={300}
                value={draft.alt}
                onChange={(e) => setDraft({ ...draft, alt: e.target.value })}
              />
            </Field>
            <Field label="Caption / description">
              <textarea
                maxLength={1000}
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <details>
              <summary>Optional search metadata</summary>
              <div className="gt-form">
                <Field label="Search title">
                  <input
                    maxLength={255}
                    value={draft.seoTitle}
                    onChange={(e) =>
                      setDraft({ ...draft, seoTitle: e.target.value })
                    }
                  />
                </Field>
                <Field label="Search description">
                  <textarea
                    maxLength={1000}
                    rows={2}
                    value={draft.seoDescription}
                    onChange={(e) =>
                      setDraft({ ...draft, seoDescription: e.target.value })
                    }
                  />
                </Field>
              </div>
            </details>
            <Field label="Tags" hint="Comma-separated, up to 20 distinct tags.">
              <input
                maxLength={820}
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
              />
            </Field>
            <div className="gt-inline-actions">
              <Field label="Find an associated event">
                <input
                  value={eventQuery}
                  maxLength={100}
                  onChange={(e) => setEventQuery(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEventSearch(eventQuery)}
              >
                Find events
              </Button>
            </div>
            {eventError && (
              <p role="alert" className="gt-form-error">
                Event choices: {eventError}{" "}
                <button
                  type="button"
                  disabled={busy || !isOnline}
                  onClick={() => setEventRetry((v) => v + 1)}
                >
                  Retry event choices
                </button>
              </p>
            )}
            <Field
              label="Event association"
              hint="Up to 50 matching events in this scope. The event must be published before its image can be published."
            >
              <select
                value={draft.eventId}
                onChange={(e) =>
                  setDraft({ ...draft, eventId: e.target.value })
                }
              >
                <option value="">No event · general chapter photo</option>
                {draft.eventId &&
                  !events.some((v) => v.id === draft.eventId) && (
                    <option value={draft.eventId}>
                      Current association (revalidated on save)
                    </option>
                  )}
                {events.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title} · {v.publication_status}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Gallery order" hint="Lower values appear first.">
              <input
                type="number"
                min={0}
                max={1000000}
                step={1}
                required
                value={draft.order}
                onChange={(e) =>
                  setDraft({ ...draft, order: Number(e.target.value) })
                }
              />
            </Field>
            <label className="gt-check">
              <input
                type="checkbox"
                checked={draft.allowDownload}
                onChange={(e) =>
                  setDraft({ ...draft, allowDownload: e.target.checked })
                }
              />
              Allow a direct download of the public WebP image
            </label>
          </fieldset>
          <div className="gt-inline-actions">
            {editable && (
              <Button
                type="submit"
                disabled={
                  busy ||
                  !isOnline ||
                  readUnavailable ||
                  !dirty ||
                  conflict ||
                  stale
                }
              >
                {busy ? "Saving…" : "Save private metadata"}
              </Button>
            )}
            {file.canPublish &&
              !file.deletedAt &&
              file.fileType === "image" && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    busy ||
                    !isOnline ||
                    readUnavailable ||
                    conflict ||
                    stale ||
                    file.scanState !== "clean"
                  }
                  onClick={() =>
                    leave(() => {
                      setDraft(initial);
                      setReview(
                        file.public || file.publicationState === "queued"
                          ? "revoke"
                          : "publish",
                      );
                      setPassword("");
                      setConfirmation("");
                    })
                  }
                >
                  {file.public || file.publicationState === "queued"
                    ? "Review revocation"
                    : "Review public image"}
                </Button>
              )}
          </div>
        </form>
      ) : (
        <form
          className="gt-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(true);
          }}
        >
          <h3 ref={reviewHeading} tabIndex={-1}>
            {review === "publish"
              ? "Approve this image for the public gallery"
              : "Revoke public image delivery"}
          </h3>
          <p>
            {review === "publish"
              ? "The image, alt text, caption, associated event and download permission will become public after responsive WebP versions are prepared. Original files and other media stay private."
              : "New public requests will stop. Copies already downloaded or visible in an open page cannot be recalled. Active publication work is cancelled."}
          </p>
          <dl>
            <dt>Alt text</dt>
            <dd>{file.alt || "Missing — add meaningful alt text first"}</dd>
            <dt>Caption</dt>
            <dd>{file.description || "No caption"}</dd>
            <dt>Direct public download</dt>
            <dd>{file.allowDownload ? "Allowed" : "Not allowed"}</dd>
          </dl>
          <Field label="Current password" required>
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field
            label={`Type ${review === "publish" ? "PUBLISH IMAGE" : "REVOKE IMAGE"}`}
            required
          >
            <input
              autoComplete="off"
              required
              value={confirmation}
              disabled={busy}
              maxLength={80}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <div className="gt-inline-actions">
            <Button
              disabled={
                busy ||
                !isOnline ||
                readUnavailable ||
                stale ||
                !file.canPublish ||
                conflict ||
                !password ||
                confirmation !==
                  (review === "publish" ? "PUBLISH IMAGE" : "REVOKE IMAGE") ||
                (review === "publish" && !file.alt.trim())
              }
            >
              {busy
                ? "Confirming…"
                : review === "publish"
                  ? "Approve public WebP image"
                  : "Revoke publication"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                leave(() => {
                  setReview(undefined);
                  setPassword("");
                  setConfirmation("");
                })
              }
            >
              Cancel review
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
