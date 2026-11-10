import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { usePrivateRead } from "@/hooks/usePrivateRead";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button, Field } from "../primitives";
import { useNewsletterWork } from "./types";
type Candidate = {
  id: string;
  name: string;
  email: string;
  status: "new" | "pending" | "subscribed" | "excluded" | "other_scope";
};
export type ImportResult = {
  selected: number;
  created: number;
  activated: number;
  existing: number;
  excluded: number;
  emailsQueued: number;
};
export default function MemberSubscriberImport({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (result: ImportResult) => void;
}) {
  const [tick, setTick] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [note, setNote] = useState(""),
    [consent, setConsent] = useState(false),
    [frozen, setFrozen] = useState(false);
  const read = usePrivateRead<{ items: Candidate[] }>(
      "/admin/newsletter/member-import",
      tick,
    ),
    { isOnline } = useOnlineStatus();
  const { busy, error, work } = useNewsletterWork("member-newsletter-import");
  const retry = useRef<{
    key: string;
    body: {
      memberIds: string[];
      consentAcknowledged: true;
      consentNote: string;
    };
  }>();
  const eligible = (read.data?.items || []).filter(
    (m) => !["excluded", "other_scope"].includes(m.status),
  );
  const ready =
    !!read.data && !read.loading && !read.error && !read.denied && isOnline;
  useEffect(() => {
    if (read.denied) {
      setSelected([]);
      setNote("");
      setConsent(false);
      retry.current = undefined;
      setFrozen(false);
    }
  }, [read.denied]);
  async function submit() {
    if (
      busy ||
      !isOnline ||
      read.denied ||
      (!frozen &&
        (!ready || !selected.length || !consent || note.trim().length < 10))
    )
      return;
    if (!retry.current)
      retry.current = {
        key: crypto.randomUUID(),
        body: {
          memberIds: selected,
          consentAcknowledged: true,
          consentNote: note.trim(),
        },
      };
    const attempt = retry.current;
    setFrozen(true);
    await work(
      (signal) =>
        api<ImportResult>("/admin/newsletter/member-import", {
          method: "POST",
          body: attempt.body,
          idempotencyKey: attempt.key,
          signal,
        }),
      onDone,
    );
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        closeDisabled={busy}
        className="gt-newsletter-import-dialog"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogTitle>Add community members</DialogTitle>
        <DialogDescription>
          Use this for members who have already agreed to receive chapter
          newsletters.
        </DialogDescription>
        {read.error && (
          <p role="alert">
            {read.error}{" "}
            <Button
              variant="ghost"
              disabled={busy || !isOnline || frozen}
              onClick={() => setTick((v) => v + 1)}
            >
              Retry member list
            </Button>
          </p>
        )}
        {read.loading && !read.data && <p role="status">Loading members…</p>}
        {error && <p role="alert">{error}</p>}
        <fieldset
          className="gt-plain-fieldset gt-form"
          disabled={busy || frozen || !ready}
        >
          <div className="gt-inline-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelected(eligible.map((m) => m.id))}
            >
              Select all {eligible.length} members
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSelected([])}
            >
              Clear selection
            </Button>
            <span>{selected.length} selected</span>
          </div>
          <ul
            className="gt-newsletter-recipient-list"
            aria-label="Community members to subscribe"
          >
            {(read.data?.items || []).map((m) => (
              <li key={m.id}>
                <label className="gt-check">
                  <input
                    type="checkbox"
                    disabled={
                      m.status === "excluded" || m.status === "other_scope"
                    }
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, m.id]
                          : selected.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <span>
                    {m.name}
                    <small>
                      {m.email} ·{" "}
                      {
                        {
                          new: "Not subscribed",
                          pending: "Pending confirmation",
                          subscribed: "Already subscribed",
                          excluded: "Unsubscribed or suppressed",
                          other_scope: "Subscribed to another team",
                        }[m.status]
                      }
                    </small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Field label="How was consent collected?" required>
            <input
              value={note}
              maxLength={500}
              required
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example, chapter signup form"
            />
          </Field>
          <label className="gt-check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              These members have agreed to receive chapter newsletters.
            </span>
          </label>
        </fieldset>
        <p className="gt-helper">
          Existing unsubscribes and blocked addresses are kept. No email is sent
          by this import.
        </p>
        {frozen && error && (
          <p>
            The result could not be confirmed. Retry this import to check and
            finish the same request.
          </p>
        )}
        <div className="gt-inline-actions">
          <Button
            disabled={
              busy ||
              !isOnline ||
              read.denied ||
              (!frozen &&
                (!ready ||
                  !consent ||
                  !selected.length ||
                  note.trim().length < 10))
            }
            onClick={() => void submit()}
          >
            {busy
              ? "Adding members…"
              : frozen
                ? "Retry import"
                : `Add ${selected.length} members`}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
