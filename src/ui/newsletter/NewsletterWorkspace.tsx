import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useLiveSearch } from "@/hooks/useLiveSearch";
import { useNavigationSafety } from "@/hooks/useDraftGuard";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import NewsletterEditor from "./NewsletterEditor";
import MemberSubscriberImport from "./MemberSubscriberImport";
import SubscriberBulk from "./SubscriberBulk";
import ScrollableTable from "../ScrollableTable";
import {
  date,
  useNewsletterWork,
  type Capabilities,
  type Kind,
  type Listing,
  type NewsletterRecord,
} from "./types";
export default function NewsletterWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <NewsletterWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function NewsletterWorkspaceContent() {
  const { currentAdmin } = useAdmin();
  const [importingMembers, setImportingMembers] = useState(false);
  const [kind, setKind] = useState<Kind>("campaigns"),
    [team, setTeam] = useState(""),
    [state, setState] = useState("current"),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<{
      record?: NewsletterRecord;
      key: string;
    }>(),
    [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<NewsletterRecord[]>([]),
    [bulkLocked, setBulkLocked] = useState(false);
  const {
      busy: working,
      error,
      setError,
      work,
      cancel,
      pending,
    } = useNewsletterWork(JSON.stringify([kind, team, state, status, q, page])),
    busy = working || bulkLocked,
    safety = useNavigationSafety(),
    noticeFocus = useRef<HTMLParagraphElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null);
  const filters = {
    ...(team ? { team } : {}),
    state,
    ...(status ? { status } : {}),
    q,
  };
  const capRead = usePrivateRead<Capabilities>(
      "/admin/newsletter/capabilities",
      tick,
    ),
    listRead = usePrivateRead<Listing>(
      "/admin/newsletter/" +
        kind +
        "?" +
        new URLSearchParams({ ...filters, page: String(page) }),
      tick,
    ),
    detailRead = usePrivateRead<{ record: NewsletterRecord }>(
      editor?.record
        ? `/admin/newsletter/${kind}/${editor.record.id}`
        : undefined,
      tick,
    );
  useLiveSearch(query, q, (value) => {
    setQ(value);
    setPage(1);
    setExporting(false);
  }, !busy && !editor);
  const cap = capRead.data,
    list = listRead.data,
    loading = listRead.loading,
    loadError = listRead.error;
  const { clear: clearCap } = capRead,
    { clear: clearList } = listRead,
    { clear: clearDetail } = detailRead;
  useEffect(() => {
    const refresh = () => {
      if (!pending.current) setTick((v) => v + 1);
    };
    const timer = setInterval(() => {
      if (!document.hidden && navigator.onLine) refresh();
    }, 30000);
    window.addEventListener("gdg:access-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("gdg:access-changed", refresh);
    };
  }, [pending]);
  useEffect(() => {
    if (capRead.denied || listRead.denied) {
      cancel();
      clearCap();
      clearList();
      clearDetail();
      setEditor(undefined);
      setNotice("");
      setExporting(false);
      setSelected([]);
    }
  }, [
    capRead.denied,
    listRead.denied,
    cancel,
    clearCap,
    clearList,
    clearDetail,
  ]);
  useEffect(() => {
    if (detailRead.denied) {
      setEditor(undefined);
      clearDetail();
      setError("Newsletter record access changed. Private editor cleared.");
    }
  }, [detailRead.denied, clearDetail, setError]);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    setSelected([]);
  }, [kind, team, state, status, q, page]);
  const refresh = () => setTick((n) => n + 1),
    canCreate =
      state === "current" &&
      !capRead.loading &&
      !capRead.error &&
      !!team &&
      (team === "chapter"
        ? cap?.chapterCreate
        : cap?.teams.find((t) => t.id === team)?.canCreate);
  const navigate = (run: () => void) => {
    if (!busy && !pending.current) {
      if (safety) safety.request(run);
      else run();
    }
  };
  const open = (id: string) =>
    void work(
      (signal) =>
        api<{ record: NewsletterRecord }>(`/admin/newsletter/${kind}/${id}`, {
          signal,
        }),
      (v) => {
        setEditor({
          record: v.record,
          key: v.record.id + ":" + v.record.revision,
        });
        setNotice("");
        setExporting(false);
      },
    );
  const saved = (message: string, id?: string) => {
    setEditor(undefined);
    setNotice(message);
    refresh();
    if (id && kind !== "subscribers") open(id);
  };
  return (
    <div className="gt-admin-page gt-newsletter-workspace">
      <header className="gt-admin-page-heading">
        <div>
          <h1>Newsletter</h1>
          <p>
            Write, review and deliver chapter updates to people who opted in.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy || !!editor}
          onClick={refresh}
        >
          Refresh workspace
        </Button>
      </header>
      {importingMembers && currentAdmin?.role === "super_admin" && (
        <MemberSubscriberImport
          onClose={() => setImportingMembers(false)}
          onDone={(result) => {
            setImportingMembers(false);
            setKind("subscribers");
            setTeam("chapter");
            setStatus("");
            setQuery("");
            setQ("");
            setPage(1);
            refresh();
            setNotice(
              `${result.created + result.activated} members added. ${result.existing} already subscribed.${result.excluded ? ` ${result.excluded} excluded.` : ""}`,
            );
          }}
        />
      )}
      {notice && (
        <p role="status" tabIndex={-1} ref={noticeFocus} className="gt-notice">
          {notice}
        </p>
      )}
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
      {[
        { name: "Newsletter permissions", ...capRead },
        { name: "Newsletter inventory", ...listRead },
        { name: "Newsletter details", ...detailRead },
      ].map((read) => (
        <div key={read.name}>
          {read.error && (
            <p role="alert" className="gt-form-error">
              {read.name}: {read.error}{" "}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  document.getElementById("workspace-content")?.focus();
                  refresh();
                }}
              >
                Retry {read.name.toLowerCase()}
              </Button>
            </p>
          )}
          {read.data && (read.error || read.loading) && (
            <p role="status">
              {read.name} may be out of date. Last loaded{" "}
              {new Date(read.at!).toLocaleString()}.
            </p>
          )}
        </div>
      ))}
      {editor ? (
        <NewsletterEditor
          key={editor.key}
          kind={kind}
          record={detailRead.data?.record || editor.record}
          scope={team}
          unavailable={
            capRead.loading ||
            !!capRead.error ||
            (!!editor.record && (detailRead.loading || !!detailRead.error)) ||
            (!editor.record && !canCreate)
          }
          onRefresh={refresh}
          onSaved={saved}
          onClose={() => {
            setEditor(undefined);
            refresh();
          }}
        />
      ) : (
        <>
          <nav className="gt-newsletter-tabs" aria-label="Newsletter sections">
            {(
              [
                ["campaigns", "Campaigns"],
                ["subscribers", "Subscribers"],
                ["templates", "Templates"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                variant={kind === value ? "primary" : "ghost"}
                aria-current={kind === value ? "page" : undefined}
                disabled={busy}
                onClick={() =>
                  navigate(() => {
                    setKind(value);
                    setStatus("");
                    setPage(1);
                    setQuery("");
                    setQ("");
                    setExporting(false);
                  })
                }
              >
                {label}
              </Button>
            ))}
          </nav>
          <div className="gt-newsletter-toolbar">
            <Field label="Scope">
              <select
                value={team}
                disabled={busy}
                onChange={(e) => {
                  setTeam(e.target.value);
                  setPage(1);
                  setExporting(false);
                }}
              >
                <option value="">All accessible scopes</option>
                {cap?.chapterRead && (
                  <option value="chapter">Chapter newsletter</option>
                )}
                {cap?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Records">
              <select
                value={state}
                disabled={busy}
                onChange={(e) => {
                  setState(e.target.value);
                  setPage(1);
                  setExporting(false);
                }}
              >
                <option value="current">Current</option>
                <option value="trash">Archived</option>
              </select>
            </Field>
            {kind !== "templates" && (
              <Field label="Status">
                <select
                  value={status}
                  disabled={busy}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(1);
                    setExporting(false);
                  }}
                >
                  <option value="">All statuses</option>
                  {(kind === "subscribers"
                    ? ["active", "pending", "unsubscribed"]
                    : [
                        "draft",
                        "scheduled",
                        "sending",
                        "sent",
                        "failed",
                        "cancelled",
                      ]
                  ).map((s) => (
                    <option key={s} value={s}>
                      {s === "sent" ? "Processing complete" : s}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Button
              disabled={busy || !canCreate}
              onClick={() => {
                if (!canCreate || pending.current) return;
                setEditor({ key: crypto.randomUUID() });
                setNotice("");
              }}
            >
              {kind === "campaigns"
                ? "Write campaign"
                : kind === "templates"
                  ? "Create template"
                  : "Add subscriber request"}
            </Button>
            {kind === "subscribers" && currentAdmin?.role === "super_admin" && (
              <Button
                variant="secondary"
                disabled={
                  busy ||
                  !cap?.chapterCreate ||
                  !!capRead.error ||
                  capRead.loading
                }
                onClick={() => setImportingMembers(true)}
              >
                Add community members
              </Button>
            )}
            {kind === "subscribers" && (
              <Button
                variant="secondary"
                disabled={busy || loading || !list?.total}
                onClick={() => setExporting(true)}
              >
                Export matching subscribers
              </Button>
            )}
          </div>
          {!team && (
            <p className="gt-helper">
              Choose Chapter newsletter or a team to create a campaign, template
              or subscription.
            </p>
          )}
          <form
            className="gt-inline-actions"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(query);
              setPage(1);
              setExporting(false);
            }}
          >
            <SearchBox
              value={query}
              onChange={(v) => setQuery(v.slice(0, 100))}
              label={`Search ${kind}`}
              placeholder={
                kind === "subscribers"
                  ? "Search names or email addresses"
                  : "Find a newsletter record"
              }
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              Search
            </Button>
          </form>
          {exporting && (
            <section
              className="gt-panel gt-form"
              aria-label="Review subscriber export"
            >
              <h2>Export matching subscribers</h2>
              <p>
                Download up to 1,000 matching records across all result pages,
                including email addresses and consent status. This export is
                audited. Store it securely; do not use it to bypass unsubscribe
                or suppression.
              </p>
              <p>
                {list?.total} matching records · {state} ·{" "}
                {status || "all statuses"}
                {q && ` · search: ${q}`}
              </p>
              <div className="gt-inline-actions">
                <Button
                  disabled={busy || !list || list.total > 1000}
                  onClick={() =>
                    void work(
                      (signal) =>
                        api<{ csv: string; filename: string; count: number }>(
                          "/admin/newsletter/subscribers/export",
                          { method: "POST", body: filters, signal },
                        ),
                      (r) => {
                        const url = URL.createObjectURL(
                            new Blob([r.csv], {
                              type: "text/csv;charset=utf-8",
                            }),
                          ),
                          anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.download = r.filename;
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                        setNotice(
                          `Downloaded ${r.count} subscribers. Store the CSV securely.`,
                        );
                        setExporting(false);
                      },
                    )
                  }
                >
                  {busy ? "Exporting…" : "Download reviewed CSV"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setExporting(false)}
                >
                  Cancel export
                </Button>
              </div>
              {list && list.total > 1000 && (
                <p className="gt-helper">
                  Narrow your filters to 1,000 or fewer records.
                </p>
              )}
            </section>
          )}
          {kind === "subscribers" &&
            list &&
            selected.length > 0 &&
            selected.every((r) => list.items.some((s) => s.id === r.id)) && (
              <SubscriberBulk
                records={selected.map((r) =>
                  list.items.find((s) => s.id === r.id)!,
                )}
                archived={state === "trash"}
                onLockChange={setBulkLocked}
                onClear={() => setSelected([])}
                onSaved={(message) => {
                  setSelected([]);
                  setNotice(message);
                  refresh();
                }}
              />
            )}
          {(!list && loading) || (!list && !loadError) ? (
            <div
              className="gt-newsletter-loading"
              role="status"
              aria-live="polite"
            >
              <span /> <span /> <span />
              <p>Loading {kind}…</p>
            </div>
          ) : !list ? (
            <EmptyState title="Newsletter unavailable">
              Retry the workspace or check your current permissions.
            </EmptyState>
          ) : !list.items.length ? (
            <EmptyState
              title={
                state === "trash"
                  ? "No matching archived records"
                  : kind === "campaigns"
                    ? "No campaigns here yet"
                    : kind === "subscribers"
                      ? "No matching subscribers"
                      : "No reusable templates yet"
              }
            >
              {kind === "campaigns"
                ? "Choose a scope, write a private draft, then review the confirmed audience before sending."
                : kind === "subscribers"
                  ? "New addresses receive a confirmation request. Pending, unsubscribed and suppressed addresses never receive campaigns."
                  : "Save reusable message text, then copy it into a campaign draft when you need it."}
            </EmptyState>
          ) : (
            <>
              <ScrollableTable label={`Newsletter ${kind} records`}>
                <table className="gt-table gt-newsletter-table">
                  <caption className="sr-only">
                    {kind} in your accessible newsletter scopes
                  </caption>
                  <thead>
                    <tr>
                      {kind === "subscribers" && (
                        <th scope="col">
                          <span className="sr-only">Select</span>
                        </th>
                      )}
                      <th scope="col">
                        {kind === "subscribers"
                          ? "Subscriber"
                          : kind === "templates"
                            ? "Template"
                            : "Campaign"}
                      </th>
                      <th scope="col">State</th>
                      <th scope="col">Scope</th>
                      <th scope="col">
                        {kind === "subscribers" ? "Confirmed" : "Updated"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((r) => (
                      <tr key={r.id}>
                        {kind === "subscribers" && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${r.email}`}
                              disabled={busy || !r.actions.includes("delete")}
                              checked={selected.some((s) => s.id === r.id)}
                              onChange={(e) =>
                                setSelected(
                                  e.target.checked
                                    ? [...selected, r]
                                    : selected.filter((s) => s.id !== r.id),
                                )
                              }
                            />
                          </td>
                        )}
                        <th scope="row">
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => open(r.id)}
                          >
                            {r.email || r.subject || r.name}
                          </Button>
                          {kind === "subscribers" && r.name && (
                            <small>{r.name}</small>
                          )}
                        </th>
                        <td>
                          <Badge
                            tone={
                              r.suppressedAt
                                ? "warning"
                                : r.state === "active"
                                  ? "success"
                                  : "neutral"
                            }
                          >
                            {r.deletedAt
                              ? "Archived"
                              : r.suppressedAt
                                ? `Suppressed · ${r.suppressionReason}`
                                : r.status === "sent"
                                  ? "Processing complete"
                                  : r.status || r.state || "Template"}
                          </Badge>
                          {r.status === "scheduled" && (
                            <small>{date(r.scheduledAt)}</small>
                          )}
                        </td>
                        <td>
                          {r.teamId
                            ? cap?.teams.find((t) => t.id === r.teamId)?.name ||
                              "Restricted or archived team"
                            : "Chapter"}
                        </td>
                        <td>
                          {date(
                            kind === "subscribers"
                              ? r.confirmedAt
                              : r.updatedAt,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>
              <div className="gt-inline-actions gt-newsletter-pagination">
                <span>
                  {list.total} matching {kind} · page {page}
                </span>
                <div className="gt-inline-actions">
                  <Button
                    variant="secondary"
                    disabled={busy || page === 1}
                    onClick={() => setPage((n) => n - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy || page * 50 >= list.total}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
