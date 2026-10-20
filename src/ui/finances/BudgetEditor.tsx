import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import { budgetCreate, budgetMutation } from "../../../shared/finances.mjs";
import { Button, Field } from "../primitives";
import { type Budget, type Capabilities, dollars, remaining } from "./types";
export default function BudgetEditor({
  record,
  capabilities,
  onSaved,
  onCancel,
  onEditState,
}: {
  record?: Budget;
  capabilities: Capabilities;
  onSaved: () => void;
  onCancel: () => void;
  onEditState: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const snapshot = useRef(record);
  const [values, setValues] = useState({
    name: record?.name || "",
    description: record?.description || "",
    totalAmount: record?.totalAmount || "",
    fiscalYear: record?.fiscalYear || String(new Date().getFullYear()),
    startDate: record?.startDate || "",
    endDate: record?.endDate || "",
  });
  const [team, setTeam] = useState(record?.teamId || ""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [action, setAction] = useState("update"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [conflict, setConflict] = useState(false);
  const key = useRef<string>(),
    heading = useRef<HTMLHeadingElement>(null);
  const stale =
    !!record &&
    (record.revision !== snapshot.current?.revision ||
      !record.canManage ||
      record.status === "closed");
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    onEditState({ dirty: true, busy });
    return () => onEditState({ dirty: false, busy: false });
  }, [busy, onEditState]);
  const field = (name: keyof typeof values) => ({
    disabled: busy,
    value: values[name],
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      key.current = undefined;
    },
  });
  return (
    <section className="gt-panel gt-event-editor">
      <h2 ref={heading} tabIndex={-1}>
        {record ? record.name : "New budget allocation"}
      </h2>
      <p>
        Budgets track chapter-authorized allocations; they do not move money.
        Administrator approval reserves expenses, and completion records spend.
      </p>
      {record && (
        <p>
          Total {dollars(record.totalAmount)} · Spent{" "}
          {dollars(record.usage.spent)} · Reserved{" "}
          {dollars(record.usage.reserved)} · Available{" "}
          {dollars(remaining(record))}
        </p>
      )}
      {(stale || conflict) && (
        <p role="alert" className="gt-form-error">
          The budget changed or this action is no longer available. Your input
          is preserved. Cancel to review the latest version.
        </p>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      <form
        className="gt-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || stale || conflict) return;
          setBusy(true);
          setError("");
          const secret = password;
          setPassword("");
          try {
            const body = record
              ? budgetMutation.parse({
                  action,
                  revision: snapshot.current!.revision,
                  confirmation,
                  currentPassword: secret,
                  ...(action === "update" ? { record: values } : {}),
                })
              : budgetCreate.parse({
                  record: values,
                  teamId: team || null,
                  currentPassword: secret,
                });
            key.current ??= crypto.randomUUID();
            await api(`/admin/budgets${record ? "/" + record.id : ""}`, {
              method: "POST",
              protected: true,
              idempotencyKey: key.current,
              body,
            });
            onSaved();
          } catch (e) {
            if (e instanceof Error && "status" in e && e.status === 409)
              setConflict(true);
            setError(validationMessage(e, "Budget change could not be saved."));
          } finally {
            setBusy(false);
          }
        }}
      >
        {record && (
          <Field label="Budget action">
            <select
              disabled={busy}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                key.current = undefined;
              }}
            >
              <option value="update">Edit allocation</option>
              {record.status === "draft" && (
                <option value="activate">Activate allocation</option>
              )}
              <option value="close">Close allocation</option>
            </select>
          </Field>
        )}
        {(!record || action === "update") && (
          <>
            <div className="gt-form-grid">
              <Field label="Allocation name" required>
                <input
                  {...field("name")}
                  required
                  minLength={2}
                  maxLength={150}
                />
              </Field>
              <Field label="Owning scope">
                <select
                  value={team}
                  disabled={busy || !!record}
                  onChange={(e) => {
                    setTeam(e.target.value);
                    key.current = undefined;
                  }}
                >
                  <option value="">Chapter</option>
                  {capabilities.teams.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Total allocation (USD)" required>
                <input
                  {...field("totalAmount")}
                  required
                  inputMode="decimal"
                  maxLength={13}
                />
              </Field>
              <Field label="Fiscal year" required>
                <input
                  {...field("fiscalYear")}
                  required
                  pattern="[0-9]{4}"
                  maxLength={4}
                />
              </Field>
              <Field label="Starts on" required>
                <input {...field("startDate")} required type="date" />
              </Field>
              <Field label="Ends on" required>
                <input {...field("endDate")} required type="date" />
              </Field>
            </div>
            <Field label="Description">
              <textarea {...field("description")} rows={3} maxLength={3000} />
            </Field>
          </>
        )}
        {record && (
          <Field label={`Type the budget name: ${record.name}`} required>
            <input
              required
              autoComplete="off"
              value={confirmation}
              disabled={busy}
              onChange={(e) => {
                setConfirmation(e.target.value);
                key.current = undefined;
              }}
            />
          </Field>
        )}
        <Field label="Your current password" required>
          <input
            required
            type="password"
            autoComplete="current-password"
            maxLength={128}
            disabled={busy}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="gt-helper">
          Allocations cannot be reduced below committed spend/reservations or
          closed while requests are pending or reserved. Closed allocations are
          retained, not deleted.
        </p>
        <div className="gt-button-row">
          <Button
            disabled={
              busy ||
              stale ||
              conflict ||
              !password ||
              (!!record && confirmation !== record.name)
            }
          >
            {busy
              ? "Saving…"
              : record
                ? "Confirm budget change"
                : "Create draft allocation"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel budget change
          </Button>
        </div>
      </form>
    </section>
  );
}
