import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import {
  financeCategories,
  financeCreate,
  financeMutation,
} from "../../../shared/finances.mjs";
import { Button, Field } from "../primitives";
import type { BudgetListing, Capabilities, Finance } from "./types";

export default function FinanceEditor({
  record,
  capabilities,
  onSaved,
  onCancel,
  onEditState,
  readUnavailable = false,
}: {
  record?: Finance;
  capabilities: Capabilities;
  onSaved: (id: string) => void;
  onCancel: () => void;
  onEditState: (state: { dirty: boolean; busy: boolean }) => void;
  readUnavailable?: boolean;
}) {
  const initial = useRef(record);
  const [values, setValues] = useState({
    transactionType: record?.transactionType || "expense",
    category: record?.category || "Event Costs",
    amount: record?.amount || "",
    currency: "USD",
    description: record?.description || "",
    vendorName: record?.vendorName || "",
    referenceNumber: record?.referenceNumber || "",
    transactionDate: record?.transactionDate || localDate(),
    budgetId: record?.budgetId || "",
    eventId: record?.eventId || "",
    projectId: record?.projectId || "",
    recurringFrequency: record?.recurringFrequency || "",
  });
  const [team, setTeam] = useState(record?.teamId || ""),
    [requireTeamApproval, setRequire] = useState(
      record?.requiresTeamApproval ?? true,
    ),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false),
    [budgetQuery, setBudgetQuery] = useState(""),
    [budgetPage, setBudgetPage] = useState(1),
    [budgetRetry, setBudgetRetry] = useState(0),
    [budgetListing, setBudgetListing] = useState<BudgetListing>(),
    [budgetError, setBudgetError] = useState("");
  const key = useRef<string>(),
    heading = useRef<HTMLHeadingElement>(null),
    errorFocus = useRef<HTMLParagraphElement>(null);
  const { busy, begin, current, finish } = usePrivateMutation(
    record?.id || "new-finance",
  );
  const stale =
    !!record &&
    (initial.current?.revision !== record.revision ||
      !record.actions.includes("update"));
  const canSave =
    !readUnavailable &&
    (record
      ? record.actions.includes("update")
      : capabilities.canCreate &&
        (!team || capabilities.teams.some((t) => t.id === team)));
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    onEditState({ dirty: true, busy });
    return () => onEditState({ dirty: false, busy: false });
  }, [busy, onEditState]);
  useEffect(() => {
    const controller = new AbortController();
    setBudgetError("");
    api<BudgetListing>(
      `/admin/budgets?state=active&q=${encodeURIComponent(budgetQuery)}&page=${budgetPage}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (!controller.signal.aborted) setBudgetListing(result);
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setBudgetListing(undefined);
          setBudgetError(e.message);
        }
      });
    return () => controller.abort();
  }, [budgetQuery, budgetPage, budgetRetry]);
  const field = (name: keyof typeof values) => ({
    disabled: busy,
    value: values[name],
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      key.current = undefined;
    },
  });
  return (
    <section className="gt-panel gt-event-editor">
      <h2 ref={heading} tabIndex={-1}>
        {record ? `Edit ${record.reference}` : "New finance request"}
      </h2>
      <p>
        Save a private draft first. Once submitted, the amount, scope and
        request details cannot be rewritten. No personal spending.
      </p>
      {(stale || conflict) && (
        <p role="alert" className="gt-form-error">
          This request changed or editing access ended. Your draft is preserved;
          cancel to review the current record.
        </p>
      )}
      {!canSave && (
        <p role="status" className="gt-data-note">
          Saving is unavailable with the current scope, permissions or read
          state. Your fields are preserved.
        </p>
      )}
      {error && (
        <p
          ref={errorFocus}
          tabIndex={-1}
          className="gt-form-error"
          role="alert"
        >
          {error}
        </p>
      )}
      <form
        className="gt-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (stale || conflict || !canSave) return;
          const controller = begin();
          if (!controller) return;
          onEditState({ dirty: true, busy: true });
          setError("");
          try {
            const details = {
              ...values,
              budgetId: values.budgetId || null,
              eventId: values.eventId || null,
              projectId: values.projectId || null,
              recurringFrequency: values.recurringFrequency || null,
            };
            const body = record
              ? financeMutation.parse({
                  action: "update",
                  revision: initial.current!.revision,
                  record: details,
                })
              : financeCreate.parse({
                  record: details,
                  teamId: team || null,
                  requireTeamApproval:
                    !!team &&
                    (capabilities.globalAdmin ? requireTeamApproval : true),
                });
            key.current ??= crypto.randomUUID();
            const r = await api<{ id: string }>(
              `/admin/finances${record ? "/" + record.id : ""}`,
              {
                method: "POST",
                protected: true,
                idempotencyKey: key.current,
                body,
                signal: controller.signal,
              },
            );
            if (!current(controller)) return;
            key.current = undefined;
            onSaved(r.id);
          } catch (e) {
            if (!current(controller)) return;
            if (e instanceof ApiFailure && e.status === 409) setConflict(true);
            setError(
              validationMessage(
                e,
                "The request was not saved. Your draft is preserved.",
              ),
            );
          } finally {
            finish(controller);
          }
        }}
      >
        <div className="gt-form-grid">
          <Field label="Request scope">
            <select
              disabled={busy || !!record}
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setValues((v) => ({ ...v, budgetId: "" }));
                key.current = undefined;
              }}
            >
              <option value="">Chapter request · own record</option>
              {capabilities.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Transaction type">
            <select
              {...field("transactionType")}
              onChange={(e) => {
                const type = e.target.value as keyof typeof financeCategories;
                setValues((v) => ({
                  ...v,
                  transactionType: type,
                  category: financeCategories[type][0],
                }));
                key.current = undefined;
              }}
            >
              {Object.keys(financeCategories).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select {...field("category")}>
              {financeCategories[values.transactionType].map((v: string) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Amount (USD)"
            required
            hint="Exact dollars and cents; no commas or scientific notation."
          >
            <input
              {...field("amount")}
              required
              inputMode="decimal"
              maxLength={13}
              placeholder="0.00"
              pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?"
            />
          </Field>
          <Field label="Transaction date" required>
            <input {...field("transactionDate")} required type="date" />
          </Field>
          <Field label="Budget">
            <select {...field("budgetId")}>
              <option value="">No allocated budget</option>
              {values.budgetId &&
                !budgetListing?.items.some((b) => b.id === values.budgetId) && (
                  <option value={values.budgetId}>
                    {record?.budgetName || "Selected allocation"} · selected
                  </option>
                )}
              {(budgetListing?.items || [])
                .filter(
                  (b) => b.status === "active" && (b.teamId || "") === team,
                )
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field
            label="Find an active budget"
            hint="Search or page through all permitted active allocations; choices are limited to this request's scope."
          >
            <input
              type="search"
              value={budgetQuery}
              maxLength={100}
              disabled={busy}
              onChange={(e) => {
                setBudgetQuery(e.target.value);
                setBudgetPage(1);
              }}
            />
          </Field>
          <Field label="Vendor or payee">
            <input {...field("vendorName")} maxLength={200} />
          </Field>
          <Field label="External reference">
            <input {...field("referenceNumber")} maxLength={150} />
          </Field>
        </div>
        {budgetError && (
          <p role="alert">
            Budget search: {budgetError}{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setBudgetRetry((v) => v + 1)}
            >
              Retry budget choices
            </button>
          </p>
        )}
        <nav className="gt-button-row" aria-label="Budget selection pages">
          <Button
            type="button"
            variant="ghost"
            disabled={busy || budgetPage <= 1}
            onClick={() => setBudgetPage(budgetPage - 1)}
          >
            Previous budget choices
          </Button>
          <span>Allocation choices · page {budgetPage}</span>
          <Button
            type="button"
            variant="ghost"
            disabled={
              busy ||
              !budgetListing ||
              budgetPage * budgetListing.pageSize >= budgetListing.total
            }
            onClick={() => setBudgetPage(budgetPage + 1)}
          >
            More budget choices
          </Button>
        </nav>
        <Field label="Description" required>
          <textarea
            {...field("description")}
            required
            minLength={2}
            maxLength={5000}
            rows={4}
          />
        </Field>
        <div className="gt-form-grid">
          <Field
            label="Event ID (optional)"
            hint="Use an event you are authorized to view."
          >
            <input {...field("eventId")} maxLength={36} />
          </Field>
          {capabilities.globalAdmin && (
            <Field label="Project ID (optional)">
              <input {...field("projectId")} maxLength={36} />
            </Field>
          )}
          <Field
            label="Recurrence metadata"
            hint="Descriptive only. Does not schedule payments or duplicate requests."
          >
            <select {...field("recurringFrequency")}>
              <option value="">One-time</option>
              {["weekly", "monthly", "quarterly", "yearly"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        </div>
        {team && (
          <label>
            <input
              type="checkbox"
              disabled={busy || !!record || !capabilities.globalAdmin}
              checked={requireTeamApproval}
              onChange={(e) => {
                setRequire(e.target.checked);
                key.current = undefined;
              }}
            />{" "}
            Require team lead/co-lead approval before administrator approval
          </label>
        )}
        <p className="gt-helper">
          Scope and approval requirements are fixed when the draft is created.
          Nobody may approve a request they submitted.
        </p>
        <div className="gt-button-row">
          <Button disabled={busy || stale || conflict || !canSave}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel editing
          </Button>
        </div>
      </form>
    </section>
  );
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
