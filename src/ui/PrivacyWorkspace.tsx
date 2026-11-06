import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type FormEvent,
} from "react";
import { ApiFailure } from "@/lib/api";
import { useAdmin } from "@/contexts/AdminContext";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ScrollableTable from "./ScrollableTable";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Badge, Button, EmptyState, Field } from "./primitives";
import {
  personPrivacyReview,
  privacyConfirmation,
} from "../../shared/privacy.mjs";

import PrivacyWriteRecovery from "./privacy/PrivacyWriteRecovery";
import {
  privacyIntent,
  submitPrivacyWrite,
  type PrivacyIntent,
  type PrivacyReceipt,
  type PrivacyReview as Review,
  type PrivacyResult as Result,
} from "./privacy/privacy-write";

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
  const { currentAdmin } = useAdmin(),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const clear = () => setEpoch((v) => v + 1);
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  return (
    <PrivacyRequests
      key={JSON.stringify([currentAdmin?.id, currentAdmin?.role, epoch])}
    />
  );
}
function PrivacyRequests() {
  const [draft, setDraft] = useState(initial),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [review, setReview] = useState<Review>(),
    [result, setResult] = useState<Result>(),
    [denied, setDenied] = useState(false),
    [needsRecheck, setNeedsRecheck] = useState(!navigator.onLine),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [completed, setCompleted] = useState(false),
    [refresh, setRefresh] = useState(0),
    [now, setNow] = useState(Date.now()),
    [uncertain, setUncertain] = useState<PrivacyIntent>(),
    [recoveryBusy, setRecoveryBusy] = useState(false),
    [download, setDownload] = useState<{ url: string; reviewId: string }>();
  const activeWrite = useRef<{
      intent: PrivacyIntent;
      controller: AbortController;
    }>(),
    mounted = useRef(true),
    downloadRef = useRef<string>();
  const generation = useRef(0),
    reviewHeading = useRef<HTMLHeadingElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null);
  const { isOnline } = useOnlineStatus(),
    safety = useNavigationSafety(),
    recentRead = usePrivateRead<{ items: Recent[] }>(
      denied ? undefined : "/admin/privacy",
      refresh,
    ),
    clearRecent = recentRead.clear;
  const malformed =
      recentRead.data !== undefined &&
      (!recentRead.data ||
        !Array.isArray(recentRead.data.items) ||
        !recentRead.data.items.every(
          (row) =>
            !!row &&
            typeof row.reviewId === "string" &&
            ["export", "redact", "delete"].includes(row.action) &&
            Number.isInteger(row.count) &&
            row.count >= 0 &&
            typeof row.createdAt === "string" &&
            typeof row.expiresAt === "string" &&
            (row.completedAt === null || typeof row.completedAt === "string") &&
            Number.isInteger(row.pendingFiles) &&
            row.pendingFiles >= 0 &&
            Number.isInteger(row.pendingExports) &&
            row.pendingExports >= 0,
        )),
    recent = malformed ? [] : recentRead.data?.items || [],
    loading = recentRead.loading,
    loadError = malformed
      ? "The current privacy request reply could not be verified. Retry this read."
      : recentRead.error,
    unavailable =
      denied ||
      !isOnline ||
      needsRecheck ||
      loading ||
      !!loadError ||
      !recentRead.data;
  const clearPrivate = useCallback(() => {
    generation.current++;
    clearRecent();
    setDraft(initial);
    setPassword("");
    setConfirmation("");
    setReview(undefined);
    setResult(undefined);
    setBusy(false);
    setError("");
    setCompleted(false);
    setUncertain(undefined);
    setRecoveryBusy(false);
    activeWrite.current?.controller.abort();
    activeWrite.current = undefined;
    if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
    downloadRef.current = undefined;
    setDownload(undefined);
  }, [clearRecent]);
  useEffect(() => {
    if (recentRead.denied) {
      clearPrivate();
      setDenied(true);
    }
  }, [recentRead.denied, clearPrivate]);
  useEffect(() => {
    if (!isOnline) {
      setNeedsRecheck(true);
      if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
      downloadRef.current = undefined;
      setDownload(undefined);
    }
  }, [isOnline]);
  const refreshStatus = () => {
    if (busy || uncertain || !navigator.onLine) return;
    setDenied(false);
    setNeedsRecheck(false);
    setRefresh((v) => v + 1);
  };
  const rejectPrivate = (error: unknown) => {
    if (
      error instanceof ApiFailure &&
      (error.status === 401 ||
        error.status === 404 ||
        (error.status === 403 && error.code === "FORBIDDEN"))
    ) {
      clearPrivate();
      setDenied(true);
      return true;
    }
    return false;
  };
  useDraftGuard(
    !completed &&
      (!!review ||
        !!draft.email ||
        !!draft.purpose ||
        !!draft.responseIds ||
        !!password ||
        draft.identityVerified),
    {
      busy: busy || recoveryBusy || !!uncertain,
      privateDraft: true,
      label: "Person-data privacy request",
    },
  );
  useEffect(() => {
    const invalidate = () => {
      generation.current++;
      activeWrite.current?.controller.abort();
      mounted.current = false;
      if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
    };
    return invalidate;
  }, []);
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
  useEffect(() => {
    mounted.current = true;
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
    return () => {
      mounted.current = false;
      activeWrite.current?.controller.abort();
      window.removeEventListener("offline", offline);
    };
  }, []);
  const dropDownload = () => {
    if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
    downloadRef.current = undefined;
    setDownload(undefined);
  };
  const change = (patch: Partial<typeof initial>) => {
    if (uncertain || busy) return;
    dropDownload();
    setDraft((value) => ({ ...value, ...patch }));
    setReview(undefined);
    setResult(undefined);
    setConfirmation("");
    setError("");
    setCompleted(false);
  };
  function confirmed(intent: PrivacyIntent, data: PrivacyReceipt) {
    setUncertain(undefined);
    setPassword("");
    setConfirmation("");
    if (intent.action === "review") {
      setReview(data as Review);
      setRefresh((v) => v + 1);
      return;
    }
    const value = data as Result;
    dropDownload();
    if (Array.isArray(value.export)) {
      const url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              {
                format: "gdg-person-public-workflows-v1",
                generatedAt: new Date().toISOString(),
                records: value.export,
              },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
      downloadRef.current = url;
      setDownload({ url, reviewId: JSON.parse(intent.body).reviewId });
    }
    const { export: privateBytes, ...summary } = value;
    void privateBytes;
    setResult(summary);
    setReview(undefined);
    setCompleted(true);
    setRefresh((v) => v + 1);
  }
  async function saveOriginal(intent: PrivacyIntent, proof: string) {
    if (activeWrite.current || !navigator.onLine) return;
    const controller = new AbortController();
    activeWrite.current = { intent, controller };
    setBusy(true);
    setError("");
    setPassword("");
    dropDownload();
    try {
      const data = await submitPrivacyWrite(
        intent,
        AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        proof,
      );
      if (mounted.current && !controller.signal.aborted)
        confirmed(intent, data);
    } catch (e) {
      if (!mounted.current || controller.signal.aborted) return;
      if (rejectPrivate(e)) return;
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(intent);
        return;
      }
      setError(e.message);
      if (
        [
          "PRIVACY_REVIEW_REQUIRED",
          "PRIVACY_REVIEW_CHANGED",
          "RETENTION_HOLD",
        ].includes(e.code)
      )
        setReview(undefined);
    } finally {
      if (activeWrite.current?.intent === intent)
        activeWrite.current = undefined;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }
  const reviewRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || unavailable) return;
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
    const { currentPassword, ...document } = parsed.data;
    setResult(undefined);
    await saveOriginal(
      privacyIntent("review", document, document.action),
      currentPassword,
    );
  };
  const approve = async (event: FormEvent) => {
    event.preventDefault();
    if (!review || busy || uncertain || unavailable) return;
    await saveOriginal(
      privacyIntent(
        "commit",
        {
          reviewId: review.reviewId,
          reviewToken: review.reviewToken,
          confirmation,
        },
        review.action,
        review.count,
      ),
      password,
    );
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
      {denied && (
        <div role="alert" className="gt-form-error">
          <p>
            Person-data privacy access could not be verified. Private scope,
            reviews and cleanup counters have been cleared. Recheck current
            access to continue.
          </p>
        </div>
      )}
      {(!isOnline || needsRecheck) && (
        <p role="status">
          Privacy actions are paused.{" "}
          {!isOnline ? "You’re offline." : "Connection restored."} Explicitly
          recheck cleanup status before continuing.
        </p>
      )}
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {uncertain && (
        <PrivacyWriteRecovery
          intent={uncertain}
          onConfirmed={(value) => confirmed(uncertain, value)}
          onBusy={setRecoveryBusy}
          onDenied={() => {
            clearPrivate();
            setDenied(true);
          }}
          onStop={() => {
            clearPrivate();
            setNeedsRecheck(true);
            setError(
              "Privacy recovery stopped. The original outcome remains unconfirmed. Recheck current cleanup status before preparing another request.",
            );
          }}
        />
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
              ? "The export was prepared once. Its contents are available only when a download link is shown below. A lost reply cannot replay private export contents; prepare a separately reviewed request if another export is needed."
              : `${result.pendingFiles || 0} files and ${result.pendingExports || 0} generated exports await physical cleanup. ${result.remainingMatches || 0} current exact-email matches remain.`}
          </p>
          {download && (
            <div className="gt-button-row">
              <a
                className="gt-button gt-button-primary"
                href={download.url}
                download={`privacy-export-${download.reviewId}.json`}
              >
                Download prepared privacy export
              </a>
              <Button type="button" variant="secondary" onClick={dropDownload}>
                Clear prepared export
              </Button>
            </div>
          )}
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
        <fieldset
          className="gt-form"
          disabled={busy || recoveryBusy || !!uncertain || unavailable}
        >
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
            disabled={
              busy ||
              recoveryBusy ||
              !!uncertain ||
              unavailable ||
              !!review ||
              !password ||
              !draft.identityVerified
            }
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
              This review expired. Check any unconfirmed original outcome before
              preparing a fresh record review.
            </p>
          )}
          {review.records.length ? (
            <ScrollableTable
              className="gt-table-wrap"
              label="Reviewed privacy records"
            >
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
            </ScrollableTable>
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
              recoveryBusy ||
              !!uncertain ||
              unavailable ||
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
                disabled={
                  busy ||
                  recoveryBusy ||
                  !!uncertain ||
                  unavailable ||
                  !password ||
                  confirmation !== expected
                }
              >
                {busy
                  ? "Processing…"
                  : review.action === "export"
                    ? "Prepare reviewed JSON"
                    : `Confirm ${review.action}`}
              </Button>
            </div>
          </fieldset>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || recoveryBusy || !!uncertain}
            onClick={() =>
              safety.request(() => {
                setReview(undefined);
                setPassword("");
                setConfirmation("");
              })
            }
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
            disabled={busy || recoveryBusy || !!uncertain || !isOnline}
            onClick={refreshStatus}
          >
            Refresh cleanup status
          </Button>
        </div>
        {loading && !recentRead.data && (
          <div role="status" aria-label="Loading privacy cleanup status">
            <div className="gt-skeleton gt-detail-skeleton" />
            <span className="sr-only">
              Checking request and cleanup counters…
            </span>
          </div>
        )}
        {!denied && (loadError || (!isOnline && recentRead.at)) && (
          <div role={loadError ? "alert" : "status"} className="gt-form-error">
            {loadError && <p>{loadError}</p>}
            {recentRead.at && (
              <p>
                Showing cleanup status from{" "}
                <time dateTime={recentRead.at}>
                  {new Date(recentRead.at).toLocaleString()}
                </time>
                . Counters may be out of date.
              </p>
            )}
            {loadError && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !isOnline || loading}
                onClick={refreshStatus}
              >
                Retry privacy cleanup status
              </Button>
            )}
          </div>
        )}
        {recent.length ? (
          <ScrollableTable
            className="gt-table-wrap"
            label="Privacy cleanup request table"
          >
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
          </ScrollableTable>
        ) : !loading && !loadError && !denied ? (
          <EmptyState title="No privacy requests yet">
            Start with an independently verified request. Review and approval
            are separate steps.
          </EmptyState>
        ) : null}
      </section>
    </div>
  );
}
