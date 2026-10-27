import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { siteStatusChange } from "../../../shared/site-status.mjs";
import { validationMessage } from "@/lib/validationMessage";
import { Badge, Button, Field } from "../primitives";
import { MaintenanceContent } from "./SiteAvailability";
import type { SiteState } from "@/contexts/SiteAvailabilityContext";
type PrivateState = SiteState & {
  updatedAt: string | null;
  canUpdate: boolean;
};
const fields = (s: SiteState) => ({
  is_live: s.is_live,
  message: s.message,
  redirect_url: s.redirect_url,
  button_text: s.button_text,
  auto_redirect: s.auto_redirect,
});
export default function SiteStatusWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <SiteStatusEditor
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function SiteStatusEditor() {
  const [accepted, setAccepted] = useState<PrivateState>(),
    [draft, setDraft] = useState<ReturnType<typeof fields>>(),
    [revision, setRevision] = useState(0),
    [tick, setTick] = useState(0),
    [editing, setEditing] = useState(false);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const key = useRef<string>(),
    signature = useRef<string>(),
    heading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    navigation = useNavigationSafety();
  const read = usePrivateRead<PrivateState>("/admin/site-status", tick),
    current =
      read.data && accepted && accepted.revision > read.data.revision
        ? accepted
        : read.data;
  const { clear: clearRead } = read;
  const {
    busy,
    begin,
    current: owns,
    finish,
    cancel,
    pending,
  } = usePrivateMutation("site-status");
  const { isOnline } = useOnlineStatus();
  const stale = editing && current?.revision !== revision;
  useDraftGuard(editing, { busy, label: "Site-wide availability changes" });
  useEffect(() => {
    const refresh = () => {
      if (!pending.current) setTick((v) => v + 1);
    };
    const timer = window.setInterval(() => {
      if (!document.hidden && navigator.onLine) refresh();
    }, 30000);
    window.addEventListener("gdg:access-changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("gdg:access-changed", refresh);
    };
  }, [pending]);
  useEffect(() => {
    if (read.denied) {
      cancel();
      clearRead();
      setAccepted(undefined);
      setDraft(undefined);
      setEditing(false);
      setPassword("");
      setConfirmation("");
      setNotice("");
      key.current = undefined;
      signature.current = undefined;
    }
  }, [read.denied, cancel, clearRead]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (editing) heading.current?.focus();
  }, [editing]);
  function close() {
    const next = () => {
      setEditing(false);
      setPassword("");
      setConfirmation("");
      setDraft(undefined);
      setConflict(false);
      key.current = undefined;
      signature.current = undefined;
    };
    if (navigation) navigation.request(next);
    else next();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (
      pending.current ||
      !isOnline ||
      read.loading ||
      read.error ||
      stale ||
      conflict ||
      !draft ||
      !current?.canUpdate
    )
      return;
    const parsed = siteStatusChange.safeParse({
      revision,
      record: draft,
      currentPassword: password,
      confirmation,
    });
    if (!parsed.success) {
      setError(
        validationMessage(parsed.error, "Check the availability settings."),
      );
      return;
    }
    const controller = begin();
    if (!controller) return;
    const body = parsed.data;
    const identity = JSON.stringify(body, (key, value) =>
      key === "currentPassword" ? undefined : value,
    );
    if (signature.current !== identity) {
      signature.current = identity;
      key.current = crypto.randomUUID();
    }
    setPassword("");
    setError("");
    try {
      key.current ??= crypto.randomUUID();
      const saved = await api<PrivateState>("/admin/site-status", {
        method: "PATCH",
        protected: true,
        body,
        idempotencyKey: key.current,
        signal: controller.signal,
      });
      if (!owns(controller)) return;
      setAccepted(saved);
      setEditing(false);
      setDraft(undefined);
      setConfirmation("");
      key.current = undefined;
      signature.current = undefined;
      setNotice("Site-wide availability saved.");
      setTick((v) => v + 1);
      window.dispatchEvent(new Event("gdg:site-status-changed"));
    } catch (e) {
      if (owns(controller)) {
        if (e instanceof ApiFailure && e.status === 409) setConflict(true);
        if (
          e instanceof ApiFailure &&
          [401, 403, 404].includes(e.status) &&
          e.code !== "PASSWORD_REQUIRED"
        ) {
          setEditing(false);
          setDraft(undefined);
          setConfirmation("");
          clearRead();
          setAccepted(undefined);
          setTick((v) => v + 1);
        }
        setError(validationMessage(e, "Check the availability settings."));
      }
    } finally {
      finish(controller);
    }
  }
  return (
    <section className="gt-admin-page gt-status-workspace">
      <header className="gt-admin-heading">
        <div>
          <h1>Site availability</h1>
          <p>
            Control the public chapter site without locking officers out of the
            workspace.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => setTick((v) => v + 1)}
        >
          Refresh status
        </Button>
      </header>
      {error && (
        <p
          role="alert"
          tabIndex={-1}
          ref={errorFocus}
          className="gt-form-error"
        >
          {error}
        </p>
      )}
      {notice && (
        <p role="status" tabIndex={-1} ref={noticeFocus}>
          {notice}
        </p>
      )}
      {read.error && (
        <p role="alert">
          Site availability: {read.error}{" "}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              document.getElementById("workspace-content")?.focus();
              setTick((v) => v + 1);
            }}
          >
            Retry availability
          </Button>
        </p>
      )}
      {current && (read.loading || read.error) && (
        <p role="status">
          Availability may be out of date. Last loaded{" "}
          {new Date(read.at!).toLocaleString()}.
        </p>
      )}
      {!isOnline && (
        <p role="status">
          You’re offline. Input stays in this tab. Reconnect and save when
          ready; nothing sends automatically.
        </p>
      )}
      {current && (
        <section className="gt-panel">
          <h2>
            Current state{" "}
            <Badge tone={current.is_live ? "success" : "warning"}>
              {current.is_live ? "Live" : "Maintenance"}
            </Badge>
          </h2>
          <p>
            Revision {current.revision} · Last updated{" "}
            {current.updatedAt
              ? new Date(current.updatedAt).toLocaleString()
              : "Not configured yet"}
          </p>
          <p>
            Workspace, gate/sign-in, health checks, active Linktree pages,
            newsletter token actions, privacy and accessibility routes are not
            redirected.
          </p>
          {!editing && current.canUpdate && (
            <Button
              disabled={read.loading || !!read.error}
              onClick={() => {
                setDraft(fields(current));
                setRevision(current.revision);
                setEditing(true);
                setError("");
                setNotice("");
                setConflict(false);
              }}
            >
              Configure availability
            </Button>
          )}
        </section>
      )}
      {editing && draft && (
        <form className="gt-panel gt-event-editor" onSubmit={save}>
          <h2 tabIndex={-1} ref={heading}>
            Configure public availability
          </h2>
          <p>
            This is a site-wide action, including when your permission comes
            from a team grant. No data or account permissions are deleted.
          </p>
          {(stale || conflict || !current?.canUpdate) && (
            <p role="alert">
              The state or your permission changed. Your input is preserved;
              close and reload before saving.
            </p>
          )}
          <fieldset disabled={busy} className="gt-plain-fieldset">
            <Field label="Public site mode">
              <select
                value={draft.is_live ? "live" : "maintenance"}
                onChange={(e) =>
                  setDraft((v) => ({
                    ...v!,
                    is_live: e.target.value === "live",
                  }))
                }
              >
                <option value="live">Live</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </Field>
            <Field label="Maintenance message" required>
              <textarea
                required
                rows={5}
                maxLength={2000}
                value={draft.message}
                onChange={(e) =>
                  setDraft((v) => ({ ...v!, message: e.target.value }))
                }
              />
            </Field>
            <Field
              label="Safe updates destination"
              hint="Optional /l/ profile, or HTTPS at gatech.edu, www.gatech.edu or gdg.community.dev. No query parameters."
            >
              <input
                value={draft.redirect_url}
                maxLength={2000}
                onChange={(e) =>
                  setDraft((v) => ({
                    ...v!,
                    redirect_url: e.target.value,
                    auto_redirect:
                      e.target.value.startsWith("/l/") && v!.auto_redirect,
                  }))
                }
              />
            </Field>
            <Field label="Updates button label" required>
              <input
                required
                maxLength={80}
                value={draft.button_text}
                onChange={(e) =>
                  setDraft((v) => ({ ...v!, button_text: e.target.value }))
                }
              />
            </Field>
            <label className="gt-status-check">
              <input
                type="checkbox"
                checked={draft.auto_redirect}
                disabled={!draft.redirect_url.startsWith("/l/")}
                onChange={(e) =>
                  setDraft((v) => ({ ...v!, auto_redirect: e.target.checked }))
                }
              />{" "}
              Automatically route visitors to this local active Linktree
            </label>
            <p>
              External destinations are optional visitor-selected links, never
              automatic off-site redirects. Inactive or unknown local Linktree
              destinations are rejected.
            </p>
            <Field
              label={`Type ${draft.is_live ? "LIVE" : "MAINTENANCE"}`}
              required
            >
              <input
                autoComplete="off"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <Field label="Current password" required>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </fieldset>
          <div className="gt-button-row">
            <Button
              type="submit"
              disabled={
                busy ||
                !isOnline ||
                read.loading ||
                !!read.error ||
                stale ||
                conflict ||
                !current?.canUpdate ||
                !password ||
                confirmation !== (draft.is_live ? "LIVE" : "MAINTENANCE")
              }
            >
              Save site availability
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={close}
            >
              Close editor
            </Button>
          </div>
          <details>
            <summary>Preview maintenance content (not saved)</summary>
            <MaintenanceContent preview status={{ ...draft, revision }} />
          </details>
        </form>
      )}
      {!current && (
        <div role="status" aria-label="Loading site availability">
          {read.error ? (
            "Availability is unavailable. Retry to review the current state."
          ) : (
            <>
              <div className="gt-skeleton gt-overview-placeholder" />
              <span className="sr-only">Loading current availability…</span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
