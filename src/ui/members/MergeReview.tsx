import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiFailure } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import {
  memberMergePreview,
  memberMergeCommit,
} from "../../../shared/members.mjs";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import MergeWriteRecovery from "./MergeWriteRecovery";
import {
  mergeIntent,
  submitMergeWrite,
  type MergeWriteIntent,
  type MergeReceipt,
} from "./merge-write";
import MemberReadFeedback from "./MemberReadFeedback";
import ScrollableTable from "../ScrollableTable";
import { Button, Field, SearchBox } from "../primitives";
import type { Member, MemberSummary, Review } from "./types";
const base = "/admin/members";
export default function MergeReview({
  source,
  tick,
  onSaved,
  onClose,
  onBusy,
  onDirty,
  disabled = false,
  onDenied,
}: {
  source: Member;
  tick: number;
  onSaved: (id: string) => void;
  onClose: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  disabled?: boolean;
  onDenied?: () => void;
}) {
  const [q, setQ] = useState(""),
    [targetId, setTargetId] = useState(""),
    [review, setReview] = useState<Review>(),
    [page, setPage] = useState(1),
    [listAttempt, setListAttempt] = useState(0),
    [targetAttempt, setTargetAttempt] = useState(0),
    [blocked, setBlocked] = useState(false),
    [needsRecheck, setNeedsRecheck] = useState(!navigator.onLine);
  const [password, setPassword] = useState(""),
    [sourceConfirmation, setSourceConfirmation] = useState(""),
    [targetConfirmation, setTargetConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState<MergeWriteIntent>(),
    [recoveryBusy, setRecoveryBusy] = useState(false);
  const activeWrite = useRef<{
      intent: MergeWriteIntent;
      controller: AbortController;
    }>(),
    mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null),
    reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    onDirty(
      !!(
        q ||
        targetId ||
        review ||
        password ||
        sourceConfirmation ||
        targetConfirmation ||
        uncertain
      ),
    );
  }, [
    onDirty,
    q,
    targetId,
    review,
    password,
    sourceConfirmation,
    targetConfirmation,
    uncertain,
  ]);
  const { isOnline } = useOnlineStatus(),
    prefix = base + "/" + source.id;
  const candidatesRead = usePrivateRead<{
      items: Pick<
        MemberSummary,
        "id" | "name" | "email" | "team_id" | "revision"
      >[];
      total: number;
      page: number;
      pageSize: number;
      sourceRevision: number;
    }>(
      blocked
        ? undefined
        : prefix +
            "/merge-candidates?" +
            new URLSearchParams({ q, page: String(page) }),
      tick + listAttempt,
    ),
    targetRead = usePrivateRead<{ member: Member; sourceRevision: number }>(
      !blocked && targetId ? prefix + "/merge-target/" + targetId : undefined,
      tick + targetAttempt,
    );
  const candidates = candidatesRead.data?.items || [],
    target = targetRead.data?.member;
  const unavailable =
    blocked ||
    disabled ||
    !isOnline ||
    needsRecheck ||
    !!uncertain ||
    candidatesRead.loading ||
    !!candidatesRead.error ||
    !candidatesRead.data ||
    candidatesRead.data.sourceRevision !== source.revision ||
    (!!targetId &&
      (targetRead.loading ||
        !!targetRead.error ||
        !target ||
        targetRead.data?.sourceRevision !== source.revision));
  const clearCandidates = candidatesRead.clear,
    clearTarget = targetRead.clear;
  useEffect(() => {
    onBusy(busy || recoveryBusy || !!uncertain);
  }, [busy, recoveryBusy, uncertain, onBusy]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeWrite.current?.controller.abort();
    };
  }, []);
  useEffect(() => {
    const offline = () => {
      if (activeWrite.current) {
        activeWrite.current.controller.abort();
        setUncertain(activeWrite.current.intent);
        activeWrite.current = undefined;
        setBusy(false);
        setPassword("");
      }
    };
    window.addEventListener("offline", offline);
    return () => window.removeEventListener("offline", offline);
  }, []);
  useEffect(() => {
    if (!isOnline) setNeedsRecheck(true);
  }, [isOnline]);
  useEffect(() => {
    if (!candidatesRead.denied && !targetRead.denied) return;
    activeWrite.current?.controller.abort();
    activeWrite.current = undefined;
    setUncertain(undefined);
    setRecoveryBusy(false);
    onDenied?.();
    clearCandidates();
    clearTarget();
    setTargetId("");
    setReview(undefined);
    setQ("");
    setPage(1);
    setPassword("");
    setSourceConfirmation("");
    setTargetConfirmation("");
    setError("");
    setBlocked(true);
    setBusy(false);
    onBusy(false);
  }, [
    candidatesRead.denied,
    targetRead.denied,
    clearCandidates,
    clearTarget,
    onBusy,
    onDenied,
  ]);
  const deny = () => {
    activeWrite.current?.controller.abort();
    activeWrite.current = undefined;
    clearCandidates();
    clearTarget();
    setTargetId("");
    setReview(undefined);
    setQ("");
    setPage(1);
    setPassword("");
    setSourceConfirmation("");
    setTargetConfirmation("");
    setError("");
    setBlocked(true);
    setBusy(false);
    setRecoveryBusy(false);
    setUncertain(undefined);
    onBusy(false);
    onDenied?.();
  };
  const recheck = () => {
    if (busy || uncertain || disabled || !navigator.onLine) return;
    setBlocked(false);
    setNeedsRecheck(false);
    setListAttempt((v) => v + 1);
    setTargetAttempt((v) => v + 1);
  };
  const mismatch =
    !target ||
    target.team_id !== source.team_id ||
    !target.is_active ||
    !!target.deleted_at ||
    !!target.merged_into_id;
  const stale =
    !!review &&
    (review.source.revision !== source.revision ||
      review.target.revision !== target?.revision ||
      new Date(review.expiresAt).getTime() <= Date.now());
  function confirmed(intent: MergeWriteIntent, result: MergeReceipt) {
    setUncertain(undefined);
    setPassword("");
    setSourceConfirmation("");
    setTargetConfirmation("");
    if (intent.action === "preview") setReview(result as Review);
    else onSaved((result as { id: string }).id);
  }
  async function saveOriginal(intent: MergeWriteIntent, proof?: string) {
    if (activeWrite.current || !navigator.onLine) return;
    const controller = new AbortController();
    activeWrite.current = { intent, controller };
    setBusy(true);
    setError("");
    setPassword("");
    try {
      const result = await submitMergeWrite(intent, controller.signal, proof);
      if (mounted.current && !controller.signal.aborted)
        confirmed(intent, result);
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      if (
        e instanceof ApiFailure &&
        (e.status === 401 ||
          e.status === 404 ||
          (e.status === 403 && e.code !== "PASSWORD_REQUIRED"))
      ) {
        deny();
        return;
      }
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(intent);
        return;
      }
      if (
        e instanceof ApiFailure &&
        ["CONFLICT", "MEMBER_REVIEW_EXPIRED"].includes(e.code)
      )
        setReview(undefined);
      setError(
        validationMessage(
          e,
          "The original merge request could not be completed.",
        ),
      );
    } finally {
      if (activeWrite.current?.intent === intent)
        activeWrite.current = undefined;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }
  async function preview() {
    if (busy || unavailable || mismatch || !target) return;
    try {
      const document = memberMergePreview.parse({
        sourceId: source.id,
        targetId: target.id,
        sourceRevision: source.revision,
        targetRevision: target.revision,
      });
      setSourceConfirmation("");
      setTargetConfirmation("");
      await saveOriginal(mergeIntent("preview", document, source, target));
    } catch (e) {
      setError(validationMessage(e, "The merge review could not be prepared."));
    }
  }
  async function commit(e: FormEvent) {
    e.preventDefault();
    if (busy || unavailable || stale || !review) return;
    try {
      const { currentPassword, ...document } = memberMergeCommit.parse({
        reviewId: review.reviewId,
        reviewToken: review.reviewToken,
        sourceConfirmation,
        targetConfirmation,
        currentPassword: password,
      });
      await saveOriginal(
        mergeIntent("commit", document, review.source, review.target),
        currentPassword,
      );
    } catch (e) {
      setError(validationMessage(e, "This merge could not be committed."));
    }
  }
  return (
    <section className="gt-panel gt-event-editor">
      <h2 ref={heading} tabIndex={-1}>
        Review a retained duplicate
      </h2>
      <p>
        Keep a chosen canonical member unchanged. The source becomes an
        inactive, retained reference; no accounts, permissions, responses or
        financial records are combined. Unmerge can recover the separate
        inactive source.
      </p>
      <p>
        First review active project memberships and archive any current linked
        public profile. Only chapter administrators can merge, and both records
        must share the same owning scope.
      </p>
      {uncertain && (
        <MergeWriteRecovery
          intent={uncertain}
          onConfirmed={(result) => confirmed(uncertain, result)}
          onDenied={deny}
          onBusy={setRecoveryBusy}
          onStop={() => {
            setUncertain(undefined);
            setReview(undefined);
            setTargetId("");
            setQ("");
            setPage(1);
            setPassword("");
            setSourceConfirmation("");
            setTargetConfirmation("");
            setNeedsRecheck(true);
            setError(
              "Merge recovery stopped. The original outcome remains unconfirmed. Recheck the current member records before preparing another change.",
            );
          }}
        />
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      <div className="gt-button-row">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !!uncertain || disabled || !isOnline}
          onClick={recheck}
        >
          Recheck merge selection
        </Button>
      </div>
      {blocked ? (
        <p role="alert" className="gt-form-error">
          Merge selection access could not be verified. Private candidates,
          target and review have been cleared. Recheck current selection access
          to continue.
        </p>
      ) : (
        <>
          {(!isOnline || needsRecheck) && (
            <p role="status">
              Merge actions are paused. Reconnect and explicitly recheck the
              merge selection before continuing.
            </p>
          )}
          <MemberReadFeedback
            name="merge candidates"
            read={candidatesRead}
            offline={!isOnline}
            disabled={busy || disabled || !isOnline || needsRecheck}
            retry={() => setListAttempt((v) => v + 1)}
          />
          {targetId && (
            <MemberReadFeedback
              name="canonical member"
              read={targetRead}
              offline={!isOnline}
              disabled={busy || disabled || !isOnline || needsRecheck}
              retry={() => setTargetAttempt((v) => v + 1)}
            />
          )}
          {candidatesRead.data &&
            candidatesRead.data.sourceRevision !== source.revision && (
              <p role="alert">
                The source member changed. Recheck member access in the
                directory before generating a review.
              </p>
            )}
        </>
      )}
      <fieldset
        disabled={
          busy ||
          !!uncertain ||
          disabled ||
          !isOnline ||
          needsRecheck ||
          blocked ||
          !!review
        }
        className="gt-plain-fieldset"
      >
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
            setTargetId("");
            setReview(undefined);
            setPassword("");
          }}
          label="Search canonical members"
          placeholder="Search name or email"
        />
        <Field label="Canonical member to keep">
          <select
            value={targetId}
            disabled={busy || candidatesRead.loading || !!candidatesRead.error}
            onChange={(e) => {
              setTargetId(e.target.value);
              setReview(undefined);
              setPassword("");
            }}
          >
            <option value="">Choose an active member</option>
            {targetId && !candidates.some((m) => m.id === targetId) && (
              <option value={targetId}>Selected canonical member</option>
            )}
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.email}
              </option>
            ))}
          </select>
        </Field>
        <p>
          {candidatesRead.data
            ? `${candidatesRead.data.total} eligible members in this owning scope · page ${page}.`
            : "Canonical candidates require a current authorized read."}
        </p>
        <div className="gt-button-row">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || candidatesRead.loading || page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            Previous canonical members
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={
              busy ||
              candidatesRead.loading ||
              !!candidatesRead.error ||
              !candidatesRead.data ||
              page * candidatesRead.data.pageSize >= candidatesRead.data.total
            }
            onClick={() => setPage((v) => v + 1)}
          >
            Next canonical members
          </Button>
        </div>
        <div className="gt-button-row">
          <Button
            type="button"
            disabled={busy || unavailable || mismatch}
            onClick={preview}
          >
            Generate current review
          </Button>
        </div>
      </fieldset>
      <div className="gt-button-row">
        {" "}
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !!uncertain}
          onClick={onClose}
        >
          Close merge review
        </Button>
      </div>
      {review && (
        <div className="gt-button-row">
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !!uncertain}
            onClick={() => {
              setReview(undefined);
              setPassword("");
              setSourceConfirmation("");
              setTargetConfirmation("");
            }}
          >
            Discard this merge review
          </Button>
        </div>
      )}
      {review && (
        <form onSubmit={commit}>
          <h3 ref={reviewHeading} tabIndex={-1}>
            Compare before merging
          </h3>
          <p>{review.policy}</p>
          {stale && (
            <p role="alert">
              This review changed or expired. Check any unconfirmed original
              outcome before preparing a fresh review.
            </p>
          )}
          <ScrollableTable
            className="gt-table-scroll"
            label="Private member comparison"
          >
            <table className="gt-data-table">
              <caption>Private member comparison</caption>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Source retained inactive</th>
                  <th>Canonical record kept</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    "name",
                    "email",
                    "phone",
                    "year",
                    "major",
                    "category",
                    "team_section",
                  ] as const
                ).map((field) => (
                  <tr key={field}>
                    <th>{field.replace(/_/g, " ")}</th>
                    <td>{review.source[field] || "Not provided"}</td>
                    <td>{review.target[field] || "Not provided"}</td>
                  </tr>
                ))}
              </tbody>
              <tbody>
                <tr>
                  <th>Interests</th>
                  <td>
                    {review.source.interests.join("; ") || "Not provided"}
                  </td>
                  <td>
                    {review.target.interests.join("; ") || "Not provided"}
                  </td>
                </tr>
                <tr>
                  <th>Core community team</th>
                  <td>{review.source.is_core_team ? "Yes" : "No"}</td>
                  <td>{review.target.is_core_team ? "Yes" : "No"}</td>
                </tr>
                <tr>
                  <th>Active community record</th>
                  <td>{review.source.is_active ? "Yes" : "No"}</td>
                  <td>{review.target.is_active ? "Yes" : "No"}</td>
                </tr>
              </tbody>
            </table>
          </ScrollableTable>
          <p>
            Review expires {new Date(review.expiresAt).toLocaleTimeString()}.
          </p>
          <fieldset
            disabled={busy || unavailable || stale}
            className="gt-plain-fieldset"
          >
            <Field
              label="Source reference"
              hint={review.source.reference}
              required
            >
              <input
                required
                autoComplete="off"
                value={sourceConfirmation}
                onChange={(e) => setSourceConfirmation(e.target.value)}
              />
            </Field>
            <Field
              label="Canonical reference"
              hint={review.target.reference}
              required
            >
              <input
                required
                autoComplete="off"
                value={targetConfirmation}
                onChange={(e) => setTargetConfirmation(e.target.value)}
              />
            </Field>
            <Field label="Current password" required>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          </fieldset>
          <Button type="submit" disabled={busy || unavailable || stale}>
            Confirm retained merge
          </Button>
        </form>
      )}
    </section>
  );
}
