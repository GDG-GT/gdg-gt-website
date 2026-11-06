import { useEffect, useRef, useState } from "react";
import { ApiFailure } from "@/lib/api";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { usePrivateMutation } from "@/hooks/usePrivateMutation";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field } from "../primitives";
import type { PreviewForm } from "./store";
import {
  prepareLinkWrite,
  submitLinkWrite,
  validPrivateLink,
  type PrivateFormLink,
  type LinkIntent,
  type LinkAction,
} from "./form-link-api";
import FormLinkWriteRecovery from "./FormLinkWriteRecovery";
type WorkState = { dirty: boolean; busy: boolean; uncertain: boolean };
type Props = {
  form: PreviewForm;
  contextReady: boolean;
  disabled: boolean;
  onRecheck: () => void;
  onDenied: () => void;
  onStateChange: (s: WorkState) => void;
};
export default function PrivateFormLinks(props: Props) {
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0),
    [recipients, setRecipients] = useState(""),
    [days, setDays] = useState(7),
    [confirmed, setConfirmed] = useState(false),
    [review, setReview] = useState<LinkIntent>(),
    [intent, setIntent] = useState<LinkIntent>(),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [blocked, setBlocked] = useState(false),
    [recoveryBusy, setRecoveryBusy] = useState(false);
  const root = `/admin/forms/${props.form.id}/invitations`,
    read = usePrivateRead<{
      items: PrivateFormLink[];
      total: number;
      page: number;
      pageSize: number;
    }>(root + "?page=" + page, refresh),
    mutation = usePrivateMutation(root),
    { isOnline } = useOnlineStatus(),
    callbacks = useRef(props),
    fileRead = useRef(0),
    feedback = useRef<HTMLParagraphElement>(null);
  callbacks.current = props;
  const { cancel, pending } = mutation,
    items = read.data?.items || [],
    malformed =
      !!read.data &&
      (!Array.isArray(read.data.items) ||
        !read.data.items.every(validPrivateLink) ||
        !Number.isInteger(read.data.total) ||
        read.data.total < 0),
    ready = !read.loading && !read.error && !read.denied && !malformed,
    rows = malformed ? [] : items,
    busy = mutation.busy || recoveryBusy,
    dirty = !!(recipients || review || intent),
    writable =
      isOnline &&
      !busy &&
      !intent &&
      !blocked &&
      !props.disabled &&
      props.contextReady &&
      ready,
    version = props.form.versions.at(-1),
    publishedType = version?.settings.access,
    addresses = [
      ...new Set(
        recipients
          .split(/[\s,;]+/)
          .map((v) => v.trim().toLowerCase())
          .filter((v) => v && v !== "email"),
      ),
    ];
  useDraftGuard(dirty, {
    busy,
    label: intent
      ? "Unconfirmed private-link request"
      : "Private access-link proposal",
  });
  useEffect(() => {
    callbacks.current.onStateChange({ dirty, busy, uncertain });
  }, [dirty, busy, uncertain]);
  useEffect(
    () => () => {
      fileRead.current++;
    },
    [],
  );
  useEffect(() => {
    if (error || notice) feedback.current?.focus();
  }, [error, notice]);
  useEffect(() => {
    if (!isOnline && pending.current && intent) {
      cancel();
      setReview(undefined);
      setUncertain(true);
    }
  }, [isOnline, pending, intent, cancel]);
  const clearRead = read.clear;
  const block = () => {
    cancel();
    fileRead.current++;
    clearRead();
    setBlocked(true);
    setReview(undefined);
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setRecipients("");
    setConfirmed(false);
    setError("");
    setNotice("");
    callbacks.current.onDenied();
  };
  const blockRef = useRef(block);
  blockRef.current = block;
  useEffect(() => {
    if (read.denied) blockRef.current();
  }, [read.denied]);
  const reload = () => {
    if (!isOnline || pending.current) return;
    setRefresh((v) => v + 1);
  };
  const completed = () => {
    setReview(undefined);
    setIntent(undefined);
    setUncertain(false);
    setRecoveryBusy(false);
    setRecipients("");
    setConfirmed(false);
    setError("");
    clearRead();
    setRefresh((v) => v + 1);
    setNotice(
      "Private-link request confirmed. Current delivery status is being refreshed.",
    );
    callbacks.current.onRecheck();
  };
  const start = (action: LinkAction, row?: PrivateFormLink) => {
    if (!writable || pending.current) return;
    try {
      setReview(prepareLinkWrite(props.form, action, row, addresses, days));
      setError("");
      setNotice("");
      reload();
      callbacks.current.onRecheck();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const body = review ? JSON.parse(review.body) : undefined,
    selected = review?.sourceId
      ? rows.find((r) => r.id === review.sourceId)
      : undefined,
    changed =
      !!review &&
      (props.form.revision !== body.formRevision ||
        (version?.versionId || null) !== body.publishedVersionId ||
        (review.sourceId &&
          ready &&
          (!selected || selected.revision !== body.revision)) ||
        (review.action !== "revoke" && publishedType !== review.type)),
    reviewReady =
      writable &&
      !changed &&
      !!review &&
      (!body.expiresAt || Date.parse(body.expiresAt) > Date.now());
  async function submit() {
    if (!review || !reviewReady || pending.current) return;
    const original = review;
    if (
      JSON.parse(original.body).expiresAt &&
      Date.parse(JSON.parse(original.body).expiresAt) <= Date.now()
    ) {
      setError(
        "The reviewed expiry passed. Cancel and review a current request.",
      );
      return;
    }
    const controller = mutation.begin();
    if (!controller) return;
    fileRead.current++;
    setIntent(original);
    setError("");
    setNotice("");
    try {
      await submitLinkWrite(original, controller.signal);
      if (mutation.current(controller)) completed();
    } catch (e) {
      if (!mutation.current(controller)) return;
      setReview(undefined);
      if (e instanceof ApiFailure && [401, 403, 404].includes(e.status))
        block();
      else if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain(true);
      } else {
        setIntent(undefined);
        setError(
          (e as Error).message +
            " Reload the current form and links before another review.",
        );
        clearRead();
        setRefresh((v) => v + 1);
        callbacks.current.onRecheck();
      }
    } finally {
      mutation.finish(controller);
    }
  }
  if (blocked) return null;
  return (
    <section className="gt-form" aria-label="Private access links">
      <h3>Private access links</h3>
      <p>
        Invitation and unlisted links are delivered privately. Raw access tokens
        are never shown here. Replacing an unused link invalidates the old link;
        revocation prevents new submissions and retains existing responses.
      </p>
      {error && (
        <p ref={feedback} tabIndex={-1} role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {notice && (
        <p ref={feedback} tabIndex={-1} role="status">
          {notice}
        </p>
      )}
      {intent && uncertain && (
        <FormLinkWriteRecovery
          key={intent.key}
          intent={intent}
          onRecovered={completed}
          onDenied={block}
          onBusy={setRecoveryBusy}
          onAbandon={() => {
            setReview(undefined);
            setIntent(undefined);
            setUncertain(false);
            setRecoveryBusy(false);
            setRecipients("");
            setConfirmed(false);
            clearRead();
            setRefresh((v) => v + 1);
            callbacks.current.onRecheck();
            setNotice(
              "Recovery stopped. Inspect current delivery status before reviewing another private-link request.",
            );
          }}
        />
      )}
      {read.loading && (
        <div role="status" aria-label="Loading private links">
          <div className="gt-skeleton" />
          <span className="sr-only">Loading private links…</span>
        </div>
      )}
      {(read.error || malformed) && (
        <section role="alert">
          <p>
            {read.error || "The private-link inventory could not be verified."}
          </p>
          {read.at && (
            <p>
              Last successful private links read:{" "}
              <time dateTime={read.at}>
                {new Date(read.at).toLocaleString()}
              </time>
              .
            </p>
          )}
          <Button
            variant="secondary"
            disabled={!isOnline || busy || !!review}
            onClick={() => {
              reload();
              document.getElementById("workspace-content")?.focus();
            }}
          >
            Retry private links
          </Button>
        </section>
      )}
      {!isOnline && (
        <p role="status">
          Reconnect and check current status before confirming. No links are
          queued or changed automatically.
        </p>
      )}
      {["invited", "unlisted"].includes(publishedType || "") ? (
        <form
          className="gt-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              writable &&
              confirmed &&
              addresses.length >= 1 &&
              addresses.length <= 100
            )
              start("create");
          }}
        >
          <fieldset
            className="gt-form gt-access-fields"
            disabled={busy || !!review || !!intent || props.disabled}
          >
            <Field
              label="Approved recipient emails"
              hint="One per line, comma-separated, or paste an email CSV column. Maximum 100."
            >
              <textarea
                aria-label="Approved recipient emails"
                rows={5}
                value={recipients}
                maxLength={30000}
                onChange={(e) => {
                  fileRead.current++;
                  setRecipients(e.target.value);
                  setConfirmed(false);
                }}
              />
            </Field>
            <Field label="Import email CSV">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const generation = ++fileRead.current,
                    file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 32768) {
                    setError("Use an email CSV smaller than 32 KB.");
                    return;
                  }
                  try {
                    const text = await file.text();
                    if (fileRead.current !== generation) return;
                    setRecipients(text.replace(/"/g, ""));
                    setConfirmed(false);
                  } catch {
                    if (fileRead.current === generation)
                      setError(
                        "The email CSV could not be read. Try it again or enter approved addresses directly.",
                      );
                  }
                }}
              />
            </Field>
            <Field label="Expires in days">
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </Field>
            <p>
              {addresses.length} unique recipients. Existing active links are
              kept; use Resend to replace an unused link explicitly.
            </p>
            <label className="gt-check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I approve these recipients and understand that their links grant
              access to this form.
            </label>
            <Button
              disabled={
                !writable ||
                !confirmed ||
                addresses.length < 1 ||
                addresses.length > 100
              }
            >
              Review private links
            </Button>
          </fieldset>
        </form>
      ) : (
        <p>
          Publish an invitation-only or unlisted form to send private access
          links. Verified-email forms deliver links when respondents request
          verification.
        </p>
      )}
      <Button
        variant="secondary"
        disabled={!isOnline || busy || !!review || read.loading}
        onClick={() => {
          reload();
          document.getElementById("workspace-content")?.focus();
        }}
      >
        Refresh delivery status
      </Button>
      {rows.length ? (
        <div
          className="gt-table-wrap"
          role="region"
          aria-label="Private link delivery records"
          tabIndex={0}
        >
          <table className="gt-data-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Delivery</th>
                <th>Response</th>
                <th>Expiry</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.recipientHint}</td>
                  <td>{row.revoked_at ? "Revoked" : row.delivery_state}</td>
                  <td>{row.responded ? "Responded" : "Not yet"}</td>
                  <td>{new Date(row.expires_at).toLocaleString()}</td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={
                        !writable ||
                        !!review ||
                        row.token_type === "verified" ||
                        row.responded ||
                        !!row.revoked_at ||
                        props.form.status === "Archived" ||
                        publishedType !== row.token_type ||
                        (!!row.last_sent_at &&
                          Date.parse(row.last_sent_at) + 60000 > Date.now())
                      }
                      onClick={() => start("resend", row)}
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={
                        !writable ||
                        !!review ||
                        row.token_type === "verified" ||
                        !!row.revoked_at
                      }
                      onClick={() => start("revoke", row)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : ready ? (
        <p>No private links have been issued.</p>
      ) : null}
      <div className="gt-actions" aria-label="Private link pages">
        <Button
          variant="ghost"
          disabled={page === 1 || busy || !!review || !!intent || !ready}
          onClick={() => setPage((v) => v - 1)}
        >
          Previous
        </Button>
        <span>
          Page {page} · {read.data?.total || 0} private links
        </span>
        <Button
          variant="ghost"
          disabled={
            page * 30 >= (read.data?.total || 0) ||
            busy ||
            !!review ||
            !!intent ||
            !ready
          }
          onClick={() => setPage((v) => v + 1)}
        >
          Next
        </Button>
      </div>
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !pending.current) setReview(undefined);
        }}
      >
        <DialogContent
          className="gt-notification-dialog"
          closeDisabled={busy}
          onEscapeKeyDown={(e) => {
            if (pending.current) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (pending.current) e.preventDefault();
          }}
        >
          <DialogTitle>
            {review?.action === "create"
              ? "Queue private access links?"
              : review?.action === "resend"
                ? "Replace access link?"
                : "Revoke access link?"}
          </DialogTitle>
          <DialogDescription>
            {review?.action === "create"
              ? "Deliver private access only to the approved audience below. Existing active links stay as they are."
              : review?.action === "resend"
                ? "Invalidate the unused old link and deliver its replacement to the same approved recipient."
                : "Invalidate this private link for new submissions. Existing responses are retained."}
          </DialogDescription>
          <p>
            <strong>{props.form.title}</strong>
            {review?.sourceId ? " · " + review.label : ""}
          </p>
          <p>
            Reviewed form revision {body?.formRevision}
            {review?.sourceId ? `; link revision ${body?.revision}` : ""}.
          </p>
          {review?.action === "create" && (
            <>
              <p>{body.recipients.length} approved recipients:</p>
              <ul>
                {body.recipients.map((address: string) => (
                  <li key={address}>{address}</li>
                ))}
              </ul>
            </>
          )}
          {body?.expiresAt && (
            <p>Fixed expiry: {new Date(body.expiresAt).toLocaleString()}.</p>
          )}
          {changed && (
            <p role="alert">
              The form, publication or selected link changed. Cancel and review
              its current state.
            </p>
          )}
          {(!props.contextReady || !ready) && (
            <p role="status">
              Checking the current form and private-link inventory before
              confirmation…
            </p>
          )}
          {!isOnline && (
            <p role="status">Reconnect and recheck before confirming.</p>
          )}
          <div className="gt-inline-actions">
            <Button
              variant={review?.action === "revoke" ? "danger" : "primary"}
              disabled={!reviewReady}
              onClick={() => void submit()}
            >
              {busy
                ? "Saving…"
                : review?.action === "create"
                  ? "Queue approved private links"
                  : review?.action === "resend"
                    ? "Replace access link"
                    : "Revoke access link"}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Cancel review
            </Button>
            <Button
              variant="ghost"
              disabled={!isOnline || busy || read.loading}
              onClick={() => {
                reload();
                callbacks.current.onRecheck();
              }}
            >
              Recheck review
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
