import { useCallback, useEffect, useRef, useState } from "react";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button } from "../primitives";
type History = {
  items: { revision: number; recordedAt: string; current: boolean }[];
  currentRevision: number;
  version: number;
  total: number;
  page: number;
  pageSize: number;
  redacted: boolean;
};
type Revision = {
  responseId: string;
  revision: number;
  version: number;
  current: boolean;
  recordedAt: string;
  redacted: boolean;
  fields: {
    id: string;
    label: string;
    type: string;
    sensitive: boolean;
    masked: boolean;
    answered: boolean;
    value: unknown;
  }[];
};
type Props = { formId: string; responseId: string; canSensitive: boolean };
type ReadState = { loading: boolean; error: string; at?: string };
function ReadStatus({
  name,
  read,
  offline,
  retry,
}: {
  name: string;
  read: ReadState;
  offline: boolean;
  retry: () => void;
}) {
  return (
    <>
      {read.loading && <p role="status">Loading {name}…</p>}
      {(read.error || offline) && (
        <div role={read.error ? "alert" : "status"}>
          <p>
            {read.error || "You are offline. New history reads are paused."}
          </p>
        </div>
      )}
      {(read.loading || read.error || offline) && read.at && (
        <p className="gt-helper">
          Last successful {name} read:{" "}
          <time dateTime={read.at}>{new Date(read.at).toLocaleString()}</time>.
          This snapshot may have changed.
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        disabled={read.loading || offline}
        onClick={retry}
      >
        Reload {name}
      </Button>
    </>
  );
}
export default function ResponseHistory(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <HistoryWorkspace
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}:${props.responseId}:${props.canSensitive}`}
      {...props}
    />
  );
}
function HistoryWorkspace({ formId, responseId, canSensitive }: Props) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<number>(),
    [sensitive, setSensitive] = useState(false),
    [refresh, setRefresh] = useState(0),
    [denial, setDenial] = useState(""),
    [sessionInvalid, setSessionInvalid] = useState(false);
  const { isOnline } = useOnlineStatus(),
    region = useRef<HTMLElement>(null),
    root = `/admin/forms/${formId}/responses/${responseId}/history`,
    read = usePrivateRead<History>(
      open && !denial && !sessionInvalid ? `${root}?page=${page}` : undefined,
      refresh,
    );
  const { clear: clearRead, denied: readDenied, error: readError } = read;
  const deny = useCallback((message: string) => {
    setDenial(message || "History access must be checked again.");
    setSelected(undefined);
    setSensitive(false);
  }, []);
  useEffect(() => {
    if (readDenied) {
      clearRead();
      deny(readError);
    }
  }, [readDenied, readError, clearRead, deny]);
  useEffect(() => {
    const clear = () => {
      clearRead();
      setSessionInvalid(true);
      setOpen(false);
      setSelected(undefined);
      setSensitive(false);
      setDenial("");
      setPage(1);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, [clearRead]);
  const history = !denial && !readDenied ? read.data : undefined,
    ready = !!history && !read.loading && !readError && isOnline,
    focus = () => region.current?.focus();
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label="Response revision history"
      className="gt-response-history"
    >
      <Button
        type="button"
        variant="secondary"
        disabled={sessionInvalid || (!open && !isOnline)}
        onClick={() => {
          clearRead();
          setOpen(!open);
          setPage(1);
          setSelected(undefined);
          setSensitive(false);
          setDenial("");
        }}
      >
        {open ? "Close revision history" : "Review revision history"}
      </Button>
      {sessionInvalid && (
        <p role="status">
          Your sign-in changed. Reopen the response from the current workspace
          to review its history.
        </p>
      )}
      {!isOnline && !open && !sessionInvalid && (
        <p role="status">Reconnect before opening response history.</p>
      )}
      {open && (
        <>
          <h3>Response revision history</h3>
          <p className="gt-helper">
            Read-only snapshots use the original published questions. Redaction
            applies to historical answers too; deleted responses have no
            readable history.
          </p>
          {denial || readDenied ? (
            <div role="alert">
              <p>{denial || readError}</p>
              <p>Private history and selected answers have been cleared.</p>
              <Button
                type="button"
                variant="secondary"
                disabled={!isOnline}
                onClick={() => {
                  clearRead();
                  setDenial("");
                  setRefresh((value) => value + 1);
                  focus();
                }}
              >
                Recheck response history access
              </Button>
            </div>
          ) : (
            <>
              <ReadStatus
                name="history"
                read={read}
                offline={!isOnline}
                retry={() => {
                  setRefresh((value) => value + 1);
                  focus();
                }}
              />
              {history && (
                <>
                  <p>
                    {history.total}{" "}
                    {history.total === 1 ? "revision" : "revisions"} · Form
                    version {history.version}
                    {history.redacted
                      ? " · Identity redacted across history"
                      : ""}
                  </p>
                  <div className="gt-actions">
                    {history.items.map((item) => (
                      <Button
                        type="button"
                        key={item.revision}
                        disabled={!ready}
                        variant={
                          selected === item.revision ? "primary" : "secondary"
                        }
                        onClick={() => setSelected(item.revision)}
                      >
                        Revision {item.revision}
                        {item.current ? " · Current" : ""}
                      </Button>
                    ))}
                  </div>
                  {history.total > history.pageSize && (
                    <nav
                      className="gt-actions"
                      aria-label="Revision history pages"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={page === 1 || !ready}
                        onClick={() => {
                          setSelected(undefined);
                          setSensitive(false);
                          setPage((value) => value - 1);
                          focus();
                        }}
                      >
                        Previous revisions
                      </Button>
                      <span>Page {page}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={
                          page * history.pageSize >= history.total || !ready
                        }
                        onClick={() => {
                          setSelected(undefined);
                          setSensitive(false);
                          setPage((value) => value + 1);
                          focus();
                        }}
                      >
                        Older revisions
                      </Button>
                    </nav>
                  )}
                  {canSensitive && (
                    <label className="gt-check">
                      <input
                        type="checkbox"
                        checked={sensitive}
                        disabled={!sensitive && !ready}
                        onChange={(event) => setSensitive(event.target.checked)}
                      />
                      Reveal sensitive historical answers (audited)
                    </label>
                  )}
                  {selected !== undefined && (
                    <RevisionWorkspace
                      key={`${selected}:${sensitive}:${history.redacted}:${history.currentRevision}:${history.version}`}
                      path={`${root}/${selected}?sensitive=${sensitive && canSensitive}`}
                      responseId={responseId}
                      selected={selected}
                      offline={!isOnline}
                      deny={deny}
                    />
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
function RevisionWorkspace({
  path,
  responseId,
  selected,
  offline,
  deny,
}: {
  path: string;
  responseId: string;
  selected: number;
  offline: boolean;
  deny: (message: string) => void;
}) {
  const [refresh, setRefresh] = useState(0),
    [enabled, setEnabled] = useState(!offline),
    region = useRef<HTMLElement>(null),
    read = usePrivateRead<Revision>(enabled ? path : undefined, refresh),
    revision =
      read.data?.responseId === responseId && read.data.revision === selected
        ? read.data
        : undefined;
  const { clear: clearRead, denied: readDenied, error: readError } = read;
  useEffect(() => {
    if (readDenied) {
      clearRead();
      deny(readError);
    }
  }, [readDenied, readError, clearRead, deny]);
  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label={`Selected revision ${selected}`}
    >
      <ReadStatus
        name="selected revision"
        read={read}
        offline={offline}
        retry={() => {
          setEnabled(true);
          setRefresh((value) => value + 1);
          region.current?.focus();
        }}
      />
      {!enabled && (
        <p role="status">
          Reload the selected revision after reconnecting to review its masked
          answers.
        </p>
      )}
      {enabled && !read.loading && !readError && !revision && (
        <p role="alert">
          The selected snapshot could not be verified. Reload this revision
          before reviewing its answers.
        </p>
      )}
      {revision && !readDenied && (
        <div
          className="gt-response-answers"
          role="region"
          aria-label={`Revision ${revision.revision} answers`}
        >
          <h4>
            Revision {revision.revision}
            {revision.current
              ? " · Current at time of review"
              : " · Historical snapshot"}
          </h4>
          <p>
            {new Date(revision.recordedAt).toLocaleString()} · Form version{" "}
            {revision.version}
            {revision.redacted ? " · Identity redacted" : ""}
          </p>
          {revision.fields.map((field) => (
            <div key={field.id}>
              <strong>
                {field.label}
                {field.sensitive ? " · Sensitive" : ""}
              </strong>
              <p>
                {field.masked
                  ? "Hidden by default"
                  : !field.answered
                    ? "Not answered"
                    : field.type === "file" && Array.isArray(field.value)
                      ? `${field.value.length} retained attachment reference(s). Use the current response's authorized download controls.`
                      : typeof field.value === "object"
                        ? JSON.stringify(field.value)
                        : String(field.value ?? "Not answered")}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
