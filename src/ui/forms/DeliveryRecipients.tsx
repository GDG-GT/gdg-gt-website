import { useEffect, useRef, useState } from "react";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { Button, Field } from "../primitives";
import type { DeliveryAccount } from "./form-delivery-api";
type Candidate = { id: string; display_name: string; role: string };
type Inventory = {
  items: Candidate[];
  total: number;
  page: number;
  pageSize: number;
};
type Props = {
  formId: string;
  refresh: number;
  selected: string[];
  labels: Record<string, DeliveryAccount>;
  disabled: boolean;
  pending: boolean;
  mailReady: boolean;
  onChange: (account: DeliveryAccount, selected: boolean) => void;
  onReady: (ready: boolean) => void;
  onDenied: () => void;
};
export default function DeliveryRecipients(props: Props) {
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [retry, setRetry] = useState(0),
    { isOnline } = useOnlineStatus(),
    read = usePrivateRead<Inventory>(
      `/admin/forms/${props.formId}/delivery/candidates?${new URLSearchParams({ q: query, page: String(page) })}`,
      props.refresh + retry,
    ),
    callbacks = useRef(props),
    feedback = useRef<HTMLElement>(null);
  callbacks.current = props;
  const valid =
    !!read.data &&
    Array.isArray(read.data.items) &&
    Number.isInteger(read.data.total) &&
    read.data.total >= 0 &&
    read.data.page === page &&
    Number.isInteger(read.data.pageSize) &&
    read.data.pageSize >= 1 &&
    read.data.pageSize <= 100 &&
    read.data.items.length <= read.data.pageSize &&
    read.data.items.every(
      (account) =>
        typeof account.id === "string" &&
        !!account.id &&
        (typeof account.display_name === "string" ||
          account.display_name === null) &&
        typeof account.role === "string",
    );
  const ready =
    valid && !read.loading && !read.error && !read.denied && isOnline;
  useEffect(() => {
    callbacks.current.onReady(ready);
  }, [ready]);
  useEffect(() => {
    if (read.denied) callbacks.current.onDenied();
  }, [read.denied]);
  const retryRead = () => {
    setRetry((value) => value + 1);
    feedback.current?.focus();
  };
  return (
    <section aria-label="Chapter notification recipients" className="gt-form">
      <h4>Eligible accounts</h4>
      <p className="gt-helper">
        Choose up to 10 active accounts with response-review access. Search and
        paging cover every currently eligible account. Personal addresses cannot
        be entered here.
      </p>
      <div aria-live="polite">
        {props.selected.length} of 10 recipients selected.
      </div>
      {!!props.selected.length && (
        <section aria-label="Selected chapter recipients">
          <h4>Selected recipients</h4>
          <ul>
            {props.selected.map((id) => {
              const account = props.labels[id],
                label = account?.display_name || "Chapter account",
                ref = id.slice(-6);
              return (
                <li key={id}>
                  <span>
                    {label} ·{" "}
                    {account?.role?.replace(/_/g, " ") || "Unavailable"} · {ref}
                  </span>
                  {account?.eligible === false && (
                    <p role="alert">
                      This configured account is no longer eligible. Remove it
                      explicitly before confirming a revised recipient list.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={props.disabled}
                    onClick={() =>
                      props.onChange(
                        account || {
                          id,
                          display_name: label,
                          role: null,
                          eligible: false,
                        },
                        false,
                      )
                    }
                    aria-label={`Remove notification recipient ${label} ${ref}`}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <Field label="Search eligible notification recipients">
        <input
          value={query}
          maxLength={100}
          disabled={props.pending || !isOnline}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </Field>
      <section
        ref={feedback}
        tabIndex={-1}
        aria-label="Delivery recipient read status"
      >
        {read.loading && (
          <div role="status" aria-label="Loading delivery recipients">
            <div className="gt-skeleton" />
            <span className="sr-only">
              Checking eligible chapter recipients…
            </span>
          </div>
        )}
        {read.error && <p role="alert">{read.error}</p>}
        {read.data && !valid && (
          <p role="alert">
            This recipient inventory could not be verified. Recheck it before
            choosing accounts.
          </p>
        )}
        {read.error && read.at && (
          <p>
            Last successful recipient read:{" "}
            <time dateTime={read.at}>{new Date(read.at).toLocaleString()}</time>
            .
          </p>
        )}
        {!isOnline && (
          <p role="status">
            You are offline. Recipient changes are paused; no automatic review
            is sent on reconnect.
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={props.pending || !isOnline}
          onClick={retryRead}
        >
          Recheck delivery recipients
        </Button>
      </section>
      {read.data && valid && (
        <>
          {!read.data.items.length && (
            <p>No eligible accounts match this search.</p>
          )}
          <div className="gt-form">
            {read.data.items.map((account) => (
              <label className="gt-check" key={account.id}>
                <input
                  type="checkbox"
                  checked={props.selected.includes(account.id)}
                  disabled={
                    props.disabled ||
                    !ready ||
                    (!props.selected.includes(account.id) &&
                      (!props.mailReady || props.selected.length >= 10))
                  }
                  onChange={(event) =>
                    props.onChange(
                      {
                        ...account,
                        display_name: account.display_name || "Chapter account",
                        eligible: true,
                      },
                      event.target.checked,
                    )
                  }
                />
                {account.display_name || "Chapter account"} ·{" "}
                {account.role.replace(/_/g, " ")} · {account.id.slice(-6)}
              </label>
            ))}
          </div>
          <nav
            aria-label="Delivery recipient pages"
            className="gt-inline-actions"
          >
            <Button
              type="button"
              variant="secondary"
              disabled={props.pending || !ready || page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous recipients
            </Button>
            <span>
              Recipient page {read.data.page} of{" "}
              {Math.max(1, Math.ceil(read.data.total / read.data.pageSize))} ·{" "}
              {read.data.total} matching
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={
                props.pending ||
                !ready ||
                read.data.page * read.data.pageSize >= read.data.total
              }
              onClick={() => setPage((value) => value + 1)}
            >
              Next recipients
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
