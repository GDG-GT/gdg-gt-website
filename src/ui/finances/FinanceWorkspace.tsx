import { useCallback, useEffect, useRef, useState } from "react";
import {
  useApprovedSearchParams as useSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import { useAdmin } from "@/contexts/AdminContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { Badge, Button, EmptyState, Field, SearchBox } from "../primitives";
import { financeStates } from "../../../shared/finances.mjs";
import {
  type Budget,
  type BudgetListing,
  type Capabilities,
  type Detail,
  type Listing,
  type Report,
  dollars,
  human,
  remaining,
} from "./types";
import FinanceEditor from "./FinanceEditor";
import BudgetEditor from "./BudgetEditor";
import FinanceDetail from "./FinanceDetail";
import FinanceCharts from "./FinanceCharts";
import ScrollableTable from "../ScrollableTable";
type Mode = "create" | "edit" | "budget_create" | "budget_edit" | null;
export default function FinanceWorkspace() {
  const { currentAdmin } = useAdmin();
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <FinanceWorkspaceContent
      key={`${currentAdmin?.id}:${currentAdmin?.role}:${epoch}`}
    />
  );
}
function FinanceWorkspaceContent() {
  const { isOnline } = useOnlineStatus();
  const [params, setParams] = useSearchParams(),
    selected = params.get("request") || "",
    tab = params.get("tab") || "requests";
  const [budgetSnapshot, setBudgetRecord] = useState<Budget>(),
    [mode, setMode] = useState<Mode>(null),
    [notice, setNotice] = useState(""),
    [tick, setTick] = useState(0),
    [page, setPage] = useState(1),
    [budgetPage, setBudgetPage] = useState(1),
    [notePage, setNotePage] = useState(1),
    [q, setQ] = useState(""),
    [state, setState] = useState(""),
    [type, setType] = useState(""),
    [team, setTeam] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const selectedRef = useRef(selected);
  const noticeFocus = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (notice) noticeFocus.current?.focus();
  }, [notice]);
  const navigationSafety = useNavigationSafety();
  const [guardState, setGuardState] = useState({ dirty: false, busy: false });
  const editState = useRef({ dirty: false, busy: false });
  const onEditState = useCallback(
    (value: { dirty: boolean; busy: boolean }) => {
      editState.current = value;
      setGuardState(value);
    },
    [],
  );
  selectedRef.current = selected;
  useDraftGuard(!!mode || guardState.dirty, {
    busy: guardState.busy,
    label: "Finance changes, notes or supporting files",
  });
  const filter = new URLSearchParams({
    q,
    ...(state ? { state } : {}),
    ...(type ? { type } : {}),
    ...(team ? { teamId: team } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }).toString();
  const refresh = () => setTick((n) => n + 1);
  const invalidDates = !!from && !!to && from > to;
  const capabilityRead = usePrivateRead<Capabilities>(
      "/admin/finances/capabilities",
      tick,
    ),
    listRead = usePrivateRead<Listing>(
      invalidDates ? undefined : `/admin/finances?${filter}&page=${page}`,
      tick,
    ),
    budgetRead = usePrivateRead<BudgetListing>(
      `/admin/budgets?page=${budgetPage}`,
      tick,
    ),
    reportRead = usePrivateRead<Report>(
      invalidDates ? undefined : `/admin/finances/report?${filter}`,
      tick,
    ),
    detailRead = usePrivateRead<Detail>(
      selected
        ? `/admin/finances/${selected}?notesPage=${notePage}`
        : undefined,
      tick,
    );
  const cap = capabilityRead.data,
    list = listRead.data,
    budgets = budgetRead.data,
    report = reportRead.data,
    detail = detailRead.data;
  const budgetRecord = budgetSnapshot
    ? budgets?.items.find((b) => b.id === budgetSnapshot.id) || {
        ...budgetSnapshot,
        canManage: false,
      }
    : undefined;
  const { clear: clearCapabilities } = capabilityRead,
    { clear: clearList } = listRead,
    { clear: clearBudgets } = budgetRead,
    { clear: clearReport } = reportRead,
    { clear: clearDetail } = detailRead;
  const reads = [
    { name: "Finance permissions", ...capabilityRead },
    { name: "Request inventory", ...listRead },
    { name: "Budget allocations", ...budgetRead },
    { name: "Finance reports", ...reportRead },
    { name: "Request details", ...detailRead },
  ];
  const loading = listRead.loading;
  useEffect(() => {
    if (detailRead.denied)
      setMode((previous) => (previous === "edit" ? null : previous));
  }, [detailRead.denied]);
  useEffect(() => {
    if (capabilityRead.denied) {
      clearCapabilities();
      clearList();
      clearBudgets();
      clearReport();
      clearDetail();
      setMode(null);
      setBudgetRecord(undefined);
    }
  }, [
    capabilityRead.denied,
    clearCapabilities,
    clearList,
    clearBudgets,
    clearReport,
    clearDetail,
  ]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden && navigator.onLine && !editState.current.busy)
        setTick((n) => n + 1);
    }, 30000);
    const access = () => setTick((n) => n + 1);
    window.addEventListener("gdg:access-changed", access);
    return () => {
      clearInterval(interval);
      window.removeEventListener("gdg:access-changed", access);
    };
  }, []);
  useEffect(() => {
    if (!mode) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode]);
  const leave = (run: () => void) => {
    if (editState.current.busy) {
      setNotice(
        "Wait for the current finance operation to finish before leaving this view.",
      );
      return;
    }
    const next = () => {
      editState.current = { dirty: false, busy: false };
      setMode(null);
      run();
    };
    if (navigationSafety) navigationSafety.request(next);
    else next();
  };
  const select = (id: string) =>
    leave(() => {
      setNotePage(1);
      const p = new URLSearchParams(params);
      if (id) p.set("request", id);
      else p.delete("request");
      selectedRef.current = id;
      setParams(p);
    });
  const changeTab = (value: string) =>
    leave(() => {
      const p = new URLSearchParams();
      p.set("tab", value);
      setParams(p);
    });
  const saved = (id: string) => {
    setMode(null);
    setNotice("Private draft saved. Submit it separately after review.");
    selectedRef.current = id;
    setParams({ request: id });
    refresh();
  };
  return (
    <div className="gt-admin-page">
      <header className="gt-admin-heading">
        <div>
          <h1>Finances</h1>
          <p>
            Requests, approvals and allocations. Exact amounts, scoped access
            and retained decisions.
          </p>
        </div>
        <div className="gt-button-row">
          {cap?.canCreate && (
            <Button
              disabled={
                !!mode ||
                !!capabilityRead.error ||
                capabilityRead.loading ||
                !isOnline
              }
              onClick={() =>
                leave(() => {
                  setMode("create");
                  setNotice("");
                })
              }
            >
              New request
            </Button>
          )}
          {isOnline && !capabilityRead.error && cap && (
            <a
              className="gt-button gt-button-secondary"
              href={`/api/v1/admin/finances/export?${filter}`}
            >
              Export filtered CSV
            </a>
          )}
          <Button
            variant="ghost"
            disabled={!isOnline || guardState.busy}
            onClick={() => {
              refresh();
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Refresh
          </Button>
        </div>
      </header>
      {cap && cap.fundingReferences.length > 0 && (
        <section aria-label="Separate funding references">
          <div className="gt-finance-funding">
            {cap.fundingReferences.map((f) => (
              <div key={f.source}>
                <span>{f.source}</span>
                <strong>{dollars(f.amount)}</strong>
                <Badge
                  tone={f.state.includes("Pending") ? "warning" : "neutral"}
                >
                  {f.state}
                </Badge>
              </div>
            ))}
          </div>
          <p className="gt-helper">{cap.fundingNotice}</p>
        </section>
      )}
      <nav className="gt-team-tabs" aria-label="Finance sections">
        {["requests", "budgets", "reports"].map((t) => (
          <Button
            key={t}
            variant="ghost"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => changeTab(t)}
          >
            {human(t)}
          </Button>
        ))}
      </nav>
      {tab === "requests" && !selected && !mode && (
        <FinanceCharts capabilities={cap} listing={list} />
      )}
      {!isOnline && (
        <p role="status" className="gt-data-note">
          You are offline. Unsaved finance fields stay only in this open tab.
          Reconnect and refresh before continuing; nothing submits
          automatically.
        </p>
      )}
      {invalidDates && (
        <p role="alert" className="gt-form-error">
          Choose a from date on or before the to date.
        </p>
      )}
      {reads
        .filter((read) => read.error)
        .map((read) => (
          <p key={read.name} role="alert" className="gt-form-error">
            {read.name}: {read.error}{" "}
            <button
              disabled={!isOnline || guardState.busy}
              onClick={() => {
                refresh();
                document.getElementById("workspace-content")?.focus();
              }}
            >
              Retry {read.name.toLowerCase()}
            </button>
          </p>
        ))}
      {reads
        .filter((read) => read.data && (read.error || !isOnline))
        .map((read) => (
          <p key={read.name} role="status" className="gt-data-note">
            {read.name} may be out of date. Last loaded{" "}
            {read.at ? new Date(read.at).toLocaleString() : "earlier"}.
          </p>
        ))}
      {notice && (
        <p ref={noticeFocus} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {mode === "create" && cap && (
        <FinanceEditor
          onEditState={onEditState}
          readUnavailable={
            !isOnline || capabilityRead.loading || !!capabilityRead.error
          }
          capabilities={cap}
          onSaved={saved}
          onCancel={() => leave(() => {})}
        />
      )}
      {mode === "edit" && cap && detail && (
        <FinanceEditor
          onEditState={onEditState}
          key={detail.record.id}
          record={detail.record}
          readUnavailable={
            !isOnline ||
            detailRead.loading ||
            !!detailRead.error ||
            !!capabilityRead.error
          }
          capabilities={cap}
          onSaved={saved}
          onCancel={() => leave(() => {})}
        />
      )}
      {(mode === "budget_create" || mode === "budget_edit") && cap && (
        <BudgetEditor
          onEditState={onEditState}
          key={budgetRecord?.id || "new"}
          record={mode === "budget_edit" ? budgetRecord : undefined}
          readUnavailable={
            !isOnline ||
            budgetRead.loading ||
            !!budgetRead.error ||
            !!capabilityRead.error
          }
          capabilities={cap}
          onSaved={() => {
            setMode(null);
            setNotice("Budget change recorded.");
            refresh();
          }}
          onCancel={() => leave(() => {})}
        />
      )}
      {tab !== "budgets" && (
        <section aria-label="Finance filters" className="gt-finance-filters">
          <SearchBox
            label="Search finance requests"
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
          />
          <Field label="State">
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All states</option>
              {financeStates.map((v: string) => (
                <option value={v} key={v}>
                  {human(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {["income", "expense", "transfer", "reimbursement"].map((v) => (
                <option key={v} value={v}>
                  {human(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Team">
            <select
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All permitted scopes</option>
              {cap?.teams.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From date">
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="To date">
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        </section>
      )}
      {loading && !list && (
        <div
          className="gt-panel"
          role="status"
          aria-label="Loading finance requests"
          aria-busy="true"
        >
          <div className="gt-skeleton gt-detail-skeleton" />
          <span className="sr-only">Loading authorized finance records…</span>
        </div>
      )}
      {(q || state || type || team || from || to || page > 1) &&
        tab !== "budgets" && (
          <Button
            variant="ghost"
            disabled={guardState.busy}
            onClick={() => {
              setQ("");
              setState("");
              setType("");
              setTeam("");
              setFrom("");
              setTo("");
              setPage(1);
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Reset finance filters
          </Button>
        )}
      {tab === "requests" && !list && !listRead.loading && listRead.error && (
        <p>
          Request inventory is unavailable. Retry to check your authorized
          records.
        </p>
      )}
      {tab === "requests" && (
        <div
          className={`gt-finance-layout ${selected ? "gt-finance-layout-detail" : ""}`}
        >
          <section>
            {list && (
              <>
                <p>
                  {list.total} requests · {list.summary.awaitingApproval}{" "}
                  awaiting approval. Totals and counts include only your
                  authorized records.
                </p>
                {list.items.length ? (
                  <ScrollableTable label="Finance requests">
                    <table className="gt-data-table gt-finance-table">
                      <caption className="sr-only">Finance requests</caption>
                      <thead>
                        <tr>
                          <th>Request / scope</th>
                          <th>Submitter</th>
                          <th>Amount</th>
                          <th>State</th>
                          <th>Approver</th>
                          <th>Date</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.items.map((f) => (
                          <tr key={f.id}>
                            <td>
                              <strong>{f.description}</strong>
                              <small>
                                {f.reference} · {f.teamName || "Chapter"}
                              </small>
                            </td>
                            <td>{f.creatorName || "Chapter account"}</td>
                            <td>{dollars(f.amount)}</td>
                            <td>
                              <Badge
                                tone={
                                  f.status === "completed" ||
                                  f.status === "admin-approved"
                                    ? "success"
                                    : f.status === "rejected"
                                      ? "danger"
                                      : "neutral"
                                }
                              >
                                {human(f.status)}
                              </Badge>
                            </td>
                            <td>
                              {f.approverName ||
                                f.teamApproverName ||
                                "Not approved"}
                            </td>
                            <td>{f.transactionDate}</td>
                            <td>
                              <Button
                                variant="ghost"
                                disabled={!!mode}
                                onClick={() => select(f.id)}
                              >
                                Review {f.reference}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollableTable>
                ) : (
                  <EmptyState
                    headingLevel={2}
                    title="No finance requests in this view"
                  >
                    Create a draft or adjust the filters. Other teams' records
                    are not shown.
                  </EmptyState>
                )}
                <nav className="gt-button-row" aria-label="Finance pages">
                  <Button
                    variant="ghost"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous requests
                  </Button>
                  <span>Page {page}</span>
                  <Button
                    variant="ghost"
                    disabled={page * list.pageSize >= list.total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next requests
                  </Button>
                </nav>
              </>
            )}
          </section>
          {selected && !mode && (
            <div>
              {detail?.record.id === selected && cap ? (
                <FinanceDetail
                  onEditState={onEditState}
                  key={selected}
                  detail={detail}
                  actorId={cap.actorId}
                  readUnavailable={
                    !isOnline ||
                    detailRead.loading ||
                    !!detailRead.error ||
                    !!capabilityRead.error
                  }
                  notePage={notePage}
                  onNotePage={setNotePage}
                  onRefresh={refresh}
                  onEdit={() => leave(() => setMode("edit"))}
                  onClose={() => select("")}
                />
              ) : detailRead.loading || capabilityRead.loading ? (
                <div role="status" aria-label="Loading private finance details">
                  <div className="gt-skeleton gt-detail-skeleton" />
                  <span className="sr-only">
                    Loading private request details…
                  </span>
                </div>
              ) : (
                <p>
                  Request details are unavailable. Use Retry request details or
                  choose another request.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {tab === "budgets" && (
        <section>
          <div className="gt-button-row">
            <h2>Budget allocations</h2>
            {cap?.globalAdmin && (
              <Button
                disabled={!!mode}
                onClick={() => {
                  setBudgetRecord(undefined);
                  setMode("budget_create");
                }}
              >
                New allocation
              </Button>
            )}
          </div>
          <p>
            No personal spending. Sources and team allocations are separate;
            there is no transfer between allocations here.
          </p>
          {budgetRead.loading && !budgets ? (
            <div role="status" aria-label="Loading budget allocations">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading budget allocations…</span>
            </div>
          ) : budgetRead.error && !budgets ? (
            <p>
              Budget allocations are unavailable. Retry to check your scope.
            </p>
          ) : budgets?.items.length ? (
            <ScrollableTable label="Budget allocations">
              <table className="gt-data-table">
                <caption className="sr-only">
                  Budget allocations and exact utilization
                </caption>
                <thead>
                  <tr>
                    <th>Allocation</th>
                    <th>Total</th>
                    <th>Spent</th>
                    <th>Reserved</th>
                    <th>Available</th>
                    <th>State / actions</th>
                  </tr>
                </thead>
                <tbody>
                  {budgets.items.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <strong>{b.name}</strong>
                        <small>
                          {b.teamName || "Chapter"} · FY {b.fiscalYear}
                          <br />
                          {b.startDate} – {b.endDate}
                        </small>
                      </td>
                      <td>{dollars(b.totalAmount)}</td>
                      <td>{dollars(b.usage.spent)}</td>
                      <td>{dollars(b.usage.reserved)}</td>
                      <td>{dollars(remaining(b))}</td>
                      <td>
                        <Badge>{human(b.status)}</Badge>
                        {b.canManage && b.status !== "closed" && (
                          <Button
                            variant="ghost"
                            disabled={!!mode}
                            onClick={() => {
                              setBudgetRecord(b);
                              setMode("budget_edit");
                            }}
                          >
                            Manage {b.name}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          ) : (
            <EmptyState
              headingLevel={3}
              title="No permitted budget allocations"
            >
              Authorized administrators can create an allocation, then activate
              it before requests reference it.
            </EmptyState>
          )}
          <nav className="gt-button-row" aria-label="Budget pages">
            <Button
              variant="ghost"
              disabled={budgetPage <= 1}
              onClick={() => setBudgetPage(budgetPage - 1)}
            >
              Previous allocations
            </Button>
            <span>Page {budgetPage}</span>
            <Button
              variant="ghost"
              disabled={
                !budgets || budgetPage * budgets.pageSize >= budgets.total
              }
              onClick={() => setBudgetPage(budgetPage + 1)}
            >
              Next allocations
            </Button>
          </nav>
        </section>
      )}
      {tab === "reports" && (!list || !report) && (
        <section>
          <h2>Authorized ledger report</h2>
          {listRead.loading || reportRead.loading ? (
            <div role="status" aria-label="Loading finance report">
              <div className="gt-skeleton gt-detail-skeleton" />
              <span className="sr-only">Loading authorized report data…</span>
            </div>
          ) : (
            <p>
              Report data is unavailable with the current read state. Retry the
              failed source above.
            </p>
          )}
        </section>
      )}
      {tab === "reports" && list && report && (
        <section>
          <h2>Authorized ledger report</h2>
          <p>{report.note}</p>
          <dl className="gt-finance-totals">
            <div>
              <dt>Completed income</dt>
              <dd>{dollars(list.summary.completedIncome)}</dd>
            </div>
            <div>
              <dt>Completed expense / reimbursement</dt>
              <dd>{dollars(list.summary.completedExpenses)}</dd>
            </div>
            <div>
              <dt>Reserved expenses</dt>
              <dd>{dollars(list.summary.reservedExpenses)}</dd>
            </div>
            <div>
              <dt>Completed net</dt>
              <dd>{dollars(list.summary.net)}</dd>
            </div>
          </dl>
          <div className="gt-finance-report-grid">
            <section className="gt-panel">
              <h3>Completed activity by month</h3>
              {report.months.length ? (
                <ScrollableTable label="Completed finance activity by month">
                  <table className="gt-data-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Income</th>
                        <th>Expenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.months.map((m) => (
                        <tr key={m.month}>
                          <td>{m.month}</td>
                          <td>{dollars(m.income)}</td>
                          <td>{dollars(m.expenses)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              ) : (
                <p>No completed activity in this filter.</p>
              )}
            </section>
            <section className="gt-panel">
              <h3>Completed totals by category</h3>
              {report.categories.length ? (
                <ScrollableTable label="Completed finance totals by category">
                  <table className="gt-data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Type</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.categories.map((c) => (
                        <tr key={c.transaction_type + c.category}>
                          <td>{c.category}</td>
                          <td>{human(c.transaction_type)}</td>
                          <td>{dollars(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              ) : (
                <p>Categories will appear after requests are completed.</p>
              )}
            </section>
          </div>
        </section>
      )}
      <p className="gt-helper">
        Financial records and decisions are retained. No financial data is
        broadcast through Realtime. Exports are private, audited and capped at
        1,000 filtered records.
      </p>
    </div>
  );
}
