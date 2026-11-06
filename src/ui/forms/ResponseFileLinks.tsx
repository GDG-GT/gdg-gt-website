import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
type Props = {
  formId: string;
  responseId: string;
  ids: string[];
  canDownload?: boolean;
};
type Download = {
  id: string;
  url: string;
  expiresAt: number;
  startedAt: number;
};
function authorizedLink(
  result: { url: string; expiresIn: number },
  startedAt: number,
) {
  let url: URL;
  try {
    url = new URL(result.url);
  } catch {
    throw Error(
      "The private download link could not be verified. Authorize it again.",
    );
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.hash ||
    !Number.isFinite(result.expiresIn) ||
    result.expiresIn <= 0 ||
    result.expiresIn > 60
  )
    throw Error(
      "The private download link could not be verified. Authorize it again.",
    );
  const expiresAt = startedAt + Math.min(55, result.expiresIn) * 1000;
  if (Date.now() < startedAt || Date.now() >= expiresAt)
    throw Error(
      "The download authorization expired before it arrived. Authorize it again.",
    );
  return { url: url.href, expiresAt, startedAt };
}
export default function ResponseFileLinks(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <PrivateFiles
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}:${props.responseId}:${JSON.stringify(props.ids)}:${props.canDownload !== false}`}
      {...props}
    />
  );
}
function PrivateFiles({ formId, responseId, ids, canDownload = true }: Props) {
  const [activeId, setActiveId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [link, setLink] = useState<Download>(),
    [sessionInvalid, setSessionInvalid] = useState(false);
  const { busy, begin, current, finish, cancel } = usePrivateMutation(
      `${formId}:${responseId}`,
    ),
    { isOnline } = useOnlineStatus(),
    feedback = useRef<HTMLParagraphElement>(null),
    focusRequested = useRef(false),
    root = `/admin/forms/${formId}/responses/${responseId}/files`;
  useEffect(() => {
    if ((error || notice) && focusRequested.current) {
      feedback.current?.focus();
      focusRequested.current = false;
    }
  }, [error, notice]);
  useEffect(() => {
    const clear = () => {
      focusRequested.current = false;
      cancel();
      setLink(undefined);
      setActiveId("");
      setError("");
      setNotice("");
      setSessionInvalid(true);
    };
    const offline = () => {
      focusRequested.current = false;
      cancel();
      setLink(undefined);
      setActiveId("");
      setNotice(
        "Reconnect and authorize the attachment again. No download opens automatically.",
      );
    };
    window.addEventListener("gdg:session-cleared", clear);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", clear);
      window.removeEventListener("offline", offline);
    };
  }, [cancel]);
  useEffect(() => {
    if (!link) return;
    const timer = window.setTimeout(
      () => {
        setLink(undefined);
        setNotice("The download link expired. Authorize the attachment again.");
      },
      Math.max(0, link.expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [link]);
  const authorize = async (id: string) => {
    if (!canDownload || sessionInvalid || !ids.includes(id)) return;
    const controller = begin();
    if (!controller) return;
    const startedAt = Date.now();
    focusRequested.current = true;
    setActiveId(id);
    setError("");
    setNotice("");
    setLink(undefined);
    try {
      const result = await api<{ url: string; expiresIn: number }>(
        root + "/" + id,
        { signal: controller.signal },
      );
      if (!current(controller)) return;
      const download = authorizedLink(result, startedAt);
      setLink({ id, ...download });
      setNotice(
        "Attachment authorized. Use its download link within one minute. Downloaded copies cannot be recalled.",
      );
    } catch (e) {
      if (current(controller)) {
        setLink(undefined);
        setError(
          e instanceof Error
            ? e.message
            : "The attachment could not be authorized. Try again.",
        );
        if (e instanceof ApiFailure && e.status === 401)
          setSessionInvalid(true);
      }
    } finally {
      if (current(controller)) setActiveId("");
      finish(controller);
    }
  };
  return (
    <div
      role="group"
      aria-label="Private response attachments"
      aria-busy={busy}
    >
      {!ids.length ? (
        <p>Not answered</p>
      ) : (
        <>
          {!canDownload && (
            <p role="status">
              Current permission does not allow these attachments. Reopen the
              response after access is updated.
            </p>
          )}
          {sessionInvalid && (
            <p role="status">
              Your sign-in changed or expired. Reopen the response from the
              current workspace before downloading.
            </p>
          )}
          {ids.map((id, index) => (
            <div key={id} className="gt-inline-actions">
              <Button
                type="button"
                disabled={busy || !isOnline || !canDownload || sessionInvalid}
                variant="secondary"
                onClick={() => void authorize(id)}
              >
                {busy && activeId === id
                  ? "Authorizing…"
                  : `Authorize private attachment ${index + 1}`}
              </Button>
              {link?.id === id &&
                isOnline &&
                canDownload &&
                !sessionInvalid && (
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
                        Date.now() >= link.expiresAt
                      ) {
                        focusRequested.current = true;
                        event.preventDefault();
                        setLink(undefined);
                        setNotice(
                          "The download link expired or the connection changed. Authorize it again.",
                        );
                      }
                    }}
                  >
                    Download attachment {index + 1}
                  </a>
                )}
            </div>
          ))}
          {!isOnline && (
            <p role="status">
              You are offline. Private download authorization is paused.
            </p>
          )}
        </>
      )}
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
    </div>
  );
}
