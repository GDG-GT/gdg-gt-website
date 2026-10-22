import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useNavigationSafety } from "@/hooks/useDraftGuard";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import NewsletterEditor from "./NewsletterEditor";
import SubscriberBulk from "./SubscriberBulk";
import {
  date,
  useNewsletterWork,
  type Capabilities,
  type Kind,
  type Listing,
  type NewsletterRecord,
} from "./types";
export default function NewsletterWorkspace() {
  const [cap, setCap] = useState<Capabilities>(),
    [kind, setKind] = useState<Kind>("campaigns"),
    [team, setTeam] = useState(""),
    [state, setState] = useState("current"),
    [status, setStatus] = useState(""),
    [query, setQuery] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0),
    [listingResponse, setListingResponse] = useState<{
      key: string;
      value: Listing;
    }>(),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<{
      record?: NewsletterRecord;
      key: string;
    }>(),
    [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<NewsletterRecord[]>([]),
    [bulkLocked, setBulkLocked] = useState(false);
  const { busy: working, error, work } = useNewsletterWork(),
    busy = working || bulkLocked,
    safety = useNavigationSafety(),
    epoch = useRef(0);
  const filters = {
    ...(team ? { team } : {}),
    state,
    ...(status ? { status } : {}),
    q,
  };
  const listingKey = JSON.stringify([kind, team, state, status, q, page]),
    list =
      listingResponse?.key === listingKey ? listingResponse.value : undefined;
  useEffect(() => {
    const invalidate = () => {
      epoch.current++;
    };
    const clear = () => {
      invalidate();
      setCap(undefined);
      setListingResponse(undefined);
      setEditor(undefined);
      setNotice("");
      setExporting(false);
      setSelected([]);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      current = epoch.current;
    api<Capabilities>("/admin/newsletter/capabilities", {
      signal: controller.signal,
    })
      .then((c) => {
        if (!controller.signal.aborted && current === epoch.current) setCap(c);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted && current === epoch.current)
          setLoadError(e.message);
      });
    return () => controller.abort();
  }, [tick]);
  useEffect(() => {
    const controller = new AbortController(),
      current = epoch.current;
    setLoading(true);
    setLoadError("");
    setListingResponse(undefined);
    api<Listing>(
      "/admin/newsletter/" +
        kind +
        "?" +
        new URLSearchParams({
          ...(team ? { team } : {}),
          state,
          ...(status ? { status } : {}),
          q,
          page: String(page),
        }),
      { signal: controller.signal },
    )
      .then((v) => {
        if (!controller.signal.aborted && current === epoch.current)
          setListingResponse({ key: listingKey, value: v });
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted && current === epoch.current) {
          setLoadError(e.message);
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            setCap(undefined);
            setEditor(undefined);
          }
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && current === epoch.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [kind, team, state, status, q, page, tick, listingKey]);
  useEffect(() => {
    setSelected([]);
  }, [kind, team, state, status, q, page, tick]);
  const refresh = () => setTick((n) => n + 1),
    canCreate =
      state === "current" &&
      !!team &&
      (team === "chapter"
        ? cap?.chapterCreate
        : cap?.teams.find((t) => t.id === team)?.canCreate);
  const navigate = (run: () => void) => {
    if (!busy) {
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
      {notice && (
        <p role="status" className="gt-notice">
          {notice}
        </p>
      )}
      {(loadError || error) && (
        <p role="alert" className="gt-form-error">
          {loadError || error}
        </p>
      )}
      {editor ? (
        <NewsletterEditor
          key={editor.key}
          kind={kind}
          record={editor.record}
          scope={team}
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
              Choose a chapter or team scope to create a record. Team audiences
              never include chapter or other team subscribers.
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
                records={selected}
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
          {loading || (!list && !loadError) ? (
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
              <div className="gt-table-wrap">
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
              </div>
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
          <p className="gt-helper">
            Approval is a separate password-confirmed action. Sending runs on
            the server even when this page is closed. Never upload or add
            addresses without consent.
          </p>
        </>
      )}
    </div>
  );
}
