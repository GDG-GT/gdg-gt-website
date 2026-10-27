import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import {
  newsletterCampaign,
  newsletterTemplate,
  subscriberCreate,
} from "../../../shared/newsletter.mjs";
import { Button, Badge, Field } from "../primitives";
import FormIntegrations from "../forms/FormIntegrations";
import NewsletterSend from "./NewsletterSend";
import {
  date,
  useNewsletterWork,
  type Kind,
  type Listing,
  type NewsletterRecord,
  type Delivery,
} from "./types";
function RecipientPicker({
  team,
  selected,
  onChange,
  disabled,
}: {
  team: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [q, setQ] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [tick, setTick] = useState(0);
  const read = usePrivateRead<Listing>(
    "/admin/newsletter/subscribers?" +
      new URLSearchParams({
        team,
        q: search,
        status: "active",
        page: String(page),
      }),
    tick,
  );
  const list = read.data,
    error = read.error;
  return (
    <fieldset className="gt-newsletter-audience" disabled={disabled}>
      <legend>Custom confirmed audience · {selected.length} selected</legend>
      <div className="gt-inline-actions">
        <Field label="Find confirmed subscribers">
          <input
            value={q}
            maxLength={100}
            onChange={(e) => setQ(e.target.value)}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setSearch(q);
            setPage(1);
          }}
        >
          Find subscribers
        </Button>
        <Button type="button" variant="ghost" onClick={() => onChange([])}>
          Clear selected
        </Button>
      </div>
      {error && (
        <p role="alert">
          {error}{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setTick((v) => v + 1)}
          >
            Retry confirmed subscribers
          </Button>
        </p>
      )}
      {!list ? (
        <p role="status">
          {error
            ? "Confirmed subscribers are unavailable. Retry to select recipients."
            : "Loading confirmed subscribers…"}
        </p>
      ) : (
        <>
          <ul className="gt-newsletter-recipient-list">
            {list.items.map((s) => (
              <li key={s.id}>
                <label className="gt-check">
                  <input
                    type="checkbox"
                    checked={selected.includes(s.id)}
                    disabled={
                      !!s.suppressedAt ||
                      (!selected.includes(s.id) && selected.length >= 1000)
                    }
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...selected, s.id]
                          : selected.filter((id) => id !== s.id),
                      )
                    }
                  />
                  <span>
                    {s.email}
                    {s.name && ` · ${s.name}`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!list.items.length && (
            <p>
              No matching confirmed subscribers. A new address must complete
              double opt-in before it can be selected.
            </p>
          )}
          <div className="gt-inline-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous recipients
            </Button>
            <span>
              Page {page} · {list.total} matching
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={page * list.pageSize >= list.total}
              onClick={() => setPage((n) => n + 1)}
            >
              Next recipients
            </Button>
          </div>
        </>
      )}
      <p className="gt-helper">
        Selections persist across search pages. Maximum 1,000; only current
        confirmed, unsuppressed subscribers are included at review.
      </p>
    </fieldset>
  );
}
function DeliveryStatus({ record }: { record: NewsletterRecord }) {
  const [page, setPage] = useState(1),
    [tick, setTick] = useState(0);
  const read = usePrivateRead<Delivery>(
    `/admin/newsletter/campaigns/${record.id}/delivery?page=${page}`,
    tick,
  );
  const result = read.data,
    error = read.error;
  return (
    <section
      className="gt-newsletter-delivery"
      aria-label="Campaign delivery results"
    >
      <div className="gt-inline-actions">
        <h3>Delivery results</h3>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setTick((n) => n + 1)}
        >
          Refresh results
        </Button>
      </div>
      <p className="gt-helper">
        “Accepted” means handed to the mail provider, not inbox delivery.
        Delivered, bounce, open and click results require verified provider
        callbacks; email clients can block or prefetch tracking.
      </p>
      {error && <p role="alert">{error}</p>}
      {result && (error || read.loading) && (
        <p role="status">
          Delivery results may be out of date. Last loaded{" "}
          {new Date(read.at!).toLocaleString()}.
        </p>
      )}
      {!result ? (
        <p role="status">
          {error
            ? "Delivery results are unavailable. Use Refresh results to retry."
            : "Loading results…"}
        </p>
      ) : (
        <>
          <dl className="gt-newsletter-counts">
            {Object.entries(result.counts).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="gt-table-wrap">
            <table className="gt-table">
              <caption className="sr-only">
                Frozen audience delivery results
              </caption>
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Queue state</th>
                  <th scope="col">Provider result</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      {r.email || "Identity removed by retention"}
                    </th>
                    <td>
                      {r.state === "sent" ? "Accepted" : r.state}
                      {r.error_code && <small>{r.error_code}</small>}
                    </td>
                    <td>
                      {r.provider_state?.replace(/^email\./, "") ||
                        "Not reported"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="gt-inline-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={page === 1}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous results
            </Button>
            <span>Page {page}</span>
            <Button
              type="button"
              variant="secondary"
              disabled={page * 50 >= result.total}
              onClick={() => setPage((n) => n + 1)}
            >
              Next results
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export default function NewsletterEditor({
  kind,
  record,
  scope,
  onSaved,
  onClose,
  unavailable = false,
  onRefresh,
}: {
  kind: Kind;
  record?: NewsletterRecord;
  scope: string;
  onSaved: (message: string, id?: string) => void;
  onClose: () => void;
  unavailable?: boolean;
  onRefresh?: () => void;
}) {
  const initial = useRef({
    name: record?.name || "",
    email: record?.email || "",
    description: record?.description || "",
    subject: record?.subject || "",
    content: record?.content || "",
    audience: record?.audience || "all",
    recipientIds: record?.recipientIds || [],
    consent: false,
  }).current;
  const originalRevision = useRef(record?.revision).current;
  const [draft, setDraft] = useState(initial),
    [action, setAction] = useState<string>(),
    [preview, setPreview] = useState<{ html: string }>(),
    [templates, setTemplates] = useState<Listing>(),
    [templateQuery, setTemplateQuery] = useState(""),
    [conflict, setConflict] = useState(false),
    [deliveryLocked, setDeliveryLocked] = useState(false),
    [deliveryPending, setDeliveryPending] = useState(false);
  const lockDelivery = useCallback((locked: boolean, pending: boolean) => {
    setDeliveryLocked(locked);
    setDeliveryPending(pending);
  }, []);
  const {
      busy: working,
      error,
      setError,
      work,
      pending,
    } = useNewsletterWork(kind + ":" + (record?.id || scope)),
    safety = useNavigationSafety(),
    attempt = useRef<{ signature: string; key: string }>(),
    errorFocus = useRef<HTMLParagraphElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const busy = working || deliveryLocked,
    { isOnline } = useOnlineStatus(),
    stale = record?.revision !== originalRevision,
    blocked = unavailable || stale || conflict || !isOnline;
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial),
    editable =
      !record ||
      (!record.deletedAt &&
        record.actions.includes("update") &&
        (kind !== "campaigns" || record.status === "draft"));
  const path = "/admin/newsletter/" + kind + (record ? "/" + record.id : ""),
    team = record ? record.teamId || "chapter" : scope;
  async function request<T>(
    signal: AbortSignal,
    body: unknown,
    idempotencyKey: string,
  ) {
    try {
      return await api<T>(path, {
        method: "POST",
        body,
        signal,
        idempotencyKey,
      });
    } catch (error) {
      if (
        !signal.aborted &&
        error instanceof ApiFailure &&
        error.status === 409
      )
        setConflict(true);
      throw error;
    }
  }
  useDraftGuard(dirty || !!action, {
    busy: working || deliveryPending,
    label: `Newsletter ${kind} changes`,
  });
  const discard = (run: () => void) => {
    if (!busy) {
      if (safety) safety.request(run);
      else run();
    }
  };
  useEffect(() => {
    const clear = () => {
      setDraft({
        audience: "all",
        consent: false,
        name: "",
        email: "",
        content: "",
        subject: "",
        description: "",
        recipientIds: [],
      });
      setAction(undefined);
      setPreview(undefined);
      setTemplates(undefined);
    };
    window.addEventListener("gdg:session-cleared", clear);
    return () => window.removeEventListener("gdg:session-cleared", clear);
  }, []);
  const save = async () => {
    if (pending.current || busy || blocked || !editable) return;
    let body: unknown;
    if (kind === "subscribers") {
      body = record
        ? { action: "update", revision: record.revision, name: draft.name }
        : {
            teamId: team === "chapter" ? null : team,
            email: draft.email,
            name: draft.name,
            consentAcknowledged: draft.consent,
          };
      if (!record && !subscriberCreate.safeParse(body).success) {
        setError(
          "Enter a valid email and acknowledge the subscriber’s request. Confirmation is still required.",
        );
        return;
      }
    } else {
      const value =
        kind === "templates"
          ? {
              name: draft.name,
              description: draft.description,
              content: draft.content,
            }
          : {
              subject: draft.subject,
              content: draft.content,
              audience: draft.audience,
              recipientIds: draft.audience === "all" ? [] : draft.recipientIds,
            };
      const parsed = (
        kind === "templates" ? newsletterTemplate : newsletterCampaign
      ).safeParse(value);
      if (!parsed.success) {
        setError(
          "Complete the required fields and choose 1–1,000 confirmed recipients for a custom audience. Raw HTML and subject control characters are not allowed.",
        );
        return;
      }
      body = record
        ? { action: "update", revision: record.revision, record: parsed.data }
        : { teamId: team === "chapter" ? null : team, record: parsed.data };
    }
    const signature = JSON.stringify(body);
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    const idempotencyKey = attempt.current.key;
    await work(
      (signal) => request<{ id?: string }>(signal, body, idempotencyKey),
      (r) =>
        onSaved(
          kind === "subscribers" && !record
            ? "Request accepted. A new address must confirm its email before receiving campaigns; existing subscription state was not changed."
            : "Saved newsletter changes.",
          r.id,
        ),
    );
  };
  const mutate = async (name: string) => {
    if (
      !record ||
      busy ||
      pending.current ||
      blocked ||
      !record.actions.includes(name === "duplicate" ? "create" : "delete")
    )
      return;
    if (
      name === "duplicate"
        ? kind !== "campaigns" || !!record.deletedAt
        : name === "restore"
          ? !record.deletedAt
          : !!record.deletedAt ||
            (kind === "campaigns" &&
              ["scheduled", "sending"].includes(record.status || ""))
    )
      return;
    const signature = name + record.id + record.revision;
    if (attempt.current?.signature !== signature)
      attempt.current = { signature, key: crypto.randomUUID() };
    const idempotencyKey = attempt.current.key;
    await work(
      (signal) =>
        request<{ id: string }>(
          signal,
          { action: name, revision: record.revision },
          idempotencyKey,
        ),
      (r) =>
        onSaved(
          name === "restore" && kind === "subscribers"
            ? "Subscriber restored as unsubscribed. Restoration does not create consent."
            : name === "duplicate"
              ? "Created a new private campaign draft."
              : `Newsletter record ${name === "archive" ? "archived" : name === "restore" ? "restored" : "deactivated"}.`,
          name === "duplicate" ? r.id : undefined,
        ),
    );
  };
  return (
    <section
      className="gt-panel gt-newsletter-editor"
      aria-label="Newsletter record editor"
    >
      <header className="gt-panel-heading">
        <div>
          <h2 tabIndex={-1} ref={heading}>
            {record
              ? kind === "subscribers"
                ? record.email
                : record.subject || record.name
              : kind === "subscribers"
                ? "Add a subscriber request"
                : kind === "templates"
                  ? "Create a reusable template"
                  : "Write a campaign"}
          </h2>
          <p className="gt-helper">
            {record
              ? `Revision ${record.revision} · updated ${date(record.updatedAt)}`
              : "Saved privately. No subscribers are contacted by saving a campaign or template."}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => discard(onClose)}
        >
          Back to list
        </Button>
        {onRefresh && (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onRefresh}
          >
            Refresh record access
          </Button>
        )}
      </header>
      {record && (
        <div className="gt-inline-actions">
          <Badge>
            {record.deletedAt
              ? "Archived"
              : record.status || record.state || "Template"}
          </Badge>
          {kind === "campaigns" && (
            <FormIntegrations
              kind="campaign"
              resourceId={record.id}
              disabled={busy || dirty}
            />
          )}
        </div>
      )}
      {error && (
        <p
          role="alert"
          tabIndex={-1}
          ref={errorFocus}
          className="gt-form-error"
        >
          {error}
        </p>
      )}
      {(stale || conflict) && (
        <p role="alert">
          This newsletter record changed. Your input is preserved. Return to the
          list and reopen before saving or sending.
        </p>
      )}
      {!isOnline && (
        <p role="status">
          You’re offline. Input stays in this tab; reconnect and save when
          ready.
        </p>
      )}
      <form
        className="gt-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="gt-newsletter-fields" disabled={busy || !editable}>
          {kind === "subscribers" ? (
            <>
              <Field label="Email address" required>
                <input
                  type="email"
                  required
                  maxLength={254}
                  value={draft.email}
                  readOnly={!!record}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Name">
                <input
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              {!record && (
                <label className="gt-check">
                  <input
                    type="checkbox"
                    required
                    checked={draft.consent}
                    onChange={(e) =>
                      setDraft({ ...draft, consent: e.target.checked })
                    }
                  />
                  <span>
                    This person requested to join this newsletter. Send double
                    opt-in, not a campaign.
                  </span>
                </label>
              )}
            </>
          ) : (
            <>
              <Field
                label={kind === "campaigns" ? "Subject" : "Template name"}
                required
              >
                <input
                  required
                  maxLength={kind === "campaigns" ? 200 : 150}
                  value={kind === "campaigns" ? draft.subject : draft.name}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [kind === "campaigns" ? "subject" : "name"]:
                        e.target.value,
                    })
                  }
                />
              </Field>
              {kind === "templates" && (
                <Field label="Description">
                  <input
                    maxLength={1000}
                    value={draft.description}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </Field>
              )}
              <Field
                label="Message"
                required
                hint="Plain text, up to 30,000 characters. Line breaks are preserved and HTTPS links become clickable. Raw HTML is displayed as text."
              >
                <textarea
                  required
                  rows={12}
                  maxLength={30000}
                  value={draft.content}
                  onChange={(e) =>
                    setDraft({ ...draft, content: e.target.value })
                  }
                />
              </Field>
              {kind === "campaigns" && (
                <Field label="Audience">
                  <select
                    value={draft.audience}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        audience: e.target.value as "all" | "custom",
                      })
                    }
                  >
                    <option value="all">
                      All confirmed subscribers in this scope
                    </option>
                    <option value="custom">Choose confirmed subscribers</option>
                  </select>
                </Field>
              )}
            </>
          )}
        </fieldset>
        {editable && kind === "campaigns" && draft.audience === "custom" && (
          <RecipientPicker
            team={team}
            selected={draft.recipientIds}
            onChange={(ids) => setDraft({ ...draft, recipientIds: ids })}
            disabled={busy}
          />
        )}
        {editable && (
          <div className="gt-inline-actions">
            <Button disabled={busy || blocked || (!!record && !dirty)}>
              {busy
                ? "Working…"
                : !record && kind === "subscribers"
                  ? "Send confirmation request"
                  : "Save private changes"}
            </Button>
            <span className="gt-helper">
              {dirty ? "Unsaved changes" : record ? "Saved" : "New record"}
            </span>
          </div>
        )}
      </form>
      {kind === "subscribers" && record && (
        <dl className="gt-newsletter-facts">
          <dt>Confirmed</dt>
          <dd>{date(record.confirmedAt)}</dd>
          <dt>Consent requested</dt>
          <dd>{date(record.consentAt)}</dd>
          <dt>Suppression</dt>
          <dd>
            {record.suppressedAt
              ? `${record.suppressionReason} · ${date(record.suppressedAt)}`
              : "None"}
          </dd>
        </dl>
      )}
      {kind === "campaigns" && editable && (
        <details>
          <summary>Start from a saved template</summary>
          <p className="gt-helper">
            Copies message text into this draft without changing the template or
            sending email.
          </p>
          <div className="gt-inline-actions">
            <Field label="Find templates">
              <input
                value={templateQuery}
                maxLength={100}
                onChange={(e) => setTemplateQuery(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void work(
                  (signal) =>
                    api<Listing>(
                      "/admin/newsletter/templates?" +
                        new URLSearchParams({ team, q: templateQuery }),
                      { signal },
                    ),
                  setTemplates,
                )
              }
            >
              Find templates
            </Button>
          </div>
          {templates && (
            <ul className="gt-newsletter-template-list">
              {templates.items.map((t) => (
                <li key={t.id}>
                  <strong>{t.name}</strong>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      discard(() =>
                        setDraft({ ...draft, content: t.content || "" }),
                      )
                    }
                  >
                    Use this template
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {templates && !templates.items.length && (
            <p>No matching templates in this scope.</p>
          )}
        </details>
      )}
      {record && kind !== "subscribers" && (
        <section>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || blocked || dirty}
            onClick={() =>
              void work(
                (signal) =>
                  api<{ html: string }>(path + "/preview", { signal }),
                setPreview,
              )
            }
          >
            Preview saved email
          </Button>
          {dirty && (
            <p className="gt-helper">
              Save changes before previewing or sending.
            </p>
          )}
          {preview && !blocked && (
            <iframe
              className="gt-newsletter-email-preview"
              title="Saved email preview"
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={preview.html}
            />
          )}
        </section>
      )}
      {record && !dirty && kind === "campaigns" && (
        <>
          <NewsletterSend
            record={record}
            onSaved={onSaved}
            unavailable={blocked || working}
            onLockChange={lockDelivery}
          />
          {record.status !== "draft" && <DeliveryStatus record={record} />}
        </>
      )}
      {record && (
        <section
          className="gt-newsletter-record-actions"
          aria-label="Record actions"
        >
          {!action ? (
            <div className="gt-inline-actions">
              {record.actions.includes("create") &&
                !record.deletedAt &&
                kind === "campaigns" && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => discard(() => setAction("duplicate"))}
                  >
                    Duplicate as new draft
                  </Button>
                )}
              {record.actions.includes("delete") && (
                <>
                  {kind === "subscribers" &&
                    !record.deletedAt &&
                    record.state !== "unsubscribed" && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => discard(() => setAction("deactivate"))}
                      >
                        Deactivate subscriber
                      </Button>
                    )}
                  {(!["scheduled", "sending"].includes(record.status || "") ||
                    kind !== "campaigns") && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        discard(() =>
                          setAction(record.deletedAt ? "restore" : "archive"),
                        )
                      }
                    >
                      {record.deletedAt ? "Restore record" : "Archive record"}
                    </Button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="gt-form">
              <h3>Confirm {action}</h3>
              <p>
                {kind === "subscribers"
                  ? "Deactivation and archiving stop future sends and revoke active tokens. Restoring leaves this address unsubscribed; it does not restore consent."
                  : action === "duplicate"
                    ? "Creates a new private draft. This campaign and its delivery history stay unchanged."
                    : "Records are retained for audit. Archiving does not erase completed delivery history."}
              </p>
              <div className="gt-inline-actions">
                <Button
                  type="button"
                  disabled={busy || blocked}
                  onClick={() => void mutate(action)}
                >
                  Confirm {action}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setAction(undefined)}
                >
                  Keep unchanged
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
