import { useCallback, useEffect, useRef, useState } from "react";
import {
  useApprovedSearchParams as useSearchParams,
  useDraftGuard,
  useNavigationSafety,
} from "@/hooks/useDraftGuard";
import { api, ApiFailure } from "@/lib/api";
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
type Mode = "create" | "edit" | "budget_create" | "budget_edit" | null;
export default function FinanceWorkspace() {
  const [params, setParams] = useSearchParams(),
    selected = params.get("request") || "",
    tab = params.get("tab") || "requests";
  const [cap, setCap] = useState<Capabilities>(),
    [list, setList] = useState<Listing>(),
    [budgets, setBudgets] = useState<BudgetListing>(),
    [report, setReport] = useState<Report>(),
    [detail, setDetail] = useState<Detail>(),
    [budgetRecord, setBudgetRecord] = useState<Budget>(),
    [mode, setMode] = useState<Mode>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
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
  useEffect(() => {
    const c = new AbortController();
    api<Capabilities>("/admin/finances/capabilities", { signal: c.signal })
      .then((r) => {
        if (!c.signal.aborted) setCap(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [tick]);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      api<Listing>(`/admin/finances?${filter}&page=${page}`, {
        signal: c.signal,
      }),
      api<BudgetListing>(`/admin/budgets?page=${budgetPage}`, {
        signal: c.signal,
      }),
      api<Report>(`/admin/finances/report?${filter}`, { signal: c.signal }),
    ])
      .then(([l, b, r]) => {
        if (!c.signal.aborted) {
          setList(l);
          setBudgets(b);
          setReport(r);
          setBudgetRecord((previous) =>
            previous
              ? b.items.find((v) => v.id === previous.id) || previous
              : previous,
          );
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          if (e instanceof ApiFailure && [401, 403].includes(e.status)) {
            setCap(undefined);
            setList(undefined);
            setBudgets(undefined);
            setReport(undefined);
            setDetail(undefined);
            setMode(null);
          }
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [filter, page, budgetPage, tick]);
  useEffect(() => {
    if (!selected) {
      setDetail(undefined);
      return;
    }
    const c = new AbortController();
    api<Detail>(`/admin/finances/${selected}?notesPage=${notePage}`, {
      signal: c.signal,
    })
      .then((r) => {
        if (!c.signal.aborted && selectedRef.current === selected) setDetail(r);
      })
      .catch((e) => {
        if (!c.signal.aborted && selectedRef.current === selected) {
          setError(e.message);
          if (e instanceof ApiFailure && [401, 403, 404].includes(e.status)) {
            setDetail(undefined);
            setMode(null);
          }
        }
      });
    return () => c.abort();
  }, [selected, notePage, tick]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!document.hidden) setTick((n) => n + 1);
    }, 30000);
    const revoke = () => {
      setCap(undefined);
      setDetail(undefined);
      setList(undefined);
      setBudgets(undefined);
      setReport(undefined);
      setMode(null);
    };
    window.addEventListener("gdg:session-cleared", revoke);
    return () => {
      clearInterval(interval);
      window.removeEventListener("gdg:session-cleared", revoke);
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
      setDetail(undefined);
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
      setDetail(undefined);
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
              disabled={!!mode}
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
          <a
            className="gt-button gt-button-secondary"
            href={`/api/v1/admin/finances/export?${filter}`}
          >
            Export filtered CSV
          </a>
          <Button variant="ghost" onClick={refresh}>
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
      {error && (
        <p role="alert" className="gt-form-error">
          {error} <button onClick={refresh}>Retry loading</button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {mode === "create" && cap && (
        <FinanceEditor
          onEditState={onEditState}
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
        <div className="gt-panel" role="status" aria-busy="true">
          Loading authorized finance records…
        </div>
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
                  <div className="gt-table-wrap">
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
                  </div>
                ) : (
                  <EmptyState title="No finance requests in this view">
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
                  notePage={notePage}
                  onNotePage={setNotePage}
                  onRefresh={refresh}
                  onEdit={() => leave(() => setMode("edit"))}
                  onClose={() => select("")}
                />
              ) : (
                <p role="status">
                  {error
                    ? "Request details could not load."
                    : "Loading private request details…"}
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
          {budgets?.items.length ? (
            <div className="gt-table-wrap">
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
            </div>
          ) : (
            <EmptyState title="No permitted budget allocations">
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
              ) : (
                <p>No completed activity in this filter.</p>
              )}
            </section>
            <section className="gt-panel">
              <h3>Completed totals by category</h3>
              {report.categories.length ? (
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
