import ActionFeedback from "@/ui/ActionFeedback";
import { useLiveSearch } from "@/hooks/useLiveSearch";
import { confirmAction } from "@/lib/app-dialogs";
import EventConnections from "./EventConnections";
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type FormHTMLAttributes,
} from "react";
import { api, ApiFailure } from "@/lib/api";
import { useLocation } from "react-router-dom";
import { NavigationSafetyContext } from "@/contexts/NavigationSafetyContext";
import { useDraftGuard } from "@/hooks/useDraftGuard";
import { useAdmin } from "@/contexts/AdminContext";
import { Button, Field } from "../primitives";
import NfcControls from "./NfcControls";
import CheckInScanner from "./CheckInScanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import "./rewards.css";
function RewardForm({
  busy,
  children,
  ...props
}: { busy: boolean } & FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...props}>
      <fieldset disabled={busy} className="rewards-form-fields">
        {children}
      </fieldset>
    </form>
  );
}
type Member = { id: string; name: string; email: string; points: number };
type Rule = {
  id: string;
  title: string;
  points: number;
  is_active: boolean;
  revision: number;
};
type Activity = {
  id: string;
  title: string;
  points: number;
  opens_at: string;
  closes_at: string;
  revision: number;
};
type Perk = {
  id: string;
  title: string;
  description: string;
  threshold: number;
  inventory: number | null;
  is_active: boolean;
  revision: number;
};
type Credential = {
  id: string;
  label: string;
  kind: string;
  revoked_at: string | null;
  bound?: boolean;
  programmed_at?: string | null;
};
type Entry = {
  id: string;
  points: number;
  reason: string;
  reversal_of: string | null;
  created_at: string;
};
type Claim = {
  id: string;
  name: string;
  title: string;
  status: string;
  revision: number;
};
type Inventory = {
  emailDeliveries?: {
    credentialId: string;
    state: string | null;
    providerAccepted: boolean;
    reference: string;
  }[];
  walletAvailable?: boolean;
  googleWalletAvailable?: boolean;
  walletNfcAvailable?: boolean;
  selectedMember?: Member | null;
  members: Member[];
  total: number;
  rules: Rule[];
  activities: Activity[];
  perks: Perk[];
  credentials: Credential[];
  ledger: Entry[];
  claims: Claim[];
};
const errorMessage = (e: unknown) =>
  e instanceof ApiFailure
    ? e.message
    : "The result could not be confirmed. Use the same request to retry; check the ledger before starting another correction.";
