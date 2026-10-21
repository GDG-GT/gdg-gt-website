import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { validationMessage } from "@/lib/validationMessage";
import {
  memberMergePreview,
  memberMergeCommit,
} from "../../../shared/members.mjs";
import { Button, Field, SearchBox } from "../primitives";
import type { Member, MemberSummary, Listing, Review } from "./types";
const base = "/admin/members";
export default function MergeReview({
  source,
  tick,
  onSaved,
  onClose,
  onBusy,
  onDirty,
}: {
  source: Member;
  tick: number;
  onSaved: (id: string) => void;
  onClose: () => void;
  onBusy: (v: boolean) => void;
  onDirty: (v: boolean) => void;
}) {
  const [q, setQ] = useState(""),
    [candidates, setCandidates] = useState<MemberSummary[]>([]),
    [targetId, setTargetId] = useState(""),
    [target, setTarget] = useState<Member>(),
    [review, setReview] = useState<Review>();
  const [password, setPassword] = useState(""),
    [sourceConfirmation, setSourceConfirmation] = useState(""),
    [targetConfirmation, setTargetConfirmation] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef<{ identity: string; value: string }>(),
    epoch = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
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
  useEffect(() => {
    const clear = () => {
      epoch.current++;
      setCandidates([]);
      setTarget(undefined);
      setReview(undefined);
      setPassword("");
      setSourceConfirmation("");
      setTargetConfirmation("");
      setError("");
      key.current = undefined;
    };
    window.addEventListener("gdg:session-cleared", clear);
    const invalidate = () => {
      epoch.current++;
    };
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<Listing>(base + "?" + new URLSearchParams({ q, active: "true" }), {
      signal: c.signal,
    })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch)
          setCandidates(
            v.items.filter(
              (m) =>
                m.id !== source.id &&
                m.team_id === source.team_id &&
                !m.merged_into_id,
            ),
          );
      })
      .catch((e) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          setCandidates([]);
          setError(e.message);
        }
      });
    return () => c.abort();
  }, [q, source.id, source.team_id, tick]);
  useEffect(() => {
    if (!targetId) {
      setTarget(undefined);
      return;
    }
    const c = new AbortController(),
      readEpoch = epoch.current;
    api<{ member: Member }>(base + "/" + targetId, { signal: c.signal })
      .then((v) => {
        if (!c.signal.aborted && epoch.current === readEpoch)
          setTarget(v.member);
      })
      .catch((e) => {
        if (!c.signal.aborted && epoch.current === readEpoch) {
          setTarget(undefined);
          setReview(undefined);
          setPassword("");
          setError(e.message);
        }
      });
    return () => c.abort();
  }, [targetId, tick]);
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
    if (busy || mismatch) return;
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
    if (busy || stale || !review) return;
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
      <fieldset disabled={busy} className="gt-plain-fieldset">
        <SearchBox
          value={q}
          onChange={(v) => {
            setQ(v);
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
            disabled={busy}
            onChange={(e) => {
              setTargetId(e.target.value);
              setReview(undefined);
              setPassword("");
            }}
          >
            <option value="">Choose an active member</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.email}
              </option>
            ))}
          </select>
        </Field>
        <p>
          The picker shows up to 30 current matches in this scope. Narrow the
          search for another member.
        </p>
        <div className="gt-button-row">
          <Button type="button" disabled={busy || mismatch} onClick={preview}>
            Generate current review
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Close merge review
          </Button>
        </div>
      </fieldset>
      {review && (
        <form onSubmit={commit}>
          <h3>Compare before merging</h3>
          <p>{review.policy}</p>
          {stale && (
            <p role="alert">
              This review changed or expired. Generate a fresh review; no merge
              was performed.
            </p>
          )}
          <div className="gt-table-scroll">
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
          </div>
          <p>
            Review expires {new Date(review.expiresAt).toLocaleTimeString()}.
          </p>
          <fieldset disabled={busy} className="gt-plain-fieldset">
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
          <Button type="submit" disabled={busy || stale}>
            Confirm retained merge
          </Button>
        </form>
      )}
    </section>
  );
}
