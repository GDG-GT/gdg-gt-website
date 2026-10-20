import { useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { financeMutation, financeNote } from "../../../shared/finances.mjs";
import { validationMessage } from "@/lib/validationMessage";
import { Badge, Button, Field } from "../primitives";
import { type Detail, dollars, human } from "./types";
import FinanceAttachments from "./FinanceAttachments";
const actionNames: Record<string, string> = {
  submit: "Submit request",
  team_approve: "Approve as team lead",
  admin_approve: "Approve as administrator",
  complete: "Mark completed",
  reject: "Reject request",
  cancel: "Cancel request",
};
export default function FinanceDetail({
  detail,
  notePage,
  onNotePage,
  onRefresh,
  onEdit,
  onClose,
  actorId,
  onEditState,
}: {
  detail: Detail;
  notePage: number;
  onNotePage: (page: number) => void;
  onRefresh: () => void;
  onEdit: () => void;
  onClose: () => void;
  actorId: string;
  onEditState: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const f = detail.record,
    [action, setAction] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState(""),
    [note, setNote] = useState(""),
    [operationBusy, setBusy] = useState(false),
    [attachmentState, setAttachmentState] = useState({
      dirty: false,
      busy: false,
    }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [conflict, setConflict] = useState(false);
  const revision = useRef(f.revision),
    decisionKey = useRef<string>(),
    noteKey = useRef<string>(),
    heading = useRef<HTMLHeadingElement>(null);
  const stale =
    !!action &&
    (f.revision !== revision.current || !f.actions.includes(action));
  const busy = operationBusy || attachmentState.busy;
  const dirty = !!action || !!note || attachmentState.dirty;
  useEffect(() => {
    onEditState({ dirty, busy });
    return () => onEditState({ dirty: false, busy: false });
  }, [dirty, busy, onEditState]);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const leave = (callback: () => void) => {
    if (!busy) callback();
  };
  return (
    <aside className="gt-finance-detail" aria-label="Finance request details">
      <div className="gt-button-row">
        <h2 tabIndex={-1} ref={heading}>
          {f.reference}
        </h2>
        <Button variant="ghost" disabled={busy} onClick={() => leave(onClose)}>
          Close details
        </Button>
      </div>
      <Badge
        tone={
          f.status === "completed" || f.status === "admin-approved"
            ? "success"
            : f.status === "rejected"
              ? "danger"
              : "neutral"
        }
      >
        {human(f.status)}
      </Badge>
      <h3>{f.description}</h3>
      <p className="gt-finance-amount">
        {dollars(f.amount)} <small>USD</small>
      </p>
      <dl className="gt-finance-facts">
        <dt>Scope</dt>
        <dd>{f.teamName || "Chapter · own request"}</dd>
        <dt>Submitted by</dt>
        <dd>{f.creatorName || "Chapter account"}</dd>
        <dt>Transaction date</dt>
        <dd>{f.transactionDate}</dd>
        <dt>Category</dt>
        <dd>
          {human(f.transactionType)} · {f.category}
        </dd>
        <dt>Budget</dt>
        <dd>{f.budgetName || "No allocation linked"}</dd>
        <dt>Vendor / reference</dt>
        <dd>
          {f.vendorName || "—"} / {f.referenceNumber || "—"}
        </dd>
        <dt>Submitted</dt>
        <dd>
          {f.submittedAt
            ? new Date(f.submittedAt).toLocaleString()
            : "Draft · not submitted"}
        </dd>
        <dt>Required approval</dt>
        <dd>
          {f.requiresTeamApproval
            ? "Team lead/co-lead, then administrator"
            : "Administrator"}
        </dd>
        {f.recurringFrequency && (
          <>
            <dt>Recurrence metadata</dt>
            <dd>{human(f.recurringFrequency)} · no automatic payment</dd>
          </>
        )}
      </dl>
      <p className="gt-helper">
        {f.submittedBy === actorId
          ? "You submitted this request and cannot approve it."
          : "Approvers cannot approve requests they submitted."}{" "}
        Completion is a ledger acknowledgment, not a bank transfer or payment.
      </p>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {f.rejectionReason && (
        <p>
          <strong>Rejection reason:</strong> {f.rejectionReason}
        </p>
      )}
      {!action && (
        <div className="gt-button-row">
          {f.actions.includes("update") && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => leave(onEdit)}
            >
              Edit draft
            </Button>
          )}
          {Object.entries(actionNames)
            .filter(([a]) => f.actions.includes(a))
            .map(([a, label]) => (
              <Button
                key={a}
                disabled={busy || !!note || attachmentState.dirty}
                variant={
                  a === "reject" || a === "cancel" ? "danger" : "secondary"
                }
                onClick={() => {
                  revision.current = f.revision;
                  setAction(a);
                  setPassword("");
                  setConfirmation("");
                  setReason("");
                  setError("");
                  setConflict(false);
                  decisionKey.current = undefined;
                }}
              >
                {label}
              </Button>
            ))}
        </div>
      )}
      {action && (
        <form
          className="gt-form gt-finance-decision"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || stale || conflict) return;
            const secret = password;
            setPassword("");
            setBusy(true);
            setError("");
            try {
              const body = financeMutation.parse({
                action,
                revision: revision.current,
                currentPassword: secret,
                confirmation,
                ...(action === "reject" ? { reason } : {}),
              });
              decisionKey.current ??= crypto.randomUUID();
              await api(`/admin/finances/${f.id}`, {
                method: "POST",
                protected: true,
                idempotencyKey: decisionKey.current,
                body,
              });
              setAction("");
              setConfirmation("");
              setReason("");
              setNotice("Decision saved with its immutable history entry.");
              onRefresh();
            } catch (e) {
              if (e instanceof ApiFailure && e.status === 409)
                setConflict(true);
              setError(
                validationMessage(
                  e,
                  "The decision was not saved. Your input is preserved.",
                ),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{actionNames[action]}</h3>
          {(stale || conflict) && (
            <p role="alert" className="gt-form-error">
              This request changed or the action is no longer available. Your
              input is preserved; cancel to review the latest state.
            </p>
          )}
          <p>
            Amount {dollars(f.amount)} · {f.teamName || "Chapter"}. Check the
            request and attachment evidence before confirming.
          </p>
          {action === "reject" && (
            <Field label="Reason for rejection" required>
              <textarea
                required
                minLength={3}
                maxLength={2000}
                rows={3}
                disabled={busy}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  decisionKey.current = undefined;
                }}
              />
            </Field>
          )}
          <Field label={`Type ${f.reference} to confirm`} required>
            <input
              autoComplete="off"
              required
              disabled={busy}
              value={confirmation}
              onChange={(e) => {
                setConfirmation(e.target.value);
                decisionKey.current = undefined;
              }}
            />
          </Field>
          <Field label="Your current password" required>
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              disabled={busy}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <div className="gt-button-row">
            <Button
              variant={
                action === "reject" || action === "cancel"
                  ? "danger"
                  : "primary"
              }
              disabled={
                busy ||
                stale ||
                conflict ||
                !password ||
                confirmation !== f.reference
              }
            >
              {busy ? "Saving decision…" : "Confirm decision"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setAction("");
                setPassword("");
                setConfirmation("");
                setReason("");
                setConflict(false);
              }}
            >
              Cancel decision
            </Button>
          </div>
        </form>
      )}
      <section>
        <h3>Transition history</h3>
        {!detail.decisions.length ? (
          <p className="gt-helper">No submission or approval yet.</p>
        ) : (
          <ol className="gt-finance-history">
            {detail.decisions.map((d) => (
              <li key={d.id}>
                <strong>
                  {human(d.from)} → {human(d.to)}
                </strong>
                <p>
                  {d.actorName || "Chapter account"} ·{" "}
                  {new Date(d.createdAt).toLocaleString()}
                </p>
                {d.reason && <p>{d.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section>
        <h3>Notes</h3>
        <p className="gt-helper">
          Notes are append-only, including on completed requests. Do not enter
          bank credentials or private access links.
        </p>
        {detail.notes.map((n) => (
          <article key={n.id} className="gt-finance-note">
            <strong>{n.actorName || "Chapter account"}</strong>
            <time dateTime={n.createdAt}>
              {new Date(n.createdAt).toLocaleString()}
            </time>
            <p>{n.note}</p>
          </article>
        ))}
        <nav className="gt-button-row" aria-label="Finance note pages">
          <Button
            variant="ghost"
            disabled={busy || notePage <= 1}
            onClick={() => onNotePage(notePage - 1)}
          >
            Newer notes
          </Button>
          <span>
            Page {notePage} · {detail.noteTotal} notes
          </span>
          <Button
            variant="ghost"
            disabled={
              busy || notePage * detail.notePageSize >= detail.noteTotal
            }
            onClick={() => onNotePage(notePage + 1)}
          >
            Older notes
          </Button>
        </nav>
        {f.actions.includes("note") && (
          <form
            className="gt-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy || action) return;
              setBusy(true);
              setError("");
              try {
                noteKey.current ??= crypto.randomUUID();
                await api(`/admin/finances/${f.id}/notes`, {
                  method: "POST",
                  protected: true,
                  idempotencyKey: noteKey.current,
                  body: financeNote.parse({ note }),
                });
                setNote("");
                noteKey.current = undefined;
                setNotice("Note appended.");
                onRefresh();
              } catch (e) {
                setError(
                  validationMessage(
                    e,
                    "Note could not be saved. Your draft is preserved.",
                  ),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Add a note" required>
              <textarea
                required
                rows={3}
                maxLength={5000}
                value={note}
                disabled={busy || !!action}
                onChange={(e) => {
                  setNote(e.target.value);
                  noteKey.current = undefined;
                }}
              />
            </Field>
            <Button disabled={busy || !!action || !note.trim()}>
              Append note
            </Button>
          </form>
        )}
      </section>
      <FinanceAttachments
        financeId={f.id}
        revision={f.revision}
        disabled={operationBusy || !!action || !!note}
        onEditState={setAttachmentState}
      />
      <p className="gt-helper">{detail.retention}</p>
    </aside>
  );
}
