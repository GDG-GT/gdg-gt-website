import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { Badge, Button, EmptyState, Field } from "./primitives";
import {
  personPrivacyReview,
  privacyConfirmation,
} from "../../shared/privacy.mjs";

type RecordItem = {
  kind: string;
  id: string;
  parentId: string | null;
  held: boolean;
  source: string;
  label: string;
};
type Review = {
  reviewId: string;
  reviewToken: string;
  action: string;
  expiresAt: string;
  count: number;
  heldCount: number;
  records: RecordItem[];
};
type Recent = {
  reviewId: string;
  action: string;
  count: number;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  pendingFiles: number;
  pendingExports: number;
};
type Result = {
  action: string;
  count: number;
  pendingFiles?: number;
  pendingExports?: number;
  remainingMatches?: number;
  export?: unknown[];
};
const initial = {
  email: "",
  action: "export",
  purpose: "",
  identityVerified: false,
  responseIds: "",
  includeSensitive: false,
};
const labels: Record<string, string> = {
  event: "Event registration",
  newsletter: "Newsletter subscription",
  contact: "Contact inquiry",
  form_response: "Form response",
  form_draft: "Private form draft",
  form_access: "Private form access",
  push: "Device reminder",
  newsletter_attempt: "Signup attempt",
};

export default function PrivacyWorkspace() {
  const [draft, setDraft] = useState(initial),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [review, setReview] = useState<Review>(),
    [result, setResult] = useState<Result>(),
    [recent, setRecent] = useState<Recent[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [completed, setCompleted] = useState(false),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now());
  const generation = useRef(0),
    request = useRef<AbortController>(),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null),
    submission = useRef<{ signature: string; key: string }>();
  useDraftGuard(
    !completed &&
      (!!review ||
        !!draft.email ||
        !!draft.purpose ||
        !!draft.responseIds ||
        !!password ||
        draft.identityVerified),
    { busy, privateDraft: true, label: "Person-data privacy request" },
  );
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      request.current?.abort();
    };
    const clear = () => {
      invalidate();
      setDraft(initial);
      setPassword("");
      setConfirmation("");
      setReview(undefined);
      setResult(undefined);
      setRecent([]);
      setBusy(false);
      setError("");
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => {
      invalidate();
      window.removeEventListener("gdg:session-cleared", clear);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController(),
      current = generation.current;
    setLoading(true);
    setLoadError("");
    api<{ items: Recent[] }>("/admin/privacy", {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then((data) => {
        if (current === generation.current) setRecent(data.items);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted && current === generation.current)
          setLoadError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted && current === generation.current)
          setLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    if (result) resultHeading.current?.focus();
  }, [result]);
  useEffect(() => {
    if (!review) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [review]);
  const change = (patch: Partial<typeof initial>) => {
    setDraft((value) => ({ ...value, ...patch }));
    setReview(undefined);
    setResult(undefined);
    setConfirmation("");
    setError("");
    setCompleted(false);
    submission.current = undefined;
  };
  const reviewRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const parsed = personPrivacyReview.safeParse({
      ...draft,
      responseIds: draft.responseIds.trim()
        ? draft.responseIds.split(/[\s,]+/).filter(Boolean)
        : [],
      currentPassword: password,
    });
    if (!parsed.success) {
      setError(
        "Enter an exact email, a purpose of 20–500 characters, your current password, and attest that you independently verified the requester. Historical response IDs must be unique UUIDs (up to 20).",
      );
      return;
    }
    const controller = new AbortController(),
      current = generation.current;
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(undefined);
    try {
      const data = await api<Review>("/admin/privacy/review", {
        method: "POST",
        protected: true,
        body: parsed.data,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      if (current !== generation.current) return;
      setReview(data);
      setConfirmation("");
      submission.current = undefined;
      setRefresh((value) => value + 1);
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
  const approve = async (event: FormEvent) => {
    event.preventDefault();
    if (!review || busy) return;
    const controller = new AbortController(),
      current = generation.current;
    request.current = controller;
    const approval = {
        reviewId: review.reviewId,
        reviewToken: review.reviewToken,
        confirmation,
      },
      signature = JSON.stringify(approval);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const data = await api<Result>("/admin/privacy/commit", {
        method: "POST",
        protected: true,
        body: { ...approval, currentPassword: password },
        idempotencyKey: submission.current.key,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(20000),
        ]),
      });
      if (current !== generation.current) return;
      if (data.export) {
        const objectUrl = URL.createObjectURL(
          new Blob(
            [
              JSON.stringify(
                {
                  format: "gdg-person-public-workflows-v1",
                  generatedAt: new Date().toISOString(),
                  records: data.export,
                },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
        );
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = `privacy-export-${review.reviewId}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      // Do not retain a full answer export in React state after handing it off.
      const { export: ignored, ...summary } = data;
      void ignored;
      setResult(summary);
      setReview(undefined);
      setConfirmation("");
      setCompleted(true);
      setRefresh((value) => value + 1);
    } catch (e) {
      if (current === generation.current && !controller.signal.aborted) {
        setError((e as Error).message);
        if (
          e instanceof ApiFailure &&
          [
            "PRIVACY_REVIEW_REQUIRED",
            "PRIVACY_REVIEW_CHANGED",
            "RETENTION_HOLD",
          ].includes(e.code)
        )
          setReview(undefined);
      }
    } finally {
      if (current === generation.current) {
        setPassword("");
        setBusy(false);
      }
    }
  };
  const expected = review
      ? privacyConfirmation(review.action, review.count)
      : "",
    expired = !!review && new Date(review.expiresAt).getTime() <= now;
  return (
    <div className="gt-admin-page gt-privacy-workspace" aria-busy={busy}>
      <header className="gt-admin-page-heading">
        <div>
          <h1>Person-data privacy</h1>
          <p>
            Review one independently verified request. Export or remove
            public-workflow records without bypassing holds or audit retention.
          </p>
        </div>
        <Badge tone="coral">Super Admin only</Badge>
      </header>
      <section
        className="gt-panel gt-form"
        aria-labelledby="privacy-scope-heading"
      >
        <h2 id="privacy-scope-heading">Scope and safeguards</h2>
        <p>
          Matches exact email in event registrations, newsletter, contact
          inquiries, declared or verified Forms identities, private
          drafts/access and device reminders. Entered email alone is not proof
          of identity. Historical Forms without identity need independently
          verified response IDs; arbitrary answer-text matches are never used.
        </p>
        <p className="gt-helper">
          Finance records/files, audit/security retention, officer accounts,
          private collaboration and aggregated analytics are not erased here.
          Delivered emails and downloaded copies cannot be recalled. Redaction
          removes the complete answer/message payload, not merely name fields.
          Both redaction and deletion retain identifier-only tombstones where
          required.
        </p>
        <p className="gt-helper">
          Maximum 500 primary records per review. No data changes happen when
          generating a review. No mail is sent or subscriber consent activated.
          New records created after review may require another request.
        </p>
      </section>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {result && (
        <section
          className="gt-panel gt-form"
          aria-labelledby="privacy-result-heading"
        >
          <h2 id="privacy-result-heading" tabIndex={-1} ref={resultHeading}>
            {result.action === "export"
              ? "Export prepared"
              : "Reviewed records processed"}
          </h2>
          <p>
            {result.count} primary records.{" "}
            {result.action === "export"
              ? "The JSON download contains only the selected person's data, with sensitive Forms answers masked unless explicitly requested. Keep the file private."
              : `${result.pendingFiles || 0} files and ${result.pendingExports || 0} generated exports await physical cleanup. ${result.remainingMatches || 0} current exact-email matches remain.`}
          </p>
          {result.action !== "export" && (
            <p className="gt-helper">
              This is not a blanket erasure certificate. Retained record classes
              and previously delivered/downloaded copies remain. Refresh cleanup
              status below until queued private bytes have been removed.
            </p>
          )}
        </section>
      )}
      <form className="gt-panel gt-form" onSubmit={reviewRequest}>
        <h2>1. Verify the requester and review scope</h2>
        <fieldset className="gt-form" disabled={busy}>
          <div className="gt-form-grid">
            <Field label="Exact requester email">
              <input
                type="email"
                required
                autoComplete="off"
                maxLength={254}
                value={draft.email}
                onChange={(e) => change({ email: e.target.value })}
              />
            </Field>
            <Field label="Requested action">
              <select
                value={draft.action}
                onChange={(e) =>
                  change({ action: e.target.value, includeSensitive: false })
                }
              >
                <option value="export">Export public-workflow data</option>
                <option value="redact">
                  Redact identity and complete content
                </option>
                <option value="delete">Delete public-workflow content</option>
              </select>
            </Field>
          </div>
          <Field
            label="Request purpose"
            hint="20–500 characters. Only a purpose fingerprint is retained in the audit."
          >
            <textarea
              required
              minLength={20}
              maxLength={500}
              rows={3}
              value={draft.purpose}
              onChange={(e) => change({ purpose: e.target.value })}
            />
          </Field>
          <details>
            <summary>Historical Forms with no captured identity</summary>
            <p className="gt-helper">
              Only supply response IDs whose ownership you independently
              verified. New identified responses cannot be substituted for
              another email's records. Up to 20 UUIDs, separated by commas or
              spaces.
            </p>
            <Field label="Independently verified historical response IDs">
              <textarea
                rows={3}
                value={draft.responseIds}
                onChange={(e) => change({ responseIds: e.target.value })}
              />
            </Field>
          </details>
          <label className="gt-check">
            <input
              type="checkbox"
              checked={draft.identityVerified}
              onChange={(e) => change({ identityVerified: e.target.checked })}
            />
            I independently verified the requester’s identity and ownership of
            any supplied historical responses.
          </label>
          {draft.action === "export" && (
            <label className="gt-check">
              <input
                type="checkbox"
                checked={draft.includeSensitive}
                onChange={(e) => change({ includeSensitive: e.target.checked })}
              />
              Include this person's sensitive Forms answers in the private
              export.
            </label>
          )}
          {!review && (
            <Field label="Current password for scope review">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <Button
            type="submit"
            disabled={busy || !!review || !password || !draft.identityVerified}
          >
            {busy && !review
              ? "Checking scope…"
              : "Generate exact record review"}
          </Button>
        </fieldset>
      </form>
      {review && (
        <form className="gt-panel gt-form" onSubmit={approve}>
          <h2 ref={reviewHeading} tabIndex={-1}>
            2. Inspect the exact record review
          </h2>
          <p>
            <strong>{draft.email}</strong> · {review.count} primary records ·{" "}
            {review.heldCount} held. Expires{" "}
            {new Date(review.expiresAt).toLocaleTimeString()}.
          </p>
          {review.heldCount > 0 && (
            <p role="status">
              Holds are preserved. Export remains available, but this erasure
              request cannot proceed while any reviewed record is held. Hold
              release is a separate authorized workflow.
            </p>
          )}
          {expired && (
            <p role="alert">
              This review expired. Generate a fresh review; no records have
              changed.
            </p>
          )}
          {review.records.length ? (
            <div className="gt-table-wrap">
              <table className="gt-data-table">
                <thead>
                  <tr>
                    <th>Workflow</th>
                    <th>Context</th>
                    <th>Record ID</th>
                    <th>Identity source</th>
                    <th>Hold</th>
                  </tr>
                </thead>
                <tbody>
                  {review.records.map((row) => (
                    <tr key={`${row.kind}:${row.id}`}>
                      <td>{labels[row.kind] || row.kind}</td>
                      <td>{row.label}</td>
                      <td>{row.id}</td>
                      <td>
                        {row.source === "self_reported"
                          ? "Entered · unverified"
                          : row.source === "legacy_unknown"
                            ? "Historical ownership attested"
                            : row.source.replace(/_/g, " ")}
                      </td>
                      <td>{row.held ? "Held" : "Not held"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              No attributable public-workflow records match. Historical
              anonymous answers cannot be discovered reliably from an arbitrary
              email string.
            </p>
          )}
          <p className="gt-helper">
            File contents and private download/access links are not included in
            an export. Erasure cancels matching queued sends and invalidates
            generated response exports; physical file cleanup is tracked
            separately. An in-flight or already delivered copy cannot be
            recalled.
          </p>
          <fieldset
            className="gt-form"
            disabled={
              busy ||
              expired ||
              (review.action !== "export" &&
                (review.heldCount > 0 || review.count === 0))
            }
          >
            <Field
              label="Privacy action confirmation"
              hint={`Type ${expected}`}
            >
              <input
                autoComplete="off"
                spellCheck={false}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </Field>
            <Field label="Current password for final approval">
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <div className="gt-actions">
              <Button
                type="submit"
                variant={review.action === "export" ? "primary" : "secondary"}
                disabled={busy || !password || confirmation !== expected}
              >
                {busy
                  ? "Processing…"
                  : review.action === "export"
                    ? "Download reviewed JSON"
                    : `Confirm ${review.action}`}
              </Button>
            </div>
          </fieldset>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setReview(undefined);
              setPassword("");
              setConfirmation("");
            }}
          >
            Back to scope
          </Button>
        </form>
      )}
      <section
        className="gt-panel gt-form"
        aria-labelledby="privacy-recent-heading"
      >
        <div className="gt-panel-heading">
          <h2 id="privacy-recent-heading">Recent privacy requests</h2>
          <Button
            variant="secondary"
            disabled={busy || loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Refresh cleanup status
          </Button>
        </div>
        {loading ? (
          <p role="status">Checking request and cleanup counters…</p>
        ) : loadError ? (
          <p role="alert">{loadError}</p>
        ) : recent.length ? (
          <div className="gt-table-wrap">
            <table className="gt-data-table">
              <thead>
                <tr>
                  <th>Requested</th>
                  <th>Action</th>
                  <th>Records</th>
                  <th>State</th>
                  <th>Private bytes pending</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.reviewId}>
                    <td>{new Date(row.createdAt).toLocaleString()}</td>
                    <td>{row.action}</td>
                    <td>{row.count}</td>
                    <td>
                      {row.completedAt
                        ? "Processed"
                        : new Date(row.expiresAt).getTime() <= Date.now()
                          ? "Review expired"
                          : "Not approved"}
                    </td>
                    <td>
                      {row.pendingFiles}{" "}
                      {row.pendingFiles === 1 ? "file" : "files"} ·{" "}
                      {row.pendingExports}{" "}
                      {row.pendingExports === 1 ? "export" : "exports"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No privacy requests yet">
            Start with an independently verified request. Review and approval
            are separate steps.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
