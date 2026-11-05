import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Button, EmptyState, Field } from "../primitives";

type Policy = {
  formRevision: number;
  revision: number;
  matchesDraft: boolean;
  editable: boolean;
  reviewedAt: string | null;
  receipts: boolean;
  receiptAnswers: boolean;
  notificationUsers: string[];
  chapterInbox: boolean;
  notificationAnswers: boolean;
  canReviewAnswers: boolean;
  mailReady: boolean;
  chapterInboxAvailable: boolean;
  eligible: { id: string; display_name: string; role: string }[];
  reference: string;
};
type Choices = Pick<
  Policy,
  | "receipts"
  | "receiptAnswers"
  | "notificationUsers"
  | "chapterInbox"
  | "notificationAnswers"
>;
const choices = (p: Policy): Choices => ({
  receipts: p.receipts,
  receiptAnswers: p.receiptAnswers,
  notificationUsers: p.notificationUsers.filter((id) =>
    p.eligible.some((u) => u.id === id),
  ),
  chapterInbox: p.chapterInbox,
  notificationAnswers: p.notificationAnswers,
});

export default function DeliveryPanel({
  formId,
  saved,
  receiptSetting,
  access,
  onStateChange,
}: {
  formId: string;
  saved: boolean;
  receiptSetting: boolean;
  access: string;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
}) {
  const [policy, setPolicy] = useState<Policy | null>(null),
    [draft, setDraft] = useState<Choices | null>(null),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [readRetry, setReadRetry] = useState(0);
  const generation = useRef(0),
    request = useRef<AbortController>(),
    submission = useRef<{ signature: string; key: string }>();
  const dirty =
    !!policy &&
    !!draft &&
    (JSON.stringify(draft) !== JSON.stringify(choices(policy)) ||
      !!password ||
      !!confirmation);
  useDraftGuard(dirty, { busy, label: "Form delivery review" });
  useEffect(() => onStateChange({ dirty, busy }), [onStateChange, dirty, busy]);
  useEffect(() => {
    setError("");
    const controller = new AbortController(),
      current = ++generation.current;
    const invalidate = () => {
      generation.current++;
      controller.abort();
      request.current?.abort();
    };
    const clear = () => {
      invalidate();
      setPolicy(null);
      setDraft(null);
      setPassword("");
      setConfirmation("");
      setError("");
      setNotice("");
      setBusy(false);
    };
    window.addEventListener("gdg:session-cleared", clear);
    api<Policy>(`/admin/forms/${formId}/delivery`, {
      signal: controller.signal,
    })
      .then((p) => {
        if (generation.current !== current) return;
        setPolicy(p);
        setDraft(choices(p));
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, [formId, readRetry]);
  if (!policy || !draft)
    return error ? (
      <EmptyState
        title="Delivery settings unavailable"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setReadRetry((value) => value + 1);
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry delivery settings
          </Button>
        }
      >
        {error}
      </EmptyState>
    ) : (
      <div role="status" aria-label="Loading delivery settings">
        <div className="gt-skeleton gt-detail-skeleton" />
        <span className="sr-only">
          Checking delivery settings and current access…
        </span>
      </div>
    );
  const identityReady = ["verified", "invited", "internal"].includes(access);
  const changed = (values: Partial<Choices>) => {
    setDraft({ ...draft, ...values });
    setConfirmation("");
    setNotice("");
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!saved || busy) return;
    const current = generation.current,
      controller = new AbortController();
    request.current = controller;
    const document = {
        ...draft,
        formRevision: policy.formRevision,
        policyRevision: policy.revision,
        confirmation,
      },
      signature = JSON.stringify(document);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/admin/forms/${formId}/delivery`, {
        method: "POST",
        protected: true,
        body: { ...document, currentPassword: password },
        idempotencyKey: submission.current.key,
        signal: controller.signal,
      });
      const p = await api<Policy>(`/admin/forms/${formId}/delivery`, {
        signal: controller.signal,
      });
      if (current !== generation.current) return;
      setPolicy(p);
      setDraft(choices(p));
      setConfirmation("");
      submission.current = undefined;
      setNotice(
        "Delivery review saved. Only future committed submissions can queue chapter notifications. Respondent-requested copies are controlled by each respondent, not this review.",
      );
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (current === generation.current) {
        setPassword("");
        setBusy(false);
      }
    }
  };
  return (
    <form className="gt-form" onSubmit={submit}>
      <p>
        Review chapter notifications for this exact saved draft and authorized
        recipients. A new draft or review invalidates older queued approvals.
        Respondents can separately request their own full response copy to their
        entered email, without confirmation.
      </p>
      <p className="gt-helper">
        {policy.matchesDraft
          ? "Review matches this saved draft."
          : "This saved draft has no matching delivery review."}{" "}
        {policy.reviewedAt &&
          `Last reviewed ${new Date(policy.reviewedAt).toLocaleString()}.`}{" "}
        Access is checked again before each queued message.
      </p>
      {!saved && (
        <p role="alert">
          Wait for the form draft to finish saving, then reopen this review.
        </p>
      )}
      {!policy.editable && (
        <p role="status">
          This form is archived. Restore it before changing delivery approvals.
        </p>
      )}
      {!policy.mailReady && (
        <p role="status">
          Mail transport is not configured. You can disable delivery, but cannot
          enable new recipients or receipts.
        </p>
      )}
      {policy.notificationUsers.some(
        (id) => !policy.eligible.some((u) => u.id === id),
      ) && (
        <p role="alert">
          A previously selected account is no longer eligible. It has been
          removed from this review; save to confirm the revised recipient list.
        </p>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <fieldset disabled={busy || !policy.editable} className="gt-form">
        <legend>Chapter delivery</legend>
        {(draft.receipts || receiptSetting) && (
          <details>
            <summary>Older receipt review · compatibility settings</summary>
            <p className="gt-helper">
              This older approval is preserved for publication compatibility
              only. It does not send an automatic receipt or change
              respondent-requested copies.
            </p>
            <label className="gt-check">
              <input
                type="checkbox"
                checked={draft.receipts}
                disabled={
                  !draft.receipts && (!identityReady || !policy.mailReady)
                }
                onChange={(e) =>
                  changed({
                    receipts: e.target.checked,
                    receiptAnswers: e.target.checked && draft.receiptAnswers,
                  })
                }
              />
              Legacy verified-recipient approval
            </label>
            {!identityReady && (
              <p className="gt-helper">
                Use verified email, invitation-only or chapter-member access for
                receipts. Public and unlisted forms cannot verify a personal
                email address.
              </p>
            )}
            {draft.receipts && !receiptSetting && (
              <p className="gt-helper">
                The form’s Response receipt switch is off. Enable it in
                Settings, save, and review again before publishing.
              </p>
            )}
            <label className="gt-check">
              <input
                type="checkbox"
                checked={draft.receiptAnswers}
                disabled={
                  !draft.receiptAnswers &&
                  (!policy.canReviewAnswers || !draft.receipts)
                }
                onChange={(e) => changed({ receiptAnswers: e.target.checked })}
              />
              Legacy non-sensitive answer approval
            </label>
          </details>
        )}
        <h3>Chapter notifications</h3>
        <p className="gt-helper">
          Choose up to 10 active accounts with response-review access. Personal
          addresses cannot be entered here.
        </p>
        {policy.eligible.map((user) => (
          <label className="gt-check" key={user.id}>
            <input
              type="checkbox"
              checked={draft.notificationUsers.includes(user.id)}
              disabled={
                !draft.notificationUsers.includes(user.id) &&
                (!policy.mailReady || draft.notificationUsers.length >= 10)
              }
              onChange={(e) =>
                changed({
                  notificationUsers: e.target.checked
                    ? [...draft.notificationUsers, user.id]
                    : draft.notificationUsers.filter((id) => id !== user.id),
                })
              }
            />
            {user.display_name || "Chapter account"} ·{" "}
            {user.role.replace(/_/g, " ")}
          </label>
        ))}
        <label className="gt-check">
          <input
            type="checkbox"
            checked={draft.chapterInbox}
            disabled={
              !draft.chapterInbox &&
              (!policy.mailReady || !policy.chapterInboxAvailable)
            }
            onChange={(e) => changed({ chapterInbox: e.target.checked })}
          />
          Notify the server-configured chapter inbox
        </label>
        <label className="gt-check">
          <input
            type="checkbox"
            checked={draft.notificationAnswers}
            disabled={!draft.notificationAnswers && !policy.canReviewAnswers}
            onChange={(e) => changed({ notificationAnswers: e.target.checked })}
          />
          Include reviewed non-sensitive answers in chapter notifications
        </label>
        <p className="gt-helper">
          Only Admins and Super Admins can approve answer-bearing chapter
          notifications. Sensitive answers and files are excluded from these
          notifications. Answer sets above 32 KiB are omitted in full. These
          restrictions do not truncate a respondent’s own requested copy.
          Delivered mail cannot be recalled.
        </p>
        <Field label="Delivery confirmation" hint={`Type ${policy.reference}`}>
          <input
            autoComplete="off"
            spellCheck={false}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </Field>
        <Field label="Current password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          disabled={
            !saved || busy || !password || confirmation !== policy.reference
          }
        >
          {busy ? "Saving review…" : "Confirm delivery review"}
        </Button>
      </fieldset>
    </form>
  );
}
