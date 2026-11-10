import RecordAcknowledgement from "@/ui/RecordAcknowledgement";
import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Button, EmptyState, Field } from "../primitives";
import {
  deliveryChoices,
  validDeliveryPolicy,
  prepareDeliveryWrite,
  submitDeliveryWrite,
  type DeliveryPolicy,
  type DeliveryChoices,
  type DeliveryIntent,
  type DeliveryAccount,
} from "./form-delivery-api";
import DeliveryRecipients from "./DeliveryRecipients";
import FormDeliveryWriteRecovery from "./FormDeliveryWriteRecovery";
type Props = {
  formId: string;
  saved: boolean;
  receiptSetting: boolean;
  access: string;
  onStateChange: (state: { dirty: boolean; busy: boolean }) => void;
};
export default function DeliveryPanel(props: Props) {
  const { currentAdmin } = useAdmin();
  if (!currentAdmin) return null;
  return (
    <DeliveryWorkspace
      key={`${currentAdmin.id}:${currentAdmin.role}:${props.formId}`}
      {...props}
    />
  );
}
function DeliveryWorkspace({
  formId,
  saved,
  receiptSetting,
  access,
  ...handlers
}: Props) {
  const [policy, setPolicy] = useState<DeliveryPolicy>(),
    [draft, setDraft] = useState<DeliveryChoices>(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [readRetry, setReadRetry] = useState(0),
    [blocked, setBlocked] = useState(""),
    [needsRecheck, setNeedsRecheck] = useState(false),
    [intent, setIntent] = useState<DeliveryIntent>(),
    [uncertain, setUncertain] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [stale, setStale] = useState(false),
    [labels, setLabels] = useState<Record<string, DeliveryAccount>>({}),
    [pickerOpen, setPickerOpen] = useState(false),
    [candidatesReady, setCandidatesReady] = useState(false);
  const callbacks = useRef(handlers),
    intentRef = useRef<DeliveryIntent>(),
    feedback = useRef<HTMLParagraphElement>(null),
    noticeFeedback = useRef<HTMLParagraphElement>(null),
    { isOnline } = useOnlineStatus(),
    safety = useNavigationSafety(),
    path = "/admin/forms/" + formId + "/delivery",
    read = usePrivateRead<DeliveryPolicy>(
      !blocked ? path : undefined,
      readRetry,
    ),
    { busy, begin, current, finish, cancel } = usePrivateMutation(path),
    pending = busy || recoveryBusy;
  callbacks.current = handlers;
  const identityReady = ["verified", "invited", "internal"].includes(access),
    policyChanged =
      !!policy &&
      !!read.data &&
      (policy.formRevision !== read.data.formRevision ||
        policy.revision !== read.data.revision),
    dirty =
      !!intent ||
      (!!policy &&
        !!draft &&
        (JSON.stringify(draft) !== JSON.stringify(deliveryChoices(policy)) ||
          !!password ||
          !!confirmation));
  const editable =
    !!policy &&
    !!draft &&
    saved &&
    validDeliveryPolicy(read.data, formId) &&
    read.data.editable &&
    !blocked &&
    !read.denied &&
    !read.loading &&
    !read.error &&
    !pending &&
    !intent &&
    !stale &&
    !policyChanged &&
    isOnline &&
    !needsRecheck;
  const displayLabels = {
    ...labels,
    ...Object.fromEntries(
      (read.data?.selectedAccounts || []).map((account) => [
        account.id,
        account,
      ]),
    ),
  };
  const ineligibleSelected =
      draft?.notificationUsers.filter(
        (id) => displayLabels[id]?.eligible === false,
      ) || [],
    newSelected = draft?.notificationUsers.some(
      (id) => !policy?.notificationUsers.includes(id),
    ),
    wantsMail =
      !!draft &&
      (draft.receipts ||
        draft.notificationUsers.length > 0 ||
        draft.chapterInbox);
  const writable =
    editable &&
    !ineligibleSelected.length &&
    (!newSelected || candidatesReady) &&
    (!wantsMail || !!read.data?.mailReady) &&
    (!draft?.chapterInbox || !!read.data?.chapterInboxAvailable) &&
    (!(draft?.receiptAnswers || draft?.notificationAnswers) ||
      !!read.data?.canReviewAnswers) &&
    (!draft?.receipts || identityReady);
  useDraftGuard(dirty, {
    busy: pending,
    label: intent
      ? "Unconfirmed delivery review; the original approval may already have changed"
      : "Form delivery review",
  });
  useEffect(() => {
    callbacks.current.onStateChange({ dirty, busy: pending });
  }, [dirty, pending]);
  const { clear } = read;
  function resetAttempt() {
    intentRef.current = undefined;
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setPassword("");
    setConfirmation("");
    setStale(false);
  }
  function deny(message: string) {
    cancel();
    clear();
    setPolicy(undefined);
    setDraft(undefined);
    setLabels({});
    setPickerOpen(false);
    setCandidatesReady(false);
    resetAttempt();
    setError("");
    setNotice("");
    setBlocked(message);
  }
  useEffect(() => {
    const clearSession = () =>
      deny(
        "Your session changed. Recheck current delivery access before reopening private settings.",
      );
    const offline = () => {
      setNeedsRecheck(true);
      setPassword("");
      cancel();
      if (intentRef.current) setUncertain(true);
    };
    window.addEventListener("gdg:session-cleared", clearSession);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("gdg:session-cleared", clearSession);
      window.removeEventListener("offline", offline);
    };
    // Stable cancellation/read-clear functions; private callbacks are held in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancel, clear]);
  useEffect(() => {
    if (read.denied) {
      deny(
        "Current delivery access is restricted. Private settings and recipient proposals have been cleared.",
      );
      return;
    }
    if (read.data && !validDeliveryPolicy(read.data, formId)) {
      deny(
        "This delivery result did not match the current form or selected recipient inventory. Recheck current access.",
      );
      return;
    }
    if (read.data && !policy) {
      setPolicy(read.data);
      setDraft(deliveryChoices(read.data));
      setLabels(
        Object.fromEntries(
          read.data.selectedAccounts.map((account) => [account.id, account]),
        ),
      );
    }
    // A successful read initializes empty state without overwriting a local proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read.data, read.denied, policy]);
  useEffect(() => {
    if (error) feedback.current?.focus();
  }, [error]);
  useEffect(() => {
    if (notice && !error) noticeFeedback.current?.focus();
  }, [notice, error]);
  function reloadSaved() {
    clear();
    setPolicy(undefined);
    setDraft(undefined);
    setLabels({});
    setPickerOpen(false);
    setCandidatesReady(false);
    resetAttempt();
    setError("");
    setBlocked("");
    setNeedsRecheck(false);
    setReadRetry((value) => value + 1);
  }
  function retryRead() {
    setNeedsRecheck(false);
    setReadRetry((value) => value + 1);
    document.getElementById("workspace-content")?.focus();
  }
  function complete(result: { revision: number }) {
    resetAttempt();
    setNotice(
      `Delivery review confirmed at policy revision ${result.revision}. Only future committed submissions can queue chapter notifications; respondent-requested own copies remain separate.`,
    );
    clear();
    setPolicy(undefined);
    setDraft(undefined);
    setLabels({});
    setPickerOpen(false);
    setCandidatesReady(false);
    setNeedsRecheck(false);
    setReadRetry((value) => value + 1);
  }
  function changed(values: Partial<DeliveryChoices>) {
    if (!draft || !editable) return;
    setDraft({ ...draft, ...values });
    setConfirmation("");
    setNotice("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !writable ||
      !policy ||
      !draft ||
      !password ||
      confirmation !== policy.reference
    )
      return;
    const controller = begin();
    if (!controller) return;
    let packet: DeliveryIntent;
    try {
      packet = prepareDeliveryWrite(policy, draft, confirmation, identityReady);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Reload delivery settings before reviewing.",
      );
      finish(controller);
      return;
    }
    intentRef.current = packet;
    setIntent(packet);
    setError("");
    setNotice("");
    try {
      const result = await submitDeliveryWrite(
        packet,
        password,
        controller.signal,
      );
      if (current(controller)) complete(result);
    } catch (e) {
      if (!current(controller)) return;
      if (
        e instanceof ApiFailure &&
        [401, 403, 404].includes(e.status) &&
        e.code !== "PASSWORD_REQUIRED"
      )
        deny(
          "Delivery authorization changed. Private settings and the proposed approval have been cleared.",
        );
      else if (
        e instanceof ApiFailure &&
        [400, 403, 409, 429].includes(e.status)
      ) {
        intentRef.current = undefined;
        setIntent(undefined);
        setError(e.message);
        if (e.code !== "PASSWORD_REQUIRED") setStale(true);
      } else setUncertain(true);
    } finally {
      if (current(controller)) setPassword("");
      finish(controller);
    }
  }
  if (blocked || read.denied)
    return (
      <EmptyState
        title="Delivery access needs to be rechecked"
        action={
          <Button
            variant="secondary"
            disabled={!isOnline || pending}
            onClick={reloadSaved}
          >
            Recheck private delivery access
          </Button>
        }
      >
        {blocked || "Private delivery settings have been cleared."}
      </EmptyState>
    );
  if (!policy || !draft)
    return (
      <>
        {notice && (
          <p role="status" tabIndex={-1} ref={noticeFeedback}>
            {notice}
          </p>
        )}
        {read.error ? (
          <EmptyState
            title="Delivery settings unavailable"
            action={
              <Button
                variant="secondary"
                disabled={!isOnline || pending}
                onClick={retryRead}
              >
                Retry delivery settings
              </Button>
            }
          >
            {read.error}
          </EmptyState>
        ) : (
          <div role="status" aria-label="Loading delivery settings">
            <div className="gt-skeleton gt-detail-skeleton" />
            <span className="sr-only">
              Checking delivery settings and current access…
            </span>
          </div>
        )}
      </>
    );
  return (
    <form className="gt-form" onSubmit={submit}>
      {uncertain && intent && (
        <FormDeliveryWriteRecovery
          key={intent.key}
          intent={intent}
          onRecovered={complete}
          onBusy={setRecoveryBusy}
          onDenied={() =>
            deny(
              "Current delivery access changed. Private settings and the original proposal have been cleared.",
            )
          }
          onAbandon={reloadSaved}
        />
      )}
      <details open={!uncertain}>
        <summary>
          {uncertain
            ? "Review frozen original delivery settings"
            : "Delivery settings and consequences"}
        </summary>
        <div className="gt-form">
          {(read.error ||
            read.loading ||
            needsRecheck ||
            !isOnline ||
            stale ||
            policyChanged) && (
            <section
              aria-label="Delivery policy read status"
              className="gt-form"
            >
              {read.loading && (
                <p role="status">Checking current delivery settings…</p>
              )}
              {read.error && <p role="alert">{read.error}</p>}
              {read.at && (
                <p>
                  Last successful policy read:{" "}
                  <time dateTime={read.at}>
                    {new Date(read.at).toLocaleString()}
                  </time>
                  .
                </p>
              )}
              {(!isOnline || needsRecheck) && (
                <p role="status">
                  Changes are paused. Reconnect and explicitly recheck current
                  delivery settings.
                </p>
              )}
              {(stale || policyChanged) && (
                <p role="alert">
                  The saved draft, policy revision or previous result needs a
                  new review. Proposed choices remain unchanged.
                </p>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={!isOnline || pending || !!intent}
                onClick={retryRead}
              >
                Recheck delivery settings
              </Button>
            </section>
          )}
          {(stale || policyChanged) && !intent && (
            <Button
              type="button"
              variant="secondary"
              disabled={!isOnline || pending}
              onClick={() => safety.request(reloadSaved)}
            >
              Reload saved delivery settings and discard this review
            </Button>
          )}
          <p>
            Review chapter notifications for this exact saved draft and
            authorized recipients. A new draft or review invalidates older
            queued approvals. Respondents can separately request their own full
            response copy to their entered email, without confirmation.
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
              This form is archived. Restore it before changing delivery
              approvals.
            </p>
          )}
          {!policy.mailReady && (
            <p role="status">
              Mail transport is not configured. You can disable delivery, but
              cannot enable new recipients or receipts.
            </p>
          )}
          {!!ineligibleSelected.length && (
            <p role="alert">
              Some selected accounts are no longer eligible. They stay in this
              proposal until you explicitly remove them before confirming.
            </p>
          )}
          {error && (
            <p
              ref={feedback}
              tabIndex={-1}
              role="alert"
              className="gt-form-error"
            >
              {error}
            </p>
          )}
          {notice && (
            <p role="status" tabIndex={-1} ref={noticeFeedback}>
              {notice}
            </p>
          )}
          <fieldset disabled={!editable} className="gt-form">
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
                        receiptAnswers:
                          e.target.checked && draft.receiptAnswers,
                      })
                    }
                  />
                  Legacy verified-recipient approval
                </label>
                {!identityReady && (
                  <p className="gt-helper">
                    Use verified email, invitation-only or chapter-member access
                    for receipts. Public and unlisted forms cannot verify a
                    personal email address.
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
                    onChange={(e) =>
                      changed({ receiptAnswers: e.target.checked })
                    }
                  />
                  Legacy non-sensitive answer approval
                </label>
              </details>
            )}
            <h3>Chapter notifications</h3>
            {!pickerOpen && !draft.notificationUsers.length && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPickerOpen(true)}
              >
                Choose notification recipients
              </Button>
            )}
            {(pickerOpen ||
              draft.notificationUsers.length > 0 ||
              policy.selectedAccounts.length > 0) && (
              <DeliveryRecipients
                formId={formId}
                refresh={readRetry}
                selected={draft.notificationUsers}
                labels={displayLabels}
                disabled={!editable}
                pending={pending || !!intent}
                mailReady={policy.mailReady}
                onChange={(account, selected) => {
                  if (!editable) return;
                  setLabels((value) => ({ ...value, [account.id]: account }));
                  changed({
                    notificationUsers: selected
                      ? [...new Set([...draft.notificationUsers, account.id])]
                      : draft.notificationUsers.filter(
                          (id) => id !== account.id,
                        ),
                  });
                }}
                onReady={setCandidatesReady}
                onDenied={() =>
                  deny(
                    "Current delivery-recipient access changed. Private settings and proposed recipients have been cleared.",
                  )
                }
              />
            )}
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
                disabled={
                  !draft.notificationAnswers && !policy.canReviewAnswers
                }
                onChange={(e) =>
                  changed({ notificationAnswers: e.target.checked })
                }
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
            <RecordAcknowledgement
              label="I have reviewed these email delivery settings."
              reference={policy.reference}
              value={confirmation}
              onChange={setConfirmation}
            />
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
                !writable || !password || confirmation !== policy.reference
              }
            >
              {pending ? "Saving review…" : "Confirm delivery review"}
            </Button>
          </fieldset>
        </div>
      </details>
    </form>
  );
}
