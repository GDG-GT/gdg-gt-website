import { useEffect, useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { Button, Field, EmptyState } from "../primitives";
import type { PreviewForm } from "./store";
type Invitation = {
  id: string;
  recipientHint: string;
  delivery_state: string;
  responded: boolean;
  revoked_at: string | null;
  expires_at: string;
};
type Collaborator = { admin_user_id: string; actions: string[] };
type Candidate = { id: string; display_name: string; role: string };
const names: Record<string, string> = {
  view: "View definition",
  edit: "Edit draft",
  publish: "Publish and change state",
  manage_access: "Manage access",
  view_responses: "Review responses",
  view_sensitive_responses: "Reveal sensitive answers",
  export_responses: "Export responses",
  delete: "Archive and privacy actions",
};
export default function AccessPanel({ form }: { form: PreviewForm }) {
  const published = form.versions[form.versions.length - 1];
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [collaborators, setCollaborators] = useState<Collaborator[]>([]),
    [candidates, setCandidates] = useState<Candidate[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [recipients, setRecipients] = useState(""),
    [days, setDays] = useState(7),
    [confirmed, setConfirmed] = useState(false),
    [user, setUser] = useState(""),
    [actions, setActions] = useState(["view"]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const submission = useRef<{ body: string; key: string }>();
  const allowed = form.actions?.includes("manage_access");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const [invites, collabs, users] = await Promise.all([
        api<{ items: Invitation[]; total: number }>(
          `/admin/forms/${form.id}/invitations?page=${page}`,
          { signal },
        ),
        api<{ items: Collaborator[] }>(
          `/admin/forms/${form.id}/collaborators`,
          { signal },
        ),
        api<{ items: Candidate[] }>(
          `/admin/forms/${form.id}/collaborator-candidates`,
          { signal },
        ),
      ]);
      setInvitations(invites.items);
      setTotal(invites.total);
      setCollaborators(collabs.items);
      setCandidates(users.items);
    },
    [form.id, page],
  );
  useEffect(() => {
    const controller = new AbortController();
    if (allowed)
      load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [load, allowed]);
  const work = async (run: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await run();
      await load();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!allowed)
    return (
      <EmptyState title="Access management is restricted">
        Your current form permissions do not include managing access.
      </EmptyState>
    );
  const addresses = [
    ...new Set(
      recipients
        .split(/[\s,;]+/)
        .map((v) => v.trim().toLowerCase())
        .filter((v) => v && v !== "email"),
    ),
  ];
  return (
    <div className="gt-form">
      <h2>Form access</h2>
      <p>
        Published access mode: {published?.settings.access || "Not published"}.
        Change settings and publish a new version to change access mode.
      </p>
      {error && (
        <p role="alert" className="gt-form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <h3>Collaborators</h3>
      <p>
        Only explicitly checked actions are granted. Team membership rules still
        apply.
      </p>
      {collaborators.map((row) => (
        <div key={row.admin_user_id}>
          <strong>
            {candidates.find((c) => c.id === row.admin_user_id)?.display_name ||
              row.admin_user_id}
          </strong>
          <p>{row.actions.map((a) => names[a]).join(" · ")}</p>
          <Button
            disabled={busy}
            variant="secondary"
            onClick={() =>
              work(
                () =>
                  api(`/admin/forms/${form.id}/collaborators`, {
                    method: "DELETE",
                    protected: true,
                    body: { userId: row.admin_user_id },
                  }),
                "Collaborator access removed.",
              )
            }
          >
            Remove collaborator
          </Button>
        </div>
      ))}
      <Field label="Chapter account">
        <select
          value={user}
          onChange={(e) => {
            setUser(e.target.value);
            setActions(
              collaborators.find((c) => c.admin_user_id === e.target.value)
                ?.actions || ["view"],
            );
          }}
        >
          <option value="">Choose an eligible account</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.display_name || candidate.id} ·{" "}
              {candidate.role.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Field>
      {Object.entries(names)
        .filter(([action]) => form.actions?.includes(action))
        .map(([action, label]) => (
          <label className="gt-check" key={action}>
            <input
              type="checkbox"
              checked={actions.includes(action)}
              disabled={action === "view"}
              onChange={(e) =>
                setActions(
                  e.target.checked
                    ? [...actions, action]
                    : actions.filter((a) => a !== action),
                )
              }
            />
            {label}
          </label>
        ))}
      <Button
        disabled={busy || !user}
        variant="secondary"
        onClick={() =>
          work(
            () =>
              api(`/admin/forms/${form.id}/collaborators`, {
                method: "PATCH",
                protected: true,
                body: { userId: user, actions },
              }),
            "Collaborator actions saved.",
          )
        }
      >
        Save collaborator access
      </Button>
      <h3>Private access links</h3>
      <p>
        Invitation and unlisted links are delivered privately. Raw tokens never
        appear in this admin workspace. Resending an unused invitation
        invalidates its old link.
      </p>
      {["invited", "unlisted"].includes(published?.settings.access || "") ? (
        <form
          className="gt-form"
          onSubmit={(e) => {
            e.preventDefault();
            const body = {
                type: published?.settings.access,
                recipients: addresses,
                expiresInDays: days,
                confirmed: true,
              },
              serialized = JSON.stringify(body);
            if (submission.current?.body !== serialized)
              submission.current = {
                body: serialized,
                key: crypto.randomUUID(),
              };
            work(
              () =>
                api(`/admin/forms/${form.id}/invitations`, {
                  method: "POST",
                  protected: true,
                  body,
                  idempotencyKey: submission.current!.key,
                }),
              "Private links queued. Refresh delivery status after the local worker runs.",
            );
          }}
        >
          <Field
            label="Approved recipient emails"
            hint="One per line, comma-separated, or paste an email CSV column. Maximum 100."
          >
            <textarea
              rows={5}
              value={recipients}
              onChange={(e) => {
                setRecipients(e.target.value);
                setConfirmed(false);
              }}
              maxLength={30000}
            />
          </Field>
          <Field label="Import email CSV">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 32768) {
                  setError("Use an email CSV smaller than 32 KB.");
                  return;
                }
                setRecipients((await file.text()).replace(/"/g, ""));
                setConfirmed(false);
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
          <p>{addresses.length} unique recipients</p>
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
              busy ||
              !confirmed ||
              addresses.length < 1 ||
              addresses.length > 100
            }
          >
            Queue private links
          </Button>
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
        disabled={busy}
        onClick={() => work(load, "Delivery status refreshed.")}
      >
        Refresh delivery status
      </Button>
      {invitations.length ? (
        <div className="gt-table-wrap">
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
              {invitations.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.recipientHint}</td>
                  <td>
                    {invite.revoked_at ? "Revoked" : invite.delivery_state}
                  </td>
                  <td>{invite.responded ? "Responded" : "Not yet"}</td>
                  <td>{new Date(invite.expires_at).toLocaleString()}</td>
                  <td>
                    <Button
                      variant="ghost"
                      disabled={busy || invite.responded || !!invite.revoked_at}
                      onClick={() =>
                        work(
                          () =>
                            api(
                              `/admin/forms/${form.id}/invitations/${invite.id}`,
                              {
                                method: "PATCH",
                                protected: true,
                                body: { action: "resend" },
                              },
                            ),
                          "New private link queued; the old link is invalid.",
                        )
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || !!invite.revoked_at}
                      onClick={() =>
                        work(
                          () =>
                            api(
                              `/admin/forms/${form.id}/invitations/${invite.id}`,
                              {
                                method: "PATCH",
                                protected: true,
                                body: { action: "revoke" },
                              },
                            ),
                          "Access link revoked.",
                        )
                      }
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No private links have been issued.</p>
      )}
      <div className="gt-actions">
        <Button
          variant="ghost"
          disabled={page === 1 || busy}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>Page {page}</span>
        <Button
          variant="ghost"
          disabled={page * 30 >= total || busy}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