export default function RewardsWorkspace() {
  const location = useLocation();
  const { isSuperAdmin } = useAdmin();
  const [data, setData] = useState<Inventory>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [tab, setTab] = useState(() =>
      new URLSearchParams(location.search).get("view") === "scanner"
        ? "scanner"
        : "members",
    ),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [member, setMember] = useState<Member>(),
    [issued, setIssued] = useState<{
      id: string;
      kind: string;
      url: string;
      credential: string;
      uidHash?: string | null;
    }>(),
    [qr, setQr] = useState(""),
    [review, setReview] = useState<{
      action: string;
      document: Record<string, unknown>;
      label: string;
      key: string;
    }>(),
    [editPerk, setEditPerk] = useState<Perk>();
  const navigationSafety = useContext(NavigationSafetyContext);
  const [editRule, setEditRule] = useState<Rule>();
  const [uncertain, setUncertain] = useState<{
    action: string;
    document: Record<string, unknown>;
    key: string;
  }>();
  const [dirty, setDirty] = useState(false);
  useLiveSearch(query, search, (value) => { setSearch(value); setPage(1); }, !busy && tab === "members");
  const [scannerDraft, setScannerDraft] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("view") === "scanner")
      setTab("scanner");
  }, [location.search]);
  useDraftGuard(dirty || !!review || !!issued || !!uncertain, {
    busy,
    label: "Member rewards changes",
  });
  const memberId = member?.id;
  const generation = useRef(0),
    pending = useRef<{ fingerprint: string; key: string }>();
  const load = useCallback(async () => {
    const g = ++generation.current;
    setLoading(true);
    try {
      const p = new URLSearchParams({
        page: String(page),
        q: search,
        ...(memberId ? { member: memberId } : {}),
      });
      const result = await api<Inventory>("/admin/rewards?" + p);
      if (g !== generation.current) return;
      setData(result);
      setError("");
      if (memberId) {
        const updated =
          result.selectedMember ||
          result.members.find((m) => m.id === memberId);
        if (updated) setMember(updated);
      }
    } catch (e) {
      if (g === generation.current) setError(errorMessage(e));
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }, [page, search, memberId]);
  useEffect(() => {
    if (isSuperAdmin) void load();
    const capturedGeneration = generation;
    return () => {
      capturedGeneration.current++;
    };
  }, [load, isSuperAdmin]);
  useEffect(() => {
    if (
      !memberId ||
      busy ||
      !data?.emailDeliveries?.some((mail) =>
        ["pending", "running"].includes(mail.state || ""),
      )
    )
      return;
    const timer = window.setTimeout(() => {
      if (!document.hidden) void load();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [data?.emailDeliveries, memberId, busy, load]);
  useEffect(() => {
    let active = true;
    setQr("");
    if (issued?.kind === "wallet")
      void import("qrcode")
        .then((m) =>
          m.toDataURL(issued.credential, {
            width: 256,
            margin: 2,
            color: { light: "#faf7f2", dark: "#302c29" },
            errorCorrectionLevel: "M",
          }),
        )
        .then((v) => {
          if (active) setQr(v);
        })
        .catch(() =>
          setError(
            "QR could not be generated. The Wallet download remains available.",
          ),
        );
    return () => {
      active = false;
    };
  }, [issued]);
  const mutate = async (
    action: string,
    document: Record<string, unknown>,
    key?: string,
  ) => {
    const fingerprint = JSON.stringify({ action, document });
    if (
      uncertain &&
      JSON.stringify({
        action: uncertain.action,
        document: uncertain.document,
      }) !== fingerprint
    ) {
      setError(
        "Resolve the previous request with Retry same request before starting a different change.",
      );
      return false;
    }
    if (!pending.current || pending.current.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: key || crypto.randomUUID() };
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ id: string; url: string; credential: string }>(
        "/admin/rewards/" + action,
        { method: "POST", body: document, idempotencyKey: pending.current.key },
      );
      pending.current = undefined;
      setUncertain(undefined);
      setReview(undefined);
      setDirty(false);
      if (action === "credential")
        setIssued({ ...result, kind: String(document.kind) });
      if (action === "rule") setEditRule(undefined);
      if (action === "perk") setEditPerk(undefined);
      setNotice(
        action === "credential" && document.kind === "card"
          ? "Card credential created. Write and register its physical chip before use."
          : action === "credential" || action === "credential-email"
          ? "Credential email queued for the member. Delivery status appears below."
          : "Saved. The current records are shown below.",
      );
      await load();
      return true;
    } catch (e) {
      setReview(undefined);
      if (!(e instanceof ApiFailure) || e.status >= 500) {
        setUncertain({ action, document, key: pending.current!.key });
      } else {
        pending.current = undefined;
        setUncertain(undefined);
      }
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = (
    event: FormEvent<HTMLFormElement>,
    action: string,
    convert: (f: FormData) => Record<string, unknown>,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    void mutate(action, convert(new FormData(form))).then((ok) => {
      if (ok) form.reset();
    });
  };
  const resolve = async (credential: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<Member & { credentialId: string }>(
        "/admin/rewards/resolve",
        { method: "POST", body: { credential } },
      );
      setMember(result);
      setTab("members");
      setNotice(
        "Card read. Confirm this member and choose the activity below.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!isSuperAdmin)
    return (
      <p role="alert">Member points and cards are available to Super Admins.</p>
    );
  return (
    <div className="gt-admin-page rewards-workspace">
      <div className="gt-admin-page-heading">
        <div>
          <h1>Member points & cards</h1>
          <p>
            Check in members, recognise contributions and manage chapter perks.
          </p>
        </div>
        <a
          className="gt-button gt-button-secondary"
          href="https://leaderboards.gdggt.dev/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Public leaderboard ↗
        </a>
      </div>
      <nav className="gt-team-tabs" aria-label="Rewards sections">
        {[
          ["members", "Members & cards"],
          ["scanner", "Check-in scanner"],
          ["activities", "Activities & rules"],
          ["perks", "Perks & requests"],
          ["events", "Event connections"],
        ].map(([id, label]) => (
          <Button
            variant="ghost"
            key={id}
            disabled={busy}
            aria-current={tab === id ? "page" : undefined}
            onClick={async () => {
              const changeSection = () => {
                setTab(id);
                setDirty(false);
                setIssued(undefined);
                setReview(undefined);
              };
              if (navigationSafety && tab === "scanner" && scannerDraft) {
                navigationSafety.request(changeSection);
                return;
              }
              if (
                (dirty ||
                  issued ||
                  review ||
                  (tab === "scanner" && scannerDraft)) &&
                !(await confirmAction(
                  "Switch sections and discard the current unsaved entries?",
                ))
              )
                return;
              setTab(id);
              setDirty(false);
              setIssued(undefined);
              setReview(undefined);
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      {error && (
        <ActionFeedback message={error} tone="error">
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={busy || loading}
          >
            Reload records
          </Button>
          {uncertain && (
            <Button
              onClick={() =>
                void mutate(uncertain.action, uncertain.document, uncertain.key)
              }
              disabled={busy}
            >
              Retry same request
            </Button>
          )}
        </ActionFeedback>
      )}
      {notice && <ActionFeedback message={notice} />}
      {loading && <p role="status">Refreshing records…</p>}
      <Dialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !busy) setReview(undefined);
        }}
      >
        {review && (
          <DialogContent>
            <DialogTitle>
              {review.action === "revoke"
                ? "Revoke this credential?"
                : "Confirm points change"}
            </DialogTitle>
            <DialogDescription>{review.label}</DialogDescription>
            <Button
              disabled={busy}
              onClick={() =>
                void mutate(review.action, review.document, review.key)
              }
            >
              {review.action === "revoke"
                ? "Revoke credential"
                : "Confirm change"}
            </Button>
            <Button
              disabled={busy}
              variant="ghost"
              onClick={() => setReview(undefined)}
            >
              Cancel
            </Button>
          </DialogContent>
        )}
      </Dialog>
      <div hidden={tab !== "events"}>
        <EventConnections
          active={tab === "events"}
          activities={data?.activities || []}
        />
      </div>
      {tab === "scanner" && (
        <CheckInScanner
          activities={data?.activities || []}
          rules={data?.rules || []}
          refresh={load}
          manual={resolve}
          onDraftChange={setScannerDraft}
        />
      )}
      {tab === "members" && (
        <div className="rewards-split">
          <section aria-label="Community members">
            <RewardForm
              busy={busy}
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(query);
                setPage(1);
              }}
            >
              <Field label="Find a community member">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  maxLength={100}
                />
              </Field>
              <Button variant="secondary">Search</Button>
            </RewardForm>
            <ul className="rewards-member-list">
              {data?.members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={busy}
                    className={member?.id === m.id ? "selected" : ""}
                    onClick={async () => {
                      if (
                        (dirty || issued || review) &&
                        !(await confirmAction(
                          "Choose another member and discard the current unsaved entries?",
                        ))
                      )
                        return;
                      setDirty(false);
                      setReview(undefined);
                      setMember(m);
                      setIssued(undefined);
                    }}
                  >
                    <span>
                      <strong>{m.name}</strong>
                      <small>{m.email}</small>
                    </span>
                    <span>{m.points} pts</span>
                  </button>
                </li>
              ))}
            </ul>
            {data?.members.length === 0 && (
              <p>
                No active members match. Add members in the community directory
                first.
              </p>
            )}
            <div className="rewards-actions">
              <Button
                variant="ghost"
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                variant="ghost"
                disabled={!data || page * 25 >= data.total || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </section>
          <section aria-label="Selected member">
            {member ? (
              <>
                <h2>{member.name}</h2>
                <p>{member.email}</p>
                <p>
                  <strong>
                    {data?.members.find((m) => m.id === member.id)?.points ??
                      member.points}{" "}
                    points
                  </strong>
                </p>
                <RewardForm
                  busy={busy}
                  onChange={() => setDirty(true)}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget),
                      id = String(f.get("activity"));
                    const activity = data?.activities.find((a) => a.id === id);
                    if (activity)
                      setReview({
                        action: "award",
                        document: { memberId: member.id, activityId: id },
                        label: `Award ${activity.points} points to ${member.name} for ${activity.title}.`,
                        key: crypto.randomUUID(),
                      });
                  }}
                >
                  <Field label="Check-in activity">
                    <select name="activity" required defaultValue="">
                      <option value="" disabled>
                        Choose an open activity
                      </option>
                      {data?.activities
                        .filter(
                          (a) =>
                            Date.parse(a.opens_at) <= Date.now() &&
                            Date.parse(a.closes_at) >= Date.now(),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.title} · {a.points} points
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Button disabled={busy}>Review check-in award</Button>
                </RewardForm>
                <details>
                  <summary>Correct points</summary>
                  <RewardForm
                    busy={busy}
                    onChange={() => setDirty(true)}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      setReview({
                        action: "adjust",
                        document: {
                          memberId: member.id,
                          points: Number(f.get("points")),
                          reason: String(f.get("reason")),
                        },
                        label: `Change ${member.name}'s balance by ${Number(f.get("points"))} points. Reason: ${f.get("reason")}`,
                        key: crypto.randomUUID(),
                      });
                    }}
                  >
                    <Field
                      label="Point adjustment"
                      hint="Positive adds points. Negative removes points. The balance cannot go below zero."
                    >
                      <input
                        name="points"
                        type="number"
                        min={-10000}
                        max={10000}
                        required
                      />
                    </Field>
                    <Field label="Reason">
                      <input
                        name="reason"
                        minLength={2}
                        maxLength={500}
                        required
                      />
                    </Field>
                    <Button variant="secondary" disabled={busy}>
                      Review correction
                    </Button>
                  </RewardForm>
                </details>
                <h3>Member credentials</h3>
                <p>
                  Each card or QR links to this member’s existing balance.
                  Revoke a lost credential before issuing its replacement.
                </p>
                <RewardForm
                  busy={busy}
                  onChange={() => setDirty(true)}
                  onSubmit={(e) =>
                    submit(e, "credential", (f) => ({
                      memberId: member.id,
                      kind: String(f.get("kind")),
                      label: String(f.get("label")),
                    }))
                  }
                >
                  <Field label="Credential label">
                    <input
                      name="label"
                      placeholder="Blue member card"
                      maxLength={80}
                      required
                    />
                  </Field>
                  <Field label="Credential type">
                    <select name="kind">
                      <option value="card">NFC card</option>
                      <option
                        value="wallet"
                        disabled={
                          !data?.walletAvailable && !data?.googleWalletAvailable
                        }
                      >
                        Wallet pass{" "}
                        {data?.walletNfcAvailable ? "NFC + QR" : "QR"}
                        {!data?.walletAvailable && !data?.googleWalletAvailable
                          ? " · Setup required"
                          : ""}
                      </option>
                    </select>
                  </Field>
                  <Button disabled={busy}>Issue credential</Button>
                </RewardForm>
                {issued && (
                  <section className="rewards-issued">
                    <h3>
                      {issued.kind === "wallet"
                        ? "Wallet pass ready"
                        : issued.kind === "card"
                          ? "Program NFC card"
                          : "Membership QR"}
                    </h3>
                    {issued.kind === "wallet" ? (
                      <a
                        className="gt-button gt-button-secondary"
                        href={
                          "/api/v1/admin/rewards/" +
                          (data?.walletAvailable
                            ? "wallet/"
                            : "google-wallet/") +
                          issued.id
                        }
                        download={
                          data?.walletAvailable
                            ? "gdg-member.pkpass"
                            : undefined
                        }
                      >
                        {data?.walletAvailable
                          ? "Download Apple Wallet pass"
                          : "Add to Google Wallet"}
                      </a>
                    ) : issued.kind === "card" ? (
                      <>
                        <p>Write and register this card in GDG Workspace. An ordinary tap opens the leaderboard. Check-in verifies this card’s chip.</p>
                        <NfcControls key={issued.id} writeUrl={issued.url} writeId={issued.id} uidHash={issued.uidHash} onWritten={async()=>{setNotice("Physical card registered. Membership QR and Wallet options will be emailed to the member.");await load();}} />
                      </>
                    ) : null}
                    {qr && (
                      <img
                        src={qr}
                        alt="Member credential QR code"
                        width={256}
                        height={256}
                      />
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => setIssued(undefined)}
                    >
                      {issued.kind === "card" ? "Done programming" : "Done"}
                    </Button>
                  </section>
                )}
                <ul className="gt-file-list">
                  {data?.credentials.map((c) => (
                    <li key={c.id}>
                      <span>
                        {c.label} · {c.kind}
                        {c.revoked_at ? " · Revoked" : c.kind === "card" ? (c.bound ? " · Registered chip" : " · Needs programming") : ""}
                        {" · ending " +
                          c.id.replace(/-/g, "").slice(-4).toUpperCase()}
                        {!c.revoked_at && (
                          <small className="gt-help">
                            {(() => {
                              const mail = data.emailDeliveries?.find(
                                (e) => e.credentialId === c.id,
                              );
                              if(c.kind === "card" && !c.bound)return "Email follows physical registration";
                              if (!mail?.state) return "Email not sent";
                              if (mail.providerAccepted) return "Email sent";
                              if (
                                mail.state === "dead" ||
                                mail.state === "failed"
                              )
                                return "Email failed — resend available";
                              if (mail.state === "completed")
                                return "Email skipped — check member status";
                              return "Email queued";
                            })()}
                          </small>
                        )}
                      </span>
                      {!c.revoked_at &&
                        c.kind === "wallet" &&
                        (data.walletAvailable ||
                          data.googleWalletAvailable) && (
                          <a
                            className="gt-button gt-button-secondary"
                            href={
                              "/api/v1/admin/rewards/" +
                              (data.walletAvailable
                                ? "wallet/"
                                : "google-wallet/") +
                              c.id
                            }
                            download={
                              data?.walletAvailable
                                ? "gdg-member.pkpass"
                                : undefined
                            }
                            aria-label={
                              (data.walletAvailable
                                ? "Download Apple Wallet pass for "
                                : "Add to Google Wallet for ") + c.label
                            }
                          >
                            {data?.walletAvailable
                              ? "Download Apple Wallet pass"
                              : "Add to Google Wallet"}
                          </a>
                        )}
                      {!c.revoked_at &&
                        c.kind === "wallet" &&
                        data.walletAvailable &&
                        data.googleWalletAvailable && (
                          <a
                            className="gt-button gt-button-secondary"
                            href={"/api/v1/admin/rewards/google-wallet/" + c.id}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Add to Google Wallet
                          </a>
                        )}
                      {!c.revoked_at && c.kind === "card" && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          aria-label={"Program card for " + c.label}
                          onClick={async () => {
                            setBusy(true);
                            const g = generation.current;
                            void api<{
                              id: string;
                              kind: string;
                              url: string;
                              credential: string;
                              uidHash?: string | null;
                            }>("/admin/rewards/card/" + c.id)
                              .then((r) => {
                                if (g === generation.current) setIssued(r);
                              })
                              .catch((e) => setError(e.message))
                              .finally(() => setBusy(false));
                          }}
                        >
                          Program card
                        </Button>
                      )}
                      {!c.revoked_at && (
                        <Button
                          variant="secondary"
                          disabled={busy || (c.kind === "card" && !c.bound)}
                          onClick={() =>
                            void mutate("credential-email", { id: c.id })
                          }
                        >
                          Email card to member
                        </Button>
                      )}
                      {!c.revoked_at && (
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() =>
                            setReview({
                              action: "revoke",
                              document: { id: c.id },
                              label: `Revoke ${c.label}. This credential will stop resolving immediately.`,
                              key: crypto.randomUUID(),
                            })
                          }
                        >
                          Revoke
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
                <h3>Points history</h3>
                <p>
                  The latest 100 entries. Corrections are recorded as new
                  entries.
                </p>
                <ul className="gt-file-list">
                  {data?.ledger.map((l) => (
                    <li key={l.id}>
                      <span>
                        <strong>
                          {l.points > 0 ? "+" : ""}
                          {l.points}
                        </strong>{" "}
                        · {l.reason}
                        <small>{new Date(l.created_at).toLocaleString()}</small>
                      </span>
                      {!l.reversal_of &&
                        !data.ledger.some((x) => x.reversal_of === l.id) && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() =>
                              setReview({
                                action: "reverse",
                                document: {
                                  id: l.id,
                                  reason: "Reversal: " + l.reason.slice(0, 450),
                                },
                                label: `Reverse this ${l.points}-point entry for ${member.name}. The original entry will remain in the history.`,
                                key: crypto.randomUUID(),
                              })
                            }
                          >
                            Reverse entry
                          </Button>
                        )}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2>Choose a member</h2>
                <p>
                  Select someone from the directory, or scan their card to open
                  their balance and credentials.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      {tab === "activities" && (
        <div className="rewards-split">
          <section>
            <h2>Point rules</h2>
            <p>
              Rules set the points for new activities. Existing activities keep
              the value they were created with.
            </p>
            <RewardForm
              key={editRule?.id || "new-rule"}
              busy={busy}
              onChange={() => setDirty(true)}
              onSubmit={(e) =>
                submit(e, "rule", (f) => ({
                  ...(editRule
                    ? { id: editRule.id, revision: editRule.revision }
                    : {}),
                  title: String(f.get("title")),
                  points: Number(f.get("points")),
                  active: editRule?.is_active ?? true,
                }))
              }
            >
              <Field label="Rule name">
                <input
                  name="title"
                  defaultValue={editRule?.title}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Points">
                <input
                  name="points"
                  defaultValue={editRule?.points}
                  type="number"
                  min={1}
                  max={10000}
                  required
                />
              </Field>
              <Button disabled={busy}>
                {editRule ? "Save rule" : "Add rule"}
              </Button>
              {editRule && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditRule(undefined)}
                >
                  Cancel rule edit
                </Button>
              )}
            </RewardForm>
            <ul className="gt-file-list">
              {data?.rules.map((r) => (
                <li key={r.id}>
                  <span>
                    {r.title} · {r.points} points
                    {!r.is_active ? " · Inactive" : ""}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setEditRule(r)}
                  >
                    Edit rule
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void mutate("rule", {
                        id: r.id,
                        revision: r.revision,
                        title: r.title,
                        points: r.points,
                        active: !r.is_active,
                      })
                    }
                  >
                    {r.is_active ? "Disable" : "Enable"}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Check-in activities</h2>
            <RewardForm
              busy={busy}
              onChange={() => setDirty(true)}
              onSubmit={(e) =>
                submit(e, "activity", (f) => ({
                  title: String(f.get("title")),
                  ruleId: String(f.get("rule")),
                  opensAt: new Date(String(f.get("open"))).toISOString(),
                  closesAt: new Date(String(f.get("close"))).toISOString(),
                }))
              }
            >
              <Field label="Activity title">
                <input name="title" minLength={2} maxLength={160} required />
              </Field>
              <Field label="Point rule">
                <select name="rule" required defaultValue="">
                  <option value="" disabled>
                    Choose a rule
                  </option>
                  {data?.rules
                    .filter((r) => r.is_active)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} · {r.points} points
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Opens at">
                <input name="open" type="datetime-local" required />
              </Field>
              <Field
                label="Closes at"
                hint="Use your local time. Maximum check-in window: 31 days."
              >
                <input name="close" type="datetime-local" required />
              </Field>
              <Button disabled={busy}>Create activity</Button>
            </RewardForm>
            <ul className="gt-file-list">
              {data?.activities.map((a) => (
                <li key={a.id}>
                  <span>
                    {a.title} · {a.points} points
                    <small>
                      {new Date(a.opens_at).toLocaleString()} –{" "}
                      {new Date(a.closes_at).toLocaleString()}
                    </small>
                  </span>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void mutate("activity", {
                        id: a.id,
                        revision: a.revision,
                        active: false,
                      })
                    }
                  >
                    Close activity
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
      {tab === "perks" && (
        <div className="rewards-split">
          <section>
            <h2>{editPerk ? "Edit perk" : "Chapter perks"}</h2>
            <p>
              Perks use a points threshold. Requesting a perk does not spend
              points. Publish only when the chapter can offer it.
            </p>
            <RewardForm
              busy={busy}
              key={editPerk?.id || "new"}
              onChange={() => setDirty(true)}
              onSubmit={(e) =>
                submit(e, "perk", (f) => ({
                  ...(editPerk
                    ? { id: editPerk.id, revision: editPerk.revision }
                    : {}),
                  title: String(f.get("title")),
                  description: String(f.get("description")),
                  threshold: Number(f.get("threshold")),
                  inventory:
                    f.get("inventory") === ""
                      ? null
                      : Number(f.get("inventory")),
                  active: f.get("active") === "on",
                }))
              }
            >
              <Field label="Perk title">
                <input
                  name="title"
                  defaultValue={editPerk?.title}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
              <Field label="Details and conditions">
                <textarea
                  name="description"
                  defaultValue={editPerk?.description}
                  minLength={2}
                  maxLength={2000}
                  required
                />
              </Field>
              <Field label="Points required">
                <input
                  name="threshold"
                  type="number"
                  min={0}
                  max={1000000}
                  defaultValue={editPerk?.threshold}
                  required
                />
              </Field>
              <Field
                label="Available places"
                hint="Leave blank for no inventory limit. Pending and approved requests reserve a place."
              >
                <input
                  name="inventory"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={editPerk?.inventory ?? ""}
                />
              </Field>
              <label className="rewards-checkbox">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editPerk?.is_active}
                />
                Publish this perk
              </label>
              <Button disabled={busy}>Save perk</Button>
              {editPerk && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setEditPerk(undefined)}
                >
                  New perk
                </Button>
              )}
            </RewardForm>
            <ul className="gt-file-list">
              {data?.perks.map((p) => (
                <li key={p.id}>
                  <span>
                    {p.title} · {p.threshold} points ·{" "}
                    {p.is_active ? "Published" : "Draft"}
                  </span>
                  <Button variant="ghost" onClick={() => setEditPerk(p)}>
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Perk requests</h2>
            <p>
              Review eligibility and availability before approval. Travel
              consideration does not guarantee funding or selection.
            </p>
            {data?.claims.length === 0 && <p>No requests to review.</p>}
            <ul className="gt-file-list">
              {data?.claims.map((c) => (
                <li key={c.id}>
                  <span>
                    {c.name} · {c.title}
                    <small>{c.status}</small>
                  </span>
                  <div className="rewards-actions">
                    {(c.status === "pending"
                      ? ["approved", "rejected"]
                      : ["fulfilled", "rejected"]
                    ).map((status) => (
                      <Button
                        key={status}
                        disabled={busy}
                        variant="secondary"
                        onClick={() =>
                          setReview({
                            action: "claim_status",
                            document: {
                              id: c.id,
                              revision: c.revision,
                              status,
                            },
                            label: `Mark ${c.name}'s request for ${c.title} as ${status}.`,
                            key: crypto.randomUUID(),
                          })
                        }
                      >
                        {status === "approved"
                          ? "Approve"
                          : status === "rejected"
                            ? "Decline"
                            : "Mark fulfilled"}
                      </Button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
