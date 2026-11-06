import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import {
  memberMergePreview,
  memberMergeCommit,
} from "../../../shared/members.mjs";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
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
}: {
  source: Member;
  tick: number;
  onSaved: (id: string) => void;
  onClose: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
  disabled?: boolean;
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
    [busy, setBusy] = useState(false);
  const key = useRef<{ identity: string; value: string }>(),
    epoch = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
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
        targetConfirmation
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
    const invalidate = () => {
      epoch.current++;
    };
    return invalidate;
  }, []);
  useEffect(() => {
    onBusy(false);
  }, [onBusy]);
  useEffect(() => {
    if (!isOnline) setNeedsRecheck(true);
  }, [isOnline]);
  useEffect(() => {
    if (!candidatesRead.denied && !targetRead.denied) return;
    epoch.current++;
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
    key.current = undefined;
  }, [
    candidatesRead.denied,
    targetRead.denied,
    clearCandidates,
    clearTarget,
    onBusy,
  ]);
  const recheck = () => {
    if (busy || disabled || !navigator.onLine) return;
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
  function requestKey(identity: string) {
    if (key.current?.identity !== identity)
      key.current = { identity, value: crypto.randomUUID() };
    return key.current.value;
  }
  async function preview() {
    if (busy || unavailable || mismatch) return;
    const current = epoch.current;
    setBusy(true);
    onBusy(true);
    setError("");
    setPassword("");
    setSourceConfirmation("");
    setTargetConfirmation("");
    try {
      const body = memberMergePreview.parse({
        sourceId: source.id,
        targetId: target.id,
        sourceRevision: source.revision,
        targetRevision: target.revision,
      });
      const result = await api<Review>(base + "/merge-preview", {
        method: "POST",
        protected: true,
        body,
        idempotencyKey: requestKey("preview:" + JSON.stringify(body)),
      });
      if (current === epoch.current) {
        setReview(result);
        key.current = undefined;
      }
    } catch (e) {
      if (current === epoch.current) {
        setReview(undefined);
        key.current = undefined;
        setError(
          validationMessage(e, "The merge review could not be prepared."),
        );
      }
    } finally {
      if (current === epoch.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  }
  async function commit(e: FormEvent) {
    e.preventDefault();
    if (busy || unavailable || stale || !review) return;
    const current = epoch.current,
      secret = password;
    setPassword("");
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const body = memberMergeCommit.parse({
        reviewId: review.reviewId,
        reviewToken: review.reviewToken,
        sourceConfirmation,
        targetConfirmation,
        currentPassword: secret,
      });
      const result = await api<{ id: string }>(base + "/merge", {
        method: "POST",
        protected: true,
        body,
        idempotencyKey: requestKey(
          "commit:" +
            JSON.stringify({
              reviewId: review.reviewId,
              sourceConfirmation,
              targetConfirmation,
            }),
        ),
      });
      if (current === epoch.current) onSaved(result.id);
    } catch (e) {
      if (current === epoch.current) {
        if (
          e instanceof ApiFailure &&
          ["CONFLICT", "MEMBER_REVIEW_EXPIRED"].includes(e.code)
        )
          setReview(undefined);
        setError(validationMessage(e, "This merge could not be committed."));
      }
    } finally {
      if (current === epoch.current) {
        setBusy(false);
        onBusy(false);
      }
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
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      <div className="gt-button-row">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || disabled || !isOnline}
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
          busy || disabled || !isOnline || needsRecheck || blocked || !!review
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
          disabled={busy}
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
            disabled={busy}
            onClick={() => {
              setReview(undefined);
              setPassword("");
              setSourceConfirmation("");
              setTargetConfirmation("");
              key.current = undefined;
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
              This review changed or expired. Generate a fresh review; no merge
              was performed.
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
