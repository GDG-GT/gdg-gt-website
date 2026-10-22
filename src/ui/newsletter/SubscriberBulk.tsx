import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useDraftGuard, useNavigationSafety } from "@/hooks/useDraftGuard";
import { Button, Field } from "../primitives";
import { useNewsletterWork, type NewsletterRecord } from "./types";
export default function SubscriberBulk({
  records,
  archived,
  onSaved,
  onClear,
  onLockChange,
}: {
  records: NewsletterRecord[];
  archived: boolean;
  onSaved: (message: string) => void;
  onClear: () => void;
  onLockChange: (locked: boolean) => void;
}) {
  const [action, setAction] = useState<"archive" | "restore" | "deactivate">(),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const { busy, error, work } = useNewsletterWork(),
    safety = useNavigationSafety(),
    retry = useRef<{ signature: string; key: string }>();
  useDraftGuard(!!action, {
    busy,
    label: "Selected newsletter subscriber review",
  });
  useEffect(() => {
    onLockChange(busy || !!action);
    return () => onLockChange(false);
  }, [busy, action, onLockChange]);
  const clear = () => {
    setAction(undefined);
    setPassword("");
    setConfirmation("");
    retry.current = undefined;
  };
  const submit = async () => {
    const document = {
        action,
        records: records.map((r) => ({ id: r.id, revision: r.revision })),
        confirmation,
      },
      signature = JSON.stringify(document);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    const currentPassword = password;
    setPassword("");
    await work(
      (signal) =>
        api<{ count: number }>("/admin/newsletter/subscribers/bulk", {
          method: "POST",
          body: { ...document, currentPassword },
          signal,
          idempotencyKey: retry.current.key,
        }),
      (r) => {
        clear();
        onSaved(
          `${r.count} subscriber records ${action === "archive" ? "archived" : action === "restore" ? "restored as unsubscribed" : "deactivated"}. No consent was created or restored.`,
        );
      },
    );
  };
  const expected = action?.toUpperCase() + " " + records.length;
  return (
    <section
      className="gt-panel gt-form"
      aria-label="Selected newsletter subscribers"
    >
      <h2>
        {records.length} selected{" "}
        {records.length === 1 ? "subscriber" : "subscribers"}
      </h2>
      {!action ? (
        <div className="gt-inline-actions">
          {archived ? (
            <Button variant="secondary" onClick={() => setAction("restore")}>
              Review selected restore
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => setAction("deactivate")}
              >
                Review selected deactivation
              </Button>
              <Button variant="secondary" onClick={() => setAction("archive")}>
                Review selected archive
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={onClear}>
            Clear selection
          </Button>
        </div>
      ) : (
        <>
          <h3>Review {action}</h3>
          <p>
            Only these selected records will change. Deactivation or archive
            stops future sends and revokes tokens. Restore keeps addresses
            unsubscribed. No email is sent and no subscriber is permanently
            erased.
          </p>
          <ul className="gt-newsletter-recipient-list">
            {records.map((r) => (
              <li key={r.id}>
                {r.email} · revision {r.revision}
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="gt-form-error">
              {error}
            </p>
          )}
          <Field label="Current password" required>
            <input
              type="password"
              autoComplete="current-password"
              maxLength={1024}
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label={`Type ${expected} to confirm`} required>
            <input
              maxLength={30}
              autoComplete="off"
              value={confirmation}
              disabled={busy}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <div className="gt-inline-actions">
            <Button
              disabled={busy || !password || confirmation !== expected}
              onClick={() => void submit()}
            >
              {busy ? "Applying…" : "Confirm selected changes"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => (safety ? safety.request(clear) : clear())}
            >
              Keep unchanged
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
