import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { siteStatusChange } from "../../../shared/site-status.mjs";
import { validationMessage } from "@/lib/validationMessage";
import { Badge, Button, Field } from "../primitives";
import { MaintenanceContent } from "./SiteAvailability";
import type { SiteState } from "@/contexts/SiteAvailabilityContext";
type PrivateState = SiteState & { updatedAt: string | null; canUpdate: boolean };
const fields = (s: SiteState) => ({
  is_live: s.is_live,
  message: s.message,
  redirect_url: s.redirect_url,
  button_text: s.button_text,
  auto_redirect: s.auto_redirect,
});
export default function SiteStatusWorkspace() {
  const [current, setCurrent] = useState<PrivateState>(),
    [draft, setDraft] = useState<ReturnType<typeof fields>>(),
    [revision, setRevision] = useState(0),
    [tick, setTick] = useState(0),
    [editing, setEditing] = useState(false);
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const key = useRef<string>(),
    epoch = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    navigation = useNavigationSafety();
  const stale = editing && current?.revision !== revision;
  useDraftGuard(editing, { busy, label: "Site-wide availability changes" });
  useEffect(() => {
    const invalidate = () => {
        epoch.current++;
      },
      clear = () => {
        invalidate();
        setCurrent(undefined);
        setDraft(undefined);
        setPassword("");
        setConfirmation("");
        setEditing(false);
        setNotice("");
        setError("");
        setBusy(false);
      };
    const timer = window.setInterval(() => setTick((v) => v + 1), 30000);
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.clearInterval(timer);
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<PrivateState>("/admin/site-status", { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch) setCurrent(v);
      })
      .catch((e) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          setCurrent(undefined);
          setError(e.message);
        }
      });
    return () => c.abort();
  }, [tick]);
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
    };
    if (navigation) navigation.request(next);
    else next();
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || stale || conflict || !draft || !current?.canUpdate) return;
    const runEpoch = epoch.current,
      secret = password;
    setPassword("");
    setBusy(true);
    setError("");
    try {
      const body = siteStatusChange.parse({
        revision,
        record: draft,
        currentPassword: secret,
        confirmation,
      });
      key.current ??= crypto.randomUUID();
      const saved = await api<PrivateState>("/admin/site-status", {
        method: "PATCH",
        protected: true,
        body,
        idempotencyKey: key.current,
      });
      if (runEpoch !== epoch.current) return;
      setCurrent(saved);
      setEditing(false);
      setDraft(undefined);
      setConfirmation("");
      key.current = undefined;
      setNotice("Site-wide availability saved.");
      window.dispatchEvent(new Event("gdg:site-status-changed"));
    } catch (e) {
      if (runEpoch === epoch.current) {
        if (e instanceof ApiFailure && e.status === 409) setConflict(true);
        setError(validationMessage(e, "Check the availability settings."));
      }
    } finally {
      if (runEpoch === epoch.current) setBusy(false);
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
        <Button variant="secondary" onClick={() => setTick((v) => v + 1)}>
          Refresh status
        </Button>
      </header>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
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
            {current.updatedAt ? new Date(current.updatedAt).toLocaleString() : 'Not configured yet'}
          </p>
          <p>
            Workspace, gate/sign-in, health checks, active Linktree pages,
            newsletter token actions, privacy and accessibility routes are not
            redirected.
          </p>
          {!editing && current.canUpdate && (
            <Button
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
        <form
          className="gt-panel gt-event-editor"
          onSubmit={save}
          onChange={() => {
            key.current = undefined;
          }}
        >
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
              disabled={busy || stale || conflict || !current?.canUpdate}
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
      {!current && !error && <p role="status">Loading current availability…</p>}
    </section>
  );
}
